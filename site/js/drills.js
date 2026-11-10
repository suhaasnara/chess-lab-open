/* Chess Lab Open — drills from your own analyzed games: the position before your
   mistake; find a better move. Judged against Stockfish (within 0.1 winning chances
   of the best line counts, the kit's rule). Drill ids: 'a' + sha1(fen|playedUci)[:8]. */
'use strict';
(function(){
let board=null, endbar=null;
const S={cur:null,g:null,done:false,busy:false,kind:'all'};
const KINDS=[['all','All'],['mine','Your mistakes'],['punish','Punish the mistake']];
const isPunish=d=>d.kind==='punish';
const DEPTH=13;

const drills=()=>Store.get('adrills')||[];
const prog=()=>Store.get('adrills-progress')||{};
function saveResult(id,ok){ const p=prog(); const e=p[id]||{tries:0}; e.tries++; if(ok){ e.ok=true; e.okN=(e.okN||0)+1 } e.t=Date.now(); p[id]=e; Store.put('adrills-progress',p); renderL() }

function renderL(){
  const el=$('d-list'); el.innerHTML='';
  const p=prog();
  const all=drills();
  const ke=$('d-kinds'); ke.innerHTML='';
  for(const [v,name] of KINDS){
    const n=all.filter(d=>v==='all'||(v==='punish')===isPunish(d)).length;
    const c=document.createElement('button'); c.className='chip'; c.textContent=`${name} (${n})`; c.setAttribute('aria-pressed',String(S.kind===v));
    c.addEventListener('click',()=>{ S.kind=v; renderL() }); ke.appendChild(c);
  }
  for(const d of all.filter(d=>S.kind==='all'||(S.kind==='punish')===isPunish(d))){
    const st=p[d.id];
    const b=document.createElement('button'); b.className='drill'; b.setAttribute('aria-current',S.cur&&S.cur.id===d.id?'true':'false');
    b.innerHTML=`<span class="src">${st?(st.ok?'✓':'✗'):''}</span><span><span class="opp">vs ${esc(d.opp)}</span><br><span class="meta">${esc(d.date)} · ${isPunish(d)?'they played '+esc(d.oppMove)+', you '+esc(d.played):'you played '+esc(d.played)}</span></span>${isPunish(d)?'<span class="pill good">Punish</span>':`<span class="pill ${d.drop>=0.3?'bad':'warn'}">−${Math.round(d.drop*100)}%</span>`}`;
    b.addEventListener('click',()=>load(d));
    el.appendChild(b);
  }
  if(!el.children.length) el.innerHTML='<p class="empty">No drills yet. Run <b>Analyze my games</b> first and save drills from your mistakes.</p>';
  const none=!el.querySelector('button.drill')&&!S.cur;   /* nothing to train yet: no buttons that do nothing */
  for(const id of ['d-next','d-show','d-playout']) $(id).disabled=none;
  $('d-lichess').hidden=none;
}
function load(d){
  if(endbar) endbar.hide();
  S.cur=d; S.g=new Chess(d.fen); S.done=false; S.busy=false; S.hintStage=0; S.hinted=false;
  board.set(S.g,{last:null,orient:d.color});
  if(isPunish(d)) status('',`${d.oppMove} was a mistake. Punish it.`,`${S.g.turn()==='w'?'White':'Black'} to move. In the game you played ${d.played}, which let them off (−${Math.round(d.drop*100)}% of the chance they gave you).`,DROP_HELP);
  else status('', (S.g.turn()==='w'?'White':'Black')+' to move — find a better move.',`In the game you played ${d.played} (−${Math.round(d.drop*100)}% winning chances).`,DROP_HELP);
  const goal=playGoal(d); const pb=$('d-playout'); pb.textContent=goal==='win'?'Play it out: win it from here':'Play it out: don’t lose from here';
  pb.title=goal==='win'?'Continue against Stockfish from this position. You were winning before the slip: convert it.':'Continue against Stockfish from this position. Hold it: a draw or better counts.';
  $('d-facts').innerHTML=`<dt>Date</dt><dd>${esc(d.date)}</dd><dt>Opponent</dt><dd>${esc(d.opp)}</dd>
    <dt>You played</dt><dd>${esc(d.played)}</dd><dt>Play it out</dt><dd>${playGoal(d)==='win'?'win from here':'don’t lose from here'}${Help.q('The goal comes from the eval before your slip: from +1.5 or better for you it is a win to convert; otherwise hold the position.')}</dd><dt>Game</dt><dd><a href="${esc(d.url)}" target="_blank" rel="noopener">open ↗</a></dd>`;
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
  saveResult(S.cur.id,!S.hinted);   /* a hinted drill is played through but not counted solved */
  endbar.show('good',`${m.san} ✓ Solved`,'Next drill');
}
async function show(){
  if(!S.cur||S.done) return;
  let u=S.cur.best;
  if(!u){ const a=await SharedEngine.analyse(S.g.fen(),DEPTH,1,10000).catch(()=>null); u=a&&a[0]&&a[0].uci }
  if(!u){ status('warn','No stored answer and no engine.',''); return }
  board.setHint(u.slice(0,2),u.slice(2,4));
  status('warn','Answer: '+sanOf(S.g.fen(),u),'Shown answers don’t count as solved.');
  endbar.show('warn','Answer: '+sanOf(S.g.fen(),u),'Next drill');
  saveResult(S.cur.id,false);
}
/* Play it out: continue from the drill position against Stockfish (Play tab). The goal comes from the eval
   before the slip: from +1.5 for you it is a win (convert); otherwise don't lose (hold), as in the private kit. */
const playGoal=d=>((d.before||0)*(d.color==='w'?1:-1))>=1.5?'win':'hold';
const DROP_HELP='Winning chances (Lichess’s scale, from your side): −34% means the move cut your chances of winning by 34 points.';
function playOut(){
  const d=S.cur; if(!d) return;
  location.hash='#play';
  setTimeout(()=>PlayTab.fromPosition(d.fen,d.color,playGoal(d),'Drill vs '+d.opp),30);
}
/* H: the same two-step hint as the opening trainer (first the piece, then the move); a hinted drill isn't counted solved. */
async function hint(){
  const d=S.cur; if(!d||S.done||S.busy) return;
  let u=d.best; if(!u){ const a=await SharedEngine.analyse(S.g.fen(),DEPTH,1,10000).catch(()=>null); u=a&&a[0]&&a[0].uci } if(!u) return;
  S.hinted=true; S.hintStage=Math.min(2,(S.hintStage||0)+1);
  if(S.hintStage===1){ board.setHint(u.slice(0,2)); status('warn','Hint: this piece.','Press H again for the move. A hinted drill doesn’t count as solved.') }
  else { board.setHint(u.slice(0,2),u.slice(2,4)); status('warn','Hint: '+sanOf(S.g.fen(),u),'Play it to finish. It doesn’t count as solved.') }
}
function next(){ const p=prog(); const d=drills().find(x=>!p[x.id]||!p[x.id].ok)||drills()[0]; if(d) load(d) }
function status(tone,head,rest,help){ const el=$('d-status'); el.className='status'+(tone?' '+tone:''); el.innerHTML=`<strong>${esc(head)}</strong>${esc(rest||'')}${help?Help.q(help):''}` }

function init(){
  board=makeBoard($('d-board'),{onMove:userMove});
  endbar=endBanner($('d-board'),()=>next(),'Next drill');
  board.set(new Chess(),{locked:true});
  renderL();
  $('d-next').addEventListener('click',next);
  $('d-show').addEventListener('click',show);
  $('d-playout').addEventListener('click',playOut);
  $('d-flip').addEventListener('click',()=>board.flip());
  $('d-hint').addEventListener('click',hint);
  Keys.on('drills',{n:['Next drill',()=>next()],h:['Hint (first the piece, then the move)',()=>hint()],f:['Flip the board',()=>board.flip()]});
}
window.DrillsTab={init,hint,refresh:renderL,load,next,userMove,show,playOut,get state(){return S}};
})();
