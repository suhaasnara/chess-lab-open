/* Chess Lab Open — Endgames: textbook endings played out against perfect defence.
   Positions and goals: data/endgames.json (tools/endgame_positions.json, checked against the Lichess
   tablebase by tools/build_endgames.py, with a stored tree of best moves and replies).
   Every move you make is graded by the tablebase: best, still winning (slower), or throws the result.
   Order of sources: the stored tree, then the live Lichess tablebase API, then Stockfish (marked as such).
   Progress stays in this browser: solved positions come back after 3 / 7 / 21 days, misses the next day. */
'use strict';
(function(){
const DAY=864e5, REVIEW=[3,7,21];
let board=null, DATA=null, endbar=null;
const S={cur:null,g:null,hist:[],phase:'idle',busy:false,me:'w',moves:0,grades:[],assisted:false,sol:null,view:0,group:'all',src:''};
const prog=()=>Store.get('endgame-progress')||{};
const U=u=>({from:u.slice(0,2),to:u.slice(2,4),promotion:u[4]||'q'});
const has=(s,u)=>!!s&&s.split(' ').includes(u);

/* ---------- tablebase: stored tree, live API, Stockfish ---------- */
function node(fen){ return S.cur&&S.cur.nodes?S.cur.nodes[normKey(fen)]:undefined }
async function live(fen){
  if(EndgamesTab.offline) return null;
  try{
    const ctl=new AbortController(), t=setTimeout(()=>ctl.abort(),6000);
    const r=await fetch('https://tablebase.lichess.ovh/standard?fen='+encodeURIComponent(fen),{signal:ctl.signal}); clearTimeout(t);
    if(!r.ok) return null; return await r.json();
  }catch(e){ return null }
}
const res=c=>({loss:'W',win:'L','maybe-loss':'W','maybe-win':'L'})[c]||'D';
const met=m=>m.dtm!=null?Math.abs(m.dtm):10000+Math.abs(m.dtz||0);
function fromLive(d,goal){                       /* the same shape as a stored user node */
  const ms=(d&&d.moves)||[]; if(!ms.length) return null;
  const W=ms.filter(m=>res(m.category)==='W'), D=ms.filter(m=>res(m.category)==='D');
  if(goal==='win'&&W.length){ const best=Math.min(...W.map(met)); const b=W.filter(m=>met(m)===best).map(m=>m.uci);
    return {b:b.join(' '),w:W.filter(m=>!b.includes(m.uci)).map(m=>m.uci).join(' '),d:D.map(m=>m.uci).join(' ')} }
  return {b:'',w:W.map(m=>m.uci).join(' '),d:D.map(m=>m.uci).join(' ')};
}
/* The user's options at fen: {b,w,d} plus where they came from. */
async function options(fen){
  const n=node(fen); if(n&&typeof n==='object') return {n,src:'tablebase'};
  const d=await live(fen); const l=fromLive(d,S.cur.goal); if(l) return {n:l,src:'tablebase (live)'};
  return {n:null,src:'Stockfish'};
}
async function sfScore(fen){                     /* from the side to move, in pawns (mate = ±99) */
  const a=await SharedEngine.analyse(fen,16,1,4000); if(!a||!a.length) return null;
  return a[0].mate!=null?(a[0].mate>0?99:-99):a[0].cp;
}
/* Grade the user's move: best | good | hold | throw. */
async function grade(fen,uci){
  const o=await options(fen); const goal=S.cur.goal;
  if(o.n){ const n=o.n;
    if(goal==='win') return {g:has(n.b,uci)?'best':has(n.w,uci)?'good':'throw',n,src:o.src};
    return {g:has(n.d,uci)||has(n.w,uci)?'hold':'throw',n,src:o.src};
  }
  const t=new Chess(fen); t.move(U(uci));
  if(t.in_checkmate()) return {g:'best',src:'Stockfish'};
  if(t.in_draw()||t.in_stalemate()) return {g:goal==='win'?'throw':'hold',src:'Stockfish'};
  const s=await sfScore(t.fen()); if(s==null) return {g:goal==='win'?'good':'hold',src:'no check'};
  const mine=-s;
  if(goal==='win') return {g:mine>=3?'good':'throw',src:'Stockfish'};
  return {g:mine>=-1.5?'hold':'throw',src:'Stockfish'};
}
async function bestReply(fen){
  const n=node(fen); if(typeof n==='string') return n;
  const d=await live(fen); if(d&&d.moves&&d.moves.length) return d.moves[0].uci;
  const a=await SharedEngine.analyse(fen,18,1,5000); return a&&a.length?a[0].uci:null;
}
async function hintMove(fen){
  const o=await options(fen);
  if(o.n){ const s=(S.cur.goal==='win'?(o.n.b||o.n.w):(o.n.d||o.n.w))||''; return s.split(' ')[0]||null }
  const a=await SharedEngine.analyse(fen,18,1,5000); return a&&a.length?a[0].uci:null;
}

/* ---------- the list ---------- */
function due(e){ if(!e) return true; if(!e.ok) return e.t<new Date().setHours(0,0,0,0);
  return Date.now()-e.t>=REVIEW[Math.min(REVIEW.length-1,(e.okN||1)-1)]*DAY }
function list(){ return DATA?DATA.positions.filter(p=>S.group==='all'||p.group===S.group):[] }
function renderList(){
  const ch=$('eg-groups'); ch.innerHTML='';
  if(DATA){ const r=document.createElement('div'); r.className='chips';
    for(const [v,n] of [['all','All'],...DATA.groups.filter(g=>DATA.positions.some(p=>p.group===g[0]))]){
      const b=document.createElement('button'); b.className='chip'; b.textContent=n; b.setAttribute('aria-pressed',String(S.group===v));
      b.addEventListener('click',()=>{ S.group=v; renderList() }); r.appendChild(b) }
    ch.appendChild(r);
    const p=prog(), solved=DATA.positions.filter(z=>p[z.id]&&p[z.id].okN).length;
    const c=document.createElement('p'); c.className='note'; c.style.margin='6px 0 0';
    c.textContent=`${solved} of ${DATA.positions.length} solved`; ch.appendChild(c) }
  const el=$('eg-list'); el.innerHTML=''; const p=prog(); let lastG='';
  for(const z of list()){
    if(S.group==='all'&&z.group!==lastG){ lastG=z.group; const h=document.createElement('div'); h.className='eghead label';
      h.textContent=(DATA.groups.find(g=>g[0]===z.group)||[,z.group])[1]; el.appendChild(h) }
    const e=p[z.id];
    const b=document.createElement('button'); b.className='drill'; b.setAttribute('aria-current',S.cur&&S.cur.id===z.id?'true':'false');
    const mark=!e?'':e.okN?(due(e)?'↻':'✓'):'✗';
    b.innerHTML=`<span class="src">${mark}</span><span><span class="opp">${esc(z.title)}</span><br><span class="meta">${z.goal==='win'?'Win':'Draw'} · ${z.me||(z.fen.split(' ')[1]==='w'?'White':'Black')}</span></span><span class="evalchip">&#9654;</span>`;
    b.addEventListener('click',()=>load(z)); el.appendChild(b);
  }
  if(!el.children.length) el.innerHTML=DATA?'<p class="empty">No positions in this group.</p>':'<p class="empty">Loading endgames…</p>';
}

/* ---------- playing ---------- */
const goalText=z=>{ const who=z.fen.split(' ')[1]==='w'?'White':'Black';
  if(z.goal==='win') return `${who} to play and win`+(z.end==='mate'?' (finish with checkmate)':' (a capture or promotion that keeps the win finishes it)');
  return `${who} to play and hold the draw for ${z.end.split(':')[1]} moves`; };
function par(z){ const t=z.tb||{}; if(z.goal!=='win') return 'Draw with best play';
  if(t.dtm!=null) return `Mate in ${Math.abs(Math.round(t.dtm/2))} with best play`; return 'Win with best play'; }
function load(z){
  if(!z) return; if(endbar) endbar.hide();
  S.cur=z; S.g=new Chess(z.fen); S.hist=[]; S.phase='play'; S.busy=false; S.me=S.g.turn(); S.moves=0; S.grades=[]; S.assisted=false; S.counted=false; S.sol=null; S.view=0;
  board.set(S.g,{last:null,orient:S.me,locked:false});
  status('',goalText(z),'');
  $('eg-facts').innerHTML=`<dt>Goal</dt><dd>${esc(goalText(z))}</dd><dt>Best play</dt><dd>${esc(par(z))}</dd><dt>Graded by</dt><dd id="eg-src">the Lichess tablebase</dd>`;
  $('eg-text').textContent=z.text||''; $('eg-tip').hidden=true;
  renderMoves(); renderList(); buttons();
}
function buttons(){ const p=S.phase; $('eg-back').disabled=!S.hist.length||S.busy; $('eg-hint').disabled=p!=='play'||S.busy;
  $('eg-sol').disabled=!S.cur; $('eg-prev').hidden=$('eg-fwd').hidden=$('eg-step').hidden=!S.sol }
function renderMoves(){
  const el=$('eg-moves'); if(!S.cur){ el.innerHTML=''; return }
  const g=new Chess(S.cur.fen); const white=g.turn()==='w'; const out=[];
  S.hist.forEach((h,i)=>{ const m=g.move(U(h.u)); if(!m) return; const ply=i+(white?0:1); const no=Math.floor(ply/2)+1;
    const pre=ply%2===0?no+'. ':(i===0?no+'… ':''); const gr=h.gr?({best:'✓',good:'·',hold:'✓',throw:'✗'})[h.gr]:'';
    out.push(`<span class="${h.gr==='throw'?'miss':h.gr?'ok':''}">${pre}${esc(m.san)}${gr?'<sup>'+gr+'</sup>':''}</span>`) });
  el.innerHTML=out.length?out.join(' '):'<span class="note">Your moves appear here.</span>';
}
function status(tone,head,rest){ const el=$('eg-status'); el.className='status'+(tone?' '+tone:''); el.innerHTML=`<strong>${esc(head)}</strong>${rest?esc(rest):''}` }
function finish(ok,head,rest){
  S.phase='done'; S.busy=false; const z=S.cur;
  const p=prog(), e=p[z.id]||{tries:0,okN:0};
  if(!S.counted) e.tries++; S.counted=true; e.t=Date.now(); e.ok=ok&&!S.assisted; if(e.ok) e.okN=(e.okN||0)+1; p[z.id]=e; Store.put('endgame-progress',p);
  const tone=ok?(S.assisted?'warn':'good'):'bad';
  status(tone,head,rest||''); endbar.show(tone,head,'Next endgame');
  board.set(S.g,{locked:true}); renderList(); buttons(); EndgamesTab.onFinish&&EndgamesTab.onFinish(z,e);
}
function over(){                                  /* after any move: is the exercise finished? */
  const z=S.cur, g=S.g;
  if(g.in_checkmate()) return g.turn()!==S.me?['ok','Checkmate ✓']:['bad','You were mated.'];
  if(g.in_stalemate()) return z.goal==='draw'?['ok','Stalemate: draw held ✓']:['bad','Stalemate: the win is gone.'];
  if(g.insufficient_material()) return z.goal==='draw'?['ok','Draw held: nothing left to mate with ✓']:['bad','Not enough material left to win.'];
  if(g.in_threefold_repetition()||g.in_draw()) return z.goal==='draw'?['ok','Draw held ✓']:['bad','A draw by repetition or the 50-move rule: too slow.'];
  return null;
}
async function userMove(from,to,promo){
  const z=S.cur; if(!z||S.phase!=='play'||S.busy||S.g.turn()!==S.me) return;
  const before=S.g.fen(); const t=new Chess(before); const m=t.move({from,to,promotion:promo||'q'}); if(!m) return;
  const uci=m.from+m.to+(m.promotion||'');
  S.busy=true; buttons(); $('eg-tip').hidden=true;
  S.g=t; board.set(S.g,{last:{from:m.from,to:m.to},locked:true});
  const gr=await grade(before,uci); if(S.cur!==z) return;
  S.hist.push({u:uci,gr:gr.g,fen:before}); S.moves++; S.src=gr.src; $('eg-src').textContent=gr.src==='Stockfish'?'Stockfish (no tablebase answer here)':'the Lichess '+gr.src;
  renderMoves();
  const bestU=gr.n&&(z.goal==='win'?(gr.n.b||gr.n.w):(gr.n.d||gr.n.w));
  const bestSan=bestU?sanOf(before,bestU.split(' ')[0]):'';
  if(gr.g==='throw'){
    board.flash([m.to],'bad');
    const why=z.goal==='win'?'That lets the win slip.':'That loses.';
    S.busy=false; S.phase='mistake';
    if(!S.counted){ const p=prog(), e=p[z.id]||{tries:0,okN:0}; e.tries++; e.t=Date.now(); e.ok=false; p[z.id]=e; Store.put('endgame-progress',p); S.counted=true; renderList() }
    status('bad',why,bestSan?` ${bestSan} was the move. Take it back and try again, or start over.`:' Take it back and try again, or start over.');
    endbar.show('bad',why+(bestSan?' '+bestSan+' was the move.':''),'Take back');
    endbar.onNext=()=>{ endbar.onNext=()=>next(); takeBack() };
    buttons(); return;
  }
  board.flash([m.to],'good');
  const ended=over();
  const conv=z.goal==='win'&&z.end==='convert'&&(m.captured||m.promotion);
  const held=z.end.startsWith('hold:')&&S.moves>=+z.end.split(':')[1];
  if(ended) return finish(ended[0]==='ok',ended[1]);
  if(conv) return finish(true,m.promotion?'Promoted, and still winning ✓':'Won material, and still winning ✓','The rest is a basic win.');
  if(held) return finish(true,`Held for ${S.moves} moves ✓`,'');
  status(gr.g==='good'?'warn':'good',gr.g==='best'?'Best move ✓':gr.g==='good'?'Still winning, but slower.':'Holds ✓',
    gr.g==='good'&&bestSan?` ${bestSan} was faster.`:'');
  await new Promise(r=>setTimeout(r,300));
  const r=await bestReply(S.g.fen()); if(S.cur!==z) return;
  if(!r){ S.busy=false; S.phase='done'; status('warn','No reply here.',' Neither the tablebase nor Stockfish answered (are you offline?). Retry, or show the solution.'); buttons(); return }
  const rm=S.g.move(U(r)); S.hist.push({u:r,fen:null});
  board.set(S.g,{last:rm?{from:rm.from,to:rm.to}:null,locked:false}); renderMoves();
  const e2=over(); S.busy=false;
  if(e2) return finish(e2[0]==='ok',e2[1]);
  buttons();
}
function takeBack(){
  if(!S.cur||S.busy||!S.hist.length) return;
  /* undo back to and including the user's last move (and the reply after it, if any) */
  const keep=S.hist.slice(); while(keep.length&&!keep[keep.length-1].gr) keep.pop(); keep.pop();
  const g=new Chess(S.cur.fen); for(const h of keep) g.move(U(h.u));
  S.hist=keep; S.g=g; S.sol=null; S.moves=keep.filter(h=>h.gr).length; S.assisted=true; S.phase='play'; endbar.hide(); endbar.onNext=()=>next();
  board.set(S.g,{last:null,locked:false}); renderMoves(); status('warn','Taken back.','Find a better move (this attempt no longer counts as solved).'); buttons();
}
async function hint(){
  if(!S.cur||S.phase!=='play'||S.busy) return; S.busy=true; buttons();
  const u=await hintMove(S.g.fen()); S.busy=false; buttons(); if(!u) return;
  S.assisted=true; board.setHint(u.slice(0,2)); $('eg-tip').hidden=false; $('eg-tip').textContent='Hint: move the highlighted piece (this attempt no longer counts as solved).';
}
/* The tablebase's main line, stepped through with ← → */
function solution(){
  if(!S.cur) return; if(S.phase==='play'&&S.hist.length) S.assisted=true;
  S.sol=S.cur.line||[]; S.view=0; showSol(); buttons();
  const g=new Chess(S.cur.fen); const sans=[]; for(const u of S.sol){ const m=g.move(U(u)); if(!m) break; sans.push(m.san) }
  const white=S.cur.fen.split(' ')[1]==='w';
  $('eg-moves').innerHTML='<span class="label">Best play (tablebase)</span><br>'+sans.map((s,i)=>{ const ply=i+(white?0:1); const no=Math.floor(ply/2)+1;
    return (ply%2===0?no+'. ':(i===0?no+'… ':''))+esc(s) }).join(' ');
  if(S.phase==='play'){ S.phase='done'; status('warn','Solution shown.','Retry the position whenever you like.') }
}
function showSol(){ if(!S.sol) return; S.view=Math.max(0,Math.min(S.sol.length,S.view));
  const g=new Chess(S.cur.fen); let last=null; for(let i=0;i<S.view;i++){ const m=g.move(U(S.sol[i])); if(m) last={from:m.from,to:m.to} }
  board.set(g,{last,locked:true}); $('eg-step').textContent=`${S.view} / ${S.sol.length}` }
function next(){
  if(!DATA) return; const p=prog(), L=list(); const i=L.findIndex(z=>S.cur&&z.id===S.cur.id);
  const after=[...L.slice(i+1),...L.slice(0,i+1)];
  load(after.find(z=>!p[z.id])||after.find(z=>due(p[z.id]))||after[0]);
}
/* For Today: one endgame a day (new ones in order, then reviews). */
function pickToday(){ if(!DATA) return null; const p=prog();
  const z=DATA.positions.find(x=>!p[x.id])||DATA.positions.find(x=>due(p[x.id])); return z?z.id:null }
function stats(){ const p=prog(); const all=DATA?DATA.positions:[];
  return {total:all.length,solved:all.filter(z=>p[z.id]&&p[z.id].okN).length,tried:all.filter(z=>p[z.id]).length} }

function init(){
  board=makeBoard($('eg-board'),{onMove:userMove});
  endbar=endBanner($('eg-board'),()=>next(),'Next endgame');
  board.set(new Chess('8/8/8/4k3/8/8/8/4K3 w - - 0 1'),{locked:true});
  fetch('data/endgames.json').then(r=>{ if(!r.ok) throw 0; return r.json() }).then(j=>{ DATA=j; renderList() })
    .catch(()=>{ DATA={groups:[],positions:[]}; renderList() });
  $('eg-back').addEventListener('click',takeBack);
  $('eg-hint').addEventListener('click',hint);
  $('eg-sol').addEventListener('click',solution);
  $('eg-retry').addEventListener('click',()=>load(S.cur));
  $('eg-next').addEventListener('click',next);
  $('eg-flip').addEventListener('click',()=>board.flip());
  $('eg-prev').addEventListener('click',()=>{ S.view--; endbar.hide(); showSol() });
  $('eg-fwd').addEventListener('click',()=>{ S.view++; endbar.hide(); showSol() });
  document.addEventListener('keydown',e=>{
    if(document.body.dataset.view!=='endgames'||/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if(e.key==='ArrowLeft'){ if(S.sol){ S.view--; endbar.hide(); showSol() } else takeBack() }
    if(e.key==='ArrowRight'&&S.sol){ S.view++; endbar.hide(); showSol() }
    if(e.key==='n'||e.key==='N') next();
    if(e.key==='f'||e.key==='F') board.flip();
    if(e.key==='h'||e.key==='H') hint();
  });
}
window.EndgamesTab={init,load,userMove,takeBack,hint,solution,next,pickToday,stats,offline:false,onFinish:null,
  get state(){return S},get data(){return DATA},byId:id=>DATA&&DATA.positions.find(z=>z.id===id)};
})();
