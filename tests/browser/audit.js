/* Chess Lab Open — the 14 Nov 2026 audit's own steps, replayed in a real browser (Playwright; Firefox and Chromium in CI).
     node tests/browser/audit.js <firefox|chromium|webkit> [outDir]        CHROME=<path>: a local Chrome
   Each block is one audit item, done the way the audit found it, with the real Stockfish where the item needs it:
     1  Endgames: the "best play" line of every basic mate ends in mate; the mating move is graded best (a tick).
     2  Analyze my games: the PGN of Narayanan – Jordan (a published game, data/gtm/game8.json), Standard, Save drills:
        6.Qa4+ is not a costly moment, not a drill, not a Punish drill.
     4  Keys, pressed for real: Blunder check H = show the threat; Guess the move B / R / N.
   Screenshots (laptop and phone) of each screen go to outDir. Exit code 1 when a check fails. */
'use strict';
const http=require('http'), fs=require('fs'), path=require('path');
const {chromium,firefox,webkit}=require('playwright');
const BROWSER=process.argv[2]||'chromium';
const OUT=path.resolve(process.argv[3]||path.join(__dirname,'out',BROWSER,'audit'));
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
const waitFor=async(page,fn,arg,ms=20000)=>{ try{ await page.waitForFunction(fn,arg,{timeout:ms,polling:100}); return true }catch(e){ return false } };

(async()=>{
  const LIVE=process.env.BASE||''; const srv=LIVE?null:await serve(); const base=LIVE?(LIVE.endsWith('/')?LIVE:LIVE+'/'):`http://127.0.0.1:${srv.address().port}/`;
  const type={chromium,firefox,webkit}[BROWSER]; if(!type) throw new Error('unknown browser '+BROWSER);
  const browser=await type.launch(BROWSER==='chromium'&&process.env.CHROME?{executablePath:process.env.CHROME}:{});
  const errors=[];
  const open=async(vw,vh,hash)=>{ const ctx=await browser.newContext({viewport:{width:vw,height:vh},colorScheme:'light',...(vw<500?{hasTouch:true,isMobile:BROWSER!=='firefox'}:{})});
    const page=await ctx.newPage(); page.on('pageerror',e=>errors.push('pageerror: '+(e&&e.message||e)));
    page.on('console',m=>{ if(m.type()==='error'&&!/fonts\.(googleapis|gstatic)|favicon|Failed to load resource/.test(m.text())) errors.push('console.error: '+m.text()) });
    await page.goto(base+hash,{waitUntil:'load'}); await sleep(400); return page };
  const shot=(page,name)=>page.screenshot({path:path.join(OUT,name+'.jpg'),type:'jpeg',quality:60});
  console.log(`== audit steps in ${BROWSER} ${browser.version()} at ${base}`);

  /* ---------- item 1: Endgames ---------- */
  { const page=await open(1440,900,'#endgames');
    await waitFor(page,()=>window.EndgamesTab&&EndgamesTab.data&&document.querySelectorAll('#eg-list .drill').length>30);
    for(const [id,name] of [['kqk','Queen mate'],['krk','Rook mate'],['kbbk','Two bishops'],['kbnk','Bishop and knight'],['kbnk2','Bishop and knight (2)']]){
      await page.evaluate(i=>EndgamesTab.load(EndgamesTab.byId(i)),id); await sleep(150);
      await page.click('#eg-sol'); await sleep(250);
      const txt=await page.$eval('#eg-moves',e=>e.textContent.replace(/\s+/g,' ').trim());
      check(`${name}: Solution's best play ends in mate`,/#\s*$/.test(txt)&&/Best play/.test(txt),txt.slice(-46));
      if(id==='kqk') await shot(page,'1-endgame-solution-laptop'); }
    /* play the queen mate along the stored line, then the mating move: a tick in the move list and "Checkmate" */
    await page.evaluate(()=>EndgamesTab.load(EndgamesTab.byId('kqk'))); await sleep(200);
    const line=await page.evaluate(()=>EndgamesTab.byId('kqk').line);
    for(let i=0;i<line.length;i+=2){ const u=line[i];
      await page.evaluate(([a,b])=>EndgamesTab.userMove(a,b),[u.slice(0,2),u.slice(2,4)]);
      if(i<line.length-1) await waitFor(page,n=>EndgamesTab.state.hist.length>=n&&!EndgamesTab.state.busy,i+2,15000); else await sleep(600) }
    const st=await page.$eval('#eg-status',e=>e.textContent), mv=await page.$eval('#eg-moves',e=>e.textContent.replace(/\s+/g,' '));
    const hist=await page.evaluate(()=>EndgamesTab.state.hist.filter((h,i)=>i%2===0).map(h=>h.gr));
    check('Queen mate played out: the mating move says Checkmate and carries the best-move tick',/Checkmate/.test(st)&&hist[hist.length-1]==='best'&&/#✓\s*$/.test(mv.trim()),`${st.trim().slice(0,24)} | …${mv.trim().slice(-14)} | ${hist.join(',')}`);
    check('…and every move of the stored line is graded best',hist.every(g=>g==='best'),hist.join(','));
    await shot(page,'1-endgame-mate-laptop');
    const ph=await open(390,844,'#endgames'); await waitFor(ph,()=>window.EndgamesTab&&EndgamesTab.data);
    await ph.evaluate(()=>EndgamesTab.load(EndgamesTab.byId('krk'))); await sleep(200); await ph.click('#eg-sol'); await sleep(300); await shot(ph,'1-endgame-solution-phone');
    await ph.context().close(); await page.context().close(); }

  /* ---------- item 2: Analyze my games (the real Stockfish) ---------- */
  { const G=JSON.parse(fs.readFileSync(path.join(SITE,'data','gtm','game8.json'),'utf8'));
    const pgn=`[Event "${G.event}"]\n[Date "${G.date}"]\n[White "${G.white}"]\n[Black "${G.black}"]\n[Result "${G.result}"]\n[WhiteElo "${G.we}"]\n[BlackElo "${G.be}"]\n\n${G.moves.map((m,i)=>(i%2?'':(i/2+1)+'. ')+m).join(' ')} ${G.result}\n`;
    const page=await open(1440,900,'#analyze');
    await page.selectOption('#a-site','pgn'); await sleep(100);
    await page.setInputFiles('#a-pgnfile',{name:'jordan.pgn',mimeType:'application/x-chess-pgn',buffer:Buffer.from(pgn)});
    await waitFor(page,()=>AnalyzeTab.files.length===1&&document.querySelectorAll('#a-pgnnames input:checked').length>=1);
    await page.evaluate(()=>{ document.querySelectorAll('#a-pgnnames input').forEach(i=>{ const on=/Narayanan/.test(i.value); if(i.checked!==on) i.click() }); const r=document.querySelector('input[name="a-mode"][value="standard"]'); if(!r.checked) r.click() });
    const t0=Date.now(); await page.click('#a-go');
    const done=await waitFor(page,()=>!AnalyzeTab.running&&/Done\./.test(document.getElementById('a-note').textContent),null,420000);
    check('the game is analyzed by Stockfish in the browser (Standard)',done,`${Math.round((Date.now()-t0)/1000)} s`);
    const R=await page.evaluate(()=>({mist:AStats.last.mistakes.map(m=>m.san),pun:AStats.last.toPunish.map(m=>m.san),rep:document.getElementById('a-report').textContent,
      ef:Object.values(Store.get('pgn-evals')||{})[0]}));
    check('6.Qa4+ is the engine’s first choice in its position',R.ef&&R.ef.f&&R.ef.f[10]==='1',R.ef&&R.ef.f);
    check('6.Qa4+ is not a costly moment',!R.mist.includes('Qa4+')&&!/Qa4\+/.test((R.rep.split('costliest moments')[1]||'').split('Opponents')[0].slice(0,600)),'costliest: '+(R.mist.join(' ')||'none'));
    check('…and not a missed punish',!R.pun.includes('Qa4+'),'to punish: '+(R.pun.join(' ')||'none'));
    await shot(page,'2-analyze-report-laptop');
    const has=await page.$('#a-savedrills');
    if(has){ await page.click('#a-savedrills'); await waitFor(page,()=>!/Checking|Saving/.test(document.getElementById('a-savedrills').textContent),null,300000);
      console.log('  note  save button: '+await page.$eval('#a-savedrills',e=>e.textContent)) }
    const D=await page.evaluate(()=>(Store.get('adrills')||[]).map(d=>({p:d.played,k:d.kind||'mistake',best:d.best,v:d.v})));
    check('Save drills: no drill and no Punish drill for 6.Qa4+',!D.some(d=>d.p==='Qa4+'),D.map(d=>d.p+':'+d.k).join(' ')||'no drills at all');
    check('every saved drill was checked more deeply and stores its best move',D.every(d=>d.v===1&&d.best),D.map(d=>d.p+'→'+d.best).join(' '));
    await page.evaluate(()=>{ location.hash='#drills' }); await sleep(500);
    const list=await page.$eval('#d-list',e=>e.textContent);
    check('the Drills tab lists no Qa4+',!/Qa4\+/.test(list)); await shot(page,'2-drills-laptop');
    /* a drill saved by the old code (the audit's): playing the game move no longer says "Find something better" */
    await page.evaluate(fen=>{ Store.put('adrills',[{id:'aAUDIT001',fen,played:'Qa4+',playedUci:'d1a4',best:null,drop:0.25,before:4.1,date:'2025-09-20',opp:'Jordan, Pernell',site:'pgn',color:'w'}]); Store.put('adrills-progress',{}); DrillsTab.refresh(); DrillsTab.load(Store.get('adrills')[0]) },
      'rnbqk2r/p1p2ppp/1p2pn2/3p4/1bPP4/2N1P3/PP2NPPP/R1BQKB1R w KQkq - 0 6');
    await sleep(200); await page.evaluate(()=>DrillsTab.userMove('d1','a4'));
    await waitFor(page,()=>/not a mistake|Find something better/.test(document.getElementById('d-status').textContent),null,60000);
    const ds=await page.$eval('#d-status',e=>e.textContent);
    check('an old Qa4+ drill: the game move is accepted ("not a mistake after all"), not refused',/not a mistake/.test(ds)&&!/Find something better/.test(ds),ds.trim().slice(0,90));
    await shot(page,'2-old-drill-laptop');
    await page.context().close();
    const ph=await open(390,844,'#analyze'); await shot(ph,'2-analyze-phone'); await ph.context().close(); }

  /* ---------- item 4: keys, pressed for real ---------- */
  { const page=await open(1440,900,'#blundercheck');
    const fen='r1bq1rk1/pp2bppp/2n1pn2/2pp4/3P4/2PBPN2/PP1N1PPP/R2QK2R w KQ - 0 9';
    await page.evaluate(f=>{ const p=f.split(' '); p[1]='b'; p[3]='-';
      Store.put('abc',[{id:'kAUDIT001',fen:f,null:p.join(' '),color:'white',opp:'Example',oppElo:'',date:'2026-01-01',event:'',moveNo:9,played:'h3',playedUci:'h2h3',reply:'e5',replyUci:'e6e5',w0:55,w1:35,
        threat:'e5',threatUci:'e6e5',threats:['e6e5'],gain:1.2,ignored:true,best:'O-O',bestUci:'e1g1',goods:['e1g1'],strong:false,site:'pgn',url:'',b:['sAUDIT']}]); BlunderCheckTab.refresh() },fen);
    await sleep(300); await page.evaluate(()=>BlunderCheckTab.open('kAUDIT001')); await sleep(300);
    const before=await page.$eval('#bc-status',e=>e.textContent);
    await page.keyboard.press('s'); await sleep(300);
    const afterS=await page.$eval('#bc-status',e=>e.textContent);
    await page.keyboard.press('h'); await sleep(400);
    const afterH=await page.$eval('#bc-status',e=>e.textContent);
    check('Blunder check: S does nothing now, H shows the threat',afterS===before&&afterH!==before&&/threat/i.test(afterH),afterH.trim().slice(0,60));
    check('…and the button’s keycap says H',/H/.test(await page.$eval('#bc-show kbd',e=>e.textContent)));
    await shot(page,'4-blundercheck-laptop'); await page.context().close(); }
  for(const [vw,vh,tag] of [[1440,900,'laptop'],[390,844,'phone'],[320,568,'se']]){
    const page=await open(vw,vh,'#guess');
    await waitFor(page,()=>window.GtmTab&&document.querySelectorAll('#g-list .drill').length>3);
    const first=await page.evaluate(async()=>{ const idx=await fetch('data/gtm/index.json').then(r=>r.json()); await GtmTab.load(idx[0].file); return idx[0].id });
    await waitFor(page,()=>{ const S=GtmTab.state; return S.game&&S.ply>=S.game.theory&&(S.ply%2===0?'w':'b')===S.game.winner&&!S.busy&&/your move/.test(document.getElementById('g-status').textContent) },null,30000);
    if(tag==='laptop'){
      const mv=await page.evaluate(()=>{ const S=GtmTab.state, m=new Chess(S.g.fen()).move(S.game.moves[S.ply]); return [m.from,m.to] });
      await page.evaluate(([a,b])=>GtmTab.userMove(a,b),mv);
      await waitFor(page,()=>{ const S=GtmTab.state; return S.rows.length===1&&(S.ply%2===0?'w':'b')===S.game.winner&&!S.busy&&!document.getElementById('g-takeback').disabled },null,20000);
      const p0=await page.evaluate(()=>[GtmTab.state.ply,GtmTab.state.pts]);
      await page.keyboard.press('b'); await sleep(300);
      const p1=await page.evaluate(()=>[GtmTab.state.ply,GtmTab.state.pts,document.getElementById('g-status').textContent]);
      check('Guess the move: B takes back to the last guess, points unchanged',p1[0]===p0[0]-2&&p1[1]===p0[1]&&/try another move/.test(p1[2]),p1[2].trim().slice(0,70));
      await shot(page,'4-guess-takeback-laptop');
      await page.keyboard.press('r'); await sleep(500);
      const r=await page.evaluate(()=>[GtmTab.state.ply<=GtmTab.state.game.theory,GtmTab.state.rows.length,GtmTab.state.game.id]);
      check('R restarts the game',r[0]&&r[1]===0&&r[2]===first);
      await page.keyboard.press('n'); await sleep(700);
      const n=await page.evaluate(()=>GtmTab.state.game.id);
      check('N goes to the next game',n&&n!==first,n);
    } else {
      const fit=await page.evaluate(()=>{ const t=document.getElementById('g-tools'), r=t.getBoundingClientRect(); const bs=[...t.querySelectorAll('button')].filter(b=>b.offsetParent);
        return {over:document.documentElement.scrollWidth>innerWidth+1,out:bs.filter(b=>{ const x=b.getBoundingClientRect(); return x.right>innerWidth+1||x.left<-1 }).length,n:bs.length,h:Math.round(r.height)} });
      check(`Guess the move at ${vw}px: the toolbar with Take back / Restart / Next game fits, no sideways scroll`,!fit.over&&fit.out===0,JSON.stringify(fit));
      await shot(page,'4-guess-'+tag) }
    await page.context().close() }

  /* ---------- stage 2 (items 6, 7, 8, 10, quick wins): a new visitor, on an iPhone and a laptop ---------- */
  { const ph=await open(390,844,'#today'); const reqs=[]; ph.on('request',r=>reqs.push(r.url()));
    await waitFor(ph,()=>window.TodayTab&&(TacticsTab.lib||[]).length>0&&!document.getElementById('welcome').hidden);
    const card=await ph.$eval('#welcome',e=>Math.round(e.getBoundingClientRect().height));
    check('first phone screen: the first-visit card is short (was 923 px on an 844 px screen)',card<420,card+' px');
    await shot(ph,'6-first-visit-phone');
    await sleep(6500);
    const all=await ph.evaluate(()=>performance.getEntriesByType('resource').map(r=>r.name));
    check('Today, 6 s, no touch: no Stockfish download',!all.some(u=>/stockfish|\.wasm/.test(u)),all.filter(u=>/stockfish|wasm/.test(u)).join(' '));
    check('no request to Google Fonts; the two fonts come from the site',!all.some(u=>/fonts\.(googleapis|gstatic)/.test(u))&&all.some(u=>/assets\/fonts\/.*\.woff2/.test(u)),all.filter(u=>/font/.test(u)).length+' font files');
    await ph.click('#welcome-try'); await sleep(900);
    const st=await ph.evaluate(()=>({sel:String(TodayTab.sel),hidden:document.getElementById('welcome').hidden,r:(TacticsTab.state.cur||{}).rating}));
    check('Just try a puzzle: a puzzle near 1500 is on the board',/^puzzle/.test(st.sel)&&st.hidden&&Math.abs(st.r-1500)<=150,JSON.stringify(st));
    await shot(ph,'6-try-a-puzzle-phone');
    const r1=await ph.evaluate(()=>{ const z=TacticsTab.state.cur; TacticsTab.saveResult(z.id,true); return Store.get('tac-rating') });
    check('after the first solved puzzle the rating has moved from 1500, not to 2002',r1.n===1&&r1.r>1500&&r1.r<1540,JSON.stringify(r1));
    await ph.evaluate(()=>{ location.hash='#tactics' }); await sleep(600);
    const near=await ph.evaluate(()=>{ const L=TacticsTab.filtered(), r=Store.get('tac-rating').r; return [L.length,L.every(z=>Math.abs(z.rating-r)<=150),document.querySelector('#t-chiprows [aria-pressed="true"]').textContent] });
    check('Tactics: Near my rating from the first puzzle',near[0]>20&&near[1]&&/Near/.test(near[2]),near.join(' | '));
    await ph.evaluate(()=>{ location.hash='#play' }); await sleep(500);
    const idle=await ph.evaluate(()=>[document.getElementById('pl-tools').offsetParent===null,document.getElementById('pl-moveform').offsetParent===null,!!document.getElementById('pl-new').offsetParent]);
    check('Play on a phone before a game: New game, without Hint / Take back / Peek / Resign and the move box',idle[0]&&idle[1]&&idle[2],idle.join(','));
    await shot(ph,'8-play-idle-phone');
    await ph.click('#pl-new'); await sleep(600);
    check('…they appear when the game starts',await ph.evaluate(()=>document.getElementById('pl-tools').offsetParent!==null));
    check('phones show no key caps on buttons',BROWSER==='firefox'||await ph.evaluate(()=>[...document.querySelectorAll('.btn kbd')].every(k=>k.offsetParent===null)));
    await ph.context().close();
    const pg=await open(1440,900,'#openings'); await sleep(2500);
    const res=await pg.evaluate(()=>performance.getEntriesByType('resource').map(r=>r.name));
    check('landing on Openings: the puzzle library (2.9 MB) is not downloaded',!res.some(u=>/tactics\.json/.test(u)));
    const acct=await pg.evaluate(()=>{ const b=document.getElementById('o-acct'); return b?b.textContent:'' });
    check('the book note never says "isn’t loaded" to a new visitor',!/isn’t loaded/.test(acct),acct.slice(0,70));
    await shot(pg,'6-openings-laptop'); await pg.evaluate(()=>{ location.hash='#today' }); await sleep(800); await shot(pg,'6-first-visit-laptop');
    await pg.context().close(); }
  /* item 10: the report card says one number for inaccuracies (the ten published games, Standard, the real engine) */
  { const idx=JSON.parse(fs.readFileSync(path.join(SITE,'data','gtm','index.json'),'utf8')).filter(e=>e.set!=='masters').slice(0,10);
    const pgn=idx.map(e=>{ const G=JSON.parse(fs.readFileSync(path.join(SITE,'data','gtm',e.file),'utf8'));
      return `[Event "${G.event}"]\n[Date "${G.date}"]\n[White "${G.white}"]\n[Black "${G.black}"]\n[Result "${G.result}"]\n\n${G.moves.map((m,i)=>(i%2?'':(i/2+1)+'. ')+m).join(' ')} ${G.result}\n` }).join('\n');
    const page=await open(1440,900,'#analyze');
    await page.selectOption('#a-site','pgn'); await sleep(100);
    await page.setInputFiles('#a-pgnfile',{name:'published.pgn',mimeType:'application/x-chess-pgn',buffer:Buffer.from(pgn)});
    await waitFor(page,()=>AnalyzeTab.files.length===1&&document.querySelectorAll('#a-pgnnames input:checked').length>=1);
    await page.click('#a-go');
    const done=await waitFor(page,()=>!AnalyzeTab.running&&/Done\./.test(document.getElementById('a-note').textContent),null,600000);
    const R=await page.evaluate(()=>{ const t=document.getElementById('a-report').textContent; const h=t.match(/(\d+) \/ (\d+) \/ (\d+)\s*your blunders/); const row=k=>{ const c=document.querySelector('#a-report tr.q-'+k+' td[data-l="All"] .note'); return c?+c.textContent:null };
      return {head:h?h.slice(1).map(Number):null,table:[row('blun'),row('mist'),row('inacc')],n:AStats.last.rows.length} });
    check('report card: the headline and Move quality agree on blunders / mistakes / inaccuracies',done&&R.head&&R.table.every((v,i)=>v===R.head[i]),JSON.stringify(R));
    await shot(page,'10-report-laptop'); await page.context().close(); }

  check('no page errors',errors.length===0,errors.slice(0,3).join(' | '));
  await browser.close(); if(srv) srv.close();
  console.log(failed?`\n${failed} FAILED`:'\nAll audit steps reproduce as fixed.');
  process.exit(failed?1:0);
})().catch(e=>{ console.error('audit run crashed:',e); process.exit(1) });
