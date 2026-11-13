/* Shared (Chess Lab and Chess Lab Open). Home: chess-lab-open/site/shared/ (MIT); the private kit pulls a pinned copy.
   Puzzle titles that don't give the idea away (Today, Tactics, Calculation): by default a neutral id; the theme shows
   once the puzzle is done (solved, missed or revealed), or always with Settings → "Show theme in title" (ptheme).
   Puzzles.title(id, theme, done, n) -> text ("Puzzle n" when the caller passes the puzzle's number, else the id);
   Puzzles.num(list, id) -> 1-based place of id in a library array (stable while the library is unchanged; display only,
   progress stays keyed by id); Puzzles.theme(text, done) -> the theme or a "shown when solved" mark. */
window.Puzzles=(()=>{
  const show=()=>{ try{ const v=window.Settings&&Settings.get('ptheme'); return v===true||v==='true' }catch(e){ return false } };
  const nums=new WeakMap();
  const num=(list,id)=>{ if(!Array.isArray(list)) return 0; let m=nums.get(list);
    if(!m||m.size!==list.length){ m=new Map(); list.forEach((z,i)=>{ const k=z&&typeof z==='object'?z.id:z; if(!m.has(k)) m.set(k,i+1) }); nums.set(list,m) }
    return m.get(id)||0 };
  const title=(id,theme,done,n)=>(show()||done)&&theme?theme:'Puzzle '+(n||id);
  const theme=(text,done)=>(show()||done)?(text||'—'):'shown when solved';
  /* Weakest themes (13 Nov 2026), Tactics on both sites: items = [{motif, ok}] for each puzzle done (ok = first try right).
     -> up to 3 {m, n, ok}: themes tried at least 4 times whose first-try rate is below the overall one, worst first.
     weakRow(list, current, name) -> a chip row ("Weakest  Fork 2/7 …"), each button data-wk="<motif>" (the site filters by it). */
  const weak=items=>{ const by={}; let N=0,OK=0;
    for(const x of items||[]){ if(!x||!x.motif) continue; const o=by[x.motif]||(by[x.motif]={m:x.motif,n:0,ok:0}); o.n++; N++; if(x.ok){ o.ok++; OK++ } }
    const avg=N?OK/N:0; return Object.values(by).filter(o=>o.n>=4&&o.ok/o.n<avg).sort((a,b)=>a.ok/a.n-b.ok/b.n||b.n-a.n).slice(0,3) };
  const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const weakRow=(list,cur,name)=>!list||!list.length?'':`<div class="chips tweak" role="group" aria-label="Weakest themes"><span class="flabel">Weak</span>${list.map(o=>
    `<button type="button" class="chip" data-wk="${esc(o.m)}" aria-pressed="${cur===o.m}" title="First try right in ${o.ok} of ${o.n}. Tap to show only this theme (again to clear)">${esc(name(o.m))} <span class="mono">${o.ok}/${o.n}</span></button>`).join('')}</div>`;
  return {show,title,theme,num,weak,weakRow};
})();
