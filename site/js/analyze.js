/* Chess Lab Open — Analyze my games.
   Fetches your recent rapid + classical games from the Lichess or Chess.com public API,
   entirely in your browser. Lichess games reuse Lichess's server analysis where present
   (CC0); anything without stored evals is analyzed by Stockfish in your browser.
   Chess.com has no stored evals, so its window is capped (last 25 rapid games) and the
   UI says so. Output: a lite report card and drills from your own mistakes. */
'use strict';
(function(){
const CAP_CHESSCOM=25, CAP_LICHESS=60, ENGINE_DEPTH=11, MAX_ENGINE_GAMES=25;
const MATE=9900;
let running=false;

function note(t){ $('a-note').textContent=t }
function prog(frac,show=true){ const p=$('a-prog'); p.hidden=!show; p.querySelector('i').style.width=Math.round(frac*100)+'%' }

/* ---------- Fetching ---------- */
async function fetchLichess(user,blitz){
  const url=`https://lichess.org/api/games/user/${encodeURIComponent(user)}?max=${CAP_LICHESS}&perfType=${blitz?'blitz,':''}rapid,classical&rated=true&moves=true&evals=true`;
  const r=await fetch(url,{headers:{Accept:'application/x-ndjson'}});
  if(r.status===404) throw new Error('No such Lichess user.');
  if(!r.ok) throw new Error('Lichess answered '+r.status+'.');
  const text=await r.text();
  const games=[];
  for(const line of text.split('\n')){ if(!line.trim()) continue; try{ games.push(JSON.parse(line)) }catch(e){} }
  return games.map(j=>{
    const white=j.players.white.user?j.players.white.user.name:'Anonymous';
    const black=j.players.black.user?j.players.black.user.name:'Anonymous';
    const color=white.toLowerCase()===user.toLowerCase()?'w':'b';
    return {site:'lichess',id:j.id,date:new Date(j.createdAt).toISOString().slice(0,10),
      white,black,wr:j.players.white.rating,br:j.players.black.rating,color,
      result:j.winner?(j.winner==='white'?'1-0':'0-1'):'1/2-1/2',
      moves:(j.moves||'').split(' ').filter(Boolean),
      analysis:j.analysis||null,speed:j.speed,
      url:'https://lichess.org/'+j.id};
  }).filter(g=>g.moves.length>=10);
}
async function fetchChesscom(user,blitz){
  const base=`https://api.chess.com/pub/player/${encodeURIComponent(user.toLowerCase())}`;
  const ar=await fetch(base+'/games/archives');
  if(ar.status===404) throw new Error('No such Chess.com user.');
  if(!ar.ok) throw new Error('Chess.com answered '+ar.status+'.');
  const archives=(await ar.json()).archives||[];
  const games=[];
  for(const u of archives.slice(-6).reverse()){
    const r=await fetch(u); if(!r.ok) continue;
    for(const j of ((await r.json()).games||[]).reverse()){
      if(j.rules!=='chess'||!(j.time_class==='rapid'||blitz&&j.time_class==='blitz')) continue;
      if(j.time_class==='daily') continue; /* rapid only: chess.com has no classical pool */
      const color=j.white.username.toLowerCase()===user.toLowerCase()?'w':'b';
      const g=new Chess();
      const body=(j.pgn||'').replace(/\{[^}]*\}/g,' ').replace(/\[[^\]]*\]\s*/g,'').replace(/\d+\.\.\./g,'');
      const toks=body.match(/[^\s]+/g)||[]; const moves=[];
      for(const t of toks){ if(/^(1-0|0-1|1\/2-1\/2|\*)$/.test(t)) continue; const san=t.replace(/^\d+\.+/,''); if(!san) continue;
        const m=g.move(san,{sloppy:true}); if(!m) break; moves.push(m.san) }
      if(moves.length<10) continue;
      games.push({site:'chesscom',id:j.url,date:new Date(j.end_time*1000).toISOString().slice(0,10),
        white:j.white.username,black:j.black.username,wr:j.white.rating,br:j.black.rating,color,
        result:j.white.result==='win'?'1-0':j.black.result==='win'?'0-1':'1/2-1/2',
        moves,analysis:null,speed:j.time_class,url:j.url});
      if(games.length>=CAP_CHESSCOM) break;
    }
    if(games.length>=CAP_CHESSCOM) break;
  }
  return games;
}

/* ---------- Evals ---------- */
/* evs[i] = eval in pawns (White's side) after ply i+1. Lichess server analysis first, Stockfish fills. */
async function evalsFor(game,budget,onStep){
  if(game.analysis){
    return game.analysis.map(a=>a.mate!=null?(a.mate>0?MATE/100:-MATE/100):(a.eval||0)/100);
  }
  if(budget.games<=0) return null;
  budget.games--;
  const g=new Chess(); const evs=[];
  for(let i=0;i<game.moves.length;i++){
    if(!g.move(game.moves[i])) break;
    if(g.in_checkmate()){ evs.push(g.turn()==='w'?-MATE/100:MATE/100); break }
    const a=await SharedEngine.analyse(g.fen(),ENGINE_DEPTH,1,9000).catch(()=>null);
    if(!a||!a.length){ evs.push(evs.length?evs[evs.length-1]:0) }
    else{ const cp=a[0].mate!=null?(a[0].mate>0?MATE/100:-MATE/100):a[0].cp; evs.push(g.turn()==='w'?cp:-cp) }
    onStep&&onStep(i/game.moves.length);
  }
  return evs;
}
/* Marks for the user's moves: winning-chance drops (White-side evals, kit thresholds 0.1/0.2/0.3 on the -1..1 scale). */
function markGame(game,evs){
  const sign=game.color==='w'?1:-1;
  const out={inacc:0,mist:0,blun:0,drops:[],conv:null,save:null,punish:[]};
  let prev=0.2; /* a shade for White at the start */
  let reachedWin=false,reachedLoss=false;
  const g=new Chess(); const fens=[g.fen()];
  for(const san of game.moves){ if(!g.move(san)) break; fens.push(g.fen()) }
  const n=Math.min(evs.length,game.moves.length);
  for(let i=0;i<n;i++){
    const moverIsMe=(i%2===0?'w':'b')===game.color;
    const cur=evs[i];
    if(prev*sign>=2) reachedWin=true;
    if(prev*sign<=-2) reachedLoss=true;
    /* Punish the mistake (the private kit's rule): an opponent move that cost them >= 0.2 winning chances
       and >= 0.7 pawns, with the position before it under +5 for you; then your reply: punished (< 0.1 lost),
       partly (0.1-0.2) or missed (>= 0.2). */
    if(!moverIsMe&&i+1<n&&prev*sign<5){
      const oppDrop=(wc(prev)-wc(cur))*sign*-1, pawns=(prev-cur)*sign*-1;
      if(oppDrop>=0.2&&pawns>=0.7){
        const replyDrop=(wc(cur)-wc(evs[i+1]))*sign;
        const verdict=replyDrop<0.1?'punished':replyDrop<0.2?'partly':'missed';
        out.punish.push({ply:i+1,fen:fens[i+1],san:game.moves[i+1],opp:game.moves[i],oppDrop:+oppDrop.toFixed(2),
          drop:+Math.max(0,replyDrop).toFixed(2),before:cur,after:evs[i+1],verdict,
          best:game.analysis&&game.analysis[i+1]&&game.analysis[i+1].best||null});
      }
    }
    if(moverIsMe){
      const drop=(wc(prev)-wc(cur))*sign;
      if(drop>=0.1){
        const kind=drop>=0.3?'blun':drop>=0.2?'mist':'inacc'; out[kind]++;
        if(kind!=='inacc') out.drops.push({ply:i,fen:fens[i],san:game.moves[i],drop:+drop.toFixed(2),before:prev,after:cur,
          best:game.analysis&&game.analysis[i]&&game.analysis[i].best||null});
      }
    }
    prev=cur;
  }
  const myScore=game.result==='1/2-1/2'?0.5:(game.result==='1-0')===(game.color==='w')?1:0;
  if(reachedWin) out.conv=myScore===1;
  if(reachedLoss) out.save=myScore>=0.5;
  out.score=myScore; out.fens=fens;
  return out;
}

/* ---------- The run ---------- */
async function run(site,user,blitz){
  blitz=blitz==null?!!($('a-blitz')&&$('a-blitz').checked):blitz;
  if(running) return; running=true;
  $('a-go').disabled=true; $('a-report').innerHTML=''; prog(0);
  try{
    note('Fetching games…');
    const games=site==='lichess'?await fetchLichess(user,blitz):await fetchChesscom(user,blitz); LAST={games};
    if(!games.length) throw new Error(`No recent ${blitz?'blitz, ':''}rapid or classical games found.`);
    const needEngine=games.filter(g=>!g.analysis).length;
    note(`${games.length} games.${needEngine?` ${Math.min(needEngine,MAX_ENGINE_GAMES)} without stored evals — analyzing with Stockfish in your browser (depth ${ENGINE_DEPTH}), this takes a while…`:''}`);
    const budget={games:MAX_ENGINE_GAMES};
    const rows=[];
    for(let i=0;i<games.length;i++){
      const game=games[i];
      const evs=await evalsFor(game,budget,f=>prog((i+f)/games.length));
      prog((i+1)/games.length);
      if(!evs||evs.length<6) continue;
      rows.push({game,marks:Object.assign(markGame(game,evs),{phase:phaseAccuracy(game,evs)})});
      renderReport(user,site,rows,games.length,false);
    }
    renderReport(user,site,rows,games.length,true);
    note('Done.');
  }catch(e){ note(String(e.message||e)) }
  prog(0,false); $('a-go').disabled=false; running=false;
}

/* ---------- Phases and accuracy ----------
   Phases as Lichess divides a game: the middlegame starts when 10 or fewer major and minor pieces are left, or a back
   rank is sparse (fewer than 4 of a side's own pieces on it); the endgame when 6 or fewer major and minor pieces are left.
   Accuracy per move is Lichess's: 103.1668 × e^(−0.04354 × drop in win %) − 3.1669, the win % from your side. */
function phaseOf(g){ let mm=0, wb=0, bb=0; for(const [r,row] of g.board().entries()) for(const p of row){ if(!p) continue; if(p.type!=='k'&&p.type!=='p') mm++; if(r===7&&p.color==='w') wb++; if(r===0&&p.color==='b') bb++ }
  return mm<=6?'endgame':(mm<=10||wb<4||bb<4)?'middlegame':'opening' }
function phaseAccuracy(game,evs){
  const out={opening:[],middlegame:[],endgame:[]}, g=new Chess(); let prev=0.2, phase='opening';
  const winPct=(ev,mover)=>50+50*wc((mover==='w'?1:-1)*ev);
  for(let i=0;i<game.moves.length&&i<evs.length;i++){ const mover=g.turn(); const before=prev; const m=g.move(game.moves[i],{sloppy:true}); if(!m) break;
    const cur=evs[i]==null?before:evs[i]; prev=cur; if(phase!=='endgame'){ const p=phaseOf(g); if(p==='endgame'||phase==='opening') phase=p }
    if(mover!==game.color) continue;
    const drop=Math.max(0,winPct(before,mover)-winPct(cur,mover)); out[phase].push(Math.max(0,Math.min(100,103.1668*Math.exp(-0.04354*drop)-3.1669))) }
  return out }
let LAST=null;
function renderReport(user,site,rows,total,final){
  if(!rows.length){ $('a-report').innerHTML='<p class="empty">No analyzable games yet…</p>'; return }
  const W=rows.filter(r=>r.marks.score===1).length, D=rows.filter(r=>r.marks.score===0.5).length, L=rows.length-W-D;
  const blun=rows.reduce((a,r)=>a+r.marks.blun,0), mist=rows.reduce((a,r)=>a+r.marks.mist,0), inacc=rows.reduce((a,r)=>a+r.marks.inacc,0);
  const convs=rows.filter(r=>r.marks.conv!=null), saves=rows.filter(r=>r.marks.save!=null);
  const conv=convs.length?Math.round(100*convs.filter(r=>r.marks.conv).length/convs.length):null;
  const save=saves.length?Math.round(100*saves.filter(r=>r.marks.save).length/saves.length):null;
  /* openings */
  const ops=new Map();
  for(const r of rows){ const nm=Book.nameOf(r.marks.fens.slice(0,21)); const key=nm?nm[1].split(':')[0]:'Other';
    const o=ops.get(key)||{n:0,s:0,blun:0,mist:0,inacc:0}; o.n++; o.s+=r.marks.score; o.blun+=r.marks.blun; o.mist+=r.marks.mist; o.inacc+=r.marks.inacc; ops.set(key,o) }
  const opRows=[...ops.entries()].sort((a,b)=>b[1].n-a[1].n).slice(0,10);
  const opBy=c=>{ const m=new Map(); for(const r of rows.filter(r=>r.game.color===c)){ const nm=Book.nameOf(r.marks.fens.slice(0,21)); const key=nm?nm[1].split(':')[0]:'Other';
      const o=m.get(key)||{n:0,s:0,blun:0,mist:0,inacc:0}; o.n++; o.s+=r.marks.score; o.blun+=r.marks.blun; o.mist+=r.marks.mist; o.inacc+=r.marks.inacc; m.set(key,o) } return [...m.entries()].sort((a,b)=>b[1].n-a[1].n).slice(0,10) };
  /* no engine needed: from every game fetched */
  const all=(LAST&&LAST.games)||rows.map(r=>r.game), sc=g=>g.result==='1/2-1/2'?0.5:(g.result==='1-0')===(g.color==='w')?1:0;
  const byCol=['w','b'].map(c=>{ const gs=all.filter(g=>g.color===c); return [c,gs.length,gs.reduce((a,g)=>a+sc(g),0)] });
  const band=r=>r==null?null:r<1200?'under 1200':r>=2200?'2200+':`${Math.floor(r/200)*200}–${Math.floor(r/200)*200+199}`;
  const bands=new Map(); for(const g of all){ const b=band(g.color==='w'?g.br:g.wr); if(!b) continue; const o=bands.get(b)||{n:0,s:0}; o.n++; o.s+=sc(g); bands.set(b,o) }
  const bandRows=[...bands.entries()].sort((a,b)=>(parseInt(a[0])||0)-(parseInt(b[0])||0)||(a[0]<b[0]?-1:1));
  const ph={opening:[],middlegame:[],endgame:[]}; for(const r of rows) if(r.marks.phase) for(const k in ph) ph[k].push(...r.marks.phase[k]);
  const avg=a=>a.length?Math.round(a.reduce((x,y)=>x+y,0)/a.length):null;
  const opTable=list=>`<table style="margin-top:6px"><tr><th>Opening</th><th>Games</th><th>Score</th><th>Blunders / mistakes / inaccuracies per game</th></tr>${list.map(([k,o])=>`<tr><td>${esc(k)}</td><td>${o.n}</td><td>${Math.round(100*o.s/o.n)}%</td><td>${(o.blun/o.n).toFixed(1)} / ${(o.mist/o.n).toFixed(1)} / ${(o.inacc/o.n).toFixed(1)}</td></tr>`).join('')||'<tr><td colspan="4" class="note">No games with this colour.</td></tr>'}</table>`;
  const mistakes=rows.flatMap(r=>r.marks.drops.map(d=>({...d,game:r.game}))).sort((a,b)=>b.drop-a.drop);
  const pun=rows.flatMap(r=>r.marks.punish.map(d=>({...d,game:r.game})));
  const toPunish=pun.filter(p=>p.verdict!=='punished').sort((a,b)=>b.drop-a.drop);
  $('a-report').innerHTML=`
  <div class="stats">
    <div class="stat"><b>${rows.length}</b><span class="note">games analyzed${final?'':' of '+total+'…'}</span></div>
    <div class="stat"><b>${W}–${D}–${L}</b><span class="note">your wins / draws / losses${Help.q('Results of the games analyzed here, from your side.')}</span></div>
    <div class="stat"><b>${blun} / ${mist} / ${inacc}</b><span class="note">your blunders / mistakes / inaccuracies${Help.q("Each of your moves is judged by how much it dropped your winning chances: 30 points or more is a blunder, 20 a mistake, 10 an inaccuracy (Lichess's scale).")}</span></div>
    <div class="stat"><b>${(blun/rows.length).toFixed(1)} / ${(mist/rows.length).toFixed(1)} / ${(inacc/rows.length).toFixed(1)}</b><span class="note">per game${Help.q('The same three counts divided by the number of games analyzed.')}</span></div>
    <div class="stat"><b>${conv==null?'—':conv+'%'}</b><span class="note">won from +2 (${convs.length} games)${Help.q('Of the games where you were 2 pawns or more ahead (by the engine), the share you went on to win.')}</span></div>
    <div class="stat"><b>${save==null?'—':save+'%'}</b><span class="note">saved from −2 (${saves.length} games)${Help.q('Of the games where you were 2 pawns or more behind, the share you drew or won.')}</span></div>
    <div class="stat"><b>${pun.length?pun.length-toPunish.length+' / '+pun.length:'—'}</b><span class="note">opponents’ mistakes you punished${Help.q("Your opponents' moves that cost them 20 points or more of winning chances, and how many of them you made pay for (your next move kept most of the gain).")}</span></div>
  </div>
  <div class="repgrid">
    <div class="card"><span class="label">Results by colour and by opponent rating${Help.q('Every game fetched counts here, analyzed or not: results need no engine. Score = your points as a share of the games.')}</span>
      <p class="note">From all ${all.length} fetched games.</p>
      <table style="margin-top:6px"><tr><th>You had</th><th>Games</th><th>Score</th></tr>${byCol.map(([c,n,s])=>`<tr><td>${c==='w'?'White':'Black'}</td><td>${n}</td><td>${n?Math.round(100*s/n)+'%':'—'}</td></tr>`).join('')}</table>
      <table style="margin-top:10px"><tr><th>Opponent rated</th><th>Games</th><th>Score</th></tr>${bandRows.map(([b,o])=>`<tr><td>${esc(b)}</td><td>${o.n}</td><td>${Math.round(100*o.s/o.n)}%</td></tr>`).join('')}</table></div>
    <div class="card"><span class="label">Accuracy by phase${Help.q('Lichess’s accuracy for each of your moves (100 = no winning chances lost), averaged per phase. Phases as Lichess divides a game: the middlegame starts when 10 or fewer major and minor pieces are left or a back rank is sparse; the endgame when 6 or fewer are left.')}</span>
      <p class="note">From the ${rows.length} analyzed games (engine evals needed).</p>
      <table style="margin-top:6px"><tr><th>Phase</th><th>Your moves</th><th>Accuracy</th></tr>${['opening','middlegame','endgame'].map(k=>`<tr><td>${k[0].toUpperCase()+k.slice(1)}</td><td>${ph[k].length}</td><td>${avg(ph[k])==null?'—':avg(ph[k])+'%'}</td></tr>`).join('')}</table></div>
    <div class="card"><span class="label">Openings in these games</span>
      <div class="seg mseg" role="group" style="margin-top:6px"><button type="button" data-optab="w" aria-pressed="true">As White</button><button type="button" data-optab="b" aria-pressed="false">As Black</button></div>
      <div data-oppane="w">${opTable(opBy('w'))}</div><div data-oppane="b" hidden>${opTable(opBy('b'))}</div></div>
    <div class="card" hidden><span class="label">Openings (all)</span>
      <table style="margin-top:6px"><tr><th>Opening</th><th>Games</th><th>Score${Help.q('Your points as a share of the games: a win is 1, a draw ½.')}</th><th>Blunders / mistakes / inaccuracies per game${Help.q("Your own errors in that opening's games, divided by its games.")}</th></tr>
      ${opRows.map(([k,o])=>`<tr><td>${esc(k)}</td><td>${o.n}</td><td>${Math.round(100*o.s/o.n)}%</td><td>${(o.blun/o.n).toFixed(1)} / ${(o.mist/o.n).toFixed(1)} / ${(o.inacc/o.n).toFixed(1)}</td></tr>`).join('')}</table></div>
    <div class="card"><span class="label">Your costliest moments (${mistakes.length})${Help.q('Your moves that dropped your own winning chances the most. −34% means your chances fell by 34 points with that move (from your side).')}</span>
      <div style="margin-top:6px">${mistakes.slice(0,10).map(m=>`<div class="gamerow"><span class="src">${esc(m.game.date)}</span>
        <span>${esc(m.san)} <span class="note">vs ${esc(m.game.color==='w'?m.game.black:m.game.white)}</span></span>
        <span class="pill ${m.drop>=0.3?'bad':'warn'}">−${Math.round(m.drop*100)}%</span>
        <a class="note" href="${esc(m.game.url)}" target="_blank" rel="noopener">game ↗</a></div>`).join('')||'<p class="note">None found. Clean play!</p>'}</div>
      ${final&&(mistakes.length||toPunish.length)?`<div class="btns" style="margin-top:10px"><button class="btn primary" id="a-savedrills">Save ${Math.min(mistakes.length,40)+Math.min(toPunish.length,20)} drills</button></div>
        <p class="note">Your ${Math.min(mistakes.length,40)} costliest moves, plus ${Math.min(toPunish.length,20)} “Punish the mistake” positions where your opponent erred and you didn’t make them pay.</p>`:''}
    </div>
  </div>`;
  const sd=$('a-savedrills');
  if(sd) sd.addEventListener('click',async()=>{
    sd.disabled=true; sd.textContent='Saving…';
    const drills=Store.get('adrills')||[];
    for(const m of mistakes.slice(0,40)){
      const uci=uciOf(m.fen,m.san); if(!uci) continue;
      const id=await drillId('a',m.fen,uci);
      if(drills.some(d=>d.id===id)) continue;
      drills.push({id,fen:m.fen,played:m.san,playedUci:uci,best:m.best,drop:m.drop,before:m.before,
        date:m.game.date,opp:m.game.color==='w'?m.game.black:m.game.white,site:m.game.site,url:m.game.url,color:m.game.color});
    }
    for(const m of toPunish.slice(0,20)){
      const uci=uciOf(m.fen,m.san); if(!uci) continue;
      const id=await drillId('p',m.fen,uci);
      if(drills.some(d=>d.id===id)) continue;
      drills.push({id,kind:'punish',fen:m.fen,played:m.san,playedUci:uci,best:m.best,drop:m.drop,before:m.before,oppMove:m.opp,oppDrop:m.oppDrop,verdict:m.verdict,
        date:m.game.date,opp:m.game.color==='w'?m.game.black:m.game.white,site:m.game.site,url:m.game.url,color:m.game.color});
    }
    Store.put('adrills',drills);
    sd.textContent='Saved — see the Drills tab.';
    if(window.DrillsTab) DrillsTab.refresh();
  });
}
function uciOf(fen,san){ const g=new Chess(fen); const m=g.move(san,{sloppy:true}); return m?m.from+m.to+(m.promotion||''):null }

function init(){
  $('a-capnote').textContent=String(CAP_CHESSCOM);
  $('a-go').addEventListener('click',()=>{ const u=$('a-user').value.trim(); if(!u){ note('Type a username.'); return }
    run($('a-site').value,u) });
  $('a-demo').addEventListener('click',()=>{ $('a-site').value='chesscom'; $('a-user').value='CoachSuhaas'; run('chesscom','CoachSuhaas') });
  $('a-user').addEventListener('keydown',e=>{ if(e.key==='Enter') $('a-go').click() });
  $('a-report').addEventListener('click',e=>{ const b=e.target.closest('[data-optab]'); if(!b) return; const c=b.dataset.optab;
    $('a-report').querySelectorAll('[data-optab]').forEach(x=>x.setAttribute('aria-pressed',String(x===b))); $('a-report').querySelectorAll('[data-oppane]').forEach(x=>{ x.hidden=x.dataset.oppane!==c }) });
}
window.AnalyzeTab={init,phaseAccuracy,phaseOf,run,markGame,fetchLichess,fetchChesscom,evalsFor,get running(){return running}};
})();
