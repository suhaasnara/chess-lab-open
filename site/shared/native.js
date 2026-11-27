/* Shared. Home: chess-lab-open/site/shared/ (MIT). The iPhone and Apple Watch app around this site (the public app,
   suhaasnara/chess-lab-open-app; design in its docs/01-design.md) runs the site inside a native shell (Capacitor).

   How the page and the app meet: inside the app, Capacitor puts window.Capacitor.Plugins on the page, one entry per
   native plugin (Haptics, LocalNotifications, Filesystem, WatchBridge). A call like Plugins.Haptics.impact() crosses
   from JavaScript into Swift and back as a Promise. Everywhere else (any browser) Native.app is false and every function
   here does nothing, so the website is unchanged.

   This file is the generic machinery; each site registers its own parts (Open: js/native.js):
     Due.add(key, at => how many items are due at time `at`)        counters for the review reminder (read-only)
     WatchSets.add(type, {apply(result), state()})                  the sets on the Apple Watch: how a result from the
                                                                    watch is recorded, and what the watch should know
     Native.start(site)                                             names, storage and backup hooks (see start())
   Nothing here writes progress itself: results are recorded by each section's own code (WatchSets.apply). */
'use strict';
window.Due={ src:{},
  add(k,f){ this.src[k]=f },
  count(at){ const o={}; for(const k in this.src){ try{ o[k]=Math.max(0,+this.src[k](at)||0) }catch(e){ o[k]=0 } } return o },
  day(at){ const d=new Date(at); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0') },
  sod(at){ return new Date(at).setHours(0,0,0,0) },
  /* the review rule of Drills, Blunder check, Endgames and Blind tactics: a miss is due from the next day; a solve
     comes back 3, 7, then 21 days after the last try */
  spaced(r,at){ const REVIEW=[3,7,21]; return !!r&&(r.ok?at-r.t>=REVIEW[Math.min(REVIEW.length-1,Math.max(1,r.okN||1)-1)]*864e5:r.t<Due.sod(at)) }
};

window.WatchSets={ src:{}, add(k,o){ this.src[k]=o } };

window.Native=(()=>{
  const cap=window.Capacitor, P=(cap&&cap.Plugins)||{};
  const app=!!(cap&&typeof cap.isNativePlatform==='function'&&cap.isNativePlatform());
  let site=null, cfg=null;
  /* the device the app runs on (22 Nov 2026): the app's WatchBridge.status() says "phone" or "pad". Until it answers, and
     with an older app, this is an iPhone. An iPad has no Apple Watch and no Taptic Engine: those rows are hidden there. */
  let dev={kind:'phone',name:'iPhone',watch:true,vibrate:true};
  const DEF={haptics:true,remind:true,time:'19:00',asked:false,welcomed:false};
  const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const save=()=>{ try{ localStorage.setItem(site.cfgKey,JSON.stringify(cfg)) }catch(e){} };
  const clock=at=>new Date(at).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'});
  const plural=(n,a,b)=>n+' '+(n===1?a:b);

  /* ---- haptics: a light tap for a right move, iOS's error buzz for a wrong one, a firmer tap for "right, but" ---- */
  let lastBuzz=0;
  function verdict(tone){
    if(!app||!cfg||!cfg.haptics||!P.Haptics||!dev.vibrate) return;
    const now=Date.now(); if(now-lastBuzz<250) return; lastBuzz=now;   // one move, one buzz (a flash covers two squares)
    try{
      if(tone==='good') P.Haptics.impact({style:'LIGHT'});
      else if(tone==='bad') P.Haptics.notification({type:'ERROR'});
      else if(tone==='warn') P.Haptics.impact({style:'MEDIUM'});
    }catch(e){}
  }

  /* ---- the review reminder: a local notification at the chosen time on each of the next 7 days with something due.
     iOS keeps the scheduled notifications; no server. The plan is redone whenever the app is opened or left. ---- */
  const IDS=[7100,7101,7102,7103,7104,7105,7106], TEST=7199;
  /* the message for the counts at a time: {total, title, body, hash (the page a tap opens)} */
  function message(c){
    const parts=site.reminder.map(p=>[p,c[p.k]||0]).filter(x=>x[1]>0), total=parts.reduce((s,x)=>s+x[1],0);
    const top=parts.slice().sort((a,b)=>b[1]-a[1])[0];
    /* 23 Nov 2026 (his device test): written as sentences, not lowercase fragments: "Time for your reviews" /
       "2 drills, 1 Blind tactic and 1 endgame are due." */
    const items=parts.map(([p,n])=>plural(n,p.one,p.many));
    const list=items.length>1?items.slice(0,-1).join(', ')+' and '+items[items.length-1]:(items[0]||'');
    return {total,title:total===1?'Time for your review':'Time for your reviews',body:total?list+(total===1?' is due.':' are due.'):'',hash:top?top[0].hash:'#today'};
  }
  const atOn=(d,time)=>{ const [h,m]=String(time||'19:00').split(':').map(Number), x=new Date(); x.setDate(x.getDate()+d); x.setHours(h||0,m||0,0,0); return x.getTime() };
  /* iOS asks the user once; after that the answer is 'granted' or 'denied' (changeable only in the device's Settings) */
  async function permission(ask){
    if(!app||!P.LocalNotifications) return 'unavailable';
    try{ let p=await P.LocalNotifications.checkPermissions(); if(p.display==='prompt'||p.display==='prompt-with-rationale'){ if(!ask) return 'prompt'; p=await P.LocalNotifications.requestPermissions() } return p.display }catch(e){ return 'unavailable' }
  }
  let next=null, perm='unknown';
  async function plan(){
    if(!app||!P.LocalNotifications) return;
    const LN=P.LocalNotifications;
    try{ await LN.cancel({notifications:IDS.map(id=>({id}))}) }catch(e){}
    next=null; perm=await permission(false);
    if(!cfg.remind||perm!=='granted'){ render(); return }
    const now=Date.now(), list=[];
    for(let d=0;d<IDS.length;d++){ const at=atOn(d,cfg.time); if(at<now+60e3) continue;
      const m=message(Due.count(at)); if(!m.total) continue;
      list.push({id:IDS[d],title:m.title,body:m.body,schedule:{at:new Date(at)},extra:{hash:m.hash}});
      if(!next) next={at,m} }
    if(list.length) try{ await LN.schedule({notifications:list}) }catch(e){}
    render();
  }
  let timer=0; const soon=(ms=1500)=>{ clearTimeout(timer); timer=setTimeout(plan,ms) };
  async function test(){
    if(await permission(true)!=='granted'){ perm='denied'; render(); return }
    const m=message(Due.count(Date.now()));
    try{ await P.LocalNotifications.schedule({notifications:[{id:TEST,title:m.total?m.title:site.name,body:(m.total?m.body:'Nothing is due right now.')+' This is a test.',schedule:{at:new Date(Date.now()+5000)},extra:{hash:m.hash}}]}) }catch(e){}
  }

  /* ---- the Apple Watch (docs/01-design.md §2.3). The watch keeps its own progress and sends each result; the app's
     WatchBridge plugin keeps them in a file until this page has recorded them. Delivery is "at least once" (the watch
     sends again what isn't confirmed), recording is "exactly once": every result has an id (rid), and the ids already
     recorded are kept in the progress store (key watch-applied), so a result that arrives twice is recorded once, and
     the list travels with the export and the backup. Then a state goes back: the merged progress, the ratings and the
     recorded ids, so the watch can drop what is confirmed and show the same numbers as the phone. ---- */
  const WB=P.WatchBridge, LEDGER=5000;
  let wbusy=false, wagain=false, wstate=null, wlast=null;
  async function buildState(){
    const st={kind:'state',v:2,made:Date.now(),applied:(site.store.get('watch-applied')||[]).slice(-LEDGER),recs:{}};
    for(const k in WatchSets.src){ try{ const s=await WatchSets.src[k].state(); if(s){ const {recs,...rest}=s; if(recs) st.recs[k]=recs; Object.assign(st,rest) } }catch(e){ console.error('[native] watch state',k,e) } }
    return st }
  async function watchSync(){
    if(!app||!WB) return; if(wbusy){ wagain=true; return } wbusy=true;
    try{
      wstate=await WB.status();
      const res=((await WB.getPending())||{}).results||[];
      const done=site.store.get('watch-applied')||[], seen=new Set(done), ack=[]; let n=0;
      for(const r of res.slice().sort((a,b)=>(a.at||0)-(b.at||0))){            // oldest first, as they were solved
        if(!r||!r.rid) continue;
        if(!seen.has(r.rid)){ const s=WatchSets.src[r.type]; if(!s) continue;   // a type this site doesn't know stays pending
          try{ await s.apply(r) }catch(e){ console.error('[native] watch result',r,e); continue }   // tried again next time
          seen.add(r.rid); done.push(r.rid); n++ }
        ack.push(r.rid) }
      if(n) site.store.put('watch-applied',done.slice(-LEDGER));
      if(ack.length) await WB.ack({rids:ack});
      let sent=false;
      if(wstate&&wstate.paired&&wstate.installed){ const r=await WB.sendState({json:JSON.stringify(await buildState())}); sent=!!(r&&r.sent) }
      wlast={at:Date.now(),recorded:n,sent,recAt:n?Date.now():(wlast&&wlast.recAt)||null,recN:n||(wlast&&wlast.recN)||0};
      if(n){ dirty=true; soon(2000) }
    }catch(e){ console.error('[native] watch sync',e) }
    finally{ wbusy=false; render(); if(wagain){ wagain=false; setTimeout(watchSync,1000) } }
  }
  /* which device: asked once at start, before the first card names it */
  async function detect(){
    if(!WB) return;
    try{ const s=await WB.status(); if(s) wstate=s;
      if(s&&s.device==='pad') dev={kind:'pad',name:'iPad',watch:false,vibrate:false} }catch(e){}
    document.documentElement.classList.toggle('on-ipad',dev.kind==='pad') }
  function watchLine(){
    if(!WB||!dev.watch||(wstate&&wstate.supported===false)) return '';
    const s=wstate, l=wlast;
    const st=!s?'Checking…':!s.paired?'No Apple Watch is paired with this iPhone.':!s.installed?`${esc(site.name)} isn’t on your Apple Watch yet: install it from the Watch app on this iPhone.`
      :[l&&l.recN?`Recorded ${plural(l.recN,'result','results')} from the watch at ${clock(l.recAt)}.`:'',l&&l.sent?`Sent your progress at ${clock(l.at)}.`:'Ready.'].filter(Boolean).join(' ');
    return `<div class="setrow"><div><div class="setname">Apple Watch</div><div class="note" id="ap-watch">${st}</div></div>
      <div><button type="button" class="btn sm" id="ap-wsync">Sync now</button></div></div>` }

  /* ---- the backup (docs/01-design.md §2.6): iOS may clear a web view's storage when the phone is short of space, so
     after each session the whole progress export is written to the app's Documents folder, which shows in the Files app
     (On My iPhone, or On My iPad → the app) and goes into the device's own backups. Never written while the progress is empty, so an
     emptied store can't overwrite a good backup. ---- */
  const FS=P.Filesystem, DOCS='DOCUMENTS';
  let dirty=false, lastBackup=0, backupAt=null, offered=false;
  const backupName=()=>site.name+' backup.json';
  async function backup(force){
    if(!app||!FS||site.isEmpty()||offered) return false;
    if(!force&&(!dirty||Date.now()-lastBackup<60e3)) return false;
    try{ await FS.writeFile({path:backupName(),data:JSON.stringify(site.exportAll()),directory:DOCS,encoding:'utf8'});
      dirty=false; lastBackup=Date.now(); backupAt=lastBackup; render(); return true }catch(e){ console.error('[native] backup',e); return false }
  }
  async function readBackup(){
    if(!FS) return null;
    try{ const r=await FS.readFile({path:backupName(),directory:DOCS,encoding:'utf8'}); return JSON.parse(r.data) }catch(e){ return null }
  }
  /* at start: an empty store and a backup on disk -> offer to restore it (sketch P4). "Start fresh" keeps the old backup
     under a dated name instead of letting the next backup overwrite it. */
  async function offerRestore(){
    if(!site.isEmpty()) return;
    const b=await readBackup(); if(!b) return;
    offered=true;
    const when=b._t?new Date(b._t):null;
    sheet(`<h2>Restore your progress?</h2><p>Your progress on this ${dev.name} is empty, but there is a backup${when?` from ${esc(when.toLocaleDateString([], {weekday:'short',day:'numeric',month:'short'}))}, ${esc(clock(when))}`:''} (${esc(site.describe(b))}).</p>`,
      [['Restore it','restore'],['Start fresh','fresh']],async a=>{
        if(a==='restore'){ offered=false; put(b); return }
        const stamp=(b._t||new Date().toISOString()).slice(0,10);
        try{ await FS.rename({from:backupName(),to:`${site.name} backup (before ${stamp}).json`,directory:DOCS,toDirectory:DOCS}) }catch(e){}
        offered=false });
  }

  /* ---- restoring a backup someone picked (Settings → Restore from a backup…, Progress → Import progress), 26 Nov 2026,
     roadmap #268: it replaced the progress key by key at once, with no question and no way back, so an old file silently
     replaced newer results. Now it asks first, saying when the backup was made and what it holds next to what is here;
     a copy of what is here is saved to Files before anything is replaced ("Think Ahead backup (before restore …).json");
     keys that could not be written are named; then the page reloads, so every tab reads the restored progress. ---- */
  const when=b=>{ const d=b&&b._t?new Date(b._t):null; return d&&!isNaN(d)?`${d.toLocaleDateString([], {day:'numeric',month:'short',year:'numeric'})}, ${clock(d)}`:'' };
  const fileStamp=()=>{ const d=new Date(), p=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}.${p(d.getMinutes())}` };
  /* writes the backup's keys (site.restore -> {n, failed}, or importAll for an older site), then reloads */
  function put(b){
    let r; try{ r=site.restore?site.restore(b):{n:site.importAll(b),failed:[]} }catch(e){ alertSheet('That file is not a progress backup.'); return false }
    if(!r.failed.length){ api.reloadPage(); return true }
    sheet(`<p>Restored ${esc(plural(r.n,'entry','entries'))}, but ${esc(plural(r.failed.length,'entry','entries'))} could not be written (the ${esc(dev.name)}’s storage for the app may be full): ${esc(r.failed.join(', '))}.</p>`,
      [['OK','ok']],()=>api.reloadPage());
    return true }
  async function restore(b){
    if(!app||!site) return false;
    if(!b||typeof b!=='object'||Array.isArray(b)){ alertSheet('That file is not a progress backup.'); return false }
    const empty=site.isEmpty(), now=empty?null:site.exportAll(), copy=`${site.name} backup (before restore ${fileStamp()}).json`;
    return new Promise(res=>{
      sheet(`<h2>Restore this backup?</h2><p>The backup${when(b)?` is from ${esc(when(b))} and`:''} holds ${esc(site.describe(b))}.</p>
        <p>On this ${esc(dev.name)} now: ${empty?'no progress yet':esc(site.describe(now))}.${empty?'':` A copy of it is saved to Files first (${esc(copy)}).`}</p>
        <p class="note">Restoring replaces what is here with what is in the backup.</p>`,
        [['Restore','restore'],['Cancel','cancel']],async a=>{
          if(a!=='restore') return res(false);
          if(now){ try{ await FS.writeFile({path:copy,data:JSON.stringify(now),directory:DOCS,encoding:'utf8'}) }
            catch(e){ alertSheet('Your progress could not be copied to Files first, so nothing was restored.'); return res(false) } }
          res(put(b)) }) }) }

  /* ---- files and pages the web view can't handle by itself (26 Nov 2026, roadmap #267) ----
     saveFile: a download (a Blob and <a download>) does nothing in the app: the web view has no downloads. The file is
     written to the app's Documents folder instead, which the Files app shows (On My iPhone → Think Ahead); returns where.
     openExternal: a window opened after an await (Review on Lichess imports the game first) is blocked in the app; a
     plain navigation to another site is handed to Safari by Capacitor, so that is used instead.
     print: window.print() does nothing in the app's web view; the app's WatchBridge.print() shows iOS's print sheet
     (AirPrint, or Save to Files as a PDF) for the page as it prints. canPrint says whether this app has it. */
  async function saveFile(name,text){
    if(!app||!FS) return null;
    await FS.writeFile({path:name,data:text,directory:DOCS,encoding:'utf8'});
    return `Files → On My ${dev.name} → ${site?site.name:''}` }
  function openExternal(url){
    if(!app||!/^https:\/\//.test(String(url))) return false;
    api.go(url); return true }
  const canPrint=()=>!!(app&&WB&&typeof WB.print==='function');
  async function print(){ if(!canPrint()) return false; try{ const r=await WB.print(); return !!(r&&r.printed) }catch(e){ console.error('[native] print',e); return false } }

  /* ---- sheets: the first-launch card, the reminder question, the restore offer (in the app only) ---- */
  function sheet(html,buttons,done){
    const m=document.createElement('div'); m.className='modal'; m.id='app-sheet'; m.setAttribute('role','dialog'); m.setAttribute('aria-modal','true');
    m.innerHTML=`<div class="card">${html}<div class="btns" style="margin-top:14px">${buttons.map(([l,a],i)=>`<button type="button" class="btn${i?'':' primary'}" data-a="${a}">${esc(l)}</button>`).join('')}</div></div>`;
    m.addEventListener('click',e=>{ const b=e.target.closest('button[data-a]'); if(!b) return; m.remove(); done&&done(b.dataset.a) });
    document.body.appendChild(m); const f=m.querySelector('button'); if(f) f.focus();
    return m }
  const alertSheet=t=>sheet(`<p>${esc(t)}</p>`,[['OK','ok']]);
  function welcome(){
    if(cfg.welcomed) return; cfg.welcomed=true; save();
    const lines=typeof site.welcome==='function'?site.welcome(Object.assign({},dev)):site.welcome;
    /* a site with a welcome of its own on the page shows the lines there (site.welcomeInline(lines) -> true): one welcome, not two */
    if(typeof site.welcomeInline==='function'&&site.welcomeInline(lines)) return;
    sheet(`<h2>Welcome to ${esc(site.name)}</h2><ul style="padding-left:18px;margin:8px 0">${lines.map(t=>`<li>${esc(t)}</li>`).join('')}</ul>`,[['Get started','ok']]) }
  /* the notification permission is asked in context, once: after the first few results (or when the reminder is turned
     on in Settings), never at launch */
  let changes=0;
  function changed(){
    dirty=true; changes++;
    if(changes===3&&!cfg.asked&&cfg.remind&&!document.getElementById('app-sheet')) setTimeout(askReminder,1500) }
  async function askReminder(){
    if(cfg.asked||document.getElementById('app-sheet')) return;
    if(await permission(false)!=='prompt'){ cfg.asked=true; save(); soon(0); return }
    sheet(`<p>Want a reminder at ${esc(clockOf(cfg.time))} on days when reviews are due?</p>`,[['Remind me','yes'],['Not now','no']],async a=>{
      cfg.asked=true; if(a==='yes') perm=await permission(true); else cfg.remind=false; save(); render(); soon(0) }) }
  const clockOf=t=>{ const [h,m]=String(t).split(':').map(Number), d=new Date(); d.setHours(h||0,m||0,0,0); return clock(d) };

  /* ---- the Settings card (only in the app; sketch P2) ---- */
  const fmt=at=>{ const d=new Date(at), days=Math.round((Due.sod(at)-Due.sod(Date.now()))/864e5);
    return (days===0?'today':days===1?'tomorrow':d.toLocaleDateString([], {weekday:'long'}))+' at '+clock(at) };
  function render(){
    const box=document.getElementById('appbox'); if(!box||!app||!site) return; box.hidden=false;
    const seg=(k,opts)=>`<div class="seg" role="group" aria-labelledby="ap-${k}">${opts.map(([v,l])=>`<button type="button" data-ak="${k}" data-v='${JSON.stringify(v)}' aria-pressed="${cfg[k]===v}">${l}</button>`).join('')}</div>`;
    const state=!cfg.remind?'Off.':perm==='denied'?`Notifications are off for ${esc(site.name)}: turn them on in Settings → Notifications → ${esc(site.name)}.`:perm!=='granted'?'You’ll be asked to allow notifications.'
      :next?`Next: ${fmt(next.at)}. ${esc(next.m.title)}: ${esc(next.m.body)}.`:'Nothing comes due in the next 7 days, so no reminder is set.';
    box.innerHTML=`<h2>${dev.name} app</h2><p class="note">These stay on this ${dev.name}.</p>
      ${dev.vibrate?`<div class="setrow"><div><div class="setname" id="ap-haptics">Vibrate on right and wrong moves</div><div class="note">A light tap for a right move, a buzz for a wrong one.</div></div>${seg('haptics',[[true,'On'],[false,'Off']])}</div>`:''}
      <div class="setrow"><div><div class="setname" id="ap-remind">Review reminder</div><div class="note" id="ap-state">${state}</div></div>
        <div>${seg('remind',[[true,'On'],[false,'Off']])}<input type="time" id="ap-time" value="${esc(cfg.time)}" aria-label="Reminder time" style="margin-top:8px;border:1px solid var(--line);border-radius:var(--radius);padding:7px 9px;background:var(--white);color:inherit;font:inherit"${cfg.remind?'':' disabled'}></div></div>
      <div class="btns" style="margin-top:12px"><button type="button" class="btn" id="ap-test">Send a test reminder in 5 seconds</button></div>
      ${watchLine()}
      ${FS?`<div class="setrow"><div><div class="setname">Backup</div><div class="note" id="ap-backup">${backupAt?`Saved to Files at ${clock(backupAt)}.`:'Saved to Files after each session (On My '+dev.name+' → '+esc(site.name)+').'}</div></div>
        <div class="btns"><button type="button" class="btn sm" id="ap-bnow">Back up now</button><button type="button" class="btn sm" id="ap-brestore">Restore from a backup…</button></div></div>`:''}
      ${site.about?`<p class="note" style="margin-top:12px"><a href="${esc(site.about)}">About, privacy and licences</a></p>`:''}`;
  }
  function pickBackup(){
    const f=document.createElement('input'); f.type='file'; f.accept='application/json,.json';
    f.onchange=()=>{ const x=f.files&&f.files[0]; if(!x) return; x.text().then(t=>restore(JSON.parse(t))).catch(()=>alertSheet('That file is not a progress backup.')) };
    f.click() }
  function wire(){
    const box=document.getElementById('appbox'); if(!box) return;
    box.addEventListener('click',async e=>{
      const b=e.target.closest('button[data-ak]');
      if(b){ cfg[b.dataset.ak]=JSON.parse(b.dataset.v); save(); if(b.dataset.ak==='haptics'&&cfg.haptics){ lastBuzz=0; verdict('good') }
        if(b.dataset.ak==='remind'&&cfg.remind){ cfg.asked=true; save(); perm=await permission(true) } render(); soon(0); return }
      if(e.target.id==='ap-test') test();
      if(e.target.id==='ap-wsync') watchSync();
      if(e.target.id==='ap-bnow') backup(true);
      if(e.target.id==='ap-brestore') pickBackup() });
    box.addEventListener('change',e=>{ if(e.target.id==='ap-time'&&/^\d\d:\d\d$/.test(e.target.value)){ cfg.time=e.target.value; save(); soon(0) } });
  }

  /* site = {
       name        the app's name ('Think Ahead')
       cfgKey      localStorage key for these device settings (not part of the progress export: they are about this phone)
       store       {get(key), put(key, value)}: the progress store (the ledger of recorded watch results lives there)
       exportAll() -> the progress export; importAll(obj) -> entries restored; isEmpty() -> no progress yet;
       restore(obj) -> {n, failed: [keys not written]} (optional; else importAll, and nothing is reported);
       describe(export) -> a short summary for the restore offer ('512 puzzles, 3 repertoires')
       reminder    [{k: a Due key, one, many, hash}]: the parts of the reminder, in order
       welcome     the first-launch card's lines, or a function (device) -> lines; device = {kind: 'phone' | 'pad',
                   name: 'iPhone' | 'iPad', watch, vibrate}
       welcomeInline(lines) -> true when the site showed them in its own welcome on the page (optional; else a sheet)
       about       the link to the About page (optional) } */
  function start(s){
    site=s; cfg=Object.assign({},DEF);
    try{ Object.assign(cfg,JSON.parse(localStorage.getItem(site.cfgKey)||'{}')) }catch(e){}
    if(!app) return;
    document.documentElement.classList.add('in-app');
    const go=async()=>{
      wire(); await detect(); render();
      /* a tap on a reminder opens the page it names (iOS keeps the tap until this listener is added: a cold start works) */
      try{ P.LocalNotifications&&P.LocalNotifications.addListener('localNotificationActionPerformed',a=>{ const h=a&&a.notification&&a.notification.extra&&a.notification.extra.hash; if(h&&/^#[a-z]+$/.test(h)) location.hash=h }) }catch(e){}
      offerRestore().then(()=>{ if(!offered) welcome() });
      setTimeout(plan,3000);
      /* leaving the app (a session ends): back up and redo the reminder plan; coming back: redo it a little later */
      document.addEventListener('visibilitychange',()=>{ if(document.hidden){ clearTimeout(timer); backup(); plan() } else soon(5000) });
      if(WB){ let wt=0; const wsoon=ms=>{ clearTimeout(wt); wt=setTimeout(watchSync,ms) };
        setTimeout(watchSync,4000);
        document.addEventListener('visibilitychange',()=>{ if(!document.hidden) wsoon(3000) });
        try{ WB.addListener('results',()=>wsoon(1000)) }catch(e){}
        try{ WB.addListener('watch',a=>{ if(a&&a.installed) wsoon(1000) }) }catch(e){} }   // a watch app just installed: send it the progress (app 23 Nov 2026)
    };
    if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',go); else go();
  }
  const api={app,start,verdict,plan,message,watchSync,buildState,backup,changed,askReminder,restore,saveFile,openExternal,print,canPrint,get cfg(){ return Object.assign({},cfg) },
    get device(){ return dev.kind },
    reloadPage:()=>location.reload(), go:u=>{ location.href=u }};   /* replaceable in tests (jsdom can't reload or navigate) */
  return api;
})();
