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
    w.Native.verdict('good'); assert(true,'… Native.verdict does nothing (no plugin, no error)'); }

  section('app layer: first launch, Settings card, the reminder asked in context');
  { const log=[]; const {w}=await makePage({beforeLoad:fakeApp(log)}); const d=w.document;
    await sleep(100);
    const sh=d.getElementById('app-sheet');
    assert(sh&&/Welcome to Think Ahead/.test(sh.textContent)&&/works offline/.test(sh.textContent),'the first launch shows the welcome card (sketch P1)');
    sh.querySelector('button').click();
    assert(!d.getElementById('app-sheet')&&JSON.parse(w.localStorage.getItem('clo-app')).welcomed===true,'… Get started closes it, once and for all');
    const box=d.getElementById('appbox');
    assert(!box.hidden&&/iPhone app/.test(box.textContent)&&/Apple Watch/.test(box.textContent)&&/Backup/.test(box.textContent),'Settings shows the iPhone app card: vibration, reminder, Apple Watch, backup');
    assert(d.documentElement.classList.contains('in-app'),'… and the page knows it is in the app');
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
    assert(m.title==='4 reviews due'&&m.body==='2 drills · 1 Blind tactic · 1 endgame'&&m.hash==='#drills','the message: "4 reviews due" · "2 drills · 1 Blind tactic · 1 endgame", a tap opens Drills');
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

  section('About and privacy (#about)');
  { const {w}=await makePage(); const d=w.document;
    w.location.hash='#about'; await sleep(200);
    const s=d.getElementById('about');
    assert(!s.hidden&&/Nothing is collected/.test(s.textContent)&&/Lichess tablebase/.test(s.textContent)&&/GPL-3.0/.test(s.textContent),'#about shows the privacy policy and the licences');
    assert([...s.querySelectorAll('.app-only')].every(e=>e.hidden),'… on the website the parts about the app stay hidden (the app is not out yet)');
    assert(d.querySelector('#x-menu a[href="#about"]'),'Extra lists About and privacy');
    assert(d.querySelector('footer a[href="#about"]'),'… and the footer links to it'); }
  { const log=[]; const {w}=await makePage({beforeLoad:fakeApp(log,{localStorage:{'clo-app':JSON.stringify({welcomed:true,asked:true})}})}); const d=w.document;
    assert([...d.querySelectorAll('#about .app-only')].every(e=>!e.hidden)&&/chess-lab-open-app/.test(d.getElementById('about').textContent),'in the app the About page also covers the app: Files backup, the watch, reminders, the app’s source');
    assert(d.querySelector('#appbox a[href="#about"]'),'… and the app’s Settings card links to it'); }

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
};
