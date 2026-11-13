/* Chess Lab Open — drills from your own analyzed games: the position before your
   mistake; find a better move. Judged against Stockfish (within 0.1 winning chances
   of the best line counts, the kit's rule). Drill ids: 'a' + sha1(fen|playedUci)[:8]. */
'use strict';
(function(){
let board=null, endbar=null, H=null;   /* H: Today, when it hosts this panel (its next item; told after each result) */
const S={cur:null,g:null,done:false,busy:false,kind:'all',state:'all',plat:'all',q:''};
const KINDS=[['all','All'],['mine','Your mistakes'],['punish','Punish']];
const STATES=[['all','Any'],['new','Not tried'],['missed','Missed'],['solved','Solved']];
const SITE={lichess:'Lichess',chesscom:'Chess.com','chess.com':'Chess.com',pgn:'Over the board',otb:'Over the board'};
/* where a drill's game was played: Lichess, Chess.com, or over the board (a PGN file you analyzed, or a pack's OTB games) */
const platOf=d=>d.site==='lichess'?'lichess':d.site==='chesscom'||d.site==='chess.com'?'chesscom':'otb';
const PLATS=[['all','All'],['otb','OTB'],['lichess','Lichess'],['chesscom','Chess.com']];   // OTB, as the private site's Source row says it
/* an eval in pawns from White's side, as everywhere: +1.6 / −0.8 */
const fmtW=v=>v==null||isNaN(v)?'—':Math.abs(v)>=50?(v>0?'+M':'−M'):(v>0?'+':v<0?'−':'')+Math.abs(v).toFixed(1);
const isPunish=d=>d.kind==='punish';
const DEPTH=13;

const drills=()=>Store.get('adrills')||[];
const prog=()=>Store.get('adrills-progress')||{};
function saveResult(id,ok){ const p=prog(); const e=p[id]||{tries:0}; e.tries++; if(ok){ e.ok=true; e.okN=(e.okN||0)+1 } e.t=Date.now(); p[id]=e; Store.put('adrills-progress',p); renderL(); if(H) H.changed() }

function shown(){ const p=prog(), q=S.q.trim().toLowerCase();
  return drills().filter(d=>{ if(S.kind!=='all'&&(S.kind==='punish')!==isPunish(d)) return false;
    if(S.plat!=='all'&&platOf(d)!==S.plat) return false;
    const st=p[d.id]; if(S.state==='new'&&st) return false; if(S.state==='missed'&&!(st&&!st.ok)) return false; if(S.state==='solved'&&!(st&&st.ok)) return false;
    return !q||String(d.opp||'').toLowerCase().includes(q) }) }
function renderL(){
  const el=$('d-list'), p=prog(), all=drills(), list=shown();
  const n=v=>all.filter(d=>v==='all'||(v==='punish')===isPunish(d)).length;
  $('d-kinds').innerHTML=TV.chips('Type','kind',KINDS.map(([v,l])=>[v,`${l} ${n(v)}`]),S.kind);
  $('d-states').innerHTML=TV.chips('Status','state',STATES,S.state);
  /* Source: only the places these drills come from (no row when they all come from one) */
  const pc=v=>all.filter(d=>platOf(d)===v).length, here=PLATS.filter(([v])=>v==='all'||pc(v));
  if(here.length<=2&&S.plat!=='all') S.plat='all';
  $('d-plats').innerHTML=here.length>2?TV.chips('Source','plat',here.map(([v,l])=>[v,`${l} ${v==='all'?all.length:pc(v)}`]),S.plat):'';
  $('d-searchwrap').hidden=all.length<8;
  $('d-listlabel').textContent=all.length?`${list.length} of ${all.length} positions`:'';
  el.innerHTML=list.map(d=>{ const st=p[d.id];
    return TV.row({badge:fmtW(d.before),badgeTitle:'Stockfish’s eval of this position from White’s side, in pawns (+ favors White)',
      title:`vs ${esc(d.opp)}${isPunish(d)?'<span class="tag punish">Punish</span>':''}`,
      meta:`<span class="src">${esc(SITE[d.site]||d.site||'Game')}</span> · ${esc(d.date||'')} · ${d.color==='w'?'W':'B'} · −${WinPct.pts(d.drop)} Win%`,
      right:TV.dots([[st?(st.ok?'good':'bad'):'','Find the move']]),current:!!(S.cur&&S.cur.id===d.id),data:{id:d.id}}) }).join('');
  el.classList.toggle('isempty',!list.length);
  if(!list.length) el.innerHTML=all.length?'<p class="empty">No drills match these filters.</p>':'<p class="empty">No drills yet. Run <a href="#analyze"><b>Analyze my games</b></a> first and save drills from your mistakes.</p>';
  const none=!all.length&&!S.cur;   /* nothing to train yet: no buttons that do nothing */
  for(const id of ['d-next','d-show','d-hint']) $(id).disabled=none;
  $('d-lichess').hidden=none; $('d-gamecard').hidden=!S.cur;
  if(!S.cur) $('d-head').innerHTML='';
}
function load(d){
  if(endbar) endbar.hide();
  S.cur=d; S.g=new Chess(d.fen); S.done=false; S.busy=false; S.hintStage=0; S.hinted=false;
  board.set(S.g,{last:null,orient:d.color});
  if(isPunish(d)) status('',`${d.oppMove} was a mistake. Punish it.`,`${S.g.turn()==='w'?'White':'Black'} to move. In the game you played ${d.played}, which let them off (it gave back ${WinPct.pts(d.drop)} points of Win%).`,DROP_HELP);
  else status('', (S.g.turn()==='w'?'White':'Black')+' to move — find a better move.',`In the game you played ${d.played}: Win% ${WinPct.change(d.before,d.drop,d.color)}.`,DROP_HELP);
  const goal=playGoal(d);
  $('d-head').innerHTML=TV.head({kicker:`${isPunish(d)?'Punish · ':''}${esc(SITE[d.site]||d.site||'Your game')} · ${esc(d.date||'')}`,
    title:`vs ${esc(d.opp)}`,
    chips:[d.color==='w'?'White':'Black',`<span class="mono">${fmtW(d.before)}</span>${Help.q('Stockfish’s eval of this position from White’s side, in pawns (+ favors White).')}`,
      `Win% ${WinPct.change(d.before,d.drop,d.color)} in the game${Help.q(DROP_HELP)}`],
    extra:`<div class="seg mini" role="group" aria-label="Training mode"><button type="button" aria-pressed="true">Find the move</button><button type="button" id="d-playout" aria-pressed="false" title="${goal==='win'?'Continue against Stockfish from this position. You were winning before the slip: convert it.':'Continue against Stockfish from this position. Hold it: a draw or better counts.'}">Play it out: ${goal==='win'?'win it':'hold it'}</button></div>`});
  $('d-playout').addEventListener('click',playOut);
  $('d-facts').innerHTML=`<dt>Date</dt><dd>${esc(d.date)}</dd><dt>Opponent</dt><dd>${esc(d.opp)}</dd>
    <dt>You played</dt><dd>${esc(d.played)}</dd><dt>Play it out</dt><dd>${playGoal(d)==='win'?'win from here':'don’t lose from here'}${Help.q('The goal comes from the eval before your slip: from +1.5 or better for you it is a win to convert; otherwise hold the position.')}</dd>${d.url?`<dt>Game</dt><dd><a href="${esc(d.url)}" target="_blank" rel="noopener">open ↗</a></dd>`:''}`;
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
    status('bad',`${m.san} still gives away ${WinPct.pts(drop)} points of Win%.`,'Try again, or Show the answer.') }
}
function finish(m,ok,text){
  S.g.move(m); S.done=true;
  board.set(S.g,{last:{from:m.from,to:m.to}});
  board.flash([m.from,m.to],'good');
  status('good',`${m.san} ✓`,text||'');
  saveResult(S.cur.id,!S.hinted);   /* a hinted drill is played through but not counted solved */
  endbar.show('good',`${m.san} ✓ Solved`,H?'Next in session':'Next drill');
}
async function show(){
  if(!S.cur||S.done) return;
  let u=S.cur.best;
  if(!u){ const a=await SharedEngine.analyse(S.g.fen(),DEPTH,1,10000).catch(()=>null); u=a&&a[0]&&a[0].uci }
  if(!u){ status('warn','No stored answer and no engine.',''); return }
  board.setHint(u.slice(0,2),u.slice(2,4));
  status('warn','Answer: '+sanOf(S.g.fen(),u),'Shown answers don’t count as solved.');
  endbar.show('warn','Answer: '+sanOf(S.g.fen(),u),H?'Next in session':'Next drill');
  saveResult(S.cur.id,false);
}
/* Play it out: continue from the drill position against Stockfish (Play tab). The goal comes from the eval
   before the slip: from +1.5 for you it is a win (convert); otherwise don't lose (hold), as in the private kit. */
const playGoal=d=>((d.before||0)*(d.color==='w'?1:-1))>=1.5?'win':'hold';
const DROP_HELP=WinPct.HELP;
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
function next(){ if(H) return H.next(); const p=prog(); const d=drills().find(x=>!p[x.id]||!p[x.id].ok)||drills()[0]; if(d) load(d) }
function status(tone,head,rest,help){ const el=$('d-status'); el.className='status'+(tone?' '+tone:''); el.innerHTML=`<strong>${esc(head)}</strong>${esc(rest||'')}${help?Help.q(help):''}` }

function init(){
  board=makeBoard($('d-board'),{onMove:userMove});
  $('d-list').addEventListener('click',e=>{ const b=e.target.closest('.drill'); if(!b) return; const d=drills().find(x=>x.id===b.dataset.id); if(d){ load(d); if(innerWidth<860) $('d-board').scrollIntoView({behavior:'smooth',block:'start'}) } });
  TV.onChip($('d-filters'),(k,v)=>{ S[k]=v; renderL() });
  $('d-search').addEventListener('input',e=>{ S.q=e.target.value; renderL() });
  TV.fitBoard('#d-wrap','#d-tools');
  endbar=endBanner($('d-board'),()=>next(),'Next drill');
  board.set(new Chess(),{locked:true});
  renderL();
  $('d-next').addEventListener('click',next);
  $('d-show').addEventListener('click',show);
  $('d-flip').addEventListener('click',()=>board.flip());
  $('d-hint').addEventListener('click',hint);
  Keys.on('drills',{'/':['Search drills',()=>{ const i=$('d-search'); if(i&&!$('d-searchwrap').hidden){ i.focus(); i.select() } }],n:['Next drill',()=>next()],h:['Hint (first the piece, then the move)',()=>hint()],f:['Flip the board',()=>board.flip()]});
}
window.DrillsTab={init,hint,refresh:renderL,load,next,userMove,show,playOut,host:h=>{ H=h||null },flip:()=>board.flip(),get state(){return S}};
})();
