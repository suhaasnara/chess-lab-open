/* Shared (Chess Lab and Chess Lab Open). Home: chess-lab-open/site/shared/ (MIT); the private kit pulls a pinned copy.
   The board: squares drawn from a chess.js game, tap-or-drag input, and the makeBoard component built from them.
   Needs only chess.js (0.10.x API) and CSS for .board/.sq/.pc (each site styles its own pieces: Open ships cburnett,
   the private site alpha). Arrows and circles are shared/shapes.js; they find the board by its .sq[data-sq] squares.

   Board.draw(el, game, {orient, sel, last, hint, hintTo, role})   draws the 64 squares (and nothing else)
   Board.bind(el, getState, onMove, {input})                        tap or drag input on el:
       getState() -> {g, can(), sel(), setSel(sq), redraw()}; onMove(from, to, promo) gets a legal move
       (promo = 'q' when the move promotes; the site may ask which piece). input() -> 'both' | 'click' | 'drag'
       (Settings → Move input on the private site; Open has no setting yet, so 'both').
   makeBoard(el, opts) -> {set(game,{last,orient,locked,keepHint}), setHint(sq,to), flip(), flash(squares,tone), orient, render}
   endBanner(boardEl, onNext, label) -> {show(tone,text,btn), hide(), shown, text}
   Board.dragOver(el, e) outlines the square under a dragged piece (e = null clears it). */
window.Board=(()=>{
  const FILES='abcdefgh', NAME={p:'pawn',n:'knight',b:'bishop',r:'rook',q:'queen',k:'king'};
  function draw(el,g,o={}){
    el.innerHTML='';
    if(!g) return;
    const orient=o.orient||'w', sel=o.sel||null, last=o.last||null;
    const legal=sel?g.moves({square:sel,verbose:true}):[];
    for(let r=0;r<8;r++) for(let c=0;c<8;c++){
      const file=orient==='w'?c:7-c, rank=orient==='w'?7-r:r;
      const sq=FILES[file]+(rank+1);
      const d=document.createElement('div');
      d.className='sq '+((file+rank)%2?'l':'d'); d.dataset.sq=sq; d.setAttribute('role',o.role||'button');
      if(last&&(last.from===sq||last.to===sq)) d.classList.add('last');
      if(sel===sq) d.classList.add('sel');
      if(o.hint===sq) d.classList.add('hint');
      if(o.hintTo===sq) d.classList.add('hintto');
      const t=legal.find(m=>m.to===sq); if(t){ d.classList.add('tgt'); if(t.captured) d.classList.add('cap') }
      const p=g.get(sq);
      if(p){ const s=document.createElement('span'); s.className='pc '+p.color+p.type.toUpperCase(); d.appendChild(s); d.setAttribute('aria-label',sq+' '+(p.color==='w'?'white ':'black ')+NAME[p.type]) }
      else d.setAttribute('aria-label',sq);
      if(r===7){ const k=document.createElement('span'); k.className='coord f'; k.textContent=FILES[file]; d.appendChild(k) }
      if(c===7){ const k=document.createElement('span'); k.className='coord r'; k.textContent=rank+1; d.appendChild(k) }
      el.appendChild(d);
    }
  }
  /* While dragging a piece, outline the square under the pointer (like Lichess). */
  function dragOver(el,e){
    const prev=el.querySelector('.sq.dragover');
    const over=e&&document.elementFromPoint(e.clientX,e.clientY); const q=over&&over.closest&&over.closest('.sq');
    const t=q&&el.contains(q)?q:null;
    if(prev&&prev!==t) prev.classList.remove('dragover'); if(t) t.classList.add('dragover');
  }
  const promoOf=(g,from,to)=>{ const mv=g.moves({square:from,verbose:true}).find(m=>m.to===to); return mv?(mv.promotion?'q':undefined):null };
  function bind(el,getState,onMove,o={}){
    const input=()=>(o.input&&o.input())||'both';
    let drag=null;
    el.addEventListener('pointerdown',e=>{
      if(e.button!==0) return;   /* right button: arrows and circles (Shapes); middle: nothing */
      const st=getState(); const cell=e.target.closest('.sq'); if(!cell||!st||!st.g||!st.can()) return;
      const sq=cell.dataset.sq, g=st.g, p=g.get(sq);
      if(st.sel()&&st.sel()!==sq&&input()!=='drag'){ const pr=promoOf(g,st.sel(),sq); if(pr!==null){ const from=st.sel(); st.setSel(null); e.preventDefault(); onMove(from,sq,pr); return } }
      if(!(p&&p.color===g.turn())){ if(st.sel()){ st.setSel(null); st.redraw() } return }
      e.preventDefault();
      const wasSel=st.sel()===sq, size=cell.getBoundingClientRect().width; st.setSel(sq); st.redraw();   // measure before the redraw replaces the square
      const pc=el.querySelector(`.sq[data-sq="${sq}"] .pc`);
      const ghost=document.createElement('span'); ghost.className='pc '+p.color+p.type.toUpperCase();
      ghost.style.cssText=`position:fixed;left:${e.clientX}px;top:${e.clientY}px;inset:auto;width:${size}px;height:${size}px;transform:translate(-50%,-50%);pointer-events:none;z-index:50;display:none`;
      document.body.appendChild(ghost);
      drag={from:sq,ghost,pc,moved:false,x:e.clientX,y:e.clientY,wasSel};
      try{ el.setPointerCapture(e.pointerId) }catch(_){}
    });
    el.addEventListener('pointermove',e=>{
      if(!drag) return;
      if(!drag.moved&&input()!=='click'&&Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>6){ drag.moved=true; drag.ghost.style.display='block'; if(drag.pc) drag.pc.style.opacity='.25' }
      if(drag.moved){ drag.ghost.style.left=e.clientX+'px'; drag.ghost.style.top=e.clientY+'px'; dragOver(el,e) }
    });
    el.addEventListener('pointerup',e=>{
      if(!drag) return; const d=drag; drag=null; d.ghost.remove(); dragOver(el,null); const st=getState();
      if(d.moved){
        const over=document.elementFromPoint(e.clientX,e.clientY); const q=over&&over.closest&&over.closest('.sq'); const to=q&&q.dataset.sq;
        const pr=to?promoOf(st.g,d.from,to):null;
        if(pr!==null){ st.setSel(null); el._skipAnim=true; onMove(d.from,to,pr); return }
        st.redraw(); return;
      }
      if(d.wasSel||input()==='drag'){ st.setSel(null); st.redraw() }
    });
    el.addEventListener('pointercancel',()=>{ if(drag){ drag.ghost.remove(); drag=null; const st=getState(); st&&st.redraw() } });
  }
  return {draw,bind,dragOver};
})();

/* A result banner on a board: a coloured frame plus a bar with the result and a Next button, so the end
   of an exercise is obvious on a phone. Wraps the board in .boardbox (the board re-renders its own
   children only). Tap the result text to hide the bar and see the whole board. */
function endBanner(boardEl,onNext,label){
  let box=boardEl.parentElement;
  if(!box.classList.contains('boardbox')){ box=document.createElement('div'); box.className='boardbox'; boardEl.parentNode.insertBefore(box,boardEl); box.appendChild(boardEl) }
  const bar=document.createElement('div'); bar.className='endbar'; bar.hidden=true;
  bar.innerHTML='<span class="endtext" title="Tap to hide"></span><button class="btn sm primary"></button>';
  box.appendChild(bar);
  const api={onNext,
    show(tone,text,btn){ box.classList.remove('end-good','end-warn','end-bad'); box.classList.add('end-'+tone);
      bar.querySelector('.endtext').textContent=text; bar.querySelector('button').textContent=btn||label||'Next'; bar.hidden=false },
    hide(){ bar.hidden=true; box.classList.remove('end-good','end-warn','end-bad') },
    get shown(){ return !bar.hidden }, get text(){ return bar.querySelector('.endtext').textContent }};
  bar.querySelector('button').addEventListener('click',()=>{ api.hide(); api.onNext&&api.onNext() });
  bar.querySelector('.endtext').addEventListener('click',()=>{ bar.hidden=true });
  return api;
}

/* The board component: makeBoard(el, opts); opts.onMove(from,to,promo) is called for the user's move attempt
   (tap a piece then a square, or drag); opts.input() as in Board.bind. */
function makeBoard(el,opts={}){
  const B={game:null,last:null,orient:'w',sel:null,hint:null,hintTo:null,locked:false};
  const render=()=>Board.draw(el,B.game,{orient:B.orient,sel:B.sel,last:B.last,hint:B.hint,hintTo:B.hintTo});
  Board.bind(el,()=>({g:B.game,can:()=>!B.locked&&!!B.game,sel:()=>B.sel,setSel:v=>{ B.sel=v },redraw:render}),
    (f,t,p)=>{ opts.onMove&&opts.onMove(f,t,p) },{input:opts.input});
  return {
    set(game,o={}){ B.game=game; if(o.last!==undefined) B.last=o.last; if(o.orient) B.orient=o.orient; B.sel=null; if(!o.keepHint){B.hint=null;B.hintTo=null} B.locked=!!o.locked; render() },
    setHint(sq,to){ B.hint=sq||null; B.hintTo=to||null; render() },
    flip(){ B.orient=B.orient==='w'?'b':'w'; render() },
    flash(squares,tone){ (squares||[]).filter(Boolean).forEach(sq=>{ const q=el.querySelector(`.sq[data-sq="${sq}"]`); if(!q) return; q.classList.remove('flash-good','flash-bad'); void q.offsetWidth; q.classList.add('flash-'+tone); setTimeout(()=>q.classList.remove('flash-'+tone),900) }) },
    get orient(){ return B.orient }, set orient(v){ B.orient=v; render() },
    render
  };
}
