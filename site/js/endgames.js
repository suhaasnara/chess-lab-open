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
  return Net.tablebase(fen);   /* shared/net.js */
}
const fromLive=(d,goal)=>EndgameCore.options(d,goal);   /* shared/endgame-core.js */
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
  const d=await live(fen); if(d&&d.moves&&d.moves.length) return EndgameCore.pickReply(fen,d,live);   /* keep the result, keep material, fewest saving replies; losing: resist longest */
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
  if(DATA){ const r=document.createElement('label'); r.className='field egcat'; r.innerHTML='<span class="label">Category</span>';
    const sel=document.createElement('select'); sel.id='eg-cat'; sel.setAttribute('aria-label','Category');
    for(const [v,n] of [['all','All endings'],...DATA.groups.filter(g=>DATA.positions.some(p=>p.group===g[0]))]){ const o=document.createElement('option'); o.value=v; o.textContent=n; sel.appendChild(o) }
    sel.value=S.group; sel.addEventListener('change',()=>{ S.group=sel.value; renderList() }); r.appendChild(sel);
    const add=document.createElement('button'); add.type='button'; add.className='btn sm'; add.id='eg-addpos'; add.textContent='+ Your position'; add.addEventListener('click',openCustom);
    ch.appendChild(r); ch.appendChild(add);
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
/* ---------- your own positions: up to 7 pieces, graded by the live tablebase (Store eg-custom = [{id, title, fen, goal, end}]) ---------- */
const customs=()=>Store.get('eg-custom')||[];
function mergeCustoms(){ if(!DATA) return; DATA.positions=DATA.positions.filter(p=>p.group!=='mine').concat(customs().map(c=>({...c,group:'mine'})));
  if(customs().length&&!DATA.groups.some(g=>g[0]==='mine')) DATA.groups.push(['mine','Your positions']) }
function openCustom(){
  const box=$('eg-custom'); box.hidden=false; $('eg-cfen').value=S.cur?S.cur.fen:''; $('eg-cerr').textContent=''; $('eg-cfen').focus() }
async function saveCustomPos(){
  const err=$('eg-cerr'), fen=$('eg-cfen').value.trim(), name=$('eg-cname').value.trim();
  let g; try{ g=new Chess(fen); if(!new Chess().validate_fen(fen).valid) throw 0 }catch(e){ err.textContent='That is not a legal position (FEN).'; return }
  const n=g.board().flat().filter(Boolean).length; if(n>7){ err.textContent=`The tablebase knows positions with up to 7 pieces (kings included); this one has ${n}.`; return }
  if(g.game_over()){ err.textContent='The game is already over in that position.'; return }
  err.textContent='Asking the tablebase…';
  const d=await Net.tablebase(fen,8000); if(!d||!d.category){ err.textContent=Net.online()?'The tablebase didn’t answer. Try again in a moment.':Net.why(); return }
  const cat=EndgameCore.res(d.category==='win'?'loss':d.category==='loss'?'win':'draw');   /* d.category is for the side to move */
  if(cat==='L'){ err.textContent='The side to move loses with best play. Set it up with the other side to move, or flip the colours.'; return }
  const pawns=/p/i.test(fen.split(' ')[0]);
  const c={id:'my-'+Date.now().toString(36),title:name||'My position',fen:g.fen(),goal:cat==='W'?'win':'draw',end:cat==='W'?(pawns?'convert':'mate'):'hold:20',
    text:cat==='W'?'Your position: the tablebase says it is a win.':'Your position: the tablebase says it is a draw. Hold it for 20 moves.',tb:{cat:d.category,dtz:d.dtz,dtm:d.dtm},custom:true};
  Store.put('eg-custom',customs().concat([c])); $('eg-custom').hidden=true; $('eg-cname').value=''; mergeCustoms(); S.group='mine'; renderList(); load(DATA.positions.find(p=>p.id===c.id));
}
function deleteCustomPos(id){ Store.put('eg-custom',customs().filter(c=>c.id!==id)); mergeCustoms(); S.group='all'; renderList(); next() }
/* the best line for a position the data has no stored line for: the tablebase's best move each turn (bot replies as in play) */
async function liveLine(z){ const g=new Chess(z.fen), out=[];
  for(let i=0;i<40&&!g.game_over();i++){ const d=await Net.tablebase(g.fen()); if(!d||!d.moves||!d.moves.length) break;
    const u=g.turn()===S.me?(EndgameCore.options(d,z.goal)||{}).b?.split(' ')[0]||d.moves[0].uci:await EndgameCore.pickReply(g.fen(),d,null); if(!u) break; g.move(U(u)); out.push(u) }
  return out }
/* ← → during play: look back through the moves played (view only); at the end the board takes moves again */
function look(d){ if(!S.cur||!S.hist.length) return false; const n=S.hist.length; let k=(S.look==null?n:S.look)+d; k=Math.max(0,Math.min(n,k)); S.look=k===n?null:k;
  const g=new Chess(S.cur.fen); let last=null; for(const h of S.hist.slice(0,k)){ const m=g.move(U(h.u)); if(m) last={from:m.from,to:m.to} }
  board.set(S.look==null?S.g:g,{last,locked:S.look!=null||S.phase!=='play'}); $('eg-step').hidden=S.look==null; if(S.look!=null) $('eg-step').textContent=`move ${k} of ${n} · → to come back` }
function load(z){
  if(!z) return; if(endbar) endbar.hide();
  S.cur=z; S.look=null; S.g=new Chess(z.fen); S.hist=[]; { const sl=$('eg-readslot'); if(sl) sl.innerHTML='' } S.phase='play'; S.busy=false; S.me=S.g.turn(); S.moves=0; S.grades=[]; S.assisted=false; S.counted=false; S.sol=null; S.view=0;
  board.set(S.g,{last:null,orient:S.me,locked:false});
  status('',goalText(z),'');
  $('eg-facts').innerHTML=`<dt>Goal</dt><dd>${esc(goalText(z))}</dd><dt>Best play</dt><dd>${esc(par(z))}</dd><dt>Graded by</dt><dd id="eg-src">the Lichess tablebase</dd>`;
  $('eg-text').textContent=z.text||''; $('eg-tip').hidden=true;
  $('eg-lichess').href='https://lichess.org/analysis/standard/'+z.fen.replace(/ /g,'_'); $('eg-delpos').hidden=!z.custom;
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
  const z=S.cur; if(!z||S.phase!=='play'||S.busy||S.g.turn()!==S.me||S.look!=null) return;
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
async function solution(){
  if(!S.cur) return; if(S.phase==='play'&&S.hist.length) S.assisted=true;
  if(!S.cur.line&&S.cur.custom){ status('','Asking the tablebase for the best line…',''); S.cur.line=await liveLine(S.cur); if(!S.cur.line.length){ S.cur.line=null; status('warn','No line: the tablebase didn’t answer.',Net.online()?'':Net.why()); return } }
  S.sol=S.cur.line||[]; S.view=0; showSol(); buttons();
  { const slot=$('eg-readslot'); slot.innerHTML=''; const g0=new Chess(S.cur.fen), sans=[]; for(const u of S.sol){ const m=g0.move(U(u)); if(!m) break; sans.push(m.san) }
    slot.appendChild(Reader.button(()=>Reader.open({title:S.cur.title+' · best play',fen:S.cur.fen,orient:S.me,lines:sans.map(san=>({san})),at:S.view}))) }
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
  fetch('data/endgames.json').then(r=>{ if(!r.ok) throw 0; return r.json() }).then(j=>{ DATA=j; mergeCustoms(); renderList() })
    .catch(()=>{ DATA={groups:[],positions:[]}; renderList() });
  $('eg-back').addEventListener('click',takeBack);
  $('eg-hint').addEventListener('click',hint);
  $('eg-sol').addEventListener('click',solution);
  $('eg-retry').addEventListener('click',()=>load(S.cur));
  $('eg-next').addEventListener('click',next);
  $('eg-flip').addEventListener('click',()=>board.flip());
  $('eg-prev').addEventListener('click',()=>{ S.view--; endbar.hide(); showSol() });
  $('eg-fwd').addEventListener('click',()=>{ S.view++; endbar.hide(); showSol() });
  $('eg-csave').addEventListener('click',saveCustomPos); $('eg-ccancel').addEventListener('click',()=>{ $('eg-custom').hidden=true });
  $('eg-delpos').addEventListener('click',()=>{ if(S.cur&&S.cur.custom&&confirm('Delete this position?')) deleteCustomPos(S.cur.id) });
  Keys.on('endgames',{ArrowLeft:['Back a move (your moves, or the solution)',()=>{ if(S.sol){ S.view--; endbar.hide(); showSol(); return } return look(-1) }],
    ArrowRight:['Forward a move',()=>{ if(S.sol){ S.view++; endbar.hide(); showSol(); return } return look(1) }],
    b:['Take back your move (and the reply)',()=>takeBack()], h:['Hint',()=>hint()], n:['Next ending',()=>next()], f:['Flip the board',()=>board.flip()]});
}
window.EndgamesTab={init,saveCustomPos,customs,deleteCustomPos,liveLine,load,userMove,takeBack,hint,solution,next,pickToday,stats,offline:false,onFinish:null,
  get state(){return S},get data(){return DATA},byId:id=>DATA&&DATA.positions.find(z=>z.id===id)};
})();
