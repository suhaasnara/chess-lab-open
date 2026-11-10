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
function render(){
  const el=$('td-list'); if(!el) return;
  const list=items(), done=list.filter(x=>x.done).length;
  const n=streak(list.length,done);
  $('td-head').innerHTML=`<b>${done}</b> of ${list.length} done today`+(n?` · <span class="note">${n}-day streak</span>`:'');
  $('td-bar').style.width=(list.length?Math.round(100*done/list.length):0)+'%';
  const nxt=list.find(x=>!x.done);
  const go=$('td-go'); go.disabled=!nxt; go.textContent=nxt?(done?'Continue':'Start today’s session'):'All done for today ✓';
  go.onclick=()=>{ if(nxt) start(nxt) };
  el.innerHTML='';
  for(const it of list){
    const b=document.createElement('button'); b.className='drill'+(it.done?' done':'');
    b.innerHTML=`<span class="src">${it.done?'✓':it.kind==='drill'?'D':it.kind==='puzzle'?'P':it.kind==='endgame'?'E':'O'}</span><span><span class="opp">${esc(it.title)}</span><br><span class="meta">${esc(it.meta)}</span></span><span class="evalchip">&#9654;</span>`;
    b.addEventListener('click',()=>start(it));
    el.appendChild(b);
  }
  /* Watch: the video you were in the middle of (a link, not part of the count) */
  const wt=window.WatchTab&&WatchTab.today();
  if(wt){ const a=document.createElement('a'); a.className='drill wtoday'; a.href=wt.url; a.target='_blank'; a.rel='noopener';
    a.innerHTML=`<span class="src">W</span><span><span class="opp">Watch: ${esc(wt.v.title)}</span><br><span class="meta">${esc(wt.label)} · opens YouTube</span></span><span class="evalchip">↗</span>`; el.appendChild(a) }
  const nd=(Store.get('adrills')||[]).length;
  $('td-note').innerHTML=nd?'':'Drills from your own games appear here once you run <a href="#analyze">Analyze my games</a> and save some.';
}
/* First visit: a short guide on Today (dismissable; "How it works" in the header brings it back). */
function welcome(show){
  const el=$('welcome'); if(!el) return;
  let seen=false; try{ seen=localStorage.getItem('clo-welcome')==='seen' }catch(e){}
  el.hidden=show===true?false:seen;
}
function dismiss(){ try{ localStorage.setItem('clo-welcome','seen') }catch(e){} $('welcome').hidden=true }
function init(){
  welcome();
  $('welcome-x').addEventListener('click',dismiss); $('welcome-ok').addEventListener('click',dismiss);
  $('welcome-go').addEventListener('click',dismiss);
  $('help-open').addEventListener('click',()=>{ location.hash='#today'; welcome(true); setTimeout(()=>{ const e=$('welcome'); if(e.scrollIntoView) e.scrollIntoView({block:'start'}) },30) });
  /* the puzzle library loads after this page: rebuild an empty plan once it is there */
  let tries=0; const wait=setInterval(()=>{ tries++; if(((TacticsTab.lib||[]).length&&EndgamesTab.data)||tries>40){ clearInterval(wait); if(document.body.dataset.view==='today') render() } },250);
}
window.TodayTab={init,render,plan,items,start};
})();
