/* Chess Lab Open — Blunder check (Extra → Blunder check), the private Chess Lab's bc.js on Open's Store, board and keys.
   Positions come from a Chess Lab pack (Store pack-bc, built by the private kit's tools/blundercheck from your own games):
   your move there dropped your Win% by 15+ points from 30%+. Step 1, the question you skipped: what does your opponent
   threaten? (the same position with them to move: play their move; any move within 0.5 pawns of their best counts).
   Step 2: your move (any of Stockfish's top 3 within 0.3 pawns of the best counts). Then the game: what you played and how
   it was punished. No engine needed: the answers come with the pack.
   Results: Store bc-progress {<id>: {n, ok, okN, t}} — both steps right on the first try = solved, back after 3, 7, 21
   days; otherwise back the next day. Ids: 'k' + sha1(fen|played uci)[:8], so a newer pack keeps your results. */
'use strict';
(function(){
const DAY=864e5, REVIEW=[3,7,21];
const S={cur:null,phase:'idle',firstTry:true,okThreat:null,okMove:null,filt:'todo'};
let board=null, timer=0;
const data=()=>Store.get('pack-bc')||[];
const res=()=>Store.get('bc-progress')||{};
const due=r=>!!r&&(r.ok?Date.now()-r.t>=REVIEW[Math.min(REVIEW.length-1,(r.okN||1)-1)]*DAY:r.t<new Date().setHours(0,0,0,0));
const status=d=>{ const r=res()[d.id]; return !r?'new':due(r)?'due':r.ok?'solved':'missed' };
const SITE={lichess:'Lichess',chesscom:'Chess.com',otb:'Over the board'};
const sanOf=(fen,u)=>{ try{ const m=new Chess(fen).move({from:u.slice(0,2),to:u.slice(2,4),promotion:u[4]||'q'}); return m?m.san:u }catch(e){ return u } };
const no=d=>`${d.moveNo}${d.color==='white'?'.':'…'}`;
const first=d=>String(d.opp||'your opponent').split(/[ ,]/)[0];
const FILTERS=[['todo','To do'],['all','All'],['solved','Solved']];
function items(){ const L=data();
  return S.filt==='all'?L:S.filt==='solved'?L.filter(d=>status(d)==='solved'):L.filter(d=>status(d)!=='solved') }
function say(tone,head,rest){ const s=$('bc-status'); s.className='status'+(tone?' '+tone:''); s.innerHTML=`<strong>${head}</strong>${rest||''}` }
function render(){
  const L=data(), shown=items(), cnt=s=>L.filter(d=>status(d)===s).length;
  $('bc-filters').innerHTML=L.length?TV.chips('Show','filt',[['todo',`To do ${cnt('new')+cnt('due')+cnt('missed')}`],['all',`All ${L.length}`],['solved',`Solved ${cnt('solved')}`]],S.filt):'';
  $('bc-listlabel').textContent=L.length?`${shown.length} of ${L.length} positions`:'';
  const el=$('bc-list');
  el.innerHTML=shown.map(d=>{ const s=status(d);
    return TV.row({badge:`${d.w0}→${d.w1}`,badgeTitle:'Your Win% before → after the move',title:`vs ${esc(d.opp)} · ${esc(no(d))}${esc(d.played)}`,
      meta:`${esc(SITE[d.site]||d.site||'')} · ${esc(d.date||'')}${d.strong?' · 2200+':''} · ${s==='solved'?'✓ solved':s==='missed'?'✗ missed':s==='due'?'due':'new'}`,
      right:TV.dots([[s==='solved'?'good':s==='missed'?'bad':'','Both steps']]),current:!!(S.cur&&S.cur.id===d.id),data:{id:d.id}}) }).join('');
  el.classList.toggle('isempty',!shown.length);
  if(!L.length) el.innerHTML='<p class="empty">No positions yet. Blunder check needs a <b>Chess Lab pack</b>: a file built from your own games with the private Chess Lab kit. Load one in <a href="#progress">Progress</a> → <i>Load a Chess Lab pack</i>.</p>';
  else if(!shown.length) el.innerHTML='<p class="empty">Nothing here: every position is done for now. Solved ones come back after 3, 7 and 21 days.</p>';
  for(const id of ['bc-next','bc-show']) $(id).disabled=!L.length;
  if(!S.cur){ $('bc-head').innerHTML=''; $('bc-reveal').innerHTML=''; $('bc-lichess').hidden=true }
}
function open(d){
  clearTimeout(timer);
  S.cur=d; S.phase='threat'; S.firstTry=true; S.okThreat=null; S.okMove=null;
  board.set(new Chess(d.null),{orient:d.color==='white'?'w':'b',last:null,locked:false});
  $('bc-reveal').innerHTML=''; $('bc-show').hidden=false; $('bc-show').firstChild.textContent='Show the threat ';
  const url=d.url&&/^https:\/\/(www\.)?(chess\.com|lichess\.org)\//.test(d.url)?d.url:'';
  $('bc-head').innerHTML=TV.head({kicker:`${esc(SITE[d.site]||'')} · ${esc(d.date||'')} · move ${esc(d.moveNo)}${d.strong?' · vs 2200+':''}`,
    title:`vs ${esc(d.opp)}${d.oppElo?` <span class="note mono">${esc(d.oppElo)}</span>`:''}`,
    chips:[d.color==='white'?'You had White':'You had Black',`Win% ${esc(d.w0)} → ${esc(d.w1)}${Help.q('Your Win% before your move and after it, from your side. '+WinPct.HELP)}`,
      url?`<a href="${esc(url)}" target="_blank" rel="noopener">game ↗</a>`:'']});
  $('bc-lichess').href='https://lichess.org/analysis/'+encodeURIComponent(d.fen.replace(/ /g,'_'))+'?color='+(d.color==='white'?'white':'black'); $('bc-lichess').hidden=false;
  say('',`Step 1: what does ${esc(first(d))} threaten?`,'Play their move, as if they could move again now (it’s really your move).');
  render();
}
function toMove(){ const d=S.cur; S.phase='move'; board.set(new Chess(d.fen),{last:null,locked:false}); $('bc-show').firstChild.textContent='Show the move ';
  say('','Step 2: your move.',`Deal with the threat${d.threat?` (${esc(d.threat)})`:''}.`) }
function finish(){
  const d=S.cur, ok=!!(S.okThreat&&S.okMove), p=res(), r=p[d.id]||{n:0};
  S.phase='done'; p[d.id]={n:(r.n||0)+1,ok,okN:ok?(r.okN||0)+1:0,t:Date.now()}; Store.put('bc-progress',p);
  $('bc-show').hidden=true;
  $('bc-reveal').innerHTML=`<div class="card"><div class="label">In the game</div><p>You played <b class="mono">${esc(no(d))}${esc(d.played)}??</b> (Win% ${esc(d.w0)}% → ${esc(d.w1)}%)${d.reply?`, and ${esc(first(d))} answered <b class="mono">${esc(d.reply)}</b>`:''}.
    ${d.ignored?'That was exactly the threat.':`The threat was <b class="mono">${esc(d.threat)}</b> (worth about ${esc(d.gain)} pawns to them).`} Stockfish’s move: <b class="mono">${esc(d.best)}</b>.</p>
    <p class="note">${ok?'Both steps right: back in '+REVIEW[Math.min(REVIEW.length-1,(r.okN||0))]+' days.':'Back tomorrow.'}</p></div>`;
  render();
}
function move(f,t,p){
  const d=S.cur; if(!d||S.phase==='done'||S.phase==='idle') return; const u=f+t+(p&&p!=='q'?p:'');
  if(S.phase==='threat'){
    if(d.threats.some(x=>x.slice(0,4)===u.slice(0,4))){
      if(S.okThreat===null) S.okThreat=S.firstTry;
      const g=new Chess(d.null), m=g.move({from:f,to:t,promotion:p||'q'}); board.set(g,{last:m,locked:true}); board.flash([f,t],'good');
      say('good',`✓ ${esc(m.san)}${m.san!==d.threat?` (and ${esc(d.threat)} is the strongest)`:''}.`,'That’s the danger.');
      S.firstTry=true; const id=d.id; timer=setTimeout(()=>{ if(S.cur&&S.cur.id===id&&S.phase==='threat') toMove() },1300);
    } else { S.firstTry=false; S.okThreat=false; board.set(new Chess(d.null),{last:null}); board.flash([f,t],'bad');
      say('bad',`✗ ${esc(sanOf(d.null,u))} isn’t it.`,'Look for what they gain if you ignore them. Try again, or Show the threat.') }
    return;
  }
  const good=d.goods.some(x=>x.slice(0,4)===u.slice(0,4)), game=d.playedUci.slice(0,4)===u.slice(0,4);
  if(S.okMove===null) S.okMove=good;
  const g=new Chess(d.fen), m=g.move({from:f,to:t,promotion:p||'q'}); board.set(g,{last:m,locked:true}); board.flash([f,t],good?'good':'bad');
  if(good) say('good',`✓ ${esc(m.san)} holds.`,m.san!==d.best?`Stockfish’s first choice: ${esc(d.best)}.`:'');
  else if(game) say('bad',`✗ ${esc(m.san)}: your game move.`,d.reply?`It allows ${esc(d.reply)}.`:'');
  else say('bad',`✗ ${esc(m.san)} isn’t one of Stockfish’s moves here.`,`Its choice: ${esc(d.best)}.`);
  finish();
}
function show(){ const d=S.cur; if(!d) return;
  if(S.phase==='threat'){ S.okThreat=false; const g=new Chess(d.null), u=d.threatUci, m=g.move({from:u.slice(0,2),to:u.slice(2,4),promotion:u[4]||'q'}); board.set(g,{last:m,locked:true});
    say('warn',`The threat: ${esc(d.threat)}.`,'Now find your move.'); const id=d.id; clearTimeout(timer); timer=setTimeout(()=>{ if(S.cur&&S.cur.id===id&&S.phase==='threat') toMove() },1500) }
  else if(S.phase==='move'){ S.okMove=false; const g=new Chess(d.fen), u=d.bestUci, m=g.move({from:u.slice(0,2),to:u.slice(2,4),promotion:u[4]||'q'}); board.set(g,{last:m,locked:true});
    say('warn',`Stockfish: ${esc(d.best)}.`,''); finish() } }
function next(){ const L=items().length?items():data(); if(!L.length) return; const order={due:0,missed:1,new:2,solved:3};
  const i=S.cur?L.findIndex(d=>d.id===S.cur.id):-1, rest=L.slice(i+1).concat(L.slice(0,i+1));
  const nx=rest.slice().sort((a,b)=>order[status(a)]-order[status(b)])[0]; if(nx) open(nx) }
function refresh(onShow){
  if(S.cur&&!data().some(d=>d.id===S.cur.id)){ S.cur=null; S.phase='idle'; board.set(new Chess(),{locked:true,last:null}) }
  render(); if(onShow&&!S.cur&&data().length) next();
}
function init(){
  board=makeBoard($('bc-board'),{onMove:move});
  board.set(new Chess(),{locked:true});
  $('bc-list').addEventListener('click',e=>{ const b=e.target.closest('.drill'); if(!b) return; const d=data().find(x=>x.id===b.dataset.id); if(d) open(d) });
  TV.onChip($('bc-filters'),(k,v)=>{ S[k]=v; render() });
  TV.fitBoard('#bc-wrap','#bc-tools');
  $('bc-next').addEventListener('click',next); $('bc-show').addEventListener('click',show); $('bc-flip').addEventListener('click',()=>board.flip());
  Keys.on('blundercheck',{n:['Next position',()=>next()],s:['Show the threat, then the move',()=>show()],f:['Flip the board',()=>board.flip()]});
  render();
}
window.BlunderCheckTab={init,refresh,open:id=>{ const d=data().find(x=>x.id===id); if(d) open(d) },move,show,next,status,get state(){return S}};
})();
