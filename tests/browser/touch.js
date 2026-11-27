/* Think Ahead — touch polish (26 Nov 2026, roadmap #290), checked in a real browser on an iPhone's and an iPad's size
   (touch screen, no mouse).
     node tests/browser/touch.js <webkit|chromium|firefox> [outDir]
   On Settings, Openings, Play, Tactics (with a solution shown), Progress (with a rating chart) and Today:
     target    every control outside the bottom bar (buttons, chips, choices, drop-downs, sliders, the "?", the moves of a
               move list, links that stand on their own) takes a tap at least 44 px tall (a "?" or a small link may reach it
               with its tap area, ::after)
     keys      no key caps (F, H, B …) and no right-click hints (.mouseonly) show
     text      board coordinates and chart labels are at least 10 px on screen
     fit       Play's setup stays inside its card (on an iPad on its side "Random" spilled out)
   Screenshots go to outDir. Exit code 1 when a check fails. */
'use strict';
const http=require('http'), fs=require('fs'), path=require('path');
const {chromium,firefox,webkit}=require('playwright');
const BROWSER=process.argv[2]||'webkit';
const OUT=path.resolve(process.argv[3]||path.join(__dirname,'out',BROWSER,'touch'));
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

/* Runs in the page: the problems on the page that is showing. */
const MEASURE=()=>{
  const sec=document.querySelector('main section:not([hidden])')||document.body, out={small:[],keys:[],mouse:[],text:[],fit:[]};
  const shown=e=>{ const q=e.getBoundingClientRect(); if(q.width<2||q.height<2) return false; for(let p=e;p&&p!==document.body;p=p.parentElement){ const c=getComputedStyle(p); if(c.display==='none'||c.visibility==='hidden'||p.classList.contains('vh')) return false } return true };
  const eff=e=>{ const q=e.getBoundingClientRect(), a=getComputedStyle(e,'::after'); let h=q.height;
    if(a.content&&a.content!=='none'&&a.content!=='normal'&&a.position==='absolute') h=Math.max(h,q.height-(parseFloat(a.top)||0)-(parseFloat(a.bottom)||0)); return h };
  const name=e=>((e.id?'#'+e.id+' ':'')+(e.textContent||e.getAttribute('aria-label')||e.className||e.tagName)).trim().replace(/\s+/g,' ').slice(0,28);
  const SEL='button,a.btn,select,summary,.chip,input[type=range],input[type=text],input:not([type]),.msel-row,.walink,.wtrow>a,.ohchips a,.vmv';
  for(const e of sec.querySelectorAll(SEL)){
    if(e.closest('.bbar,.board,.rd-flow')||!shown(e)) continue;
    if(e.matches('.msel-row input')) continue;
    const h=eff(e); if(h<43.5) out.small.push(name(e)+' '+Math.round(h)) }
  for(const k of sec.querySelectorAll('.btn kbd')) if(shown(k)) out.keys.push(name(k.closest('.btn')));
  for(const m of document.querySelectorAll('.mouseonly')) if(shown(m)) out.mouse.push(name(m));
  for(const c of sec.querySelectorAll('.coord')){ if(!shown(c)) continue; const f=parseFloat(getComputedStyle(c).fontSize); if(f<10){ out.text.push('coordinate '+f+'px'); break } }
  for(const svg of sec.querySelectorAll('.pchart svg')){ if(!shown(svg)) continue; const vb=svg.viewBox.baseVal, k=vb&&vb.width?svg.getBoundingClientRect().width/vb.width:1;
    for(const t of svg.querySelectorAll('text')){ const f=parseFloat(getComputedStyle(t).fontSize)*k; if(f<9.95){ out.text.push('chart label "'+t.textContent+'" '+f.toFixed(1)+'px'); break } } }
  const card=document.querySelector('#pl-setup'); if(card&&shown(card)){ const c=card.closest('.card')||card, r=c.getBoundingClientRect();
    for(const b of card.querySelectorAll('button')) if(shown(b)&&b.getBoundingClientRect().right>r.right+0.5) out.fit.push(name(b)+' past the card by '+Math.round(b.getBoundingClientRect().right-r.right)+'px') }
  return out;
};

(async()=>{
  const srv=await serve(), base=`http://127.0.0.1:${srv.address().port}/`;
  const engine={chromium,firefox,webkit}[BROWSER];
  const browser=await engine.launch(process.env.CHROME&&BROWSER==='chromium'?{executablePath:process.env.CHROME}:{});
  const DEV=[['iPhone',390,844,true],['iPad on its side',1180,820,false],['iPad upright',820,1180,false]];
  const SEED=()=>{ const now=Date.now(), h=[]; for(let i=0;i<12;i++) h.push({t:now-(12-i)*864e5,r:1500+i*9}); localStorage.setItem('clo:tac-history',JSON.stringify(h));
    localStorage.setItem('clo:tac-rating',JSON.stringify({r:1599,n:12})) };
  const PAGES=[['Settings','#settings'],['Openings','#openings'],['Play','#play'],['Progress','#progress'],['Today','#today'],
    ['Tactics','#tactics',async p=>{ await p.waitForSelector('#t-list button',{timeout:20000}); await p.click('#t-sol'); await sleep(300);
      await p.click('#t-motifs summary'); await sleep(200) }]];
  for(const [dev,w,h,mob] of DEV){
    console.log(`\n${dev} (${w}×${h}, touch)`);
    const ctx=await browser.newContext({viewport:{width:w,height:h},hasTouch:true,...(BROWSER!=='firefox'?{isMobile:mob}:{}),deviceScaleFactor:2,colorScheme:'light'});
    await ctx.addInitScript(SEED);
    const p0=await ctx.newPage(); await p0.goto(base+'#today');
    const touch=await p0.evaluate(()=>matchMedia('(pointer:coarse)').matches); await p0.close();
    if(!touch){ console.log('  (this browser does not report a touch screen here: skipped)'); await ctx.close(); continue }
    for(const [pname,hash,prep] of PAGES){
      /* a tab of its own for each page: in Chromium a full-page screenshot drops the tab's touch emulation */
      const page=await ctx.newPage();
      await page.goto(base+hash); await sleep(900);
      if(prep) await prep(page);
      const r=await page.evaluate(MEASURE);
      const tag=`${pname} on ${dev}`;
      check(`${tag}: every control takes a 44 px tap`,!r.small.length,r.small.slice(0,8).join(', '));
      check(`${tag}: no key caps, no right-click hints`,!r.keys.length&&!r.mouse.length,[...r.keys,...r.mouse].slice(0,6).join(', '));
      check(`${tag}: coordinates and chart labels at least 10 px`,!r.text.length,r.text.join(', '));
      if(pname==='Play') check(`${tag}: the setup stays inside its card`,!r.fit.length,r.fit.join(', '));
      await page.screenshot({path:path.join(OUT,`${pname.toLowerCase()}-${dev.replace(/\W+/g,'-').toLowerCase()}.png`),fullPage:true});
      await page.close();
    }
    await ctx.close();
  }
  await browser.close(); srv.close();
  console.log(failed?`\n${failed} check(s) failed`:'\nAll touch checks passed'); process.exit(failed?1:0);
})().catch(e=>{ console.error(e); process.exit(1) });
