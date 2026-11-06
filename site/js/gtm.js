/* Chess Lab Open — Guess the move: instructive games played from the winner's side.
   Scoring data is precomputed (MultiPV 3, depth 14, the private kit's rule):
   2 pts = key move, 1 = other, 0 = forced; a guess within 0.1 winning chances of the
   game move ("alts", or judged live by Stockfish) counts as "just as good" (1 pt).
   Theory plies auto-play. First answer keeps its score. */
'use strict';
(function(){
let board=null, INDEX=null;
const S={game:null,g:null,ply:0,pts:0,got:0,missed:0,alsoGood:0,done:false,busy:false,hintStage:0,rows:[],answered:false};

function results(){ return Store.get('gtm-results')||{} }
function saveResult(){ const r=results(); r[S.game.id]={pts:S.pts,max:S.game.maxpts,t:Date.now()}; Store.put('gtm-results',r) }

function renderList(){
  const el=$('g-list'); el.innerHTML='';
  const res=results();
  for(const e of INDEX||[]){
    const r=res[e.id];
    const b=document.createElement('button'); b.className='drill';
    b.setAttribute('aria-current',S.game&&S.game.id===e.id?'true':'false');
    b.innerHTML=`<span class="src">${r?r.pts+'/'+r.max:''}</span><span><span class="opp">${esc(e.title)}</span><br><span class="meta">${esc(e.meta)}</span></span><span class="evalchip">&#9654;</span>`;
    b.addEventListener('click',()=>load(e.file));
    el.appendChild(b);
  }
  if(!el.children.length) el.innerHTML='<p class="empty">No games yet.</p>';
}

async function load(file){
  const game=await fetch('data/gtm/'+file).then(r=>r.json()).catch(()=>null);
  if(!game){ status('bad','Could not load the game.',''); return }
  S.game=game; S.g=new Chess(); S.ply=0; S.pts=0; S.got=0; S.missed=0; S.alsoGood=0; S.done=false; S.busy=false; S.hintStage=0; S.rows=[];
  const me=game.winner;
  $('g-graphcard').hidden=true; $('g-tablewrap').hidden=true;
  board.set(S.g,{orient:me,last:null});
  $('g-facts').innerHTML=`<dt>White</dt><dd>${esc(game.white)}${game.we?' ('+esc(game.we)+')':''}</dd>
    <dt>Black</dt><dd>${esc(game.black)}${game.be?' ('+esc(game.be)+')':''}</dd>
    <dt>Event</dt><dd>${esc(game.event||'—')} · ${esc(game.date)}</dd>
    <dt>Opening</dt><dd>${game.opening?esc(game.opening[1])+' <span class="note">('+esc(game.opening[0])+')</span>':'—'}</dd>
    <dt>Result</dt><dd>${esc(game.result)}</dd>`;
  status('','Loading the opening…',`You play the winner’s side (${me==='w'?'White':'Black'}). The first ${game.theory} plies are known theory and play themselves.`);
  renderList(); renderScore(); renderMoves();
  playTheory();
}
function playTheory(){
  const g=S.game;
  const step=()=>{
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
  if(S.ply>=g.moves.length) return endGame();
  const mover=S.ply%2===0?'w':'b';
  if(mover!==g.winner){ setTimeout(()=>{ applyMove(g.moves[S.ply],'opp'); S.ply++; next() },520); return }
  S.answered=false; S.hintStage=0;
  const n=Math.floor(S.ply/2)+1;
  status('',`Move ${n}: your move.`,'Guess what was played.');
}
async function userMove(from,to,promo){
  const g=S.game;
  if(!g||S.done||S.busy) return;
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
  }else if(info.ev!=null&&!SharedEngine.failed){
    status('','Checking your idea…','');
    const a=await SharedEngine.analyse(test.fen(),12,1,8000).catch(()=>null);
    if(a&&a.length){
      const mineCp=-(a[0].mate!=null?(a[0].mate>0?9900:-9900):Math.round(a[0].cp*100));
      const drop=wc(info.ev/100)-wc(mineCp/100);   /* wc takes pawns; ev is stored in centipawns */
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
  if(!g||S.done||S.busy) return;
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
  status('good',`Game over: ${g.result}. ${S.pts} of ${g.maxpts} points.`,
    `${S.got} matched · ${S.alsoGood} just as good · ${S.missed} missed.`);
  const t=$('g-table');
  t.innerHTML='<tr><th>#</th><th>Game</th><th>You</th><th>Pts</th></tr>'+
    S.rows.map(r=>`<tr><td>${r.n}</td><td>${esc(r.game)}</td><td>${esc(r.guess)}</td><td>${r.earned}/${r.max}</td></tr>`).join('');
  $('g-tablewrap').hidden=false;
  drawGraph();
  renderList();
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
    dots+=`<circle cx="${X(i).toFixed(1)}" cy="${Y(c(i)).toFixed(1)}" r="${r.max===2?4.2:3}" fill="${col}" stroke="#fff" stroke-width="1"><title>${r.n}${i%2?'…':'.'}${esc(r.game)} (${pawns(ev[i])}) — you: ${esc(r.guess)}, ${r.earned}/${r.max}</title></circle>`;
  }
  const th=g.theory>0?`<rect x="${P}" y="${P}" width="${Math.max(0,X(g.theory-1)-P).toFixed(1)}" height="${H-2*P}" fill="var(--band)"/>`:'';
  $('g-graph').innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Evaluation through the game, White's side">
    <rect x="0" y="0" width="${W}" height="${H}" fill="var(--white)"/>${th}
    <path d="${area}" fill="var(--callout)"/>
    <line x1="${P}" y1="${H/2}" x2="${W-P}" y2="${H/2}" stroke="var(--line)" stroke-width="1"/>
    <path d="${line}" fill="none" stroke="var(--navy)" stroke-width="1.6" vector-effect="non-scaling-stroke"/>
    ${dots}</svg>`;
  const fin=ev.filter(v=>Math.abs(v)<9000), lo=fin.length?Math.min(...fin):0, hi=fin.length?Math.max(...fin):0;
  $('g-graphnote').textContent=`Above the line favours White, below favours Black (engine, depth 20+). Range ${pawns(lo)} to ${pawns(hi)}. Shaded: theory. Dots: your guesses (green full points, amber partial, red missed; bigger = key move).`;
  $('g-graphcard').hidden=false;
}
/* The game so far (never past the current move): your moves marked ✓ (game move) / ≈ (just as good) / ✗ (missed), "book" for theory. */
function renderMoves(){
  const el=$('g-moves'); if(!el) return;
  const g=S.game; if(!g){ el.innerHTML=''; return }
  const byPly={}; for(const r of S.rows) byPly[r.ply]=r;
  let html='';
  for(let i=0;i<S.ply;i++){
    if(i%2===0) html+=`<span class="note">${i/2+1}.</span> `;
    const r=byPly[i], mine=(i%2===0?'w':'b')===g.winner;
    let mark='', cls='';
    if(i<g.theory) mark=mine?' <span class="note">book</span>':'';
    else if(r){ if(r.guess===g.moves[i]){ mark=' ✓'; cls='ok' } else if(r.earned>0){ mark=' ≈'; cls='inacc' } else { mark=' ✗'; cls='miss' } }
    html+=`<b class="${cls}" title="${r&&r.guess!==g.moves[i]?'you: '+esc(r.guess):''}">${esc(g.moves[i])}</b>${mark} `;
  }
  el.innerHTML=html||'<span class="note">The moves appear as the game goes.</span>';
  el.scrollTop=el.scrollHeight;
}
function renderScore(){
  $('g-score').innerHTML=S.game?`<b>${S.pts}</b><span class="note"> / ${S.game.maxpts} points</span>`:'';
}
function status(tone,head,rest){ const el=$('g-status'); el.className='status'+(tone?' '+tone:''); el.innerHTML=`<strong>${esc(head)}</strong>${rest||''}` }

function init(){
  board=makeBoard($('g-board'),{onMove:userMove});
  board.set(new Chess(),{locked:true});
  fetch('data/gtm/index.json').then(r=>r.json()).then(j=>{ INDEX=j; renderList() }).catch(()=>{ INDEX=[]; renderList() });
  $('g-hint').addEventListener('click',hint);
  $('g-flip').addEventListener('click',()=>board.flip());
  $('g-restart').addEventListener('click',()=>{ if(S.game) load(INDEX.find(e=>e.id===S.game.id).file) });
  document.addEventListener('keydown',e=>{
    if(document.body.dataset.view!=='guess') return;
    if(/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if(e.key==='h'||e.key==='H') hint();
    if(e.key==='f'||e.key==='F') board.flip();
  });
}
window.GtmTab={init,load,userMove,hint,drawGraph,get state(){return S}};
})();
