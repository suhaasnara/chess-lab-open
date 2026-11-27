/* The 26 Nov 2026 app batch (roadmap rows #260, #267, #268): the parts of them that live in Open. */
'use strict';

module.exports=async H=>{
  const {makePage,sleep,assert,section}=H;

  section('t96: Tactics rates only the first try at each puzzle; a watch result keeps its own time (roadmap #260)');
  {
    const {w}=await makePage();
    w.location.hash='#tactics'; await w.TacticsTab.ensure(); await sleep(30);
    const T=w.TacticsTab, lib=T.lib, rt=()=>w.Store.get('tac-rating')||{r:1500,n:0}, rec=id=>(w.Store.get('tactics-progress')||{})[id];
    const [a,b]=lib.filter(z=>z.rating&&z.moves.length===2);
    const d1=T.saveResult(a.id,true,1000);
    const r1=rt();
    assert(r1.n===1&&d1===r1.r-1500&&rec(a.id).ok===true&&rec(a.id).t===1000,'the first try at a puzzle is rated ('+r1.r+')');
    const d2=T.saveResult(a.id,true,2000);
    assert(d2===null&&rt().r===r1.r&&rt().n===1,'solving it again doesn’t move the rating (it went up each time: 1500 to 1596 in three solves)');
    assert(rec(a.id).t===2000&&(w.Store.get('tac-history')||[]).length===1,'… but the record follows the newer try, and the history has one point');
    T.saveResult(a.id,false,3000);
    assert(rec(a.id).ok===false&&rt().n===1,'a later miss shows it as Missed, still without a rating change');
    T.saveResult(a.id,true,2500);
    assert(rec(a.id).ok===false&&rec(a.id).t===3000,'an older result (a watch result arriving late) never overwrites a newer one');
    T.saveResult(b.id,false);
    assert(rt().n===2&&Math.abs(rec(b.id).t-Date.now())<5000,'without a time, now (the page’s own tries)');
    /* the numbers the watch's Swift tests use (ThinkAheadKit SyncTests): Open's own results for this sequence */
    console.log('    [for the watch] '+JSON.stringify({a:{id:a.id,rating:a.rating},b:{id:b.id,rating:b.rating},rating:rt(),recs:{[a.id]:rec(a.id),[b.id]:{ok:rec(b.id).ok}}}));
    /* on the board: a puzzle tried before, solved first try, says why the rating didn't move */
    T.load(a); await sleep(30);
    const e=a.moves[T.state.step]; await T.userMove(e.slice(0,2),e.slice(2,4),e[4]); await sleep(30);
    assert(/only your first try at a puzzle is rated/.test(w.document.getElementById('t-status-box').textContent)&&rt().n===2,'replaying a puzzle: “Solved!”, and it says only the first try is rated');
  }
};
