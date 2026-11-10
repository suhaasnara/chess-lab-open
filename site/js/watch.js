/* Chess Lab Open — Watch: your own chess video library.
   Paste YouTube links; each video keeps your position, watched state, notes (timestamps become links) and
   bookmarks, grouped by series. No player on the page and no embeds: every video is a deep link to YouTube at your
   saved position (&t=), and the page never contacts YouTube unless you press "Get title". Everything lives in this
   browser (Store key "watch", included in Progress → Export). */
'use strict';
(function(){
const F={kind:'all',state:'all',topic:'all',q:''};
const VIEWS=[['series','By series'],['recent','Last watched'],['added','Order added']];
let EXP=null, VIEW='series';
try{ const v=localStorage.getItem('clo-watch-view'); if(VIEWS.some(x=>x[0]===v)) VIEW=v }catch(e){}

const data=()=>{ const d=Store.get('watch'); return d&&typeof d==='object'?{v:d.v||{},list:Array.isArray(d.list)?d.list:[]}:{v:{},list:[]} };
const save=d=>{ Store.put('watch',d); render(); dispatchEvent(new Event('watch-change')) };
const rec=id=>data().v[id]||{};
function put(id,patch){ const d=data(); d.v[id]=Object.assign({},d.v[id],patch,{u:Date.now()}); save(d) }
function putMany(pairs){ const d=data(); for(const [id,patch] of pairs) d.v[id]=Object.assign({},d.v[id],patch,{u:Date.now()}); save(d) }
function all(){ return data().list.map((m,i)=>Object.assign({n:i},m)) }
function pos(v){ const r=rec(v.id); return r.t!=null?r.t:0 }
function state(v){ const r=rec(v.id); return r.w?'watched':(pos(v)>0?'progress':'new') }
function url(v,t){ const s=t!=null?t:pos(v); return 'https://www.youtube.com/watch?v='+encodeURIComponent(v.id)+(s>0?'&t='+Math.floor(s)+'s':'') }
function fmt(s){ s=Math.max(0,Math.floor(s||0)); const h=Math.floor(s/3600), m=Math.floor(s%3600/60), x=s%60, p=n=>String(n).padStart(2,'0');
  return h?h+':'+p(m)+':'+p(x):m+':'+p(x) }
function parseTime(txt){ txt=String(txt||'').trim(); if(!txt) return null; if(/^\d+$/.test(txt)) return +txt;
  if(!/^\d{1,2}(:\d{1,2}){1,2}$/.test(txt)) return null; return txt.split(':').reduce((a,b)=>a*60+ +b,0) }
/* a YouTube link -> {id, t}: watch?v=, youtu.be/, shorts/, embed/, live/, with &t=1h2m3s or ?t=123 */
function parseLink(u){ const s=String(u||'').trim(); const m=s.match(/(?:[?&]v=|youtu\.be\/|\/shorts\/|\/embed\/|\/live\/)([\w-]{11})/)||s.match(/^([\w-]{11})$/); if(!m) return null;
  let t=0; const tm=s.match(/[?&#](?:t|start)=([\dhms]+)/); if(tm){ const x=tm[1]; if(/^\d+$/.test(x)) t=+x; else { const h=+(x.match(/(\d+)h/)||[0,0])[1], mi=+(x.match(/(\d+)m/)||[0,0])[1], se=+(x.match(/(\d+)s/)||[0,0])[1]; t=h*3600+mi*60+se } }
  return {id:m[1],t} }
/* chapter number from the title ("12.1 …", "Chapter 3 …", "Part 2"), for ordering a series */
function chNum(v){ let m=String(v.title).match(/^(\d+(?:\.\d+)?)/); if(m) return parseFloat(m[1]);
  m=String(v.title).match(/(?:chapter|class|lesson|part|episode|ep\.?)\s*(\d+(?:\.\d+)?)/i); if(m) return parseFloat(m[1]); return 1e9 }
const groupOf=v=>v.series||v.channel||'Single videos';
function contNext(vs){ const prog=vs.filter(v=>state(v)==='progress').sort((a,b)=>(rec(b.id).u||0)-(rec(a.id).u||0))[0]; return prog||vs.find(v=>state(v)==='new') }
function matches(v){ const st=state(v);
  if(F.kind!=='all'&&(v.kind||'lecture')!==F.kind) return false; if(F.state!=='all'&&st!==F.state) return false;
  if(F.topic!=='all'&&(v.topic||'—')!==F.topic) return false;
  if(F.q){ const r=rec(v.id); const q=F.q.toLowerCase(); if(!(v.title+' '+(v.channel||'')+' '+(v.series||'')+' '+(v.topic||'')+' '+(v.opening||'')+' '+(r.notes||'')).toLowerCase().includes(q)) return false }
  return true }
const topics=()=>[...new Set(all().map(v=>v.topic||'—'))].sort((a,b)=>a==='—'?1:b==='—'?-1:a.localeCompare(b));
const OPEN={}; try{ Object.assign(OPEN,JSON.parse(localStorage.getItem('clo-watch-open')||'{}')) }catch(e){}

function render(){
  const list=$('wa-list'); if(!list) return;
  const a=document.activeElement; if(a&&a.closest&&a.closest('#watch .wadetail')&&a.dataset&&a.dataset.f){ list.dataset.dirty='1'; return }
  const A=all(), n=k=>A.filter(v=>(v.kind||'lecture')===k).length, s=k=>A.filter(v=>state(v)===k).length;
  const chips=(el,key,opts)=>{ $(el).innerHTML=opts.map(([v,l])=>`<button type="button" class="chip" data-k="${key}" data-v="${esc(v)}" aria-pressed="${F[key]===v}">${l}</button>`).join('') };
  chips('wa-kind','kind',[['all','All'],['lecture',`Lectures ${n('lecture')}`],['fun',`Fun ${n('fun')}`]]);
  chips('wa-state','state',[['all','Any'],['new',`Unwatched ${s('new')}`],['progress',`In progress ${s('progress')}`],['watched',`Watched ${s('watched')}`]]);
  $('wa-topic').innerHTML=`<option value="all">Topic: all</option>`+topics().map(o=>`<option value="${esc(o)}"${F.topic===o?' selected':''}>${esc(o)}</option>`).join('');
  $('wa-topics').innerHTML=topics().filter(t=>t!=='—').map(t=>`<option value="${esc(t)}">`).join('');
  $('wa-series').innerHTML=[...new Set(A.map(v=>v.series).filter(Boolean))].map(t=>`<option value="${esc(t)}">`).join('');
  $('wa-view').innerHTML=VIEWS.map(([v,l])=>`<button type="button" class="chip" data-view="${v}" aria-pressed="${VIEW===v}">${l}</button>`).join('');
  const L=A.filter(matches);
  $('wa-count').textContent=A.length?`${L.length} of ${A.length} video${A.length>1?'s':''}`:'';
  let html;
  if(!A.length) html='<div class="empty">Your library is empty. Paste a YouTube link above: a lecture series, a game recap, anything you want to come back to. Your position, notes and bookmarks are kept here.</div>';
  else if(F.q||VIEW==='added') html=L.map(row).join('');
  else if(VIEW==='recent') html=L.slice().sort((x,y)=>((rec(y.id).u||0)-(rec(x.id).u||0))||(x.n-y.n)).map(row).join('');
  else html=renderSeries(L);
  { const have=new Set(A.map(v=>v.id)), left=STARTERS.map((v,i)=>[v,i]).filter(([v])=>!have.has(v.id));
    if(left.length) html+=`<div class="card wstarters"><span class="label">Starter videos</span><p class="note">To try the library: add any of these. They open on YouTube at your place, like everything here.</p>${left.map(([v,i])=>`<div class="gamerow"><span>${esc(v.title)} <span class="note">· ${esc(v.channel)}</span></span><button type="button" class="btn sm" data-starter="${i}">Add</button></div>`).join('')}</div>` }
  list.innerHTML=html||'<div class="empty">Nothing matches these filters.</div>';
  if(EXP){ const d=list.querySelector(`.warow[data-id="${String(EXP).replace(/["\\]/g,'\\$&')}"] .wadetail`); if(d) fillDetail(d,EXP) }
}
function renderSeries(list){
  const groups=new Map(); list.forEach(v=>{ const g=groupOf(v); if(!groups.has(g)) groups.set(g,[]); groups.get(g).push(v) });
  return [...groups.entries()].map(([name,vs])=>{ vs.sort((a,b)=>(chNum(a)-chNum(b))||(a.n-b.n)); return {name,vs,act:Math.max(0,...vs.map(v=>rec(v.id).u||0)),minN:Math.min(...vs.map(v=>v.n))} })
    .sort((a,b)=>(b.act-a.act)||(a.minN-b.minN)).map(g=>{
      const done=g.vs.filter(v=>state(v)==='watched').length, next=contNext(g.vs), secs=g.vs.reduce((t,v)=>t+(v.sec||0),0);
      const open=g.name in OPEN?!!OPEN[g.name]:true;
      const act=next?`<a class="btn sm wacont" href="${url(next)}" target="_blank" rel="noopener" title="${esc(next.title)}${pos(next)>0?' at '+fmt(pos(next)):''}">${state(next)==='progress'?'Resume':'Continue'} ↗</a>`:'<span class="wst good">✓ Done</span>';
      return `<details class="card waser" data-g="${esc(g.name)}" ${open?'open':''}><summary><span class="wasname">${esc(g.name)}</span><span class="note">${done} of ${g.vs.length} watched${secs?' · '+fmt(secs):''}</span>${act}</summary><div class="wasbody">${g.vs.map(row).join('')}</div></details>`;
    }).join('');
}
function trainable(v){ if(!v.opening||!window.OpeningsTab) return null; const q=v.opening.toLowerCase(); return OpeningsTab.openings().find(o=>o.name.toLowerCase().includes(q)||q.includes(o.name.toLowerCase())) }
function row(v){
  const r=rec(v.id), st=state(v), p=pos(v);
  const prog=st==='watched'?'<span class="wst good">✓ Watched</span>'
    :st==='progress'?`<span class="wst warn">At ${fmt(p)}${v.sec?' of '+fmt(v.sec):''}</span>${v.sec?`<span class="wbar" aria-hidden="true"><i style="width:${Math.min(100,Math.round(100*p/v.sec))}%"></i></span>`:''}`:'';
  const bits=[esc(v.channel||''),v.sec?fmt(v.sec):'',(v.kind||'lecture')==='fun'?'Fun':'Lecture',esc(v.topic||''),esc(v.opening||''),r.notes?'✎ notes':'',(r.bm||[]).length?`${r.bm.length} bookmark${r.bm.length>1?'s':''}`:''].filter(Boolean);
  const tr=trainable(v);
  return `<div class="card warow${EXP===v.id?' open':''}" data-id="${esc(v.id)}">
    <div class="wamain"><a class="watitle" href="${url(v)}" target="_blank" rel="noopener">${esc(v.title)}</a>
      <div class="note">${bits.join(' · ')}</div>${prog?`<div class="waprog">${prog}</div>`:''}</div>
    <div class="wabtns"><a class="btn sm" href="${url(v)}" target="_blank" rel="noopener" title="Open on YouTube${p>0?' at '+fmt(p):''}">Watch ↗</a>
      ${tr?`<button type="button" class="btn sm" data-act="train" data-op="${esc(tr.id)}" title="Open ${esc(tr.name)} in Openings">Train this</button>`:''}
      <button type="button" class="btn sm" data-act="detail" aria-expanded="${EXP===v.id}">${EXP===v.id?'Close':'Details'}</button></div>
    <div class="wadetail"${EXP===v.id?'':' hidden'}></div></div>`;
}
function fillDetail(el,id){
  const v=all().find(x=>x.id===id); if(!el||!v) return; const r=rec(id), p=pos(v);
  const bm=(r.bm||[]).map((b,i)=>`<li><a href="${url(v,b.t)}" target="_blank" rel="noopener">${fmt(b.t)}</a> ${esc(b.label||'')} <button type="button" class="linkbtn" data-act="bm-del" data-i="${i}" aria-label="Remove bookmark">remove</button></li>`).join('');
  const ts=[...new Set((r.notes||'').match(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g)||[])].map(parseTime).filter(t=>t!=null&&(!v.sec||t<=v.sec));
  const earlier=v.series&&all().some(x=>x.series===v.series&&chNum(x)<=chNum(v)&&!rec(x.id).w);
  el.innerHTML=`<div class="row2">
      <div class="field"><span>Watched</span><div class="btns"><button type="button" class="btn sm${r.w?' primary':''}" data-act="watched">${r.w?'✓ Watched':'Mark watched'}</button>
        ${earlier?`<button type="button" class="btn sm" data-act="upto" title="Mark this video and every earlier one in ${esc(v.series)} watched">Watched up to here</button>`:''}
        ${r.w||p>0?'<button type="button" class="btn sm" data-act="clear">Start over</button>':''}</div></div>
      <label class="field">My position (h:mm:ss)<span class="moverow"><input data-f="time" value="${p>0?fmt(p):''}" placeholder="53:10" autocomplete="off" spellcheck="false"><button type="button" class="btn sm" data-act="save-t">Save</button></span></label></div>
    <label class="field" style="margin-top:8px">Notes<textarea data-f="notes" rows="3" placeholder="What to remember (timestamps like 12:34 become links)">${esc(r.notes||'')}</textarea></label>
    <p class="note" data-f="saved" role="status"></p>
    ${ts.length?`<p class="note">In your notes: ${ts.map(t=>`<a href="${url(v,t)}" target="_blank" rel="noopener">${fmt(t)} ↗</a>`).join(' · ')}</p>`:''}
    <div class="field"><span>Bookmarks</span><ul class="wabm">${bm}</ul>
      <span class="moverow"><input data-f="bmt" placeholder="1:02:03" autocomplete="off" spellcheck="false" style="max-width:110px" aria-label="Bookmark time"><input data-f="bml" placeholder="What happens here" autocomplete="off" aria-label="Bookmark label"><button type="button" class="btn sm" data-act="bm-add">Add</button></span></div>
    <details class="watags"><summary class="note">Edit details</summary><div class="row2" style="margin-top:8px">
      <label class="field">Title<input type="text" data-f="title" value="${esc(v.title)}"></label><label class="field">Series<input type="text" data-f="series" list="wa-series" value="${esc(v.series||'')}"></label>
      <label class="field">Channel<input type="text" data-f="channel" value="${esc(v.channel||'')}"></label><label class="field">Length (h:mm:ss)<input type="text" data-f="sec" value="${v.sec?fmt(v.sec):''}"></label>
      <label class="field">Topic<input type="text" data-f="topic" list="wa-topics" value="${esc(v.topic||'')}"></label><label class="field">Opening (links to Openings)<input type="text" data-f="opening" value="${esc(v.opening||'')}"></label>
      <label class="field">Kind<select data-f="kind"><option value="lecture"${(v.kind||'lecture')==='lecture'?' selected':''}>Lecture</option><option value="fun"${v.kind==='fun'?' selected':''}>Fun</option></select></label></div>
      <div class="btns" style="margin-top:8px"><button type="button" class="btn sm" data-act="meta-save">Save details</button><button type="button" class="btn sm" data-act="remove">Remove this video</button></div></details>`;
}
function setMeta(id,patch){ const d=data(); const i=d.list.findIndex(x=>x.id===id); if(i<0) return; d.list[i]=Object.assign({},d.list[i],patch); save(d) }
/* Starter videos (Session C): real links, checked by hand; deep links as always, no embeds. One click adds one. */
const STARTERS=[
  {id:'rgLTiUZAWQY',t:1200,title:'Scandinavian Defense Dissected | GM Naroditsky’s DYI Speedrun (the Najdorf game from 20:00)',channel:'Daniel Naroditsky',series:'Speedruns',kind:'speedrun',topic:'Openings',opening:'Sicilian Najdorf'},
  {id:'AFntasewn9Q',title:'Mickey Adams Game Review with GM Johan Hellsten | USCS',channel:'U.S. Chess School',series:'U.S. Chess School',kind:'game',topic:'Game review'},
  {id:'-OeADHFL-nY',title:'GM Sam Shankland: High-Level Defense II | US Chess School 5.7.2021',channel:'ChessDojo',series:'U.S. Chess School',kind:'lecture',topic:'Defence'}];
function addStarter(i){ const v=STARTERS[i], d=data(); if(!v||d.list.some(x=>x.id===v.id)) return false;
  d.list.push({id:v.id,title:v.title,channel:v.channel,series:v.series,kind:v.kind,topic:v.topic,opening:v.opening||'',sec:0,added:Date.now()});
  if(v.t) d.v[v.id]={t:v.t,u:Date.now()}; save(d); render(); return true }
function add(){
  const err=$('wa-aerr'); err.textContent='';
  const L=parseLink($('wa-aurl').value), title=$('wa-atitle').value.trim();
  if(!L){ err.textContent='That is not a YouTube video link.'; return false }
  if(!title){ err.textContent='Give it a title (or press Get title).'; return false }
  const d=data(); if(d.list.some(v=>v.id===L.id)){ err.textContent='Already in your library.'; return false }
  d.list.push({id:L.id,title,channel:$('wa-ach').value.trim(),series:$('wa-aser').value.trim(),kind:$('wa-akind').value,topic:$('wa-atopic').value.trim(),opening:$('wa-aop').value.trim(),sec:parseTime($('wa-adur').value)||0,added:Date.now()});
  if(L.t) d.v[L.id]={t:L.t,u:Date.now()};
  save(d);
  ['wa-aurl','wa-atitle','wa-ach','wa-atopic','wa-adur','wa-aop'].forEach(i=>$(i).value=''); err.textContent='Added.'; return true;
}
/* Get title: YouTube's public oEmbed endpoint (title and channel), only when you ask. */
async function getTitle(){
  const L=parseLink($('wa-aurl').value), err=$('wa-aerr'); if(!L){ err.textContent='Paste a YouTube link first.'; return }
  err.textContent='Asking YouTube…';
  try{ const r=await fetch('https://www.youtube.com/oembed?format=json&url='+encodeURIComponent('https://www.youtube.com/watch?v='+L.id)); if(!r.ok) throw new Error(r.status);
    const j=await r.json(); if(j.title&&!$('wa-atitle').value.trim()) $('wa-atitle').value=j.title; if(j.author_name&&!$('wa-ach').value.trim()) $('wa-ach').value=j.author_name; err.textContent='' }
  catch(e){ err.textContent='YouTube did not answer from here. Type the title instead.' }
}
/* For Today: the video you were watching last, if any (a link, not part of the session). */
function today(){ const v=all().filter(x=>state(x)==='progress').sort((a,b)=>(rec(b.id).u||0)-(rec(a.id).u||0))[0]
  ||(()=>{ const s=all().filter(x=>x.series&&state(x)==='new'&&all().some(y=>y.series===x.series&&state(y)==='watched')); return s.sort((a,b)=>chNum(a)-chNum(b))[0] })();
  return v?{v,url:url(v),label:state(v)==='progress'?'Resume at '+fmt(pos(v)):'Next in '+v.series}:null }
/* Today's Watch card, Chess Lab's balanced daily plan: up to 3 videos. Resume the one you touched last, then one pick from
   each of up to two OTHER topics, rotating daily so every topic gets its day; each pick is its series' next chapter.
   Fun videos never appear. */
function plan(){
  const lect=all().filter(v=>(v.kind||'lecture')!=='fun');
  if(!lect.length) return [];
  const day=new Date().toISOString().slice(0,10);
  const hash=s=>{ let h=0; for(const c of s) h=(h*31+c.charCodeAt(0))|0; return h };
  const picks=[], usedTopic=new Set(), usedGroup=new Set();
  const going=lect.filter(v=>state(v)==='progress').sort((a,b)=>(rec(b.id).u||0)-(rec(a.id).u||0))[0];
  if(going){ picks.push({v:going,label:'Continue'}); usedTopic.add(going.topic||'—'); usedGroup.add(groupOf(going)) }
  const topics=[...new Set(lect.map(v=>v.topic).filter(Boolean))].sort((a,b)=>hash(a+day)-hash(b+day));
  for(const t of topics){
    if(picks.length>=3) break; if(usedTopic.has(t)) continue;
    const cands=lect.filter(v=>v.topic===t&&state(v)!=='watched'&&!usedGroup.has(groupOf(v)));
    if(!cands.length) continue;
    const groups=new Map(); cands.forEach(v=>{ const g=groupOf(v); if(!groups.has(g)) groups.set(g,[]); groups.get(g).push(v) });
    const best=[...groups.values()].map(vs=>{ vs.sort((a,b)=>(chNum(a)-chNum(b))||(a.n-b.n));
      return {vs,act:Math.max(0,...vs.map(v=>rec(v.id).u||0)),minN:Math.min(...vs.map(v=>v.n))} })
      .sort((a,b)=>(b.act-a.act)||(a.minN-b.minN))[0];
    const v=contNext(best.vs); if(!v) continue;
    picks.push({v,label:t[0].toUpperCase()+t.slice(1)}); usedTopic.add(t); usedGroup.add(groupOf(v));
  }
  return picks.map(({v,label})=>({v,label,url:url(v),meta:[v.series||'',pos(v)>0?'at '+fmt(pos(v)):'',v.sec?fmt(v.sec):''].filter(Boolean).join(' · ')}));
}

function init(){
  Keys.on('watch',{'/':['Search videos',()=>{ const i=$('wa-search'); i.focus(); i.select() }]});
  const sec=$('watch'); if(!sec) return;
  sec.addEventListener('click',e=>{
    { const st=e.target.closest('[data-starter]'); if(st){ addStarter(+st.dataset.starter); return } }
    const cont=e.target.closest('.waser summary a.wacont'); if(cont){ e.preventDefault(); try{ window.open(cont.href,'_blank','noopener') }catch(_){} return }
    const chip=e.target.closest('.chip'); if(chip){ if(chip.dataset.view){ VIEW=chip.dataset.view; try{ localStorage.setItem('clo-watch-view',VIEW) }catch(_){} } else F[chip.dataset.k]=chip.dataset.v; render(); return }
    if(e.target.id==='wa-asave'){ add(); return } if(e.target.id==='wa-aget'){ getTitle(); return }
    const rowEl=e.target.closest('.warow'); if(!rowEl) return; const id=rowEl.dataset.id;
    const btn=e.target.closest('[data-act]'); const act=btn&&btn.dataset.act; if(!act) return;
    const q=f=>rowEl.querySelector(`[data-f="${f}"]`);
    if(act==='detail'){ EXP=EXP===id?null:id; render() }
    else if(act==='train'){ location.hash='#openings'; setTimeout(()=>OpeningsTab.selectOpening(btn.dataset.op),30) }
    else if(act==='watched'){ put(id,{w:rec(id).w?0:1}) }
    else if(act==='upto'){ const v=all().find(x=>x.id===id); putMany(all().filter(x=>x.series===v.series&&chNum(x)<=chNum(v)&&!rec(x.id).w).map(x=>[x.id,{w:1,t:null}])) }
    else if(act==='clear'){ put(id,{w:0,t:null}) }
    else if(act==='save-t'){ const t=parseTime(q('time').value); if(t==null){ q('time').value=''; return } put(id,{t,w:0}) }
    else if(act==='bm-add'){ const t=parseTime(q('bmt').value); if(t==null) return; const r=rec(id); put(id,{bm:[...(r.bm||[]),{t,label:q('bml').value.trim()}].sort((a,b)=>a.t-b.t)}) }
    else if(act==='bm-del'){ const r=rec(id), bm=(r.bm||[]).slice(); bm.splice(+btn.dataset.i,1); put(id,{bm}) }
    else if(act==='meta-save'){ const t=q('title').value.trim(); setMeta(id,{title:t||all().find(x=>x.id===id).title,series:q('series').value.trim(),channel:q('channel').value.trim(),sec:parseTime(q('sec').value)||0,topic:q('topic').value.trim(),opening:q('opening').value.trim(),kind:q('kind').value}) }
    else if(act==='remove'){ if(!confirm('Remove this video, with its notes and bookmarks?')) return; const d=data(); d.list=d.list.filter(x=>x.id!==id); delete d.v[id]; EXP=null; save(d) }
  });
  sec.addEventListener('change',e=>{ if(e.target.id==='wa-topic'){ F.topic=e.target.value; render() } });
  sec.addEventListener('toggle',e=>{ const d=e.target; if(d.classList&&d.classList.contains('waser')){ OPEN[d.dataset.g]=d.open?1:0; try{ localStorage.setItem('clo-watch-open',JSON.stringify(OPEN)) }catch(_){} } },true);
  let timer=null;
  sec.addEventListener('input',e=>{
    if(e.target.id==='wa-search'){ F.q=e.target.value.trim(); clearTimeout(timer); timer=setTimeout(render,200); return }
    if(e.target.dataset&&e.target.dataset.f==='notes'){ const rowEl=e.target.closest('.warow'); const id=rowEl.dataset.id, val=e.target.value;
      clearTimeout(timer); timer=setTimeout(()=>{ const d=data(); d.v[id]=Object.assign({},d.v[id],{notes:val,u:Date.now()}); Store.put('watch',d); const s=rowEl.querySelector('[data-f="saved"]'); if(s){ s.textContent='Saved.'; setTimeout(()=>{ if(s.isConnected) s.textContent='' },1500) } },500) }
  });
  /* typing in a detail field must not redraw the list under the cursor: the redraw waits for the field to lose focus */
  sec.addEventListener('focusout',()=>setTimeout(()=>{ const l=$('wa-list'); const a=document.activeElement; if(l.dataset.dirty&&!(a&&a.closest&&a.closest('#watch .wadetail'))){ delete l.dataset.dirty; render() } },50));
  $('wa-addcard').open=!all().length;   /* the add form starts open only while the library is empty */
  $('wa-aurl').addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); if($('wa-atitle').value.trim()) add(); else $('wa-atitle').focus() } });
  render();
}
window.WatchTab={init,STARTERS,addStarter,render,add,parseLink,parseTime,fmt,url,today,plan,get all(){return all()},rec,put};
})();
