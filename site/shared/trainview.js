/* Train view (shared screens, stage 2): small render helpers for the list | board | coach-card pages (Today, Drills,
   Tactics) on both sites, so their left panels, list rows and coach cards are the same markup (styles: trainview.css).
   Each site keeps its own data, logic and progress keys; these only build HTML strings. Text passed as `html` is
   inserted as is (callers escape their own data); everything else is escaped here.
   Home: chess-lab-open/site/shared/ (MIT). The private kit pulls a pinned copy; edit it here, never there. */
'use strict';
(function(){
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* A labelled chip row: TV.chips('Status','status',[['all','Any'],['new','Not tried']],'all') →
   <div class="chips"><span class="flabel">Status</span><button class="chip" data-k="status" data-v="all" aria-pressed="true">Any</button>…</div>
   o.attr changes the data attribute (Chess Lab's Tactics uses data-tk); o.raw: labels are HTML (counts, etc.). */
function chips(label,key,opts,cur,o={}){
  const attr=o.attr||'data-k';
  return `<div class="chips${label?'':' nolabel'}"${o.id?` id="${esc(o.id)}"`:''} role="group" aria-label="${esc(label||key)}">${label?`<span class="flabel">${esc(label)}</span>`:''}`+
    opts.map(([v,l])=>`<button type="button" class="chip" ${attr}="${esc(key)}" data-v="${esc(v)}" aria-pressed="${String(cur)===String(v)}">${o.raw?l:esc(l)}</button>`).join('')+'</div>';
}
/* One delegated click handler for chip rows inside `root`: fn(key, value) */
function onChip(root,fn,attr='data-k'){
  root.addEventListener('click',e=>{ const b=e.target.closest('button.chip['+attr+']'); if(!b||!root.contains(b)) return; fn(b.getAttribute(attr),b.dataset.v) });
}
/* "Puzzle rating 2000  first try at each puzzle counts" */
function rate(label,value,note){
  return `<div class="trate"><span class="label">${esc(label)}</span> <b class="mono">${esc(value)}</b> <span class="note">${esc(note||'')}</span></div>`;
}
/* A compact list row. r: {badge, badgeTitle, title (html), meta (html), right (html), current, data:{i:3}, cls, href} */
function row(r){
  const data=Object.entries(r.data||{}).map(([k,v])=>` data-${k}="${esc(v)}"`).join('');
  const inner=`<span class="evalchip mono"${r.badgeTitle?` title="${esc(r.badgeTitle)}"`:''}>${esc(r.badge==null?'':r.badge)}</span><span><div class="opp">${r.title||''}</div><div class="meta">${r.meta||''}</div></span>${r.right||''}`;
  return r.href
    ?`<a class="drill${r.cls?' '+r.cls:''}" href="${esc(r.href)}" target="_blank" rel="noopener"${data}>${inner}</a>`
    :`<button type="button" class="drill${r.cls?' '+r.cls:''}"${data} aria-current="${!!r.current}">${inner}</button>`;
}
/* Progress dots: [['good','Find the move'],['', 'Play it out']] */
function dots(list){ return `<span class="dots">${list.map(([c,t])=>`<span class="dot${c?' '+c:''}" title="${esc(t)}"></span>`).join('')}</span>` }
/* The coach card at the top right. h: {kicker (html), right (html), title (html), chips: [html…], extra (html)} */
function head(h){
  return `<div class="card ohead"><div class="ohtop"><span class="label">${h.kicker||''}</span>${h.right?`<span class="note mono">${h.right}</span>`:''}</div>
    <h2>${h.title||''}</h2>${h.chips&&h.chips.length?`<div class="ohchips">${h.chips.filter(Boolean).map(c=>`<span>${c}</span>`).join('')}</div>`:''}${h.extra||''}</div>`;
}
/* The navy session bar: "Today's session  2 of 5 done" with a progress bar */
function session(label,done,total,note){
  return `<div class="session"><div><div class="label">${esc(label)}</div><b>${done} of ${total} done</b>${note?` <span class="note" style="color:var(--blue-on-navy)">${esc(note)}</span>`:''}</div><div class="progressbar" aria-hidden="true"><i style="width:${total?Math.round(done/total*100):0}%"></i></div></div>`;
}
/* The toolbar under a board is never cut off by the bottom of the window: if it would be, the board shrinks just enough
   for it to fit; if that would make the board smaller than 300px, the toolbar moves fully below the fold instead.
   Laptops only (on phones the page stacks and scrolls). Sets --bfit on the board's wrapper. (Chess Lab v46.) */
function fitBoard(wrapSel,ctlSel){
  const fit=()=>{ const w=document.querySelector(wrapSel), c=document.querySelector(ctlSel); if(!w||!c) return;
    w.style.removeProperty('--bfit'); c.style.marginTop='';
    if(!w.offsetParent||innerWidth<=860||!c.offsetHeight) return;
    const b=w.querySelector('.board'); if(!b) return;
    const y=scrollY, vh=innerHeight, top=c.getBoundingClientRect().top+y, bot=top+c.offsetHeight;
    if(bot<=vh-8||top>=vh) return;   // fits, or already wholly below the fold
    const size=b.getBoundingClientRect().width-(bot-(vh-12));
    if(size>=300){ w.style.setProperty('--bfit',Math.floor(size)+'px'); const nb=c.getBoundingClientRect().top+y+c.offsetHeight; if(nb>vh-8) w.style.setProperty('--bfit',Math.floor(size-(nb-(vh-12)))+'px') }
    else c.style.marginTop=(vh-top+16)+'px' };
  let q=false; const later=()=>{ if(q) return; q=true; requestAnimationFrame(()=>{ q=false; fit() }) };
  addEventListener('resize',later); addEventListener('hashchange',()=>setTimeout(later,50));
  const c=document.querySelector(ctlSel); if(c&&window.MutationObserver) new MutationObserver(later).observe(c,{childList:true,subtree:true,characterData:true});
  if(window.MutationObserver) new MutationObserver(later).observe(document.body,{attributes:true,attributeFilter:['data-size','data-view']});
  later();
}
/* A labelled drop-down (Endgames' category on both sites): pick('Category','group',[[value,label]…],current) -> HTML.
   Uses the sites' .field / .label styles; read it with onPick(container, (key, value) => …). */
function pick(label,key,opts,cur){ return `<label class="field tvpick"><span class="label">${esc(label)}</span><select data-k="${esc(key)}" aria-label="${esc(label)}">`+
  opts.map(([v,l])=>`<option value="${esc(v)}"${String(v)===String(cur)?' selected':''}>${esc(l)}</option>`).join('')+'</select></label>' }
function onPick(el,fn){ el.addEventListener('change',e=>{ const s=e.target.closest('.tvpick select[data-k]'); if(s) fn(s.dataset.k,s.value) }) }
/* The bottom bar on phones and iPads (14 Nov 2026; styles and the rules: trainview.css ".bbar"). bar(row, o) turns a page's
   own button row into it: o.prev / o.next = the buttons that step back / forward through the line on the board (far left
   and far right), o.primary = the page's main action (beside ›), o.more = less-used buttons folded into ⋯ on phones, o.note = a short status line shown above the buttons, o.inner = wrappers inside the row whose buttons join the bar,
   o.host = the element that gets room at the bottom so nothing hides behind the bar. Values are selectors (or lists of
   them) for buttons inside the row. Only classes are added: ids, handlers and document order stay, so laptops, keys and
   tests are untouched; a row that is rebuilt (innerHTML) is marked again. */
function bar(el,o={}){
  if(typeof el==='string') el=document.querySelector(el); if(!el) return null;
  el.classList.add('bbar'); setTimeout(()=>{ if(padLater.watch) padLater.watch(); padLater() },0);
  const host=typeof o.host==='string'?document.querySelector(o.host):o.host; if(host) host.classList.add('bbar-host');
  const kids=sel=>{ const out=[]; for(const s of [].concat(sel||[])){ let m=[]; try{ m=el.querySelectorAll(s) }catch(e){} for(const b of m) out.push(b) } return out };
  const close=()=>{ el.classList.remove('bb-open'); const m=el.querySelector('.bb-morebtn'); if(m) m.setAttribute('aria-expanded','false') };
  const mark=()=>{
    for(const [sel,cls] of [[o.prev,'bb-prev'],[o.next,'bb-next'],[o.primary,'bb-primary'],[o.more,'bb-x'],[o.note,'bb-note'],[o.inner,'bb-in']]) for(const b of kids(sel)) if(!b.classList.contains(cls)) b.classList.add(cls);
    let m=null, need=false; for(const c of el.querySelectorAll('.bb-morebtn,.bb-x')){ if(c.classList.contains('bb-morebtn')) m=c; else if(!c.hidden) need=true }
    if(need&&!m){ m=document.createElement('button'); m.type='button'; m.className='btn sm bb-morebtn'; m.setAttribute('aria-label','More buttons'); m.setAttribute('aria-expanded',String(el.classList.contains('bb-open'))); m.textContent='⋯'; el.appendChild(m) }
    else if(!need&&m){ m.remove(); close() } };
  mark();
  if(window.MutationObserver) new MutationObserver(mark).observe(el,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});
  el.addEventListener('click',e=>{ const m=e.target.closest&&e.target.closest('.bb-morebtn');
    if(m&&m.parentNode===el){ const on=!el.classList.contains('bb-open'); el.classList.toggle('bb-open',on); m.setAttribute('aria-expanded',String(on)); e.stopPropagation() } else close() });
  document.addEventListener('click',e=>{ if(!el.contains(e.target)) close() });
  return el;
}
/* Pinned board on phones and upright iPads (styles: trainview.css ".tvpin"): pin(section, column that holds the board). */
function pin(sec,col){ const q=x=>typeof x==='string'?document.querySelector(x):x; sec=q(sec); col=q(col); if(!sec||!col) return;
  sec.classList.add('tvpinned'); col.classList.add('tvpin');
  /* --navh = the tab row's height (the board sticks just under it). The row may not be built yet when a page calls this. */
  const set=()=>{ const nv=document.querySelector('nav.tabs'); if(nv&&nv.offsetHeight>20) document.documentElement.style.setProperty('--navh',nv.offsetHeight+'px') };
  set(); setTimeout(set,0); setTimeout(set,800); addEventListener('load',set); addEventListener('resize',set); addEventListener('hashchange',()=>setTimeout(set,60)); if(padLater.watch) padLater.watch(); padLater() }
/* 15 Nov 2026: what is stuck over the page (the tab row and a pinned board at the top, the bottom bar at the bottom) becomes
   the page's scroll-padding, so scrollIntoView, find-in-page and a #link land in the part of the screen you can see
   instead of under the board (a solution card's heading used to go under it). Pinned boards are .tvpin or [data-pinpad]. */
function safeTop(){ let p=document.getElementById('tv-safe'); if(!p){ p=document.createElement('div'); p.id='tv-safe'; p.setAttribute('aria-hidden','true');
    p.style.cssText='position:fixed;top:0;left:0;width:0;height:env(safe-area-inset-top,0px);visibility:hidden;pointer-events:none'; document.body.appendChild(p) }
  return p.offsetHeight||0 }
function pads(){ const de=document.documentElement; let top=0, bot=0, nav=0;
  const nv=document.querySelector('nav.tabs'); if(nv&&nv.offsetHeight&&!de.classList.contains('navhid')){ const cs=getComputedStyle(nv); if(/sticky|fixed/.test(cs.position)) top=nav=Math.max(top,(parseFloat(cs.top)||0)+nv.offsetHeight) }
  for(const e of document.querySelectorAll('.tvpin,[data-pinpad]')){ if(!e.offsetParent) continue; const cs=getComputedStyle(e); if(cs.position!=='sticky'&&cs.position!=='fixed') continue;
    top=Math.max(top,(de.classList.contains('navhid')?safeTop():(parseFloat(cs.top)||0))+e.offsetHeight) }
  for(const e of document.querySelectorAll('.bbar')){ const r=e.getBoundingClientRect(); if(!r.height) continue; if(getComputedStyle(e).position!=='fixed') continue; bot=Math.max(bot,r.height) }   /* size first: getComputedStyle is slow in test DOMs */
  return {top,bot,nav} }
let padQ=0;
function padNow(){ padQ=0; const {top,bot,nav}=pads(), st=document.documentElement.style; st.scrollPaddingTop=top?Math.round(top+8)+'px':''; st.scrollPaddingBottom=bot?Math.round(bot+8)+'px':'';
  /* the pinned board itself (or a square on it) scrolled into view goes just under the tab row, not under the padding: its
     scroll-margin takes the padding back (trainview.css) */
  st.setProperty('--pinback',top>nav?Math.round(nav-top-8)+'px':'0px') }
function padLater(){ if(!padQ) padQ=requestAnimationFrame(padNow) }
if(typeof window!=='undefined'&&typeof document!=='undefined'){
  addEventListener('resize',padLater); addEventListener('hashchange',()=>setTimeout(padLater,80)); addEventListener('load',padLater);
  if(window.MutationObserver) new MutationObserver(padLater).observe(document.documentElement,{attributes:true,attributeFilter:['class']});
  if(window.ResizeObserver){ const ro=new ResizeObserver(padLater); const watch=()=>{ for(const e of document.querySelectorAll('.tvpin,[data-pinpad],.bbar')) if(!e.__tvro){ e.__tvro=1; ro.observe(e) } }; padLater.watch=watch; addEventListener('load',watch); addEventListener('hashchange',()=>setTimeout(watch,80)) } }
/* true where the pinned layout is on (the page scrolls under the board; boxes with their own scrollbars are opened up) */
function pinned(){ return !!(window.matchMedia&&matchMedia('(orientation:portrait) and (max-width:1099.98px)').matches) }
/* Lists on phones (18 Nov 2026): a list is part of the page, not a short scrolling box that cut off mid-row; it shows
   LIST_STEP rows and a "Show more" button under it adds the next ones. The current row is always shown. Laptops and
   wider windows keep the whole list in its own scrolling column. Every .tv list gets this, whichever page made it. */
const LIST_STEP=20, LISTQ=window.matchMedia?matchMedia('(max-width:860px)'):null;
function listMore(list){
  if(list.__more) return; list.__more=true; let limit=LIST_STEP;
  const b=document.createElement('button'); b.type='button'; b.className='btn sm lmore'; b.hidden=true;
  list.insertAdjacentElement('afterend',b);
  const apply=()=>{ const on=!!(LISTQ&&LISTQ.matches); let n=0, hid=0;
    for(const x of list.children){ if(x.matches('.empty')) continue;
      const hide=on&&n>=limit&&x.getAttribute('aria-current')!=='true'; x.classList.toggle('lm-hide',hide); if(hide) hid++; n++ }
    b.hidden=!hid; if(hid) b.textContent=`Show more (${hid.toLocaleString()} more)`; };
  b.addEventListener('click',()=>{ limit+=LIST_STEP; apply() });
  new MutationObserver(apply).observe(list,{childList:true});
  if(LISTQ&&LISTQ.addEventListener) LISTQ.addEventListener('change',apply);
  apply();
}
function moreLists(){ document.querySelectorAll('.tv .list').forEach(listMore) }
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',moreLists); else moreLists();
addEventListener('hashchange',()=>setTimeout(moreLists,50));   /* pages that build their list when first opened (Blind tactics) */

window.TV={moreLists,esc,chips,onChip,rate,row,dots,head,session,fitBoard,pick,onPick,bar,pin,pinned,pads,safeTop,repad:padLater};
})();
