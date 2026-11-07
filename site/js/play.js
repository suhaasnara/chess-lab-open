/* Chess Lab Open — Play vs Stockfish at a chosen strength, with a blindfold option.
   Limited strength uses the engine's own UCI_LimitStrength / UCI_Elo (its scale,
   1320–3190); the limit is switched off right after each move so analysis stays
   full strength. Blindfold: no pieces, no move dots; moves by typing or tapping;
   Peek shows the pieces for 2 seconds (counted). Last 30 games stay in this browser. */
'use strict';
(function(){
let board=null;
const S={g:null,me:'w',elo:1800,blind:false,peeks:0,over:false,busy:false,resignArm:false,moves:[],start:null,goal:null,label:'',takebacks:0,gid:0};

function games(){ return Store.get('play-games')||[] }
function saveGame(result,reason){
  const list=games();
  list.unshift({t:Date.now(),me:S.me,elo:S.elo,blind:S.blind,peeks:S.peeks,takebacks:S.takebacks||undefined,result,reason,moves:S.moves.join(' '),fen:S.start||undefined,goal:S.goal||undefined,label:S.label||undefined});
  Store.put('play-games',list.slice(0,30)); renderGames();
}
function renderGames(){
  const list=games();
  const el=$('pl-games');
  const W=list.filter(g=>g.result==='win').length,D=list.filter(g=>g.result==='draw').length,L=list.length-W-D;
  el.innerHTML=(list.length?`<p class="note">${W} wins · ${D} draws · ${L} losses</p>`:'<p class="note">No games yet.</p>')+
    list.slice(0,12).map(g=>`<div class="gamerow"><span class="src">${new Date(g.t).toISOString().slice(0,10)}</span>
      <span>${g.goal?'Play it out ('+(g.goal==='win'?'convert':'hold')+') · ':''}${g.me==='w'?'White':'Black'} vs Stockfish${g.elo==='max'?'':' ('+g.elo+')'}${g.blind?' · blindfold'+(g.peeks?' ('+g.peeks+' peeks)':''):''}${g.takebacks?' · '+g.takebacks+' takeback'+(g.takebacks>1?'s':''):''}</span>
      <span class="pill ${g.result==='win'?'good':g.result==='draw'?'none':'bad'}">${g.result}</span>
      <a class="note" href="${g.fen?'https://lichess.org/analysis/'+encodeURIComponent(g.fen.replace(/ /g,'_')):'https://lichess.org/analysis/pgn/'+encodeURIComponent(g.moves)}" target="_blank" rel="noopener">review ↗</a></div>`).join('');
}
function newGame(){
  S.start=null; S.goal=null; S.label='';
  S.g=new Chess(); S.moves=[]; S.over=false; S.busy=false; S.resignArm=false; S.peeks=0; S.takebacks=0; S.gid++;
  S.elo=$('pl-elo').value==='max'?'max':+$('pl-elo').value;
  const c=$('pl-color').value; S.me=c==='random'?(Math.random()<0.5?'w':'b'):c;
  S.blind=$('pl-blind').checked;
  $('pl-board').classList.toggle('blind',S.blind);
  board.set(S.g,{orient:S.me,last:null});
  renderMoves();
  status('', 'New game.',`You are ${S.me==='w'?'White':'Black'} vs Stockfish${S.elo==='max'?' at full strength':' ('+S.elo+')'}${S.blind?' — blindfold':''}.`);
  if(S.g.turn()!==S.me) botMove();
}
/* From a drill: same strength setting, no blindfold; goal 'win' (convert) or 'hold' (don't lose). */
function fromPosition(fen,me,goal,label){
  S.g=new Chess(fen); S.start=fen; S.goal=goal; S.label=label||''; S.moves=[]; S.over=false; S.busy=false; S.resignArm=false; S.peeks=0; S.takebacks=0; S.gid++;
  S.elo=$('pl-elo').value==='max'?'max':+$('pl-elo').value; S.me=me; S.blind=false;
  $('pl-board').classList.remove('blind');
  board.set(S.g,{orient:S.me,last:null});
  renderMoves();
  status('',goal==='win'?'Play it out: convert the advantage.':'Play it out: hold the position.',
    `${S.label?S.label+' · ':''}you are ${S.me==='w'?'White':'Black'} vs Stockfish${S.elo==='max'?' at full strength':' ('+S.elo+')'}. ${goal==='win'?'Win it.':'Don’t lose it.'}`);
  if(S.g.turn()!==S.me) botMove();
}
async function botMove(){
  if(S.over) return;
  S.busy=true; tools(); const gid=S.gid;
  let uci=null;
  if(S.elo==='max'){ const a=await SharedEngine.analyse(S.g.fen(),14,1,12000).catch(()=>null); uci=a&&a[0]&&a[0].uci }
  else uci=await SharedEngine.play(S.g.fen(),S.elo,700).catch(()=>null);
  if(gid!==S.gid) return;   /* a take back or a new game while the engine thought */
  S.busy=false;
  if(S.over) return;
  if(!uci){ status('warn','The engine is not available.','Check Settings, or try again.'); return }
  const m=S.g.move({from:uci.slice(0,2),to:uci.slice(2,4),promotion:uci[4]||'q'});
  if(!m){ status('warn','Engine move failed.',''); return }
  S.moves.push(m.san);
  board.set(S.g,{last:{from:m.from,to:m.to},orient:S.me});
  renderMoves();
  if(!checkEnd()) status('', 'Your move.',m.san+' played.'+(S.takebacks?` Takebacks: ${S.takebacks}.`:''));
  tools();
}
/* Take back your last move (and the engine's reply to it); counted on the saved game. */
const myMoveCount=()=>{ const first=S.start?new Chess(S.start).turn():'w'; return S.moves.filter((_,i)=>(i%2===0?first:(first==='w'?'b':'w'))===S.me).length };
const canTakeBack=()=>!!(S.g&&!S.over&&myMoveCount()>0);
function takeBack(){
  if(!canTakeBack()) return;
  S.gid++; S.busy=false; S.resignArm=false;
  do{ S.g.undo(); S.moves.pop() }while(S.moves.length&&S.g.turn()!==S.me);
  if(S.g.turn()!==S.me){ botMove(); }
  S.takebacks++;
  const h=S.g.history({verbose:true}), m=h[h.length-1];
  board.set(S.g,{last:m?{from:m.from,to:m.to}:null,orient:board.orient});
  renderMoves(); tools();
  status('warn','Taken back.',`Your move again. Takebacks this game: ${S.takebacks} (saved with the game).`);
}
function tools(){ const b=$('pl-back'); if(b) b.disabled=!canTakeBack() }
function userMove(from,to,promo){
  if(!S.g||S.over||S.busy) return;
  if(S.g.turn()!==S.me) return;
  const m=S.g.move({from,to,promotion:promo||'q'});
  if(!m) return;
  S.moves.push(m.san); S.resignArm=false;
  board.set(S.g,{last:{from:m.from,to:m.to},orient:S.me});
  renderMoves();
  if(!checkEnd()){ status('', 'Stockfish is thinking…',''); botMove() }
  tools();
}
function checkEnd(){
  const g=S.g; let result=null, reason='';
  if(g.in_checkmate()){ result=g.turn()===S.me?'loss':'win'; reason='checkmate' }
  else if(g.in_stalemate()){ result='draw'; reason='stalemate' }
  else if(g.in_threefold_repetition()){ result='draw'; reason='threefold repetition' }
  else if(g.insufficient_material()){ result='draw'; reason='insufficient material' }
  else if(g.in_draw()){ result='draw'; reason='fifty-move rule' }
  if(!result) return false;
  endGame(result,reason); return true;
}
function endGame(result,reason){
  S.over=true;
  $('pl-board').classList.remove('blind');
  board.set(S.g,{last:null,orient:S.me,locked:true});
  const met=S.goal?(S.goal==='win'?result==='win':result!=='loss'):null;
  status(result==='win'||met?'good':result==='draw'?'':'bad',
    (result==='win'?'You won!':result==='draw'?'Draw.':'Stockfish wins.')+(S.goal?(met?' Goal met ✓':' Goal missed'):''),
    reason+(S.blind?` · blindfold${S.peeks?', '+S.peeks+' peeks':''}`:'')+'. The pieces are back; review below.');
  saveGame(result,reason); tools();
}
function resign(){
  if(!S.g||S.over) return;
  if(!S.resignArm){ S.resignArm=true; status('warn','Resign?','Press Resign again to confirm.'); return }
  endGame('loss','resignation');
}
function peek(){
  if(!S.blind||S.over) return;
  S.peeks++;
  const b=$('pl-board'); b.classList.remove('blind');
  status('warn','Peek '+S.peeks,'The pieces hide again in 2 seconds.');
  setTimeout(()=>{ if(S.blind&&!S.over) b.classList.add('blind') },2000);
}
function renderMoves(){
  const el=$('pl-moves'); let html='';
  S.moves.forEach((s,i)=>{ if(i%2===0) html+=`<span class="note">${i/2+1}.</span> `; html+=`<b>${esc(s)}</b> ` });
  el.innerHTML=html||'<span class="note">No moves yet.</span>';
  const strip=S.moves.slice(-8);
  $('pl-strip').innerHTML=strip.map((s,i)=>i===strip.length-1?`<b>${esc(s)}</b>`:esc(s)).join(' · ');
}
function status(tone,head,rest){ const el=$('pl-status'); el.className='status'+(tone?' '+tone:''); el.innerHTML=`<strong>${esc(head)}</strong>${esc(rest||'')}` }

function init(){
  board=makeBoard($('pl-board'),{onMove:userMove});
  board.set(new Chess(),{locked:true});
  renderGames();
  $('pl-new').addEventListener('click',newGame);
  $('pl-resign').addEventListener('click',resign);
  $('pl-back').addEventListener('click',takeBack);
  document.addEventListener('keydown',e=>{ if(document.body.dataset.view!=='play'||/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)||e.ctrlKey||e.metaKey||e.altKey) return;
    if(e.key==='t'||e.key==='T'||e.key==='b'||e.key==='B') takeBack(); if(e.key==='f'||e.key==='F') board.flip() });
  $('pl-peek').addEventListener('click',peek);
  $('pl-flip').addEventListener('click',()=>board.flip());
  $('pl-moveform').addEventListener('submit',e=>{
    e.preventDefault(); const txt=$('pl-movein').value; $('pl-moveerr').textContent='';
    if(!txt.trim()||!S.g||S.over) return;
    if(S.g.turn()!==S.me){ $('pl-moveerr').textContent='Wait for the engine.'; return }
    const mv=parseTyped(S.g,txt);
    if(!mv){ $('pl-moveerr').textContent=`${txt} isn’t legal here.`; return }
    $('pl-movein').value=''; userMove(mv.from,mv.to,mv.promotion);
  });
}
window.PlayTab={init,newGame,fromPosition,userMove,resign,peek,takeBack,canTakeBack,get state(){return S}};
})();
