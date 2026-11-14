/* Chess Lab Open — the 14 Nov 2026 phone fixes, checked in a real browser (Playwright; Firefox, Chromium and WebKit in CI).
     node tests/browser/phonefix.js <firefox|chromium|webkit> [outDir]        CHROME=<path>: a local Chrome
   1  The bottom bar (shared/trainview.js TV.bar): on a phone and an upright iPad every board page's buttons are one bar
      fixed to the bottom of the screen, ‹ in the far left corner and › in the far right one, every button at least 44 px,
      on one line, inside the screen; on a laptop the row is where it always was and there is no ⋯.
   2  Pinned board (TV.pin): in Calculation and Guess the move on a phone the board stays under the tab row while the
      page scrolls, and ‹ › step through the line.
   3  The reader: its notes never lie over its bottom bar, and ‹ › and Flip work.
   Exit code 1 when a check fails. The in-page checks (BAR, below) are the same text as the private kit's tools/review/phonefix.js. */
'use strict';
const http=require('http'), fs=require('fs'), path=require('path');
const {chromium,firefox,webkit}=require('playwright');
const BROWSER=process.argv[2]||'chromium';
const OUT=path.resolve(process.argv[3]||path.join(__dirname,'out',BROWSER,'phonefix'));
const SITE=path.join(__dirname,'..','..','site');
fs.mkdirSync(OUT,{recursive:true});
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json',
  '.wasm':'application/wasm','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png','.woff2':'font/woff2','.txt':'text/plain; charset=utf-8'};
function serve(){ return new Promise(res=>{ const srv=http.createServer((req,rsp)=>{
  let p=decodeURIComponent(req.url.split('?')[0].split('#')[0]); if(p.endsWith('/')) p+='index.html';
  const f=path.join(SITE,path.normalize(p).replace(/^(\.\.[/\\])+/,''));
  if(!f.startsWith(SITE)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){ rsp.writeHead(404); rsp.end('not found'); return }
  rsp.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream','Cache-Control':'no-store'}); fs.createReadStream(f).pipe(rsp) });
  srv.listen(0,'127.0.0.1',()=>res(srv)) }) }
let failed=0; const check=(name,ok,detail='')=>{ if(!ok) failed++; console.log((ok?'  ok   ':'  FAIL ')+name+(detail?' — '+detail:'')) };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

/* Runs in the page: measures the bar inside `sel` (the page's section). Returns {problems:[...], n, fixed}. */
const BAR=`(sel,want)=>{ const out=[]; const host=document.querySelector(sel); const bar=host&&[...host.querySelectorAll('.bbar')].find(b=>b.getBoundingClientRect().height>0);
  if(!bar) return {problems:['no bar in '+sel]}; const cs=getComputedStyle(bar), r=bar.getBoundingClientRect(), W=document.documentElement.clientWidth, H=innerHeight;
  const vis=[...bar.querySelectorAll('.btn')].filter(b=>{ const q=b.getBoundingClientRect(); return q.width>0&&q.height>0&&getComputedStyle(b).visibility!=='hidden' });
  const more=vis.find(b=>b.classList.contains('bb-morebtn'));
  if(want==='laptop'){ if(cs.position==='fixed') out.push('the row is fixed on a laptop'); if(more) out.push('⋯ shows on a laptop'); return {problems:out,n:vis.length,fixed:false} }
  if(cs.position!=='fixed') out.push('not fixed ('+cs.position+')');
  if(Math.abs(r.bottom-H)>1.5) out.push('bottom '+Math.round(r.bottom)+' of '+H); if(r.left>0.5||Math.abs(r.right-W)>1.5) out.push('not full width: '+Math.round(r.left)+'..'+Math.round(r.right)+' of '+W);
  const prev=vis.find(b=>b.classList.contains('bb-prev')), next=vis.find(b=>b.classList.contains('bb-next'));
  if(prev&&prev.getBoundingClientRect().left>r.left+20) out.push('‹ is not in the left corner'); if(next&&next.getBoundingClientRect().right<r.right-20) out.push('› is not in the right corner');
  if(!!prev!==!!next) out.push('only one arrow');
  const tops=new Set();
  for(const b of vis){ const q=b.getBoundingClientRect(); const name=(b.textContent||'').trim().slice(0,14)||b.id||b.className;
    if(q.height<43.5||q.width<43.5) out.push('small target: '+name+' '+Math.round(q.width)+'x'+Math.round(q.height));
    if(q.left<-0.5||q.right>W+0.5) out.push('off screen: '+name); tops.add(Math.round(q.top+q.height/2)) }
  if(tops.size>1) out.push('buttons on '+tops.size+' lines');
  for(let i=0;i<vis.length;i++) for(let j=i+1;j<vis.length;j++){ const a=vis[i].getBoundingClientRect(), b=vis[j].getBoundingClientRect(); if(a.left<b.right-1&&b.left<a.right-1&&a.top<b.bottom-1&&b.top<a.bottom-1) out.push('overlap: '+vis[i].textContent.trim()+' / '+vis[j].textContent.trim()) }
  const filled=vis.filter(b=>b.classList.contains('primary')&&!b.disabled); if(filled.length>1) out.push(filled.length+' filled buttons');
  const hosts=[host,...host.querySelectorAll('.bbar-host')].filter(h=>h.classList.contains('bbar-host')), pad=Math.max(0,...hosts.map(h=>parseFloat(getComputedStyle(h).paddingBottom)||0)); if(pad<r.height-8) out.push('page has no room under it ('+pad+' < '+Math.round(r.height)+')');
  return {problems:out,n:vis.length,fixed:true} }`;

/* this site's pages: [name, hash, section, how to get a position on the board] */
const PAGES=[
  ['Endgames','#endgames','#endgames',async p=>{ await p.click('#eg-next'); await sleep(600); await p.click('#eg-sol'); await sleep(400) }],
  ['Guess the move','#guess','#guess',async p=>{ await p.click('#g-start'); await sleep(1500) }],
  ['Calculation','#calc','#calc',async p=>{ await p.click('#cc-start'); await sleep(1500) }],
  ['Tactics','#tactics','#tactics',async p=>{ await p.waitForSelector('#t-list button',{timeout:20000}).catch(()=>{}); await p.click('#t-next').catch(()=>{}); await sleep(800) }],
  ['Drills','#drills','#drills',async()=>{}],
  ['Blunder check','#blundercheck','#blundercheck',async()=>{}],
  ['Openings','#openings','#openings',async p=>{ await sleep(1200) }],
  ['Today','#today','#today',async p=>{ await sleep(800) }],
  ['Blind tactics','#blind','#blind',async p=>{ await p.waitForSelector('#bl-root [data-b="next"]',{timeout:20000}).catch(()=>{}); await sleep(600) }],
];
const SIZES=[['iPhone 13',390,664,true],['iPhone SE',320,568,true],['iPad upright',810,1080,true],['laptop',1280,800,false]];

(async()=>{
  const srv=await serve(); const base=`http://127.0.0.1:${srv.address().port}/`;
  const type={chromium,firefox,webkit}[BROWSER]; if(!type) throw new Error('unknown browser '+BROWSER);
  const browser=await type.launch(BROWSER==='chromium'&&process.env.CHROME?{executablePath:process.env.CHROME}:{});
  const errors=[];
  const open=async(vw,vh,touch,hash)=>{ const ctx=await browser.newContext({viewport:{width:vw,height:vh},colorScheme:'dark',...(touch?{hasTouch:true,isMobile:BROWSER!=='firefox'&&vw<500}:{})});
    const page=await ctx.newPage(); page.on('pageerror',e=>errors.push('pageerror: '+(e&&e.message||e)));
    await page.goto(base+hash,{waitUntil:'load'}); await sleep(500); return page };
  console.log(`== phone fixes in ${BROWSER} ${browser.version()}`);

  /* ---------- 1: the bottom bar on every board page, at every size ---------- */
  for(const [size,vw,vh,touch] of SIZES){
    for(const [name,hash,sel,prep] of PAGES){
      const page=await open(vw,vh,touch,hash);
      try{ await prep(page) }catch(e){ check(`${name} @ ${size}: reached`,false,String(e.message).split('\n')[0]) }
      const r=await page.evaluate(`(${BAR})(${JSON.stringify(sel)},${JSON.stringify(touch?'touch':'laptop')})`);
      check(`${name} @ ${size}: ${touch?'the bar':'no bar, the row as before'}`,!r.problems.length,r.problems.join('; ')||`${r.n} buttons`);
      if(size==='iPhone 13'||size==='iPad upright') await page.screenshot({path:path.join(OUT,`${name.replace(/ /g,'-').toLowerCase()}-${size.replace(/ /g,'-').toLowerCase()}.jpg`),type:'jpeg',quality:60});
      await page.context().close();
    }
  }

  /* ---------- 2: pinned board and working arrows (iPhone 13) ---------- */
  { const page=await open(390,664,true,'#calc'); await page.click('#cc-start'); await sleep(1500);
    const before=await page.evaluate(()=>{ scrollTo(0,0); return document.querySelector('#cc-board').getBoundingClientRect().top });
    const pin=await page.evaluate(async()=>{ scrollBy(0,500); await new Promise(r=>setTimeout(r,300)); const nav=document.querySelector('nav.tabs').getBoundingClientRect().bottom, b=document.querySelector('#cc-board').getBoundingClientRect();
      return {nav,top:b.top,bottom:b.bottom,scrolled:scrollY,bar:document.querySelector('#cc-tools').getBoundingClientRect().top} });
    check('Calculation: the board stays under the tab row when the page scrolls',pin.scrolled>100&&Math.abs(pin.top-pin.nav)<14,JSON.stringify(pin)+' (was at '+Math.round(before)+')');
    check('Calculation: the board ends above the bar with room for text',pin.bar-pin.bottom>120,`${Math.round(pin.bar-pin.bottom)} px between board and bar`);
    await page.context().close() }
  { const page=await open(390,664,true,'#guess'); await page.click('#g-start'); await sleep(1500);
    const pin=await page.evaluate(async()=>{ scrollBy(0,500); await new Promise(r=>setTimeout(r,300)); const nav=document.querySelector('nav.tabs').getBoundingClientRect().bottom, b=document.querySelector('#g-board').getBoundingClientRect(); return {nav,top:b.top,scrolled:scrollY} });
    check('Guess the move: the board stays under the tab row when the page scrolls',pin.scrolled>100&&Math.abs(pin.top-pin.nav)<14,JSON.stringify(pin));
    await page.context().close() }
  { const page=await open(390,664,true,'#endgames'); await page.click('#eg-next'); await sleep(600); await page.click('#eg-sol'); await sleep(400);
    const step=()=>page.evaluate(()=>document.querySelector('#eg-step').textContent.trim());
    const a=await step(); await page.click('#eg-fwd'); await sleep(250); const b=await step(); await page.click('#eg-fwd'); await sleep(250); await page.click('#eg-prev'); await sleep(250); const c=await step();
    check('Endgames: › and ‹ in the bar step through the solution',a!==b&&b===c,`${a} → ${b} → (› ‹) ${c}`);

  /* ---------- 3: the reader ---------- */
    const mb=page.locator('#eg-tools .bb-morebtn').locator('visible=true').first(); if(await mb.count()){ await mb.click(); await sleep(250) }   /* Read sits under ⋯ on a phone */
    const rd=page.locator('.rd-open').locator('visible=true').first();
    if(await rd.count()){ await rd.click(); await sleep(700);
      const m=await page.evaluate(()=>{ const n=document.querySelector('.rd-notes').getBoundingClientRect(), b=document.querySelector('.rd-bar').getBoundingClientRect(); const x=b.left+30, y=b.top+b.height/2-4, hit=document.elementFromPoint(x,y);
        return {notes:Math.round(n.bottom),bar:Math.round(b.top),hit:hit?hit.className:''} });
      check('Reader: the notes end where the bar starts',m.notes<=m.bar+1,`notes end ${m.notes}, bar starts ${m.bar}`);
      check('Reader: a tap on ‹ reaches ‹',/rd-prev/.test(m.hit),m.hit);
      const pos=()=>page.evaluate(()=>document.querySelector('.rd-pos').textContent.trim()+'|'+(document.querySelector('.rd-board').dataset.orient||document.querySelector('.rd-board').className));
      const p0=await pos(); await page.click('.rd-next'); await sleep(250); const p1=await pos(); await page.click('.rd-prev'); await sleep(250); const p2=await pos();
      check('Reader: › and ‹ move through the line',p0!==p1&&p2===p0,`${p0} → ${p1} → ${p2}`);
      const sq=()=>page.evaluate(()=>{ const b=document.querySelector('.rd-board'); const c=b.querySelector('[data-sq],[data-square]'); return c?(c.dataset.sq||c.dataset.square):b.innerHTML.length+':'+b.innerHTML.slice(0,160) });
      const f0=await sq(); await page.click('.rd-flip'); await sleep(250); const f1=await sq();
      check('Reader: Flip turns the board',f0!==f1,`${String(f0).slice(0,12)} → ${String(f1).slice(0,12)}`);
    } else check('Reader: a Read button is offered on the endgame solution (phone)',false);
    await page.context().close() }

  check('no page errors',!errors.length,errors.slice(0,3).join(' | '));
  await browser.close(); srv.close();
  console.log(failed?`\n${failed} check(s) FAILED`:'\nAll phone-fix checks passed.'); process.exit(failed?1:0);
})();
