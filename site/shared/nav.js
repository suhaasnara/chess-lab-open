/* Shared (Chess Lab and Chess Lab Open). Home: chess-lab-open/site/shared/ (MIT); the private kit pulls a pinned copy.
   The header's tab row: a few main tabs, an Extra drop-down for the rest, Settings at the right (inside Extra on phones).
     Nav.mount(navEl, {main:[[view,label,phoneDescription?],...], extra:[[view,label,description],...]})
   A main tab given a description moves into the Extra menu on phones (so the row never overlaps).
     Nav.set(view)   marks the current tab (an Extra item marks the Extra button)
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
    menu.innerHTML=(cfg.main||[]).filter(x=>x[2]).map(([v,l,d])=>`<a href="#${v}" data-view="${v}" role="menuitem" class="ph-x"><b>${esc(l)}</b><span>${esc(d)}</span></a>`).join('')+(cfg.extra||[]).map(([v,l,d])=>`<a href="#${v}" data-view="${v}" role="menuitem"><b>${esc(l)}</b>${d?`<span>${esc(d)}</span>`:''}</a>`).join('')
      +'<a href="#settings" data-view="settings" role="menuitem" class="xset"><b>Settings</b><span>Board, pieces, moves and training</span></a>';
    btn=document.getElementById('x-btn');
    if(btn) btn.addEventListener('click',e=>{ e.stopPropagation(); menu.hidden?open():close() });
    document.addEventListener('click',e=>{ if(!e.target.closest('#x-menu')) close() });
    document.addEventListener('keydown',e=>{ if(e.key==='Escape'&&menu&&!menu.hidden){ close(); if(btn) btn.focus() } });
    addEventListener('resize',close); addEventListener('scroll',close,{passive:true});
    menu.addEventListener('click',e=>{ if(e.target.closest('a')) close() });
  }
  function set(view){
    if(!nav) return;
    nav.querySelectorAll('.inner > a').forEach(a=>a.setAttribute('aria-current',a.dataset.view===view?'page':'false'));
    menu.querySelectorAll('a').forEach(a=>a.setAttribute('aria-current',a.dataset.view===view?'page':'false'));
    if(btn){ btn.classList.toggle('cur',extra.includes(view)); btn.classList.toggle('cur-ph',phx.includes(view)) }
    close();
    /* narrow screens: the row scrolls sideways; keep the current tab in view without moving the page */
    const row=nav.querySelector('.inner'), cur=[...nav.querySelectorAll('.inner > a[aria-current="page"]')].find(a=>a.offsetParent)||(btn&&btn.classList.contains('cur')?btn:null);
    if(row&&cur&&row.scrollWidth>row.clientWidth){ const l=cur.offsetLeft-row.offsetLeft; if(l<row.scrollLeft||l+cur.offsetWidth>row.scrollLeft+row.clientWidth) row.scrollLeft=Math.max(0,l-24) }
  }
  return {mount,set,close};
})();
