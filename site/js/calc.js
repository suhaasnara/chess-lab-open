/* Chess Lab Open — Calculation: see the whole line before you play it.
   Exercises: data/calc.json, hard long Lichess puzzles (CC0, rating 2200+, 4+ moves for the solver,
   built by tools/pick_calc.py); without it, the long puzzles in data/tactics.json.
   You enter the full line on a free board (both sides' moves), against a running clock, then Submit.
   Grading: how far your line follows the solution (every ply, both sides); a different first move is
   checked by Stockfish and counts if it is within 0.1 winning chances of the solution's move.
   Then step through the solution with ← →. Progress stays in this browser. */
'use strict';
(function(){
let board=null, LIB=null, endbar=null;
const S={cur:null,start:null,g:null,line:[],sub:false,t0:0,tick:null,len:'all',lo:null,hi:null,view:0,busy:false,st:'all'};
const STS=[['all','All'],['unsolved','Unsolved'],['missed','Missed or partly'],['solved','Solved']];
const prog=()=>Store.get('calc-progress')||{};
const mine=z=>Math.floor(z.moves.length/2);                 /* the solver's moves (the first move is the setup) */
const LENS=[['all','Any length'],['4','4 moves'],['5','5 moves'],['6','6+ moves']];
const HARD=[['0','All'],['2200','2200+'],['2400','2400+'],['2600','2600+']];

function list(){
  if(!LIB) return [];
  const p=prog();
  return LIB.filter(z=>{ if(mine(z)<4||(S.lo!=null&&z.rating<S.lo)||(S.hi!=null&&z.rating>S.hi)||!(S.len==='all'||(S.len==='6'?mine(z)>=6:mine(z)===+S.len))) return false;
    const r=p[z.id]; return S.st==='all'||(S.st==='unsolved'?!r:S.st==='missed'?!!r&&r.score<1:!!r&&r.score>=1) }).sort((a,b)=>a.rating-b.rating);
}
/* The lobby (shared screens: Chess Lab's Calculation start page): filters, Start, a summary by length | the list */
let RNG=null;
const sideOf=z=>{ try{ return new Chess(z.fen).turn()==='w'?'Black':'White' }catch(e){ return '' } };   /* the setup move is the opponent's */
function chipFor(r){ return !r?['','—']:r.score>=1?['ok','✓']:r.score>0?['part',Math.round(r.score*100)+'%']:['bad','✗'] }
function renderList(){
  if(LIB&&LIB.length&&!RNG){ const rs=LIB.map(z=>z.rating), lo=Math.floor(Math.min(...rs)/100)*100, hi=Math.ceil(Math.max(...rs)/100)*100;   /* rating: two handles, 100-point steps */
    RNG=Controls.range($('cc-range'),{label:'Puzzle rating',min:lo,max:hi,step:100,lo:S.lo==null?lo:S.lo,hi:S.hi==null?hi:S.hi,onChange:(a,b)=>{ S.lo=a<=lo?null:a; S.hi=b>=hi?null:b; renderList() }}) }
  $('cc-lens').innerHTML=TV.chips('','len',LENS,S.len)+TV.chips('','st',STS,S.st);
  const L=list(), p=prog();
  $('cc-count').textContent=LIB?Help.n(L.length,'exercise'):'';
  $('cc-start').disabled=!L.length; $('cc-start').textContent=L.length?'Start'+(S.st==='all'||S.st==='unsolved'?' · next unsolved':' · first in this list'):'Start';
  const groups=[['4','4 moves'],['5','5 moves'],['6','6+ moves']].map(([k,n])=>{ const xs=(LIB||[]).filter(z=>k==='6'?mine(z)>=6:mine(z)===+k), done=xs.filter(z=>p[z.id]);
    const ok=done.filter(z=>p[z.id].score>=1).length, tn=done.filter(z=>p[z.id].secs), t=tn.reduce((a,z)=>a+p[z.id].secs,0);
    return `<tr><td>${n}</td><td class="num">${done.length}/${xs.length}</td><td class="num">${done.length?Math.round(100*ok/done.length)+'%':'—'}</td><td class="num">${tn.length?fmt(Math.round(t/tn.length)):'—'}</td></tr>` });
  $('cc-stats').innerHTML=`<thead><tr><th>Length</th><th class="num">Done</th><th class="num">Solved</th><th class="num">Avg time</th></tr></thead><tbody>${groups.join('')}</tbody>`;
  $('cc-list').innerHTML=L.slice(0,400).map(z=>{ const r=p[z.id], c=chipFor(r);
    return `<button type="button" class="drill" data-id="${esc(z.id)}" aria-current="${!!(S.cur&&S.cur.id===z.id)}"><span class="evalchip ${c[0]}">${c[1]}</span><span><div class="opp">${esc(Puzzles.title(z.id,themeName(z.motif),!!r,Puzzles.num(LIB,z.id)))}</div><div class="meta">${mine(z)} moves · ${z.rating} · ${sideOf(z)} to move</div></span><span class="note">${r&&r.secs?fmt(r.secs):''}</span></button>` }).join('')
    ||`<p class="note">${LIB?'Nothing here with these filters.':'Loading exercises…'}</p>`;
  if(L.length>400) $('cc-list').insertAdjacentHTML('beforeend','<p class="note">Showing the first 400; narrow the rating or length to see the rest.</p>');
}
function showTrain(on){ $('cc-lobby').hidden=on; $('cc-train').hidden=!on }
function lobby(){ clearInterval(S.tick); S.cur=null; if(endbar) endbar.hide(); showTrain(false); renderList(); scrollTo(0,0) }
function fmt(s){ return Math.floor(s/60)+':'+String(s%60).padStart(2,'0') }
function load(z){
  if(endbar) endbar.hide();
  S.cur=z; S.line=[]; S.sub=false; S.view=0; S.busy=false; { const sl=$('cc-readslot'); if(sl) sl.innerHTML='' }
  const g=new Chess(z.fen); const u=z.moves[0]; const m=g.move({from:u.slice(0,2),to:u.slice(2,4),promotion:u[4]||'q'});
  S.start=g.fen(); S.g=new Chess(S.start); S.last=m?{from:m.from,to:m.to}:null;
  board.set(S.g,{last:S.last,orient:S.g.turn(),locked:false});
  clearInterval(S.tick); S.t0=Date.now(); S.tick=setInterval(()=>{ $('cc-clock').textContent=fmt(Math.round((Date.now()-S.t0)/1000)) },1000);
  $('cc-clock').textContent='0:00';
  status('',`${S.g.turn()==='w'?'White':'Black'} to move. See ${mine(z)} moves deep.`,'Play the whole line (your moves and the replies you expect), then Submit.');
  showTrain(true);
  $('cc-head').innerHTML=TV.head({kicker:'Lichess puzzle',title:esc(Puzzles.title(z.id,themeName(z.motif),!!prog()[z.id],Puzzles.num(LIB,z.id))),chips:[`<span class="mono">${z.rating}</span>`,`${mine(z)} moves for you`,(S.g.turn()==='w'?'White':'Black')+' to move']});
  $('cc-facts').innerHTML=`<dt>Length</dt><dd>${mine(z)} moves for you</dd><dt>Rating</dt><dd>${z.rating}</dd><dt>Motif</dt><dd>${esc(Puzzles.theme(themeName(z.motif),!!S.sub))}</dd>`;
  $('cc-lichess').href=z.url||'#';
  renderLine(); renderList();
}
function sanLine(fen,ucis){ const g=new Chess(fen); const out=[]; for(const u of ucis){ const m=g.move({from:u.slice(0,2),to:u.slice(2,4),promotion:u[4]||'q'}); if(!m) break; out.push(m.san) } return out }
function numbered(fen,sans,hi,click){
  const white=fen.split(' ')[1]==='w', n0=+fen.split(' ')[5]||1;
  return sans.map((s,i)=>{ const ply=i+(white?0:1); const no=Math.floor(ply/2)+n0;
    const pre=ply%2===0?no+'. ':(i===0?no+'… ':'');
    return click?`<button type="button" class="vmv ${hi&&hi(i)||''}" data-at="${i+1}">${pre}${esc(s)}</button>`:`<span class="${hi&&hi(i)||''}">${pre}${esc(s)}</span>` }).join(' ');
}
function renderLine(){
  const z=S.cur; if(!z) return;
  if(!S.sub){ const yours=sanLine(S.start,S.line);
    $('cc-line').innerHTML=yours.length?numbered(S.start,yours):'<span class="note">Your line appears here.</span>' }
  $('cc-submit').disabled=S.sub||!S.line.length; $('cc-undo').disabled=S.sub||!S.line.length;
  $('cc-next').classList.toggle('primary',!!S.sub);   /* 14 Nov: one filled button: Submit until the line is in, then Next */
}
function userMove(from,to,promo){
  if(!S.cur||S.sub) return;
  const m=S.g.move({from,to,promotion:promo||'q'}); if(!m) return;
  S.line.push(m.from+m.to+(m.promotion||''));
  board.set(S.g,{last:{from:m.from,to:m.to}});
  renderLine();
}
function undo(){ if(S.sub||!S.line.length) return; S.line.pop(); S.g=new Chess(S.start); for(const u of S.line) S.g.move({from:u.slice(0,2),to:u.slice(2,4),promotion:u[4]||'q'});
  board.set(S.g,{last:null}); renderLine() }
function reset(){ if(S.sub) return; S.line=[]; S.g=new Chess(S.start); board.set(S.g,{last:S.last}); renderLine() }
const same=(a,b)=>a&&b&&a.slice(0,4)===b.slice(0,4)&&(a[4]||'q')===(b[4]||'q');
async function submit(){
  const z=S.cur; if(!z||S.sub||!S.line.length||S.busy) return;
  const sol=z.moves.slice(1);
  let k=0; while(k<sol.length&&k<S.line.length&&same(S.line[k],sol[k])) k++;
  let score, head, tone;
  if(k===0){
    /* a different first move: Stockfish decides whether it is as good */
    S.busy=true; status('','Checking your first move with Stockfish…','');
    let alt=false;
    try{
      const g=new Chess(S.start); const sideW=g.turn()==='w';
      const ev=async u=>{ const t=new Chess(S.start); t.move({from:u.slice(0,2),to:u.slice(2,4),promotion:u[4]||'q'});
        if(t.in_checkmate()) return 15; const a=await SharedEngine.analyse(t.fen(),14,1,8000); if(!a||!a.length) throw 0;
        return a[0].mate!=null?(a[0].mate>0?-15:15):-a[0].cp };
      const [mineP,solP]=[await ev(S.line[0]),await ev(sol[0])];
      alt=wc(solP)-wc(mineP)<=0.1; void sideW;
    }catch(e){}
    S.busy=false;
    score=alt?0.5:0; tone=alt?'warn':'bad'; head=alt?'A different first move that works just as well.':'Not the right first move.';
  }else if(k>=sol.length){ score=1; tone='good'; head='Solved: you saw the whole line ✓' }
  else{ score=Math.max(0.5,k/sol.length); tone=k>=sol.length-1?'good':'warn'; head=`You saw ${k} of ${sol.length} plies.` }
  S.sub=true; clearInterval(S.tick);
  const secs=Math.round((Date.now()-S.t0)/1000);
  const p=prog(); const prev=p[z.id]; p[z.id]={score:Math.max(score,prev?prev.score:0),t:Date.now(),secs,tries:(prev?prev.tries:0)+1}; Store.put('calc-progress',p);
  const ss=sanLine(S.start,sol);
  status(tone,head,`${fmt(secs)} · the solution is below; step through it with ← →.`);
  endbar.show(tone==='bad'?'bad':score>=1?'good':'warn',`${head} ${Math.round(score*100)}% · ${fmt(secs)}`,'Next exercise');
  $('cc-line').innerHTML=`<div><span class="label">Your line</span><br>${numbered(S.start,sanLine(S.start,S.line),i=>i<k?'ok':'miss')}</div>
    <div style="margin-top:8px"><span class="label">Solution</span><br><span class="ccsol">${numbered(S.start,ss,i=>i<k?'ok':'',true)}</span></div>`;
  S.view=0; showView(); renderLine(); renderList();
}
function showView(){
  if(!S.sub) return;
  const sol=S.cur.moves.slice(1); S.view=Math.max(0,Math.min(sol.length,S.view));
  const g=new Chess(S.start); let last=S.last;
  for(let i=0;i<S.view;i++){ const u=sol[i]; const m=g.move({from:u.slice(0,2),to:u.slice(2,4),promotion:u[4]||'q'}); if(m) last={from:m.from,to:m.to} }
  S.g=g; board.set(g,{last,locked:true});
  $('cc-step').textContent=`${S.view} / ${sol.length}`;
  document.querySelectorAll('#cc-line .ccsol .vmv[data-at]').forEach(b=>b.classList.toggle('cur',+b.dataset.at===S.view));
  const slot=$('cc-readslot'); if(slot&&!slot.firstChild){ const ss=sanLine(S.start,sol); slot.appendChild(Reader.button(()=>Reader.open({title:'Solution · '+Puzzles.title(S.cur.id,'',false,Puzzles.num(LIB,S.cur.id)),fen:S.start,orient:board.orient,lines:ss.map(san=>({san})),at:S.view}))) }
}
function next(){ const p=prog(); const L=list(); const i=L.findIndex(z=>S.cur&&z.id===S.cur.id);
  const z=L.slice(i+1).find(x=>!p[x.id]||p[x.id].score<1)||L.find(x=>!p[x.id])||L[0]; if(z) load(z) }
function status(tone,head,rest){ const el=$('cc-status'); el.className='status'+(tone?' '+tone:''); el.innerHTML=`<strong>${esc(head)}</strong>${esc(rest||'')}` }

function init(){
  board=makeBoard($('cc-board'),{onMove:userMove});
  endbar=endBanner($('cc-board'),()=>next(),'Next exercise');
  board.set(new Chess(),{locked:true});
  $('cc-submit').addEventListener('click',submit);
  $('cc-undo').addEventListener('click',undo);
  $('cc-reset').addEventListener('click',reset);
  $('cc-next').addEventListener('click',next);
  $('cc-back').addEventListener('click',lobby);
  $('cc-start').addEventListener('click',()=>{ const L=list(), p=prog(); const z=(S.st==='all'||S.st==='unsolved'?L.find(x=>!p[x.id]):null)||L[0]; if(z) load(z) });
  $('cc-list').addEventListener('click',e=>{ const b=e.target.closest('.drill[data-id]'); if(!b||!LIB) return; const z=LIB.find(x=>x.id===b.dataset.id); if(z) load(z) });
  TV.onChip($('cc-lens'),(k,v)=>{ S[k]=v; renderList() });
  TV.fitBoard('#cc-wrap','#cc-tools');
  $('cc-flip').addEventListener('click',()=>board.flip());
  /* stepping through the solution moves the result banner out of the way */
  $('cc-prev').addEventListener('click',()=>{ S.view--; endbar.hide(); showView() });
  $('cc-line').addEventListener('click',e=>{ const b=e.target.closest('.ccsol .vmv[data-at]'); if(b&&S.sub){ S.view=+b.dataset.at; endbar.hide(); showView() } });
  $('cc-fwd').addEventListener('click',()=>{ S.view++; endbar.hide(); showView() });
  Keys.on('calc',{ArrowLeft:['Back a move (your line, or the solution)',()=>{ if(S.sub){ S.view--; endbar.hide(); showView() } else undo() }],
    ArrowRight:['Forward through the solution',()=>{ if(!S.sub) return false; S.view++; endbar.hide(); showView() }],
    b:['Take back your last entered move',()=>{ if(S.sub) return false; undo() }],
    r:['Reset: clear your line and start again',()=>{ if(S.sub) return false; reset() }],
    n:['Next exercise',()=>next()], f:['Flip the board',()=>board.flip()]});
  document.addEventListener('keydown',e=>{ if(document.body.dataset.view==='calc'&&e.key==='Enter'&&!S.sub&&!/INPUT|TEXTAREA|SELECT|BUTTON/.test(e.target.tagName)) submit() });
}
/* data/calc.json loads the first time Calculation or Progress is opened (not on every visit). */
let libP=null;
function ensure(){
  if(!libP) libP=fetch(Site.url('calc')).then(r=>{ if(!r.ok) throw 0; return r.json() })
    .catch(()=>fetch(Site.url('tactics')).then(r=>r.json()))
    .then(j=>{ LIB=j; renderList() }).catch(()=>{ LIB=[]; renderList() });
  return libP;
}
window.CalcTab={ensure,init,load,lobby,userMove,undo,reset,submit,next,get state(){return S},get lib(){return LIB}};
})();
