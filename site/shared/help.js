/* Shared (Chess Lab and Think Ahead). Home: chess-lab-open/site/shared/ (MIT); the private kit pulls a pinned copy.
   A small "?" beside a stat or eval that explains it in one sentence: hover shows it (title), a tap or click opens it
   under the "?" (phones have no hover), a second tap, Escape or a tap elsewhere closes it.
   Help.q(text[, more]) -> HTML for the "?" (text is plain; it is escaped here). more = a topic on the site's Help page
     (#help?<more>): the note then ends with a "More in Help" link, so the note itself can stay one or two sentences.
   Help.n(n, 'puzzle'[, 'puzzles']) -> '1 puzzle' / '2 puzzles' (every count on the page says it the same way). */
window.Help=(()=>{
  const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const q=(text,more)=>`<button type="button" class="qhelp" aria-label="What is this? ${esc(text)}" title="${esc(text)}" data-help="${esc(text)}"${more?` data-more="${esc(more)}"`:''}>?</button>`;
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
    if(b.dataset.more){ const a=document.createElement('a'); a.href='#help?'+b.dataset.more; a.className='qmore'; a.textContent='More in Help ›'; p.append(' ',a); a.addEventListener('click',()=>setTimeout(closeAll,0)) }
    document.body.appendChild(p); place(b,p); openFor=b;
  },true);
  addEventListener('scroll',()=>{ if(openFor) closeAll() },{passive:true,capture:true});
  addEventListener('resize',()=>{ if(openFor) closeAll() });
  document.addEventListener('keydown',e=>{ if(e.key==='Escape') closeAll() });
  /* 19 Nov 2026: the "?" never sits alone at the start of a line. Each one is wrapped, with the word before it, in a span
     that does not break (a word joiner alone is not enough in Safari: it still breaks before a button). */
  const glue=b=>{ if(b.dataset.glued) return; b.dataset.glued='1'; const t=b.previousSibling;
    if(!t||t.nodeType!==3) return; const m=t.textContent.match(/\S+\s*$/); if(!m) return;
    const tail=t.splitText(t.textContent.length-m[0].length), w=document.createElement('span'); w.className='qglue';
    b.parentNode.insertBefore(w,tail); w.appendChild(tail); w.appendChild(b) };
  const glueIn=root=>{ if(root.nodeType!==1) return; if(root.classList.contains('qhelp')) glue(root); root.querySelectorAll('.qhelp').forEach(glue) };
  const start=()=>{ glueIn(document.body); new MutationObserver(ms=>{ for(const m of ms) for(const x of m.addedNodes) glueIn(x) }).observe(document.body,{childList:true,subtree:true}) };
  if(document.body) start(); else document.addEventListener('DOMContentLoaded',start);
  const n=(k,one,many)=>`${k} ${k===1?one:(many||one+'s')}`;
  return {q,closeAll,n};
})();
