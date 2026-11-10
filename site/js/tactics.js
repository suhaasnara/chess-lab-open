/* Chess Lab Open — tactics from the Lichess puzzle database (CC0).
   The solver gets a puzzle rating: Elo against the puzzle's Lichess rating,
   first attempt only (a hint counts as a miss); K = 32 for the first 30 puzzles, then 16. */
'use strict';
(function(){
let LIB=null, board=null, endbar=null;
const S={cur:null,g:null,step:0,solved:false,failedFirst:false,usedHint:false,hintStage:0,motifs:[],ops:[],lo:null,hi:null,status:'All'};
const BANDS=[['All','Any rating'],['1200','1200–1499'],['1500','1500–1799'],['1800','1800–2099'],['2100','2100–2399'],['2400','2400+']];
const STATUSES=['All','Unsolved','Missed','Solved'];

function prog(){ return Store.get('tactics-progress')||{} }
function rating(){ return Store.get('tac-rating')||{r:2000,n:0} }
function saveResult(id,ok){
  const p=prog(); p[id]={ok,t:Date.now()}; Store.put('tactics-progress',p);
  const rt=rating(); const pz=LIB.find(x=>x.id===id);
  if(pz&&pz.rating){ const K=rt.n<30?32:16; const E=1/(1+Math.pow(10,(pz.rating-rt.r)/400));
    rt.r=Math.round(rt.r+K*((ok?1:0)-E)); rt.n++; Store.put('tac-rating',rt);
    const h=Store.get('tac-history')||[]; h.push({t:Date.now(),r:rt.r}); Store.put('tac-history',h.slice(-500)) }
  renderHeader();
}
function renderHeader(){
  const rt=rating(); $('t-rating').textContent=rt.n?rt.r:'–';
  $('t-solved').textContent=Object.values(prog()).filter(x=>x.ok).length;
}

function filtered(){
  const p=prog();
  return LIB.filter(z=>{
    if(S.motifs.length&&!S.motifs.some(m=>z.motif===m||(z.themes||[]).includes(m))) return false;   /* any of the chosen themes */
    if(S.ops.length&&!S.ops.includes(z.op)) return false;   /* any of the chosen openings */
    if(S.lo!=null&&z.rating<S.lo) return false; if(S.hi!=null&&z.rating>S.hi) return false;
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
/* Lichess opening family ids (Queens_Gambit_Declined) as names (Queen's Gambit Declined) */
const opName=k=>String(k).replace(/_/g,' ').replace(/\b(Queens|Kings|Bishops|Petrovs|Owens|Alekhines|Birds)\b/g,w=>w.slice(0,-1)+"'s").replace(/^Owen Defense/,"Owen's Defense");
/* Themes: a multi-select of the 30 most common (any of them matches); rating: a two-handle slider in 100-point steps. */
let CTL=null;
function renderFilters(){
  if(!CTL){ const cnt={}; for(const z of LIB) for(const t of new Set([z.motif,...(z.themes||[])])) if(t&&!['middlegame','endgame','opening','short','long','veryLong','oneMove','advantage','crushing','master','masterVsMaster','superGM'].includes(t)) cnt[t]=(cnt[t]||0)+1;
    const opts=Object.keys(cnt).sort((a,b)=>cnt[b]-cnt[a]).slice(0,30).map(m=>[m,themeName(m)]).sort((a,b)=>a[1].localeCompare(b[1]));
    const rs=LIB.map(z=>z.rating).filter(Boolean), lo=Math.floor(Math.min(...rs)/100)*100, hi=Math.ceil(Math.max(...rs)/100)*100;
    CTL={motifs:Controls.multi($('t-motifs'),{label:'Themes',options:opts,selected:S.motifs,none:'Any theme',onChange:v=>{ S.motifs=v; renderL() }}),
      ops:(()=>{ const oc={}; for(const z of LIB) if(z.op) oc[z.op]=(oc[z.op]||0)+1; const n=Object.values(oc).reduce((a,b)=>a+b,0);
        const o=Object.keys(oc).filter(k=>oc[k]>=10).map(k=>[k,opName(k)+' ('+oc[k]+')']).sort((a,b)=>a[1].localeCompare(b[1]));
        if(!o.length){ $('t-ops').hidden=true; return null }
        const c=Controls.multi($('t-ops'),{label:'Openings',options:o,selected:S.ops,none:'Any opening',onChange:v=>{ S.ops=v; renderL() }});
        $('t-ops').insertAdjacentHTML('beforeend',`<p class="note" style="margin:4px 0 0;max-width:22em">Lichess tags the opening only on puzzles from the opening phase (${n.toLocaleString()} of ${LIB.length.toLocaleString()} here).</p>`); return c })(),
      range:Controls.range($('t-bands'),{label:'Puzzle rating',min:lo,max:hi,step:100,lo,hi,onChange:(a,b)=>{ S.lo=a<=lo?null:a; S.hi=b>=hi?null:b; renderL() }})} }
  const mk=(el,items,cur,fn)=>{ el.innerHTML='';
    for(const it of items){ const b=document.createElement('button'); b.className='chip'; b.textContent=it; b.setAttribute('aria-pressed',String(it===cur));
      b.addEventListener('click',()=>{ fn(it); renderFilters(); renderL() }); el.appendChild(b) } };
  mk($('t-status'),STATUSES,S.status,v=>S.status=v);
}
function renderL(){
  const el=$('t-list'); el.innerHTML='';
  const p=prog();
  for(const z of daily(filtered()).slice(0,200)){
    const st=p[z.id];
    const b=document.createElement('button'); b.className='drill'; b.setAttribute('aria-current',S.cur&&S.cur.id===z.id?'true':'false');
    b.innerHTML=`<span class="src">${st?(st.ok?'✓':'✗'):''}</span><span><span class="opp">${esc(Puzzles.title(z.id,themeName(z.motif),!!st))}</span><br><span class="meta">${z.rating}</span></span><span class="evalchip">${esc(themeName((z.themes||[])[0]))}</span>`;
    b.addEventListener('click',()=>load(z));
    el.appendChild(b);
  }
  if(!el.children.length) el.innerHTML='<p class="empty">No puzzles match these filters.</p>';
}

/* the facts card; themes stay hidden until the puzzle is done (shared/puzzles.js) */
function facts(){ const z=S.cur; if(!z) return;
  const done=!!(S.solved||S.failedFirst||prog()[z.id]);   /* themes stay hidden until the puzzle is done (Puzzles) */
  $('t-facts').innerHTML=`<dt>Puzzle</dt><dd>${esc(z.id)}</dd><dt>Motif</dt><dd>${esc(Puzzles.theme(themeName(z.motif),done))}</dd><dt>Rating</dt><dd>${z.rating||'—'}</dd>
    <dt>Themes</dt><dd>${esc(Puzzles.theme((z.themes||[]).map(themeName).join(', '),done))}</dd>`;
}
function load(z){
  if(endbar) endbar.hide();
  S.gen=(S.gen||0)+1;   /* a reply still on its timer belongs to the puzzle it was made for */
  S.cur=z; S.g=new Chess(z.fen); S.step=0; S.solved=false; S.failedFirst=false; S.usedHint=false; S.hintStage=0;
  let last=null;
  /* Lichess puzzles: the first move of the solution is the opponent's setup move. */
  if(z.pre!==false&&z.moves.length>1){ const u=z.moves[0]; const m=S.g.move({from:u.slice(0,2),to:u.slice(2,4),promotion:u[4]||'q'}); if(m) last={from:m.from,to:m.to}; S.step=1 }
  board.set(S.g,{last,orient:S.g.turn()});
  status('', (S.g.turn()==='w'?'White':'Black')+' to move.','Find the best move.');
  facts();
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
    if(S.step===(S.cur.pre!==false?1:0)&&!S.failedFirst&&!S.usedHint){ S.failedFirst=true; saveResult(S.cur.id,false); facts() }
    board.flash([from,to],'bad');
    status('bad',`${m.san} isn’t it.`,'Try again, or use Hint (H).');
    return;
  }
  S.g.move({from,to,promotion:promo||'q'});
  board.set(S.g,{last:{from,to},orient:board.orient});
  board.flash([from,to],'good');
  S.step++;
  const reply=S.cur.moves[S.step];
  if(!reply||test.in_checkmate()){
    S.solved=true; facts();
    if(!S.failedFirst&&!S.usedHint) saveResult(S.cur.id,true);
    status('good','Solved!',S.failedFirst||S.usedHint?'(no rating: not a clean first try)':'');
    const clean=!S.failedFirst&&!S.usedHint;
    endbar.show(clean?'good':'warn',clean?'Solved ✓ first try':'Solved, not first try','Next puzzle');
    renderL(); return;
  }
  const gen=S.gen;
  setTimeout(()=>{ if(gen!==S.gen) return; const u=reply; const mm=S.g.move({from:u.slice(0,2),to:u.slice(2,4),promotion:u[4]||'q'});
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
  endbar=endBanner($('t-board'),()=>next(),'Next puzzle');
  board.set(new Chess(),{locked:true});
  fetch('data/tactics.json').then(r=>r.json()).then(j=>{ LIB=j; renderHeader(); renderFilters(); renderL() })
    .catch(()=>{ $('t-list').innerHTML='<p class="empty">The puzzle library could not load.</p>'; LIB=[] });
  $('t-next').addEventListener('click',next);
  $('t-hint').addEventListener('click',hint);
  $('t-flip').addEventListener('click',()=>board.flip());
  Keys.on('tactics',{n:['Next puzzle',()=>next()],h:['Hint',()=>hint()],f:['Flip the board',()=>board.flip()]});
}
window.TacticsTab={init,get state(){return S},load,next,userMove,hint,filtered,get lib(){return LIB}};
})();
