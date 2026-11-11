/* Chess Lab Open — the arrow keys through side lines, pressed for real (Playwright keyboard.press), in Firefox and Chromium.
     node tests/browser/keys.js <firefox|chromium>
   Guess the move with your own PGN that has side lines (one nested): click the board once, then only keys:
   ← → along the game, ↓ ↑ cycle the three moves at a branch (two side lines + the game's move), → into a side line and
   along it (its own next move before a nested line), ← back out to the game at the branch, → follows the game again.
   Also: the arrows never scroll the page, and a drop-down gives the arrows back after a pick.
   CHROME=/path/to/chrome uses that Chromium build (the Claude workspace has no Playwright download). */
'use strict';
const http=require('http'), fs=require('fs'), path=require('path');
const pw=require('playwright');
const BROWSER=process.argv[2]||'chromium';
const SITE=path.join(__dirname,'..','..','site');
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json',
  '.wasm':'application/wasm','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png','.txt':'text/plain; charset=utf-8'};
function serve(){ return new Promise(res=>{ const srv=http.createServer((req,rsp)=>{
    let p=decodeURIComponent(req.url.split('?')[0].split('#')[0]); if(p.endsWith('/')) p+='index.html';
    const f=path.join(SITE,path.normalize(p).replace(/^(\.\.[/\\])+/,''));
    if(!f.startsWith(SITE)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){ rsp.writeHead(404); rsp.end('not found'); return }
    rsp.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream','Cache-Control':'no-store'}); fs.createReadStream(f).pipe(rsp) });
  srv.listen(0,'127.0.0.1',()=>res(srv)) }) }
let failed=0; const check=(name,ok,detail='')=>{ if(!ok) failed++; console.log((ok?'  ok   ':'  FAIL ')+name+(detail?' — '+detail:'')) };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const PGN=`[White "Key, Test"]
[Black "Side, Lines"]
[Result "1-0"]

1. e4 e5 (1... c5 2. Nf3 d6 (2... Nc6 3. d4) 3. d4) (1... e6 2. d4 d5) 2. Nf3 Nc6 3. Bb5 a6 1-0`;

(async()=>{
  const srv=await serve(), base=`http://127.0.0.1:${srv.address().port}/`;
  const browser=await pw[BROWSER].launch(BROWSER==='chromium'&&process.env.CHROME?{executablePath:process.env.CHROME}:{});
  const page=await (await browser.newContext({viewport:{width:1280,height:560}})).newPage();
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  console.log(`== keys in ${BROWSER} ${browser.version()}`);
  await page.goto(base+'#guess',{waitUntil:'load'}); await sleep(800);
  const st=()=>page.evaluate(()=>{ const S=GtmTab.state; return {view:S.view,vr:S.vr?S.vr.path.slice(0,S.vr.at).join(' '):null,
    pick:(()=>{ const b=document.querySelector('#g-moves .vpick'); return b?(b.dataset.vp||'main:'+b.dataset.ply):null })(),
    y:scrollY,act:document.activeElement&&document.activeElement.tagName} });
  const press=async(k,n=1)=>{ for(let i=0;i<n;i++){ await page.keyboard.press(k); await sleep(40) } };

  // add the game; the side drop-down hands the arrows back after a pick
  await page.click('#g-src input[value="own"]',{force:true}); await sleep(150);
  await page.click('#g-add'); await page.focus('#g-addside'); await page.keyboard.press('ArrowDown'); await sleep(80);
  check('a drop-down loses focus after a pick (the arrows are the board\'s again)',(await st()).act!=='SELECT',(await st()).act);
  await page.fill('#g-addbox',PGN); await page.click('#g-addsave'); await sleep(1500);
  await page.click('#g-show'); await sleep(400);
  const box=await page.locator('#g-board').boundingBox(); await page.mouse.click(box.x+box.width/2,box.y+box.height/2); await sleep(100);   // one click on the board

  await press('Home'); await press('ArrowRight');
  let s=await st(); check('→ steps along the game',s.view===1&&!s.vr,JSON.stringify(s));
  await page.evaluate(()=>scrollTo(0,40)); await sleep(50); const tall=await page.evaluate(()=>document.documentElement.scrollHeight>innerHeight+40);
  const y0=(await st()).y, picks=[];
  for(let i=0;i<4;i++){ await press('ArrowDown'); picks.push((await st()).pick) }
  check('↓ cycles the three moves at the branch: both side lines, the game move, round again',
    picks[0]==='e4 c5'&&picks[1]==='e4 e6'&&picks[2]==='main:2'&&picks[3]==='e4 c5',picks.join(' | '));
  await press('ArrowUp'); s=await st(); check('↑ goes back the other way',s.pick==='main:2',s.pick);
  check('the arrows never scroll the page',tall&&s.y===y0,`${tall?'':'(page not tall enough to tell) '}${y0} -> ${s.y}`);
  await press('ArrowDown'); await press('ArrowRight'); s=await st();
  check('→ plays the picked side line',s.vr==='e4 c5',JSON.stringify(s));
  await press('ArrowRight'); await press('ArrowRight'); s=await st();
  check('→ keeps going along it, its own move before a nested line',s.vr==='e4 c5 Nf3 d6',s.vr);
  await press('ArrowRight'); await press('ArrowRight'); s=await st(); check('and stops at its end',s.vr==='e4 c5 Nf3 d6 d4',s.vr);
  await press('ArrowLeft',2); s=await st(); check('← steps back along it',s.vr==='e4 c5 Nf3',s.vr);
  await press('ArrowDown'); await press('ArrowRight'); s=await st(); check('↓ then → takes the nested line',s.vr==='e4 c5 Nf3 Nc6',s.vr);
  await press('ArrowLeft',3); s=await st(); check('← from a side line\'s first move goes back to the game at the branch',!s.vr&&s.view===1,JSON.stringify(s));
  await press('ArrowRight'); s=await st(); check('→ then follows the game',!s.vr&&s.view===2,JSON.stringify(s));
  check('no page errors',!errors.length,errors.join(' | '));
  { const o=path.join(__dirname,'out',BROWSER); fs.mkdirSync(o,{recursive:true}); await page.screenshot({path:path.join(o,'keys.png')}) }
  await browser.close(); srv.close();
  console.log(failed?`${failed} FAILED`:'all key checks passed'); process.exit(failed?1:0);
})().catch(e=>{ console.error(e); process.exit(1) });
