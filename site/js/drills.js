/* Chess Lab Open — drills from your own analyzed games: the position before your
   mistake; find a better move. Judged against Stockfish (within 0.1 winning chances
   of the best line counts, the kit's rule). Drill ids: 'a' + sha1(fen|playedUci)[:8]. */
'use strict';
(function(){
let board=null;
const S={cur:null,g:null,done:false,busy:false};
const DEPTH=13;

const drills=()=>Store.get('adrills')||[];
const prog=()=>Store.get('adrills-progress')||{};
function saveResult(id,ok){ const p=prog(); const e=p[id]||{tries:0}; e.tries++; if(ok) e.ok=true; e.t=Date.now(); p[id]=e; Store.put('adrills-progress',p); renderL() }

function renderL(){
  const el=$('d-list'); el.innerHTML='';
  const p=prog();
  for(const d of drills()){
    const st=p[d.id];
    const b=document.createElement('button'); b.className='drill'; b.setAttribute('aria-current',S.cur&&S.cur.id===d.id?'true':'false');
    b.innerHTML=`<span class="src">${st?(st.ok?'✓':'✗'):''}</span><span><span class="opp">vs ${esc(d.opp)}</span><br><span class="meta">${esc(d.date)} · you played ${esc(d.played)}</span></span><span class="pill ${d.drop>=0.3?'bad':'warn'}">−${Math.round(d.drop*100)}%</span>`;
    b.addEventListener('click',()=>load(d));
    el.appendChild(b);
  }
  if(!el.children.length) el.innerHTML='<p class="empty">No drills yet. Run <b>Analyze my games</b> first and save drills from your mistakes.</p>';
}
function load(d){
  S.cur=d; S.g=new Chess(d.fen); S.done=false; S.busy=false;
  board.set(S.g,{last:null,orient:d.color});
  status('', (S.g.turn()==='w'?'White':'Black')+' to move — find a better move.',`In the game you played ${d.played} (−${Math.round(d.drop*100)}% winning chances).`);
  $('d-facts').innerHTML=`<dt>Date</dt><dd>${esc(d.date)}</dd><dt>Opponent</dt><dd>${esc(d.opp)}</dd>
    <dt>You played</dt><dd>${esc(d.played)}</dd><dt>Game</dt><dd><a href="${esc(d.url)}" target="_blank" rel="noopener">open ↗</a></dd>`;
  $('d-lichess').href='https://lichess.org/analysis/'+encodeURIComponent(d.fen.replace(/ /g,'_'));
  renderL();
}
async function userMove(from,to,promo){
  if(!S.cur||S.done||S.busy) return;
  const d=S.cur;
  const test=new Chess(S.g.fen()); const m=test.move({from,to,promotion:promo||'q'}); if(!m) return;
  const uci=from+to+(m.promotion||'');
  if(uci.slice(0,4)===d.playedUci.slice(0,4)){ board.flash([from,to],'bad'); status('bad',`${m.san} is the game move.`,'Find something better.'); saveResult(d.id,false); return }
  if(d.best&&uci.slice(0,4)===d.best.slice(0,4)){ finish(m,true,'The engine’s choice.'); return }
  S.busy=true; status('','Checking with Stockfish…','');
  const a=await SharedEngine.analyse(S.g.fen(),DEPTH,3,10000).catch(()=>null);
  S.busy=false;
  if(!a||!a.length){ status('warn','The engine isn’t available; comparing to the stored best move only.','');
    if(d.best){ board.flash([from,to],'bad'); status('bad',`The stored best move is ${sanOf(S.g.fen(),d.best)}.`,''); saveResult(d.id,false) } return }
  const me=S.g.turn()==='w'?1:-1;
  const bestP=cpPawns((a[0].mate!=null?(a[0].mate>0?9900:-9900):a[0].cp*100));
  const mineRow=a.find(x=>x.uci.slice(0,4)===uci.slice(0,4));
  let mineP;
  if(mineRow) mineP=cpPawns(mineRow.mate!=null?(mineRow.mate>0?9900:-9900):mineRow.cp*100);
  else{ const after=await SharedEngine.analyse(test.fen(),DEPTH,1,10000).catch(()=>null);
    mineP=after&&after.length?-cpPawns(after[0].mate!=null?(after[0].mate>0?9900:-9900):after[0].cp*100):null }
  if(mineP==null){ status('warn','Could not judge that move.',''); return }
  const drop=wc(bestP)-wc(mineP);
  if(drop<0.1) finish(m,true,`Good: about as strong as ${sanOf(S.g.fen(),a[0].uci)} (best).`);
  else{ board.flash([from,to],'bad'); saveResult(d.id,false);
    status('bad',`${m.san} still gives away ${Math.round(drop*100)}% winning chances.`,'Try again, or Show the answer.') }
}
function finish(m,ok,text){
  S.g.move(m); S.done=true;
  board.set(S.g,{last:{from:m.from,to:m.to}});
  board.flash([m.from,m.to],'good');
  status('good',`${m.san} ✓`,text||'');
  saveResult(S.cur.id,true);
}
async function show(){
  if(!S.cur||S.done) return;
  let u=S.cur.best;
  if(!u){ const a=await SharedEngine.analyse(S.g.fen(),DEPTH,1,10000).catch(()=>null); u=a&&a[0]&&a[0].uci }
  if(!u){ status('warn','No stored answer and no engine.',''); return }
  board.setHint(u.slice(0,2),u.slice(2,4));
  status('warn','Answer: '+sanOf(S.g.fen(),u),'Shown answers don’t count as solved.');
  saveResult(S.cur.id,false);
}
function next(){ const p=prog(); const d=drills().find(x=>!p[x.id]||!p[x.id].ok)||drills()[0]; if(d) load(d) }
function status(tone,head,rest){ const el=$('d-status'); el.className='status'+(tone?' '+tone:''); el.innerHTML=`<strong>${esc(head)}</strong>${esc(rest||'')}` }

function init(){
  board=makeBoard($('d-board'),{onMove:userMove});
  board.set(new Chess(),{locked:true});
  renderL();
  $('d-next').addEventListener('click',next);
  $('d-show').addEventListener('click',show);
  $('d-flip').addEventListener('click',()=>board.flip());
  document.addEventListener('keydown',e=>{
    if(document.body.dataset.view!=='drills') return;
    if(/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if(e.key==='n'||e.key==='N') next();
    if(e.key==='f'||e.key==='F') board.flip();
  });
}
window.DrillsTab={init,refresh:renderL,load,next,userMove,show,get state(){return S}};
})();
