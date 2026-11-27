/* Tests for the app layer (shared/native.js + js/native.js): nothing changes on the website; inside the app (fake
   Capacitor plugins that record every call) the Settings card, the first-launch card, the reminder question asked in
   context, haptics, the reminder plan, the Apple Watch sync (duplicates, unknown types, out-of-order results, the state
   sent back) and the backup and restore. */
'use strict';
const fs=require('fs'), path=require('path');

function fakeApp(log,opts={}){
  const call=(plugin,fn,ret)=>async a=>{ log.push([plugin,fn,a]); return typeof ret==='function'?ret(a):ret };
  const listeners={};
  let pending=opts.pending||[];
  let perm=opts.perm||'prompt';
  const files=opts.files||{};
  return w=>{
    w.Capacitor={isNativePlatform:()=>true,Plugins:{
      Haptics:{impact:call('Haptics','impact'),notification:call('Haptics','notification')},
      LocalNotifications:{checkPermissions:call('LN','check',()=>({display:perm})),requestPermissions:call('LN','request',()=>{ perm='granted'; return {display:perm} }),
        schedule:call('LN','schedule'),cancel:call('LN','cancel'),addListener:(e,f)=>{ listeners[e]=f }},
      Filesystem:{writeFile:call('FS','write',a=>{ files[a.path]=a.data; return {} }),readFile:call('FS','read',a=>{ if(!(a.path in files)) throw new Error('missing'); return {data:files[a.path]} }),
        rename:call('FS','rename',a=>{ files[a.to]=files[a.from]; delete files[a.from]; return {} })},
      WatchBridge:{status:call('WB','status',()=>opts.watch||{paired:true,installed:true}),getPending:call('WB','getPending',()=>({results:pending})),
        ack:call('WB','ack',a=>{ pending=pending.filter(r=>!a.rids.includes(r.rid)); return {} }),sendState:call('WB','sendState',()=>({sent:true})),addListener:(e,f)=>{ listeners[e]=f }},
    }};
    if(opts.print) w.Capacitor.Plugins.WatchBridge.print=call('WB','print',()=>({printed:true}));
    if(opts.localStorage) for(const k in opts.localStorage) w.localStorage.setItem(k,opts.localStorage[k]);
    w.__files=files; w.__listeners=listeners; w.__setPending=p=>{ pending=p };
  };
}

module.exports=async function(H){
  const {makePage,sleep,assert,section}=H;
  const calls=(log,p,f)=>log.filter(x=>x[0]===p&&(!f||x[1]===f));

  section('app layer: the website is unchanged');
  { const {w}=await makePage(); const d=w.document;
    assert(w.Native.app===false&&d.getElementById('appbox').hidden,'outside the app: Native.app is false and the iPhone app card stays hidden');
    assert(!/changed/.test(String(w.Store.put))&&!/verdict/.test(String(w.makeBoard)),'… Store.put and makeBoard are the site’s own (nothing wrapped)');
    await sleep(300); assert(!d.getElementById('app-sheet')&&!d.documentElement.classList.contains('in-app'),'… no card over the page, no in-app class');
    w.Native.verdict('good'); assert(true,'… Native.verdict does nothing (no plugin, no error)');
    assert(w.SharedEngine.sources.length===3&&/unpkg/.test(w.SharedEngine.sources[1]),'… the website keeps its engine fallbacks (unpkg, cdnjs)'); }

  section('app layer: first launch, Settings card, the reminder asked in context');
  { const log=[]; const {w}=await makePage({beforeLoad:fakeApp(log)}); const d=w.document;
    await sleep(100);
    /* one welcome, then a board (26 Nov 2026, roadmap #288): the app's lines go into Today's "New here?" card, no sheet on top */
    const card=d.getElementById('welcome'), wa=d.getElementById('welcome-app');
    assert(!d.getElementById('app-sheet')&&!card.hidden&&!wa.hidden&&/works offline/.test(wa.textContent)&&/backed up in Files/.test(wa.textContent),'the first launch: one welcome, the "New here?" card with the app’s lines (it was a sheet over the card)');
    assert(JSON.parse(w.localStorage.getItem('clo-app')).welcomed===true,'… once and for all');
    assert(/html\.in-app \.hero\{display:none\}/.test(fs.readFileSync(path.join(H.SITE,'style.css'),'utf8')),'… and no website header inside the app (its links leave the app; it pushed the first board down)');
    w.TodayTab.items(); w.document.getElementById('welcome-try').click(); await sleep(50);
    assert(/Tap a piece, then a square/.test(d.getElementById('t-status-box').textContent),'Just try a puzzle: the very first puzzle says how to move');
    const box=d.getElementById('appbox');
    assert(!box.hidden&&/iPhone app/.test(box.textContent)&&/Apple Watch/.test(box.textContent)&&/Backup/.test(box.textContent),'Settings shows the iPhone app card: vibration, reminder, Apple Watch, backup');
    assert(d.documentElement.classList.contains('in-app'),'… and the page knows it is in the app');
    assert(JSON.stringify(w.SharedEngine.sources)==='["Stockfish 18 lite"]','in the app only the bundled Stockfish is used: no code is ever downloaded (App Review 2.5.2)');
    await sleep(3300);
    assert(calls(log,'LN','request').length===0&&calls(log,'LN','check').length>0,'no notification prompt at launch (only a check)');
    w.Store.put('tactics-progress',{a:{ok:true,t:Date.now()}}); w.Store.put('tactics-progress',{a:{ok:true,t:Date.now()}}); w.Store.put('tac-rating',{r:1510,n:1});
    await sleep(1700);
    const q=d.getElementById('app-sheet');
    assert(q&&/Want a reminder/.test(q.textContent),'after the first few results it asks once whether to remind (sketch P3)');
    q.querySelector('button[data-a="yes"]').click(); await sleep(50);
    assert(calls(log,'LN','request').length===1,'… Remind me shows iOS’s own prompt');
    w.Store.put('x-test',1); w.Store.put('x-test',2); w.Store.put('x-test',3); await sleep(1700);
    assert(!d.getElementById('app-sheet'),'… and never asks again');
    const b=w.makeBoard(d.createElement('div'),{}); b.flash(['e2','e4'],'bad');
    assert(calls(log,'Haptics','notification').some(x=>x[2].type==='ERROR'),'a wrong move on any board buzzes (board.flash)');
    await sleep(300); b.flash(['e2','e4'],'good');
    assert(calls(log,'Haptics','impact').some(x=>x[2].style==='LIGHT'),'… a right one taps');
    box.querySelector('button[data-ak="haptics"][data-v="false"]').click(); const n=calls(log,'Haptics').length; await sleep(300); b.flash(['e2'],'bad');
    assert(calls(log,'Haptics').length===n,'… nothing when vibration is off'); }

  section('app layer: the reminder counts');
  { const log=[]; const {w}=await makePage({beforeLoad:fakeApp(log,{perm:'granted',localStorage:{'clo-app':JSON.stringify({welcomed:true,asked:true})}})});
    const now=Date.now(), D=864e5;
    const F='rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
    w.Store.put('adrills',[{id:'d1',fen:F,played:'e5',playedUci:'e7e5'},{id:'d2',fen:F,played:'e5',playedUci:'e7e5'},{id:'d3',fen:F,played:'e5',playedUci:'e7e5',kind:'punish'}]);
    w.Store.put('adrills-progress',{d1:{ok:false,t:now-2*D},d2:{ok:true,okN:1,t:now-4*D},d3:{ok:false,t:now-2*D},gone:{ok:false,t:now-2*D}});
    w.Store.put('blind-progress',{b1:{n:1,ok:true,okN:2,t:now-8*D},b2:{n:1,ok:true,okN:1,t:now-1*D}});
    w.Store.put('endgame-progress',{e1:{ok:false,t:now-D}});
    const c=w.Due.count(now);
    assert(c.drills===2&&c.blind===1&&c.endgames===1&&c.blundercheck===0,'due now: 2 drills (a miss and a 3-day review; punish drills and deleted drills left out), 1 Blind tactic, 1 endgame');
    assert(w.Due.count(now+3*D).blind===2,'… in three days the other Blind tactic is due too');
    const m=w.Native.message(c);
    assert(m.title==='Time for your reviews'&&m.body==='2 drills, 1 Blind tactic and 1 endgame are due.'&&m.hash==='#drills','the message: "Time for your reviews" · "2 drills, 1 Blind tactic and 1 endgame are due.", a tap opens Drills');
    const m1=w.Native.message({drills:1});
    assert(m1.title==='Time for your review'&&m1.body==='1 drill is due.','one review: "Time for your review" · "1 drill is due."');
    await w.Native.plan();
    const s=calls(log,'LN','schedule').pop();
    assert(s&&s[2].notifications.length>=1&&s[2].notifications.every(x=>x.id>=7100&&x.id<=7106),'the plan schedules reminders for the coming days'); }

  section('app layer: the Apple Watch (results in, the state out)');
  { const T=JSON.parse(fs.readFileSync(path.join(H.SITE,'data','tactics.json'),'utf8'))[0];
    const B=JSON.parse(fs.readFileSync(path.join(H.SITE,'data','blind.json'),'utf8'))[0];
    const now=Date.now();
    const res=[
      {kind:'result',v:2,rid:'r-tac',type:'tactic',id:T.id,at:now-5000,ok:true,late:'solved-late'},
      {kind:'result',v:2,rid:'r-calc',type:'calc',id:'zcalc1',at:now-4000,score:0.67,secs:41,mode:'play'},
      {kind:'result',v:2,rid:'r-blind',type:'blind',id:B.id,at:now-3000,ok:true,plies:4,peek:false,gaveUp:false},
      {kind:'result',v:2,rid:'r-tac',type:'tactic',id:T.id,at:now-5000,ok:true},             // delivered twice
      {kind:'result',v:2,rid:'r-new',type:'zfuture',id:'x',at:now-1000},                       // a type this site doesn't know
    ];
    const log=[]; const {w}=await makePage({beforeLoad:fakeApp(log,{pending:res,localStorage:{'clo-app':JSON.stringify({welcomed:true,asked:true})}})});
    await w.Native.watchSync();
    const tp=w.Store.get('tactics-progress')||{}, rt=w.Store.get('tac-rating')||{};
    assert(tp[T.id]&&tp[T.id].ok===true&&rt.n===1,'a tactic from the watch is recorded by Tactics’ own code: solved, and the puzzle rating moves (1 rated puzzle)');
    assert(tp[T.id].t===now-5000,'… with the moment it was solved on the watch, not when it arrived (roadmap #260)');
    const cp=(w.Store.get('calc-progress')||{}).zcalc1;
    assert(cp&&cp.score===0.67&&cp.secs===41&&cp.tries===1&&cp.t===now-4000,'a Calculation result keeps its score, time and the moment it was solved');
    const bp=(w.Store.get('blind-progress')||{})[B.id], br=w.Store.get('blind-rating')||{};
    assert(bp&&bp.ok===true&&bp.h===4&&bp.n===1&&br.n===1,'a Blind tactics result: solved with 4 hidden plies, rated once');
    const led=w.Store.get('watch-applied')||[];
    assert(led.length===3&&['r-tac','r-calc','r-blind'].every(r=>led.includes(r)),'the recorded ids are kept in the progress store (so they are in the export and the backup)');
    const ack=calls(log,'WB','ack').pop();
    assert(ack&&ack[2].rids.length===4&&!ack[2].rids.includes('r-new'),'all are confirmed to the plugin except the unknown type, which stays pending for a later version');
    const st=JSON.parse(calls(log,'WB','sendState').pop()[2].json);
    assert(st.kind==='state'&&st.v===2&&st.applied.includes('r-blind')&&st.recs.tactic[T.id][0]===1&&st.recs.calc.zcalc1[0]===0.67&&st.recs.blind[B.id][2]===1,'the state sent back: the recorded ids and the three sets’ records');
    assert(st.tac.n===1&&st.blind.n===1&&st.settings&&st.settings.plies===4,'… the two ratings and the Blind tactics setting');
    w.__setPending(res.slice(0,3)); await w.Native.watchSync();
    assert((w.Store.get('tac-rating')||{}).n===1&&w.Store.get('calc-progress').zcalc1.tries===1,'the same results again (the watch resent them): recorded once only');
    /* an older Tactics miss after a newer solve made on the iPhone (roadmap #260): it neither overwrites it nor rates again */
    w.Store.put('tactics-progress',Object.assign(w.Store.get('tactics-progress'),{[T.id]:{ok:true,t:now}}));
    w.__setPending([{rid:'r-tlate',type:'tactic',id:T.id,at:now-60e3,ok:false}]); await w.Native.watchSync();
    assert(w.Store.get('tactics-progress')[T.id].ok===true&&w.Store.get('tactics-progress')[T.id].t===now&&w.Store.get('tac-rating').n===1,'an older Tactics result from the watch doesn’t overwrite a newer solve, and isn’t rated (not the first try)');
    /* an older Blind result after a newer one (the watch's arrived late) */
    w.Store.put('blind-progress',{bz:{n:1,ok:true,okN:1,t:now}});
    w.__setPending([{rid:'r-old',type:'blind',id:'bz',at:now-60e3,ok:false,plies:4}]); await w.Native.watchSync();
    const bz=w.Store.get('blind-progress').bz;
    assert(bz.n===2&&bz.ok===true&&bz.okN===1&&bz.t===now,'an older Blind result counts, but doesn’t overwrite the newer review state');
    w.__setPending([{rid:'r-peek',type:'blind',id:'bq',at:now,ok:true,plies:4,peek:true}]); await w.Native.watchSync();
    const bq=w.Store.get('blind-progress').bq;
    assert(bq.ok===false&&bq.a===1,'Peek on the watch counts as on this page: assisted, a miss');
    assert(/Recorded/.test(w.document.getElementById('ap-watch').textContent)&&/Sent your progress/.test(w.document.getElementById('ap-watch').textContent),'the Settings card says what was recorded and sent'); }
  { const log=[]; const {w}=await makePage({beforeLoad:fakeApp(log,{watch:{paired:true,installed:false},localStorage:{'clo-app':JSON.stringify({welcomed:true,asked:true})}})});
    await w.Native.watchSync();
    assert(!calls(log,'WB','sendState').length&&/isn’t on your Apple Watch/.test(w.document.getElementById('ap-watch').textContent),'no watch app installed: nothing is sent, and the card says how to install it'); }

  section('app layer: the backup and the restore offer');
  { const log=[]; const {w}=await makePage({beforeLoad:fakeApp(log,{localStorage:{'clo-app':JSON.stringify({welcomed:true,asked:true})}})});
    await sleep(100);
    assert(await w.Native.backup(true)===false&&!calls(log,'FS','write').length,'an empty store is never backed up (it could overwrite a good backup)');
    w.Store.put('tactics-progress',{a:{ok:true,t:1}});
    Object.defineProperty(w.document,'hidden',{configurable:true,get:()=>true}); w.document.dispatchEvent(new w.Event('visibilitychange')); await sleep(100);
    const wr=calls(log,'FS','write').pop();
    assert(wr&&wr[2].path==='Think Ahead backup.json'&&wr[2].directory==='DOCUMENTS'&&JSON.parse(wr[2].data)['tactics-progress'].a.ok===true,'leaving the app writes the progress export to Documents ("Think Ahead backup.json", visible in Files)');
    w.Store.put('tactics-progress',{a:{ok:true,t:2}}); w.document.dispatchEvent(new w.Event('visibilitychange')); await sleep(100);
    assert(calls(log,'FS','write').length===1,'… at most once a minute'); }
  { const backup=JSON.stringify({_app:'chess-lab-open',_v:1,_t:'2026-11-16T21:42:00.000Z','tactics-progress':{a:{ok:true,t:1},b:{ok:false,t:2}},adrills:[{id:'d1',fen:'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',played:'e5',playedUci:'e7e5'}]});
    const log=[]; const {w}=await makePage({beforeLoad:fakeApp(log,{files:{'Think Ahead backup.json':backup},localStorage:{'clo-app':JSON.stringify({welcomed:true,asked:true})}})});
    await sleep(150); const d=w.document, sh=d.getElementById('app-sheet');
    assert(sh&&/Restore your progress/.test(sh.textContent)&&/2 puzzles, 1 drill/.test(sh.textContent),'empty progress and a backup on disk: it offers to restore it, saying what it holds (sketch P4)');
    assert(await w.Native.backup(true)===false,'… and doesn’t back up the empty store while the offer is open');
    sh.querySelector('button[data-a="fresh"]').click(); await sleep(50);
    const rn=calls(log,'FS','rename').pop();
    assert(rn&&rn[2].to==='Think Ahead backup (before 2026-11-16).json'&&w.__files[rn[2].to],'Start fresh keeps the old backup under a dated name instead of deleting it'); }
  { const backup=JSON.stringify({_app:'chess-lab-open',_v:1,_t:'2026-11-16T21:42:00.000Z','tactics-progress':{a:{ok:true,t:1}}});
    const log=[]; const {w}=await makePage({beforeLoad:fakeApp(log,{files:{'Think Ahead backup.json':backup},localStorage:{'clo-app':JSON.stringify({welcomed:true,asked:true})}})});
    await sleep(150); const sh=w.document.getElementById('app-sheet'); let reloaded=false; w.Native.reloadPage=()=>{ reloaded=true };
    sh.querySelector('button[data-a="restore"]').click(); await sleep(50);
    assert(w.Store.get('tactics-progress').a.ok===true&&reloaded,'Restore it brings the progress back and reloads the page'); }

  section('app layer: on an iPad (22 Nov 2026)');
  { const pad={device:'pad',supported:false,paired:false,installed:false};
    const log=[]; const {w}=await makePage({beforeLoad:fakeApp(log,{watch:pad})}); const d=w.document;
    await sleep(150);
    const wa=d.getElementById('welcome-app');
    assert(!d.getElementById('app-sheet')&&/stays on this iPad and is backed up/.test(wa.textContent)&&!/Apple Watch|iPhone/.test(wa.textContent),'the welcome says iPad, with no Apple Watch and no iPhone');
    const box=d.getElementById('appbox'), t=box.textContent;
    assert(/iPad app/.test(t)&&/stay on this iPad/.test(t)&&!/iPhone/.test(t),'Settings: the iPad app card, never “iPhone”');
    assert(!/Apple Watch/.test(t)&&!d.getElementById('ap-wsync'),'… no Apple Watch row (an iPad can’t pair one)');
    assert(!/Vibrate/.test(t)&&!d.getElementById('ap-haptics'),'… no vibration row (no Taptic Engine)');
    assert(/On My iPad → Think Ahead/.test(t),'… the backup is in Files under On My iPad');
    assert(w.Native.device==='pad'&&d.documentElement.classList.contains('on-ipad'),'… and the page knows it is on an iPad');
    const b=w.makeBoard(d.createElement('div'),{}); b.flash(['e2','e4'],'good'); b.flash(['e7','e5'],'bad');
    assert(!calls(log,'Haptics').length,'… a right or wrong move doesn’t call the haptics plugin'); }
  { const backup=JSON.stringify({_app:'chess-lab-open',_v:1,_t:'2026-11-16T21:42:00.000Z','tactics-progress':{a:{ok:true,t:1}}});
    const log=[]; const {w}=await makePage({beforeLoad:fakeApp(log,{watch:{device:'pad',supported:false},files:{'Think Ahead backup.json':backup},localStorage:{'clo-app':JSON.stringify({welcomed:true,asked:true})}})});
    await sleep(150); const sh=w.document.getElementById('app-sheet');
    assert(sh&&/progress on this iPad is empty/.test(sh.textContent),'the restore offer on an iPad says “this iPad”'); }
  { const log=[]; const {w}=await makePage({beforeLoad:fakeApp(log,{watch:{device:'phone',supported:true,paired:true,installed:true}})}); const d=w.document;
    await sleep(150); const wa=d.getElementById('welcome-app');
    assert(/stays on this iPhone \(and your Apple Watch\)/.test(wa.textContent),'an iPhone (device: phone) keeps the iPhone wording');
    const t=d.getElementById('appbox').textContent;
    assert(/iPhone app/.test(t)&&/Apple Watch/.test(t)&&/Vibrate/.test(t)&&/On My iPhone/.test(t)&&w.Native.device==='phone','… and its card keeps the watch, vibration and On My iPhone'); }
};
module.exports.fakeApp=fakeApp;   /* the 26 Nov 2026 app batch's tests use it too (tests/appfixes.js) */
