/* Shared (Chess Lab and Chess Lab Open). Home: chess-lab-open/site/shared/ (MIT); the private kit pulls a pinned copy.
   A small "?" beside a stat or eval that explains it in one sentence: hover shows it (title), a tap or click opens it
   under the "?" (phones have no hover), a second tap, Escape or a tap elsewhere closes it.
   Help.q(text) -> HTML for the "?" (text is plain; it is escaped here).
   Help.n(n, 'puzzle'[, 'puzzles']) -> '1 puzzle' / '2 puzzles' (every count on the page says it the same way). */
window.Help=(()=>{
  const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const q=text=>`<button type="button" class="qhelp" aria-label="What is this? ${esc(text)}" title="${esc(text)}" data-help="${esc(text)}">?</button>`;
  /* 12 Nov 2026: the note floats over the page (fixed, beside the "?"), so opening one never moves the layout: in a
     table header it used to grow the header row to fit the text. */
  let openFor=null;
  const closeAll=()=>{ document.querySelectorAll('.qpop').forEach(p=>p.remove()); openFor=null };
  const place=(b,p)=>{ const r=b.getBoundingClientRect(), w=Math.min(320,innerWidth-16);
    p.style.maxWidth=w+'px'; const pw=Math.min(w,p.offsetWidth||w), ph=p.offsetHeight;
    p.style.left=Math.max(8,Math.min(r.left+r.width/2-pw/2,innerWidth-pw-8))+'px';
    p.style.top=(r.bottom+6+ph>innerHeight-8&&r.top-6-ph>8?r.top-6-ph:r.bottom+6)+'px' };
  document.addEventListener('click',e=>{
    const b=e.target.closest&&e.target.closest('.qhelp');
    if(e.target.closest&&e.target.closest('.qpop')) return;   // a click inside the note keeps it open (select text)
    const again=b&&b===openFor;
    closeAll(); if(!b||again) return;
    e.preventDefault(); e.stopPropagation();
    const p=document.createElement('span'); p.className='qpop'; p.setAttribute('role','note'); p.textContent=b.dataset.help;
    document.body.appendChild(p); place(b,p); openFor=b;
  },true);
  addEventListener('scroll',()=>{ if(openFor) closeAll() },{passive:true,capture:true});
  addEventListener('resize',()=>{ if(openFor) closeAll() });
  document.addEventListener('keydown',e=>{ if(e.key==='Escape') closeAll() });
  const n=(k,one,many)=>`${k} ${k===1?one:(many||one+'s')}`;
  return {q,closeAll,n};
})();
