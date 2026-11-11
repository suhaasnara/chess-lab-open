/* Shared (Chess Lab and Chess Lab Open). Home: chess-lab-open/site/shared/ (MIT); the private kit pulls a pinned copy.
   One keymap for the whole site. Each tab registers what the standard keys do there; one listener dispatches.

     ← →   step through the moves (every notation list)      Home / End   first / last position
     ↓ ↑   where side lines branch: pick which line → follows (VarLine.nav)
     B     take back                                         R            reset / retry
     H     hint (first press: the piece, second: the move)    F            flip the board
     N     next (line, puzzle, drill, game)                   E            end the line here
     P     peek (blindfold)                                   ?            this list of keys

   Keys.on(view, {key: [label, fn]}, note?)   key = 'ArrowLeft', 'ArrowRight', 'Home', 'End', or a lower-case letter.
     fn(e) returning false means "not now" (the key does nothing and the browser keeps it).
   Keys.view = () => the current view's name (default: document.body.dataset.view).
   Keys never fire while typing in a field, and never with Ctrl / Cmd / Alt (browser shortcuts stay the browser's).
   An arrow key a page uses never scrolls the page; after a drop-down changes, focus leaves it, so the arrows are the
   board's again (a focused drop-down would take them). */
window.Keys=(()=>{
  const MAPS={}, NOTES={};
  const ORDER=['ArrowLeft','ArrowRight','ArrowDown','ArrowUp','Home','End','b','r','h','f','n','e','p'];
  const NAME={ArrowLeft:'←',ArrowRight:'→',ArrowUp:'↑',ArrowDown:'↓',Home:'Home',End:'End'};
  const typing=e=>{ const t=e.target; return !!t&&t.nodeType===1&&(/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName||'')||!!t.isContentEditable) };
  const api={view:()=>document.body&&document.body.dataset.view,
    on(view,map,note){ MAPS[view]=Object.assign(MAPS[view]||{},map); if(note) NOTES[view]=note },
    off(view){ delete MAPS[view] },
    map:view=>MAPS[view]||{},
    overlay, close};
  function close(){ const o=document.getElementById('keys-overlay'); if(o) o.remove() }
  function overlay(){
    if(document.getElementById('keys-overlay')){ close(); return }
    const v=api.view(), m=MAPS[v]||{};
    const rows=[...ORDER.filter(k=>m[k]),...Object.keys(m).filter(k=>!ORDER.includes(k))].map(k=>`<tr><td><kbd>${NAME[k]||k.toUpperCase()}</kbd></td><td>${String(m[k][0]).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}</td></tr>`).join('');
    const d=document.createElement('div'); d.id='keys-overlay'; d.className='keysmodal'; d.setAttribute('role','dialog'); d.setAttribute('aria-label','Keyboard shortcuts');
    d.innerHTML=`<div class="card"><h2>Keys on this page</h2>${rows?`<table class="keystable">${rows}</table>`:'<p class="note">No board keys on this page.</p>'}${NOTES[v]?`<p class="note">${NOTES[v]}</p>`:''}<p class="note"><kbd>?</kbd> shows or hides this list. Keys don't work while you type in a box.</p><div class="btns"><button type="button" class="btn sm" id="keys-close">Close</button></div></div>`;
    d.addEventListener('click',e=>{ if(e.target===d||e.target.id==='keys-close') close() });
    document.body.appendChild(d); d.querySelector('#keys-close').focus();
  }
  addEventListener('keydown',e=>{   /* on window: every key press reaches it */
    if(e.defaultPrevented||e.ctrlKey||e.metaKey||e.altKey||e.isComposing||typing(e)) return;
    if(e.key==='Escape'&&document.getElementById('keys-overlay')){ close(); return }
    if(e.key==='?'){ e.preventDefault(); overlay(); return }
    if(document.getElementById('keys-overlay')) return;
    const k=e.key&&e.key.length===1?e.key.toLowerCase():e.key;
    const a=(MAPS[api.view()]||{})[k]; if(!a) return;
    if(a[1](e)!==false) e.preventDefault();
  });
  addEventListener('change',e=>{ const t=e.target;   /* a drop-down keeps focus after a pick and would take the arrow keys */
    if(t&&t.tagName==='SELECT'&&!t.multiple){ const m=MAPS[api.view()]||{}; if(m.ArrowLeft||m.ArrowRight||m.ArrowUp||m.ArrowDown) setTimeout(()=>{ if(document.activeElement===t) t.blur() },0) } },true);
  return api;
})();
