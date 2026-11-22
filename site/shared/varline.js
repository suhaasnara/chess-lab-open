/* Shared (Chess Lab and Think Ahead). Home: chess-lab-open/site/shared/ (MIT); the private kit pulls a pinned copy.
   Side lines you can click through on the board (Guess the move, Calculation, a drill's best line …), Lichess-study style.

   VarLine.html(fen, text, prefix)  a side line written as text, played from fen, as HTML: every legal move is a button,
                                    the rest stays text (notes, signs, a book's prose). Nested lines in brackets start from
                                    the position before the move they replace. prefix = the SAN moves that lead from the
                                    host's start to fen (e.g. the main line up to the branch); each button carries
                                    prefix + its own moves (data-vp, space-separated SAN).
   VarLine.path(el)                 the SAN path of a clicked move button (or null): the host plays it from its start.
   VarLine.mark(root, path)         marks the button whose path is `path` (array of SAN) as current; returns it.
   VarLine.stack(fen, texts, prefix, key)  a move's side lines stacked under it (v115, Lichess's move list): one row each,
                                    joined by a thin elbow line on the left; key = the FEN after that move, which pairs the
                                    block with VarLine.fold(key), the ⊟ / ⊞ the host puts before the move.
   VarLine.wrap(fen, text, prefix)  stack() of one side line (the block the hosts put under a move).
   VarLine.html lays brackets out the same way: a single short one stays inline in brackets and italics (.vinl), more (or
   one with its own brackets) are stacked (.vtree > .vrow) with a ⊟ before the move they replace.
   VarLine.prose(text, before, after)  a note written in prose with moves in it: the moves become buttons, the rest stays
                                    plain text. before/after = {fen, prefix} around the move the note is on.
   VarLine.kids(root, path, main)   the moves that can follow `path` (array of SAN), Lichess order: the main line's move first
                                    (when path is on `main`), then the line you are in, then the other side lines that branch
                                    there. [{path, el}] (el = the side line's button, null for the main line's move).
   VarLine.nav(o)                   arrow keys through the main line and every side line, Lichess style:
                                    ← → step along whichever line you are on (← from a side line's first move goes back to
                                    its branch point), ↓ ↑ pick which move → plays where lines branch (the pick is outlined).
                                    o = {active(), root(), cur() = path of the position shown or null (not on the tree),
                                    main() = the main line as SAN, go(path) = show that position, mainEl(i) = the main
                                    line's button for move i (optional), left(), right() = the host's own steps on the main
                                    line}. Returns {keys: {ArrowLeft, ArrowRight, ArrowUp, ArrowDown} for Keys.on, paint()
                                    (call after each redraw so the pick survives it)}.

   Lines from scanned books mix moves and prose ("32...Rxd6!! is a favourable transaction. After 33.Qb8+ Kh7 34.Qxd6 …",
   "27.f4?! The attempt … by 27 f4?! fails: 27...gxf4"), so it reads them carefully rather than greedily:
   - only move-shaped words are tried as moves; other words are text and don't end the line;
   - after a word of prose, or a move that isn't legal (a typo, a misread), a move needs its number ("33.", "27...",
     "20") before the line goes on, so a square named in a sentence ("the pawn on d5") is never played;
   - a numbered move that repeats an earlier point of the same line ("by 27 f4?!") goes back to that point.
   Needs chess.js (window.Chess). Nothing here stores anything. */
window.VarLine=(()=>{
  const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const TOK=/\{[^}]*\}|\(|\)|[^\s{}()]+/g;
  const SAN=/^(?:[KQRBN][a-h]?[1-8]?x?[a-h][1-8]|[a-h](?:x[a-h])?[1-8](?:=?[QRBN])?|O-O(?:-O)?|0-0(?:-0)?)[+#]?$/;
  const NUM=/^(\d+)(\.{1,3}|…)?$/;                 // a move number on its own: "27.", "27...", "27…", "27"
  const NUMMOVE=/^(\d+)(\.{1,3}|…)(.+)$/;          // a numbered move: "27.f4", "27...gxf4", "27…gxf4"
  const SIGN=/^(?:[=∞⩲⩱±∓□⨀N]|\+[-−–]|[-−–]\+|\+\/[-−–=]|[-−–=]\/\+|\+=|=\+|\$\d+|1-0|0-1|1\/2-1\/2|½-½|\*)$/;
  function html(fen,text,prefix,flat){
    const out=[]; let start;
    try{ start=new Chess(fen||undefined) }catch(e){ return esc(text) }
    /* a line: its positions (stops: fen, path, and the chain of stops that leads there, from the line's start through the
       line it branched from), the board, and every position it has been through (all), for numbered moves to go back to.
       Until its first move a bracket can still start from its parent's last position: a bracket can hold an alternative
       to the move before it (PGN) or, as books often write it, to the reply after it ("30.Rf4 (30...Ke6 31.g4) 30...Kg5");
       its number decides. */
    const line=(stops,pool)=>{ const s=stops[stops.length-1]; return {g:new Chess(s.fen),stops,all:(pool||stops).slice(),path:s.path.slice(),need:false,fresh:true} };
    const root={fen:start.fen(),path:(prefix||[]).slice()}; root.chain=[root];
    let cur=line([root]), stack=[], num=null;
    const put=(t,cls)=>{ out.push(cls?`<span class="${cls}">${esc(t)}</span>`:esc(t)) };
    const clean=w=>{ const w2=w.replace(/[,;:.]+$/,''), tail=w.slice(w2.length), mk=(w2.match(/[!?]+$/)||[''])[0], core=w2.slice(0,w2.length-mk.length).replace(/^0-0-0/,'O-O-O').replace(/^0-0/,'O-O'); return {mk,core,tail,ok:SAN.test(core)} };
    const play=(fen,core)=>{ try{ const g=new Chess(fen); const m=g.move(core,{sloppy:true}); return m?{g,m}:null }catch(e){ return null } };
    const tryMove=(word,n,black,next,shown)=>{   // shown: the token as written, number included (kept when it isn't played)
      const {mk,core,tail,ok}=clean(word); if(!ok) return false;
      if(n!=null){   // the latest point of the line with move n to play where it is legal (and the move after it too, when one follows)
        const c=cur.all.filter(x=>{ const p=x.fen.split(' '); return +p[5]===n&&(p[1]==='b')===!!black }).reverse();
        const legal=c.filter(x=>play(x.fen,core)), pick=legal.find(x=>{ if(!next) return true; const r=play(x.fen,core); return !!play(r.g.fen(),next) })||legal[0];
        if(!pick&&!revive(n,black,core)){ cur.need=true; put(shown||word,'vdead vill'); return true }   // no point of the line fits it: not played
        if(!pick){ cur.need=false; return tryMove(word,null,null,null,shown) }
        if(pick!==cur.stops[cur.stops.length-1]){ cur.stops=pick.chain.slice(); cur.g=new Chess(pick.fen); cur.path=pick.path.slice(); cur.fresh=true }
        cur.need=false }
      if(cur.need){ cur.skip={i:out.length,core,mk,tail,at:cur.stops.length}; put(shown||word,'vdead'); return true }
      const before=cur.g.fen(), p=before.split(' '), white=p[1]==='w', mv=+p[5]||1;
      let m=null; try{ m=cur.g.move(core,{sloppy:true}) }catch(e){ m=null }
      if(!m){ cur.need=true; put(shown||word,'vdead vill'); return true }
      out.push(push(m,white,mv,mk)+esc(tail)); return true };   // the word's own punctuation stays ("13.Re1, the main line")
    function push(m,white,mv,mk){ cur.path.push(m.san); const st={fen:cur.g.fen(),path:cur.path.slice()}; cur.stops.push(st); st.chain=cur.stops.slice(); cur.all.push(st);
      const label=(white?mv+'.':cur.fresh?mv+'…':'')+m.san+mk; cur.fresh=false; cur.skip=null;
      return `<button type="button" class="vmv" data-vp="${esc(cur.path.join(' '))}" data-vd="${stack.length}" data-vk="${esc(cur.g.fen())}">${esc(label)}</button>` }
    /* "playing Bc5 14.Re1", "Ng4 Black exploits … 9.Nxc6": a move left as text after prose is played after all when the
       numbered move that follows only fits after it */
    function revive(n,black,core){ const k=cur.skip; if(!k||k.at!==cur.stops.length) return false;
      const before=cur.g.fen(), r=play(before,k.core); if(!r) return false; const p=r.g.fen().split(' ');
      if(+p[5]!==n||(p[1]==='b')!==!!black||!play(r.g.fen(),core)) return false;
      const b=before.split(' '); cur.g=r.g; out[k.i]=push(r.m,b[1]==='w',+b[5]||1,k.mk)+esc(k.tail||''); cur.fresh=true; return true }
    /* "a)", "b)" … label a book's options; they are not brackets */
    const src=String(text||'').replace(/(^|\s)([a-z])\)(?=\s|$)/g,'$1$2');
    const toks=src.match(TOK)||[];
    const nextMove=i=>{ for(let k=i+1;k<toks.length;k++){ const t=toks[k]; if(NUM.test(t)||/^(\.{2,3}|…)$/.test(t)) continue;
        const mm=NUMMOVE.exec(t), c=clean(mm?mm[3]:t); return c.ok?c.core:null } return null };
    toks.forEach((t,i)=>{
      if(num&&(t==='('||t===')'||t[0]==='{')){ put(num.t); num=null }   // a number before a bracket or a note is text ("Moscow 1937)")
      if(t[0]===''){ put(t.slice(1)+')','vnote'); cur.fresh=true; return }
      if(t[0]==='{'){ const c=t.slice(1,-1).trim(); if(c) put(c,'vnote'); cur.fresh=true; num=null; return }
      if(t==='('){ stack.push(cur); out.push(OPEN);
        const pool=cur.stops.slice(); cur=line(pool.slice(0,Math.max(1,pool.length-1)),cur.all); num=null; return }
      if(t===')'){ if(stack.length){ out.push(CLOSE); cur=stack.pop(); cur.fresh=true } else put(t); num=null; return }
      let m=NUM.exec(t);
      if(m){ if(num) put(num.t); num={n:+m[1],black:!!m[2]&&m[2]!=='.',t}; return }
      if(num&&/^(\.{2,3}|…)$/.test(t)){ num.black=true; num.t+=' '+t; return }
      m=NUMMOVE.exec(t);
      if(m&&tryMove(m[3],+m[1],m[2]!=='.',nextMove(i),t)){ num=null; return }
      if(num){ const n=num; num=null; if(tryMove(t,n.n,n.black,nextMove(i),n.t+' '+t)) return; put(n.t) }
      if(tryMove(t,null,null)) return;
      if(SIGN.test(t.replace(/[,;:.]+$/,''))){ put(t,'vnote'); return }
      put(t,'vtext'); cur.need=true; cur.fresh=true;   // prose: the line goes on only at a numbered move
    });
    if(num) put(num.t);
    while(stack.length){ out.push(CLOSE); stack.pop() }
    return lay(tree(out),flat);
  }
  /* A note in prose ("11...Bd6?! 12.f4 Ne4 13.Nxe4 favours White", "If 12.f4 there would have followed c5 13.e3"): the moves
     become buttons as in a side line, the prose stays ordinary text (no brackets, no muted words). The note sits on a move:
     before = {fen, prefix} the position before that move, after = the position after it; the first numbered move in the
     text decides which one the moves start from (an alternative to the move, or what follows it). */
  function prose(text,before,after){
    const t=String(text||''); if(!t.trim()) return '';
    let root=before; const m=t.match(/(?:^|[\s(])(\d+)(\.{3}|…|\.)\s?(?=[KQRBNa-hO0])/);
    if(m&&after&&after.fen){ const n=+m[1], blk=m[2]!=='.', fit=f=>{ const p=f.split(' '); return +p[5]===n&&(p[1]==='b')===blk };
      if(!fit(before.fen)&&fit(after.fen)) root=after }
    let h=html(root.fen,t,root.prefix,true);
    h=h.replace(/<span class="(?:vdead(?: vill)?|vtext|vnote)">([^<]*)<\/span>/g,'$1').replace(/<span class="vpar">\(<\/span> ?/g,'(').replace(/ ?<span class="vpar">\)<\/span>/g,')');
    return h.replace(/ ([,.;:!?])(?=\s|$)/g,'$1') }
  /* ---------- the move tree (v115, Lichess's move list): where lines branch ----------
     Brackets at one point of a line are laid out as Lichess does: one short side line with no brackets of its own stays
     inline, in brackets and italics ("(6...Nf6 7.Ne5)"); two or more, or one with side lines of its own, are stacked under
     the move they replace, each on its own row, joined on the left by a thin elbow line, and the line goes on under them on
     a row of its own. The move they replace gets a small ⊟ that folds them away (⊞ brings them back); a fold is kept per
     position (VarLine.fold / stack key = the FEN after that move) while the page is open, and the move shown on the board
     is never left inside a folded block (mark, nav). flat = the old one-paragraph layout (prose notes). */
  const OPEN={o:1}, CLOSE={c:1}, SHUT=new Set();
  function tree(out){ const root=[], st=[root];
    for(const x of out){ if(x===OPEN){ const g=[]; st[st.length-1].push({g}); st.push(g) } else if(x===CLOSE){ if(st.length>1) st.pop() } else st[st.length-1].push(x) }
    return root }
  const deep=g=>g.some(x=>x&&x.g);
  const par=c=>`<span class="vpar">${c}</span>`;
  const lay=(seq,flat)=>parts(seq,flat).join(' ');
  /* a bracket never ends a line apart from its first move (or starts one with its closing bracket alone) */
  const bracket=g=>{ const q=parts(g); if(!q.length) return `<span class="vinl">${par('(')}${par(')')}</span>`;
    if(q.length===1) return `<span class="vinl"><span class="vfg">${par('(')}${q[0]}${par(')')}</span></span>`;
    return `<span class="vinl"><span class="vfg">${par('(')}${q[0]}</span> ${q.slice(1,-1).concat('').join(' ')}<span class="vfg">${q[q.length-1]}${par(')')}</span></span>` };
  function parts(seq,flat){ const parts=[]; let i=0;
    while(i<seq.length){ const x=seq[i]; if(!(x&&x.g)){ parts.push(x); i++; continue }
      const run=[]; while(i<seq.length&&seq[i]&&seq[i].g) run.push(seq[i++].g);
      if(flat){ run.forEach(g=>parts.push(par('(')+' '+lay(g,true)+' '+par(')'))); continue }
      if(run.length===1&&!deep(run[0])){ parts.push(bracket(run[0])); continue }
      let key=null;   // the move these lines replace: the last move before them (none after prose)
      for(let k=parts.length-1;k>=0;k--){ const p=parts[k]; if(typeof p!=='string') break; if(/^<button type="button" class="vmv"/.test(p)){ const m=/data-vk="([^"]*)"/.exec(p); key=m?m[1]:null; if(key) parts[k]=`<span class="vfg">${fold(key,true)}${p}</span>`; break } if(/class="vtext"/.test(p)) break }
      parts.push(block(run.map(g=>`<span class="vrow">${lay(g)}</span>`),key)) }
    return parts }
  const unesc=s=>String(s).replace(/&quot;/g,'"').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
  /* fold(key): the ⊟ / ⊞ before a move whose side lines are stacked; key = the FEN after that move (escaped or not) */
  function fold(key,escd){ const k=escd?unesc(key):key, shut=SHUT.has(k);
    return `<button type="button" class="vfold${shut?' shut':''}" data-vfold="${esc(k)}" aria-expanded="${!shut}" aria-label="${shut?'Show':'Hide'} the side lines here" title="${shut?'Show':'Hide'} the side lines here"></button>` }
  function block(rows,key,cls){ const k=key==null?null:unesc(key);
    return `<span class="vtree${cls?' '+cls:''}${k!=null&&SHUT.has(k)?' vshut':''}"${k!=null?` data-vfor="${esc(k)}"`:''}>${rows.join('')}</span>` }
  /* stack(fen, texts, prefix, key): a move's side lines (as the book wrote them), stacked under it, one row each (each row
     a .vline box for the keys); key = the FEN after the move they replace, to pair them with fold(key) */
  function stack(fen,list,prefix,key){ const rows=(list||[]).filter(t=>t&&String(t).trim()).map(t=>`<span class="vrow vline">${html(fen,t,prefix)}</span>`);
    return rows.length?block(rows,key,'vstack'):'' }
  const wrap=(fen,text,prefix)=>stack(fen,[text],prefix);
  function setShut(k,shut){ if(shut) SHUT.add(k); else SHUT.delete(k);
    if(typeof document==='undefined') return;
    document.querySelectorAll('.vtree[data-vfor]').forEach(t=>{ if(t.dataset.vfor===k) t.classList.toggle('vshut',shut) });
    document.querySelectorAll('.vfold[data-vfold]').forEach(b=>{ if(b.dataset.vfold!==k) return; b.classList.toggle('shut',shut); b.setAttribute('aria-expanded',String(!shut));
      const l=(shut?'Show':'Hide')+' the side lines here'; b.setAttribute('aria-label',l); b.title=l }) }
  /* a move about to be shown (current, or picked with ↓ ↑) is never inside a folded block */
  function reveal(el){ for(let t=el&&el.closest&&el.closest('.vtree.vshut');t;t=t.parentElement&&t.parentElement.closest('.vtree.vshut')) if(t.dataset.vfor) setShut(t.dataset.vfor,false); else t.classList.remove('vshut') }
  if(typeof document!=='undefined') document.addEventListener('click',e=>{ const b=e.target&&e.target.closest&&e.target.closest('.vfold[data-vfold]'); if(!b) return;
    e.preventDefault(); e.stopPropagation(); setShut(b.dataset.vfold,!SHUT.has(b.dataset.vfold)) },true);
  function path(el){ const b=el&&el.closest&&el.closest('.vmv[data-vp]'); return b?b.dataset.vp.split(' ').filter(Boolean):null }
  function mark(root,p){ if(!root) return null; const k=p&&p.length?p.join(' '):null; let hit=null;
    root.querySelectorAll('.vmv.cur').forEach(b=>b.classList.remove('cur'));
    if(k) root.querySelectorAll('.vmv[data-vp]').forEach(b=>{ if(!hit&&b.dataset.vp===k){ b.classList.add('cur'); hit=b } });
    if(hit) reveal(hit);
    return hit }
  /* ---------- keyboard: the tree of lines ---------- */
  const same=(a,b)=>a.length===b.length&&a.every((x,i)=>x===b[i]);
  const pre=(p,m)=>p.length<=m.length&&p.every((x,i)=>x===m[i]);
  /* how deep in brackets a button sits inside its .vline (0 = the line itself) */
  function depth(b){ if(b.dataset&&b.dataset.vd!=null) return +b.dataset.vd; const box=b.closest('.vline'); if(!box) return 0; let d=0;
    for(const n of box.querySelectorAll('.vpar,.vmv')){ if(n===b) break; if(n.classList.contains('vpar')) d+=n.textContent==='('?1:-1 } return d }
  function kids(root,p,main){ p=p||[]; main=main||[]; const out=[], seen=new Set();
    if(pre(p,main)&&main.length>p.length){ const q=main.slice(0,p.length+1); out.push({path:q,el:null}); seen.add(q.join(' ')) }
    if(!root) return out;
    const k=p.join(' '), all=[...root.querySelectorAll('.vmv[data-vp]')], here=k?all.find(b=>b.dataset.vp===k):null, side=[];
    for(const b of all){ const v=b.dataset.vp.split(' ').filter(Boolean); if(v.length!==p.length+1||!pre(p,v)) continue;
      const key=v.join(' '); if(seen.has(key)) continue; seen.add(key); side.push({path:v,el:b}) }
    if(here){   // inside a side line: its own next move comes first (the one at the same bracket depth, after this move)
      const box=here.closest('.vline'), d=depth(here), pos=all.indexOf(here);
      const i=side.findIndex(x=>x.el.closest('.vline')===box&&all.indexOf(x.el)>pos&&depth(x.el)===d);
      if(i>0) side.unshift(side.splice(i,1)[0]) }
    return out.concat(side) }
  /* Where the current move goes in its text box (13 Nov 2026, asked for: "when a move in a variation is clicked I want it at
     the top of the box, so I can read its whole note and the moves after it; the moves before it are already read"):
     follow(el, box?) puts a clicked move (a tap in the last second) at the top of its scrolling box, and a move stepped to
     with the keys there too once it runs past the bottom (or above the top); otherwise the box stays still. With no
     scrolling box (a phone, where the text flows down the page under a pinned board) the page scrolls instead, the move
     going just under the tab bar and any pinned board. clicked() tells a page whether the last move came from a tap. */
  let lastTap=0;
  if(typeof document!=='undefined') document.addEventListener('pointerdown',e=>{ const t=e.target; if(t&&t.closest&&t.closest('.vmv,[data-vp],[data-ply],[data-ci],.gmmv,.gmv,.mv,.cm,.rd-mm')) lastTap=Date.now() },true);
  const clicked=()=>Date.now()-lastTap<1200;
  function scrollBox(el){ for(let b=el&&el.parentElement;b&&b!==document.body;b=b.parentElement){ const cs=getComputedStyle(b);
      if(/(auto|scroll)/.test(cs.overflowY)&&b.scrollHeight>b.clientHeight+2) return b } return null }
  function covered(){ let y=window.TV&&TV.safeTop?TV.safeTop():0; const nv=document.querySelector('nav.tabs'); if(nv){ const r=nv.getBoundingClientRect(); if(r.bottom>y&&r.top<=y+1) y=r.bottom }
    for(const e of document.querySelectorAll('.boardwrap,.rd-boardbox,.boardbox,.tvpin,[data-pinpad]')){ if(!e.offsetParent) continue; const cs=getComputedStyle(e); if(cs.position!=='sticky'&&cs.position!=='fixed') continue;
      const r=e.getBoundingClientRect(); if(r.top<=y+2&&r.bottom>y) y=r.bottom } return y }
  /* 15 Nov 2026 ("the moves don't snap to the right place: the move is cut off and I see only the explanation"): with no
     scrolling box, the current move goes to the top of what can be seen (just under the tab row and a pinned board) when it
     was tapped, when it is above that line, or when it or its note (tail) runs past the bottom bar; the move is never left
     under the board with only its note showing. */
  function follow(el,box,pad,tail){ if(!el) return; pad=pad==null?8:pad; box=box&&box.scrollHeight>box.clientHeight+2?box:scrollBox(el); const r=el.getBoundingClientRect(), tap=clicked();
    if(box){ const q=box.getBoundingClientRect(); if(tap||r.bottom>q.bottom-8||r.top<q.top) box.scrollTop+=r.top-q.top-pad; return }
    const top=covered(), fl=floor(), t=tail&&tail.getBoundingClientRect?tail.getBoundingClientRect():r, bottom=Math.max(r.bottom,t.bottom);
    if(tap||r.top<top+2||bottom>fl-8){ const want=r.top-top-pad; if(Math.abs(want)>2) window.scrollBy(0,want) } }
  /* the bottom edge of what can be seen: the top of a bottom bar fixed over the page (trainview.css .bbar), else the window's */
  function floor(){ let y=innerHeight; for(const e of document.querySelectorAll('.bbar')){ if(!e.offsetParent&&getComputedStyle(e).position!=='fixed') continue; if(getComputedStyle(e).position!=='fixed') continue;
      const r=e.getBoundingClientRect(); if(r.height&&r.top<y) y=r.top } return y }
  /* scroll the box the element is in (never the page) so the element shows */
  function show(el){ const b=scrollBox(el); if(b) follow(el,b) }
  function nav(o){
    let at=null, sel=0, cyc=false;   // the pick: which of the moves after position `at` → plays
    const node=()=>{ if(o.active&&!o.active()) return null; const c=o.cur(); return c?c.slice():null };
    const list=c=>kids(o.root&&o.root(),c,(o.main&&o.main())||[]);
    const reset=()=>{ at=null; sel=0; cyc=false };
    const off=c=>!pre(c,(o.main&&o.main())||[]);
    function paint(){ const r=o.root&&o.root(); if(r) r.querySelectorAll('.vpick').forEach(b=>b.classList.remove('vpick'));
      document.querySelectorAll('.vpick').forEach(b=>b.classList.remove('vpick'));
      const c=node(); if(!c||!cyc||at!==c.join(' ')) return; const ks=list(c), x=ks[sel]; if(!x) return;
      const el=x.el||(o.mainEl&&o.mainEl(c.length)); if(el){ reveal(el); el.classList.add('vpick'); show(el) } }
    function pick(dir){ const c=node(); if(!c) return false; const ks=list(c); if(ks.length<2) return;
      const k=c.join(' '); if(at!==k){ at=k; sel=0 } sel=(sel+dir+ks.length)%ks.length; cyc=true; paint() }
    function right(e){ if(o.active&&!o.active()) return false; const c=node(); if(!c) return o.right?o.right(e):false; const ks=list(c), k=c.join(' ');
      const s=at===k&&cyc?sel:0;
      if(s>0||off(c)){ const x=ks[s]; reset(); if(x) o.go(x.path); return }
      reset(); return o.right?o.right(e):(ks[0]?o.go(ks[0].path):undefined) }
    function left(e){ if(o.active&&!o.active()) return false; const c=node(); reset(); if(c&&c.length&&off(c)){ o.go(c.slice(0,-1)); return } return o.left?o.left(e):(c&&c.length?o.go(c.slice(0,-1)):false) }
    return {paint,reset,keys:{
      ArrowLeft:[o.leftLabel||'Back a move',left],
      ArrowRight:[o.rightLabel||'Forward a move (the picked line where lines branch)',right],
      ArrowDown:['Where lines branch: pick the next line',()=>{ if(o.active&&!o.active()) return false; pick(1) }],
      ArrowUp:['Where lines branch: pick the line before',()=>{ if(o.active&&!o.active()) return false; pick(-1) }]}} }
  return {html,wrap,stack,fold,reveal,prose,path,mark,kids,nav,follow,clicked,covered,floor};
})();
