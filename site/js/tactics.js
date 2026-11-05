/* Chess Lab Open — tactics from the Lichess puzzle database (CC0).
   The solver gets a puzzle rating: Elo against the puzzle's Lichess rating,
   first attempt only (a hint counts as a miss); K = 32 for the first 30 puzzles, then 16. */
'use strict';
(function(){
let LIB=null, board=null;
const S={cur:null,g:null,step:0,solved:false,failedFirst:false,usedHint:false,hintStage:0,motif:'All',band:'All',status:'All'};
const BANDS=[['All','Any rating'],['1700','1700–1999'],['2000','2000–2299'],['2300','2300+']];
const STATUSES=['All','Unsolved','Missed','Solved'];

function prog(){ return Store.get('tactics-progress')||{} }
function rating(){ return Store.get('tac-rating')||{r:2000,n:0} }
function saveResult(id,ok){
  const p=prog(); p[id]={ok,t:Date.now()}; Store.put('tactics-progress',p);
  const rt=rating(); const pz=LIB.find(x=>x.id===id);
  if(pz&&pz.rating){ const K=rt.n<30?32:16; const E=1/(1+Math.pow(10,(pz.rating-rt.r)/400));
    rt.r=Math.round(rt.r+K*((ok?1:0)-E)); rt.n++; Store.put('tac-rating',rt) }
  renderHeader();
}
function renderHeader(){
  const rt=rating(); $('t-rating').textContent=rt.n?rt.r:'–';
  $('t-solved').textContent=Object.values(prog()).filter(x=>x.ok).length;
}

function filtered(){
  const p=prog();
  return LIB.filter(z=>{
    if(S.motif!=='All'&&z.motif!==S.motif) return false;
    if(S.band!=='All'){ const lo=+S.band, hi=lo===2300?9999:lo+299; if(!(z.rating>=lo&&z.rating<=hi)) return false }
    const st=p[z.id];
    if(S.status==='Unsolved'&&st) return false;
    if(S.status==='Missed'&&!(st&&!st.ok)) return false;
    if(S.status==='Solved'&&!(st&&st.ok)) return false;
    return true;
  });
}
/* A stable daily shuffle, so the list order holds within a day. */
function daily(list){
  const seed=new Date().toISOString().slice(0,10);
  const h=s=>{ let x=2166136261; for(const c of s) x=Math.imul(x^c.charCodeAt(0),16777619); return x>>>0 };
  return list.map(z=>[h(seed+z.id),z]).sort((a,b)=>a[0]-b[0]).map(x=>x[1]);
}
function renderFilters(){
  const motifs=['All',...new Set(LIB.map(z=>z.motif).filter(Boolean))].slice(0,18);
  const mk=(el,items,cur,fn,label)=>{ el.innerHTML='';
    for(const it of items){ const name=Array.isArray(it)?it[1]:it, val=Array.isArray(it)?it[0]:it;
      const b=document.createElement('button'); b.className='chip'; b.textContent=name; b.setAttribute('aria-pressed',String(val===cur));
      b.addEventListener('click',()=>{ fn(val); renderFilters(); renderL() }); el.appendChild(b) } };
  mk($('t-motifs'),motifs,S.motif,v=>S.motif=v);
  mk($('t-bands'),BANDS,S.band,v=>S.band=v);
  mk($('t-status'),STATUSES,S.status,v=>S.status=v);
}
function renderL(){
  const el=$('t-list'); el.innerHTML='';
  const p=prog();
  for(const z of daily(filtered()).slice(0,200)){
    const st=p[z.id];
    const b=document.createElement('button'); b.className='drill'; b.setAttribute('aria-current',S.cur&&S.cur.id===z.id?'true':'false');
    b.innerHTML=`<span class="src">${st?(st.ok?'✓':'✗'):''}</span><span><span class="opp">${esc(z.motif||'Tactic')}</span><br><span class="meta">${z.rating}</span></span><span class="evalchip">${esc((z.themes||[])[0]||'')}</span>`;
    b.addEventListener('click',()=>load(z));
    el.appendChild(b);
  }
  if(!el.children.length) el.innerHTML='<p class="empty">No puzzles match these filters.</p>';
}

function load(z){
  S.cur=z; S.g=new Chess(z.fen); S.step=0; S.solved=false; S.failedFirst=false; S.usedHint=false; S.hintStage=0;
  let last=null;
  /* Lichess puzzles: the first move of the solution is the opponent's setup move. */
  if(z.pre!==false&&z.moves.length>1){ const u=z.moves[0]; const m=S.g.move({from:u.slice(0,2),to:u.slice(2,4),promotion:u[4]||'q'}); if(m) last={from:m.from,to:m.to}; S.step=1 }
  board.set(S.g,{last,orient:S.g.turn()});
  status('', (S.g.turn()==='w'?'White':'Black')+' to move.','Find the best move.');
  $('t-facts').innerHTML=`<dt>Motif</dt><dd>${esc(z.motif||'—')}</dd><dt>Rating</dt><dd>${z.rating||'—'}</dd>
    <dt>Themes</dt><dd>${esc((z.themes||[]).join(', '))||'—'}</dd>`;
  $('t-lichess').href=z.url||('https://lichess.org/analysis/'+encodeURIComponent(S.g.fen()));
  renderL();
}
function expected(){ return S.cur.moves[S.step] }
function userMove(from,to,promo){
  if(!S.cur||S.solved) return;
  const exp=expected(); if(!exp) return;
  const test=new Chess(S.g.fen()); const m=test.move({from,to,promotion:promo||'q'}); if(!m) return;
  const uci=from+to+(m.promotion||'');
  const hit=uci===exp||uci.slice(0,4)===exp.slice(0,4)&&(!exp[4]||exp[4]===uci[4]);
  /* any mate also counts, as on Lichess */
  if(!hit&&!test.in_checkmate()){
    if(S.step===(S.cur.pre!==false?1:0)&&!S.failedFirst&&!S.usedHint){ S.failedFirst=true; saveResult(S.cur.id,false) }
    board.flash([from,to],'bad');
    status('bad',`${m.san} isn’t it.`,'Try again, or press H for a hint.');
    return;
  }
  S.g.move({from,to,promotion:promo||'q'});
  board.set(S.g,{last:{from,to},orient:board.orient});
  board.flash([from,to],'good');
  S.step++;
  const reply=S.cur.moves[S.step];
  if(!reply||test.in_checkmate()){
    S.solved=true;
    if(!S.failedFirst&&!S.usedHint) saveResult(S.cur.id,true);
    status('good','Solved!',S.failedFirst||S.usedHint?'(no rating: not a clean first try)':'');
    renderL(); return;
  }
  setTimeout(()=>{ const u=reply; const mm=S.g.move({from:u.slice(0,2),to:u.slice(2,4),promotion:u[4]||'q'});
    S.step++;
    board.set(S.g,{last:mm?{from:mm.from,to:mm.to}:null,orient:board.orient});
    status('','Keep going.',''); },450);
}
function hint(){
  if(!S.cur||S.solved) return;
  const exp=expected(); if(!exp) return;
  if(!S.usedHint&&!S.failedFirst){ S.usedHint=true; saveResult(S.cur.id,false) }
  if(S.hintStage===0){ S.hintStage=1; board.setHint(exp.slice(0,2)); status('warn','Hint: this piece moves.','H again shows the move.') }
  else{ board.setHint(exp.slice(0,2),exp.slice(2,4)); status('warn','Answer: '+sanOf(S.g.fen(),exp),'') }
}
function next(){
  const p=prog();
  const list=daily(filtered());
  const z=list.find(x=>!p[x.id])||list[0];
  if(z) load(z); else status('warn','No puzzles match these filters.','');
}
function status(tone,head,rest){ const el=$('t-status-box'); el.className='status'+(tone?' '+tone:''); el.innerHTML=`<strong>${esc(head)}</strong>${esc(rest||'')}` }

function init(){
  board=makeBoard($('t-board'),{onMove:userMove});
  board.set(new Chess(),{locked:true});
  fetch('data/tactics.json').then(r=>r.json()).then(j=>{ LIB=j; renderHeader(); renderFilters(); renderL() })
    .catch(()=>{ $('t-list').innerHTML='<p class="empty">The puzzle library could not load.</p>'; LIB=[] });
  $('t-next').addEventListener('click',next);
  $('t-hint').addEventListener('click',hint);
  $('t-flip').addEventListener('click',()=>board.flip());
  document.addEventListener('keydown',e=>{
    if(document.body.dataset.view!=='tactics') return;
    if(/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if(e.key==='n'||e.key==='N') next();
    if(e.key==='h'||e.key==='H') hint();
    if(e.key==='f'||e.key==='F') board.flip();
  });
}
window.TacticsTab={init,get state(){return S},load,next,userMove,hint,get lib(){return LIB}};
})();
