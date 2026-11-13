/* Shared (Chess Lab and Chess Lab Open). Home: chess-lab-open/site/shared/ (MIT); the private kit pulls a pinned copy.
   The reader: step through annotated moves on a phone or an iPad held upright (course notes, game notes, solutions),
   Chessable's Read mode. Built once; each place passes its moves. Shown on phones (portrait under 600 px wide,
   landscape under 500 px tall) and iPads in portrait (under 1100 px wide); landscape iPads and desktops keep their own
   layout. Desktop keyboards still work (← → ↓ ↑).

     Reader.open({title, fen, orient, lines, at, chapter, lead, after, nextChapter, onClose})
       fen     the start position; orient 'w' | 'b'
       lines   the main line: [{san, note, marks, shapes, vars, vtext}]
                 vars  = side lines that replace this move, as moves [[{san, note, marks, vars}, ...], ...]
                 vtext = side lines that replace this move, as the book wrote them ('28...gxf5 29.Nxf5 {note} Kf8 …')
       lead    {note, vtext} before the first move (side lines from the start position); after = a closing note
       at      start this many moves into the main line (0 = before the first move)
       chapter label, nextChapter() -> called from the "Chapter complete" card (omit when there is none)
     Reader.textLine(fen, text) -> moves from a side line written as text (kept for callers; stops at an illegal move)
     Reader.isPhone()  where the reader is offered; Reader.button(onClick) -> a "Read" button shown only there
     Reader.close()

   Layout (Nov 2026, v95): the board is pinned at the top and never scrolls away; underneath, the moves flow as text,
   "28.Ng1!! gxf5 29.gxf5 Kf8 30.Ng6+ …", the main line bold in the text colour, the notes as paragraphs between, and
   side lines inline in their own colour (purple), with their own notes and nested lines, the book's wording kept
   (shared/varline.js reads text lines; moves given as data are written out as text and read the same way).
   Every move is a button: tapping one shows that position. The current move is highlighted and kept in view.
   A fixed bottom bar above the home indicator: ‹ far left, › far right (44 px+), Flip, "↩ Main line" (only while on a
   side line) and where you are between. ‹ › / ← → follow the line you are on: in a side line its own moves, and at its
   end › goes back to the main line where you left it; ← from a side line's first move returns to the branch.
   ↓ ↑ pick which line › follows where lines branch (the pick is outlined), as in VarLine.nav. At the end of the main line
   a small "Chapter complete → Next chapter" card (no automatic jump). A drag handle between board and notes keeps the
   board between 35% and 65% of the screen height, remembered on this device. Landscape phones: board left, text right.
   Arrows: the move's own [%cal]/[%csl] through Shapes. The screen stays on (Wake Lock) where the page allows it.
   Needs chess.js and shared/varline.js. */
window.Reader=(()=>{
  const MQ='(orientation:portrait) and (max-width:1099.98px), (orientation:landscape) and (max-height:499.98px)';
  const isPhone=()=>!!(window.matchMedia&&matchMedia(MQ).matches);
  const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const START='rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const KEY='reader-board';
  let R=null, wake=null;
  const getSize=()=>{ try{ const v=+localStorage.getItem(KEY); return v>=35&&v<=65?v:50 }catch(e){ return 50 } };
  const setSize=v=>{ try{ localStorage.setItem(KEY,String(v)) }catch(e){} };
  const pre=(p,m)=>p.length<=m.length&&p.every((x,i)=>x===m[i]);
  const common=(a,b)=>{ let i=0; while(i<a.length&&i<b.length&&a[i]===b[i]) i++; return i };
  const clean=s=>String(s||'').replace(/[{}]/g,'').replace(/\s+/g,' ').trim();
  /* moves given as data -> the text a book would print, read back by VarLine (one reader for both) */
  function toText(fen,moves){
    let g; try{ g=new Chess(fen) }catch(e){ return '' } const out=[]; let fresh=true;
    for(const m of moves||[]){ const before=g.fen(), p=before.split(' '), white=p[1]==='w', n=+p[5]||1;
      let r=null; try{ r=g.move(m.san,{sloppy:true}) }catch(e){ r=null } if(!r) break;
      out.push((white?n+'.':fresh?n+'...':'')+r.san+(m.marks||'')); fresh=false;
      const note=clean(m.note); if(note){ out.push('{'+note+'}'); fresh=true }
      for(const v of m.vars||[]){ const t=toText(before,v); if(t){ out.push('( '+t+' )'); fresh=true } } }
    return out.join(' ') }
  /* the flowing text: main line moves (bold), notes as paragraphs, side lines inline */
  function flow(o,main,fens){
    const out=[], P=[]; let fresh=true;
    const para=()=>{ if(P.length){ out.push(`<p class="rd-p">${P.join(' ')}</p>`); P.length=0 } };
    /* the notes' own moves are buttons too (VarLine.prose: from the position the note is about) */
    const notes=(t,i)=>{ const s=String(t||'').trim(); if(!s) return; para(); const b={fen:fens[i==null?0:i],prefix:main.slice(0,i==null?0:i)}, a=i==null?null:{fen:fens[i+1],prefix:main.slice(0,i+1)};
      s.split(/\n{2,}/).forEach(x=>{ x=x.trim(); if(x) out.push(`<p class="rd-note">${i===-1?esc(x):VarLine.prose(x,b,a)}</p>`) }); fresh=true };
    const side=(fen,prefix,texts)=>{ for(const t of texts){ if(!t||!String(t).trim()) continue; P.push(`<span class="vline rd-sl"><span class="vpar">(</span>${VarLine.html(fen,t,prefix)}<span class="vpar">)</span></span>`); fresh=true } };
    const texts=(fen,m)=>[...(m.vtext||[]),...(m.vars||[]).map(v=>toText(fen,v))];
    if(o.lead){ notes(o.lead.note); side(fens[0],[],texts(fens[0],o.lead)) }
    main.forEach((san,i)=>{ const m=o.lines[i]||{}, p=fens[i].split(' '), white=p[1]==='w', n=+p[5]||1;
      const lab=(white?n+'.':fresh?n+'…':'')+san+(m.marks||'');
      P.push(`<button type="button" class="vmv rd-mm" data-vp="${esc(main.slice(0,i+1).join(' '))}">${esc(lab)}</button>`); fresh=false;
      notes(m.note,i);
      side(fens[i],main.slice(0,i),texts(fens[i],m)) });
    para(); notes(o.after,-1);
    if(!main.length&&!out.length) out.push('<p class="note">No moves.</p>');
    return out.join('') }
  function gameAt(path){ const g=new Chess(R.fen); let last=null; for(const s of path){ let r=null; try{ r=g.move(s,{sloppy:true}) }catch(e){} if(!r) break; last={from:r.from,to:r.to} } return {g,last} }
  const onMain=()=>pre(R.path,R.mainLine);
  const kids=()=>VarLine.kids(R.flow,R.path,R.mainLine);
  /* keep the current move in view inside the text (never the page) */
  function show(el,top){ const box=R.notes, q=box.getBoundingClientRect(), r=el.getBoundingClientRect();
    if(top) box.scrollTop+=r.top-q.top-12;
    else if(r.top<q.top+8||r.bottom>q.bottom-56) box.scrollTop+=r.top-q.top-Math.min(72,q.height/4) }
  function render(scroll=true){
    const {g,last}=gameAt(R.path), k=R.path.length;
    Board.draw(R.board,g,{orient:R.orient,last,role:'gridcell'}); if(window.BoardFX) BoardFX.after(R.board,last,{silent:true});
    const m=onMain()&&k?R.lines[k-1]:null; if(window.Shapes) Shapes.auto(R.board,m&&m.shapes||'');
    const cur=VarLine.mark(R.flow,R.path);
    R.flow.querySelectorAll('.vpick').forEach(b=>b.classList.remove('vpick'));
    if(R.pick&&R.pick.at===R.path.join(' ')){ const x=kids()[R.pick.sel]; const k=x&&x.path.join(' '), el=x&&(x.el||[...R.flow.querySelectorAll('.rd-mm')].find(b=>b.dataset.vp===k)); if(el){ el.classList.add('vpick'); if(scroll) show(el) } }
    else if(scroll){ if(cur) show(cur); else if(!k) R.notes.scrollTop=0 }
    const om=onMain();
    R.el.classList.toggle('rd-inside',!om);
    R.prev.disabled=k===0; R.mainBtn.hidden=om;
    const s=k?(()=>{ const p=gameAt(R.path.slice(0,-1)).g.fen().split(' '); return (p[1]==='w'?p[5]+'.':p[5]+'…')+R.path[k-1] })():'Start';
    R.pos.textContent=s; R.pos.title=om?'Main line':'Side line'; R.pos.setAttribute('aria-label',(om?'Main line, ':'Side line, ')+s);
    R.done.hidden=!(om&&k===R.mainLine.length&&R.end);
    if(!R.done.hidden&&scroll){ const q=R.notes.getBoundingClientRect(), r=R.done.getBoundingClientRect(); if(r.bottom>q.bottom) R.notes.scrollTop+=Math.min(r.bottom-q.bottom+8,cur?cur.getBoundingClientRect().top-q.top-8:1e9) }
  }
  function go(p){ R.path=p.slice(); R.end=false; R.pick=null; render() }
  function next(){ if(!R) return; const ks=kids();
    if(R.pick&&R.pick.at===R.path.join(' ')&&ks[R.pick.sel]) return go(ks[R.pick.sel].path);
    if(ks.length) return go(ks[0].path);
    if(!onMain()){ const c=common(R.path,R.mainLine); return go(R.mainLine.slice(0,Math.min(R.mainLine.length,c+1))) }   // end of a side line: back to the main line where you left it
    R.end=true; render() }
  function prev(){ if(!R||!R.path.length) return; go(R.path.slice(0,-1)) }
  function pick(d){ if(!R) return; const ks=kids(); if(ks.length<2) return; const at=R.path.join(' ');
    if(!R.pick||R.pick.at!==at) R.pick={at,sel:0}; R.pick.sel=(R.pick.sel+d+ks.length)%ks.length; render() }
  function open(o){
    close();
    const el=document.createElement('div'); el.className='reader'; el.setAttribute('role','dialog'); el.setAttribute('aria-label',o.title||'Reader');
    el.style.setProperty('--rb',getSize()+'');
    el.innerHTML=`<div class="rd-top"><span class="rd-title">${esc(o.title||'')}${o.chapter?` <span class="note">· ${esc(o.chapter)}</span>`:''}</span><button type="button" class="btn sm rd-close" aria-label="Close the reader">✕</button></div>
      <div class="rd-boardwrap"><div class="board rd-board" aria-label="Chess board"></div></div>
      <div class="rd-handle" role="separator" aria-orientation="horizontal" aria-label="Drag to resize the board" tabindex="0"><span></span></div>
      <div class="rd-notes" aria-live="polite"><div class="rd-flow"></div><div class="card rd-done" hidden><b>${o.nextChapter?'Chapter complete':'End of the line'}</b>${o.nextChapter?'<div class="btns"><button type="button" class="btn sm primary rd-nextch">Next chapter →</button></div>':'<p class="note">That was the last move.</p>'}</div></div>
      <div class="rd-bar"><button type="button" class="btn rd-prev" aria-label="Previous move">‹</button>
        <button type="button" class="btn sm rd-flip">Flip</button><button type="button" class="btn sm rd-main" hidden>↩ Main line</button><span class="rd-pos note"></span>
        <button type="button" class="btn primary rd-next" aria-label="Next move">›</button></div>`;
    document.body.appendChild(el); document.documentElement.classList.add('reader-open');
    const fen=o.fen||START;
    /* the main line, kept to its legal moves; fens[i] = the position before move i */
    const g=new Chess(fen), main=[], fens=[g.fen()];
    for(const m of o.lines||[]){ let r=null; try{ r=g.move(m.san,{sloppy:true}) }catch(e){} if(!r) break; main.push(r.san); fens.push(g.fen()) }
    R={el,fen,orient:o.orient||'w',lines:o.lines||[],mainLine:main,path:main.slice(0,Math.max(0,Math.min(o.at||0,main.length))),end:false,pick:null,
      nextChapter:o.nextChapter||null,onClose:o.onClose||null,board:el.querySelector('.rd-board'),notes:el.querySelector('.rd-notes'),flow:el.querySelector('.rd-flow'),
      done:el.querySelector('.rd-done'),prev:el.querySelector('.rd-prev'),mainBtn:el.querySelector('.rd-main'),pos:el.querySelector('.rd-pos')};
    R.flow.innerHTML=flow(o,main,fens);
    el.querySelector('.rd-next').onclick=next; R.prev.onclick=prev;
    el.querySelector('.rd-flip').onclick=()=>{ R.orient=R.orient==='w'?'b':'w'; render(false) };
    R.mainBtn.onclick=()=>{ const c=common(R.path,R.mainLine); go(R.mainLine.slice(0,Math.min(R.mainLine.length,c+1))) };
    el.querySelector('.rd-close').onclick=close;
    const nc=el.querySelector('.rd-nextch'); if(nc) nc.onclick=()=>{ const f=R.nextChapter; close(); f() };
    R.flow.addEventListener('click',e=>{ const p=VarLine.path(e.target); if(p) go(p) });
    /* drag handle: board between 35% and 65% of the screen height (or width in landscape), remembered on this device */
    const h=el.querySelector('.rd-handle'); let drag=null;
    h.addEventListener('pointerdown',e=>{ drag={y:e.clientY,x:e.clientX,v:+el.style.getPropertyValue('--rb')||getSize()}; try{ h.setPointerCapture(e.pointerId) }catch(_){} e.preventDefault() });
    h.addEventListener('pointermove',e=>{ if(!drag) return; const land=innerWidth>innerHeight; const d=land?(e.clientX-drag.x)/innerWidth*100:(e.clientY-drag.y)/innerHeight*100;
      const v=Math.round(Math.max(35,Math.min(65,drag.v+d))); el.style.setProperty('--rb',v+''); });
    h.addEventListener('pointerup',()=>{ if(!drag) return; drag=null; setSize(+el.style.getPropertyValue('--rb')) });
    h.addEventListener('keydown',e=>{ const d=e.key==='ArrowUp'||e.key==='ArrowLeft'?-5:e.key==='ArrowDown'||e.key==='ArrowRight'?5:0; if(!d) return; e.preventDefault(); e.stopPropagation();
      const v=Math.max(35,Math.min(65,(+el.style.getPropertyValue('--rb')||50)+d)); el.style.setProperty('--rb',v+''); setSize(v) });
    try{ if(navigator.wakeLock) navigator.wakeLock.request('screen').then(l=>{ wake=l }).catch(()=>{}) }catch(e){}
    render(); const cur=R.flow.querySelector('.vmv.cur'); if(cur) show(cur,true);
    el.querySelector('.rd-next').focus({preventScroll:true});
    return R;
  }
  function close(){ if(!R) return; const f=R.onClose; R.el.remove(); R=null; document.documentElement.classList.remove('reader-open'); try{ wake&&wake.release() }catch(e){} wake=null; f&&f() }
  addEventListener('keydown',e=>{ if(!R||e.ctrlKey||e.metaKey||e.altKey) return; const t=e.target; if(t&&/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName||'')) return;
    const f={ArrowRight:next,ArrowLeft:prev,ArrowDown:()=>pick(1),ArrowUp:()=>pick(-1),Escape:close}[e.key];
    if(t&&t.classList&&t.classList.contains('rd-handle')&&e.key!=='Escape') return;
    if(f){ e.preventDefault(); e.stopImmediatePropagation(); f() } },true);
  function textLine(fen,text){
    const g=new Chess(fen), out=[]; const toks=String(text||'').match(/\{[^}]*\}|[^\s{}()]+/g)||[];
    for(const t of toks){ if(t[0]==='{'){ const c=t.slice(1,-1).trim(); if(c&&out.length) out[out.length-1].note=(out[out.length-1].note?out[out.length-1].note+' ':'')+c; continue }
      const mk=(t.match(/[!?]+$/)||[''])[0], san=t.replace(/^\d+\.+/,'').replace(/[!?]+$/,'').replace(/^0-0-0/,'O-O-O').replace(/^0-0/,'O-O');
      if(!san||/^\d+\.*$/.test(san)||/^[=∞⩲⩱±∓+−\-]+$/.test(san)) continue;
      const m=g.move(san,{sloppy:true}); if(!m) break; out.push({san:m.san,marks:mk}) }
    return out }
  function button(onClick,label='Read'){ const b=document.createElement('button'); b.type='button'; b.className='btn sm rd-open'; b.textContent=label+' ▸'; b.title='Read the moves and notes with the board pinned at the top'; b.onclick=onClick; return b }
  return {open,close,next,prev,pick,isPhone,button,textLine,toText,get state(){ return R },MQ};
})();
