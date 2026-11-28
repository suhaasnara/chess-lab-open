/* The 27 Nov 2026 launch wants (roadmap #277, #279, #399). */
'use strict';

module.exports=async H=>{
  const {makePage,sleep,assert,section}=H;
  const seed=(k,v)=>w=>w.localStorage.setItem('clo:'+k,JSON.stringify(v));

  section('t111: Play keeps the game in progress and offers to continue it (roadmap #277)');
  {
    const {w}=await makePage();
    w.SharedEngine.play=async()=>'e7e5';
    const $=id=>w.document.getElementById(id), P=w.PlayTab;
    $('pl-elo').value='1400'; $('pl-color').value='w'; $('pl-blind').checked=false;
    P.newGame(); await sleep(20);
    assert(w.Store.get('play-current')==null,'a new game with no moves yet isn’t kept');
    P.userMove('e2','e4'); await sleep(50);
    const c=w.Store.get('play-current');
    assert(c&&c.moves.join(' ')==='e4 e5'&&c.me==='w'&&c.elo===1400&&c.blind===false,'after each move the moves, the side and the bot are kept: '+JSON.stringify(c));
    P.takeBack(); await sleep(10);
    assert(w.Store.get('play-current')==null,'taking back to the start leaves nothing to continue');
    P.userMove('d2','d4'); await sleep(50);
    assert(w.Store.get('play-current').moves.join(' ')==='d4 e5'&&w.Store.get('play-current').takebacks===1,'… and the takeback is kept with the game');
    const saved=w.Store.get('play-current');

    /* the app or tab closed: a new page load offers it */
    const {w:w2}=await makePage({beforeLoad:seed('play-current',saved)});
    w2.SharedEngine.play=async()=>'g8f6';
    const $2=id=>w2.document.getElementById(id), P2=w2.PlayTab;
    assert(/game in progress/.test($2('pl-status').textContent)&&$2('pl-continue'),'Play offers to continue: '+$2('pl-status').textContent);
    assert(/White vs Stockfish \(1400\)/.test($2('pl-status').textContent),'… naming the side and the bot');
    $2('pl-continue').click(); await sleep(20);
    const S=P2.state;
    assert(S.moves.join(' ')==='d4 e5'&&S.me==='w'&&S.elo===1400&&S.takebacks===1&&S.g.turn()==='w'&&!S.over,'Continue puts the game back where it was, your move');
    assert(!$2('play').classList.contains('idle')&&!$2('pl-resign').hidden,'… with the game’s buttons');
    P2.userMove('c2','c4'); await sleep(50);
    assert(S.moves.join(' ')==='d4 e5 c4 Nf6'&&w2.Store.get('play-current').moves.length===4,'… and it goes on being kept');
    P2.resign(); P2.resign(); await sleep(20);
    assert(w2.Store.get('play-current')==null,'the game ending clears it');
    const g=(w2.Store.get('play-games')||[])[0];
    assert(g&&g.moves==='d4 e5 c4 Nf6'&&g.takebacks===1,'… and it is saved with your games, takebacks and all');

    /* the bot to move when it was closed: it answers on Continue */
    const {w:w3}=await makePage({beforeLoad:seed('play-current',{t:Date.now(),me:'b',elo:'max',blind:true,peeks:2,moves:['e4']})});
    w3.SharedEngine.analyse=async()=>[{uci:'g1f3',cp:0.2,mate:null}];
    const $3=id=>w3.document.getElementById(id);
    assert(/Black vs Stockfish at full strength · blindfold/.test($3('pl-status').textContent),'a blindfold game as Black is offered as such');
    $3('pl-continue').click(); await sleep(30);
    const S3=w3.PlayTab.state;
    assert(S3.blind&&S3.peeks===2&&$3('pl-board').classList.contains('blind'),'blindfold and its peeks come back');
    assert(S3.moves.length===1&&S3.g.turn()==='b','your move as Black');

    /* a kept game that doesn't replay is dropped, not offered */
    const {w:w4}=await makePage({beforeLoad:seed('play-current',{t:Date.now(),me:'w',elo:1800,moves:['e4','e4']})});
    assert(!w4.document.getElementById('pl-continue')&&w4.Store.get('play-current')==null,'an unreadable kept game is dropped quietly');
    const {w:w5}=await makePage();
    assert(!w5.document.getElementById('pl-continue'),'no game kept: no offer');
  }
  section('t112: Analyze remembers you, keeps the screen awake and shows its steps (roadmap #279)');
  {
    const mv='e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5';
    const nd=JSON.stringify({id:'g1',createdAt:1762300000000,speed:'rapid',players:{white:{user:{name:'Me'},rating:2000},black:{user:{name:'Opp'},rating:1900}},
      winner:'white',moves:mv,analysis:[30,25,35,30,35,30,35,30,40,30,35,30].map(e=>({eval:e}))})+'\n';
    let seen=[], locks=[];
    const fakeLock=w=>{ w.navigator.wakeLock={request:async t=>{ const l={type:t,released:false,release:async()=>{ l.released=true }}; locks.push(l); return l }} };
    const {w}=await makePage({beforeLoad:fakeLock,fetch:async u=>{ if(u.includes('lichess.org/api/games/user/')){
      await sleep(30); const el=w.document.getElementById('a-steps');
      seen.push({hidden:el.hidden,on:(el.querySelector('li.on')||{}).textContent,text:el.textContent,note:w.document.getElementById('a-note').textContent}); return {ok:true,status:200,text:async()=>nd,json:async()=>({})} } return null }});
    const $=id=>w.document.getElementById(id);
    assert($('a-steps').hidden,'no steps before a run');
    $('a-site').value='lichess'; $('a-user').value='  Me  '; $('a-blitz').checked=true; $('a-site').dispatchEvent(new w.Event('change'));
    $('a-go').click();
    const mid=$('a-steps');
    for(let i=0;i<50&&w.AnalyzeTab.running;i++) await sleep(20);
    const f=seen[0]||{};
    assert(!f.hidden&&f.on==='Fetch your games'&&/Fetching your games from Lichess/.test(f.note),'the first step shows while the games are fetched: '+JSON.stringify(f));
    assert(locks.length===1&&locks[0].type==='screen','the screen is kept awake during the run');
    assert(/The screen stays on/.test(f.text),'… and it says so');
    for(let i=0;i<50&&w.AnalyzeTab.running;i++) await sleep(20);
    assert(!w.AnalyzeTab.running&&mid.querySelectorAll('li.done').length===4&&!mid.querySelector('li.on'),'every step ticked when it is done');
    assert(locks[0].released,'… and the screen may lock again');
    const who=w.Store.get('a-who');
    assert(who&&who.site==='lichess'&&who.u==='Me'&&who.blitz===true,'the username, site and blitz are remembered: '+JSON.stringify(who));

    /* the next launch: the form is filled in */
    const {w:w2}=await makePage({beforeLoad:seed('a-who',who)});
    const $2=id=>w2.document.getElementById(id);
    assert($2('a-site').value==='lichess'&&$2('a-user').value==='Me'&&$2('a-blitz').checked,'the next launch fills in the username and site');
    assert(!$2('a-user').closest('[data-src]').hidden,'… with the username box showing');
    /* a link with ?u= still wins */
    const {w:w3}=await makePage({beforeLoad:seed('a-who',who),url:'https://chess-lab-open.test/#analyze?site=chesscom&u=Other'});
    w3.dispatchEvent(new w3.HashChangeEvent('hashchange')); await sleep(10);
    assert(w3.document.getElementById('a-user').value==='Other'&&w3.document.getElementById('a-site').value==='chesscom','a link’s username still wins over the remembered one');
    /* a browser with no wake lock, or one that refuses: the run goes on, with the plain advice */
    let mid4='';
    const {w:w4}=await makePage({beforeLoad:w=>{ w.navigator.wakeLock={request:async()=>{ throw new Error('NotAllowedError') }} },
      fetch:async u=>{ if(!u.includes('lichess.org/api/games/user/')) return null; await sleep(20); mid4=w4.document.getElementById('a-steps').textContent; return {ok:true,status:200,text:async()=>nd,json:async()=>({})} }});
    await w4.AnalyzeTab.run('lichess','Me'); await sleep(50);
    assert(/Keep this page open/.test(mid4),'a refused wake lock: “keep this page open”: '+mid4);
    assert(/analyzed game/.test(w4.document.getElementById('a-report').textContent),'… and the run still finishes');
    /* the demo isn't remembered as your name */
    const {w:w5}=await makePage({fetch:async()=>({ok:true,status:200,text:async()=>'',json:async()=>({games:[],archives:[]})})});
    w5.document.getElementById('a-demo').click(); await sleep(50);
    assert(w5.Store.get('a-who')==null,'trying the demo doesn’t remember its username');
    /* an error hides the steps */
    for(let i=0;i<50&&w5.AnalyzeTab.running;i++) await sleep(20);
    assert(w5.document.getElementById('a-steps').hidden,'a run that ends in an error hides the steps');
  }
  section('t113: a home-screen icon for the website (roadmap #399)');
  {
    const fs=require('fs'), path=require('path');
    const png=fs.readFileSync(path.join(H.SITE,'apple-touch-icon.png'));
    assert(png.slice(1,4).toString()==='PNG'&&png.readUInt32BE(16)===180&&png.readUInt32BE(20)===180,'site/apple-touch-icon.png is a 180 × 180 PNG');
    assert(png[25]===2,'… opaque (RGB, no alpha: iOS shows transparency as black)');
    for(const [f,href] of [['index.html','apple-touch-icon.png'],['404.html','/chess-lab-open/apple-touch-icon.png']]){
      const html=fs.readFileSync(path.join(H.SITE,f),'utf8');
      assert(html.includes(`<link rel="apple-touch-icon" href="${href}">`),f+' links it ('+href+')') }
  }
};
