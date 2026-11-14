/* Chess Lab Open — the engine downloads only where it is used (11 Nov 2026). Real browser, a new visitor.
     node tests/browser/engine.js <firefox|chromium>      (CHROME=<path> uses a local Chrome for chromium)
   1. Drilling an imported repertoire with the eval bar off never starts Stockfish: no worker, no .wasm served.
   2. Today, where you land: reading the page never starts it; the first touch of a board does.
   3. A preset starts it; Play starts it at once; the first check of the visit answers correctly. */
'use strict';
const http=require('http'), fs=require('fs'), path=require('path');
const {chromium,firefox,webkit}=require('playwright');
const BROWSER=process.argv[2]||'chromium', SITE=path.join(__dirname,'..','..','site');
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.wasm':'application/wasm','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg'};
const SENT=[];
function serve(){ return new Promise(res=>{ const srv=http.createServer((req,rsp)=>{
  let p=decodeURIComponent(req.url.split('?')[0].split('#')[0]); if(p.endsWith('/')) p+='index.html';
  const f=path.join(SITE,path.normalize(p).replace(/^(\.\.[/\\])+/,''));
  if(!f.startsWith(SITE)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){ rsp.writeHead(404); rsp.end(); return }
  SENT.push(p); rsp.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream','Cache-Control':'no-store'}); fs.createReadStream(f).pipe(rsp) });
  srv.listen(0,'127.0.0.1',()=>res(srv)) }) }
let fails=0; const ok=(c,m)=>{ console.log((c?'  ok   ':'  FAIL ')+m); if(!c) fails++ };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const until=async(pg,f,ms)=>{ const t=Date.now(); while(Date.now()-t<ms){ if(await pg.evaluate(f)) return true; await sleep(150) } return false };
const wasm=()=>SENT.filter(p=>/\.wasm$/.test(p)).length;
const WATCH=()=>{ const W=window.Worker; window.__workers=0; window.Worker=function(u,o){ window.__workers++; return new W(u,o) }; window.Worker.prototype=W.prototype };
const QUIET=()=>{ try{ if(!sessionStorage.getItem('q')){ sessionStorage.setItem('q','1'); localStorage.setItem('clo-settings',JSON.stringify({evalCol:false,osfinfo:false})) } }catch(e){} };
(async()=>{
  const srv=await serve(), base=`http://127.0.0.1:${srv.address().port}/`;
  const type={chromium,firefox,webkit}[BROWSER]; const browser=await type.launch(BROWSER==='chromium'&&process.env.CHROME?{executablePath:process.env.CHROME}:{});
  async function page(hash){ const ctx=await browser.newContext({viewport:{width:390,height:844}}); const pg=await ctx.newPage(); const errors=[];
    pg.on('pageerror',e=>errors.push(e.message)); pg.on('console',m=>{ if(m.type()==='error') errors.push(m.text()) });
    await pg.addInitScript(WATCH); await pg.addInitScript(QUIET); await pg.goto(base+'index.html'+hash); await sleep(300); return {ctx,pg,errors} }
  console.log('== 1. drilling an imported repertoire (eval bar off)');
  { const w0=wasm(); const {ctx,pg,errors}=await page('#progress');
    await pg.evaluate(async()=>{ const $=id=>document.getElementById(id);
      $('o-pgnbox').value='[Event "Rep"]\n\n1. e4 e5 2. Nf3 Nc6 (2... d6 3. d4 exd4 4. Nxd4) 3. Bb5 a6 4. Ba4 Nf6 5. O-O *'; $('o-repname').value='Engine test'; $('o-repside').value='white'; await OpeningsTab.doImport() });
    await pg.evaluate(()=>{ location.hash='#openings' }); await sleep(800);   /* imported on Progress: Openings opens on it (a new visitor's default is a preset, which uses the engine) */
    ok(await until(pg,()=>{ const S=OpeningsTab.state; return S.op&&S.op.rep&&S.phase==='await' },10000),'the imported repertoire is open');
    let moves=0;
    for(let k=0;k<3;k++){
      for(let i=0;i<30;i++){ const st=await pg.evaluate(()=>{ const S=OpeningsTab.state; return {done:S.phase==='done',mine:S.phase==='await'&&!S.busy&&S.g.turn()==='w'} });
        if(st.done) break; if(!st.mine){ await sleep(120); continue }
        const u=await pg.evaluate(()=>{ const S=OpeningsTab.state; const m=OpeningsTab.repMap(S.op.id); return (m.get(posId(normKey(S.g.fen())))||[])[0]||null }); if(!u) break;
        await pg.evaluate(u=>OpeningsTab.userMove(u.slice(0,2),u.slice(2,4)),u); moves++; await sleep(200) }
      await sleep(900); await pg.evaluate(()=>OpeningsTab.newLine()); await sleep(300) }
    ok(moves>=6,`played ${moves} prepared moves over 3 lines`);
    const n=await pg.evaluate(()=>window.__workers); ok(n===0&&wasm()===w0,`no engine worker, no .wasm served (workers ${n}, wasm ${wasm()-w0})`);
    console.log('== 3. a preset starts it; the first check answers correctly');
    await pg.evaluate(()=>OpeningsTab.selectOpening('preset-english'));
    ok(await until(pg,()=>window.__workers>0,15000),'a preset in Openings starts the engine');
    const a=await pg.evaluate(()=>SharedEngine.analyse('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',12,1,20000));
    ok(a&&a[0]&&['e2e4','d2d4','g1f3','c2c4'].includes(a[0].uci)&&Math.abs(a[0].cp)<0.8,`first check: ${a&&a[0]?a[0].uci+' '+a[0].cp:'no answer'} (${await pg.evaluate(()=>SharedEngine.name)})`);
    ok(!errors.length,'no page errors '+errors.slice(0,2).join(' | '));
    await ctx.close() }
  console.log('== 2. Today, where you land');
  { const {ctx,pg}=await page('');
    await sleep(6000);
    ok(await pg.evaluate(()=>window.__workers)===0,'6 s on Today without a touch: not started');
    await pg.evaluate(()=>{ const b=[...document.querySelectorAll('#today .board')].find(x=>x.offsetParent); b.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true})) });
    ok(await until(pg,()=>window.__workers>0,6000),'the first touch of Today’s board starts it');
    await ctx.close() }
  { const {ctx,pg}=await page('#play');
    ok(await until(pg,()=>window.__workers>0,3000),'Play starts it at once');
    ok(await until(pg,()=>SharedEngine.ready,30000),'and it is ready ('+await pg.evaluate(()=>SharedEngine.name)+')');
    await ctx.close() }
  await browser.close(); srv.close(); console.log(fails?fails+' FAILURES':'All engine checks passed.'); process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1) });
