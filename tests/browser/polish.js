/* Think Ahead — the finish pass on phones (19 Nov 2026): every page, in the states a visitor sees, at an iPhone's size,
   with checks a person would otherwise make by eye.
     node tests/browser/polish.js <webkit|chromium|firefox> [outDir] [--seed]
   --seed analyzes a published game (data/gtm/game8.json) with the real Stockfish and adds a video, then keeps that browser
   storage in outDir/state.json; later runs reuse it (about 3 minutes saved each time).
   For each screen: a full-page screenshot, and these checks:
     overflow   something reaches past the right edge of the screen (outside a scrolling box)
     overlap    two visible things lie on each other (text, buttons, inputs), outside the fixed bottom bar
     squeezed   a paragraph or title crushed into a column so narrow it wraps every word or two
     clipped    text cut off by its box
     hidden     the bottom bar covers the end of the page
     text       a label or sentence that starts in lower case, a double space, a space before a comma
   Exit code 1 when a check fails. */
'use strict';
const http=require('http'), fs=require('fs'), path=require('path');
const {chromium,firefox,webkit}=require('playwright');
const BROWSER=process.argv[2]||'webkit';
const OUT=path.resolve(process.argv[3]&&!process.argv[3].startsWith('--')?process.argv[3]:path.join(__dirname,'out',BROWSER,'polish'));
const SEED=process.argv.includes('--seed');
const SITE=path.join(__dirname,'..','..','site');
fs.mkdirSync(OUT,{recursive:true});
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json',
  '.wasm':'application/wasm','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png','.woff2':'font/woff2','.txt':'text/plain; charset=utf-8'};
const PORT=+process.env.PORT||8765;   /* fixed, so the kept storage (per origin) is found again */
function serve(){ return new Promise(res=>{ const srv=http.createServer((req,rsp)=>{
  let p=decodeURIComponent(req.url.split('?')[0].split('#')[0]); if(p.endsWith('/')) p+='index.html';
  const f=path.join(SITE,path.normalize(p).replace(/^(\.\.[/\\])+/,''));
  if(!f.startsWith(SITE)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){ rsp.writeHead(404); rsp.end('not found'); return }
  rsp.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream','Cache-Control':'no-store'}); fs.createReadStream(f).pipe(rsp) });
  srv.listen(PORT,'127.0.0.1',()=>res(srv)) }) }
let failed=0; const check=(name,ok,detail='')=>{ if(!ok) failed++; console.log((ok?'  ok   ':'  FAIL ')+name+(detail?' — '+detail:'')) };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const waitFor=async(page,fn,arg,ms=20000)=>{ try{ await page.waitForFunction(fn,arg,{timeout:ms,polling:100}); return true }catch(e){ return false } };

/* Runs in the page. Returns a list of problems on the screen as it is. */
const SCAN=`()=>{
  const W=document.documentElement.clientWidth, out=[], seen=new Set();
  /* a board taller than the room between the tab row and the fixed bottom bar can never be seen whole (his iPad, 23 Nov 2026) */
  { const bar=[...document.querySelectorAll('.bbar')].find(x=>x.getClientRects().length&&getComputedStyle(x).position==='fixed');
    const nav=document.querySelector('nav.tabs');
    if(bar&&nav) for(const b of document.querySelectorAll('.board')){ if(!b.getClientRects().length||b.closest('[hidden]')) continue; const h=b.getBoundingClientRect().height;
      const room=bar.getBoundingClientRect().top-Math.max(0,nav.getBoundingClientRect().bottom);
      if(h>8&&h>room+1&&!seen.has('board:'+(b.id||''))){ seen.add('board:'+(b.id||'')); out.push('board '+(b.id||'')+' is '+Math.round(h)+' px, only '+Math.round(room)+' px between the tabs and the bottom bar') } } }
  const vis=e=>{ if(!e.getClientRects().length) return false; const cs=getComputedStyle(e); if(cs.visibility==='hidden'||+cs.opacity===0) return false;
    if(e.closest('.vh,.sr-only')) return false;
    for(let p=e;p&&p!==document.body;p=p.parentElement){ if(p.hidden) return false; const c=getComputedStyle(p); if(c.display==='none') return false;
      const d=p.parentElement; if(d&&d.tagName==='DETAILS'&&!d.open&&p.tagName!=='SUMMARY') return false } return true };
  const name=e=>{ const t=(e.innerText||e.value||e.placeholder||e.getAttribute('aria-label')||'').replace(/\\s+/g,' ').trim(); return (e.id?'#'+e.id:e.tagName.toLowerCase()+(e.className&&typeof e.className==='string'?'.'+e.className.trim().split(/\\s+/)[0]:''))+(t?' "'+t.slice(0,40)+'"':'') };
  const add=(k,s)=>{ const key=k+s; if(!seen.has(key)){ seen.add(key); out.push(k+': '+s) } };
  const fixedOf=e=>{ for(let p=e;p&&p!==document.documentElement;p=p.parentElement){ const c=getComputedStyle(p).position; if(c==='fixed'||c==='sticky') return p } return null };
  const scroller=e=>{ for(let p=e.parentElement;p&&p!==document.body;p=p.parentElement){ const c=getComputedStyle(p); if(/(auto|scroll|hidden|clip)/.test(c.overflowX)) return p } return null };
  const main=document.querySelector('main')||document.body;
  const all=[...document.body.querySelectorAll('*')].filter(e=>!['SCRIPT','STYLE','OPTION','DATALIST','svg','path','g','line','rect','circle','polygon','text','BR'].includes(e.tagName)&&vis(e));
  /* overflow */
  if(document.documentElement.scrollWidth>W+1) add('overflow','the page scrolls sideways ('+document.documentElement.scrollWidth+' > '+W+')');
  for(const e of all){ const r=e.getBoundingClientRect(); if(r.width<1||r.height<1) continue;
    if((r.right>W+1||r.left<-1)&&!scroller(e)&&!e.closest('.sr-only')) add('overflow',name(e)+' spans '+Math.round(r.left)+'..'+Math.round(r.right)) }
  /* leaves: things a person reads or presses */
  const ownText=e=>[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim());
  const clippedOut=e=>{ const r=e.getBoundingClientRect(); for(let p=e.parentElement;p&&p!==document.body;p=p.parentElement){ const c=getComputedStyle(p); if(/(auto|scroll|hidden)/.test(c.overflowY)){ const q=p.getBoundingClientRect(); if(r.top>=q.bottom-1||r.bottom<=q.top+1) return true } } return false };
  const leaves=all.filter(e=>{ if(e.closest('.board,.sr-only,.pchart,svg,.rng')||clippedOut(e)) return false;
    if(/^(BUTTON|INPUT|SELECT|TEXTAREA|A|SUMMARY|IMG)$/.test(e.tagName)) return true;
    return ownText(e) });
  const top=leaves.filter(e=>!leaves.some(o=>o!==e&&o.contains(e)&&/^(BUTTON|A|SUMMARY|LABEL)$/.test(o.tagName)));
  const R=new Map(top.map(e=>[e,e.getBoundingClientRect()]));
  /* text boxes: measure the text itself, not the block (a block is as wide as its parent) */
  const textRect=e=>{ if(/^(BUTTON|INPUT|SELECT|TEXTAREA|SUMMARY|IMG)$/.test(e.tagName)) return R.get(e);
    const rg=document.createRange(); let L=1e9,T=1e9,Rr=-1e9,B=-1e9; for(const n of e.childNodes){ if(n.nodeType!==3||!n.textContent.trim()) continue; rg.selectNodeContents(n); for(const q of rg.getClientRects()){ if(q.width<1) continue; L=Math.min(L,q.left);T=Math.min(T,q.top);Rr=Math.max(Rr,q.right);B=Math.max(B,q.bottom) } }
    return L<1e9?{left:L,top:T,right:Rr,bottom:B,width:Rr-L,height:B-T}:R.get(e) };
  const lineRects=e=>{ if(/^(BUTTON|INPUT|SELECT|TEXTAREA|SUMMARY|IMG)$/.test(e.tagName)||e.tagName==='A'&&getComputedStyle(e).display!=='inline') return [R.get(e)];
    const rg=document.createRange(), o=[]; for(const n of e.childNodes){ if(n.nodeType===3&&n.textContent.trim()){ rg.selectNodeContents(n); o.push(...[...rg.getClientRects()].filter(q=>q.width>=1)) } }
    if(e.tagName==='A'||!o.length) o.push(...[...e.getClientRects()]); return o };
  const TR=new Map(top.map(e=>[e,lineRects(e)]));
  const layer=e=>e.closest('.xmenu,[role=menu],.popover,.qpop,[popover],.bb-more,dialog')||fixedOf(e);
  for(let i=0;i<top.length;i++) for(let j=i+1;j<top.length;j++){ const a=top[i], b=top[j]; if(a.contains(b)||b.contains(a)) continue;
    if(layer(a)!==layer(b)||a.closest('.xmenu')) continue;   /* the Extra menu's two columns: judged by eye */   /* a menu, popover or the fixed bar over the page: by design (the bar is checked below) */
    let hit=false; for(const p of TR.get(a)) for(const q of TR.get(b)){ const x=Math.min(p.right,q.right)-Math.max(p.left,q.left), y=Math.min(p.bottom,q.bottom)-Math.max(p.top,q.top); if(x>3&&y>3) hit=true }
    if(hit) add('overlap',name(a)+' / '+name(b)) }
  /* squeezed: a text block with 4+ lines but under ~9 characters a line */
  for(const e of top){ if(/^(INPUT|SELECT|TEXTAREA|IMG)$/.test(e.tagName)) continue; const t=(e.innerText||'').trim(); if(t.length<20) continue;
    const cs=getComputedStyle(e), lh=parseFloat(cs.lineHeight)||parseFloat(cs.fontSize)*1.3, lines=Math.round(e.getBoundingClientRect().height/lh);
    if(lines>=4&&t.length/lines<10) add('squeezed',name(e)+' wraps into '+lines+' lines '+Math.round(e.getBoundingClientRect().width)+' px wide') }
  /* clipped */
  for(const e of top){ const cs=getComputedStyle(e); if(/^(INPUT|SELECT|TEXTAREA)$/.test(e.tagName)) continue;
    if((cs.overflowX!=='visible'||cs.textOverflow==='ellipsis')&&e.scrollWidth>e.clientWidth+2&&cs.whiteSpace==='nowrap') add('clipped',name(e)+' '+e.scrollWidth+' > '+e.clientWidth) }
  /* the bottom bar must not cover the end of the page */
  const bar=[...document.querySelectorAll('.bbar')].find(b=>vis(b)&&getComputedStyle(b).position==='fixed');
  if(bar){ const bt=bar.getBoundingClientRect().top; const end=main.getBoundingClientRect().bottom, docEnd=document.documentElement.scrollHeight;
    const lastBottom=Math.max(...top.filter(e=>!fixedOf(e)&&main.contains(e)).map(e=>R.get(e).bottom+scrollY));
    if(lastBottom>docEnd-(innerHeight-bt)+1) add('hidden','the bottom bar covers the page end ('+Math.round(lastBottom)+' > '+Math.round(docEnd-(innerHeight-bt))+')') }
  /* text */
  for(const e of top){ const t=(e.tagName==='INPUT'?(e.placeholder||''):(e.innerText||'')).replace(/\\u00a0/g,' ');
    /* a ? help button's "?" is a button, not the end of a sentence (iPad sizes show table headings with one, 22 Nov 2026) */
    const tq=e.querySelector&&e.querySelector('.qhelp')?(()=>{ const c=e.cloneNode(true); c.querySelectorAll('.qhelp').forEach(x=>x.remove()); return (c.textContent||'').replace(/\\u00a0/g,' ') })():t;
    if(/^(BUTTON|SUMMARY|LABEL|H1|H2|H3|H4|TH)$/.test(e.tagName)||e.classList.contains('label')||e.classList.contains('chip')){ const s=t.trim().replace(/^[^A-Za-z0-9]+/,''); if(/^[a-z]/.test(s)&&!/^(e\\.g|vs|or|and|of|i\\.e|x|a\\d|[a-h][1-8]|[KQRBN]?[a-h]?x?[a-h][1-8])\\b/.test(s)) add('text','lower-case label '+name(e)) }
    if(/[.!?]\\s+[a-z]/.test(tq)&&!/\\b(e\\.g|i\\.e|vs|etc|approx|min|sec|no)\\.\\s+[a-z]/i.test(tq)) add('text','sentence starts lower case in '+name(e)+': …'+(tq.match(/.{0,20}[.!?]\\s+[a-z].{0,12}/)||[''])[0]);
    if((e.tagName==='INPUT'||!e.children.length)&&/\\S  +\\S/.test(t)) add('text','double space in '+name(e));
    if(/ ,/.test(t)) add('text','space before comma in '+name(e)) }
  return out }`;

(async()=>{
  const srv=await serve(); const base=`http://127.0.0.1:${PORT}/`;
  const type={chromium,firefox,webkit}[BROWSER]; if(!type) throw new Error('unknown browser '+BROWSER);
  const browser=await type.launch(); const STATE=path.join(OUT,'state.json');
  const errors=[];
  /* TOUCH=1: a large touch screen (an iPad: W=1032 H=1376 portrait, W=1376 H=1032 landscape, W=744 H=1133 iPad mini) */
  const ctxOpts=(w,h,state)=>({viewport:{width:w,height:h},colorScheme:'light',...(w<500?{hasTouch:true,isMobile:BROWSER!=='firefox',deviceScaleFactor:2}:process.env.TOUCH?{hasTouch:true,deviceScaleFactor:2}:{}),...(state&&fs.existsSync(state)?{storageState:state}:{})});
  console.log(`== polish in ${BROWSER} ${browser.version()}`);

  /* ---------- seed: an analyzed game and a video ---------- */
  if(SEED||!fs.existsSync(STATE)){
    const ctx=await browser.newContext(ctxOpts(1440,900)); const page=await ctx.newPage();
    await page.goto(base+'#analyze'); await sleep(500);
    const games=JSON.parse(fs.readFileSync(path.join(SITE,'data','gtm','index.json'),'utf8'));
    const files=(Array.isArray(games)?games:games.games||[]).map(x=>typeof x==='string'?x:(x.file||x.id)).filter(Boolean);
    const pgn=fs.readdirSync(path.join(SITE,'data','gtm')).filter(f=>/^game\d+\.json$/.test(f)).map(f=>{ const G=JSON.parse(fs.readFileSync(path.join(SITE,'data','gtm',f),'utf8'));
      return `[Event "${G.event}"]\n[Site "Lichess"]\n[Date "${G.date}"]\n[White "${G.white}"]\n[Black "${G.black}"]\n[Result "${G.result}"]\n[WhiteElo "${G.we}"]\n[BlackElo "${G.be}"]\n\n${G.moves.map((m,i)=>(i%2?'':(i/2+1)+'. ')+m).join(' ')} ${G.result}\n` }).join('\n');
    await page.selectOption('#a-site','pgn'); await sleep(100);
    await page.setInputFiles('#a-pgnfile',{name:'game.pgn',mimeType:'application/x-chess-pgn',buffer:Buffer.from(pgn)});
    await waitFor(page,()=>AnalyzeTab.files.length===1&&document.querySelectorAll('#a-pgnnames input').length>=1);
    await page.evaluate(()=>{ document.querySelectorAll('#a-pgnnames input').forEach(i=>{ const on=/Narayanan/.test(i.value); if(i.checked!==on) i.click() }) });
    await page.click('#a-go');
    check('seed: the game is analyzed',await waitFor(page,()=>!AnalyzeTab.running&&/Done\./.test(document.getElementById('a-note').textContent),null,420000));
    if(await page.$('#a-savedrills')){ await page.click('#a-savedrills'); await waitFor(page,()=>!/Checking|Saving/.test(document.getElementById('a-savedrills').textContent),null,300000) }
    await page.evaluate(()=>{ Store.put('watch',{v:{'dQw4w9WgXcQ':{t:1200,u:Date.now()}},list:[
      {id:'dQw4w9WgXcQ',title:'The Scandinavian Defense, explained: a speedrun from first moves to master level (the long game from 20:00)',channel:'A coach',series:'Speedruns',topic:'openings',opening:'Scandinavian Defense',kind:'lecture',dur:5400,added:Date.now()},
      {id:'aaaaaaaaaaa',title:'Rook endgames you must know',channel:'A channel',topic:'endgames',kind:'lecture',added:Date.now()}]}) });
    await ctx.storageState({path:STATE}); await ctx.close() }

  /* ---------- the phone (or the size in W and H) ---------- */
  const W=+process.env.W||393, H=+process.env.H||852;   /* iPhone 15 Pro */
  const ctx=await browser.newContext(ctxOpts(W,H,STATE)); const page=await ctx.newPage();
  page.on('pageerror',e=>errors.push('pageerror: '+(e&&e.message||e)));
  page.on('console',m=>{ if(m.type()==='error'&&!/fonts\.(googleapis|gstatic)|favicon|Failed to load resource|youtube/.test(m.text())) errors.push('console.error: '+m.text()) });
  let n=0;
  /* one screen: the checks at each scroll position, and a phone-sized screenshot of each slice (fixed bars where a person sees them) */
  const screen=async(label,fn,{slices=9}={})=>{ if(fn) await fn(); await sleep(350);
    const file=String(++n).padStart(2,'0')+'-'+label.replace(/[^a-z0-9]+/gi,'-').toLowerCase().replace(/-+$/,'');
    const total=await page.evaluate(()=>document.documentElement.scrollHeight), step=H-120, probs=new Set(), keep=await page.evaluate(()=>scrollY);
    for(let i=0,y=keep;i<slices&&(i===0||y<total-H+step);i++,y+=step){
      if(i) await page.evaluate(v=>scrollTo(0,v),y); await sleep(i?150:0);
      for(const p of await page.evaluate(`(${SCAN})()`)) probs.add(p);
      await page.screenshot({path:path.join(OUT,file+(i?'-'+i:'')+'.jpg'),type:'jpeg',quality:70});
      if(y>=total-H) break }
    await page.evaluate(v=>scrollTo(0,v),keep);
    check(label,!probs.size,probs.size?'\n        '+[...probs].join('\n        '):''); };
  const go=async(hash,ready)=>{ await page.goto(base+'#'+hash); await sleep(700); if(ready) await waitFor(page,ready,null,20000) };
  const tap=async sel=>{ const el=await page.$(sel); if(el&&await el.isVisible()){ await el.click(); await sleep(300); return true } return false };

  await go('today'); await screen('Today');
  const help=async sec=>{ const b=await page.evaluateHandle(s=>[...document.querySelectorAll(s+' .qhelp')].find(x=>x.offsetParent),'#'+sec); const el=b.asElement(); if(!el) return false;
    await el.evaluate(x=>x.scrollIntoView({block:'center'})); await sleep(200); await el.click(); return true };
  await screen('Today, a ? open',async()=>{ await help('today') },{slices:1});
  await screen('Today, menu Extra open',async()=>{ await go('today'); await page.evaluate(()=>{ const b=[...document.querySelectorAll('#tabs button')].find(x=>/Extra/.test(x.textContent)); if(b) b.click() }) });
  await go('openings',()=>document.querySelector('#o-board .sq, #o-board piece, #o-board img')); await screen('Openings');
  await screen('Openings, ⋯ open',async()=>{ await tap('#openings .bb-morebtn') });
  await go('tactics',()=>document.querySelector('#t-board .sq, #t-board piece, #t-board img, #t-board svg')); await screen('Tactics');
  await screen('Tactics, after a hint',async()=>{ await tap('#t-hint') });
  await go('blind',()=>document.querySelector('#bl-root')&&document.querySelector('#bl-root').textContent.length>50); await screen('Blind tactics');
  await go('calc',()=>window.CalcTab&&document.querySelector('#cc-board')); await screen('Calculation');
  await go('endgames',()=>document.querySelectorAll('#eg-list .drill').length>5); await screen('Endgames');
  await go('analyze'); await screen('Analyze my games');
  await screen('Analyze, a ? open',async()=>{ await help('analyze') },{slices:1});
  await go('drills'); await screen('Drills');
  await go('blundercheck'); await screen('Blunder check');
  await go('play'); await screen('Play, before a game');
  await screen('Play, a game started',async()=>{ await tap('#pl-new')||await tap('#play .btn.primary'); await sleep(800) });
  await screen('Play, resign asks first',async()=>{ await tap('#pl-resign') },{slices:1});
  await screen('Play, after resigning',async()=>{ await tap('#pl-resign'); await sleep(500) });
  await go('guess',()=>document.querySelector('#g-board')); await screen('Guess the move');
  await screen('Guess the move, a game started',async()=>{ await page.click('#g-start'); await waitFor(page,()=>!document.getElementById('g-train').hidden) });   /* his iPad, 23 Nov 2026: the board under the bar */
  await screen('Guess the move, a critical moment',async()=>{ await page.evaluate(async()=>{   /* 23 Nov 2026: the brass ring and "take your time" */
    const crit=await fetch('data/gtm/critical.json').then(r=>r.json()), idx=await fetch('data/gtm/index.json').then(r=>r.json());
    const e=idx.find(x=>crit[x.id]&&x.set==='masters')||idx.find(x=>crit[x.id]); await GtmTab.load(e.file);
    const S=GtmTab.state, t=crit[e.id].plies[0]; S.gen++; S.g=new Chess(); for(let i=0;i<t-1;i++) S.g.move(S.game.moves[i]); S.ply=t-1; GtmTab.next() });
    await waitFor(page,()=>document.getElementById('g-board').classList.contains('crit')) });
  await go('players'); await screen('Players');
  await go('watch'); await screen('Watch');
  await screen('Watch, a series open',async()=>{ await page.evaluate(()=>document.querySelectorAll('#wa-list details').forEach(d=>d.open=true)) });
  await screen('Watch, Add a video open',async()=>{ await page.evaluate(()=>{ $('wa-addcard').open=true }) });
  await go('progress'); await screen('Progress');
  await go('settings'); await screen('Settings');
  await go('about'); await screen('About');
  const g=await page.evaluate(()=>{ const a=Store.get('agames'); return a&&a.g&&Object.keys(a.g)[0] });
  if(g){ await go('game?id='+encodeURIComponent(g)+'&ply=12'); await screen('A game you analyzed') }

  check('no page errors',!errors.length,errors.slice(0,8).join(' | '));
  await browser.close(); srv.close();
  console.log(failed?`\n${failed} check(s) failed`:'\nall checks passed'); process.exit(failed?1:0);
})().catch(e=>{ console.error(e); process.exit(2) });
