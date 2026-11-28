/* Think Ahead — tactics from the Lichess puzzle database (CC0).
   The solver gets a puzzle rating: Elo against the puzzle's Lichess rating,
   first attempt only (a hint counts as a miss); K = 32 for the first 30 puzzles, then 16. Only the first try at each
   puzzle is rated, as in Blind tactics (26 Nov 2026, roadmap #260: a puzzle solved three times moved the rating three
   times, 1500 to 1596); a later try still updates its Solved / Missed record. */
'use strict';
(function(){
let LIB=null, LOADFAIL=false, board=null, endbar=null, H=null;   /* H: Today, when it hosts this panel */
const S={cur:null,g:null,step:0,solved:false,failedFirst:false,usedHint:false,hintStage:0,sol:null,view:0,motifs:[],ops:[],lo:null,hi:null,status:'Unsolved',band:null};
const BANDS=[['All','Any rating'],['1200','1200–1499'],['1500','1500–1799'],['1800','1800–2099'],['2100','2100–2399'],['2400','2400+']];
const STATUSES=['All','Unsolved','Missed','Solved'];

function prog(){ return Store.get('tactics-progress')||{} }
/* a new visitor starts at 1500, the level Today assumes too (14 Nov 2026: it was 2000 here and 1500 there) */
function rating(){ return Store.get('tac-rating')||{r:1500,n:0} }
/* at: when it was solved (a result from the Apple Watch keeps its own time; js/native.js). The record follows the
   newest try only, so a watch result that arrives late never overwrites a newer one made here; the rating moves on the
   first try ever. */
function saveResult(id,ok,at){
  const p=prog(), prev=p[id], t=+at||Date.now();
  if(!prev||t>=(prev.t||0)){ p[id]={ok,t}; Store.put('tactics-progress',p) }
  const rt=rating(), r0=rt.r; let delta=null; const pz=LIB.find(x=>x.id===id);
  if(!prev&&pz&&pz.rating){ const K=rt.n<30?32:16; const E=1/(1+Math.pow(10,(pz.rating-rt.r)/400));
    rt.r=Math.round(rt.r+K*((ok?1:0)-E)); rt.n++; Store.put('tac-rating',rt);
    const h=Store.get('tac-history')||[]; h.push({t,r:rt.r}); Store.put('tac-history',h.slice(-500)); delta=rt.r-r0 }
  renderHeader();
  if(H) H.changed();
  return delta;   /* the rating change, for the result strip under the board (17 Nov 2026) */
}
function renderHeader(){
  const rt=rating(), solved=Object.values(prog()).filter(x=>x.ok).length;
  $('t-rate').innerHTML=TV.rate('Puzzle rating',rt.n?rt.r:'–',rt.n?`${Help.n(rt.n,'rated puzzle')} · ${solved} solved`:'first try at each puzzle counts');
  $('t-rate').insertAdjacentHTML('beforeend',weakRow());
  if(S.cur) facts();
}

/* Weakest themes (13 Nov 2026, shared Puzzles.weak): the three themes where your first try fails most often; a tap shows only
   that theme (again to clear). From the stored results only. */
function weakRow(){ const p=prog(), items=[]; for(const z of LIB){ const r=p[z.id]; if(r&&z.motif) items.push({motif:z.motif,ok:!!r.ok}) }
  return Puzzles.weakRow(Puzzles.weak(items),S.motifs.length===1?S.motifs[0]:null,themeName) }
document.addEventListener('click',e=>{ const b=e.target.closest('#t-rate [data-wk]'); if(!b) return; const m=b.dataset.wk;
  S.motifs=S.motifs.length===1&&S.motifs[0]===m?[]:[m]; if(CTL) CTL.motifs.set(S.motifs); renderHeader(); renderL() });
/* Rating: Near my rating (±150, the default from the first puzzle since 14 Nov 2026: Next used to serve 1504, then
   2411, then 1690 until 10 puzzles were rated), Any, or the slider's range */
const bandNow=()=>S.band||'near';
/* the middle of Near my rating: your rating, kept 150 inside the set's range (27 Nov 2026, roadmap #281: below 1050 the
   window held no puzzles, as the easiest are about 1200) */
let RANGE=null;
function nearMid(){ const r=rating().r; if(!RANGE){ const rs=LIB.map(z=>z.rating).filter(Boolean); if(!rs.length) return r; RANGE=[Math.min(...rs),Math.max(...rs)] }
  return Math.max(RANGE[0]+150,Math.min(RANGE[1]-150,r)) }
function filtered(){
  const p=prog(), mid=bandNow()==='near'?nearMid():0;
  return LIB.filter(z=>{
    if(S.motifs.length&&!S.motifs.some(m=>z.motif===m||(z.themes||[]).includes(m))) return false;   /* any of the chosen themes */
    if(S.ops.length&&!S.ops.includes(z.op)) return false;   /* any of the chosen openings */
    if(bandNow()==='near'){ if(z.rating&&Math.abs(z.rating-mid)>150) return false }
    else{ if(S.lo!=null&&z.rating<S.lo) return false; if(S.hi!=null&&z.rating>S.hi) return false }
    const st=p[z.id];
    if(S.status==='Unsolved'&&st) return false;
    if(S.status==='Missed'&&!(st&&!st.ok)) return false;
    if(S.status==='Solved'&&!(st&&st.ok)) return false;
    return true;
  });
}
/* A stable daily shuffle, so the list order holds within a day. */
function daily(list){
  const seed=localDay();
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
    CTL={motifs:Controls.multi($('t-motifs'),{label:'Themes',options:opts,selected:S.motifs,none:'Any theme',onChange:v=>{ S.motifs=v; renderL(); renderHeader() }}),
      ops:(()=>{ const oc={}; for(const z of LIB) if(z.op) oc[z.op]=(oc[z.op]||0)+1; const n=Object.values(oc).reduce((a,b)=>a+b,0);
        const o=Object.keys(oc).filter(k=>oc[k]>=10).map(k=>[k,opName(k)+' ('+oc[k]+')']).sort((a,b)=>a[1].localeCompare(b[1]));
        if(!o.length){ $('t-ops').hidden=true; return null }
        const c=Controls.multi($('t-ops'),{label:'Openings',options:o,selected:S.ops,none:'Any opening',onChange:v=>{ S.ops=v; renderL() }});
        $('t-ops').insertAdjacentHTML('beforeend',`<p class="note" style="margin:4px 0 0;max-width:22em">${n.toLocaleString()} of ${LIB.length.toLocaleString()} have an opening (Lichess tags opening-phase puzzles only).</p>`); return c })(),
      range:Controls.range($('t-bands'),{label:'Rating range',min:lo,max:hi,step:100,lo,hi,onChange:(a,b)=>{ S.lo=a<=lo?null:a; S.hi=b>=hi?null:b; S.band=S.lo==null&&S.hi==null?'all':'range'; renderFilters(); renderL() }})};
    TV.onChip($('t-chiprows'),(k,v)=>{ if(k==='band'){ S.band=v; S.lo=S.hi=null; CTL.range.set(null,null) } else S.status=v; renderFilters(); renderL() }) }
  const b=bandNow();
  $('t-chiprows').innerHTML=TV.chips('Rating','band',[['near','Near my rating'],['all','Any']],b==='range'?'':b)+
    TV.chips('Status','status',[['Unsolved','Unsolved'],['Missed','Missed'],['Solved','Solved'],['All','Any']],S.status);
}
function renderL(){
  const el=$('t-list'), p=prog(), list=daily(filtered());
  $('t-listlabel').textContent=`${list.length.toLocaleString()} puzzle${list.length===1?'':'s'}${list.length>200?' · showing the first 200':''}`;
  el.innerHTML=list.slice(0,200).map(z=>{ const st=p[z.id];
    return TV.row({badge:z.rating||'—',title:esc(Puzzles.title(z.id,themeName(z.motif),doneNow(z),Puzzles.num(LIB,z.id))),meta:z.op?esc(opName(z.op)):'Lichess',
      right:TV.dots([[st?(st.ok?'good':'bad'):'','Puzzle']]),current:!!(S.cur&&S.cur.id===z.id),data:{id:z.id}}) }).join('');
  el.classList.toggle('isempty',!list.length);
  if(!list.length) el.innerHTML=LOADFAIL?'<p class="empty">The puzzle library could not load. Check the connection and open the tab again.</p>':'<p class="empty">No puzzles match these filters. Try Any rating or Any status.</p>';
}

/* Is the theme shown? (shared/puzzles.js: "shown when solved"). For the puzzle on the board: once it is solved or its
   answer shown (the second Hint), or if it was done before this try. A wrong first try no longer gives it away
   (26 Nov 2026, roadmap #287: it showed the theme in the title and the chip after the first miss). Other puzzles: once tried. */
const doneNow=z=>S.cur&&z.id===S.cur.id?!!(S.solved||S.hintStage>=2||S.seen):!!prog()[z.id];
/* the facts card */
function facts(){ const z=S.cur; if(!z) return;
  const done=doneNow(z);
  const rt=rating(), toMove=S.g&&S.g.turn()==='w'?'White':'Black';
  $('t-head').innerHTML=TV.head({kicker:'Lichess puzzle'+(z.op?' · '+esc(opName(z.op)):''),right:rt.n?String(rt.r):'',
    title:esc(Puzzles.title(z.id,themeName(z.motif),done,Puzzles.num(LIB,z.id))),
    chips:[z.rating?`<span class="mono">${z.rating}</span>`:'',toMove+' to move',
      `<span id="t-facts">Themes: ${esc(Puzzles.theme((z.themes||[]).filter(t=>!['middlegame','endgame','opening','advantage','crushing','mate','short','long','veryLong','oneMove'].includes(t)).map(themeName).join(', ')||themeName(z.motif),done))}</span>`,
      z.url?`<a href="${esc(z.url)}" target="_blank" rel="noopener">Original game</a>`:'']});
}
function load(z){
  if(endbar) endbar.hide();
  S.gen=(S.gen||0)+1; S.wait=false;   /* a reply still on its timer belongs to the puzzle it was made for */
  S.cur=z; S.g=new Chess(z.fen); S.step=0; S.solved=false; S.failedFirst=false; S.usedHint=false; S.hintStage=0; S.sol=null; S.view=0; S.seen=!!prog()[z.id];
  let last=null;
  /* Lichess puzzles: the first move of the solution is the opponent's setup move. */
  if(z.pre!==false&&z.moves.length>1){ const u=z.moves[0]; const m=S.g.move({from:u.slice(0,2),to:u.slice(2,4),promotion:u[4]||'q'}); if(m) last={from:m.from,to:m.to}; S.step=1 }
  board.set(S.g,{last,orient:S.g.turn()});
  /* the very first puzzle says how to move (26 Nov 2026, roadmap #288) */
  const how=Object.keys(prog()).length?'':touch()?' Tap a piece, then a square.':' Click a piece, then a square (or drag it).';
  status('', (S.g.turn()==='w'?'White':'Black')+' to move.','Find the best move.'+how);
  facts();
  $('t-lichess').href=z.url||('https://lichess.org/analysis/'+encodeURIComponent(S.g.fen()));
  renderL(); nextLabel(); solButtons();
}
/* with the solution shown: ‹ › step through it, and Hint and Solution (nothing left to show) make room for them */
function solButtons(){ const on=!!S.sol;
  $('t-prev').hidden=$('t-fwd').hidden=!on; $('t-hint').hidden=$('t-sol').hidden=on;
  if(on){ $('t-prev').disabled=S.view<=0; $('t-fwd').disabled=S.view>=S.sol.fens.length-1 } }
/* Next reads "Skip" while nothing has been recorded for the puzzle on the board (no move tried, no Hint, no Solution):
   pressing it then goes on without a result (26 Nov 2026, roadmap #262). Once a result is in, it reads "Next". */
const skipping=()=>!!(S.cur&&!S.solved&&!S.sol&&!S.failedFirst&&!S.usedHint);
function nextLabel(){ const b=$('t-next'); if(!b) return; const k=skipping();
  b.firstChild.textContent=k?'Skip ':'Next '; b.title=k?'Go on to the next puzzle without a result for this one':'' }
const touch=()=>!!(window.matchMedia&&matchMedia('(hover: none)').matches||document.documentElement.classList.contains('in-app'));
function expected(){ return S.cur.moves[S.step] }
function userMove(from,to,promo){
  if(!S.cur||S.solved||S.sol||S.wait) return;
  const exp=expected(); if(!exp) return;
  const test=new Chess(S.g.fen()); const m=test.move({from,to,promotion:promo||'q'}); if(!m) return;
  const uci=from+to+(m.promotion||'');
  const hit=uci===exp||uci.slice(0,4)===exp.slice(0,4)&&(!exp[4]||exp[4]===uci[4]);
  /* any mate also counts, as on Lichess */
  if(!hit&&!test.in_checkmate()){
    if(S.step===(S.cur.pre!==false?1:0)&&!S.failedFirst&&!S.usedHint){ S.failedFirst=true; saveResult(S.cur.id,false); facts(); nextLabel() }
    board.flash([from,to],'bad');
    status('bad',`${m.san} isn’t it.`,'Try again, or press Hint or Solution.');
    return;
  }
  S.g.move({from,to,promotion:promo||'q'});
  board.set(S.g,{last:{from,to},orient:board.orient});
  board.flash([from,to],'good');
  S.step++;
  const reply=S.cur.moves[S.step];
  if(!reply||test.in_checkmate()){
    S.solved=true; board.lock(); facts();
    const dr=!S.failedFirst&&!S.usedHint?saveResult(S.cur.id,true):null;
    status('good','Solved!',S.failedFirst||S.usedHint?'(no rating: not a clean first try)':dr==null&&S.seen?'(no rating: only your first try at a puzzle is rated)':'');
    const clean=!S.failedFirst&&!S.usedHint;
    endbar.show(clean?'good':'warn',(clean?'Solved ✓ first try':'Solved, not first try')+(dr!=null?` · ${dr>=0?'+':''}${dr}`:''));
    renderL(); nextLabel(); return;
  }
  /* the 450 ms before the reply: Hint and moves wait (27 Nov 2026, roadmap #274: Hint read the reply as your move and
     recorded a miss). The board stays unlocked, so a drag on your pieces still doesn't scroll the page (his recheck). */
  const gen=S.gen; S.wait=true;
  setTimeout(()=>{ if(gen!==S.gen) return; S.wait=false; const u=reply; const mm=S.g.move({from:u.slice(0,2),to:u.slice(2,4),promotion:u[4]||'q'});
    S.step++;
    board.set(S.g,{last:mm?{from:mm.from,to:mm.to}:null,orient:board.orient});
    status('','Keep going.',''); },450);
}
function hint(){
  if(!S.cur||S.solved||S.sol||S.wait) return;
  const exp=expected(); if(!exp) return;
  if(!S.usedHint&&!S.failedFirst){ S.usedHint=true; saveResult(S.cur.id,false); nextLabel() }
  if(S.hintStage===0){ S.hintStage=1; board.setHint(exp.slice(0,2)); status('warn','Hint: this piece moves.','Press Hint again to see the move.') }
  else{ S.hintStage=2; board.setHint(exp.slice(0,2),exp.slice(2,4)); status('warn','Answer: '+sanOf(S.g.fen(),exp),''); facts(); renderL() }
}
/* Solution (G, 26 Nov 2026, roadmap #262): the rest of the line plays on the board, its first move shown; ← → (and a
   click on a move) step through it. It counts as a miss, as a Hint does (nothing more if the first try already missed);
   only a first try ever moves the rating. A reply still on its timer is dropped: the line starts from the board. */
function solution(){
  if(!S.cur||S.solved||S.sol) return;
  S.gen=(S.gen||0)+1; S.wait=false;
  let dr=null; if(!S.usedHint&&!S.failedFirst){ S.usedHint=true; dr=saveResult(S.cur.id,false) }
  const g=new Chess(S.g.fen()), fens=[g.fen()], sans=[], lasts=[null];
  for(const u of S.cur.moves.slice(S.step)){ const m=g.move({from:u.slice(0,2),to:u.slice(2,4),promotion:u[4]||undefined}); if(!m) break;
    fens.push(g.fen()); sans.push(m.san); lasts.push({from:m.from,to:m.to}) }
  if(!sans.length) return;
  S.sol={fens,sans,lasts}; S.view=1; S.hintStage=2;
  facts(); renderL(); nextLabel(); showSol();
  endbar.show('warn','Solution shown'+(dr!=null?` · ${dr>=0?'+':''}${dr}`:''));
}
/* the solution as move buttons: 24.Qxh7+ Kxh7 25.Rh3# (the current one marked) */
function solLine(){ const o=S.sol, fen=o.fens[0].split(' '); let n=+fen[5]||1, w=fen[1]==='w'; const out=[];
  o.sans.forEach((s,i)=>{ const lab=(w?n+'.':i===0?n+'…':'')+s; out.push(`<button type="button" class="vmv${S.view===i+1?' cur':''}" data-at="${i+1}">${esc(lab)}</button>`); if(!w) n++; w=!w });
  return out.join(' ') }
function showSol(){ const o=S.sol; if(!o) return;
  S.view=Math.max(0,Math.min(o.fens.length-1,S.view));
  board.set(new Chess(o.fens[S.view]),{last:o.lasts[S.view],orient:board.orient,locked:true});
  solButtons();
  const el=$('t-status-box'); el.className='status warn';
  el.innerHTML=`<strong>Solution:</strong> <span class="tsol">${solLine()}</span><br><span class="note">${touch()?'Step through it with ‹ › or tap a move.':'Step through it with ← → or click a move.'} Counted as a miss.</span>`;
}
function stepSol(d){ if(!S.sol) return false; S.view+=d; endbar.hide(); showSol() }
/* As in Chess Lab, the page opens on the first puzzle of the list (nothing is counted until a move is made) */
function first(){ const z=daily(filtered())[0]; if(z) load(z) }
/* Next: the next puzzle after the one on the board, in today's order of the filtered list (26 Nov 2026, roadmap #257: it
   took the first untried puzzle, which is the one on the board until you move, so an untried puzzle could not be
   skipped). The puzzle on the board keeps its place in the order even when the filter now leaves it out (solved, with
   Unsolved chosen). Untried first, then any; it wraps round. */
function next(){
  if(H) return H.next();
  const p=prog(), cur=S.cur, f=filtered();
  const L=daily(cur&&!f.includes(cur)?[...f,cur]:f), i=cur?L.indexOf(cur):-1;
  const after=[...L.slice(i+1),...L.slice(0,Math.max(0,i))];
  const z=after.find(x=>!p[x.id])||after[0]||(f.length?f[0]:null);
  if(z) load(z); else status('warn','No puzzles match these filters.','');
}
function status(tone,head,rest){ const el=$('t-status-box'); el.className='status'+(tone?' '+tone:''); el.innerHTML=`<strong>${esc(head)}</strong>${esc(rest||'')}` }

let libP=null;
function ensure(){
  return libP||(libP=fetch(Site.url('tactics')).then(r=>r.json()).then(j=>{ LIB=j; dispatchEvent(new Event('tactics-lib')); renderHeader(); renderFilters(); renderL(); if(!S.cur) first() })
    .catch(()=>{ LIB=[]; LOADFAIL=true; $('t-list').innerHTML='<p class="empty">The puzzle library could not load. Check the connection and open the tab again.</p>' }));
}
function init(){
  board=makeBoard($('t-board'),{onMove:userMove,expect:()=>S.cur&&!S.solved&&!S.sol?expected():null});
  endbar=endBanner($('t-board'),()=>next(),'Next puzzle');
  board.set(new Chess(),{locked:true});
  /* the puzzle library (2.9 MB) loads when a page needs it (Today, Tactics: ensure()), not on every visit (14 Nov 2026) */
  $('t-list').addEventListener('click',e=>{ const b=e.target.closest('.drill'); if(!b||!LIB) return; const z=LIB.find(x=>x.id===b.dataset.id); if(z){ load(z); if(innerWidth<860) $('t-board').scrollIntoView({behavior:'smooth',block:'start'}) } });
  TV.fitBoard('#t-wrap','#t-tools');
  $('t-next').addEventListener('click',next);
  $('t-hint').addEventListener('click',hint);
  $('t-sol').addEventListener('click',solution);
  $('t-prev').addEventListener('click',()=>stepSol(-1)); $('t-fwd').addEventListener('click',()=>stepSol(1));
  $('t-status-box').addEventListener('click',e=>{ const b=e.target.closest('.tsol .vmv[data-at]'); if(b&&S.sol){ S.view=+b.dataset.at; endbar.hide(); showSol() } });
  $('t-flip').addEventListener('click',()=>board.flip());
  Keys.on('tactics',{n:['Next puzzle (reads Skip before you try it: no result is recorded)',()=>next()],h:['Hint',()=>hint()],g:['Solution: show the answer (counts as a miss)',()=>solution()],
    ArrowLeft:['Back through the solution',()=>stepSol(-1)],ArrowRight:['Forward through the solution',()=>stepSol(1)],f:['Flip the board',()=>board.flip()]});
  addEventListener('hashchange',()=>{ if(location.hash==='#tactics'&&LIB) renderHeader() });   /* the rating and Weak row after an import on Progress */
}
window.TacticsTab={init,ensure,get state(){return S},saveResult,load,next,userMove,hint,solution,stepSol,filtered,host:h=>{ H=h||null },flip:()=>board.flip(),get lib(){return LIB}};
})();
