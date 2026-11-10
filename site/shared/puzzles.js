/* Shared (Chess Lab and Chess Lab Open). Home: chess-lab-open/site/shared/ (MIT); the private kit pulls a pinned copy.
   Puzzle titles that don't give the idea away (Today, Tactics, Calculation): by default a neutral id; the theme shows
   once the puzzle is done (solved, missed or revealed), or always with Settings → "Show theme in title" (ptheme).
   Puzzles.title(id, theme, done) -> text; Puzzles.theme(text, done) -> the theme or a "shown when solved" mark. */
window.Puzzles=(()=>{
  const show=()=>{ try{ const v=window.Settings&&Settings.get('ptheme'); return v===true||v==='true' }catch(e){ return false } };
  const title=(id,theme,done)=>(show()||done)&&theme?theme:'Puzzle '+id;
  const theme=(text,done)=>(show()||done)?(text||'—'):'shown when solved';
  return {show,title,theme};
})();
