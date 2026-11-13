/* Chess Lab Open — Blind tactics and Retry the miss on phones, in a real browser (Playwright), Firefox and Chromium.
     node tests/browser/blind.js <firefox|chromium> [outDir]      (CHROME=<path> runs a local Chrome as chromium)
   Blind tactics: a move typed in the box (real key presses, Enter) and one by clicking two squares are read in the hidden
   position while the board stays put; P peeks for 2 s and marks the puzzle assisted; G gives up; no shortcut fires while
   typing; no Stockfish worker or .wasm on the tab; on phones a bottom bar (Next, Peek, Give up, Flip) with 44 px targets
   and no sideways scroll on an iPhone SE (375 and 320 px). Openings: after a line with a miss, Retry the miss sits in the
   bar on the board beside Next line and Redo, the buttons on one line on an iPhone SE; laptops don't show it there.
   Screenshots: laptop, iPad and phone, light and dark. */
'use strict';
const http=require('http'), fs=require('fs'), path=require('path');
const pw=require('playwright');
const BROWSER=process.argv[2]||'chromium';
const OUT=path.resolve(process.argv[3]||path.join(__dirname,'out',BROWSER,'blind'));
const SITE=path.join(__dirname,'..','..','site');
fs.mkdirSync(OUT,{recursive:true});
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.wasm':'application/wasm','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png'};
const SENT=[];
function serve(){ return new Promise(res=>{ const srv=http.createServer((req,rsp)=>{ let p=decodeURIComponent(req.url.split('?')[0].split('#')[0]); if(p.endsWith('/')) p+='index.html';
  const f=path.join(SITE,path.normalize(p).replace(/^(\.\.[/\\])+/,'')); if(!f.startsWith(SITE)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){ rsp.writeHead(404); rsp.end(); return }
  SENT.push(p); rsp.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream','Cache-Control':'no-store'}); fs.createReadStream(f).pipe(rsp) }); srv.listen(0,'127.0.0.1',()=>res(srv)) }) }
let fails=0; const ok=(c,m)=>{ console.log((c?'  ok   ':'  FAIL ')+m); if(!c) fails++ };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const until=async(pg,f,ms=8000,arg)=>{ const t=Date.now(); while(Date.now()-t<ms){ if(await pg.evaluate(f,arg)) return true; await sleep(100) } return false };
const WATCH=()=>{ const W=window.Worker; window.__workers=0; window.Worker=function(u,o){ window.__workers++; return new W(u,o) }; window.Worker.prototype=W.prototype };
(async()=>{
  const srv=await serve(), base=`http://127.0.0.1:${srv.address().port}/`;
  const browser=await pw[BROWSER].launch(BROWSER==='chromium'&&process.env.CHROME?{executablePath:process.env.CHROME}:{});
  console.log(`== Blind tactics in ${BROWSER} ${browser.version()}`);
  const ctx=await browser.newContext({viewport:{width:1280,height:860}}); const pg=await ctx.newPage(); const errors=[];
  pg.on('pageerror',e=>errors.push(e.message)); pg.on('console',m=>{ if(m.type()==='error') errors.push(m.text()) });
  await pg.addInitScript(WATCH);
  await pg.goto(base+'index.html#blind');
  ok(await until(pg,()=>window.BlindTab&&BlindTab.api&&BlindTab.api.lib&&BlindTab.api.state.cur,20000),'the set loads and a puzzle opens');
  const board=()=>pg.evaluate(()=>[...document.querySelectorAll('#blind .board .sq')].map(q=>q.dataset.sq+(q.querySelector('.pc')?q.querySelector('.pc').className:'')).join());
  const S=()=>pg.evaluate(()=>{ const s=BlindTab.api.state; return {id:s.cur&&s.cur.id,step:s.step,solved:s.solved,gaveUp:s.gaveUp,assisted:s.assisted,log:s.log.length,sol:s.cur&&s.cur.sol,real:s.real&&s.real.fen()} });
  ok(await pg.evaluate(()=>document.activeElement&&document.activeElement.matches('#blind input[type=text]')),'the move box has focus');
  /* a clean solve: the first move typed (SAN, Enter), the next by clicking squares */
  let s=await S(); const b0=await board();
  const san=await pg.evaluate(()=>{ const s=BlindTab.api.state, u=s.cur.sol[0]; const g=new Chess(s.real.fen()); return g.move({from:u.slice(0,2),to:u.slice(2,4),promotion:u[4]||undefined}).san });
  await pg.keyboard.type(san); await pg.keyboard.press('Enter'); await sleep(600);
  s=await S(); ok(s.step>=1&&(await board())===b0,`typed ${san} + Enter: accepted, the board didn't move`);
  for(let i=2;i<s.sol.length&&!(await S()).solved;i+=2){ const u=s.sol[i];
    await pg.click(`#blind .board .sq[data-sq="${u.slice(0,2)}"]`); await pg.click(`#blind .board .sq[data-sq="${u.slice(2,4)}"]`); await sleep(600) }
  s=await S(); ok(s.solved,'clicking from- and to-squares plays the rest: solved');
  ok(await pg.evaluate(id=>{ const p=JSON.parse(localStorage.getItem('clo:blind-progress')||'{}')[id]; return p&&p.ok===true },s.id),'first try: stored as solved');
  /* keys: N next; typing a P in the box is a move, not a peek; Esc, then P peeks */
  await pg.locator('#blind .board').click({position:{x:2,y:2}}).catch(()=>{}); await pg.evaluate(()=>document.activeElement&&document.activeElement.blur());
  await pg.keyboard.press('n'); await sleep(200);
  const s2=await S(); ok(s2.id!==s.id,'N: the next puzzle');
  await pg.focus('#blind input[type=text]'); await pg.keyboard.type('p'); await sleep(100);
  ok(!(await S()).assisted&&await pg.inputValue('#blind input[type=text]')==='p','P while typing goes into the box, no peek');
  await pg.keyboard.press('Escape'); await pg.keyboard.press('Backspace'); await pg.keyboard.press('p'); await sleep(250);
  const peeked=await pg.evaluate(()=>{ const s=BlindTab.api.state, g=new Chess(s.real.fen()); return [...document.querySelectorAll('#blind .board .sq')].every(q=>{ const p=g.get(q.dataset.sq), pc=q.querySelector('.pc'); return p?!!pc&&pc.classList.contains(p.color+p.type.toUpperCase()):!pc }) });
  ok((await S()).assisted&&peeked,'Esc, then P: the board shows the real position, the puzzle is assisted');
  await sleep(2200); ok(!(await pg.evaluate(()=>document.querySelector('#blind .board').classList.contains('bl-peek'))),'… and goes back after 2 s');
  await pg.keyboard.press('g'); ok(await until(pg,()=>BlindTab.api.state.gaveUp&&BlindTab.api.state.ri===BlindTab.api.state.review.length-1,20000),'G: the hidden moves and the solution play on the board');
  ok(await pg.evaluate(()=>window.__workers)===0&&!SENT.some(p=>/\.wasm$/.test(p)),'no Stockfish worker and no .wasm on this tab');
  await pg.evaluate(()=>BlindTab.api.next()); await sleep(200);
  /* screenshots: laptop, iPad, phone; light and dark */
  for(const theme of ['light','dark']){ await pg.evaluate(t=>Settings.set('theme',t),theme);
    for(const [n,w,h] of [['laptop',1280,860],['ipad',820,1180],['phone',390,844]]){ await pg.setViewportSize({width:w,height:h}); await sleep(250);
      await pg.screenshot({path:path.join(OUT,`blind-${n}-${theme}.png`),fullPage:n!=='laptop'}) } }
  await pg.evaluate(()=>Settings.set('theme','auto'));
  /* phones: the bottom bar, 44 px targets, no sideways scroll on an iPhone SE */
  for(const [w,h] of [[375,667],[320,568]]){ await pg.setViewportSize({width:w,height:h}); await sleep(250);
    const m=await pg.evaluate(()=>{ const bar=document.querySelector('#blind .bl-bar'), r=bar.getBoundingClientRect(), bs=[...bar.querySelectorAll('.btn')].map(b=>b.getBoundingClientRect());
      return {fixed:getComputedStyle(bar).position==='fixed',bottom:Math.round(innerHeight-r.bottom),min:Math.min(...bs.map(b=>Math.min(b.height,b.width))),rows:new Set(bs.map(b=>Math.round(b.top))).size,
        side:document.documentElement.scrollWidth>innerWidth+1,box:document.querySelector('#blind input[type=text]').getBoundingClientRect().height} });
    ok(m.fixed&&m.bottom===0&&m.rows===1&&m.min>=44&&!m.side&&m.box>=44,`iPhone SE ${w} px: bottom bar on one row, buttons ${Math.round(m.min)} px, move box ${Math.round(m.box)} px, no sideways scroll`) }
  await pg.screenshot({path:path.join(OUT,'blind-phone-se320.png'),fullPage:true});
  /* Openings: Retry the miss in the bar on the board, phones only */
  await pg.setViewportSize({width:375,height:667});
  await pg.evaluate(async()=>{ location.hash='#progress'; const $=id=>document.getElementById(id); localStorage.setItem('clo-settings',JSON.stringify(Object.assign(JSON.parse(localStorage.getItem('clo-settings')||'{}'),{omode:'rated',evalCol:false,osfinfo:false})));
    $('o-pgnbox').value='[Event "Rep"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O *'; $('o-repname').value='Retry test'; $('o-repside').value='white'; await OpeningsTab.doImport() });
  await pg.evaluate(()=>{ location.hash='#openings' }); await sleep(800);
  ok(await until(pg,()=>{ const S=OpeningsTab.state; return S.op&&S.op.rep&&S.phase==='await' },10000),'Openings: the repertoire is open');
  const playLine=async miss=>{ for(let i=0;i<40;i++){ const st=await pg.evaluate(()=>{ const S=OpeningsTab.state; return {done:S.phase==='done',mine:S.phase==='await'&&!S.busy&&S.g.turn()==='w',ply:S.g.history().length} });
      if(st.done) return; if(!st.mine){ await sleep(120); continue }
      if(st.ply===miss){ await pg.evaluate(()=>OpeningsTab.userMove('a2','a3')); await until(pg,()=>!OpeningsTab.state.busy,4000) }
      const u=await pg.evaluate(()=>{ const S=OpeningsTab.state; return (OpeningsTab.repMap(S.op.id).get(posId(normKey(S.g.fen())))||[])[0]||null }); if(!u) return;
      await pg.evaluate(u=>OpeningsTab.userMove(u.slice(0,2),u.slice(2,4)),u); await sleep(200) } };
  await playLine(2); await until(pg,()=>OpeningsTab.state.phase==='done',8000);
  for(const [w,h] of [[375,667],[320,568]]){ await pg.setViewportSize({width:w,height:h}); await sleep(200);
    const m=await pg.evaluate(()=>{ const bs=[...document.querySelectorAll('#o-endbar .endbtns .btn')].filter(b=>b.offsetParent); const r=document.getElementById('o-endretry');
      return {pin:document.querySelector('#openings .otrain').classList.contains('pin'),n:bs.length,retry:!!r.offsetParent,rows:new Set(bs.map(b=>Math.round(b.getBoundingClientRect().top))).size,wrapped:bs.some(b=>b.getBoundingClientRect().height>40),
        inside:bs.every(b=>b.getBoundingClientRect().right<=document.getElementById('o-endbar').getBoundingClientRect().right+0.5),dims:bs.map(b=>Math.round(b.getBoundingClientRect().width)).join('+')+' in '+Math.round(document.getElementById('o-endbar').getBoundingClientRect().width),side:document.documentElement.scrollWidth>innerWidth+1} });
    ok(m.retry&&m.n===(m.pin?2:3)&&m.rows===1&&!m.wrapped&&m.inside&&!m.side,`iPhone SE ${w} px: Redo and Retry the miss on one line in the bar, Next line beside them or (pinned board) in the row under it (${JSON.stringify(m)})`) }
  await pg.locator('#o-boardbox').screenshot({path:path.join(OUT,'openings-endbar-retry-se.png')});
  await pg.setViewportSize({width:1280,height:860}); await sleep(200);
  ok(await pg.evaluate(()=>!document.getElementById('o-endretry').offsetParent&&!!document.querySelector('#o-status .endretry, #o-status [data-retry]')),'laptop: not in the bar; the end card keeps Retry the miss');
  await pg.setViewportSize({width:375,height:667}); await sleep(150);
  await pg.click('#o-endretry'); ok(await until(pg,()=>{ const S=OpeningsTab.state; return S.phase==='await'&&S.log.length===2 },5000),'tapping it retries from the miss');
  ok(!errors.length,'no page or console errors'+(errors.length?': '+errors.slice(0,3).join(' | '):''));
  await browser.close(); srv.close(); console.log(fails?fails+' FAILURES':'All Blind tactics / Retry checks passed.'); process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1) });
