/* Chess Lab Open — Today: a short daily session built from your own progress.
   Up to 3 drills from your games (new first, then misses, then spaced reviews at 3 / 7 / 21 days),
   5 puzzles near your puzzle rating, one endgame (new ones in order, then reviews), and one opening line (your lowest-rated opening, else a preset).
   The plan is fixed for the day once made; items tick off as you do them in their own tabs.
   Everything lives in this browser (localStorage). */
'use strict';
(function(){
const DAY=864e5;
const dayKey=(t=Date.now())=>{ const d=new Date(t); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0') };
const dayStart=()=>{ const d=new Date(); d.setHours(0,0,0,0); return d.getTime() };
const REVIEW=[3,7,21];   /* days before a solved drill comes back, by how many times it was solved */

function pickDrills(){
  const all=(Store.get('adrills')||[]).filter(d=>d.kind!=='punish'), p=Store.get('adrills-progress')||{}, now=Date.now();
  const fresh=all.filter(d=>!p[d.id]);
  const missed=all.filter(d=>p[d.id]&&!p[d.id].ok&&p[d.id].t<dayStart()).sort((a,b)=>p[a.id].t-p[b.id].t);
  const due=all.filter(d=>{ const e=p[d.id]; if(!e||!e.ok) return false;
    const gap=REVIEW[Math.min(REVIEW.length-1,(e.okN||1)-1)]*DAY; return now-e.t>=gap }).sort((a,b)=>p[a.id].t-p[b.id].t);
  return [...fresh,...missed,...due].slice(0,3).map(d=>d.id);
}
function pickPuzzles(){
  const lib=TacticsTab.lib||[], p=Store.get('tactics-progress')||{}, r=(Store.get('tac-rating')||{r:1500}).r;
  const todayN=parseInt(dayKey().replace(/-/g,''),10);
  return lib.filter(z=>!p[z.id])
    .map(z=>({z,k:Math.abs((z.rating||1500)-r)+((todayN*31+z.id.charCodeAt(0)*7)%120)}))   /* near your rating, varied by day */
    .sort((a,b)=>a.k-b.k).slice(0,5).map(x=>x.z.id);
}
function pickOpening(){
  const ops=OpeningsTab.openings();
  const played=ops.map(o=>({o,s:OpeningsTab.stats(o.id)})).filter(x=>x.s.lines>0);
  if(played.length) return played.sort((a,b)=>a.s.rating-b.s.rating)[0].o.id;
  const presets=ops.filter(o=>!o.rep&&!o.player);
  return presets[(new Date().getDate())%presets.length].id;
}
function plan(){
  let t=Store.get('today');
  /* remake the plan on a new day, when the puzzle library arrives late, or when drills get saved after an empty-drill plan */
  if(!t||t.date!==dayKey()||(!t.puzzles.length&&(TacticsTab.lib||[]).length)||(!t.drills.length&&pickDrills().length)||(t.endgame===undefined&&EndgamesTab.data)||(t.endgame===null&&EndgamesTab.pickToday())){
    const keep=t&&t.date===dayKey()?t:null;
    t={date:dayKey(),drills:pickDrills(),puzzles:pickPuzzles(),endgame:EndgamesTab.pickToday(),opening:pickOpening()};
    if(keep){ t.drills=keep.drills.length?keep.drills:t.drills; t.puzzles=keep.puzzles.length?keep.puzzles:t.puzzles; t.opening=keep.opening }
    Store.put('today',t);
  }
  return t;
}
function items(){
  const t=plan(), s=dayStart();
  const dp=Store.get('adrills-progress')||{}, tp=Store.get('tactics-progress')||{};
  const D=Store.get('adrills')||[], L=TacticsTab.lib||[], O=OpeningsTab.openings();
  const out=[];
  for(const id of t.drills){ const d=D.find(x=>x.id===id); if(d) out.push({kind:'drill',id,obj:d,done:!!(dp[id]&&dp[id].t>=s),
    title:'Drill: vs '+d.opp,meta:`${d.date} · you played ${d.played}`}) }
  for(const id of t.puzzles){ const z=L.find(x=>x.id===id); if(z) out.push({kind:'puzzle',id,obj:z,done:!!(tp[id]&&tp[id].t>=s),
    title:'Puzzle '+z.id,meta:(z.rating||'')+(Puzzles.show()?' · '+themeName(z.motif):'')}) }
  const eg=t.endgame&&EndgamesTab.byId(t.endgame), ep=Store.get('endgame-progress')||{};
  if(eg) out.push({kind:'endgame',id:eg.id,obj:eg,done:!!(ep[eg.id]&&ep[eg.id].t>=s),
    title:'Endgame: '+eg.title,meta:(eg.goal==='win'?'win it':'hold the draw')+' against perfect defence'});
  const o=O.find(x=>x.id===t.opening);
  if(o){ const st=OpeningsTab.stats(o.id); out.push({kind:'opening',id:o.id,obj:o,done:!!(st.last&&st.last>=s),
    title:'Opening line: '+o.name,meta:st.lines?`rating ${st.rating} · ${Help.n(st.lines,'line')}`:'new for you'}) }
  return out;
}
function start(it){
  if(it.kind==='drill'){ location.hash='#drills'; setTimeout(()=>DrillsTab.load(it.obj),30) }
  else if(it.kind==='puzzle'){ location.hash='#tactics'; setTimeout(()=>TacticsTab.load(it.obj),30) }
  else if(it.kind==='endgame'){ location.hash='#endgames'; setTimeout(()=>EndgamesTab.load(it.obj),30) }
  else { location.hash='#openings'; setTimeout(()=>OpeningsTab.selectOpening(it.id),30) }
}
function streak(all,done){
  const s=Store.get('today-streak')||{n:0,last:null};
  if(all&&done===all&&s.last!==dayKey()){
    const y=dayKey(Date.now()-DAY); s.n=s.last===y?s.n+1:1; s.last=dayKey(); Store.put('today-streak',s);
  }
  return s.last===dayKey()||s.last===dayKey(Date.now()-DAY)?s.n:0;
}
/* The page (shared train view, Chess Lab's layout): the session bar and the Up next list on the left, the selected
   item's position on the board, and a card that says what it is. Start opens it in its own tab (where it is scored). */
let board=null, sel=null, picked=false;   /* picked: the person chose this row (else the first item not done is shown) */
const KIND={drill:'Drill',puzzle:'Puzzle',endgame:'Endgame',opening:'Opening line'};
function preview(it){
  try{
    if(it.kind==='drill') return {g:new Chess(it.obj.fen),orient:it.obj.color};
    if(it.kind==='puzzle'){ const z=it.obj, g=new Chess(z.fen); let last=null;
      if(z.pre!==false&&z.moves&&z.moves.length>1){ const u=z.moves[0]; const m=g.move({from:u.slice(0,2),to:u.slice(2,4),promotion:u[4]||'q'}); if(m) last={from:m.from,to:m.to} }
      return {g,orient:g.turn(),last} }
    if(it.kind==='endgame'){ const g=new Chess(it.obj.fen); return {g,orient:g.turn()} }
    const o=it.obj, g=new Chess(o.startFen||o.fen||undefined); let last=null;
    for(const m of o.moves||[]){ const r=g.move(m); if(!r) break; last={from:r.from,to:r.to} }
    return {g,orient:o.side==='black'?'b':'w',last};
  }catch(e){ return {g:new Chess(),orient:'w'} }
}
function badge(it){
  if(it.kind==='drill') return {b:(v=>v==null?'D':(v>0?'+':v<0?'−':'')+Math.abs(v).toFixed(1))(it.obj.before),t:'Eval from White’s side'};
  if(it.kind==='puzzle') return {b:it.obj.rating||'P',t:'Puzzle rating'};
  if(it.kind==='endgame') return {b:it.obj.goal==='win'?'Win':'Draw',t:'The goal'};
  return {b:'Line',t:'An opening line'};
}
function side(it){
  const el=$('td-side'); if(!it){ el.innerHTML=''; return }
  const what={drill:it.obj&&it.obj.kind==='punish'?'Your opponent erred here: find the move that makes them pay.':'From your own game: find the move you should have played.',
    puzzle:'Five puzzles near your puzzle rating: the first try counts.',endgame:(it.obj.goal==='win'?'Win it':'Hold the draw')+' against perfect defence (the Lichess tablebase).',
    opening:'One line against real Lichess games at the level you set; your lowest-rated opening comes first.'}[it.kind];
  el.innerHTML=TV.head({kicker:'Today · '+KIND[it.kind]+(it.done?' · done':''),title:esc(it.title.replace(/^(Drill|Endgame|Opening line): /,'')),
    chips:[esc(it.meta)],extra:`<p class="note" style="margin:8px 0 0">${esc(what)}</p>`})+
    `<div class="status${it.done?' good':''}" style="margin-top:12px"><strong>${it.done?'Done today ✓':'Ready when you are.'}</strong>${it.done?'You can still do it again; it won’t count twice.':'Start opens it in its own tab, where it is scored. Come back here for the next one.'}</div>`;
}
function select(it,list){
  sel=it?it.kind+':'+it.id:null;
  if(board){ if(it){ const p=preview(it); board.set(p.g,{locked:true,orient:p.orient,last:p.last||null}) } else board.set(new Chess(),{locked:true}) }
  side(it);
  for(const b of $('td-list').querySelectorAll('.drill[data-k]')) b.setAttribute('aria-current',String(b.dataset.k===sel));
  const go=$('td-go'), nxt=(list||items()).find(x=>!x.done);
  go.disabled=!it&&!nxt;
  go.textContent=it&&!it.done?(it===nxt&&!(list||items()).some(x=>x.done)?'Start today’s session':'Start'):(nxt?'Continue':'All done for today ✓');
}
function render(){
  const el=$('td-list'); if(!el) return;
  const list=items(), done=list.filter(x=>x.done).length;
  const n=streak(list.length,done);
  $('td-head').innerHTML=TV.session('Today’s session',done,list.length,n?n+'-day streak':'');
  el.innerHTML=list.map(it=>{ const b=badge(it); return TV.row({badge:b.b,badgeTitle:b.t,title:esc(it.title)+(it.done?' <span class="tag conv">Done</span>':''),meta:`<span class="src">${KIND[it.kind]}</span> · ${esc(it.meta)}`,
    right:TV.dots([[it.done?'good':'',it.done?'Done today':'Not done yet']]),cls:it.done?'done':'',data:{k:it.kind+':'+it.id}}) }).join('');
  /* Watch: the video you were in the middle of (a link, not part of the count), as a card like Chess Lab's */
  const wt=window.WatchTab&&WatchTab.today();
  $('td-cards').innerHTML=wt?`<div class="card" style="margin-bottom:12px;padding:12px 14px"><div class="ohtop"><span class="label">Watch</span><a class="note" href="#watch">All videos →</a></div>
    <a class="drill wtoday" style="margin-top:8px" href="${esc(wt.url)}" target="_blank" rel="noopener"><span class="evalchip">▶</span><span><div class="opp">Watch: ${esc(wt.v.title)}</div><div class="meta">${esc(wt.label)} · opens YouTube</div></span><span></span></a></div>`:'';
  const nd=(Store.get('adrills')||[]).length;
  $('td-note').innerHTML=nd?'':'Drills from your own games appear here once you run <a href="#analyze">Analyze my games</a> and save some.';
  const mine=picked&&list.find(x=>x.kind+':'+x.id===sel&&!x.done); if(!mine) picked=false;
  const cur=mine||list.find(x=>!x.done)||list[0]||null;
  select(cur,list);
}
/* First visit: a short guide on Today (dismissable; "How it works" in the header brings it back). */
function welcome(show){
  const el=$('welcome'); if(!el) return;
  let seen=false; try{ seen=localStorage.getItem('clo-welcome')==='seen' }catch(e){}
  el.hidden=show===true?false:seen;
  /* returning visitors get Chess Lab's board page (no big header on Today); the guide brings it back */
  document.body.classList.toggle('welcomed',el.hidden);
}
function dismiss(){ try{ localStorage.setItem('clo-welcome','seen') }catch(e){} $('welcome').hidden=true; document.body.classList.add('welcomed') }
function init(){
  board=makeBoard($('td-board'),{}); board.set(new Chess(),{locked:true});
  $('td-list').addEventListener('click',e=>{ const b=e.target.closest('.drill[data-k]'); if(!b) return; const it=items().find(x=>x.kind+':'+x.id===b.dataset.k); if(it){ picked=true; select(it); if(innerWidth<860) $('td-board').scrollIntoView({behavior:'smooth',block:'start'}) } });
  $('td-go').addEventListener('click',()=>{ const list=items(); const it=(picked&&list.find(x=>x.kind+':'+x.id===sel&&!x.done))||list.find(x=>!x.done); if(it) start(it) });
  const nextItem=()=>{ const list=items(); if(!list.length) return; const i=list.findIndex(x=>x.kind+':'+x.id===sel); const it=list.slice(i+1).find(x=>!x.done)||list.find(x=>!x.done)||list[(i+1)%list.length]; picked=true; select(it,list) };
  $('td-next').addEventListener('click',nextItem); $('td-flip').addEventListener('click',()=>board.flip());
  Keys.on('today',{n:['Next item',nextItem],f:['Flip the board',()=>board.flip()]});
  TV.fitBoard('#td-wrap','#td-tools');
  welcome();
  $('welcome-x').addEventListener('click',dismiss); $('welcome-ok').addEventListener('click',dismiss);
  $('welcome-go').addEventListener('click',dismiss);
  $('td-help').addEventListener('click',()=>{ welcome(true); setTimeout(()=>{ const e=$('welcome'); if(e.scrollIntoView) e.scrollIntoView({block:'start'}) },30) });
  $('help-open').addEventListener('click',()=>{ location.hash='#today'; welcome(true); setTimeout(()=>{ const e=$('welcome'); if(e.scrollIntoView) e.scrollIntoView({block:'start'}) },30) });
  /* the puzzle library loads after this page: rebuild an empty plan once it is there */
  let tries=0; const wait=setInterval(()=>{ tries++; if(((TacticsTab.lib||[]).length&&EndgamesTab.data)||tries>40){ clearInterval(wait); if(document.body.dataset.view==='today') render() } },250);
}
window.TodayTab={init,render,plan,items,start,select};
})();
