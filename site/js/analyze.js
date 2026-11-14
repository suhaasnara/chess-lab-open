/* Chess Lab Open — Analyze my games.
   Fetches your recent rapid + classical games from the Lichess or Chess.com public API, or reads your own PGN files,
   entirely in your browser. Lichess games reuse Lichess's server analysis where present (CC0); anything without stored
   evals is analyzed by Stockfish in your browser (Standard or Deep). Output: a report card (js/astats.js draws its
   stats and charts) and drills from your own mistakes, saved in sets you can remove again.
   v2 (14 Nov 2026): several PGN files at once (drag-and-drop, a Lichess study link), each with its rating system;
   Standard / Deep analysis with time estimates measured on this device; Save drills near the top; saved sets.
   13 Nov 2026: Blunder check from your own games (findBlunderChecks, after the analysis: the kit's tools/blundercheck
   rule, in the browser); the games are kept (js/agames.js) so drills, blunder checks and costly moments open their game
   (#game, js/gameview.js), and the last report comes back after a reload (restore). */
'use strict';
(function(){
const CAP_CHESSCOM=25, CAP_LICHESS=60, MAX_ENGINE_GAMES=25;
/* Standard = what Analyze always used. Deep: the same Stockfish 18 lite (NNUE) build searched deeper. The full NNUE
   build is 113 MB (more than GitHub Pages serves) and threads need headers Pages can't send, so depth is the lever:
   measured on 160 positions against a depth-22 reference (HANDOFF / PARITY, 14 Nov 2026). */
const DEPTH={standard:11,deep:16};
const MATE=9900;
let running=false;

function note(t,busy){ const n=$('a-note'); n.textContent=t; n.classList.toggle('busy',!!busy) }   /* busy: a spinner, so a long step never looks frozen */
function prog(frac,show=true){ const p=$('a-prog'); p.hidden=!show; p.querySelector('i').style.width=Math.round(frac*100)+'%' }
const mode=()=>Store.get('a-mode')==='deep'?'deep':'standard';

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
    return {site:'lichess',sys:'lichess',id:j.id,date:new Date(j.createdAt).toISOString().slice(0,10),
      white,black,wr:j.players.white.rating,br:j.players.black.rating,color,ts:j.createdAt,
      wd:j.players.white.ratingDiff,bd:j.players.black.ratingDiff,
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
      games.push({site:'chesscom',sys:'chesscom',id:j.url,date:new Date(j.end_time*1000).toISOString().slice(0,10),
        white:j.white.username,black:j.black.username,wr:j.white.rating,br:j.black.rating,color,ts:j.end_time*1000,
        result:j.white.result==='win'?'1-0':j.black.result==='win'?'0-1':'1/2-1/2',
        moves,analysis:null,speed:j.time_class,url:j.url});
      if(games.length>=CAP_CHESSCOM) break;
    }
    if(games.length>=CAP_CHESSCOM) break;
  }
  return games;
}

/* ---------- Evals ---------- */
/* evs[i] = eval in pawns (White's side) after ply i+1. Lichess server analysis first, then evals in the file, then
   Stockfish. Stockfish's evals are kept in this browser (pgn-evals, by game id), so a stopped or reloaded run picks up
   where it left off. An entry is a list (Standard, the shape since 12 Nov) or {m:'standard'|'deep', e:[…], f:'0110…'}: a
   Deep run redoes Standard entries and replaces them; a Standard run happily reuses Deep ones.
   game.ef (14 Nov 2026, audit item 2): for each ply, whether the move played was the engine's first choice there (the
   search of the position before it). Comparing only the evals of two consecutive positions called a best move a
   mistake when the two searches disagreed (6.Qa4+, the only good move by two pawns, read 82% -> 69%): markGame counts
   no drop on such a move. Kept with the evals (f) and with the game (agames field ef). */
const EVKEY='pgn-evals', EVMAX=3000;
const evCache={ raw(id){ const c=Store.get(EVKEY)||{}; return c[id]||null },
  get(id,m){ const e=this.raw(id); if(!e) return null; if(Array.isArray(e)) return m==='deep'?null:{m:'standard',e};
    if(m==='deep'&&e.m!=='deep') return null; return e.e&&e.e.length?e:null },
  /* f (14 Nov 2026): one character per ply, '1' where the move played was Stockfish's first choice in that position */
  put(id,evs,m,f){ const c=Store.get(EVKEY)||{}; const r=evs.map(v=>Math.round(v*100)/100); c[id]=f?{m:m==='deep'?'deep':'standard',e:r,f}:m==='deep'?{m:'deep',e:r}:r;
    const ks=Object.keys(c); if(ks.length>EVMAX) for(const k of ks.slice(0,ks.length-EVMAX)) delete c[k]; Store.put(EVKEY,c) } };
let stopReq=false;
/* where a game's evals come from: 'lichess' (server analysis), 'file' (evals in the PGN), 'standard' / 'deep' (here) */
async function evalsFor(game,budget,onStep){
  if(game.analysis){ game.evsrc=game.site==='lichess'?'lichess':'file';
    return game.analysis.map(a=>a.mate!=null?(a.mate>0?MATE/100:-MATE/100):(a.eval||0)/100);
  }
  const m=budget.mode||'standard', depth=DEPTH[m];
  const cached=budget.cache?evCache.get(game.id,m):null; if(cached){ game.evsrc=cached.m; if(cached.f) game.ef=cached.f; return cached.e }
  if(budget.games<=0) return null;
  budget.games--;
  const g=new Chess(); const evs=[]; let ef='', first=null;   /* first: the engine's choice in the position on the board */
  for(let i=0;i<game.moves.length;i++){
    if(stopReq) return null;
    const mv=g.move(game.moves[i]); if(!mv) break;
    ef+=first&&first.slice(0,4)===mv.from+mv.to&&(first[4]||'')===(mv.promotion||'')?'1':'0'; first=null;
    if(g.in_checkmate()){ evs.push(g.turn()==='w'?-MATE/100:MATE/100); break }
    const a=await SharedEngine.analyse(g.fen(),depth,1,m==='deep'?30000:9000).catch(()=>null);
    if(!a||!a.length){ evs.push(evs.length?evs[evs.length-1]:0) }
    else{ const cp=a[0].mate!=null?(a[0].mate>0?MATE/100:-MATE/100):a[0].cp; evs.push(g.turn()==='w'?cp:-cp); first=a[0].uci||null }
    onStep&&onStep(i/game.moves.length);
  }
  if(budget.cache) evCache.put(game.id,evs,m,ef);
  game.evsrc=m; game.ef=ef;
  return evs;
}
/* Marks for the user's moves: winning-chance drops (White-side evals, kit thresholds 0.1/0.2/0.3 on the -1..1 scale).
   Also every move of yours with its Win% lost (moves[]), for Move quality. */
function markGame(game,evs){
  const sign=game.color==='w'?1:-1;
  const out={inacc:0,mist:0,blun:0,drops:[],conv:null,save:null,punish:[],moves:[],bcand:[]};
  let prev=0.2; /* a shade for White at the start */
  let reachedWin=false,reachedLoss=false;
  const g=new Chess(); const fens=[g.fen()];
  for(const san of game.moves){ if(!g.move(san)) break; fens.push(g.fen()) }
  const n=Math.min(evs.length,game.moves.length);
  const top=i=>!!game.ef&&game.ef[i]==='1';   /* the move played at ply i was the engine's first choice: no drop is counted on it */
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
        const replyDrop=top(i+1)?0:(wc(cur)-wc(evs[i+1]))*sign;
        const verdict=replyDrop<0.1?'punished':replyDrop<0.2?'partly':'missed';
        out.punish.push({ply:i+1,fen:fens[i+1],san:game.moves[i+1],opp:game.moves[i],oppDrop:+oppDrop.toFixed(2),
          drop:+Math.max(0,replyDrop).toFixed(2),before:cur,after:evs[i+1],verdict,
          best:game.analysis&&game.analysis[i+1]&&game.analysis[i+1].best||null});
      }
    }
    if(moverIsMe){
      const drop=top(i)?0:(wc(prev)-wc(cur))*sign;
      out.moves.push({ply:i,winLost:Math.max(0,50*drop),before:prev*sign,after:cur*sign});
      /* a Blunder check candidate (the kit's tools/blundercheck rule): your Win% fell 15+ points from 30% or more */
      const w0=WinPct.pct(prev*sign), w1=WinPct.pct(cur*sign);
      if(!top(i)&&w0>=30&&w0-w1>=15&&fens[i]&&fens[i+1]){ const c=bcCand(fens[i],game.moves[i]);
        if(c) out.bcand.push({ply:i,fen:fens[i],san:game.moves[i],uci:c.uci,nul:c.nul,w0,w1,after:fens[i+1],reply:game.moves[i+1]||''}) }
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

/* ---------- Blunder check (13 Nov 2026: from your own games, in the browser) ----------
   The private kit's tools/blundercheck rule, which built the Chess Lab packs' Blunder check: one of your moves that
   dropped your Win% by 15+ points from 30%+, with 6+ pieces on the board, you not in check and the "null move" legal
   (the same position with your opponent to move). Two searches per position at the run's depth, 3 lines each: the null
   position (their best = the threat, kept when it gains them 1+ pawn over the position's eval; any reply within 0.5 of
   it counts) and the real position (your answers: within 0.3 pawns of the best). At most BCMAX a run, costliest first.
   The searches are kept (bc-evals, by position and move, with their depth), so a rerun or a restored report redoes
   nothing. Ids: 'k' + sha1(fen|played uci)[:8], the kit's, so a pack's positions are the same positions. */
const BCMAX=40, BCKEY='bc-evals', BCCACHE=600;
function bcCand(fen,san){
  if(fen.split(' ')[0].replace(/[^a-zA-Z]/g,'').length<6) return null;
  const g=new Chess(fen); if(g.in_check()) return null;
  const m=g.move(san,{sloppy:true}); if(!m) return null;
  const p=fen.split(' '); p[1]=p[1]==='w'?'b':'w'; p[3]='-';
  const nul=p.join(' '), n=new Chess(); if(!n.load(nul)||n.in_check()) return null;
  return {uci:m.from+m.to+(m.promotion||''),nul};
}
const bcCandidates=rows=>rows.flatMap(r=>(r.marks.bcand||[]).map(c=>({...c,game:r.game}))).sort((a,b)=>(b.w0-b.w1)-(a.w0-a.w1)||(b.game.ts||0)-(a.game.ts||0)).slice(0,BCMAX);
async function bcRecord(c,e){
  const base=e.r[0][1], thr=e.n[0], gain=thr[1]+base;   /* engine scores in pawns from the mover's side (mate = 99) */
  if(gain<1) return null;
  const threats=e.n.filter(x=>x[1]+base>=gain-0.5).map(x=>x[0]), goods=e.r.filter(x=>x[1]>=base-0.3).map(x=>x[0]);
  const g=c.game, oppElo=g.color==='w'?g.br:g.wr, ru=c.reply?uciOf(c.after,c.reply):'';
  return {id:await drillId('k',c.fen,c.uci),fen:c.fen,null:c.nul,color:g.color==='w'?'white':'black',opp:g.color==='w'?g.black:g.white,oppElo:oppElo||'',
    date:g.date||'',event:g.event||'',moveNo:+c.fen.split(' ')[5]||Math.floor(c.ply/2)+1,played:c.san,playedUci:c.uci,reply:c.reply,replyUci:ru||'',
    w0:Math.round(c.w0),w1:Math.round(c.w1),threat:sanOf(c.nul,thr[0]),threatUci:thr[0],threats,gain:Math.round(gain*10)/10,
    ignored:!!ru&&ru.slice(0,4)===thr[0].slice(0,4),best:sanOf(c.fen,e.r[0][0]),bestUci:e.r[0][0],goods,strong:oppElo>=2200,
    site:g.site,url:g.url||'',g:g.id,ply:c.ply};
}
async function findBlunderChecks(rows,m,onStep){
  const cands=bcCandidates(rows), depth=DEPTH[m], cache=Store.get(BCKEY)||{}, out=[]; let i=0, fresh=0;
  for(const c of cands){
    if(stopReq) break;
    const key=c.fen+'|'+c.uci; let e=cache[key];
    if(!e||!(e.d>=depth)){
      const lim=m==='deep'?30000:9000;
      const real=await SharedEngine.analyse(c.fen,depth,3,lim).catch(()=>null);
      const nul=real&&real.length?await SharedEngine.analyse(c.nul,depth,3,lim).catch(()=>null):null;
      if(real&&real.length&&nul&&nul.length){ e={d:depth,r:real.map(x=>[x.uci,x.cp]),n:nul.map(x=>[x.uci,x.cp])}; delete cache[key]; cache[key]=e; fresh++ } else e=null }
    if(e){ const r=await bcRecord(c,e); if(r) out.push(r) }
    onStep&&onStep(++i,cands.length);
  }
  if(fresh){ const ks=Object.keys(cache); if(ks.length>BCCACHE) for(const k of ks.slice(0,ks.length-BCCACHE)) delete cache[k]; Store.put(BCKEY,cache) }
  return out;
}
/* the blunder checks of a set of rows from the stored searches only (no engine): the report after a filter */
const bcOf=(rows,list)=>{ const ids=new Set(rows.map(r=>r.game.id)); return (list||[]).filter(d=>ids.has(d.g)) };

/* ---------- Your files (several at once) ---------- */
let FILES=[];        /* [{name, parsed, det:{sys,why}, sys:'auto'|<system>}] */
const effSys=f=>f.sys&&f.sys!=='auto'?f.sys:f.det.sys;
const sysWhy=f=>f.sys&&f.sys!=='auto'?'chosen by you':f.det.why;
function addFile(text,name){
  const P=PgnFile.parse(text);
  if(!P.games.length) throw new Error(`No games found in ${name}. Is it a PGN?`);
  if(!PgnFile.players(P).length) throw new Error(`${name} has games but no player names (White / Black tags), so there is no way to tell which side you were. Add the names (in a Lichess study: the chapter’s tags) and try again.`);
  let nm=name, k=2; while(FILES.some(f=>f.name===nm)) nm=`${name} (${k++})`;
  const saved=(Store.get('pgn-sys')||{})[name];
  FILES.push({name:nm,parsed:P,det:PgnFile.detect(P),sys:saved||'auto'});
  return FILES[FILES.length-1];
}
const merged=()=>PgnFile.merge(FILES.map(f=>({name:f.name,parsed:f.parsed,sys:effSys(f)})));
const meList=()=>[...document.querySelectorAll('#a-pgnnames input:checked')].map(i=>i.value);
function renderFiles(){
  const box=$('a-files'); if(!box) return;
  const SYS=Object.entries(Perf.LABEL);
  box.hidden=!FILES.length;
  box.innerHTML=FILES.length?`<div class="afiles" role="list"><div class="afhead" aria-hidden="true"><span>File</span><span class="num">Games</span><span>Ratings are${Help.q('Which rating system the ratings in this file are on. It decides the performance-rating formula (US Chess’s for US Chess, FIDE’s method otherwise) and keeps pools apart: a US Chess 1800 and a Lichess 1800 are never mixed. Guessed from the file: Lichess or Chess.com by the Site tag, FIDE when the file has FIDE ids, other over-the-board games are assumed to be US Chess. Change it if the guess is wrong.')}</span><span></span></div>${FILES.map((f,i)=>{
      const sk=(LASTSKIP&&LASTSKIP[f.name])||null, out=sk?Object.entries(sk).filter(([k])=>k!=='notYou').reduce((a,[,v])=>a+v,0):0;
      return `<div class="afile" role="listitem"><span class="afname" title="${esc(f.name)}">${esc(f.name)}${out?`<span class="note"> · ${out} left out: ${esc(skipText(sk))}</span>`:''}</span><span class="num afn">${f.parsed.games.length}<span class="note"> games</span></span>
        <select data-fsys="${i}" aria-label="Rating system of ${esc(f.name)}"><option value="auto"${f.sys==='auto'?' selected':''}>${esc(Perf.LABEL[f.det.sys])} (guessed)</option>${SYS.map(([v,l])=>`<option value="${v}"${f.sys===v?' selected':''}>${esc(l)}</option>`).join('')}</select>
        <button type="button" class="btn sm" data-frm="${i}" aria-label="Remove ${esc(f.name)}">✕</button></div>` }).join('')}</div>`:'';
  /* who you are: every name in the files, most games first; tick more than one when your name differs between files */
  const M=merged(), names=PgnFile.players({games:M.games}), saved=[].concat(Store.get('pgn-me')||[]), cur=meList();
  /* a saved name finds its player however it was spelled (names are one player when only case, dots or spaces differ) */
  const shown=n=>{ const k=PgnFile.nameKey(n), e=names.find(([x])=>PgnFile.nameKey(x)===k); return e?e[0]:null };
  const ticked=new Set((cur.length?cur:saved).map(shown).filter(Boolean));
  if(!ticked.size&&names.length) ticked.add(names[0][0]);
  /* your name written differently elsewhere in the files (a missing middle initial, an initial, a short first name, the
     first or last name alone, a username), never one that plays against you: ticked for you, with the reason; untick
     one and it stays unticked (pgn-not-me) */
  const notMe=new Set(Store.get('pgn-not-me')||[]), AL=new Map();
  for(const a of PgnFile.aliases({games:M.games},[...ticked])){ const n=shown(a.name)||a.name, k=PgnFile.nameKey(n);
    AL.set(n,a); if(!notMe.has(k)) ticked.add(n) }
  $('a-pgnwho').hidden=!FILES.length;
  const main=names.filter(([n,c],i)=>!AL.has(n)&&(i<2||c>=2||ticked.has(n))).slice(0,12), rest=names.filter(x=>!AL.has(x[0])&&!main.includes(x)).slice(0,40);
  const chip=([n,c])=>`<label class="chip achk"><input type="checkbox" value="${esc(n)}"${ticked.has(n)?' checked':''}> ${esc(n)} <span class="note">${c}</span></label>`;
  const alChip=([n,a])=>`<label class="chip achk" title="${esc(a.why)}"><input type="checkbox" data-alias="1" value="${esc(n)}"${ticked.has(n)?' checked':''}> ${esc(n)} <span class="note">${a.games} · ${esc(a.why)}</span></label>`;
  $('a-pgnnames').innerHTML=main.map(chip).join('')+(AL.size?`<div class="aalias"><span class="note">Also you? Your name written another way${Help.q('Names in your files that look like yours: the same first and last name without the middle initial, an initial and your last name, a short first name, your first or last name alone, or a username made of your name. A name that plays against you in any game is never suggested. They are ticked for you; untick any that isn’t you and it stays unticked.')}</span><div class="chips">${[...AL].map(alChip).join('')}</div></div>`:'')+(rest.length?`<details class="amore"><summary class="note">${rest.length} more name${rest.length===1?'':'s'} with one game</summary><div class="chips">${rest.map(chip).join('')}</div></details>`:'');
  /* games to look at again, from the last run: colours that look swapped, results that don't fit the moves */
  const ck=$('a-checks'); if(ck){ const C=LASTCHECKS||[]; ck.hidden=!C.length;
    ck.innerHTML=C.length?`<span class="label">Check ${C.length===1?'this game':'these '+C.length+' games'}${Help.q('Games in your files that look wrong: you are one colour in the tags but your moves are the ones you play with the other colour (White and Black swapped in the tags), or a result that doesn’t fit the game (checkmate or stalemate on the board, or the Result tag and the end of the moves disagree). Nothing is changed for you: fix the file and load it again.')}</span>${C.slice(0,8).map(c=>`<div class="acheck"><span class="note">${esc(c.game.date||'no date')}</span> <b>${esc(c.game.white)} – ${esc(c.game.black)}</b>${c.game.event?` <span class="note">${esc(c.game.event)}</span>`:''}: ${esc(c.text)}</div>`).join('')}${C.length>8?`<div class="note">and ${C.length-8} more</div>`:''}`:'' }
  syncSelect(names,ticked);
  updateEstimate();
}
/* the old single "which player is you" select stays in step (links and tests use it) */
function syncSelect(names,ticked){ const sel=$('a-pgnname'); if(!sel) return;
  sel.innerHTML=names.slice(0,16).map(([n,c])=>`<option value="${esc(n)}">${esc(n)} (${c} game${c===1?'':'s'})</option>`).join('');
  const first=[...ticked][0]; if(first) sel.value=first }
const skipText=sk=>[sk.fen&&`${sk.fen} from a set position`,sk.bullet&&`${sk.bullet} bullet`,sk.noResult&&`${sk.noResult} with no result (Result "*": set it in the PGN or the study chapter)`,sk.unfinished&&`${sk.unfinished} unfinished or very short`,sk.illegal&&`${sk.illegal} with an illegal move`].filter(Boolean).join(', ');
let LASTSKIP=null, LASTCHECKS=null;

/* ---------- Time estimates (measured on this device) ---------- */
/* three ordinary middlegame positions, searched once at each depth; the time per position × the positions to analyse */
const BENCH_FENS=['r1bq1rk1/pp2bppp/2n1pn2/2pp4/3P4/2PBPN2/PP1N1PPP/R2QK2R w KQ - 0 9',
  'r2q1rk1/1b2bppp/p1nppn2/1p6/3NP3/1BN1B3/PPP1QPPP/R4RK1 w - - 0 12',
  '2rq1rk1/pp1bppbp/3p1np1/4n3/3NP3/1BN1BP2/PPPQ2PP/2KR3R w - - 5 13'];
let BENCH=null, benching=null;
/* real games against the three benchmark positions (Chromium, 14 Nov 2026, 49 and 15 club games): at depth 11 a game's
   positions take about 0.3× a benchmark position (openings, endgames and the hash carried from move to move are
   quick); at depth 16 about 1.1× */
const CAL={standard:0.3,deep:1.1};
/* Blunder check after the games: two 3-line searches per blunder, each about BCF × a benchmark search (Stockfish 18 lite,
   30 real blunder positions and their null-move twins against the three benchmark positions, 13 Nov 2026: 1.36× at
   depth 11, 2.55× at depth 16); about 0.3 blunders a game (0.25 in an NM's 208 over-the-board games, 0.24 in a club
   player's 2,500 online games), at most BCMAX. */
const BCF={standard:1.4,deep:2.6}, BC_PER_GAME=0.3;
function bench(){
  if(BENCH||benching) return benching;
  benching=(async()=>{ const out={};
    await SharedEngine.analyse('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',8,1,60000).catch(()=>null);   /* warm-up: download and start the engine, untimed */
    for(const m of ['standard','deep']){ let t=0;
      for(const f of BENCH_FENS){ const fen=f.replace(/ 0 (\d+)$/,` ${m==='deep'?1:0} $1`); const t0=performance.now(); await SharedEngine.analyse(fen,DEPTH[m],1,40000).catch(()=>null); t+=performance.now()-t0 }
      out[m]=t/BENCH_FENS.length/1000 }
    BENCH=out; benching=null; updateEstimate(); return out })();
  return benching;
}
const fmtDur=s=>s<60?`${Math.max(5,Math.round(s/5)*5)} s`:s<5400?`${Math.round(s/60)} min`:`${(s/3600).toFixed(1)} h`;
/* plies that still need Stockfish for a mode: games of yours without evals in the file or a cached run good enough */
function pliesToAnalyse(m){
  if($('a-site').value!=='pgn'){ const n=$('a-site').value==='lichess'?CAP_LICHESS:CAP_CHESSCOM; return {plies:MAX_ENGINE_GAMES*80,games:MAX_ENGINE_GAMES,online:true,bc:Math.min(BCMAX,Math.ceil(BC_PER_GAME*n))} }
  if(!FILES.length) return null;
  const me=meList().map(PgnFile.nameKey); let plies=0, games=0, ready=0;
  for(const x of merged().games){ const w=PgnFile.nameKey(x.h.White), b=PgnFile.nameKey(x.h.Black);
    if(!me.includes(w)&&!me.includes(b)) continue;
    const n=x.evals.filter(v=>v!=null).length; if(n>=0.7*x.sans.length){ ready++; continue }
    const id='f'+PGN.posId([x.h.White,x.h.Black,x.h.Date,x.h.Round,x.sans.join(' ')].join('|'));
    if(evCache.get(id,m)){ ready++; continue }
    plies+=x.sans.length; games++ }
  return {plies,games,ready,bc:Math.min(BCMAX,Math.ceil(BC_PER_GAME*(games+ready)))};
}
function updateEstimate(){
  const el=$('a-est'); if(!el) return;
  for(const m of ['standard','deep']){ const t=$('a-est-'+m); if(!t) continue;
    const P=pliesToAnalyse(m);
    if(!P){ t.textContent=''; continue }
    if(!P.online&&!P.games){ t.textContent=P.ready?'nothing to do: every game already has evals':''; continue }
    if(!BENCH){ if(benching||FILES.length) t.textContent='measuring this device…'; else t.innerHTML='<button type="button" class="linkbtn" data-bench>estimate the time</button>'; continue }
    t.textContent=`≈ ${fmtDur(P.plies*BENCH[m]*CAL[m]+P.bc*2*BCF[m]*BENCH[m])}${P.online?' for 25 games without stored evals':` for ${P.games} game${P.games===1?'':'s'}`}`;
    t.title='Includes Blunder check (two searches for each of your biggest blunders, up to '+BCMAX+') after the games.' }
  /* the engine is measured only once there are games to analyse (or when asked): it downloads the engine */
  if(!BENCH&&!benching&&$('a-site').value==='pgn'&&FILES.length&&pliesToAnalyse('standard').games) bench();
}

/* ---------- The run ---------- */
async function run(site,user,blitz){
  blitz=blitz==null?!!($('a-blitz')&&$('a-blitz').checked):blitz;
  if(running) return; running=true;
  $('a-go').disabled=true; $('a-report').innerHTML=''; prog(0);
  const m=mode();
  try{
    let games, budget, fileNote='';
    if(site==='pgn'){
      if(!FILES.length) throw new Error('Choose your PGN file first.');
      const me=[].concat(user), M=merged(), nm=FILES.length===1?FILES[0].name:`${FILES.length} files`;
      note(`Checking the moves of ${M.games.length} games in ${nm}…`,true); prog(0);
      const r=await PgnFile.toGamesAsync({games:M.games},me,(d,n)=>{ prog(d/n); note(`Checking the moves: ${d} of ${n} games in ${nm}…`,true) }); games=r.games.slice().reverse();   // newest first: recent results appear first
      const sk=r.skipped, skip=skipText(sk); LASTSKIP=sk.byFile; LASTCHECKS=PgnFile.checks(r.games); renderFiles();
      fileNote=`${games.length} of your games in ${nm}${skip?` (left out: ${skip})`:''}${M.dupes?`; ${M.dupes} game${M.dupes===1?'':'s'} found in two files counted once`:''}.`;
      budget={games:Infinity,cache:true,mode:m};
      user=me.join(' / ');
    } else {
      LASTCHECKS=null; if($('a-checks')) $('a-checks').hidden=true;
      note('Fetching games…',true);
      games=site==='lichess'?await fetchLichess(user,blitz):await fetchChesscom(user,blitz);
      budget={games:MAX_ENGINE_GAMES,cache:true,mode:m};
    }
    LAST={games,site,fileNote,user,files:site==='pgn'?FILES.map(f=>({name:f.name,sys:effSys(f),why:sysWhy(f)})):[]}; LASTBC=[];
    if(!games.length) throw new Error(site==='pgn'?`No finished games by “${user}” in these files.`:`No recent ${blitz?'blitz, ':''}rapid or classical games found.`);
    const needEngine=games.filter(g=>!g.analysis&&!evCache.get(g.id,m)), nEng=Math.min(needEngine.length,budget.games);
    const engPlies=needEngine.slice(0,nEng).reduce((a,g)=>a+g.moves.length,0);
    const how=`${m==='deep'?'Deep':'Standard'} analysis, depth ${DEPTH[m]}`;
    note(site==='pgn'?`${fileNote} ${games.length-needEngine.length} already have evals${nEng?`; Stockfish is analyzing the other ${nEng} in your browser (${how}). You can stop any time: what is done is kept, and running it again carries on.`:'.'}`
      :`${games.length} games.${nEng?` ${nEng} without stored evals — analyzing with Stockfish in your browser (${how}), this takes a while…`:''}`,true);
    stopReq=false; if($('a-stop')) $('a-stop').hidden=!nEng;
    const rows=[], t0=Date.now(); let doneP=0, drawn=0, tick=Date.now();
    for(let i=0;i<games.length&&!stopReq;i++){
      const game=games[i], eng=needEngine.includes(game);
      const evs=await evalsFor(game,budget,f=>prog((i+f)/games.length));
      prog((i+1)/games.length);
      if(eng&&evs){ doneP+=game.moves.length; const left=engPlies-doneP, sec=doneP?(Date.now()-t0)/1000*left/doneP:0;
        if(left>0) note(`${site==='pgn'?fileNote+' ':''}Stockfish (${how}): game ${i+1} of ${games.length}, about ${sec<90?Math.max(1,Math.round(sec/10)*10)+' seconds':Math.round(sec/60)+' minutes'} left. You can stop any time and carry on later.`,true) }
      else if(Date.now()-tick>250){ note(`${site==='pgn'?fileNote+' ':''}Reading game ${i+1} of ${games.length}…`,true) }
      if(evs&&evs.length>=6) rows.push({game,marks:Object.assign(markGame(game,evs),{phase:phaseAccuracy(game,evs),evs})});
      /* redraw the report at most every 1.5 s (a 200-game file froze the page when it redrew after every game), and hand
         the browser a moment between games so the progress bar moves and Stop works */
      if(rows.length&&(Date.now()-drawn>1500||rows.length===1)){ renderReport(user,site,rows,games.length,false); drawn=Date.now() }
      if(Date.now()-tick>40){ await new Promise(r=>setTimeout(r,0)); tick=Date.now() }
    }
    /* Blunder check: your biggest blunders, the threat you missed and your move (two searches each, kept for next time) */
    let bcStopped=false;
    if(!stopReq&&rows.length){ const nb=bcCandidates(rows).length;
      if(nb){ if($('a-stop')) $('a-stop').hidden=false; prog(0); note(`Blunder check: finding the threat in your ${nb} biggest blunder${nb===1?'':'s'} (Stockfish, ${how})…`,true);
        LASTBC=await findBlunderChecks(rows,m,(k,n)=>{ prog(k/n); note(`Blunder check: position ${k} of ${n} (Stockfish, ${how})…`,true) });
        bcStopped=stopReq } }
    renderReport(user,site,rows,games.length,true);
    const kept=keepRun(rows,games.length,m);
    const keptNote=kept==='ok'?'':kept==='partial'?' This browser’s storage is full: the games your drills come from are kept, but this report won’t come back after a reload.':' This browser’s storage is full: these games can’t be kept, so the report won’t come back after a reload.';
    note((bcStopped?`Stopped during Blunder check: ${LASTBC.length} position${LASTBC.length===1?'':'s'} found so far. Press Analyze again to carry on (nothing is redone).`
      :stopReq?`Stopped: ${rows.length} of ${games.length} games analyzed so far. Press Analyze again to carry on (nothing is redone).`:site==='pgn'?`${fileNote} Done.`:'Done.')+keptNote);
  }catch(e){ note(String(e.message||e)) }
  prog(0,false); $('a-go').disabled=false; if($('a-stop')) $('a-stop').hidden=true; running=false; updateEstimate();
}

/* ---------- Keeping the games (js/agames.js) ---------- */
function keepRun(rows,total,m){
  const evs=new Map(rows.map(r=>[r.game.id,r.marks.evs]));
  const res=AGames.saveRun({site:LAST.site,user:LAST.user,files:LAST.files,fileNote:LAST.fileNote,games:LAST.games,bc:LASTBC,total,mode:m},evs);
  backfill(rows);
  return res;
}
/* drills and blunder checks saved before games were kept have no game to open: find theirs in these games (the same
   position and move) and point them to it */
function backfill(rows){
  const at=new Map();
  for(const r of rows){ const f=r.marks.fens||[]; r.game.moves.forEach((san,i)=>{ if(f[i]) at.set(f[i]+'|'+san,{g:r.game.id,ply:i,r}) }) }
  const used=new Map();
  for(const k of ['adrills','abc']){ const L=Store.get(k)||[]; let ch=false;
    for(const d of L){ if(d.g) continue; const x=at.get(d.fen+'|'+d.played); if(!x) continue; d.g=x.g; d.ply=x.ply; ch=true; used.set(x.g,x.r) }
    if(ch) Store.put(k,L) }
  if(used.size) AGames.pin([...used.values()].map(r=>({game:r.game,evs:r.marks.evs})));
}
/* the last report after a reload: its games and the stored evals, no fetch and no engine */
const day=t=>new Date(t).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'});
function restore(){
  if(LASTR||running) return false;
  const L=AGames.last(); if(!L||!Array.isArray(L.ids)||!L.ids.length) return false;
  const all=AGames.all(), games=L.ids.map(id=>all[id]).filter(Boolean).map(AGames.unpack); if(!games.length) return false;
  const rows=[];
  for(const game of games){
    const evs=game.analysis?game.analysis.map(a=>a.mate!=null?(a.mate>0?MATE/100:-MATE/100):(a.eval||0)/100):AGames.evals(all[game.id]);
    if(evs&&evs.length>=6) rows.push({game,marks:Object.assign(markGame(game,evs),{phase:phaseAccuracy(game,evs),evs})}) }
  LAST={games,site:L.site,fileNote:L.fileNote||'',user:L.user,files:L.files||[],restored:L.t}; LASTBC=L.bc||[];
  renderReport(L.user,L.site,rows,L.total||games.length,true);
  note(`Your last report, from ${day(L.t)}: ${games.length} game${games.length===1?'':'s'}. Analyze again to update it.`);
  return true;
}
/* a game of the report on screen (the game view asks while a run is still going, before the games are kept) */
function live(id){ const g=LAST&&LAST.games.find(x=>x.id===id); if(!g) return null; const r=LASTR&&LASTR[2].find(x=>x.game.id===id); return {game:g,evs:r?r.marks.evs:null} }

/* ---------- Phases and accuracy ----------
   Phases as Lichess divides a game: the middlegame starts when 10 or fewer major and minor pieces are left, or a back
   rank is sparse (fewer than 4 of a side's own pieces on it); the endgame when 6 or fewer major and minor pieces are left.
   Accuracy per move is Lichess's: 103.1668 × e^(−0.04354 × drop in win %) − 3.1669, the win % from your side. */
function phaseOf(g){ let mm=0, wb=0, bb=0; for(const [r,row] of g.board().entries()) for(const p of row){ if(!p) continue; if(p.type!=='k'&&p.type!=='p') mm++; if(r===7&&p.color==='w') wb++; if(r===0&&p.color==='b') bb++ }
  return mm<=6?'endgame':(mm<=10||wb<4||bb<4)?'middlegame':'opening' }
/* accuracy per phase; also the phase of each of your moves (phase.at[ply]) for Move quality by phase */
function phaseAccuracy(game,evs){
  const out={opening:[],middlegame:[],endgame:[]}, at={}, g=new Chess(); let prev=0.2, phase='opening';
  const winPct=(ev,mover)=>50+50*wc((mover==='w'?1:-1)*ev);
  for(let i=0;i<game.moves.length&&i<evs.length;i++){ const mover=g.turn(); const before=prev; const m=g.move(game.moves[i],{sloppy:true}); if(!m) break;
    const cur=evs[i]==null?before:evs[i]; prev=cur; if(phase!=='endgame'){ const p=phaseOf(g); if(p==='endgame'||phase==='opening') phase=p }
    if(mover!==game.color) continue;
    at[i]=phase;
    const drop=Math.max(0,winPct(before,mover)-winPct(cur,mover)); out[phase].push(Math.max(0,Math.min(100,103.1668*Math.exp(-0.04354*drop)-3.1669))) }
  Object.defineProperty(out,'at',{value:at,enumerable:false});
  return out }
let LAST=null, LASTR=null, LASTBC=[];

/* ---------- Saved drill sets ----------
   Every Save makes a set (adrill-sets: [{id, t, label, n}]); each drill lists the sets that saved it (d.b). Removing a
   set takes it off its drills and deletes only the drills no other set holds, with their results. Drills saved before
   sets existed (no d.b) form one set per source (OTB / Lichess / Chess.com). Since 13 Nov 2026 a set holds blunder checks
   too (abc, results in bc-progress), and a loaded Chess Lab pack is the set "pack" (Store.migrate). */
const platOf=d=>d.site==='lichess'?'lichess':d.site==='chesscom'||d.site==='chess.com'?'chesscom':'otb';
const PLAT={otb:'over-the-board',lichess:'Lichess',chesscom:'Chess.com'};
function drillSets(){
  const D=Store.get('adrills')||[], K=Store.get('abc')||[];
  const S=(Store.get('adrill-sets')||[]).map(s=>({...s,n:D.filter(d=>(d.b||[]).includes(s.id)).length,nb:K.filter(d=>(d.b||[]).includes(s.id)).length})).filter(s=>s.n||s.nb);
  const old={}; for(const d of D) if(!d.b&&!d.pack){ const p=platOf(d); old[p]=(old[p]||0)+1 }
  return S.sort((a,b)=>b.t-a.t).concat(Object.entries(old).map(([p,n])=>({id:'old:'+p,old:true,label:`Saved earlier from ${PLAT[p]} games`,n,nb:0})));
}
function removeSet(id){
  const D=Store.get('adrills')||[], P=Store.get('adrills-progress')||{}, keep=[], gone=[];
  for(const d of D){
    if(id.startsWith('old:')){ if(!d.b&&!d.pack&&platOf(d)===id.slice(4)){ gone.push(d.id); continue } keep.push(d); continue }
    if(!(d.b||[]).includes(id)){ keep.push(d); continue }
    const b=d.b.filter(x=>x!==id);
    if(b.length) keep.push({...d,b}); else gone.push(d.id);
  }
  for(const k of gone) delete P[k];
  Store.put('adrills',keep); Store.put('adrills-progress',P);
  /* the set's blunder checks: the same rule (one another set also holds stays) */
  const K=Store.get('abc')||[], BP=Store.get('bc-progress')||{}, kk=[]; let nb=0;
  for(const d of K){ if(!(d.b||[]).includes(id)){ kk.push(d); continue } const b=d.b.filter(x=>x!==id); if(b.length) kk.push({...d,b}); else { delete BP[d.id]; nb++ } }
  if(nb||K.length!==kk.length){ Store.put('abc',kk); Store.put('bc-progress',BP) }
  Store.put('adrill-sets',(Store.get('adrill-sets')||[]).filter(s=>s.id!==id));
  if(window.DrillsTab) DrillsTab.refresh(); if(window.BlunderCheckTab) BlunderCheckTab.refresh();
  return gone.length+nb;
}
const setCount=s=>[s.n?`${s.n} drill${s.n===1?'':'s'}`:'',s.nb?`${s.nb} blunder check${s.nb===1?'':'s'}`:''].filter(Boolean).join(' · ');
function setsHtml(){
  const S=drillSets(); if(!S.length) return '';
  return `<details class="asets"${S.length<=3?' open':''}><summary>Your saved drill sets (${S.length})${Help.q('Each time you save drills here they form a set, with its blunder checks. Remove a set to take its drills out of Drills and its positions out of Blunder check, with their results; a position that another set also saved stays. Nothing else (your other drills, tactics, openings) is touched.')}</summary>
    <div class="asetlist">${S.map(s=>`<div class="aset" data-set="${esc(s.id)}"><span>${esc(s.label)}${s.t?` <span class="note">· ${day(s.t)}</span>`:''}</span><span class="note num">${setCount(s)}</span>
      <span class="asetbtns"><button type="button" class="btn sm" data-setrm="${esc(s.id)}">Remove</button></span></div>`).join('')}</div></details>`;
}

/* ---------- The report ---------- */
function renderReport(user,site,rows0,total,final){
  LASTR=[user,site,rows0,total,final];
  const allG=(LAST&&LAST.games)||rows0.map(r=>r.game);
  /* the files' rating systems: live while the loaded files are this report's (a change in the list redraws it); a restored
     report keeps the ones it was made with */
  const live=FILES.map(f=>({name:f.name,sys:effSys(f),why:sysWhy(f)}));
  const files=LAST&&LAST.restored&&LAST.files&&LAST.files.length?LAST.files:live;
  if(LAST&&!LAST.restored&&LAST.site==='pgn') LAST.files=live;
  const html=AStats.render({user,site,rows:rows0,allGames:allG,total,final,fileNote:LAST&&LAST.fileNote,files,
    yearly:yearlyOf,save:saveCard});
  $('a-report').innerHTML=html;
}
/* the Save drills card (near the top: the most useful thing to do with a report) */
function saveCard(mistakes,toPunish,final,rows){
  const nm=Math.min(mistakes.length,40), np=Math.min(toPunish.length,20), nb=bcOf(rows||[],LASTBC).length;
  const can=final&&(nm||np||nb);
  const what=[nm+np?`${nm+np} drill${nm+np===1?'':'s'}`:'',nb?`${nb} blunder check${nb===1?'':'s'}`:''].filter(Boolean).join(' and ');
  return `<div class="card asave"><div class="asavehead"><div><span class="label">Drills from these games${Help.q('A drill is the position before one of your costly moves: find a better move, judged by Stockfish. Punish drills are positions where your opponent erred and you didn’t make them pay. They go to the Drills tab (and Today) and come back until you solve them. A blunder check is one of your blunders asked the other way round: first spot what your opponent threatens, then find your move (Extra → Blunder check).')}</span>
    <p class="note">${can?`${nm?`Your ${nm} costliest move${nm===1?'':'s'}`:''}${np?`${nm?', plus ':''}${np} position${np===1?'':'s'} where your opponent erred and you didn’t make them pay`:''}${nm+np?'. Train them in Drills.':''}${nb?` ${nb} of your blunders as blunder checks: spot the threat first, then your move.`:''}`:final?'No costly moves found in these games: nothing to save.':'Drills can be saved when the analysis finishes (or after Stop).'}</p></div>
    ${can?`<button class="btn primary" id="a-savedrills">Save ${what}</button>`:''}</div>${setsHtml()}</div>`;
}
/* Before a drill is saved its position is searched again, deeper and with three lines (14 Nov 2026, audit item 2):
   the report's evals are one shallow line per position, enough for the statistics but not to tell someone "find a
   better move". verifyDrill -> {best, drop} (drop: Win-chance lost by the game move against the best, 0..2 scale as wc),
   or null when the engine didn't answer (the drill is then saved as before). A drill is dropped when the game move is
   within the Drills tab's own tolerance of the best (0.1): there is nothing better to find. Results are kept
   (adrill-verify, by position and move), so saving again asks nothing twice. */
const VDEPTH={standard:16,deep:18}, VKEY='adrill-verify', VTOL=0.1, VMAX=400;
async function verifyDrill(fen,uci,m,cache){
  const key=fen+'|'+uci, d=VDEPTH[m]||16, c=cache[key];
  if(c&&c.d>=d) return c;
  const P=x=>x.mate!=null?(x.mate>0?MATE/100:-MATE/100):x.cp;
  const a=await SharedEngine.analyse(fen,d,3,15000).catch(()=>null); if(!a||!a.length||!a[0].uci) return null;
  const row=a.find(x=>x.uci&&x.uci.slice(0,4)===uci.slice(0,4)&&(x.uci[4]||'')===(uci[4]||'')); let mine;
  if(row) mine=P(row);
  else{ const g=new Chess(fen); if(!g.move({from:uci.slice(0,2),to:uci.slice(2,4),promotion:uci[4]||undefined})) return null;
    if(g.in_checkmate()) mine=MATE/100;
    else if(g.in_draw()||g.in_stalemate()) mine=0;
    else{ const b=await SharedEngine.analyse(g.fen(),d,1,15000).catch(()=>null); if(!b||!b.length) return null; mine=-P(b[0]) } }
  const r={d,best:a[0].uci,drop:Math.max(0,+(wc(P(a[0]))-wc(mine)).toFixed(3))};
  cache[key]=r; return r;
}
async function saveDrills(btn){
  const R=AStats.last; if(!R) return;
  btn.disabled=true; btn.textContent='Saving…';
  /* check each candidate first */
  const cand=R.mistakes.slice(0,40).map(m=>[m,'a']).concat(R.toPunish.slice(0,20).map(m=>[m,'p']));
  const vc=Store.get(VKEY)||{}, vm=mode(), ok=new Map(); let dropped=0, k=0;
  for(const [m] of cand){ k++; const uci=uciOf(m.fen,m.san); if(!uci) continue;
    btn.textContent=`Checking position ${k} of ${cand.length} more deeply…`;
    const v=await verifyDrill(m.fen,uci,vm,vc);
    if(v&&v.drop<VTOL){ dropped++; ok.set(m,false) } else ok.set(m,v||true) }
  { const ks=Object.keys(vc); if(ks.length>VMAX) for(const x of ks.slice(0,ks.length-VMAX)) delete vc[x]; Store.tryPut(VKEY,vc) }
  btn.textContent='Saving…';
  const drills=Store.get('adrills')||[], at=new Map(drills.map((d,i)=>[d.id,i]));
  const fl=(LAST&&LAST.files||[]).map(f=>f.name);
  const set={id:'s'+Date.now().toString(36),t:Date.now(),label:LAST&&LAST.site==='pgn'?`From ${(fl.length?fl:FILES.map(f=>f.name)).join(', ')}`:`From ${LAST&&LAST.user} on ${LAST&&LAST.site==='lichess'?'Lichess':'Chess.com'}`};
  let added=0; const games=new Map();
  const put=async(m,extra,prefix)=>{ const uci=uciOf(m.fen,m.san); if(!uci) return;
    const v=ok.get(m); if(v===false) return;                       /* the game move is as good as the best: not a drill */
    if(v&&v.best) m={...m,best:v.best};                             /* the checked best move, stored on the drill (PGN drills had none) */
    const id=await drillId(prefix,m.fen,uci);
    if(at.has(id)){ const d=drills[at.get(id)]; if(d.b&&!d.b.includes(set.id)) d.b=d.b.concat(set.id); return }   /* already saved: this set holds it too (older drills keep no list) */
    at.set(id,drills.length); added++;
    drills.push({id,...extra,...(v&&v.best?{v:1}:{}),fen:m.fen,played:m.san,playedUci:uci,best:m.best,drop:m.drop,before:m.before,
      date:m.game.date,opp:m.game.color==='w'?m.game.black:m.game.white,site:m.game.site,url:m.game.url,color:m.game.color,g:m.game.id,ply:m.ply,b:[set.id]});
    games.set(m.game.id,m.game) };
  for(const m of R.mistakes.slice(0,40)) await put(m,{},'a');
  for(const m of R.toPunish.slice(0,20)) await put(m,{kind:'punish',oppMove:m.opp,oppDrop:m.oppDrop,verdict:m.verdict},'p');
  /* blunder checks (abc), the same set */
  const K=Store.get('abc')||[], kat=new Map(K.map((d,i)=>[d.id,i])); let addedB=0;
  for(const d of bcOf(R.rows||[],LASTBC)){
    if(kat.has(d.id)){ const o=K[kat.get(d.id)]; if(!(o.b||[]).includes(set.id)) o.b=(o.b||[]).concat(set.id); if(!o.g){ o.g=d.g; o.ply=d.ply } }
    else { kat.set(d.id,K.length); K.push({...d,b:[set.id]}); addedB++ }
    const r=(R.rows||[]).find(x=>x.game.id===d.g); if(r) games.set(r.game.id,r.game) }
  Store.put('adrills',drills); Store.put('abc',K);
  Store.put('adrill-sets',(Store.get('adrill-sets')||[]).concat(set));
  /* keep the games they come from, with their evals, so each opens in the game view */
  const evOf=new Map((R.rows||[]).map(r=>[r.game.id,r.marks.evs]));
  AGames.pin([...games.values()].map(g=>({game:g,evs:evOf.get(g.id)})));
  const left=dropped?` ${dropped} left out: on a deeper look the game move was as good as the best.`:'';
  btn.textContent=(added||addedB?`Saved ${[added?`${added} drill${added===1?'':'s'}`:'',addedB?`${addedB} blunder check${addedB===1?'':'s'}`:''].filter(Boolean).join(' and ')} — see ${added?'Drills':'Blunder check'}.`:dropped&&!at.size?'Nothing to save.':'Already saved — see the Drills tab.')+left;
  if(window.DrillsTab) DrillsTab.refresh(); if(window.BlunderCheckTab) BlunderCheckTab.refresh();
  const box=btn.closest('.asave'); const old=box&&box.querySelector('.asets'); const h=setsHtml();
  if(box){ if(old) old.outerHTML=h; else box.insertAdjacentHTML('beforeend',h) }
}
/* Year by year (shared/yearly.js) from every game: no engine needed. Ratings per pool (where + speed + rating system),
   never mixed: Lichess gives the rating going in and the change; Chess.com the rating after the game (the one going in
   is the previous game's in that pool); an over-the-board file the rating going in (so a game's change shows at the
   next game). Each pool's performance follows its rating system (shared/perf.js). */
const POOLPRE={uschess:'OTB',fide:'FIDE',unspecified:'PGN',lichess:'Lichess',chesscom:'Chess.com'};
const poolOf=g=>`${POOLPRE[g.sys||(g.site==='pgn'?'uschess':g.site)]||g.site} ${g.speed}`;
function yearlyOf(all,sc){
  const games=[...all].sort((a,b)=>(a.ts||0)-(b.ts||0)).map(g=>{ const w=g.color==='w', own=w?g.wr:g.br;
    return {g,own,date:g.date,order:g.ts||0,score:sc(g),opp:(w?g.br:g.wr)||0,prov:w?g.bp:g.wp,pool:poolOf(g),sys:g.sys||(g.site==='pgn'?'uschess':g.site),before:null,after:null} });
  const last=new Map();
  games.forEach((x,i)=>{ const g=x.g;
    if(!(x.own>0)) return;
    if(g.site==='lichess'){ const d=g.color==='w'?g.wd:g.bd; if(d!=null){ x.before=x.own; x.after=x.own+d } }
    else if(g.site==='chesscom'){ x.after=x.own; x.before=last.has(x.pool)?last.get(x.pool):null; last.set(x.pool,x.own) }
    else { x.before=x.own; x.net=true; const nx=games.slice(i+1).find(y=>y.pool===x.pool&&y.own>0); x.after=nx?nx.own:x.own } });
  return {games,...Yearly.summarize(games)};
}
function uciOf(fen,san){ const g=new Chess(fen); const m=g.move(san,{sloppy:true}); return m?m.from+m.to+(m.promotion||''):null }

/* #analyze?site=lichess|chesscom&u=<name>: fill the form (from a link, e.g. the private Chess Lab); you press Fetch yourself */
function prefill(){ const m=location.hash.match(/^#analyze\?(.*)$/); if(!m) return; const q=new URLSearchParams(m[1]);
  if(q.get('site')==='lichess'||q.get('site')==='chesscom') $('a-site').value=q.get('site'); if(q.get('u')) $('a-user').value=q.get('u').slice(0,40); if(q.get('blitz')==='1'&&$('a-blitz')) $('a-blitz').checked=true }
async function readFiles(list){
  const fs=[...list].filter(f=>f&&f.name); if(!fs.length) return;
  if($('a-site').value!=='pgn'){ $('a-site').value='pgn'; srcUI() }
  const bad=[];
  for(const f of fs){ try{ note(`Reading ${f.name}…`,true); await new Promise(r=>setTimeout(r,20)); addFile(await f.text(),f.name) }catch(e){ bad.push(String(e.message||e)) } }
  LASTSKIP=null; LASTCHECKS=null; renderFiles();
  const n=FILES.reduce((a,f)=>a+f.parsed.games.length,0);
  note(bad.length?bad.join(' '):`${n} games in ${FILES.length} file${FILES.length===1?'':'s'}. Check which name is you, then press Analyze.`);
}
function srcUI(){ const f=$('a-site').value==='pgn'; document.querySelectorAll('#analyze [data-src]').forEach(e=>{ e.hidden=(e.dataset.src==='pgn')!==f }); if($('a-checks')) $('a-checks').hidden=!f||!(LASTCHECKS&&LASTCHECKS.length);
  $('a-pgnwho').hidden=!(f&&FILES.length); $('a-files').hidden=!(f&&FILES.length); $('a-go').textContent=f?'Analyze':'Fetch & analyze'; updateEstimate() }
function init(){
  prefill(); addEventListener('hashchange',prefill);
  $('a-capnote').textContent=String(CAP_CHESSCOM);
  $('a-go').addEventListener('click',()=>{
    if($('a-site').value==='pgn'){ if(!FILES.length){ note('Choose your PGN file first.'); return } const me=meList(); if(!me.length){ note('Tick which player is you.'); return } Store.put('pgn-me',me); run('pgn',me); return }
    const u=$('a-user').value.trim(); if(!u){ note('Type a username.'); return }
    run($('a-site').value,u) });
  $('a-site').addEventListener('change',srcUI); srcUI();
  /* Standard / Deep */
  document.querySelectorAll('input[name="a-mode"]').forEach(r=>{ r.checked=r.value===mode(); r.addEventListener('change',()=>{ if(r.checked) Store.put('a-mode',r.value); updateEstimate() }) });
  $('a-est').addEventListener('click',e=>{ if(e.target.closest('[data-bench]')){ e.preventDefault(); bench(); updateEstimate() } });
  if($('a-stop')) $('a-stop').addEventListener('click',()=>{ stopReq=true; note('Stopping after this position…') });
  if($('a-pgnfile')) $('a-pgnfile').addEventListener('change',async e=>{ await readFiles(e.target.files||[]); e.target.value='' });
  /* drag-and-drop anywhere on the form */
  const card=$('a-form')||$('analyze');
  card.addEventListener('dragover',e=>{ if(e.dataTransfer&&[...(e.dataTransfer.types||[])].includes('Files')){ e.preventDefault(); card.classList.add('adragging') } });
  card.addEventListener('dragleave',e=>{ if(!card.contains(e.relatedTarget)) card.classList.remove('adragging') });
  card.addEventListener('drop',e=>{ if(!e.dataTransfer||!e.dataTransfer.files||!e.dataTransfer.files.length) return; e.preventDefault(); card.classList.remove('adragging'); readFiles(e.dataTransfer.files) });
  /* a Lichess study link: the whole study's PGN, fetched by this browser */
  if($('a-study')) $('a-studygo').addEventListener('click',async()=>{ const u=$('a-study').value.trim(); if(!u) return;
    $('a-studygo').disabled=true; note('Fetching the study from Lichess…',true);
    try{ const s=await Net.fetchStudy(u); addFile(s.pgn,(s.name||'Lichess study')+'.pgn'); $('a-study').value=''; LASTSKIP=null; LASTCHECKS=null; renderFiles(); note(`Added ${s.name||'the study'} (${s.chapters} chapters).`) }
    catch(e){ note(String(e.message||e)) }
    $('a-studygo').disabled=false });
  $('a-files').addEventListener('change',e=>{ const s=e.target.closest('[data-fsys]'); if(!s) return; const f=FILES[+s.dataset.fsys]; f.sys=s.value;
    const o=Store.get('pgn-sys')||{}; if(s.value==='auto') delete o[f.name]; else o[f.name]=s.value; Store.put('pgn-sys',o);
    if(LASTR&&LAST&&LAST.site==='pgn'&&!LAST.restored&&!running){ for(const g of LAST.games) if(g.file===f.name&&g.site==='pgn') g.sys=effSys(f); renderReport(...LASTR); keepRun(LASTR[2],LASTR[3],mode()) } });   /* kept games follow it, so a reload shows the same */
  $('a-files').addEventListener('click',e=>{ const b=e.target.closest('[data-frm]'); if(!b) return; FILES.splice(+b.dataset.frm,1); LASTSKIP=null; LASTCHECKS=null; renderFiles(); if(!FILES.length) note('') });
  $('a-pgnnames').addEventListener('change',e=>{
    const i=e.target; if(i&&i.dataset&&i.dataset.alias){ const k=PgnFile.nameKey(i.value), o=new Set(Store.get('pgn-not-me')||[]); if(i.checked) o.delete(k); else o.add(k); Store.put('pgn-not-me',[...o]) }
    Store.put('pgn-me',meList()); syncSelect(PgnFile.players({games:merged().games}),new Set(meList())); updateEstimate() });
  if($('a-pgnname')) $('a-pgnname').addEventListener('change',e=>{ document.querySelectorAll('#a-pgnnames input').forEach(i=>{ i.checked=i.value===e.target.value }); Store.put('pgn-me',meList()) });
  $('a-demo').addEventListener('click',()=>{ $('a-site').value='chesscom'; $('a-user').value='CoachSuhaas'; srcUI(); run('chesscom','CoachSuhaas') });
  $('a-user').addEventListener('keydown',e=>{ if(e.key==='Enter') $('a-go').click() });
  $('a-report').addEventListener('click',e=>{
    const sd=e.target.closest('#a-savedrills'); if(sd){ saveDrills(sd); return }
    const rm=e.target.closest('[data-setrm]'); if(rm){ const row=rm.closest('.aset'), id=rm.dataset.setrm, n=(drillSets().find(s=>s.id===id)||{}).n||0;
      row.querySelector('.asetbtns').innerHTML=`<span class="note">Remove ${esc(setCount(drillSets().find(s=>s.id===id)||{n}))} and their results?</span> <button type="button" class="btn sm danger" data-setyes="${esc(id)}">Remove</button> <button type="button" class="btn sm" data-setno>Keep</button>`; return }
    const yes=e.target.closest('[data-setyes]'); if(yes){ const n=removeSet(yes.dataset.setyes); const box=yes.closest('.asets'); if(box) box.outerHTML=setsHtml()||`<p class="note">Removed ${n} position${n===1?'':'s'}.</p>`; return }
    if(e.target.closest('[data-setno]')){ const box=e.target.closest('.asets'); if(box) box.outerHTML=setsHtml(); return }
    if(AStats.click(e)&&LASTR) renderReport(...LASTR) });
  $('a-report').addEventListener('change',e=>{ if(AStats.change(e)&&LASTR) renderReport(...LASTR) });
}
window.AnalyzeTab={init,verifyDrill,saveDrills,evCache,phaseAccuracy,phaseOf,run,markGame,fetchLichess,fetchChesscom,evalsFor,yearlyOf,drillSets,removeSet,addFile,bench,DEPTH,
  restore,live,findBlunderChecks,bcCandidates,BCMAX,get blunderChecks(){ return LASTBC },
  get files(){ return FILES },
  setFile(text,name){ FILES=[]; addFile(text,name||'file.pgn'); renderFiles() },
  addFiles(list){ for(const [text,name] of list) addFile(text,name); renderFiles() },
  clearFiles(){ FILES=[]; renderFiles() },
  rerender(){ if(LASTR) renderReport(...LASTR) },
  stop(){ stopReq=true },get running(){return running}};
})();
