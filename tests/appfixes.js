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

  const {fakeApp}=require('./native');
  const calls=(log,p,f)=>log.filter(x=>x[0]===p&&(!f||x[1]===f));
  const APP={'clo-app':JSON.stringify({welcomed:true,asked:true})};

  section('t97: in the app, Export progress, Review on Lichess and Print work (roadmap #267)');
  { const log=[]; const {w}=await makePage({beforeLoad:fakeApp(log,{localStorage:APP})}); await sleep(100);
    w.Store.put('tactics-progress',{a:{ok:true,t:1}});
    let clicked=0; w.HTMLAnchorElement.prototype.click=function(){ clicked++ };
    w.location.hash='#progress'; await sleep(60);
    w.document.getElementById('p-export').click(); await sleep(50);
    const wr=calls(log,'FS','write').pop(), name='think-ahead-progress-'+new Date().toISOString().slice(0,10)+'.json';
    assert(wr&&wr[2].path===name&&wr[2].directory==='DOCUMENTS'&&JSON.parse(wr[2].data)['tactics-progress'].a.ok===true&&!clicked,'Export writes the progress file to Files (the web view has no downloads; a link’s download did nothing)');
    assert(w.document.getElementById('p-note').textContent===`Saved to Files → On My iPhone → Think Ahead → ${name}.`,'… and says where it is');
    /* Review on Lichess: no window opened at the tap (the app has no tabs); the game goes to Safari once imported */
    let opened=0, went=null; w.open=()=>{ opened++; return null }; w.Native.go=u=>{ went=u };
    w.fetch=async()=>({ok:true,status:200,json:async()=>({url:'https://lichess.org/AbCdEf12'})});
    const r=await w.Net.review('1. e4 e5 *');
    assert(r.ok&&went==='https://lichess.org/AbCdEf12'&&!opened,'Review on Lichess opens the imported game in Safari (a window opened after the import was blocked)');
    w.fetch=async()=>{ throw new Error('offline') };
    await w.Net.review('1. e4 e5 *');
    assert(went==='https://lichess.org/paste'&&!opened,'… and Lichess’s paste page when the import fails');
    assert(w.Native.openExternal('http://example.com/')===false&&w.Native.openExternal('javascript:alert(1)')===false,'only https pages are handed over');
    assert(!w.Native.canPrint()&&await w.Native.print()===false,'an app without the print method: Print isn’t offered to it (the old window.print path) ');
  }
  { const log=[]; const {w}=await makePage({beforeLoad:fakeApp(log,{print:true,localStorage:APP})}); await sleep(100);
    assert(w.Native.canPrint()&&await w.Native.print()===true&&calls(log,'WB','print').length===1,'with the app’s print method: Native.print() shows iOS’s print sheet (WatchBridge.print)'); }
  { const {w}=await makePage();
    let opened=0; const fake={location:''}; w.open=()=>{ opened++; return fake };
    w.fetch=async()=>({ok:true,status:200,json:async()=>({url:'https://lichess.org/XyZ'})});
    await w.Net.review('1. e4 *');
    assert(opened===1&&fake.location==='https://lichess.org/XyZ'&&!w.Native.canPrint()&&w.Native.saveFile&&w.Native.openExternal('https://x.org')===false,'the website is unchanged: the tab opens at the tap, then goes to the game; nothing is saved or handed over'); }
};
