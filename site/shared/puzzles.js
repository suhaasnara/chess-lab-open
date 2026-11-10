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
  return {show,title,theme,num};
})();
