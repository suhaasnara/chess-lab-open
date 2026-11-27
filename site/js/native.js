/* Think Ahead — its parts of the iPhone and Apple Watch app (the machinery: shared/native.js). On the website
   Native.app is false and nothing below changes anything: no board, store or page is touched.

   Reminder counters (read only): Drills, Blunder check, Endgames and Blind tactics, the four sections with a review
   schedule (Due.spaced: a miss the next day, a solve after 3, 7, 21 days). Openings' review queue has no due dates (its
   positions wait until replayed), so it is not counted; Tactics and Calculation have no reviews.

   The Apple Watch sets (docs/01-design.md in the app repo): 'tactic', 'calc', 'blind'. A result from the watch is
   recorded by the tab's own code, as if it had been solved on this page: TacticsTab.saveResult, CalcTab.record,
   BlindTactics.record. state() is what the watch should know: the records of the three sets and the ratings. */
'use strict';
(function(){
const progress=k=>Store.get(k)||{};
const spacedCount=(prog,at,ids)=>Object.entries(prog).filter(([id,r])=>(!ids||ids.has(id))&&Due.spaced(r,at)).length;

Due.add('drills',at=>spacedCount(progress('adrills-progress'),at,new Set((Store.get('adrills')||[]).filter(d=>d.kind!=='punish').map(d=>d.id))));
Due.add('blundercheck',at=>spacedCount(progress('bc-progress'),at,new Set((Store.get('abc')||[]).map(d=>d.id))));
Due.add('endgames',at=>spacedCount(progress('endgame-progress'),at));
Due.add('blind',at=>spacedCount(progress('blind-progress'),at));

/* ---- the watch ---- */
const clamp01=x=>Math.max(0,Math.min(1,+x||0));
WatchSets.add('tactic',{
  async apply(r){ await TacticsTab.ensure(); TacticsTab.saveResult(String(r.id),!!r.ok,+r.at||Date.now()) },
  state(){ const p=progress('tactics-progress'), recs={}; for(const id in p) recs[id]=[p[id].ok?1:0,p[id].t||0];
    const rt=Store.get('tac-rating')||{r:1500,n:0}; return {recs,tac:{r:rt.r,n:rt.n}} }
});
WatchSets.add('calc',{
  async apply(r){ CalcTab.record(String(r.id),clamp01(r.score),r.secs,+r.at||Date.now()) },
  state(){ const p=progress('calc-progress'), recs={}; for(const id in p) recs[id]=[p[id].score||0,p[id].t||0,p[id].tries||0]; return {recs} }
});
let blindLib=null;
const blindPuzzle=async id=>{ if(!blindLib) blindLib=fetch(Site.url('blind')).then(r=>r.json()).then(l=>new Map(l.map(z=>[z.id,z]))).catch(e=>{ blindLib=null; throw e });
  return (await blindLib).get(id)||{id} };
WatchSets.add('blind',{
  /* Peek on the watch counts as on this page: assisted, scored as a miss */
  async apply(r){ const z=await blindPuzzle(String(r.id));
    BlindTactics.record({get:k=>Store.get(k),put:(k,v)=>Store.put(k,v)},z,!!r.ok&&!r.peek&&!r.gaveUp,{h:+r.plies||0,assisted:!!r.peek,at:+r.at||Date.now()});
    if(document.body.dataset.view==='progress') ProgressTab.render() },
  state(){ const p=progress('blind-progress'), recs={}; for(const id in p) recs[id]=[p[id].n||0,p[id].ok?1:0,p[id].okN||0,p[id].t||0];
    const rt=Store.get('blind-rating')||{}, s=Object.assign({},BlindTactics.DEF,Settings.get('blind')||{});
    return {recs,blind:{r:rt.r||1500,n:rt.n||0},settings:{plies:s.plies,auto:!!s.auto}} }
});

/* ---- the app's name, storage, backup and first-launch card ---- */
const EPHEMERAL=new Set(['today','watch-applied']);   /* written on every visit, or bookkeeping: not "progress" */
const hasProgress=o=>Object.keys(o).some(k=>k[0]!=='_'&&!EPHEMERAL.has(k));
Native.start({
  name:'Think Ahead', cfgKey:'clo-app',
  store:{get:k=>Store.get(k),put:(k,v)=>Store.put(k,v)},
  exportAll:()=>Store.exportAll(), importAll:o=>Store.importAll(o),
  isEmpty:()=>!hasProgress(Store.exportAll()),
  describe:b=>{ const n=k=>Object.keys((b&&b[k])||{}).length, puz=n('tactics-progress')+n('calc-progress')+n('blind-progress'), dr=((b&&b.adrills)||[]).length;
    return [puz?puz+(puz===1?' puzzle':' puzzles'):'',dr?dr+(dr===1?' drill':' drills'):''].filter(Boolean).join(', ')||'your settings and lists' },
  about:'#about',
  reminder:[{k:'drills',one:'drill',many:'drills',hash:'#drills'},{k:'blind',one:'Blind tactic',many:'Blind tactics',hash:'#blind'},
    {k:'endgames',one:'endgame',many:'endgames',hash:'#endgames'},{k:'blundercheck',one:'Blunder check',many:'Blunder checks',hash:'#blundercheck'}],
  welcome:d=>['Everything works offline.',`Your progress stays on this ${d.name}${d.watch?' (and your Apple Watch)':''} and is backed up in Files.`,
    'Nothing is sent anywhere, except what you fetch yourself: your games from Lichess or Chess.com.'],
  /* one welcome (26 Nov 2026, roadmap #288): the lines go into Today's "New here?" card, when it is showing, instead of a
     sheet on top of it */
  welcomeInline:lines=>{ const el=document.getElementById('welcome-app'); if(!el||!window.TodayTab||!TodayTab.isNew()) return false;
    el.textContent=lines.join(' '); el.hidden=false; return true },
});

/* in the app only: every board's right / wrong flash also taps or buzzes (Openings, Tactics, Drills, Endgames, Blunder
   check, Guess the move all judge moves through board.flash), and any change to progress counts toward "a session" (the
   backup when the app is left, and the one-time reminder question) */
if(Native.app){
  const mb=window.makeBoard;
  window.makeBoard=function(el,opts){ const b=mb(el,opts), f=b.flash;
    b.flash=function(squares,tone){ Native.verdict(tone); return f.apply(this,arguments) }; return b };
  const put=Store.put;
  Store.put=(k,v)=>{ put(k,v); if(!EPHEMERAL.has(k)) Native.changed() };
}
})();
