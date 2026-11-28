/* Shared (Chess Lab and Think Ahead). Home: chess-lab-open/site/shared/ (MIT); the private kit pulls a pinned copy.
   The board: squares drawn from a chess.js game, tap-or-drag input, and the makeBoard component built from them.
   Needs only chess.js (0.10.x API) and CSS for .board/.sq/.pc (each site styles its own pieces: Open ships cburnett,
   the private site alpha). Arrows and circles are shared/shapes.js; they find the board by its .sq[data-sq] squares.

   Board.draw(el, game, {orient, sel, last, hint, hintTo, role})   draws the 64 squares (and nothing else)
   Board.bind(el, getState, onMove, {input})                        tap or drag input on el:
       getState() -> {g, can(), sel(), setSel(sq), redraw()}; onMove(from, to, promo) gets a legal move
       (promo = 'q' when the move promotes; the site may ask which piece). input() -> 'both' | 'click' | 'drag'
       (Settings → Move input on the private site; Open has no setting yet, so 'both').
   makeBoard(el, opts) -> {set(game,{last,orient,locked,keepHint}), lock(on), setHint(sq,to), flip(), flash(squares,tone), orient, render}
   endBanner(boardEl, onNext, label) -> {show(tone,text), hide(), shown, text}: the result strip under a board
   Board.promoFor(from, to, promo, expected) -> the expected move's piece when it promotes on those squares, else promo.
   Board.dragOver(el, e) outlines the square under a dragged piece (e = null clears it).
   Sound.play('move'|'capture') and BoardFX.after(el, last) (slide the piece that just moved, play the sound) read the
   site's Settings: sound (true/false), anim (none/fast/normal/slow). makeBoard runs BoardFX after every redraw. */
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
      if(p&&p.color===g.turn()) d.classList.add('mine');
      if(p&&p.color===orient) d.classList.add('own');   // your side's pieces (the board's bottom side), even while the reply is coming: shared.css
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
    let drag=null; el.classList.add('movable');   // shared.css: a drag that starts on your own piece moves it instead of scrolling
    el.addEventListener('pointerdown',e=>{
      if(e.button!==0) return;   /* right button: arrows and circles (Shapes); middle: nothing */
      const st=getState(); const cell=e.target.closest('.sq'); if(!cell||!st||!st.g||!st.can()) return;
      const sq=cell.dataset.sq, g=st.g, p=g.get(sq);
      if(st.sel()&&st.sel()!==sq&&input()!=='drag'){ const pr=promoOf(g,st.sel(),sq); if(pr!==null){ const from=st.sel(); st.setSel(null); st.redraw(); e.preventDefault(); onMove(from,sq,pr); return } }   // redraw first: a turned-down move (a wrong Tactics try) must not leave the old dots
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
        /* Redraw before handing the move over: it clears the lifted piece's fade and the selection, which a page that
           turns the move down (Openings: "loses about 0.6 pawns, try again") would otherwise leave on the board. */
        if(pr!==null){ st.setSel(null); st.redraw(); el._skipAnim=true; onMove(d.from,to,pr); return }
        st.redraw(); return;
      }
      if(d.wasSel||input()==='drag'){ st.setSel(null); st.redraw() }
    });
    el.addEventListener('pointercancel',()=>{ if(drag){ drag.ghost.remove(); drag=null; const st=getState(); st&&st.redraw() } });
  }
  /* The piece a promotion becomes. A tap or drag can't say which piece, so it arrives as 'q'; when the page knows the
     move it is waiting for (exp: a uci or a list of them) and that move promotes on the same squares, the pawn becomes
     that piece instead (27 Nov 2026, roadmap #273: 39 tactics and a few Calculation and Blind lines promote to a knight or
     rook, and were a miss whatever you did). */
  function promoFor(from,to,promo,exp){
    if(!promo||!exp) return promo;
    const hit=[].concat(exp).find(u=>typeof u==='string'&&u.slice(0,4)===from+to&&/[qrbn]/.test(u[4]||''));
    return hit?hit[4]:promo;
  }
  return {draw,bind,dragOver,promoFor};
})();

/* Move sounds: a short synthesized wooden click, louder and lower for captures. */
window.Sound=(()=>{ let ctx=null;
  function play(kind){ if(!Settings.get('sound')) return; try{
    ctx=ctx||new (window.AudioContext||window.webkitAudioContext)(); if(ctx.state==='suspended') ctx.resume();
    const cap=kind==='capture', len=cap?0.09:0.06, buf=ctx.createBuffer(1,Math.floor(ctx.sampleRate*len),ctx.sampleRate), d=buf.getChannelData(0);
    for(let i=0;i<d.length;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/d.length,cap?3:4);
    const src=ctx.createBufferSource(); src.buffer=buf; const f=ctx.createBiquadFilter(); f.type='bandpass'; f.frequency.value=cap?900:1400; f.Q.value=cap?1.2:2.5;
    const g=ctx.createGain(); g.gain.value=cap?0.9:0.7; src.connect(f).connect(g).connect(ctx.destination); src.start() }catch(e){} }
  return {play} })();

/* Board effects, run after every redraw: slide the piece that just moved (and the rook when castling), play the sound.
   A redraw that only changed the selection, a takeback or a jump to a new position does nothing. */
window.BoardFX={ ANIM:{none:0,fast:120,normal:250,slow:500},
  after(el,last,opts={}){
    const now={}; el.querySelectorAll('.sq').forEach(q=>{ const p=q.querySelector('.pc'); now[q.dataset.sq]=p?p.className:'' });
    const prev=el._pos; el._pos=now; const skip=el._skipAnim; el._skipAnim=false;
    if(!prev||!last||!last.from||!(last.to in now)) return;
    if(prev[last.from]===now[last.from]&&prev[last.to]===now[last.to]) return;
    if(!prev[last.from]||now[last.from]||!now[last.to]) return;
    if(Object.keys(now).filter(k=>prev[k]!==now[k]).length>4) return;
    if(!opts.silent) Sound.play(last.captured||(last.flags||'').includes('e')?'capture':'move');
    const ms=this.ANIM[Settings.get('anim')]; if(skip||!ms||(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
    const slide=(f,t)=>{ const fe=el.querySelector(`.sq[data-sq="${f}"]`), te=el.querySelector(`.sq[data-sq="${t}"]`), pc=te&&te.querySelector('.pc');
      if(!fe||!pc||!pc.animate) return; pc.style.zIndex=5;
      pc.animate([{transform:`translate(${fe.offsetLeft-te.offsetLeft}px,${fe.offsetTop-te.offsetTop}px)`},{transform:'translate(0,0)'}],{duration:ms,easing:'cubic-bezier(.25,.1,.25,1)'}).onfinish=()=>{ pc.style.zIndex='' } };
    slide(last.from,last.to);
    const fl=last.flags||''; if(fl.includes('k')||fl.includes('q')){ const r=last.to[1], k=fl.includes('k'); slide((k?'h':'a')+r,(k?'f':'d')+r) }
  } };

/* The result of an exercise, next to the board (17 Nov 2026: was a bar with a Next button drawn over the board).
   Wraps the board in .boardbox (the board re-renders its own children only) and puts a slim strip directly under it with
   the result text only: no button, since the page's own button row (Next, Take back …) is the one home for each action.
   The strip shows where the side panel is not beside the board (phones, narrow windows: shared.css), and the board gets
   a thin outline in the result's colour. A site that shows results only in its own status card hides .endbar (Chess Lab).
   API unchanged: show(tone, text) with tone good / warn / bad, hide(), shown, text; the third argument of show and
   onNext are kept for callers but no longer draw a button. */
function endBanner(boardEl,onNext,label){
  let box=boardEl.parentElement;
  if(!box.classList.contains('boardbox')){ box=document.createElement('div'); box.className='boardbox'; boardEl.parentNode.insertBefore(box,boardEl); box.appendChild(boardEl) }
  const bar=document.createElement('div'); bar.className='endbar'; bar.hidden=true; bar.setAttribute('role','status');
  bar.innerHTML='<span class="endtext"></span>';
  boardEl.insertAdjacentElement('afterend',bar);
  const api={onNext,
    show(tone,text){ box.classList.remove('end-good','end-warn','end-bad'); box.classList.add('end-'+tone);
      bar.querySelector('.endtext').textContent=text; bar.hidden=false },
    hide(){ bar.hidden=true; box.classList.remove('end-good','end-warn','end-bad') },
    get shown(){ return !bar.hidden }, get text(){ return bar.querySelector('.endtext').textContent }};
  return api;
}

/* The board component: makeBoard(el, opts); opts.onMove(from,to,promo) is called for the user's move attempt
   (tap a piece then a square, or drag); opts.input() as in Board.bind; opts.expect() -> the uci (or list) the page is
   waiting for, so a promotion becomes the expected piece (Board.promoFor). */
function makeBoard(el,opts={}){
  const B={game:null,last:null,orient:'w',sel:null,hint:null,hintTo:null,locked:false};
  /* .movable (shared.css: a drag that starts on a piece moves it instead of scrolling the page) only while this board takes
     a move: not on a locked board (a finished puzzle or drill, a game being read, Today's preview) and not on one with no
     onMove. 23 Nov 2026: it stayed on for good, so after a solve every piece swallowed a swipe (half an iPhone's screen). */
  const movable=()=>el.classList.toggle('movable',!B.locked&&!!B.game&&!!opts.onMove);
  const render=()=>{ Board.draw(el,B.game,{orient:B.orient,sel:B.sel,last:B.last,hint:B.hint,hintTo:B.hintTo}); movable(); BoardFX.after(el,B.last) };
  Board.bind(el,()=>({g:B.game,can:()=>!B.locked&&!!B.game,sel:()=>B.sel,setSel:v=>{ B.sel=v },redraw:render}),
    (f,t,p)=>{ opts.onMove&&opts.onMove(f,t,Board.promoFor(f,t,p,opts.expect&&opts.expect())) },{input:opts.input||(()=>{ const v=window.Settings&&Settings.get('input'); return v==='tap'?'both':v })});
  return {
    set(game,o={}){ B.game=game; if(o.last!==undefined) B.last=o.last; if(o.orient) B.orient=o.orient; B.sel=null; if(!o.keepHint){B.hint=null;B.hintTo=null} B.locked=!!o.locked; render() },
    lock(on=true){ B.locked=!!on; movable() },   // done with this position (solved, game over): no more moves, and swipes on it scroll; no redraw, so a flash stays
    setHint(sq,to){ B.hint=sq||null; B.hintTo=to||null; B.sel=null; render() },   // a hint drops the piece you had picked up
    flip(){ B.orient=B.orient==='w'?'b':'w'; render() },
    flash(squares,tone){ const list=(squares||[]).filter(Boolean); list.forEach((sq,i)=>{ const q=el.querySelector(`.sq[data-sq="${sq}"]`); if(!q) return; q.classList.remove('flash-good','flash-bad','flash-to'); void q.offsetWidth; q.classList.add('flash-'+tone); if(i===list.length-1) q.classList.add('flash-to'); setTimeout(()=>q.classList.remove('flash-'+tone,'flash-to'),900) }) },   // the last square (the move's destination) also gets the ✓ / ✗ badge
    get orient(){ return B.orient }, set orient(v){ B.orient=v; render() },
    render
  };
}
