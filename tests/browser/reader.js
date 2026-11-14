/* Chess Lab Open — the mobile reader in a real browser (Playwright): iPhone 15 portrait + landscape and iPhone SE,
   in each place (Guess the move, Calculation, Endgames, Openings notes), plus iPad mini and iPad to confirm the
   desktop layout (no Read button). Screenshots for review.  node tests/browser/reader.js <firefox|chromium> [outDir] */
'use strict';
const http=require('http'), fs=require('fs'), path=require('path');
const pw=require('playwright');
const BROWSER=process.argv[2]||'chromium', OUT=path.resolve(process.argv[3]||path.join(__dirname,'out','reader-'+BROWSER));
const SITE=path.join(__dirname,'..','..','site'); fs.mkdirSync(OUT,{recursive:true});
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png'};
const serve=()=>new Promise(r=>{ const s=http.createServer((q,res)=>{ let p=decodeURIComponent(q.url.split('?')[0]); if(p.endsWith('/')) p+='index.html'; const f=path.join(SITE,p);
  if(!f.startsWith(SITE)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){ res.writeHead(404); res.end(); return } res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream','Cache-Control':'no-store'}); fs.createReadStream(f).pipe(res) }); s.listen(0,'127.0.0.1',()=>r(s)) });
let fails=0; const ok=(n,c,d='')=>{ console.log((c?'  ok   ':'  FAIL ')+n+(d?' — '+d:'')); if(!c) fails++ };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const PHONES=[['iphone15-portrait',{viewport:{width:393,height:852},isMobile:true,hasTouch:true,deviceScaleFactor:2}],
  ['iphone15-landscape',{viewport:{width:852,height:393},isMobile:true,hasTouch:true,deviceScaleFactor:2}],
  ['iphoneSE',{viewport:{width:375,height:667},isMobile:true,hasTouch:true,deviceScaleFactor:2}]];
/* upright iPads get the reader too (Nov 2026); landscape iPads keep the desktop layout */
PHONES.push(['ipad-portrait',{viewport:{width:820,height:1180},isMobile:true,hasTouch:true}]);
const TABLETS=[['ipad-landscape',{viewport:{width:1180,height:820},isMobile:true,hasTouch:true}],['ipad-mini-landscape',{viewport:{width:1133,height:744},isMobile:true,hasTouch:true}]];
/* Firefox has no isMobile: emulate by viewport only */
const ctxOpts=o=>BROWSER==='firefox'?{viewport:o.viewport,hasTouch:o.hasTouch}:o;
(async()=>{
  const srv=await serve(), base=`http://127.0.0.1:${srv.address().port}/`;
  const br=await pw[BROWSER].launch();
  const places=[
    ['guess',async p=>{ await p.goto(base+'#guess'); await sleep(1200); await p.click('#g-list .drill'); await sleep(800); await p.evaluate(()=>{ const b=document.getElementById('g-show'); if(b&&!b.hidden) b.click() }); await sleep(600); return '#g-readslot .rd-open' }],
    ['calc',async p=>{ await p.goto(base+'#calc'); await sleep(1500); await p.evaluate(()=>{ CalcTab.ensure&&CalcTab.ensure() }); await sleep(800); await p.evaluate(async()=>{ const z=CalcTab.lib[0]; CalcTab.load(z); const u=z.moves[1]; await CalcTab.userMove(u.slice(0,2),u.slice(2,4)); CalcTab.submit() }); await sleep(800); return '#cc-readslot .rd-open' }],
    ['endgames',async p=>{ await p.goto(base+'#endgames'); await sleep(1500); await p.evaluate(async()=>{ EndgamesTab.next(); await new Promise(r=>setTimeout(r,300)); await EndgamesTab.solution() }); await sleep(600); return '#eg-readslot .rd-open' }],
    ['openings',async p=>{ await p.goto(base+'#openings'); await sleep(800); await p.evaluate(async()=>{ Settings.set('omode','training'); const b=document.getElementById('o-pgnbox'); b.value='[Event "x"]\n1. e4 {Best by test [%cal Ge2e4]} e5 {Classical} 2. Nf3 {Attacks e5} Nc6 3. Bb5 {The Spanish} *'; document.getElementById('o-repname').value='Reader demo'; document.getElementById('o-repside').value='white'; await OpeningsTab.doImport() }); await sleep(400);
      await p.evaluate(async()=>{ await OpeningsTab.userMove('e2','e4') }); await sleep(1500); return '#o-readslot .rd-open' }]];
  for(const [dev,o] of PHONES){
    const ctx=await br.newContext(ctxOpts(o)); const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
    for(const [name,prep] of places){
      const sel=await prep(p);
      if(name==='openings'&&await p.evaluate(()=>document.querySelector('#openings .otrain').classList.contains('pin'))){
        /* upright phones and iPads: the board stays pinned while the moves and notes scroll under it (no Read button needed) */
        const pin=await p.evaluate(async()=>{ scrollTo(0,500); await new Promise(r=>setTimeout(r,150)); const b=document.getElementById('o-board').getBoundingClientRect(), nav=document.querySelector('nav.tabs').getBoundingClientRect();
          const nx=document.getElementById('o-newline').getBoundingClientRect(), pv=document.getElementById('o-prev').getBoundingClientRect(), fw=document.getElementById('o-next').getBoundingClientRect();
          const r={stuck:b.top>=nav.bottom-1&&b.top<nav.bottom+40,onScreen:b.bottom<=innerHeight,row:pv.right<=nx.left&&nx.right<=fw.left&&Math.abs(pv.top-nx.top)<4&&fw.right<=innerWidth,hscroll:document.documentElement.scrollWidth>innerWidth+1}; scrollTo(0,0); return r });
        ok(`${dev} openings: board pinned while the notes scroll, ‹ main › in one row, no sideways scroll`,pin.stuck&&pin.onScreen&&pin.row&&!pin.hscroll,JSON.stringify(pin));
        await p.screenshot({path:path.join(OUT,`${dev}-openings-pinned.png`)}); continue }
      { const mb=p.locator('.bbar .bb-morebtn').locator('visible=true').first(); if(await mb.count()){ await mb.click().catch(()=>{}); await p.waitForTimeout(200) } }   /* 14 Nov: on a phone Read sits under the bottom bar's ⋯ */
      const btn=await p.$(sel); const vis=btn&&await btn.isVisible();
      ok(`${dev} ${name}: Read button on a phone`,vis);
      if(!vis) continue;
      await btn.click(); await sleep(400); await p.click('.rd-next').catch(()=>{}); await sleep(200); await p.click('.rd-next').catch(()=>{}); await sleep(300);
      const m=await p.evaluate(()=>{ const r=document.querySelector('.reader'), b=r.querySelector('.rd-board').getBoundingClientRect(), bar=r.querySelector('.rd-bar').getBoundingClientRect(), n=r.querySelector('.rd-next').getBoundingClientRect(), pv=r.querySelector('.rd-prev').getBoundingClientRect(), cur=r.querySelector('.rd-flow .vmv.cur'), notes=r.querySelector('.rd-notes').getBoundingClientRect();
        return {board:b.width>100&&b.height>100,barBottom:Math.round(bar.bottom)<=innerHeight+1,next:n.left>pv.left&&n.height>=44&&pv.height>=44,curTop:cur?Math.round(cur.getBoundingClientRect().top-notes.top):null,hscroll:document.documentElement.scrollWidth>innerWidth+1} });
      ok(`${dev} ${name}: board shown, bar at the bottom, ‹ left / › right, 44 px`,m.board&&m.barBottom&&m.next,JSON.stringify(m));
      ok(`${dev} ${name}: the current move is in view in the text`,m.curTop!=null&&m.curTop>=-2&&m.curTop<300,'offset '+m.curTop);
      ok(`${dev} ${name}: no sideways scroll`,!m.hscroll);
      await p.screenshot({path:path.join(OUT,`${dev}-${name}.png`)});
      await p.click('.rd-close'); await sleep(200);
    }
    ok(`${dev}: no page errors`,!errs.length,errs.slice(0,2).join(' | '));
    await ctx.close();
  }
  for(const [dev,o] of TABLETS){
    const ctx=await br.newContext(ctxOpts(o)); const p=await ctx.newPage();
    const sel=await places[0][1](p); const btn=await p.$(sel); ok(`${dev}: keeps the desktop layout (no Read button)`,!(btn&&await btn.isVisible()));
    await p.screenshot({path:path.join(OUT,`${dev}-guess.png`)}); await ctx.close();
  }
  await br.close(); srv.close();
  console.log(`${BROWSER}: reader ${fails?fails+' FAILED':'all checks passed'}`); process.exit(fails?1:0);
})().catch(e=>{ console.error(e); process.exit(1) });
