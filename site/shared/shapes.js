/* Shared (Chess Lab and Chess Lab Open). Home: chess-lab-open/site/shared/ (MIT); the private kit pulls a pinned copy.
   Needs nothing from either site: only boards made of .board > .sq[data-sq] (> .pc). */
/* ---------- Arrows and circles, Lichess style, on every board ----------
   Right-click a square for a circle, right-drag to another square for an arrow: plain = green (Settings can change it), Shift = red,
   Alt (or Ctrl / Cmd) = blue, Shift+Alt = yellow; drawing the same shape again removes it. A left click on the
   board, or a new position, clears what you drew. A tab shows a PGN's own [%cal]/[%csl] shapes with
   Shapes.auto(boardEl, "Ge2e4 Rd4d5 Yd4"); they stay until the position changes.
   Drawn on an SVG laid over the board; a MutationObserver puts it back after each redraw. Squares are read from
   data-sq, so either orientation works. Touch screens have no right click: there, only a PGN's shapes show. */
window.Shapes=(()=>{
  const NS='http://www.w3.org/2000/svg', COL={G:'#15803d',R:'#c2410c',B:'#1d4ed8',Y:'#ca8a04'};
  const st=new WeakMap(), S=el=>{ let o=st.get(el); if(!o){ o={user:[],auto:[],sig:null,asig:null,tmp:null}; st.set(el,o) } return o };
  const parse=s=>String(s||'').split(/[\s,]+/).map(t=>{ const m=t.match(/^([GRBY])([a-h][1-8])([a-h][1-8])?$/); return m?{c:m[1],a:m[2],b:m[3]&&m[3]!==m[2]?m[3]:null}:null }).filter(Boolean);
  const sigOf=el=>{ const a=[]; el.querySelectorAll('.sq').forEach(q=>{ const p=q.querySelector('.pc'); if(p) a.push(q.dataset.sq+p.className) }); return a.sort().join('|') };
  const same=(x,y)=>x.a===y.a&&x.b===y.b;
  function pos(el){ const q=el.querySelector('.sq[data-sq]'), white=!q||q.dataset.sq==='a8';
    return sq=>{ const f=sq.charCodeAt(0)-97, r=+sq[1]-1; return white?[f+.5,7.5-r]:[7.5-f,r+.5] } }
  function shape(p,x,op){ const col=COL[x.c]||COL.G, [ax,ay]=p(x.a);
    if(!x.b) return `<circle cx="${ax}" cy="${ay}" r=".44" fill="none" stroke="${col}" stroke-width=".075" opacity="${op}"/>`;
    const [bx,by]=p(x.b), dx=bx-ax, dy=by-ay, L=Math.hypot(dx,dy), ux=dx/L, uy=dy/L, h=.42, w=.24, tx=bx-ux*.12, ty=by-uy*.12, sx=tx-ux*h, sy=ty-uy*h;
    return `<g opacity="${op}" fill="${col}" stroke="${col}"><line x1="${ax+ux*.18}" y1="${ay+uy*.18}" x2="${sx+ux*.02}" y2="${sy+uy*.02}" stroke-width=".16" stroke-linecap="round"/>`+
      `<polygon stroke="none" points="${tx},${ty} ${sx-uy*w},${sy+ux*w} ${sx+uy*w},${sy-ux*w}"/></g>` }
  function draw(el){ const o=S(el), s=sigOf(el);
    if(o.sig!==null&&s!==o.sig) o.user=[]; o.sig=s; if(o.asig!==null&&s!==o.asig){ o.auto=[]; o.asig=null }
    let svg=null; for(const c of el.children) if(c.tagName.toLowerCase()==='svg'&&c.classList.contains('shapes')) svg=c;
    const list=[...o.auto.map(x=>[x,.72]),...o.user.map(x=>[x,.82])]; if(o.tmp) list.push([o.tmp,.5]);
    if(!list.length){ if(svg) svg.remove(); return }
    if(!svg){ svg=document.createElementNS(NS,'svg'); svg.setAttribute('class','shapes'); svg.setAttribute('viewBox','0 0 8 8'); svg.setAttribute('aria-hidden','true'); el.appendChild(svg) }
    const p=pos(el); svg.innerHTML=list.map(([x,op])=>shape(p,x,op)).join('') }
  function auto(el,s){ if(!el) return; const o=S(el); o.auto=parse(s); o.asig=o.auto.length?sigOf(el):null; draw(el) }
  function clear(el){ const o=st.get(el); if(o&&(o.user.length||o.tmp)){ o.user=[]; o.tmp=null; draw(el) } }
  /* Firefox always opens its menu on Shift+right-click, so the colour a plain right-click draws is a setting
     (Settings.get('shapeColor'): G, R, B or Y; default green). Shift / Alt / Shift+Alt still pick red / blue / yellow. */
  const plain=()=>{ try{ const c=window.Settings&&Settings.get('shapeColor'); return /^[GRBY]$/.test(c||'')?c:'G' }catch(e){ return 'G' } };
  const colorOf=e=>e.shiftKey&&(e.altKey||e.ctrlKey||e.metaKey)?'Y':e.shiftKey?'R':(e.altKey||e.ctrlKey||e.metaKey)?'B':plain();
  const sqAt=(el,e)=>{ const t=document.elementFromPoint(e.clientX,e.clientY); const q=t&&t.closest&&t.closest('.sq'); return q&&el.contains(q)?q.dataset.sq:null };
  const boardOf=t=>t&&t.closest?t.closest('.board'):null;
  let dr=null;
  /* no browser menu on a board (Ctrl+click on a Mac is a right click too) */
  document.addEventListener('contextmenu',e=>{ if(boardOf(e.target)||dr) e.preventDefault() },true);
  document.addEventListener('pointerdown',e=>{ const el=boardOf(e.target); if(!el) return;
    if(e.button===2){ const a=sqAt(el,e); if(!a) return; e.preventDefault(); e.stopPropagation(); dr={el,a,c:colorOf(e)}; return }
    if(e.button===0&&!(e.ctrlKey&&/Mac/.test(navigator.platform))) clear(el) },true);
  document.addEventListener('pointermove',e=>{ if(!dr) return; const b=sqAt(dr.el,e); const o=S(dr.el), t=b&&b!==dr.a?{c:dr.c,a:dr.a,b}:null;
    if(JSON.stringify(t)!==JSON.stringify(o.tmp)){ o.tmp=t; draw(dr.el) } },true);
  document.addEventListener('pointerup',e=>{ if(!dr||e.button!==2) return; e.stopPropagation(); const d=dr; dr=null; const o=S(d.el); o.tmp=null;
    const b=sqAt(d.el,e), x={c:d.c,a:d.a,b:b&&b!==d.a?b:null}, i=o.user.findIndex(y=>same(x,y));
    if(i>=0){ const was=o.user[i].c; o.user.splice(i,1); if(was!==x.c) o.user.push(x) } else o.user.push(x); draw(d.el) },true);
  /* Redraws replace the board's squares (and with them the SVG): put it back, and drop shapes when the position changed. */
  const mo=new MutationObserver(rs=>{ const els=new Set(); for(const r of rs){ const t=r.target; if(t.classList&&t.classList.contains('board')&&[...r.addedNodes].some(n=>n.classList&&n.classList.contains('sq'))) els.add(t) } els.forEach(el=>{ if(st.has(el)) draw(el) }) });
  const start=()=>mo.observe(document.body,{childList:true,subtree:true});
  if(document.body) start(); else document.addEventListener('DOMContentLoaded',start);
  return {auto,clear,parse,draw,state:el=>st.get(el)};
})();
