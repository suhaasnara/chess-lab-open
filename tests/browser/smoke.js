/* Chess Lab Open — real-browser smoke test (Playwright), run in CI on Firefox and Chromium.
     node tests/browser/smoke.js <firefox|chromium> [outDir]
   Serves site/ from a local static server, opens every tab, plays a move on every board with the
   real mouse (clicks and a drag), checks that Stockfish answers, draws an arrow with a right-drag,
   takes moves back, collects console errors and page errors, and saves screenshots of every tab in
   light and dark, at desktop and phone width. Exit code 1 when a check fails. */
'use strict';
const http=require('http'), fs=require('fs'), path=require('path');
const {chromium,firefox,webkit}=require('playwright');

const BROWSER=process.argv[2]||'chromium';
const OUT=path.resolve(process.argv[3]||path.join(__dirname,'out',BROWSER));
const SITE=path.join(__dirname,'..','..','site');
fs.mkdirSync(OUT,{recursive:true}); if(process.env.DUMP) fs.mkdirSync(path.join(OUT,'small'),{recursive:true});

const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json',
  '.wasm':'application/wasm','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png','.txt':'text/plain; charset=utf-8'};
function serve(){
  return new Promise(res=>{
    const srv=http.createServer((req,rsp)=>{
      let p=decodeURIComponent(req.url.split('?')[0].split('#')[0]); if(p.endsWith('/')) p+='index.html';
      const f=path.join(SITE,path.normalize(p).replace(/^(\.\.[/\\])+/,''));
      if(!f.startsWith(SITE)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){ rsp.writeHead(404); rsp.end('not found'); return }
      rsp.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream','Cache-Control':'no-store'});
      fs.createReadStream(f).pipe(rsp);
    });
    srv.listen(0,'127.0.0.1',()=>res(srv));
  });
}

const results=[]; let failed=0;
function check(name,ok,detail=''){ results.push({name,ok:!!ok,detail:String(detail||'')}); if(!ok) failed++; console.log((ok?'  ok   ':'  FAIL ')+name+(detail?' — '+detail:'')) }
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function waitFor(page,fn,arg,ms=20000){ try{ await page.waitForFunction(fn,arg,{timeout:ms,polling:100}); return true }catch(e){ return false } }

(async()=>{
  /* BASE=<url> tests a deployed copy (e.g. the live GitHub Pages site) instead of this checkout */
  const LIVE=process.env.BASE||''; const srv=LIVE?null:await serve(); const base=LIVE?(LIVE.endsWith('/')?LIVE:LIVE+'/'):`http://127.0.0.1:${srv.address().port}/`;
  const soft=(name,ok,detail)=>{ if(LIVE&&!ok) warnings.push('not on this deploy: '+name+(detail?' — '+detail:'')); else check(name,ok,detail) };
  const type={chromium,firefox,webkit}[BROWSER]; if(!type) throw new Error('unknown browser '+BROWSER);
  const browser=await type.launch();
  /* Headless Chromium says "HeadlessChrome" in its user agent, and Lichess's game export answers that with a 404;
     a real Chrome doesn't, so the test uses the normal Chrome user agent */
  let ua; if(BROWSER==='chromium'){ const t=await browser.newPage(); ua=(await t.evaluate(()=>navigator.userAgent)).replace('HeadlessChrome','Chrome'); await t.close() }
  const ctx=await browser.newContext({viewport:{width:1280,height:900},colorScheme:'light',...(ua?{userAgent:ua}:{})});
  const page=await ctx.newPage();
  const errors=[], warnings=[]; let inLive=false;   /* inLive: the one live Lichess check is running (its errors are warnings) */
  page.on('pageerror',e=>errors.push('pageerror: '+(e&&e.message||e)));
  page.on('console',m=>{ const t=m.type(); const txt=m.text();
    const at=(m.location()&&m.location().url)||'';
    if(t==='error'){ (/fonts\.(googleapis|gstatic)|favicon/.test(txt+at)||(inLive&&/lichess\.org/.test(txt+at))||(/Failed to load resource/.test(txt)&&at&&!at.startsWith(base))?warnings:errors).push('console.error: '+txt+(at?' @ '+at:'')) }
    else if(t==='warning') warnings.push('console.warn: '+txt) });
  /* a request the page itself abandoned (navigation, a closed page) is not a failure */
  page.on('requestfailed',r=>{ const u=r.url(), why=(r.failure()&&r.failure().errorText)||''; (u.startsWith(base)&&!/ABORTED|NS_BINDING_ABORTED|cancel/i.test(why)?errors:warnings).push('request failed: '+u+' ('+why+')') });
  page.on('worker',w=>{ warnings.push('worker started: '+w.url().slice(0,80)) });

  console.log(`== ${BROWSER} ${browser.version()} at ${base}`);
  await page.goto(base+'#today',{waitUntil:'load'});
  check('page loads with every tab',await page.$$eval('nav.tabs .inner > a[data-view], #x-menu a[data-view]',b=>new Set(b.map(x=>x.dataset.view)).size)>=13);

  /* the board's squares: real mouse on the centre of a square */
  const center=async(board,sq)=>{ const el=await page.$(`#${board} .sq[data-sq="${sq}"]`); if(!el) return null; const b=await el.boundingBox(); return b&&[b.x+b.width/2,b.y+b.height/2] };
  async function tap(board,from,to){ const a=await center(board,from), b=await center(board,to); if(!a||!b) return false;
    await page.mouse.click(a[0],a[1]); await sleep(80); await page.mouse.click(b[0],b[1]); return true }
  async function drag(board,from,to){ const a=await center(board,from), b=await center(board,to); if(!a||!b) return false;
    await page.mouse.move(a[0],a[1]); await page.mouse.down(); await page.mouse.move((a[0]+b[0])/2,(a[1]+b[1])/2,{steps:6}); await page.mouse.move(b[0],b[1],{steps:6}); await page.mouse.up(); return true }
  async function rightDrag(board,from,to,mods=[]){ const a=await center(board,from), b=await center(board,to); if(!a||!b) return false;
    for(const k of mods) await page.keyboard.down(k);
    await page.mouse.move(a[0],a[1]); await page.mouse.down({button:'right'}); await page.mouse.move(b[0],b[1],{steps:6}); await page.mouse.up({button:'right'});
    for(const k of mods) await page.keyboard.up(k); return true }
  const go=async v=>{ await page.evaluate(v=>{ location.hash='#'+v },v); await waitFor(page,v=>document.body.dataset.view===v,v,5000); await sleep(250) };

  /* ---- the engine ---- */
  await go('play');
  const eng=await page.evaluate(async()=>{ const t=performance.now(); const a=await SharedEngine.analyse('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',10,1,15000);
    return {a,name:SharedEngine.name,why:SharedEngine.why,failed:SharedEngine.failed,ms:Math.round(performance.now()-t)} });
  check('Stockfish answers an analysis',eng.a&&eng.a.length&&eng.a[0].uci,`${eng.name||'no engine'} in ${eng.ms} ms${eng.why?'; '+eng.why:''}${eng.a&&eng.a[0]?'; best '+eng.a[0].uci:''}`);
  check('Stockfish 18 lite (WebAssembly) is the engine, not a fallback',/^Stockfish 18 lite$/.test(eng.name||''),eng.name+(eng.why?' — '+eng.why:''));
  const pl=await page.evaluate(async()=>SharedEngine.play('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',1500,300));
  check('Stockfish plays a move at limited strength',/^[a-h][1-8][a-h][1-8]/.test(pl||''),pl);

  /* ---- Play: drag e2-e4, the bot answers; take back ---- */
  await page.selectOption('#pl-elo','1400'); await page.selectOption('#pl-color','w'); await page.click('#pl-new'); await sleep(200);
  await drag('pl-board','e2','e4');
  check('Play: a dragged move is played',await waitFor(page,()=>PlayTab.state.moves[0]==='e4',null,3000),await page.evaluate(()=>PlayTab.state.moves.join(' ')));
  check('Play: the bot answers',await waitFor(page,()=>PlayTab.state.moves.length>=2,null,20000),await page.evaluate(()=>PlayTab.state.moves.join(' ')));
  await tap('pl-board','g1','f3');
  check('Play: a tapped move (click, click) is played',await waitFor(page,()=>PlayTab.state.moves[2]==='Nf3',null,3000),await page.evaluate(()=>PlayTab.state.moves.join(' ')));
  await waitFor(page,()=>PlayTab.state.moves.length>=4&&!PlayTab.state.busy,null,20000);
  if(await page.$('#pl-back')){
    await page.click('#pl-back'); await sleep(150);
    check('Play: Take back removes your move and the reply',await page.evaluate(()=>PlayTab.state.moves.length===2&&PlayTab.state.g.turn()==='w'),await page.evaluate(()=>PlayTab.state.moves.join(' ')));
  }
  /* arrows and circles */
  const hasShapes=await page.evaluate(()=>!!window.Shapes);
  if(hasShapes){
    await rightDrag('pl-board','d2','d4'); await sleep(100);
    check('Arrows: a right-drag draws an arrow',await page.evaluate(()=>{ const s=document.querySelector('#pl-board>svg.shapes'); return !!(s&&s.querySelector('line,polygon')) }));
    await rightDrag('pl-board','c2','c2',['Shift']); await sleep(100);
    check('Arrows: a right-click with Shift draws a red circle',await page.evaluate(()=>{ const s=document.querySelector('#pl-board>svg.shapes circle'); return !!s&&/c2410c/i.test(s.getAttribute('stroke')) }));
    const ctxPrevented=await page.evaluate(()=>{ const e=new MouseEvent('contextmenu',{bubbles:true,cancelable:true}); document.querySelector('#pl-board .sq').dispatchEvent(e); return e.defaultPrevented });
    check('Arrows: no context menu on the board',ctxPrevented);
    const a=await center('pl-board','h3'); await page.mouse.click(a[0],a[1]); await sleep(100);
    check('Arrows: a left click clears them',await page.evaluate(()=>!document.querySelector('#pl-board>svg.shapes')));
  }else soft('Arrows module present (window.Shapes)',false,'not implemented yet');
  await page.screenshot({path:path.join(OUT,'play-game.png')});

  /* ---- Openings: pick a preset, play a move with the mouse, the trainer judges it ---- */
  await go('openings');
  await page.click('#o-pick'); await sleep(150);
  const presetBtn=await page.$('#o-list button.drill:has-text("Italian Game")');
  if(presetBtn) await presetBtn.click(); else await page.evaluate(()=>OpeningsTab.selectOpening('preset-italian'));
  const oReady=await waitFor(page,()=>{ const S=OpeningsTab.state; return S.op&&S.phase==='await'&&!S.busy&&S.g.turn()==='w' },null,30000);
  check('Openings: preset loads and the book opponent replies',oReady,await page.evaluate(()=>OpeningsTab.state.log.map(e=>e.san).join(' ')));
  if(oReady){
    const before=await page.evaluate(()=>OpeningsTab.state.log.length);
    const mv=await page.evaluate(()=>{ const g=OpeningsTab.state.g; const m=g.moves({verbose:true}).find(m=>m.san==='c3')||g.moves({verbose:true}).find(m=>m.san==='d3')||g.moves({verbose:true})[0]; return [m.from,m.to,m.san] });
    await tap('o-board',mv[0],mv[1]);
    const judged=await waitFor(page,b=>{ const S=OpeningsTab.state; const t=document.getElementById('o-status').textContent; return (S.log.length>b||/isn.t|loses|Rare|Not a book|playable/.test(t))&&!/Checking/.test(t) },before,25000);
    check('Openings: your move is judged (book or Stockfish)',judged,`${mv[2]}: `+await page.evaluate(()=>document.getElementById('o-status').textContent.slice(0,140)));
    const oppReplied=await waitFor(page,b=>OpeningsTab.state.log.length>=b+2||OpeningsTab.state.phase==='done'||/isn.t|loses|Not a book/.test(document.getElementById('o-status').textContent),before,20000);
    check('Openings: the opponent answers again (or the miss is shown)',oppReplied);
    const tb=await page.$('#o-back');
    if(tb){ await waitFor(page,()=>OpeningsTab.state.phase==='await'&&!OpeningsTab.state.busy&&OpeningsTab.state.g.turn()==='w',null,15000);
      /* make sure there is a move of yours to take back: play the elite book's top move if the last one was a miss */
      if(!await page.evaluate(()=>OpeningsTab.canTakeBack())){
        const top=await page.evaluate(async()=>{ const bk=await Book.moves(OpeningsTab.state.g.fen(),'masters'); const r=bk.rows.slice().sort((a,b)=>b.share-a.share)[0]; return [r.uci.slice(0,2),r.uci.slice(2,4)] });
        const n1=await page.evaluate(()=>OpeningsTab.state.log.length);
        await tap('o-board',top[0],top[1]);
        await waitFor(page,n1=>OpeningsTab.state.log.length>=n1+2&&OpeningsTab.state.phase==='await'&&!OpeningsTab.state.busy,n1,20000) }
      const n0=await page.evaluate(()=>OpeningsTab.state.log.length);
      const can=await page.evaluate(()=>!document.getElementById('o-back').disabled);
      if(can){ await page.click('#o-back'); await sleep(150);
        check('Openings: Take back undoes your move and the reply',await page.evaluate(n0=>OpeningsTab.state.log.length<n0&&OpeningsTab.state.g.turn()==='w',n0),`${n0} -> `+await page.evaluate(()=>OpeningsTab.state.log.length)) }
    }
  }
  await page.screenshot({path:path.join(OUT,'openings-line.png')});

  /* ---- Anything as Black, and a new position set up with the mouse ---- */
  if(await page.evaluate(()=>!!OpeningsTab.customs)){
    await page.evaluate(()=>OpeningsTab.selectOpening('preset-any-black'));
    check('Anything as Black: the book plays White\'s first move',await waitFor(page,()=>{ const S=OpeningsTab.state; return S.op.id==='preset-any-black'&&S.log.length===1&&S.phase==='await' },null,20000));
    await page.click('#o-pick'); await page.click('#o-newpos'); await sleep(150);
    for(const [f,t] of [['e2','e4'],['g8','f6']]) await tap('o-npboard',f,t);
    await page.fill('#o-npname','Smoke Alekhine'); await page.selectOption('#o-npside','black'); await page.click('#o-npsave');
    check('New position: set up with the mouse, saved and trained',await waitFor(page,()=>{ const S=OpeningsTab.state; return S.op&&S.op.custom&&S.op.name==='Smoke Alekhine'&&S.log.length>=3&&S.phase==='await' },null,20000),await page.evaluate(()=>OpeningsTab.state.log.map(x=>x.san).join(' ')));
    await page.screenshot({path:path.join(OUT,'openings-custom.png')});
  } else soft('New position / Anything entries',false);

  /* ---- Tactics: the solution's first move with the mouse ---- */
  await go('tactics');
  await waitFor(page,()=>!!TacticsTab.lib&&TacticsTab.lib.length,null,20000);
  await page.click('#t-next'); await sleep(200);
  const tmv=await page.evaluate(()=>{ const S=TacticsTab.state; const u=S.cur.moves[S.step]; return [u.slice(0,2),u.slice(2,4),S.step] });
  await tap('t-board',tmv[0],tmv[1]);
  check('Tactics: the right move is accepted',await waitFor(page,s=>TacticsTab.state.step>s,tmv[2],4000),tmv.join(' '));
  /* a wrong move, then (when it exists) Take back to retry */
  await page.click('#t-next'); await sleep(200);
  const wrong=await page.evaluate(()=>{ const S=TacticsTab.state; const u=S.cur.moves[S.step]; const m=S.g.moves({verbose:true}).find(m=>m.from+m.to!==u.slice(0,4)&&!(()=>{const g=new Chess(S.g.fen());g.move(m);return g.in_checkmate()})()); return m?[m.from,m.to]:null });
  if(wrong){ await tap('t-board',wrong[0],wrong[1]); await sleep(300);
    check('Tactics: a wrong move is marked',await page.evaluate(()=>/isn.t it|Not quite/.test(document.getElementById('t-status-box').textContent)),wrong.join('')+': '+await page.evaluate(()=>document.getElementById('t-status-box').textContent.slice(0,90)));
    if(await page.$('#t-back')){ const vis=await page.evaluate(()=>{ const b=document.getElementById('t-back'); return b&&!b.hidden&&!b.disabled });
      if(vis){ await page.click('#t-back'); await sleep(150); check('Tactics: Take back gives a retry',await page.evaluate(()=>TacticsTab.state.retry===true||/Try again|retry/i.test(document.getElementById('t-status-box').textContent))) } } }
  await page.screenshot({path:path.join(OUT,'tactics.png')});

  /* ---- Calculation: enter the solution's first move, submit ---- */
  await go('calc');
  await waitFor(page,()=>!!CalcTab.lib&&CalcTab.lib.length,null,20000);
  await page.click('#cc-start'); await sleep(200);
  const cmv=await page.evaluate(()=>{ const u=CalcTab.state.cur.moves[1]; return [u.slice(0,2),u.slice(2,4)] });
  await tap('cc-board',cmv[0],cmv[1]);
  check('Calculation: a move enters the line',await waitFor(page,()=>CalcTab.state.line.length===1,null,3000));
  await page.click('#cc-submit');
  check('Calculation: Submit grades the line',await waitFor(page,()=>CalcTab.state.sub,null,15000),await page.evaluate(()=>document.getElementById('cc-status').textContent.slice(0,100)));
  await page.screenshot({path:path.join(OUT,'calc.png')});

  /* ---- Endgames: the tablebase's best move; the defence replies ---- */
  await go('endgames');
  await waitFor(page,()=>!!EndgamesTab.data&&EndgamesTab.data.positions.length,null,20000);
  await page.click('#eg-next'); await sleep(200);
  const emv=await page.evaluate(()=>{ const S=EndgamesTab.state; const n=S.cur.nodes&&S.cur.nodes[normKey(S.g.fen())]; const s=n&&(n.b||n.w||n.d)||S.cur.line[0]; const u=s.split(' ')[0]; return [u.slice(0,2),u.slice(2,4)] });
  await tap('eg-board',emv[0],emv[1]);
  check('Endgames: a move is graded and the defence replies',await waitFor(page,()=>EndgamesTab.state.hist.length>=2||EndgamesTab.state.phase==='done',null,20000),await page.evaluate(()=>document.getElementById('eg-status').textContent.slice(0,100)));
  await page.screenshot({path:path.join(OUT,'endgames.png')});

  /* ---- Drills: a saved drill (as Analyze my games makes them), judged by Stockfish ---- */
  await page.evaluate(()=>{ Store.put('adrills',[{id:'atest0001',kind:'mine',fen:'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3',color:'w',played:'a3',playedUci:'a2a3',best:null,
    opp:'Test opponent',date:'2026-11-01',drop:0.12,before:0.4,url:'https://lichess.org/'}]) });
  await go('drills');
  await page.click('#d-list button.drill'); await sleep(200);
  await tap('d-board','d2','d4');
  check('Drills: Stockfish judges your move',await waitFor(page,()=>{ const t=document.getElementById('d-status').textContent; return !/Checking/.test(t)&&(DrillsTab.state.done||/still gives|Could not|isn/.test(t)) },null,25000),await page.evaluate(()=>document.getElementById('d-status').textContent.slice(0,120)));
  await page.screenshot({path:path.join(OUT,'drills.png')});

  /* ---- Today: the session is played right here (Chess Lab's Today): the drill on Today's board, scored by the Drills code ---- */
  await page.evaluate(()=>{ Store.del('today'); Store.put('adrills',[{id:'atest0002',kind:'mine',fen:'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3',color:'w',played:'a3',playedUci:'a2a3',best:'f1b5',
    opp:'Today opponent',date:'2026-11-02',drop:0.12,before:0.4,url:'https://lichess.org/'}]) });
  await go('today');
  check('Today: the first item is on Today’s board (the Drills panel, hosted)',await waitFor(page,()=>TodayTab.hosted==='drill'&&DrillsTab.state.cur&&DrillsTab.state.cur.id==='atest0002'&&document.getElementById('td-grid').contains(document.getElementById('d-board')),null,10000));
  await page.$eval('#d-board',e=>e.scrollIntoView({block:'center'})); await sleep(150);
  await tap('d-board','f1','b5');
  check('Today: solving it there ticks it off (stored by Drills under its own key)',await waitFor(page,()=>{ const p=Store.get('adrills-progress')||{}; return p.atest0002&&p.atest0002.ok&&/1 of/.test(document.getElementById('td-head').textContent) },null,10000),await page.evaluate(()=>document.getElementById('td-head').textContent));
  await page.screenshot({path:path.join(OUT,'today-played.png')});
  await go('drills');
  check('Today: leaving gives the board back to Drills',await page.evaluate(()=>document.getElementById('drills').contains(document.getElementById('d-board'))&&TodayTab.hosted===null));

  /* ---- Guess the move: theory plays itself; guess the game move ---- */
  await go('guess');
  await waitFor(page,()=>document.querySelectorAll('#g-list button.drill').length>0,null,10000);
  await page.click('#g-list button.drill');
  const gReady=await waitFor(page,()=>{ const S=GtmTab.state; return S.game&&S.ply>=S.game.theory&&!S.busy&&((S.ply%2===0?'w':'b')===S.game.winner)&&/your move/.test(document.getElementById('g-status').textContent) },null,30000);
  check('Guess the move: the game reaches your first guess',gReady);
  if(gReady){ const p0=await page.evaluate(()=>GtmTab.state.ply);
    const gmv=await page.evaluate(()=>{ const S=GtmTab.state; const m=new Chess(S.g.fen()).move(S.game.moves[S.ply]); return [m.from,m.to] });
    await tap('g-board',gmv[0],gmv[1]);
    check('Guess the move: the guess is scored',await waitFor(page,p=>GtmTab.state.ply>p&&GtmTab.state.rows.length>0,p0,10000),await page.evaluate(()=>document.getElementById('g-status').textContent.slice(0,100))) }
  await page.screenshot({path:path.join(OUT,'guess.png')});

  /* ---- Watch: add a video by its link ---- */
  if(await page.$('#wa-aurl')){
  await go('watch'); await page.evaluate(()=>{ document.getElementById('wa-addcard').open=true });
  await page.fill('#wa-aurl','https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=90'); await page.fill('#wa-atitle','1. A test lecture'); await page.fill('#wa-aser','Test course');
  await page.click('#wa-asave'); await sleep(150);
  check('Watch: a video is added and deep-links at your position',await page.evaluate(()=>{ const a=document.querySelector('#wa-list a.watitle'); return !!a&&/t=90s/.test(a.href) }));
  } else soft('Watch tab present',false);

  /* ---- Players: a public Lichess account, what they play, Train vs ----
     On recorded fixtures (Lichess's NDJSON game export, Chess.com's archives), as the jsdom tests do, so an outage at
     Lichess can't fail the site's check. The one live call is the separate, labelled check after this block. */
  const ndjson=(()=>{ const out=[], t0=Date.UTC(2026,9,1);
    const g=(i,white,black,winner,moves,speed)=>({id:'fx'+String(i).padStart(6,'0'),rated:true,variant:'standard',speed,perf:speed,createdAt:t0+i*36e5,status:winner?'resign':'draw',
      players:{white:{user:{name:white,id:white.toLowerCase()},rating:white==='suhaasn'?2210:2050+i},black:{user:{name:black,id:black.toLowerCase()},rating:black==='suhaasn'?2210:2040+i}},...(winner?{winner}:{}),moves});
    for(let i=0;i<6;i++) out.push(g(i,'suhaasn','opp'+i,i<4?'white':'black','d4 Nf6 c4 e6 Nf3 d5 Nc3 Be7 Bf4 O-O e3 c5','blitz'));
    for(let i=6;i<10;i++) out.push(g(i,'opp'+i,'suhaasn',i<8?'black':null,'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5','rapid'));
    return out.map(j=>JSON.stringify(j)).join('\n')+'\n' })();
  const cors={'Access-Control-Allow-Origin':'*'};
  await page.route(/^https:\/\/lichess\.org\/api\/games\/user\//,r=>r.fulfill({status:200,headers:{...cors,'Content-Type':'application/x-ndjson'},body:ndjson}));
  await page.route(/^https:\/\/api\.chess\.com\/pub\/player\//,r=>r.fulfill({status:200,headers:{...cors,'Content-Type':'application/json'},body:JSON.stringify(/archives$/.test(r.request().url())?{archives:[]}:{games:[]})}));
  if(!await page.$('#p-form')) soft('Players tab present',false); else {
  await go('players');
  await page.selectOption('#p-site','lichess'); await page.fill('#p-user','suhaasn'); await page.click('#p-go');
  const plOk=await waitFor(page,()=>(Store.get('players-index')||[]).length>0||/No such|answered|reach|wait/.test(document.getElementById('p-err').textContent),null,40000);
  const plMsg=await page.evaluate(()=>document.getElementById('p-err').textContent);
  if(plOk&&await page.evaluate(()=>(Store.get('players-index')||[]).length>0)){
    check('Players: their public games are fetched',true,plMsg);
    const ub=await page.$('#p-view [data-uci]'); if(ub){ await ub.click(); await sleep(100) }
    check('Players: the explorer plays their move on the board',await page.evaluate(()=>PlayersTab.state.line.length===1));
    await page.screenshot({path:path.join(OUT,'players.png')});
    await page.click('#p-view [data-act="sheet"]'); await sleep(150);
    check('Players: the pre-round sheet renders',await page.evaluate(()=>/Line to expect/.test(document.getElementById('p-sheet').textContent)));
    await page.screenshot({path:path.join(OUT,'players-sheet.png'),fullPage:true});
    await page.click('#p-sheet [data-train="b"]');
    check('Players: Train vs opens the trainer and the opponent plays their move',await waitFor(page,()=>{ const S=OpeningsTab.state; return S.op&&S.op.player&&S.log.length>=1&&S.phase==='await' },null,20000),await page.evaluate(()=>document.getElementById('o-status').textContent.slice(0,120)));
  } else check('Players: their public games are fetched (recorded fixture)',false,plMsg);
  }
  await page.unroute(/^https:\/\/lichess\.org\/api\/games\/user\//); await page.unroute(/^https:\/\/api\.chess\.com\/pub\/player\//);

  /* ---- LIVE (the one check that needs the internet): Lichess's game export answers this page. Informational: a 5xx, a rate
     limit or no answer (an outage at Lichess, not the site) is a warning; anything else that isn't games is a failure. ---- */
  { inLive=true;
    const live=await page.evaluate(async()=>{ const c=new AbortController(), t=setTimeout(()=>c.abort(),20000);
      try{ const r=await fetch('https://lichess.org/api/games/user/suhaasn?max=1&moves=true',{headers:{Accept:'application/x-ndjson'},signal:c.signal}); const txt=r.ok?await r.text():'';
        return {status:r.status,games:txt.trim()?txt.trim().split('\n').length:0} }
      catch(e){ return {status:0,why:String(e&&e.message||e)} } finally{ clearTimeout(t) } });
    await sleep(300); inLive=false;
    if(live.status===200&&live.games>0) check('LIVE (informational): Lichess’s game export answers this page',true,live.games+' game');
    else if(live.status===0||live.status===429||live.status>=500) warnings.push('LIVE (informational): Lichess did not answer ('+(live.status||live.why)+'); an outage there, not a site failure');
    else check('LIVE (informational): Lichess’s game export answers this page',false,'status '+live.status+', '+live.games+' games');
  }

  /* ---- every tab, light and dark, desktop and phone ---- */
  const VIEWS=await page.$$eval('nav.tabs .inner > a[data-view], #x-menu a[data-view]',bs=>[...new Set(bs.map(b=>b.dataset.view))]);
  const themes=await page.evaluate(()=>Settings.DEF.theme!==undefined?['light','dark']:['light']);
  for(const theme of themes) for(const [vw,w,h] of [['desktop',1280,900],['phone',390,844]]){
    await page.setViewportSize({width:w,height:h});
    if(theme!=='light'||themes.length>1) await page.evaluate(t=>Settings.set('theme',t),theme);
    for(const v of VIEWS){ await go(v); await sleep(200);
      const sw=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
      if(vw==='phone') check(`no sideways scroll on ${v} (phone, ${theme})`,!sw);
      await page.screenshot({path:path.join(OUT,`${v}-${vw}-${theme}.png`),fullPage:vw==='phone'});
      if(process.env.DUMP) await page.screenshot({path:path.join(OUT,'small',`${v}-${vw}-${theme}.jpg`),type:'jpeg',quality:42}) }
  }
  if(themes.length>1){ await page.evaluate(()=>Settings.set('theme','auto')); }

  /* ---- a touch screen at phone width: tap a piece, tap its square ---- */
  try{
    const tctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true});
    const tp=await tctx.newPage(); tp.on('pageerror',e=>errors.push('pageerror (touch): '+(e&&e.message||e)));
    await tp.goto(base+'#play',{waitUntil:'load'}); await waitFor(tp,()=>document.body.dataset.view==='play',null,5000);
    await tp.selectOption('#pl-color','w'); await tp.tap('#pl-new'); await sleep(200);
    const tc=async sq=>{ await (await tp.$(`#pl-board .sq[data-sq="${sq}"]`)).tap(); await sleep(150) };   /* scrolls the square into view, then taps it */
    await tc('d2'); await tc('d4');
    check('Touch: tapping a piece and then its square plays the move',await waitFor(tp,()=>PlayTab.state.moves[0]==='d4',null,3000),await tp.evaluate(()=>PlayTab.state.moves.join(' ')));
    await tctx.close();
  }catch(e){ warnings.push('touch check could not run here: '+(e.message||e)) }

  check('no page errors or console errors',!errors.length,errors.slice(0,12).join(' | '));
  fs.writeFileSync(path.join(OUT,'summary.json'),JSON.stringify({browser:BROWSER,version:browser.version(),engine:eng,results,errors,warnings},null,1));
  console.log(`\n${BROWSER}: ${results.length-failed}/${results.length} checks passed; ${errors.length} errors, ${warnings.length} warnings`);
  if(errors.length) console.log('errors:\n  '+errors.join('\n  '));
  if(warnings.length) console.log('warnings:\n  '+warnings.slice(0,30).join('\n  '));
  /* the screenshots as text in the log too (DUMP=1): artifacts can't always be downloaded where they're reviewed */
  if(process.env.DUMP){ const dir=path.join(OUT,'small'); for(const f of fs.readdirSync(dir).sort()){ const b=fs.readFileSync(path.join(dir,f)).toString('base64');
    console.log('SHOT:'+f); for(let i=0;i<b.length;i+=3000) console.log('B64:'+b.slice(i,i+3000)); console.log('END:'+f) } }
  await browser.close(); if(srv) srv.close();
  process.exit(failed?1:0);
})().catch(e=>{ console.error(e); process.exit(2) });
