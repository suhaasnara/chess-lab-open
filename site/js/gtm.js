/* Chess Lab Open — Guess the move: instructive games played from the winner's side.
   Scoring data is precomputed (MultiPV 3, depth 14, the private kit's rule):
   2 pts = key move, 1 = other, 0 = forced; a guess within 0.1 winning chances of the
   game move ("alts", or judged live by Stockfish) counts as "just as good" (1 pt).
   Theory plies auto-play. First answer keeps its score.
   Your own games: paste or upload a PGN (notes in braces, side lines in brackets, move marks and Lichess arrows kept);
   they stay in this browser, every guess after the opening is worth 1 point, and Stockfish judges other moves live. */
'use strict';
(function(){
let board=null, INDEX=null, endbar=null;
const S={src:null,game:null,g:null,ply:0,pts:0,got:0,missed:0,alsoGood:0,done:false,busy:false,hintStage:0,rows:[],answered:false,view:null,read:false};
/* view: the ply shown while reading the finished game (null = the live game); read: "Show the game" (no guessing, no score) */

function results(){ return Store.get('gtm-results')||{} }
function saveResult(){ const r=results(); r[S.game.id]={pts:S.pts,max:S.game.maxpts,t:Date.now()}; Store.put('gtm-results',r) }

/* The lobby (shared screens: Chess Lab's Guess-the-move start page): where the games come from | the list */
function sources(){
  const rows=INDEX||[], own=ownGames().map(o=>({id:o.game.id,own:o.game.id,title:o.title,meta:o.meta}));
  return [['own','Your own PGN','Games you add, with your notes',own],['mine','Suhaas’s games','The author’s own games, annotated',rows.filter(e=>e.set!=='masters')],
    ['masters','Master games','Famous games from the Lichess broadcasts',rows.filter(e=>e.set==='masters')]];
}
function renderList(){
  const src=sources(), res=results();
  if(!S.src||!src.some(x=>x[0]===S.src)) S.src=src[0][3].length?'own':'mine';
  $('g-src').innerHTML=src.map(([k,l,sub,list])=>`<label class="gmopt${S.src===k?' on':''}"><input type="radio" name="g-src" value="${k}" ${S.src===k?'checked':''}><span><b>${esc(l)}</b><span class="note">${esc(sub)} · ${list.length}</span></span></label>`).join('');
  const list=src.find(x=>x[0]===S.src)[3], played=list.filter(e=>res[e.id]).length;
  $('g-count').textContent=`${Help.n(list.length,'game')} · ${played} played`;
  $('g-add').hidden=S.src!=='own';
  $('g-srcnote').textContent=S.src==='own'?(list.length?'Your games stay in this browser.':'Add a game: paste a PGN with your notes, side lines and arrows, and guess your way through it.'):'';
  const yr=e=>(String(e.title+' '+e.meta).match(/\b(1[89]\d\d|20\d\d)\b/)||[])[1];
  const nxt=list.find(e=>!res[e.id]);
  $('g-start').disabled=!list.length; $('g-start').textContent=nxt?'Start · next unplayed':'Start · first game';
  $('g-list').innerHTML=list.map(e=>{ const r=res[e.id];
    return `<button type="button" class="drill" data-id="${esc(e.id)}" aria-current="${!!(S.game&&S.game.id===e.id)}"><span class="evalchip mono">${r?r.pts+'/'+r.max:(yr(e)||'—')}</span><span><div class="opp">${esc(e.title)}</div><div class="meta">${esc(e.meta)}</div></span>`+
      (e.own?`<span class="evalchip gdel" role="button" tabindex="0" data-del="${esc(e.own)}" title="Remove this game" aria-label="Remove ${esc(e.title)}">✕</span>`:'<span></span>')+'</button>' }).join('')
    ||`<p class="note">${S.src==='own'?'No games of yours yet.':INDEX?'No games here.':'Loading the games…'}</p>`;
}
function entry(id){ const own=ownGame(id); if(own) return own; const e=(INDEX||[]).find(x=>x.id===id); return e?e.file:null }
function showTrain(on){ $('g-lobby').hidden=on; $('g-train').hidden=!on }
function lobby(){ S.gen=(S.gen||0)+1; S.game=null; if(endbar) endbar.hide(); showTrain(false); renderList(); scrollTo(0,0) }

async function load(file){
  const game=typeof file==='object'&&file?deep(file):await fetch(Site.url('gtm',file)).then(r=>r.json()).catch(()=>null);
  if(!game){ status('bad','Could not load the game.',''); return }
  if(endbar) endbar.hide();
  S.game=game; S.g=new Chess(game.fen||undefined); S.ply=0; S.pts=0; S.got=0; S.missed=0; S.alsoGood=0; S.done=false; S.busy=false; S.hintStage=0; S.rows=[]; S.view=null; S.vr=null; S.read=false; S.gen=(S.gen||0)+1;
  readTools(); showTrain(true);
  const me=game.winner;
  $('g-head').innerHTML=TV.head({kicker:game.own?'Your game':(INDEX||[]).some(e=>e.id===game.id&&e.set==='masters')?'Master game':'Suhaas’s game',
    title:`${esc(game.white)} – ${esc(game.black)}`,chips:[esc([game.event,game.date].filter(Boolean).join(' · ')),game.opening?esc(game.opening[1]):'',esc(game.result),`You play ${me==='w'?'White':'Black'}`]});
  $('g-graphcard').hidden=true; $('g-tablewrap').hidden=true;
  board.set(S.g,{orient:me,last:null});
  $('g-facts').innerHTML=`<dt>White</dt><dd>${esc(game.white)}${game.we?' ('+esc(game.we)+')':''}</dd>
    <dt>Black</dt><dd>${esc(game.black)}${game.be?' ('+esc(game.be)+')':''}</dd>
    <dt>Event</dt><dd>${esc(game.event||'—')} · ${esc(game.date)}</dd>
    <dt>Opening</dt><dd>${game.opening?esc(game.opening[1])+' <span class="note">('+esc(game.opening[0])+')</span>':'—'}</dd>
    <dt>Result</dt><dd>${esc(game.result)}</dd>${game.own?'<dt>Scoring</dt><dd>1 point a move after the opening; Stockfish judges other moves</dd>':''}`;
  status('','Loading the opening…',`You play ${game.own?'':'the winner’s side '}(${me==='w'?'White':'Black'}). The first ${game.theory} plies are known theory and play themselves.`);
  renderList(); renderScore(); renderMoves();
  playTheory();
}
function playTheory(){
  const g=S.game;
  const gen=S.gen;
  const step=()=>{
    if(gen!==S.gen||S.read) return;
    if(S.ply<g.theory){ applyMove(g.moves[S.ply],'book'); S.ply++; setTimeout(step,340); return }
    next();
  };
  setTimeout(step,400);
}
function applyMove(san,who){
  const m=S.g.move(san);
  if(m) board.set(S.g,{last:{from:m.from,to:m.to},orient:board.orient});
  setTimeout(renderMoves,0);
  return m;
}
/* advance to the next decision: opponent moves auto-play; the winner's move waits for a guess */
function next(){
  const g=S.game;
  if(S.read||S.done) return;
  if(S.ply>=g.moves.length) return endGame();
  const mover=S.ply%2===0?'w':'b';
  if(mover!==g.winner){ const gen=S.gen; setTimeout(()=>{ if(gen!==S.gen||S.read) return; applyMove(g.moves[S.ply],'opp'); S.ply++; next() },520); return }
  S.answered=false; S.hintStage=0;
  const n=Math.floor(S.ply/2)+1;
  status('',`Move ${n}: your move.`,'Guess what was played.');
}
async function userMove(from,to,promo){
  const g=S.game;
  if(!g||S.done||S.busy||S.read) return;
  const mover=S.ply%2===0?'w':'b';
  if(mover!==g.winner) return;
  const test=new Chess(S.g.fen()); const m=test.move({from,to,promotion:promo||'q'}); if(!m) return;
  const uci=from+to+(m.promotion||'');
  const info=g.m[String(S.ply)]||{pts:1,alts:[]};
  const played=S.g.fen(); /* position before */
  const gameMove=new Chess(S.g.fen()).move(g.moves[S.ply]);
  const gameUci=gameMove.from+gameMove.to+(gameMove.promotion||'');
  S.busy=true;
  let verdict, earned=0;
  if(uci.slice(0,4)===gameUci.slice(0,4)){
    earned=info.pts; S.got++;
    verdict=['good',`${m.san} — the game move${info.pts===2?' (key move, 2 points)':info.pts===0?' (forced)':''}.`];
  }else if((info.alts||[]).some(u=>u.slice(0,4)===uci.slice(0,4))){
    earned=Math.min(1,info.pts||1); S.alsoGood++;
    verdict=['good',`${m.san} is just as good — the game went ${esc(g.moves[S.ply])}.`];
  }else if((info.ev!=null||info.live)&&!SharedEngine.failed){
    status('','Checking your idea…','');
    const cpAfter=async f=>{ const a=await SharedEngine.analyse(f,12,1,8000).catch(()=>null); return a&&a.length?-(a[0].mate!=null?(a[0].mate>0?9900:-9900):Math.round(a[0].cp*100)):null };
    const t2=new Chess(S.g.fen()); t2.move(g.moves[S.ply]);
    const gev=info.ev!=null?info.ev:(t2.in_checkmate()?9900:await cpAfter(t2.fen()));
    const mineCp=test.in_checkmate()?9900:await cpAfter(test.fen());
    if(gev!=null&&mineCp!=null){
      const drop=wc(gev/100)-wc(mineCp/100);   /* wc takes pawns; ev is stored in centipawns */
      if(drop<=0.1){ earned=Math.min(1,info.pts||1); S.alsoGood++; verdict=['good',`${m.san} is about as good — the game went ${esc(g.moves[S.ply])}.`] }
      else{ S.missed++; verdict=['warn',`${m.san} is weaker. The game went ${esc(g.moves[S.ply])}.`] }
    }else{ S.missed++; verdict=['warn',`The game went ${esc(g.moves[S.ply])}.`] }
  }else{ S.missed++; verdict=['warn',`The game went ${esc(g.moves[S.ply])}.`] }
  S.pts+=earned;
  S.rows.push({ply:S.ply,n:Math.floor(S.ply/2)+1,game:g.moves[S.ply],guess:m.san,earned,max:info.pts});
  /* the game move is what stays on the board */
  applyMove(g.moves[S.ply],'me'); S.ply++;
  board.flash([gameMove.from,gameMove.to],earned>0?'good':'bad');
  status(verdict[0],verdict[1],`+${earned} · ${S.pts} points so far`);
  renderScore();
  S.busy=false;
  setTimeout(next,900);
}
function hint(){
  const g=S.game;
  if(!g||S.done||S.busy||S.read) return;
  const mover=S.ply%2===0?'w':'b'; if(mover!==g.winner) return;
  const gm=new Chess(S.g.fen()).move(g.moves[S.ply]); if(!gm) return;
  if(S.hintStage===0){ S.hintStage=1; board.setHint(gm.from); status('warn','Hint: this piece moves.','H again shows the move — then it earns nothing.') }
  else{
    board.setHint(gm.from,gm.to); status('warn','It was '+g.moves[S.ply]+'.','No points for this one.');
    S.missed++; S.rows.push({ply:S.ply,n:Math.floor(S.ply/2)+1,game:g.moves[S.ply],guess:'(shown)',earned:0,max:(g.m[String(S.ply)]||{}).pts||1});
    applyMove(g.moves[S.ply],'me'); S.ply++; renderScore(); setTimeout(next,900);
  }
}
function endGame(){
  S.done=true; saveResult();
  const g=S.game;
  const pct=g.maxpts?S.pts/g.maxpts:0;
  endbar.show(pct>=0.8?'good':pct>=0.5?'warn':'bad',`Game over · ${S.pts} of ${g.maxpts} points (${Math.round(pct*100)}%)`,'Next game');
  status('good',`Game over: ${g.result}. ${S.pts} of ${g.maxpts} points.`,
    `${S.got} matched · ${S.alsoGood} just as good · ${S.missed} missed.`);
  const t=$('g-table');
  t.innerHTML='<tr><th>#</th><th>Game</th><th>You</th><th>Pts</th></tr>'+
    S.rows.map(r=>`<tr><td>${r.n}</td><td>${esc(r.game)}</td><td>${esc(r.guess)}</td><td>${r.earned}/${r.max}</td></tr>`).join('');
  $('g-tablewrap').hidden=false;
  drawGraph(); if(g.own&&!(g.evs||[]).length) ownEvals(g);
  renderList();
  S.view=g.moves.length; readTools(); renderMoves();
}
/* Eval graph, shown after the game so it can't give moves away.
   y = winning chances from White's side (the kit's -1..1 scale), x = ply.
   Dots mark the winner's moves after theory: green = full points, amber = partial, red = missed. */
function drawGraph(){
  const g=S.game, ev=g.evs||[]; if(!ev.length) return;
  const W=320,H=140,P=6, n=ev.length;
  const X=i=>P+(W-2*P)*(n>1?i/(n-1):0), Y=v=>H/2-(H/2-P)*v;
  const c=i=>wc((ev[i]||0)/100);
  const pts=ev.map((_,i)=>[X(i),Y(c(i))]);
  const line=pts.map((p,i)=>(i?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1)).join(' ');
  const area=`M${X(0)} ${H/2} `+pts.map(p=>'L'+p[0].toFixed(1)+' '+p[1].toFixed(1)).join(' ')+` L${X(n-1)} ${H/2} Z`;
  const pawns=cp=>Math.abs(cp)>=9000?(cp>0?'#M':'-#M'):(cp>=0?'+':'')+(cp/100).toFixed(2);
  const byPly={}; for(const r of S.rows) byPly[r.ply]=r;
  let dots='';
  for(const k in byPly){
    const r=byPly[k], i=+k; if(i>=n) continue;
    const col=r.earned>=r.max&&r.max>0?'var(--good)':r.earned>0?'var(--warn)':(r.max===0?'var(--muted)':'var(--bad)');
    dots+=`<circle cx="${X(i).toFixed(1)}" cy="${Y(c(i)).toFixed(1)}" r="${r.max===2?4.2:3}" fill="${col}" stroke="var(--white)" stroke-width="1"><title>${r.n}${i%2?'…':'.'}${esc(r.game)} (${pawns(ev[i])}) — you: ${esc(r.guess)}, ${r.earned}/${r.max}</title></circle>`;
  }
  const th=g.theory>0?`<rect x="${P}" y="${P}" width="${Math.max(0,X(g.theory-1)-P).toFixed(1)}" height="${H-2*P}" fill="var(--band)"/>`:'';
  $('g-graph').innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Evaluation through the game, White's side">
    <rect x="0" y="0" width="${W}" height="${H}" fill="var(--white)"/>${th}
    <path d="${area}" fill="var(--callout)"/>
    <line x1="${P}" y1="${H/2}" x2="${W-P}" y2="${H/2}" stroke="var(--line)" stroke-width="1"/>
    <path d="${line}" fill="none" stroke="var(--chart)" stroke-width="1.6" vector-effect="non-scaling-stroke"/>
    ${dots}</svg>`;
  const fin=ev.filter(v=>Math.abs(v)<9000), lo=fin.length?Math.min(...fin):0, hi=fin.length?Math.max(...fin):0;
  $('g-graphnote').textContent=`Above the line favours White, below favours Black (engine, depth 20+). Range ${pawns(lo)} to ${pawns(hi)}. Shaded: theory. Dots: your guesses (green full points, amber partial, red missed; bigger = key move).`;
  $('g-graphcard').hidden=false;
}
/* The game so far (never past the current move): your moves marked ✓ (game move) / ≈ (just as good) / ✗ (missed), "book" for theory.
   Annotated games (game.notes {ply: {t: text, v: [side lines]}}, game.intro) show each move's note right after it, side lines
   folded. Once the game is over (or "Show the game"), every move can be clicked, and ← → Home End step through it. */
/* side lines: each move a button (shared/varline.js), played from the position before the move it replaces (fen) */
let NAV=null;   // the arrow keys through the lines (set up with the keys)
function noteHtml(n,fen,prefix){
  if(!n) return '';
  const v=(n.v||[]).map(x=>VarLine.wrap(fen,x,prefix)).join('');
  return `<div class="gnote">${n.t?`<p>${esc(n.t)}</p>`:''}${v}</div>`;
}
function renderMoves(){
  const el=$('g-moves'); if(!el) return;
  const g=S.game; if(!g){ el.innerHTML=''; return }
  const byPly={}; for(const r of S.rows) byPly[r.ply]=r;
  const notes=g.notes||{}, upto=S.done?g.moves.length:S.ply, cur=S.vr?-2:S.view==null?upto-1:S.view-1;
  const vg=new Chess(g.fen||undefined), vfen=[]; for(let i=0;i<upto;i++){ vfen.push(vg.fen()); vg.move(g.moves[i],{sloppy:true}) }
  let html=g.intro?`<div class="gnote gintro"><p>${esc(g.intro)}</p></div>`:'';
  for(let i=0;i<upto;i++){
    if(i%2===0||notes[i-1]) html+=`<span class="note">${Math.floor(i/2)+1}${i%2?'…':'.'}</span> `;
    const r=byPly[i], mine=(i%2===0?'w':'b')===g.winner;
    let mark='', cls='';
    if(i<g.theory) mark=mine&&!S.read?' <span class="note">book</span>':'';
    else if(r){ if(r.guess===g.moves[i]){ mark=' ✓'; cls='ok' } else if(r.earned>0){ mark=' ≈'; cls='inacc' } else { mark=' ✗'; cls='miss' } }
    const tag=S.done?'button':'b';
    const mk=notes[i]&&notes[i].mk?markHtml(notes[i].mk):'';
    html+=`<${tag} class="gmv ${cls}${i===cur&&S.done?' cur':''}" data-ply="${i+1}"${S.done?' type="button"':''} title="${r&&r.guess!==g.moves[i]?'you: '+esc(r.guess):''}">${esc(g.moves[i])}${mk}</${tag}>${mark} `;
    if(notes[i]&&(notes[i].t||(notes[i].v||[]).length)) html+=noteHtml(notes[i],vfen[i],g.moves.slice(0,i));
  }
  el.innerHTML=html||'<span class="note">The moves appear as the game goes.</span>';
  el.classList.toggle('vread',!!S.done);
  if(NAV) NAV.paint();
  const vc=S.vr?VarLine.mark(el,S.vr.path.slice(0,S.vr.at)):null;
  if(vc){ const top=vc.offsetTop; if(top<el.scrollTop||top>el.scrollTop+el.clientHeight-30) el.scrollTop=top-40; return }
  const c=el.querySelector('.gmv.cur');
  if(c&&S.done){   // keep the current move (and its note) in view inside the panel, without scrolling the page
    const n=c.nextElementSibling&&c.nextElementSibling.classList.contains('gnote')?c.nextElementSibling:c;
    const top=c.offsetTop, bot=n.offsetTop+n.offsetHeight;   // .gmoves is position:relative, so offsets are inside the panel
    if(top<el.scrollTop) el.scrollTop=top-6; else if(bot>el.scrollTop+el.clientHeight) el.scrollTop=Math.min(top-6,bot-el.clientHeight+6) }
  else el.scrollTop=el.scrollHeight;
}
/* reading a finished game: show the position after `ply` plies */
function viewAt(ply){
  const g=S.game; if(!g||!S.done) return;
  ply=Math.max(0,Math.min(g.moves.length,ply)); S.view=ply; S.vr=null;
  const c=new Chess(g.fen||undefined); let m=null; for(let i=0;i<ply;i++) m=c.move(g.moves[i]);
  board.set(c,{last:m?{from:m.from,to:m.to}:null,orient:board.orient,locked:true});
  Shapes.auto($('g-board'),ply>0&&g.notes&&g.notes[ply-1]&&g.notes[ply-1].sh||'');   /* the note's own arrows, when reading */
  readSlot();
  renderMoves(); readTools();
}
/* reading a finished game: a side line from the notes on the board (path = SAN from the start; k = the move it replaces);
   ← → step along it, back past its first move returns to the game */
function viewVar(path,at){
  const g=S.game; if(!g||!S.done||!path) return;
  let k=0; while(k<path.length&&k<g.moves.length&&g.moves[k]===path[k]) k++;
  if(k===path.length){ viewAt(k); return }
  at=Math.max(k,Math.min(path.length,at)); if(at===k){ viewAt(k); return }
  S.vr={path,at,k}; S.view=k;
  const c=new Chess(g.fen||undefined); let m=null; for(let i=0;i<at;i++){ m=c.move(path[i],{sloppy:true}); if(!m) break }
  board.set(c,{last:m?{from:m.from,to:m.to}:null,orient:board.orient,locked:true});
  Shapes.auto($('g-board'),'');
  renderMoves(); readTools();
}
function readTools(){
  const on=!!(S.game&&S.done), g=S.game;
  $('g-nav').hidden=!on;
  $('g-show').hidden=!S.game||S.done;
  $('g-hint').hidden=on;
  if(on){ $('g-prev').disabled=!S.vr&&S.view<=0; $('g-next').disabled=S.vr?S.vr.at>=S.vr.path.length:S.view>=g.moves.length }
}
/* "Show the game": skip the guessing and read the annotated game from the start (no score is saved) */
function showGame(){
  const g=S.game; if(!g||S.done) return;
  S.gen++; S.read=true; S.done=true; S.busy=false;
  if(endbar) endbar.hide();
  status('','Reading the game.',`← → (or the arrows under the board) step through the moves${g.notes&&Object.keys(g.notes).length?' and the notes':''}. No score is kept; Restart game plays it as a quiz.`);
  drawGraph(); renderScore(); viewAt(0);
}
function renderScore(){
  $('g-score').innerHTML=S.game&&!S.read?`<b>${S.pts}</b><span class="note"> / ${S.game.maxpts} points</span>`:'';
  $('g-score').hidden=!S.game||S.read;
}
function status(tone,head,rest){ const el=$('g-status'); el.className='status'+(tone?' '+tone:''); el.innerHTML=`<strong>${esc(head)}</strong>${rest||''}` }

function init(){
  board=makeBoard($('g-board'),{onMove:userMove});
  endbar=endBanner($('g-board'),()=>{ const i=(INDEX||[]).findIndex(e=>S.game&&e.id===S.game.id); const e=INDEX[(i+1)%INDEX.length]; if(e) load(e.file) },'Next game');
  board.set(new Chess(),{locked:true});
  fetch(Site.url('gtmIndex')).then(r=>r.json()).then(j=>{ INDEX=j; renderList() }).catch(()=>{ INDEX=[]; renderList() });
  $('g-src').addEventListener('change',e=>{ if(e.target.name==='g-src'){ S.src=e.target.value; renderList() } });
  $('g-list').addEventListener('click',ev=>{ const d=ev.target.closest('[data-del]'); if(d){ ev.stopPropagation(); removeOwn(d.dataset.del); return }
    const b=ev.target.closest('.drill[data-id]'); if(b){ const f=entry(b.dataset.id); if(f) load(f) } });
  $('g-add').addEventListener('click',openAdd);
  $('g-start').addEventListener('click',()=>{ const res=results(), list=sources().find(x=>x[0]===S.src)[3]; const e=list.find(x=>!res[x.id])||list[0]; if(e) load(e.own?ownGame(e.own):e.file) });
  $('g-back').addEventListener('click',lobby);
  TV.fitBoard('#g-wrap','#g-tools');
  $('g-hint').addEventListener('click',hint);
  $('g-flip').addEventListener('click',()=>board.flip());
  $('g-restart').addEventListener('click',()=>{ if(!S.game) return; if(S.game.own) load(ownGame(S.game.id)); else load(INDEX.find(e=>e.id===S.game.id).file) });
  $('g-addsave').addEventListener('click',addGames);
  $('g-addcancel').addEventListener('click',()=>{ $('g-addmodal').hidden=true });
  $('g-addmodal').addEventListener('click',e=>{ if(e.target.id==='g-addmodal') $('g-addmodal').hidden=true });
  $('g-addfile').addEventListener('change',async e=>{ const f=e.target.files&&e.target.files[0]; if(!f) return;
    if(f.size>3e6){ $('g-adderr').textContent='That file is over 3 MB. Paste the games you want instead.'; return }
    $('g-addbox').value=await f.text(); $('g-adderr').textContent=`Read ${f.name}. Pick the side, then Add.`; e.target.value='' });
  $('g-show').addEventListener('click',showGame);
  $('g-prev').addEventListener('click',()=>S.vr?viewVar(S.vr.path,S.vr.at-1):viewAt(S.view-1));
  $('g-next').addEventListener('click',()=>S.vr?viewVar(S.vr.path,S.vr.at+1):viewAt(S.view+1));
  $('g-moves').addEventListener('click',e=>{ const vp=VarLine.path(e.target); if(vp){ if(S.done) viewVar(vp,vp.length); return }
    const b=e.target.closest('.gmv'); if(b&&S.done) viewAt(+b.dataset.ply) });
  const done=()=>S.done&&S.game;
  /* ← → along the game or the side line on the board, ↓ ↑ pick the line where lines branch (shared VarLine.nav) */
  NAV=VarLine.nav({active:done,root:()=>$('g-moves'),main:()=>S.game.moves,
    cur:()=>S.vr?S.vr.path.slice(0,S.vr.at):S.game.moves.slice(0,S.view==null?S.game.moves.length:S.view),
    go:p=>viewVar(p,p.length),mainEl:i=>$('g-moves').querySelector(`.gmv[data-ply="${i+1}"]`),
    left:()=>viewAt(S.view-1),right:()=>viewAt(S.view+1),
    leftLabel:'Back through the game (after it ends)',rightLabel:'Forward (the picked line where lines branch)'});
  Keys.on('guess',Object.assign({},NAV.keys,{
    Home:['Start of the game',()=>{ if(!done()) return false; viewAt(0) }], End:['End of the game',()=>{ if(!done()) return false; viewAt(S.game.moves.length) }],
    h:['Hint',()=>hint()], f:['Flip the board',()=>board.flip()]}));
}
/* ---------- Your own games ---------- */
function ownGames(){ return Store.get('gtm-own')||[] }
function ownGame(id){ const o=ownGames().find(x=>x.game.id===id); return o?o.game:null }
function removeOwn(id){ if(!confirm('Remove this game from this browser?')) return; Store.put('gtm-own',ownGames().filter(x=>x.game.id!==id));
  const r=results(); delete r[id]; Store.put('gtm-results',r); renderList() }
function openAdd(){ $('g-addmodal').hidden=false; $('g-adderr').textContent=''; $('g-addbox').focus() }
/* A PGN (one or more games) -> Guess-the-move games: the main line's moves; each move's comment, side lines (as text),
   move marks ($1, !, ?, ⩲ ...) and Lichess arrows ([%cal]/[%csl]); a comment before the first move is the intro. */
/* the mobile reader (shared/reader.js): the game with its notes and side lines, once it is being read */
function readerLines(g){ return g.moves.map((san,i)=>{ const n=(g.notes&&g.notes[i])||{};   // side lines as written (the reader shows them inline)
  return {san,note:n.t,marks:n.mk,shapes:n.sh,vtext:n.v||[]} }) }
function readSlot(){ const slot=$('g-readslot'); if(!slot) return; slot.innerHTML=''; if(!S.game||!(S.done||S.read)) return;
  slot.appendChild(Reader.button(()=>Reader.open({title:`${S.game.white} – ${S.game.black}`,chapter:S.game.event||'',fen:S.game.fen||undefined,orient:board.orient,lines:readerLines(S.game),at:S.view==null?S.game.moves.length:S.view}))) }
function parseGames(text){
  const out=[]; const re=/\[\s*(\w+)\s+"((?:[^"\\]|\\.)*)"\s*\]|\{[^}]*\}|;[^\n]*|\(|\)|\$\d+|[^\s(){}[\];]+/g;
  const src=String(text).replace(/^\uFEFF/,'').replace(/\r/g,'');
  let cur=null, depth=0, vbuf=[], m;
  const fresh=()=>({h:{},moves:[],notes:{},intro:'',g:null,bad:false});
  const note=i=>cur.notes[i]||(cur.notes[i]={});
  const finish=()=>{ if(cur&&cur.moves.length) out.push(cur); cur=null; depth=0 };
  while((m=re.exec(src))){
    const t=m[0];
    if(m[1]){ if(cur&&cur.moves.length) finish(); if(!cur) cur=fresh(); cur.h[m[1]]=m[2]; continue }
    if(!cur) cur=fresh();
    if(depth>0){ if(t==='(') depth++; else if(t===')') depth--;
      if(depth===0){ const txt=vbuf.join(' ').replace(/\s+/g,' ').replace(/\(\s+/g,'(').replace(/\s+\)/g,')').trim(); vbuf=[]; if(txt&&cur.moves.length){ const n=note(cur.moves.length-1); (n.v=n.v||[]).push(txt) } }
      else if(t[0]==='{'){ const c=cleanNote(t.slice(1,-1)); if(c) vbuf.push('{'+c+'}') }
      else if(t[0]==='$'){ const k=NAGS[+t.slice(1)]; if(k) vbuf.push(k) }
      else if(t[0]!==';') vbuf.push(t);
      continue }
    if(t==='('){ depth=1; vbuf=[]; continue }
    if(t===')') continue;
    if(/^(1-0|0-1|1\/2-1\/2|\*)$/.test(t)){ cur.h.Result=cur.h.Result||t; finish(); continue }
    if(!cur.g){ let fen=cur.h.FEN; let ok=false; if(fen){ try{ ok=new Chess().validate_fen(fen).valid }catch(e){} } cur.g=ok?new Chess(fen):new Chess(); cur.fen=ok?fen:null }
    if(t[0]==='{'){ const c=cleanNote(t.slice(1,-1)), sh=pgnShapes(t);
      if(!cur.moves.length){ if(c) cur.intro=cur.intro?cur.intro+' '+c:c }
      else { const n=note(cur.moves.length-1); if(c) n.t=n.t?n.t+'\n\n'+c:c; if(sh) n.sh=n.sh?n.sh+' '+sh:sh }
      continue }
    if(t[0]==='$'){ const k=NAGS[+t.slice(1)]; if(k&&cur.moves.length){ const n=note(cur.moves.length-1); n.mk=(n.mk||'')+k } continue }
    if(t[0]===';'||cur.bad) continue;
    const mk=(t.match(/[!?]+$/)||[''])[0];
    const san=t.replace(/^\d+\.+/,'').replace(/^\.+/,'').replace(/[!?]+$/,'').replace(/^0-0-0/,'O-O-O').replace(/^0-0/,'O-O');
    if(!san||/^\d+$/.test(san)) continue;
    const r=cur.g.move(san,{sloppy:true}); if(!r){ cur.bad=true; continue }
    cur.moves.push(r.san); if(mk){ const n=note(cur.moves.length-1); n.mk=(n.mk||'')+mk }
  }
  finish();
  return out;
}
const fnv=s=>{ let h=2166136261; for(const c of s) h=Math.imul(h^c.charCodeAt(0),16777619); return (h>>>0).toString(36) };
async function addGames(){
  const err=$('g-adderr'), txt=$('g-addbox').value; let list;
  try{ list=parseGames(txt) }catch(e){ list=[] }
  if(!list.length){ err.textContent='No moves found. Paste a PGN: 1. e4 e5 2. Nf3 {a note} Nc6 …'; return }
  const want=$('g-addside').value, own=ownGames(); let added=0, skipped=0, last=null;
  for(const p of list){
    const h=p.h, res=h.Result||'*';
    const side=want==='white'?'w':want==='black'?'b':res==='1-0'?'w':res==='0-1'?'b':'w';
    const id='u-'+fnv((h.White||'')+'|'+(h.Black||'')+'|'+(h.Date||'')+'|'+p.moves.join(' ')+'|'+side);
    if(own.some(x=>x.game.id===id)){ skipped++; continue }
    /* theory: the leading plies the elite book (or the named lines) knows, at most 16 */
    let theory=0; const g=new Chess(p.fen||undefined), fens=[g.fen()];
    for(let i=0;i<p.moves.length&&i<16;i++){ const fen=g.fen(); const bk=await Book.moves(fen,'masters').catch(()=>null); const mv=new Chess(fen).move(p.moves[i]);
      const row=bk&&mv&&bk.rows.find(r=>r.uci.slice(0,4)===mv.from+mv.to); if(row&&(bk.demo||(bk.total>=50&&row.share>=0.05))&&!p.notes[i-1]){ theory++; g.move(p.moves[i]); fens.push(g.fen()) } else break }
    const mm={}; const c=new Chess(p.fen||undefined);
    p.moves.forEach((san,i)=>{ const mover=c.turn(); if(i>=theory&&mover===side) mm[String(i)]={pts:c.moves().length>1?1:0,live:true,alts:[]}; c.move(san) });
    const name=v=>String(v||'?').replace(/,\s*/,', ');
    const opening=p.fen?null:Book.nameOf((()=>{ const x=new Chess(), f=[]; for(const s of p.moves.slice(0,20)){ x.move(s); f.push(x.fen()) } return f })());
    const notes={}; for(const k in p.notes){ const n=p.notes[k]; if(n.t||n.v||n.mk||n.sh) notes[k]=n }
    const game={id,own:true,white:name(h.White),black:name(h.Black),we:h.WhiteElo||'',be:h.BlackElo||'',date:h.Date||'',event:h.Event&&h.Event!=='?'?h.Event:'',result:res,winner:side,
      opening:opening||null,theory,moves:p.moves,fen:p.fen||undefined,evs:[],m:mm,maxpts:Object.values(mm).reduce((a,x)=>a+x.pts,0),notes,intro:p.intro||undefined};
    const last2=s=>String(s).split(',')[0].trim();
    own.push({title:`${last2(game.white)} – ${last2(game.black)}${game.date&&/^\d{4}/.test(game.date)?', '+game.date.slice(0,4):''}`,meta:`${opening?opening[1]+' · ':''}${res} · you play ${side==='w'?'White':'Black'}${Object.keys(notes).length?' · '+Object.keys(notes).length+' notes':''}`,game});
    added++; last=game;
  }
  Store.put('gtm-own',own);
  if(added&&!Store.get('gtm-own')){ err.textContent='This browser has no room left to store those games.'; return }
  err.textContent=added?'':skipped?'Those games are already in your list.':'';
  if(added){ $('g-addmodal').hidden=true; $('g-addbox').value=''; S.src='own'; renderList(); load(last) }
}
/* evals for the graph of your own game, after you finish it (depth 10, White's side; stored with the game) */
async function ownEvals(g){
  if(SharedEngine.failed) return; const c=new Chess(g.fen||undefined), evs=[];
  for(const san of g.moves){ c.move(san);
    if(c.in_checkmate()){ evs.push(c.turn()==='b'?9900:-9900); continue } if(c.game_over()){ evs.push(0); continue }
    const a=await SharedEngine.analyse(c.fen(),10,1,3000).catch(()=>null); if(!a||!a.length) return;
    const cp=a[0].mate!=null?(a[0].mate>0?9900:-9900):Math.round(a[0].cp*100); evs.push(c.turn()==='w'?cp:-cp) }
  const own=ownGames(), o=own.find(x=>x.game.id===g.id); if(o){ o.game.evs=evs; Store.put('gtm-own',own) }
  if(S.game&&S.game.id===g.id){ S.game.evs=evs; drawGraph() }
}
window.GtmTab={init,load,lobby,userMove,hint,drawGraph,showGame,viewAt,parseGames,addGames,ownGames,get state(){return S}};
})();
