/* Chess Lab Open — Play vs Stockfish at a chosen strength, with a blindfold option.
   Limited strength uses the engine's own UCI_LimitStrength / UCI_Elo (its scale,
   1320–3190); the limit is switched off right after each move so analysis stays
   full strength. Blindfold: no pieces, no move dots; moves by typing or tapping;
   Peek shows the pieces for 2 seconds (counted). Last 30 games stay in this browser. */
'use strict';
(function(){
let board=null;
const S={g:null,me:'w',elo:1800,blind:false,peeks:0,over:false,busy:false,resignArm:false,moves:[],start:null,goal:null,label:'',takebacks:0,hints:0,hintStage:0,view:null,gid:0};

function games(){ return Store.get('play-games')||[] }
function saveGame(result,reason){
  const list=games();
  list.unshift({t:Date.now(),me:S.me,elo:S.elo,blind:S.blind,peeks:S.peeks,takebacks:S.takebacks||undefined,hints:S.hints||undefined,result,reason,moves:S.moves.join(' '),fen:S.start||undefined,goal:S.goal||undefined,label:S.label||undefined});
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
  S.g=new Chess(); S.moves=[]; S.over=false; S.busy=false; S.resignArm=false; S.peeks=0; S.takebacks=0; S.hints=0; S.hintStage=0; S.view=null; S.result=null; S.gid++; { const b=$('pl-review'); if(b) b.hidden=true }
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
  S.g=new Chess(fen); S.start=fen; S.goal=goal; S.label=label||''; S.moves=[]; S.over=false; S.busy=false; S.resignArm=false; S.peeks=0; S.takebacks=0; S.hints=0; S.hintStage=0; S.view=null; S.result=null; S.gid++; { const b=$('pl-review'); if(b) b.hidden=true }
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
  S.moves.push(m.san); S.resignArm=false; S.hintStage=0; S.view=null;
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
  S.result=result==='draw'?'1/2-1/2':(result==='win')===(S.me==='w')?'1-0':'0-1';
  saveGame(result,reason); tools();
  { const b=$('pl-review'); if(b) b.hidden=false }
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
  const el=$('pl-moves'); let html=''; const cur=S.view==null?S.moves.length:S.view;
  S.moves.forEach((s,i)=>{ if(i%2===0) html+=`<span class="note">${i/2+1}.</span> `; html+=`<button type="button" class="omv${i+1===cur&&S.view!=null?' cur':''}" data-ply="${i+1}">${esc(s)}</button> ` });
  el.innerHTML=html||'<span class="note">No moves yet.</span>';
  const strip=S.moves.slice(-8);
  $('pl-strip').innerHTML=strip.map((s,i)=>i===strip.length-1?`<b>${esc(s)}</b>`:esc(s)).join(' · ');
}
/* ← → Home End: step through the game on the board (view only; your move again at the end) */
function viewAt(k){ if(!S.g||!S.moves.length) return false; const n=S.moves.length; k=Math.max(0,Math.min(n,k)); S.view=k===n?null:k;
  const g=new Chess(S.start||undefined); let last=null; for(let i=0;i<(S.view==null?n:k);i++){ const m=g.move(S.moves[i]); last=m?{from:m.from,to:m.to}:null }
  board.set(S.view==null?S.g:g,{last,orient:board.orient,locked:S.view!=null||S.over}); if(S.view==null) $('pl-board').classList.toggle('blind',S.blind&&!S.over); else $('pl-board').classList.remove('blind'); renderMoves() }
/* H: two-step hint (the piece, then the move), counted on the saved game like takebacks */
async function hint(){
  if(!S.g||S.over||S.busy||S.g.turn()!==S.me||S.view!=null) return false;
  const a=await SharedEngine.analyse(S.g.fen(),14,1,6000).catch(()=>null); const u=a&&a[0]&&a[0].uci; if(!u) return;
  if(!S.hintStage){ S.hints++; S.hintStage=1; board.setHint(u.slice(0,2)); status('warn','Hint: this piece.','H again for the move. Hints are saved with the game.') }
  else { board.setHint(u.slice(0,2),u.slice(2,4)); status('warn','Hint: '+sanOf(S.g.fen(),u),`Hints this game: ${S.hints}.`) }
}
const numbered=(fen,sans)=>{ const t=(fen||'x w - - 0 1').split(' '); let n=+t[5]||1, w=t[1]!=='b'; return sans.map((s,i)=>{ const x=w?n+'. '+s:(i===0?n+'... '+s:s); if(!w) n++; w=!w; return x }).join(' ') };
function pgn(){ const d=new Date(); const tags=[['Event','Chess Lab Open: Play'],['Site','Chess Lab Open'],['Date',d.toISOString().slice(0,10).replace(/-/g,'.')],
    ['White',S.me==='w'?'Me':'Stockfish '+S.elo],['Black',S.me==='b'?'Me':'Stockfish '+S.elo],['Result',S.result||'*']].concat(S.start?[['SetUp','1'],['FEN',S.start]]:[]);
  return tags.map(([k,v])=>`[${k} "${v}"]`).join('\n')+'\n\n'+numbered(S.start,S.moves)+' '+(S.result||'*') }
async function reviewLichess(){ const r=await Net.review(pgn()); if(!r.ok) status('warn','Lichess import didn’t work here.',(r.copied?'The PGN is copied: paste it on the page that opened. ':'Copy the PGN below and paste it on lichess.org/paste. ')+r.why) }
function status(tone,head,rest){ const el=$('pl-status'); el.className='status'+(tone?' '+tone:''); el.innerHTML=`<strong>${esc(head)}</strong>${esc(rest||'')}` }

function init(){
  board=makeBoard($('pl-board'),{onMove:userMove});
  board.set(new Chess(),{locked:true});
  renderGames();
  $('pl-new').addEventListener('click',newGame);
  $('pl-resign').addEventListener('click',resign);
  $('pl-back').addEventListener('click',takeBack);
  $('pl-moves').addEventListener('click',e=>{ const b=e.target.closest('[data-ply]'); if(b) viewAt(+b.dataset.ply) });
  $('pl-review').addEventListener('click',reviewLichess); $('pl-hint').addEventListener('click',()=>hint());
  Keys.on('play',{ArrowLeft:['Back a move (view only)',()=>viewAt((S.view==null?S.moves.length:S.view)-1)],ArrowRight:['Forward a move',()=>{ if(S.view==null) return false; viewAt(S.view+1) }],
    Home:['Start of the game',()=>viewAt(0)],End:['Back to the current move',()=>viewAt(S.moves.length)],
    b:['Take back your move and the reply',()=>takeBack()],h:['Hint (first the piece, then the move)',()=>hint()],f:['Flip the board',()=>board.flip()],p:['Peek (blindfold)',()=>peek()]});
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
window.PlayTab={init,hint,viewAt,pgn,reviewLichess,newGame,fromPosition,userMove,resign,peek,takeBack,canTakeBack,get state(){return S}};
})();
