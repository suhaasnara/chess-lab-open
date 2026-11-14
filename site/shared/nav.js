/* Shared (Chess Lab and Chess Lab Open). Home: chess-lab-open/site/shared/ (MIT); the private kit pulls a pinned copy.
   The header's tab row: a few main tabs, an Extra drop-down for the rest, Settings at the right (inside Extra on phones).
     Nav.mount(navEl, {main:[[view,label,phoneDescription?],...], extra:[[view,label,description],...]})
   A main tab given a description moves into the Extra menu on phones (so the row never overlaps).
   An Extra item may name a group as its 4th entry ([view,label,description,group]): the menu then shows the groups under
   small headings, one column per group on wide screens and two columns on narrower ones (descriptions on wide screens, labels only on phones so the whole menu fits a screen),
   and it scrolls inside itself when the window is short (13 Nov 2026: eleven items ran off a laptop screen).
     Nav.set(view)   marks the current tab (an Extra item marks the Extra button)
     Nav.snap()      scrolls to the page's main view (see below)
   Tabs are plain #view links, so each site's router keeps listening to hashchange. The menu is position:fixed under its
   button because the tab row scrolls sideways on phones. Styles: shared/shared.css ("Header tabs"). */
'use strict';
window.Nav=(function(){
  const GEAR='<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.7" d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z"/><path fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" d="M19.4 13.5a7.6 7.6 0 0 0 0-3l2-1.6-2-3.4-2.4 1a7.5 7.5 0 0 0-2.6-1.5L14 2.5h-4l-.4 2.5A7.5 7.5 0 0 0 7 6.5l-2.4-1-2 3.4 2 1.6a7.6 7.6 0 0 0 0 3l-2 1.6 2 3.4 2.4-1a7.5 7.5 0 0 0 2.6 1.5l.4 2.5h4l.4-2.5a7.5 7.5 0 0 0 2.6-1.5l2.4 1 2-3.4z"/></svg>';
  const CARET='<svg viewBox="0 0 10 6" width="10" height="6" aria-hidden="true"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  let nav=null, menu=null, btn=null, extra=[], phx=[];
  function close(){ if(!menu||menu.hidden) return; menu.hidden=true; btn.setAttribute('aria-expanded','false') }
  function open(){
    const r=btn.getBoundingClientRect(); menu.hidden=false; btn.setAttribute('aria-expanded','true');
    menu.style.maxHeight=Math.max(160,Math.floor(innerHeight-r.bottom-14))+'px'; menu.scrollTop=0;   /* never taller than the window: it scrolls inside */
    const w=menu.offsetWidth;
    menu.style.top=Math.round(r.bottom+4)+'px'; menu.style.left=Math.round(Math.max(16,Math.min(r.left,innerWidth-w-16)))+'px';
    const a=menu.querySelector('a[aria-current="page"]')||menu.querySelector('a'); if(a) a.focus({preventScroll:true});
  }
  function mount(el,cfg){
    nav=el; extra=(cfg.extra||[]).map(x=>x[0]);
    nav.classList.add('tabs'); if(!nav.getAttribute('aria-label')) nav.setAttribute('aria-label','Sections');
    nav.innerHTML='<div class="inner">'+(cfg.main||[]).map(([v,l,d])=>`<a href="#${v}" data-view="${v}"${d?' class="ph-x"':''}>${esc(l)}</a>`).join('')
      +(extra.length?`<button type="button" class="xtab" id="x-btn" aria-haspopup="true" aria-expanded="false" aria-controls="x-menu">Extra${CARET}</button>`:'')
      +'<span class="tabgap"></span>'
      +`<a href="#settings" data-view="settings" class="settab" title="Settings" aria-label="Settings">${GEAR}<span class="setlbl">Settings</span></a></div>`;
    menu=document.getElementById('x-menu');
    if(!menu){ menu=document.createElement('div'); menu.id='x-menu'; document.body.appendChild(menu) }
    menu.className='xmenu'; menu.setAttribute('role','menu'); menu.hidden=true;
    phx=(cfg.main||[]).filter(x=>x[2]).map(x=>x[0]);
    const item=([v,l,d],cls)=>`<a href="#${v}" data-view="${v}" role="menuitem"${cls?` class="${cls}"`:''}><b>${esc(l)}</b>${d?`<span>${esc(d)}</span>`:''}</a>`;
    const phItems=(cfg.main||[]).filter(x=>x[2]).map(x=>item(x,'ph-x')).join(''), ex=cfg.extra||[], grouped=ex.some(x=>x[3]);
    let body;
    if(grouped){ const order=[], by={}; for(const x of ex){ const g=x[3]||'More'; if(!by[g]){ by[g]=[]; order.push(g) } by[g].push(x) }
      body=(phItems?`<div class="xgrp xph">${phItems}</div>`:'')+order.map(g=>`<div class="xgrp" role="group" aria-label="${esc(g)}"><div class="xgh" aria-hidden="true">${esc(g)}</div>${by[g].map(x=>item(x)).join('')}</div>`).join('') }
    else body=phItems+ex.map(x=>item(x)).join('');
    menu.classList.toggle('grouped',grouped); if(grouped) menu.style.setProperty('--xg',String(new Set(ex.map(x=>x[3]||'More')).size));
    menu.innerHTML=body+'<a href="#settings" data-view="settings" role="menuitem" class="xset"><b>Settings</b><span>Board, pieces, moves and training</span></a>';
    btn=document.getElementById('x-btn');
    if(btn) btn.addEventListener('click',e=>{ e.stopPropagation(); menu.hidden?open():close() });
    document.addEventListener('click',e=>{ if(!e.target.closest('#x-menu')) close() });
    document.addEventListener('keydown',e=>{ if(e.key==='Escape'&&menu&&!menu.hidden){ close(); if(btn) btn.focus() } });
    addEventListener('resize',close); addEventListener('scroll',close,{passive:true});
    menu.addEventListener('click',e=>{ if(e.target.closest('a')) close() });
    /* the tab you are on, tapped again: back to its main view */
    const again=e=>{ const a=e.target.closest('a[data-view]'); if(!a||a.getAttribute('aria-current')!=='page'||e.ctrlKey||e.metaKey||e.shiftKey) return; e.preventDefault(); close(); snap() };
    nav.addEventListener('click',again); menu.addEventListener('click',again,true);
    const row=nav.querySelector('.inner'); row.addEventListener('scroll',edges,{passive:true}); addEventListener('resize',edges); edges();
    mvWatch();
  }
  /* a row that scrolls sideways (narrow phones) fades at the edge where more tabs are hidden (13 Nov 2026) */
  function edges(){ const row=nav&&nav.querySelector('.inner'); if(!row) return; const m=row.scrollWidth-row.clientWidth;
    row.classList.toggle('fl',m>1&&row.scrollLeft>1); row.classList.toggle('fr',m>1&&row.scrollLeft<m-1) }
  /* ---------- Main view (13 Nov 2026) ----------
     Each page's "main view" is its board with what sits beside and under it, aligned just under the tab bar (or the top of
     the page when all of it fits from there). Nav.snap() scrolls there. Ways in: tap the tab you are on again, press M, or
     the small "↑ Board" button that shows when the board has scrolled mostly out of sight. A page can mark its own main
     block with data-main; otherwise it is the first board showing (its .boardwrap / .boardbox). Pages without a board:
     the top of the page. */
  const vis=e=>!!e&&e.offsetParent!==null&&e.getBoundingClientRect().width>100;
  function mainEl(){ const m=[...document.querySelectorAll('[data-main]')].find(vis); if(m) return m;
    const b=[...document.querySelectorAll('.board')].find(e=>vis(e)&&!e.closest('.keysmodal,.rd,.reader,[role="dialog"]')); if(!b) return null;
    return b.closest('.boardwrap')||b.closest('.boardbox')||b }
  function navH(){ if(!nav) return 0; const r=nav.getBoundingClientRect(), cs=getComputedStyle(nav); return /sticky|fixed/.test(cs.position)?r.height:0 }
  function natTop(el){ const sticky=/sticky/.test(getComputedStyle(el).position), old=el.style.position; if(sticky) el.style.position='relative';
    const y=el.getBoundingClientRect().top+scrollY; if(sticky) el.style.position=old; return y }
  function snap(){ const el=mainEl(); if(!el){ scrollTo({top:0,behavior:'smooth'}); return true }
    const top=natTop(el), h=el.getBoundingClientRect().height;
    const y=top+h<=innerHeight-10?0:Math.max(0,Math.round(top-navH()-10));
    scrollTo({top:y,behavior:Math.abs(y-scrollY)>1600?'auto':'smooth'}); return true }
  let mvBtn=null, mvRaf=0;
  function mvUpdate(){ mvRaf=0; if(!mvBtn) return; const el=mainEl(); let show=false, up=true;
    if(el&&!(el.closest&&el.closest('[hidden]'))){ const r=el.getBoundingClientRect(), top=navH(), seen=Math.max(0,Math.min(r.bottom,innerHeight)-Math.max(r.top,top));
      show=r.height>0&&seen<Math.min(r.height,innerHeight-top)*0.35; up=r.bottom<top+r.height/2 }
    mvBtn.hidden=!show; if(show){ mvBtn.textContent=(up?'↑':'↓')+' Board';
      /* 13 Nov: ↑ sits under the tab bar, ↓ at the bottom of the screen (under the tab bar it covered a card's top-right button,
         e.g. Open's welcome card's Close) */
      if(up){ mvBtn.style.top=Math.round((nav?Math.max(0,nav.getBoundingClientRect().bottom):0)+8)+'px'; mvBtn.style.bottom='' }
      else { let bb=0;   /* 14 Nov: above the bottom bar where a page has one (trainview.css .bbar) */
        for(const e of document.querySelectorAll('.bbar')){ if(getComputedStyle(e).position!=='fixed') continue; const r=e.getBoundingClientRect(); if(r.height) bb=Math.max(bb,innerHeight-r.top) }
        mvBtn.style.top='auto'; mvBtn.style.bottom=bb?Math.round(bb+10)+'px':'calc(14px + env(safe-area-inset-bottom,0px))' } } }
  function mvWatch(){ if(mvBtn) return; mvBtn=document.createElement('button'); mvBtn.type='button'; mvBtn.id='mv-btn'; mvBtn.className='mvbtn'; mvBtn.hidden=true;
    mvBtn.title='Back to the main view (M)'; mvBtn.setAttribute('aria-label','Back to the board (M)'); mvBtn.addEventListener('click',()=>snap()); document.body.appendChild(mvBtn);
    const q=()=>{ if(!mvRaf) mvRaf=requestAnimationFrame(mvUpdate) }; addEventListener('scroll',q,{passive:true}); addEventListener('resize',q); addEventListener('hashchange',()=>setTimeout(q,60)) }
  function set(view){
    if(!nav) return;
    nav.querySelectorAll('.inner > a').forEach(a=>a.setAttribute('aria-current',a.dataset.view===view?'page':'false'));
    menu.querySelectorAll('a').forEach(a=>a.setAttribute('aria-current',a.dataset.view===view?'page':'false'));
    if(btn){ btn.classList.toggle('cur',extra.includes(view)); btn.classList.toggle('cur-ph',phx.includes(view)) }
    close();
    /* narrow screens: the row scrolls sideways; keep the current tab in view without moving the page */
    const row=nav.querySelector('.inner'), cur=[...nav.querySelectorAll('.inner > a[aria-current="page"]')].find(a=>a.offsetParent)||(btn&&btn.classList.contains('cur')?btn:null);
    if(row&&cur&&row.scrollWidth>row.clientWidth){ const l=cur.offsetLeft-row.offsetLeft; if(l<row.scrollLeft||l+cur.offsetWidth>row.scrollLeft+row.clientWidth) row.scrollLeft=Math.max(0,l-24) }
    edges();
  }
  return {mount,set,close,snap,mainEl};
})();
