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
window.TV={esc,chips,onChip,rate,row,dots,head,session,fitBoard};
})();
