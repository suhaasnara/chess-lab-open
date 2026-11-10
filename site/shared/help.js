/* Shared (Chess Lab and Chess Lab Open). Home: chess-lab-open/site/shared/ (MIT); the private kit pulls a pinned copy.
   A small "?" beside a stat or eval that explains it in one sentence: hover shows it (title), a tap or click opens it
   under the "?" (phones have no hover), a second tap, Escape or a tap elsewhere closes it.
   Help.q(text) -> HTML for the "?" (text is plain; it is escaped here).
   Help.n(n, 'puzzle'[, 'puzzles']) -> '1 puzzle' / '2 puzzles' (every count on the page says it the same way). */
window.Help=(()=>{
  const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const q=text=>`<button type="button" class="qhelp" aria-label="What is this? ${esc(text)}" title="${esc(text)}" data-help="${esc(text)}">?</button>`;
  const closeAll=()=>document.querySelectorAll('.qpop').forEach(p=>p.remove());
  document.addEventListener('click',e=>{
    const b=e.target.closest&&e.target.closest('.qhelp');
    const open=b&&b.nextElementSibling&&b.nextElementSibling.classList.contains('qpop');
    closeAll(); if(!b||open) return;
    e.preventDefault(); e.stopPropagation();
    const p=document.createElement('span'); p.className='qpop'; p.setAttribute('role','note'); p.textContent=b.dataset.help; b.after(p);
  },true);
  document.addEventListener('keydown',e=>{ if(e.key==='Escape') closeAll() });
  const n=(k,one,many)=>`${k} ${k===1?one:(many||one+'s')}`;
  return {q,closeAll,n};
})();
