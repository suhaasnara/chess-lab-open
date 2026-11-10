/* Shared (Chess Lab and Chess Lab Open). Home: chess-lab-open/site/shared/ (MIT); the private kit pulls a pinned copy.
   The mobile reader: step through annotated moves on a phone (course notes, game notes, solutions). Built once; each
   place passes its moves. Phones only (portrait under 600 px wide, landscape under 500 px tall): every iPad, the
   iPad mini included, keeps the desktop layout. Desktop keyboards still work (← →).

     Reader.open({title, fen, orient, lines, at, chapter, nextChapter, onClose})
       fen     the start position; orient 'w' | 'b'
       lines   the main line: [{san, note, marks, shapes, vars:[[move...], ...]}]  (vars = side lines that replace this move)
       at      start at this many moves into the main line (0 = before the first move)
       chapter label, nextChapter() -> called from the "Chapter complete" card (omit when there is none)
     Reader.textLine(fen, text) -> moves from a side line written as text ('3...g6 4.Bxc6 {a note} dxc6'), played from fen
       (move numbers and marks dropped, {notes} kept on the move before; stops at the first move that isn't legal)
     Reader.isPhone()  the phone breakpoint; Reader.button(onClick) -> a "Read" button that shows on phones only
     Reader.close()

   Layout: board pinned at the top, notes scroll underneath and never push it away; the current move snaps to the top
   of the notes with its note under it; a fixed bottom bar above the home indicator (safe-area insets): Previous far
   left, Next far right, Flip and Main line between, all 44 px or more. A drag handle between board and notes keeps the
   board between 35% and 65% of the screen height, remembered on this device. Landscape: board left, notes right.
   Tap any move to jump. Side lines are collapsed; tapping one plays it, with "Back to main line".
   Next at the end of a line goes to the next line (side lines in order, after the main line). At the end of the last
   one, a small "Chapter complete → Next chapter" card (no automatic jump). Previous is disabled at a line's first move.
   No swipe gestures (buttons only). Arrows: the move's own [%cal]/[%csl] through Shapes. Faint arrows for moves named
   in the note text were tried and dropped: notes name moves from other positions (side lines, earlier moves), so the
   arrows would often point at the wrong squares. The screen stays on (Wake Lock) where the page allows it. */
window.Reader=(()=>{
  const MQ='(orientation:portrait) and (max-width:599.98px), (orientation:landscape) and (max-height:499.98px)';
  const isPhone=()=>!!(window.matchMedia&&matchMedia(MQ).matches);
  const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const KEY='reader-board';
  let R=null, wake=null;
  const getSize=()=>{ try{ const v=+localStorage.getItem(KEY); return v>=35&&v<=65?v:50 }catch(e){ return 50 } };
  const setSize=v=>{ try{ localStorage.setItem(KEY,String(v)) }catch(e){} };
  /* lines in reading order: the main line, then each side line (depth-first), each starting from its branch */
  function flatten(main){
    const out=[{moves:main,from:null,base:[]}];
    const walk=(moves,base)=>{ moves.forEach((m,i)=>{ (m.vars||[]).forEach(v=>{ const b=base.concat(moves.slice(0,i)); out.push({moves:v,from:{line:moves,i},base:b}); walk(v,b) }) }) };
    walk(main,[]); return out;
  }
  function gameAt(L,k){ const g=new Chess(R.fen); let last=null; for(const m of L.base.concat(L.moves.slice(0,k))){ const r=g.move(m.san,{sloppy:true}); if(!r) break; last={from:r.from,to:r.to} } return {g,last} }
  function render(){
    const L=R.lines[R.li], k=R.at, {g,last}=gameAt(L,k);
    Board.draw(R.board,g,{orient:R.orient,last,role:'gridcell'}); if(window.BoardFX) BoardFX.after(R.board,last,{silent:true});
    const cur=k>0?L.moves[k-1]:null; if(window.Shapes) Shapes.auto(R.board,cur&&cur.shapes||'');
    /* notes: every move of this line, the current one first in view */
    const ply0=(()=>{ const t=R.fen.split(' '); return ((+t[5]||1)-1)*2+(t[1]==='b'?1:0)+L.base.length })();
    const label=(i)=>{ const p=ply0+i; return p%2===0?`${p/2+1}.`:(i===0?`${Math.floor(p/2)+1}…`:'') };
    R.notes.innerHTML=(R.li?`<div class="rd-varhead">Side line after ${esc(L.base.map(m=>m.san).slice(-2).join(' ')||'the start')}</div>`:'')+
      `<button type="button" class="rd-row${k===0?' cur':''}" data-k="0"><span class="rd-mv">Start</span></button>`+
      L.moves.map((m,i)=>`<div class="rd-item"><button type="button" class="rd-row${i+1===k?' cur':''}" data-k="${i+1}"><span class="rd-mv">${esc(label(i))}${esc(m.san)}</span>${m.marks?`<span class="rd-mk">${esc(m.marks)}</span>`:''}</button>`+
        (i+1===k&&m.note?`<div class="rd-note">${esc(m.note)}</div>`:'')+
        ((m.vars||[]).length?`<details class="rd-vars"><summary>${m.vars.length} side line${m.vars.length>1?'s':''}</summary>${m.vars.map((v,j)=>`<button type="button" class="rd-var" data-v="${i}:${j}">${esc(label(i))}${esc(v.map(x=>x.san).slice(0,4).join(' '))}${v.length>4?' …':''}</button>`).join('')}</details>`:'')+`</div>`).join('')+
      (R.done?`<div class="card rd-done"><b>Chapter complete</b>${R.nextChapter?'<div class="btns"><button type="button" class="btn sm primary" id="rd-nextch">Next chapter →</button></div>':'<p class="note">That was the last line.</p>'}</div>`:'');
    const c=R.notes.querySelector('.rd-row.cur'); if(c){ const top=c.parentElement.offsetTop-R.notes.offsetTop; R.notes.scrollTop=k===0?0:top }
    R.prev.disabled=k===0; R.main.hidden=R.li===0;
    R.pos.textContent=k?`${k} / ${L.moves.length}`:`0 / ${L.moves.length}`;
    const nc=document.getElementById('rd-nextch'); if(nc) nc.onclick=()=>{ const f=R.nextChapter; close(); f() };
  }
  function next(){ if(!R) return; const L=R.lines[R.li];
    if(R.at<L.moves.length){ R.at++; R.done=false; return render() }
    if(R.li+1<R.lines.length){ R.li++; R.at=1; return render() }
    R.done=true; render() }
  function prev(){ if(!R||R.at===0) return; R.at--; R.done=false; render() }
  function open(o){
    close();
    const el=document.createElement('div'); el.className='reader'; el.setAttribute('role','dialog'); el.setAttribute('aria-label',o.title||'Reader');
    el.style.setProperty('--rb',getSize()+'');
    el.innerHTML=`<div class="rd-top"><span class="rd-title">${esc(o.title||'')}${o.chapter?` <span class="note">· ${esc(o.chapter)}</span>`:''}</span><button type="button" class="btn sm rd-close" aria-label="Close the reader">✕</button></div>
      <div class="rd-boardwrap"><div class="board rd-board" aria-label="Chess board"></div></div>
      <div class="rd-handle" role="separator" aria-orientation="horizontal" aria-label="Drag to resize the board" tabindex="0"><span></span></div>
      <div class="rd-notes" aria-live="polite"></div>
      <div class="rd-bar"><button type="button" class="btn rd-prev" aria-label="Previous move">‹ Prev</button>
        <button type="button" class="btn sm rd-flip">Flip</button><button type="button" class="btn sm rd-main" hidden>Main line</button><span class="rd-pos note"></span>
        <button type="button" class="btn primary rd-next" aria-label="Next move">Next ›</button></div>`;
    document.body.appendChild(el); document.documentElement.classList.add('reader-open');
    const lines=flatten(o.lines||[]);
    R={el,fen:o.fen||'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',orient:o.orient||'w',lines,li:0,at:Math.max(0,Math.min(o.at||0,lines[0].moves.length)),done:false,
      nextChapter:o.nextChapter||null,onClose:o.onClose||null,board:el.querySelector('.rd-board'),notes:el.querySelector('.rd-notes'),
      prev:el.querySelector('.rd-prev'),main:el.querySelector('.rd-main'),pos:el.querySelector('.rd-pos')};
    el.querySelector('.rd-next').onclick=next; R.prev.onclick=prev;
    el.querySelector('.rd-flip').onclick=()=>{ R.orient=R.orient==='w'?'b':'w'; render() };
    R.main.onclick=()=>{ const L=R.lines[R.li]; R.at=L.base.length; R.li=0; R.done=false; render() };
    el.querySelector('.rd-close').onclick=close;
    R.notes.addEventListener('click',e=>{ const b=e.target.closest('[data-k]'); if(b){ R.at=+b.dataset.k; R.done=false; return render() }
      const v=e.target.closest('[data-v]'); if(v){ const [i,j]=v.dataset.v.split(':').map(Number), L=R.lines[R.li], line=L.moves[i].vars[j];
        const n=R.lines.findIndex(x=>x.moves===line); if(n>=0){ R.li=n; R.at=1; R.done=false; render() } } });
    /* drag handle: board between 35% and 65% of the screen height (or width in landscape), remembered on this device */
    const h=el.querySelector('.rd-handle'); let drag=null;
    h.addEventListener('pointerdown',e=>{ drag={y:e.clientY,x:e.clientX,v:+el.style.getPropertyValue('--rb')||getSize()}; try{ h.setPointerCapture(e.pointerId) }catch(_){} e.preventDefault() });
    h.addEventListener('pointermove',e=>{ if(!drag) return; const land=innerWidth>innerHeight; const d=land?(e.clientX-drag.x)/innerWidth*100:(e.clientY-drag.y)/innerHeight*100;
      const v=Math.round(Math.max(35,Math.min(65,drag.v+d))); el.style.setProperty('--rb',v+''); });
    h.addEventListener('pointerup',()=>{ if(!drag) return; drag=null; setSize(+el.style.getPropertyValue('--rb')) });
    h.addEventListener('keydown',e=>{ const d=e.key==='ArrowUp'||e.key==='ArrowLeft'?-5:e.key==='ArrowDown'||e.key==='ArrowRight'?5:0; if(!d) return; e.preventDefault(); e.stopPropagation();
      const v=Math.max(35,Math.min(65,(+el.style.getPropertyValue('--rb')||50)+d)); el.style.setProperty('--rb',v+''); setSize(v) });
    try{ if(navigator.wakeLock) navigator.wakeLock.request('screen').then(l=>{ wake=l }).catch(()=>{}) }catch(e){}
    render(); el.querySelector('.rd-next').focus({preventScroll:true});
    return R;
  }
  function close(){ if(!R) return; const f=R.onClose; R.el.remove(); R=null; document.documentElement.classList.remove('reader-open'); try{ wake&&wake.release() }catch(e){} wake=null; f&&f() }
  addEventListener('keydown',e=>{ if(!R||e.ctrlKey||e.metaKey||e.altKey) return; const t=e.target; if(t&&/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName||'')) return;
    if(e.key==='ArrowRight'){ e.preventDefault(); e.stopImmediatePropagation(); next() } else if(e.key==='ArrowLeft'){ e.preventDefault(); e.stopImmediatePropagation(); prev() }
    else if(e.key==='Escape'){ e.preventDefault(); e.stopImmediatePropagation(); close() } },true);
  function textLine(fen,text){
    const g=new Chess(fen), out=[]; const toks=String(text||'').match(/\{[^}]*\}|[^\s{}()]+/g)||[];
    for(const t of toks){ if(t[0]==='{'){ const c=t.slice(1,-1).trim(); if(c&&out.length) out[out.length-1].note=(out[out.length-1].note?out[out.length-1].note+' ':'')+c; continue }
      const mk=(t.match(/[!?]+$/)||[''])[0], san=t.replace(/^\d+\.+/,'').replace(/[!?]+$/,'').replace(/^0-0-0/,'O-O-O').replace(/^0-0/,'O-O');
      if(!san||/^\d+\.*$/.test(san)||/^[=∞⩲⩱±∓+−\-]+$/.test(san)) continue;
      const m=g.move(san,{sloppy:true}); if(!m) break; out.push({san:m.san,marks:mk}) }
    return out }
  function button(onClick,label='Read'){ const b=document.createElement('button'); b.type='button'; b.className='btn sm rd-open'; b.textContent=label+' ▸'; b.title='Step through the moves and notes on a phone-sized reader'; b.onclick=onClick; return b }
  return {open,close,next,prev,isPhone,button,textLine,get state(){ return R },MQ};
})();
