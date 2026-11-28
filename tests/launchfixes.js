/* The 27 Nov 2026 launch fixes (roadmap #273, #274, #271, #281, #398 and the app's #270, #272). */
'use strict';

module.exports=async H=>{
  const {makePage,sleep,assert,section}=H;
  /* a tap on one square, then another (the way a phone moves a piece) */
  const tap=(w,el,sq)=>{ const q=el.querySelector(`.sq[data-sq="${sq}"]`);
    q.dispatchEvent(new w.MouseEvent('pointerdown',{button:0,bubbles:true,clientX:1,clientY:1}));
    el.dispatchEvent(new w.MouseEvent('pointerup',{button:0,bubbles:true,clientX:1,clientY:1})) };
  const tapMove=(w,el,u)=>{ tap(w,el,u.slice(0,2)); tap(w,el,u.slice(2,4)) };

  section('t106: a promotion becomes the piece the exercise expects (roadmap #273)');
  {
    const {w}=await makePage();
    const B=w.Board;
    assert(B.promoFor('e7','e8','q','e7e8n')==='n'&&B.promoFor('e7','e8','q',['a2a3','e7e8r'])==='r','promoFor: the expected piece when the squares match');
    assert(B.promoFor('e7','e8','q','d7d8n')==='q'&&B.promoFor('e7','e8','q',null)==='q'&&B.promoFor('e2','e4',undefined,'e2e4')===undefined,'… and the tap’s own piece otherwise (no promotion stays none)');
    w.location.hash='#tactics'; await w.TacticsTab.ensure(); await sleep(30);
    const T=w.TacticsTab, z=T.lib.find(x=>x.id==='3UYYx'), el=w.document.getElementById('t-board');
    assert(z&&z.moves[z.moves.length-1]==='e7e8n','the knight-promotion tactic is in the set');
    T.load(z); await sleep(30);
    for(let i=1;i<z.moves.length;i+=2){ tapMove(w,el,z.moves[i]); await sleep(i<z.moves.length-1?520:40) }
    const rec=(w.Store.get('tactics-progress')||{})[z.id];
    assert(T.state.solved&&rec&&rec.ok===true,'tapping e7 then e8 solves it with a knight, first try');
    assert(T.state.g.get('e8').type==='n','… and the board shows a knight on e8');
  }
  section('t107: Hint and moves wait while the reply is coming (roadmap #274)');
  {
    const {w}=await makePage();
    w.location.hash='#tactics'; await w.TacticsTab.ensure(); await sleep(30);
    const T=w.TacticsTab, z=T.lib.find(x=>x.rating&&x.moves.length>=4), rec=()=>(w.Store.get('tactics-progress')||{})[z.id];
    T.load(z); await sleep(30);
    const u=z.moves[1]; await T.userMove(u.slice(0,2),u.slice(2,4)); await sleep(10);
    assert(T.state.wait===true,'Tactics: after a right move, the page waits for the reply');
    T.hint(); await sleep(10);
    assert(!T.state.usedHint&&!rec(),'… a Hint pressed then does nothing (it used to read the reply as your move and record a miss)');
    const r=z.moves[2]; await T.userMove(r.slice(0,2),r.slice(2,4)); await sleep(10);
    assert(T.state.step===2,'… and a tap cannot play the reply for them');
    await sleep(500);
    assert(!T.state.wait&&T.state.step===3,'the reply comes, and it is your move again');
    T.hint(); await sleep(10); assert(T.state.usedHint,'Hint works again on your move');
    /* a held letter key acts once */
    const ev=(k,rep)=>w.dispatchEvent(new w.KeyboardEvent('keydown',{key:k,bubbles:true,repeat:!!rep}));
    const z2=T.lib.find(x=>x.rating&&x.moves.length>=4&&x.id!==z.id); T.load(z2); await sleep(30);
    ev('h'); ev('h',true); ev('h',true); await sleep(10);
    assert(T.state.hintStage===1,'a held H gives the first hint only (key repeat is ignored for letter keys)');

  }

  section('t108: Endgames: one result per attempt, and a miss starts the streak again (roadmap #281)');
  {
    const {w}=await makePage();
    w.location.hash='#endgames'; for(let i=0;i<40&&!(w.EndgamesTab.data&&w.EndgamesTab.data.positions.length);i++) await sleep(25);
    const E=w.EndgamesTab, z=E.data.positions[0], p=()=>(w.Store.get('endgame-progress')||{})[z.id];
    E.load(z); E.finish(true,'Checkmate ✓');
    assert(p().ok===true&&p().okN===1&&p().tries===1,'a clean solve: solved, streak 1');
    E.state.hist=[{u:'a1a2',gr:'best',fen:z.fen}]; E.takeBack(); E.finish(true,'Checkmate ✓');
    assert(p().ok===true&&p().okN===1&&p().tries===1,'Take back after it, then solve again: still the clean solve (it used to become a miss)');
    E.load(z); E.finish(true,'Checkmate ✓'); assert(p().okN===2,'the next attempt solved: streak 2');
    E.load(z); E.finish(false,'You were mated.');
    assert(p().ok===false&&p().okN===0&&p().tries===3,'a missed attempt: a miss, and the 3/7/21-day streak starts again');
  }

  section('t109: the engine recovers, and a search that gets no answer is not made up (roadmap #271)');
  {
    const {w}=await makePage();
    /* a stand-in worker: answers 'uci', and a search only when mode is 'answer' */
    let mode='answer', broken=false;
    w.URL.createObjectURL=()=>'blob:sf';
    w.Worker=class{ constructor(){ if(broken) throw new Error('no worker') }
      postMessage(m){ const say=l=>setTimeout(()=>this.onmessage&&this.onmessage({data:l}),1);
        if(m==='uci') say('uciok');
        else if(/^go /.test(m)&&mode==='answer'){ say('info depth 8 multipv 1 score cp 25 pv e2e4'); setTimeout(()=>say('bestmove e2e4'),2) } }
      terminate(){} };
    const E=w.EngineKit.create([['Test','sf.js',null,1000]]);
    const a1=await E.analyse('8/8/8/4k3/8/8/8/4K3 w - - 0 1',8,1,5);
    assert(a1&&a1[0].uci==='e2e4'&&E.ready&&E.restarts===0,'a search answers');
    mode='silent'; const a2=await E.analyse('8/8/8/4k3/8/8/8/3K4 w - - 0 1',8,1,5);
    assert(a2===null&&E.restarts===1&&!E.failed,'no answer: null, and the worker is replaced (one restart)');
    mode='answer'; await sleep(20); const a3=await E.analyse('8/8/8/4k3/8/8/8/2K5 w - - 0 1',8,1,5);
    assert(a3&&E.restarts===0,'the next search that answers resets the count (six over a whole session used to end the engine)');
    broken=true; const F=w.EngineKit.create([['Test','sf.js',null,1000]]); F.start(); await sleep(10);
    assert(F.failed,'an engine that cannot start reports failed');
    broken=false; F.revive(); await sleep(20);
    assert(!F.failed&&F.ready,'revive() starts it again (Settings → Engine → Restart)');

    /* Analyze: a game Stockfish doesn't answer for is not analysed and not cached */
    const game={id:'g-noeval',moves:['e4','e5','Nf3','Nc6','Bb5','a6','Ba4','Nf6'],color:'w',site:'pgn'};
    w.SharedEngine.analyse=async()=>null;
    const evs=await w.AnalyzeTab.evalsFor(game,{games:5,cache:true,mode:'standard'});
    assert(evs===null&&game.evfail&&!w.AnalyzeTab.evCache.raw('g-noeval'),'Analyze: no answer leaves the game unanalysed, with nothing kept (it used to store the previous eval, or 0, and keep it)');

    /* Settings → Engine shows the state and a Restart button */
    w.location.hash='#settings'; await sleep(60);
    if(!w.document.getElementById('s-engine')&&w.SettingsTab) w.SettingsTab.init();
    const row=w.document.getElementById('s-engine');
    assert(row&&/Stockfish/.test(row.textContent),'Settings → Engine has a Stockfish row with its state');
  }

  section('t110: Players, dates, Near my rating, Watch (roadmap #398, #281)');
  {
    const {w}=await makePage();
    /* Players offline: a plain sentence, not the browser's "Load failed" */
    const on=w.Net.online; w.Net.online=()=>false;
    let msg=''; try{ await w.AnalyzeTab.getFrom('lichess','https://lichess.org/api/x','text',{},'You are offline. Players needs the internet.') }catch(e){ msg=e.message+'|'+e.why }
    w.Net.online=on;
    assert(/Players needs the internet/.test(msg)&&/offline$/.test(msg),'getFrom takes the page’s own offline sentence (Players uses it)');
    const src=require('fs').readFileSync(require('path').join(H.SITE,'js/players.js'),'utf8');
    assert(!/await fetch\(/.test(src),'Players fetches only through getFrom (time limit, 429 and offline named)');
    /* the device's own date */
    const d=new Date(2026,10,27,23,30);
    assert(w.localDay(d.getTime())==='2026-11-27','localDay is the date on this device’s calendar, late in the evening too');
    /* Near my rating below the easiest puzzles */
    w.location.hash='#tactics'; await w.TacticsTab.ensure(); await sleep(30);
    w.Store.put('tac-rating',{r:800,n:30}); w.TacticsTab.state.band='near';
    assert(w.TacticsTab.filtered().length>0,'Near my rating at 800 still lists puzzles (the window stays inside the set)');
    /* Watch: the two starter videos are lectures */
    const wsrc=require('fs').readFileSync(require('path').join(H.SITE,'js/watch.js'),'utf8');
    assert(!/kind:'(speedrun|game)'/.test(wsrc),'Watch: no starter video has a kind the filters don’t know');
  }
};
