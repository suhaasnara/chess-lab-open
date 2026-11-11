/* Shared (Chess Lab and Chess Lab Open). Home: chess-lab-open/site/shared/ (MIT); the private kit pulls a pinned copy.
   Side lines you can click through on the board (Guess the move, Calculation, a drill's best line …), Lichess-study style.

   VarLine.html(fen, text, prefix)  a side line written as text, played from fen, as HTML: every legal move is a button,
                                    the rest stays text (notes, signs, a book's prose). Nested lines in brackets start from
                                    the position before the move they replace. prefix = the SAN moves that lead from the
                                    host's start to fen (e.g. the main line up to the branch); each button carries
                                    prefix + its own moves (data-vp, space-separated SAN).
   VarLine.path(el)                 the SAN path of a clicked move button (or null): the host plays it from its start.
   VarLine.mark(root, path)         marks the button whose path is `path` (array of SAN) as current; returns it.
   VarLine.wrap(fen, text, prefix)  html() inside <div class="vline">( … )</div>, the block the hosts put under a move.
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
  function html(fen,text,prefix){
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
    const clean=w=>{ const w2=w.replace(/[,;:.]+$/,''), mk=(w2.match(/[!?]+$/)||[''])[0], core=w2.slice(0,w2.length-mk.length).replace(/^0-0-0/,'O-O-O').replace(/^0-0/,'O-O'); return {mk,core,ok:SAN.test(core)} };
    const play=(fen,core)=>{ try{ const g=new Chess(fen); const m=g.move(core,{sloppy:true}); return m?{g,m}:null }catch(e){ return null } };
    const tryMove=(word,n,black,next)=>{
      const {mk,core,ok}=clean(word); if(!ok) return false;
      if(n!=null){   // the latest point of the line with move n to play where it is legal (and the move after it too, when one follows)
        const c=cur.all.filter(x=>{ const p=x.fen.split(' '); return +p[5]===n&&(p[1]==='b')===!!black }).reverse();
        const legal=c.filter(x=>play(x.fen,core)), pick=legal.find(x=>{ if(!next) return true; const r=play(x.fen,core); return !!play(r.g.fen(),next) })||legal[0];
        if(!pick&&!revive(n,black,core)){ cur.need=true; put(word,'vdead vill'); return true }   // no point of the line fits it: not played
        if(!pick){ cur.need=false; return tryMove(word,null,null) }
        if(pick!==cur.stops[cur.stops.length-1]){ cur.stops=pick.chain.slice(); cur.g=new Chess(pick.fen); cur.path=pick.path.slice(); cur.fresh=true }
        cur.need=false }
      if(cur.need){ cur.skip={i:out.length,core,mk,at:cur.stops.length}; put(word,'vdead'); return true }
      const before=cur.g.fen(), p=before.split(' '), white=p[1]==='w', mv=+p[5]||1;
      let m=null; try{ m=cur.g.move(core,{sloppy:true}) }catch(e){ m=null }
      if(!m){ cur.need=true; put(word,'vdead vill'); return true }
      out.push(push(m,white,mv,mk)); return true };
    function push(m,white,mv,mk){ cur.path.push(m.san); const st={fen:cur.g.fen(),path:cur.path.slice()}; cur.stops.push(st); st.chain=cur.stops.slice(); cur.all.push(st);
      const label=(white?mv+'.':cur.fresh?mv+'…':'')+m.san+mk; cur.fresh=false; cur.skip=null;
      return `<button type="button" class="vmv" data-vp="${esc(cur.path.join(' '))}">${esc(label)}</button>` }
    /* "playing Bc5 14.Re1", "Ng4 Black exploits … 9.Nxc6": a move left as text after prose is played after all when the
       numbered move that follows only fits after it */
    function revive(n,black,core){ const k=cur.skip; if(!k||k.at!==cur.stops.length) return false;
      const before=cur.g.fen(), r=play(before,k.core); if(!r) return false; const p=r.g.fen().split(' ');
      if(+p[5]!==n||(p[1]==='b')!==!!black||!play(r.g.fen(),core)) return false;
      const b=before.split(' '); cur.g=r.g; out[k.i]=push(r.m,b[1]==='w',+b[5]||1,k.mk); cur.fresh=true; return true }
    /* "a)", "b)" … label a book's options; they are not brackets */
    const src=String(text||'').replace(/(^|\s)([a-z])\)(?=\s|$)/g,'$1$2');
    const toks=src.match(TOK)||[];
    const nextMove=i=>{ for(let k=i+1;k<toks.length;k++){ const t=toks[k]; if(NUM.test(t)||/^(\.{2,3}|…)$/.test(t)) continue;
        const mm=NUMMOVE.exec(t), c=clean(mm?mm[3]:t); return c.ok?c.core:null } return null };
    toks.forEach((t,i)=>{
      if(t[0]===''){ put(t.slice(1)+')','vnote'); cur.fresh=true; return }
      if(t[0]==='{'){ const c=t.slice(1,-1).trim(); if(c) put(c,'vnote'); cur.fresh=true; num=null; return }
      if(t==='('){ stack.push(cur); out.push('<span class="vpar">(</span>');
        const pool=cur.stops.slice(); cur=line(pool.slice(0,Math.max(1,pool.length-1)),cur.all); num=null; return }
      if(t===')'){ if(stack.length){ out.push('<span class="vpar">)</span>'); cur=stack.pop(); cur.fresh=true } else put(t); num=null; return }
      let m=NUM.exec(t);
      if(m){ if(num) put(num.t); num={n:+m[1],black:!!m[2]&&m[2]!=='.',t}; return }
      if(num&&/^(\.{2,3}|…)$/.test(t)){ num.black=true; num.t+=' '+t; return }
      m=NUMMOVE.exec(t);
      if(m&&tryMove(m[3],+m[1],m[2]!=='.',nextMove(i))){ num=null; return }
      if(num){ const n=num; num=null; if(tryMove(t,n.n,n.black,nextMove(i))) return; put(n.t) }
      if(tryMove(t,null,null)) return;
      if(SIGN.test(t.replace(/[,;:.]+$/,''))){ put(t,'vnote'); return }
      put(t,'vtext'); cur.need=true; cur.fresh=true;   // prose: the line goes on only at a numbered move
    });
    if(num) put(num.t);
    while(stack.length){ out.push('<span class="vpar">)</span>'); stack.pop() }
    return out.join(' ');
  }
  const wrap=(fen,text,prefix)=>`<div class="vline"><span class="vpar">(</span>${html(fen,text,prefix)}<span class="vpar">)</span></div>`;
  function path(el){ const b=el&&el.closest&&el.closest('.vmv[data-vp]'); return b?b.dataset.vp.split(' ').filter(Boolean):null }
  function mark(root,p){ if(!root) return null; const k=p&&p.length?p.join(' '):null; let hit=null;
    root.querySelectorAll('.vmv.cur').forEach(b=>b.classList.remove('cur'));
    if(k) root.querySelectorAll('.vmv[data-vp]').forEach(b=>{ if(!hit&&b.dataset.vp===k){ b.classList.add('cur'); hit=b } });
    return hit }
  /* ---------- keyboard: the tree of lines ---------- */
  const same=(a,b)=>a.length===b.length&&a.every((x,i)=>x===b[i]);
  const pre=(p,m)=>p.length<=m.length&&p.every((x,i)=>x===m[i]);
  /* how deep in brackets a button sits inside its .vline (0 = the line itself) */
  function depth(b){ const box=b.closest('.vline'); if(!box) return 0; let d=0;
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
  /* scroll the box the element is in (never the page) so the element shows */
  function show(el){ for(let b=el&&el.parentElement;b&&b!==document.body;b=b.parentElement){ const cs=getComputedStyle(b);
      if(/(auto|scroll)/.test(cs.overflowY)&&b.scrollHeight>b.clientHeight){ const r=el.getBoundingClientRect(), q=b.getBoundingClientRect();
        if(r.top<q.top) b.scrollTop+=r.top-q.top-8; else if(r.bottom>q.bottom) b.scrollTop+=r.bottom-q.bottom+8; return } } }
  function nav(o){
    let at=null, sel=0, cyc=false;   // the pick: which of the moves after position `at` → plays
    const node=()=>{ if(o.active&&!o.active()) return null; const c=o.cur(); return c?c.slice():null };
    const list=c=>kids(o.root&&o.root(),c,(o.main&&o.main())||[]);
    const reset=()=>{ at=null; sel=0; cyc=false };
    const off=c=>!pre(c,(o.main&&o.main())||[]);
    function paint(){ const r=o.root&&o.root(); if(r) r.querySelectorAll('.vpick').forEach(b=>b.classList.remove('vpick'));
      document.querySelectorAll('.vpick').forEach(b=>b.classList.remove('vpick'));
      const c=node(); if(!c||!cyc||at!==c.join(' ')) return; const ks=list(c), x=ks[sel]; if(!x) return;
      const el=x.el||(o.mainEl&&o.mainEl(c.length)); if(el){ el.classList.add('vpick'); show(el) } }
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
  return {html,wrap,path,mark,kids,nav};
})();
