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
function streak(all,done){
  const s=Store.get('today-streak')||{n:0,last:null};
  if(all&&done===all&&s.last!==dayKey()){
    const y=dayKey(Date.now()-DAY); s.n=s.last===y?s.n+1:1; s.last=dayKey(); Store.put('today-streak',s);
  }
  return s.last===dayKey()||s.last===dayKey(Date.now()-DAY)?s.n:0;
}
/* The page, as Chess Lab's Today: the session bar, the Endgame / Opening line / Watch cards and the Up next list on the
   left; every item is played right here, on the board. Today hosts that tab's own panel (Drills, Tactics, Endgames, or the
   Openings trainer: their board, buttons, coach card and keys), so each item is judged and stored by its own tab's code
   and keys, exactly as there. The endgame and the opening line are picked from their cards (Chess Lab's look). */
const KIND={drill:'Drill',puzzle:'Puzzle',endgame:'Endgame',opening:'Opening line'};
const INPLACE={drill:1,puzzle:1,endgame:1,opening:1}, ROWS={drill:1,puzzle:1};   /* ROWS: listed under Up next; the others are cards */
let board=null, sel=null, hosted=null, P={};   /* sel: kind:id of the item on the board; hosted: the kind whose panel is here, or null */
const VIEW={drill:'drills',puzzle:'tactics',endgame:'endgames',opening:'openings'};
const keyOf=it=>it.kind+':'+it.id;
const tabOf=k=>({drill:window.DrillsTab,puzzle:window.TacticsTab,endgame:window.EndgamesTab,opening:window.OpeningsTab})[k];
function preview(it){
  try{
    if(it.kind==='endgame'){ const g=new Chess(it.obj.fen); return {g,orient:g.turn()} }
    const o=it.obj, g=new Chess(o.startFen||o.fen||undefined); let last=null;
    for(const m of o.moves||[]){ const r=g.move(m); if(!r) break; last={from:r.from,to:r.to} }
    return {g,orient:o.side==='black'?'b':'w',last};
  }catch(e){ return {g:new Chess(),orient:'w'} }
}
function badge(it){
  if(it.kind==='drill') return {b:(v=>v==null?'D':(v>0?'+':v<0?'−':'')+Math.abs(v).toFixed(1))(it.obj.before),t:'Eval from White’s side'};
  return {b:it.obj.rating||'P',t:'Puzzle rating'};
}
/* Show one panel in Today's board column: a tab's (hosted) or Today's own (the empty state). */
function show(which){
  const grid=$('td-grid'), mine=P.today, want=which?P[which][0].el:mine;
  if(which) for(const x of P[which]) if(x.el.parentNode!==grid) grid.appendChild(x.el);   /* the panel, plus its dialogs (Openings) */
  else if(mine.parentNode!==grid) grid.appendChild(mine);
  for(const k of Object.keys(VIEW)) if(k!==which) home(k);
  mine.hidden=want!==mine;
  if(hosted&&hosted!==which) tabOf(hosted).host(null);
  hosted=which||null;
  if(hosted) tabOf(hosted).host({next:nextItem,changed:refresh});
  grid.dataset.hosted=hosted||'';
  dispatchEvent(new Event('resize'));   /* the board fits itself to the column it is in now */
}
/* a panel back to its exact place in its own tab */
function home(k){ for(const x of P[k]||[]) if(x.el.parentNode!==x.parent) x.parent.insertBefore(x.el,x.next) }
/* Leaving Today: give the panels back to their tabs. */
function undock(){ if(!P.today) return; for(const k of Object.keys(VIEW)) home(k); if(hosted) tabOf(hosted).host(null); hosted=null; $('td-grid').dataset.hosted='' }
function current(it){
  const T=tabOf(it.kind);
  if(it.kind==='opening'){ const st=T.state; return st.op&&st.op.id===it.id&&st.phase!=='done' }
  return !!(T.state.cur&&T.state.cur.id===it.id);
}
function play(it){
  sel=it?keyOf(it):null;
  if(it&&INPLACE[it.kind]){ show(it.kind);
    if(!current(it)){ if(it.kind==='opening') OpeningsTab.selectOpening(it.id); else tabOf(it.kind).load(it.obj) } }   /* already on its board: keep the attempt as it is */
  else { show(null); const p=it?preview(it):{g:new Chess(),orient:'w'}; board.set(p.g,{locked:true,orient:p.orient,last:p.last||null}) }
  for(const b of document.querySelectorAll('#td-list .drill[data-k],#td-cards [data-tdrow]')) b.setAttribute('aria-current',String((b.dataset.k||b.dataset.tdrow)===sel));
}
function card(label,href,all,rows){ return `<div class="card watoday"><div class="wthead"><span class="label">${label}</span><a class="note walink" href="${href}">${all} →</a></div>${rows}</div>` }
function cards(list){
  const out=[];
  const wp=window.WatchTab&&WatchTab.plan?WatchTab.plan():[];
  if(wp.length) out.push(card('Watch','#watch','All videos',wp.map(p=>`<div class="wtrow"><span class="wtlab">${esc(p.label)}</span><a href="${esc(p.url)}" target="_blank" rel="noopener"><b>${esc(p.v.title)}</b></a><span class="note">${esc(p.meta||'opens YouTube')}</span></div>`).join('')));
  const eg=list.find(x=>x.kind==='endgame');
  if(eg){ const seen=!!((Store.get('endgame-progress')||{})[eg.id]);
    out.push(card('Endgame','#endgames','All endgames',`<div class="wtrow" data-tdrow="${esc(keyOf(eg))}"><span class="wtlab">${eg.done?'Done ✓':seen?'Review':'New'}</span><a href="#today" data-td="${esc(keyOf(eg))}"><b>${esc(eg.obj.title)}</b></a><span class="note">${eg.obj.goal==='win'?'Win it':'Hold the draw'} against perfect defence</span></div>`)) }
  const op=list.find(x=>x.kind==='opening');
  if(op){ const st=OpeningsTab.stats(op.id);
    out.push(card('Opening line','#openings','All openings',`<div class="wtrow" data-tdrow="${esc(keyOf(op))}"><span class="wtlab">${op.done?'Done ✓':st.lines?'Rating '+st.rating:'New'}</span><a href="#today" data-td="${esc(keyOf(op))}"><b>${esc(op.obj.name)}</b></a><span class="note">${st.lines?'your lowest-rated opening · '+Help.n(st.lines,'line'):'one line against real Lichess games'}</span></div>`)) }
  return out.join('');
}
/* render(): Today opened (the first item not done goes on the board, as in Chess Lab); refresh(): a result came in (the
   item stays on the board; Next moves on). */
function render(){ draw(true) }
function refresh(){ if(document.body.dataset.view==='today') draw(false) }
function draw(fresh){
  const el=$('td-list'); if(!el) return;
  const list=items(), done=list.filter(x=>x.done).length, n=streak(list.length,done);
  const here=list.filter(x=>INPLACE[x.kind]), rows=here.filter(x=>ROWS[x.kind]);
  $('td-head').innerHTML=TV.session('Today’s session',done,list.length,n?n+'-day streak':'')+
    (list.length&&done>=list.length?'<div class="empty" style="margin-bottom:10px">Session complete. Come back tomorrow, or keep going in <a href="#drills">Drills</a> and <a href="#tactics">Tactics</a>.</div>':'');
  $('td-cards').innerHTML=cards(list);
  el.innerHTML=rows.map(it=>{ const b=badge(it); return TV.row({badge:b.b,badgeTitle:b.t,title:esc(it.title)+(it.done?' <span class="tag conv">Done</span>':''),meta:`<span class="src">${KIND[it.kind]}</span> · ${esc(it.meta)}`,
    right:TV.dots([[it.done?'good':'',it.done?'Done today':'Not done yet']]),cls:it.done?'done':'',data:{k:keyOf(it)}}) }).join('');
  el.classList.toggle('isempty',!rows.length);
  if(!rows.length) el.innerHTML='<p class="empty">'+((TacticsTab.lib||[]).length?'Nothing to play here today.':'Loading the puzzles…')+'</p>';
  const nd=(Store.get('adrills')||[]).length;
  $('td-note').innerHTML=nd?'':'Drills from your own games appear here once you run <a href="#analyze">Analyze my games</a> and save some.';
  /* on opening Today, only a drill or puzzle goes on the board by itself: the opening trainer would start the 6 MB book
     download (and the endgame its data) while the puzzles are still loading on a slow phone; those come with their card or Next */
  if(fresh||(!hosted&&!sel)) play(rows.find(x=>!x.done)||rows[0]||null);
  else for(const b of document.querySelectorAll('#td-list .drill[data-k],#td-cards [data-tdrow]')) b.setAttribute('aria-current',String((b.dataset.k||b.dataset.tdrow)===sel));   /* a result came in: the board stays as it is */
}
function nextItem(){
  const here=items().filter(x=>INPLACE[x.kind]); if(!here.length) return;
  const i=here.findIndex(x=>keyOf(x)===sel);
  const it=here.slice(i+1).find(x=>!x.done)||here.find(x=>!x.done&&keyOf(x)!==sel)||here[(i+1)%here.length];
  play(it);
  if(innerWidth<860){ const b=document.querySelector('#td-grid > :not([hidden]) .board'); if(b&&b.scrollIntoView) b.scrollIntoView({behavior:'smooth',block:'start'}) }
}
function start(it){
  if(it.kind==='drill'){ location.hash='#drills'; setTimeout(()=>DrillsTab.load(it.obj),30) }
  else if(it.kind==='puzzle'){ location.hash='#tactics'; setTimeout(()=>TacticsTab.load(it.obj),30) }
  else if(it.kind==='endgame'){ location.hash='#endgames'; setTimeout(()=>EndgamesTab.load(it.obj),30) }
  else { location.hash='#openings'; setTimeout(()=>OpeningsTab.selectOpening(it.id),30) }
}
function select(it){ play(it) }
/* First visit: a short guide on Today (dismissable; "How it works" in the header brings it back). */
/* Someone who has trained here before is not a first visitor, even if they never pressed Got it: the guide stays
   away (it pushed Today's board below the fold). Progress keys only; settings and the day's plan don't count. */
const PROGRESS=['adrills','adrills-progress','tactics-progress','tac-history','endgame-progress','calc-progress','gtm-results','play-games','today-streak','watch'];
function hasProgress(){
  for(const k of PROGRESS){ const v=Store.get(k); if(v&&(Array.isArray(v)?v.length:Object.keys(v).length)) return true }
  try{ for(let i=0;i<localStorage.length;i++) if(/^clo:stats-/.test(localStorage.key(i))) return true }catch(e){}
  return false;
}
function welcome(show){
  const el=$('welcome'); if(!el) return;
  let seen=false; try{ seen=localStorage.getItem('clo-welcome')==='seen'||hasProgress() }catch(e){}
  el.hidden=show===true?false:seen;
  /* returning visitors get Chess Lab's board page (no big header on Today); the guide brings it back */
  document.body.classList.toggle('welcomed',el.hidden);
}
function dismiss(){ try{ localStorage.setItem('clo-welcome','seen') }catch(e){} $('welcome').hidden=true; document.body.classList.add('welcomed') }
function init(){
  const grid=$('td-grid');
  P={today:grid.querySelector('.panel')};
  for(const [k,els] of [['drill',[$('drills').querySelector('.panel')]],['puzzle',[$('tactics').querySelector('.panel')]],['endgame',[$('endgames').querySelector('.panel')]],
    ['opening',[$('openings').querySelector('.otrain'),...$('openings').querySelectorAll(':scope > .modal')]]])
    P[k]=els.map(el=>({el,parent:el.parentNode,next:el.nextSibling}));
  board=makeBoard($('td-board'),{}); board.set(new Chess(),{locked:true});
  $('td-list').addEventListener('click',e=>{ const b=e.target.closest('.drill[data-k]'); if(!b) return; const it=items().find(x=>keyOf(x)===b.dataset.k); if(it){ play(it);
    if(innerWidth<860){ const bd=document.querySelector('#td-grid > :not([hidden]) .board'); if(bd&&bd.scrollIntoView) bd.scrollIntoView({behavior:'smooth',block:'start'}) } } });
  $('td-cards').addEventListener('click',e=>{ const a=e.target.closest('a[data-td]'); if(!a) return; const it=items().find(x=>keyOf(x)===a.dataset.td); if(it){ e.preventDefault(); play(it);
    if(innerWidth<860){ const bd=document.querySelector('#td-grid > :not([hidden]) .board'); if(bd&&bd.scrollIntoView) bd.scrollIntoView({behavior:'smooth',block:'start'}) } } });
  /* the empty state's own board: Start opens the endgame or opening line still to do */
  $('td-go').addEventListener('click',()=>{ const it=items().find(x=>!x.done)||items()[0]; if(it) play(it) });
  $('td-next').addEventListener('click',nextItem); $('td-flip').addEventListener('click',()=>board.flip());
  /* keys: with a tab's panel on the board, that tab's own keymap (its N goes to the next item in the session) */
  Keys.on('today',{n:['Next in session',nextItem],f:['Flip the board',()=>board.flip()]});
  const view0=Keys.view; Keys.view=()=>{ const v=view0(); return v==='today'&&hosted?VIEW[hosted]:v };
  addEventListener('hashchange',()=>{ if(Router.parse(location.hash).name!=='today') undock() });   /* from the address, so the order of listeners doesn't matter */
  addEventListener('watch-change',refresh);
  TV.fitBoard('#td-wrap','#td-tools');
  welcome();
  $('welcome-x').addEventListener('click',dismiss); $('welcome-ok').addEventListener('click',dismiss);
  $('welcome-go').addEventListener('click',dismiss);
  $('td-help').addEventListener('click',()=>{ welcome(true); setTimeout(()=>{ const e=$('welcome'); if(e.scrollIntoView) e.scrollIntoView({block:'start'}) },30) });
  /* the hero's link and the footer's (the hero hides for returning visitors): the guide on Today */
  for(const id of ['help-open','help-foot']){ const b=$(id); if(b) b.addEventListener('click',()=>{ location.hash='#today'; welcome(true); setTimeout(()=>{ const e=$('welcome'); if(e.scrollIntoView) e.scrollIntoView({block:'start'}) },30) }) }
  /* the puzzle library loads after this page: rebuild an empty plan once it is there */
  /* draw as soon as the puzzles are there, and again when the endgames arrive (the plan gains its endgame) */
  let tries=0, had=0; const tick=()=>{ tries++; const lib=(TacticsTab.lib||[]).length>0, eg=!!EndgamesTab.data, now=(lib?1:0)+(eg?1:0);
    if(now>had&&lib&&document.body.dataset.view==='today'){ had=now; if(hosted) refresh(); else render() }
    if((lib&&eg)||tries>100) clearInterval(wait) };
  const wait=setInterval(tick,100); addEventListener('tactics-lib',()=>setTimeout(tick,0));
}
window.TodayTab={init,render,plan,items,start,select,next:nextItem,get hosted(){return hosted},get sel(){return sel}};
})();
