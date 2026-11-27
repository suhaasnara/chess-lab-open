/* The 26 Nov 2026 polish batch (roadmap rows #262, #290, #275, #291, #276, #269). */
'use strict';

module.exports=async H=>{
  const {makePage,sleep,assert,section}=H;

  section('t99: Tactics has Solution and Skip (roadmap #262)');
  {
    const {w}=await makePage();
    w.location.hash='#tactics'; await w.TacticsTab.ensure(); await sleep(30);
    const T=w.TacticsTab, d=w.document, rec=id=>(w.Store.get('tactics-progress')||{})[id], rt=()=>w.Store.get('tac-rating')||{r:1500,n:0};
    const nb=d.getElementById('t-next'), sb=d.getElementById('t-sol');
    const [a,b]=T.lib.filter(z=>z.rating&&z.moves.length>=4);
    T.load(a); await sleep(30);
    assert(sb&&/Solution/.test(sb.textContent)&&/^Skip/.test(nb.textContent),'a Solution button, and Next reads Skip before you try the puzzle');
    nb.click(); await sleep(30);
    assert(T.state.cur.id!==a.id&&!rec(a.id)&&rt().n===0,'Skip goes on without a result (nothing recorded, no rating change)');
    T.load(b); await sleep(30);
    const s0=T.state.step;
    sb.click(); await sleep(30);
    const S=T.state;
    assert(rec(b.id)&&rec(b.id).ok===false&&rt().n===1,'Solution counts as a miss on the first try (rated, as a Hint is)');
    assert(S.sol&&S.sol.sans.length===b.moves.length-s0&&S.view===1,'the rest of the line is ready to step through, its first move on the board');
    assert(/^Next/.test(nb.textContent),'… and Next reads Next again');
    const box=d.getElementById('t-status-box');
    assert(box.querySelectorAll('.tsol .vmv').length===S.sol.sans.length&&/Counted as a miss/.test(box.textContent),'the line shows as moves you can tap');
    const ev=k=>w.dispatchEvent(new w.KeyboardEvent('keydown',{key:k,bubbles:true}));
    const pv=d.getElementById('t-prev'), fw=d.getElementById('t-fwd');
    assert(!pv.hidden&&!fw.hidden&&d.getElementById('t-hint').hidden&&sb.hidden,'‹ › show in the bar (Hint and Solution make room for them)');
    fw.click(); await sleep(10); assert(S.view===2,'› steps forward'); pv.click(); await sleep(10); assert(S.view===1,'‹ steps back');
    ev('ArrowRight'); await sleep(10); assert(S.view===2,'→ steps forward through the solution');
    ev('ArrowLeft'); ev('ArrowLeft'); await sleep(10); assert(S.view===0,'← steps back (to the puzzle’s start)');
    box.querySelector('.tsol .vmv[data-at="'+S.sol.sans.length+'"]').click(); await sleep(10);
    assert(S.view===S.sol.sans.length,'a tap on a move shows that position');
    const before=JSON.stringify(rec(b.id)), m=b.moves[s0];
    await T.userMove(m.slice(0,2),m.slice(2,4)); await sleep(30);
    assert(JSON.stringify(rec(b.id))===before&&!S.solved,'moves on the board do nothing once the solution is shown');
    ev('g'); await sleep(10);
    assert(rt().n===1,'a second Solution adds nothing');
    /* after a wrong first try, Solution records nothing more */
    const c=T.lib.find(z=>z.rating&&z.moves.length>=4&&z.id!==a.id&&z.id!==b.id); T.load(c); await sleep(30);
    const exp=c.moves[T.state.step], g=new w.Chess(T.state.g.fen()), wrong=g.moves({verbose:true}).find(x=>x.from+x.to!==exp.slice(0,4)&&!(()=>{ const t=new w.Chess(g.fen()); t.move(x); return t.in_checkmate() })());
    await T.userMove(wrong.from,wrong.to); await sleep(30);
    const n1=rt().n; assert(/^Next/.test(nb.textContent),'after a miss, the button reads Next');
    ev('g'); await sleep(30);
    assert(rt().n===n1&&T.state.sol,'Solution after a miss shows the line and records nothing more');
    T.next(); await sleep(30); assert(pv.hidden&&fw.hidden&&!sb.hidden,'the next puzzle: ‹ › go, Hint and Solution are back');
    assert(w.Keys.map('tactics').g&&w.Keys.map('tactics').ArrowLeft,'G and ← → are in the keymap (the ? list)');
  }

  section('t100: due counts on the tabs and on Today; Drills’ Next in review order (roadmap #275)');
  {
    const {w}=await makePage(); const d=w.document, DAY=864e5, now=Date.now();
    const fen='r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3';
    const mk=(id,extra)=>Object.assign({id,fen,played:'a3',playedUci:'a2a3',best:'f1c4',drop:0.2,before:0.3,date:'2026-11-01',opp:'X'+id,site:'lichess',color:'w'},extra||{});
    w.Store.put('adrills',[mk('a1'),mk('a2'),mk('a3'),mk('a4'),mk('a5',{kind:'punish'}),mk('a6')]);
    /* a2: missed yesterday (due); a3: solved 4 days ago once (due); a4: solved today (not due); a5: Punish, missed (no schedule); a6: missed today (not due yet) */
    w.Store.put('adrills-progress',{a2:{tries:1,ok:false,okN:0,t:now-DAY-1000},a3:{tries:1,ok:true,okN:1,t:now-4*DAY},a4:{tries:1,ok:true,okN:1,t:now},a5:{tries:1,ok:false,okN:0,t:now-2*DAY},a6:{tries:1,ok:false,okN:0,t:now}});
    w.Store.put('endgame-progress',{q1:{tries:1,ok:false,t:now-2*DAY}});
    await sleep(20);
    const tab=d.querySelector('#tabs .inner > a[data-view="drills"] .duebadge');
    assert(tab&&tab.textContent.replace(/\s+/g,' ').trim()==='2 due'&&/^2/.test(tab.firstChild.textContent),'the Drills tab shows 2 (a miss from yesterday and a solve 4 days old; not today’s, not Punish)');
    const eg=d.querySelector('#x-menu a[data-view="endgames"] .duebadge'), xb=d.querySelector('#x-btn .duebadge');
    assert(eg&&eg.textContent==='1 due'&&xb&&/^1/.test(xb.textContent),'Endgames in Extra says “1 due”, and Extra’s button carries it');
    assert(!d.querySelector('#x-menu a[data-view="blind"] .duebadge'),'nothing on a section with nothing due');
    w.location.hash='#today'; await sleep(80);
    const card=d.getElementById('td-due');
    assert(card&&/Drills\s*2 drills due/.test(card.textContent)&&/Endgames\s*1 endgame due/.test(card.textContent)&&card.querySelector('a[href="#endgames"]'),'Today has a Due for review card with each section and a link to it');
    /* a result changes the counts at once */
    const p=w.Store.get('adrills-progress'); p.a2={tries:2,ok:true,okN:1,t:Date.now()}; w.Store.put('adrills-progress',p); await sleep(20);
    assert(/^1/.test(d.querySelector('#tabs .inner > a[data-view="drills"] .duebadge').textContent),'after a review the tab’s count goes down');
    p.a2.t=now-DAY-1000; p.a2.ok=false; p.a2.okN=0; w.Store.put('adrills-progress',p);
    w.location.hash='#drills'; await sleep(80);
    assert(/· 2 due/.test(d.getElementById('d-listlabel').textContent)&&d.querySelectorAll('#d-list .tag.info').length===2,'Drills’ list says how many are due and tags them');
    /* Next: missed first, then due, then never tried */
    w.DrillsTab.load(w.Store.get('adrills')[0]); await sleep(20);
    const seq=[]; for(let i=0;i<3;i++){ w.DrillsTab.next(); await sleep(20); seq.push(w.DrillsTab.state.cur.id) }
    assert(seq[0]==='a2'&&seq[1]==='a3','Next goes to a miss that is due first, then a solve that is due ('+seq.join(' ')+')');
    w.DrillsTab.load(w.Store.get('adrills')[5]); await sleep(10);   /* a6 */
    w.Store.put('adrills-progress',{a3:p.a3,a4:p.a4}); w.DrillsTab.next(); await sleep(20);
    assert(w.DrillsTab.state.cur.id==='a3','with no misses, a drill that is due again comes before a new one');
    w.DrillsTab.next(); await sleep(20);
    assert(['a1','a2','a5','a6'].includes(w.DrillsTab.state.cur.id),'… then one never tried');
  }

  section('t101: Help says what each page is for; the Rated / Training switch says what it does; a kinder empty Progress (roadmap #291)');
  {
    const {w}=await makePage(); const d=w.document;
    w.location.hash='#help?pages'; await sleep(150);
    const hp=d.getElementById('h-pages');
    assert(hp&&hp.open&&['Blind tactics','Calculation','Blunder check','Guess the move','Rated','Training'].every(x=>hp.textContent.includes(x)),'Help opens “What is each page for?”, with Blind tactics, Calculation, Blunder check and Guess the move');
    for(const [id,sel] of [['calc','#cc-lobby'],['guess','#g-lobby'],['blundercheck','#bc-about'],['blind','#bl-about']])
      assert(d.querySelector(sel+' a[href="#help?pages"],'+sel+'[id] a[href="#help?pages"]'),'a “What is each page for?” link on '+id);
    w.location.hash='#openings'; await sleep(100);
    const note=()=>d.getElementById('o-modenote').textContent;
    d.getElementById('o-rated').click(); assert(/^Rated: each line moves your opening rating/.test(note()),'under the switch, Rated says what it does');
    d.getElementById('o-training').click(); assert(/^Training: .*doesn’t move/.test(note()),'… and Training');
    d.getElementById('o-rated').click();
    w.location.hash='#progress'; await sleep(100);
    const tips=[...d.querySelectorAll('#p-stats .pearn')];
    assert(tips.length===6&&tips.every(t=>t.querySelector('a[href^="#"]')),'with nothing done, each Progress tile says how to fill it, with a link ('+tips.length+')');
    w.Store.put('tactics-progress',{x:{ok:true,t:Date.now()}}); w.ProgressTab.render();
    assert(d.querySelectorAll('#p-stats .pearn').length===5,'… and a tile with something in it drops its tip');
    w.location.hash='#today'; await sleep(150);
    assert(d.querySelector('#td-note a#td-analyze[href="#analyze"].btn'),'Today with no games: an Analyze my games button where the drills go');
  }

  section('t102: Analyze my games says plainly when it is offline, rate-limited or gets no answer, and Stop ends a fetch (roadmap #276)');
  {
    const {w}=await makePage(); const d=w.document, A=w.AnalyzeTab, note=()=>d.getElementById('a-note').textContent;
    w.location.hash='#analyze'; await sleep(50);
    const res=(status,body)=>({ok:status>=200&&status<300,status,json:async()=>body,text:async()=>typeof body==='string'?body:JSON.stringify(body)});
    const hang=(url,o)=>new Promise((_,rej)=>{ o&&o.signal&&o.signal.addEventListener('abort',()=>rej(new w.DOMException('aborted','AbortError'))) });
    /* offline */
    Object.defineProperty(w.navigator,'onLine',{configurable:true,get:()=>false});
    let called=0; w.fetch=async()=>{ called++; return res(200,'') };
    await A.run('lichess','someone');
    assert(/^You are offline\./.test(note())&&!called,'offline: it says so, without trying (was the browser’s own “Load failed”)');
    Object.defineProperty(w.navigator,'onLine',{configurable:true,get:()=>true});
    /* a network error */
    w.fetch=async()=>{ throw new TypeError('Load failed') };
    await A.run('lichess','someone');
    assert(/^Could not reach Lichess\./.test(note()),'a failed request names the site and what to check');
    /* Lichess 429 */
    w.fetch=async()=>res(429,'');
    await A.run('lichess','someone');
    assert(/Lichess is limiting requests/.test(note()),'Lichess 429: it is limiting requests, wait a minute');
    /* Chess.com 429 on the archive list, and on every month */
    w.fetch=async()=>res(429,{});
    await A.run('chesscom','someone');
    assert(/Chess\.com is limiting requests/.test(note())&&!/No recent/.test(note()),'Chess.com 429: the same, not “No recent rapid or classical games found”');
    const months=['m1','m2','m3'].map(m=>'https://api.chess.com/pub/player/someone/games/'+m);
    w.fetch=async u=>/archives$/.test(u)?res(200,{archives:months}):res(429,{});
    await A.run('chesscom','someone');
    assert(/Chess\.com is limiting requests/.test(note()),'… also when the list came but every month was refused');
    /* one month refused, the others fine: the report says how many are missing */
    const pgn='[Event "x"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 Nb8 10. d4 Nbd7 1-0';
    const game=i=>({rules:'chess',time_class:'rapid',url:'https://www.chess.com/game/live/'+i,end_time:1764000000+i,pgn,white:{username:'someone',rating:1500,result:'win'},black:{username:'other',rating:1500,result:'checkmated'}});
    w.fetch=async u=>/archives$/.test(u)?res(200,{archives:months}):/m2$/.test(u)?res(429,{}):res(200,{games:[game(/m1$/.test(u)?1:3)]});
    const g=await A.fetchChesscom('someone',false);
    assert(g.length===2&&g.failed&&g.failed.n===1&&g.failed.of===3&&g.failed.why==='busy','Chess.com: a refused month is counted ('+JSON.stringify(g.failed)+')');
    /* no answer: a time limit */
    A.LIMIT.lichess=60; w.fetch=hang;
    await A.run('lichess','someone');
    assert(/^Lichess didn’t answer within/.test(note()),'a stalled request ends with a time limit and says so');
    A.LIMIT.lichess=30000;
    /* Stop during the fetch */
    w.fetch=hang; const p=A.run('lichess','someone'); await sleep(20);
    const stop=d.getElementById('a-stop');
    assert(!stop.hidden,'Stop shows while the games are being fetched');
    stop.click(); await p;
    assert(/^Stopped before the games arrived/.test(note())&&stop.hidden&&!A.running,'Stop ends the fetch at once');
  }

  section('t103: a full storage is never silent: it says so, frees the caches, and Guess the move caps big imports (roadmap #269)');
  {
    const {w}=await makePage(); const d=w.document, L=w.localStorage, S=w.Store;
    /* fill this browser's storage (jsdom's, like a browser's, holds about 5 million characters) with analysis caches */
    const fill=key=>{ const v=x=>JSON.stringify({x:'x'.repeat(x)}); let lo=0, hi=6e6;   /* the largest value that still fits */
      while(hi-lo>50){ const mid=Math.floor((lo+hi)/2); try{ L.setItem('clo:'+key,v(mid)); lo=mid }catch(e){ hi=mid } }
      L.setItem('clo:'+key,v(lo)) };
    fill('pgn-evals');
    let threw=false; try{ L.setItem('clo:probe','y'.repeat(5000)) }catch(e){ threw=true } L.removeItem('clo:probe');
    assert(threw,'the test browser’s storage is full');
    const big={}; for(let i=0;i<200;i++) big['p'+i]={ok:true,t:Date.now()};
    const ok=S.put('tactics-progress',big);
    const b=d.getElementById('store-full');
    assert(ok&&S.get('tactics-progress').p199&&L.getItem('clo:pgn-evals')==null,'a result that doesn’t fit: the caches go, and it is saved');
    assert(b&&!b.hidden&&b.dataset.kind==='freed'&&/caches were cleared/.test(b.textContent),'… and a banner says the caches were cleared to make room');
    d.getElementById('store-full-x').click(); assert(b.hidden,'the banner closes');
    /* full with progress itself: nothing to free */
    fill('gtm-own');
    const before=JSON.stringify(S.get('tactics-progress'));
    const more=Object.assign({},big); for(let i=0;i<400;i++) more['q'+i]={ok:false,t:Date.now()};
    const ok2=S.put('tactics-progress',more);
    assert(ok2===false&&JSON.stringify(S.get('tactics-progress'))===before,'when nothing can be freed, put says false (it used to look saved)');
    assert(!b.hidden&&b.dataset.kind==='full'&&/your last result wasn’t saved/.test(b.textContent)&&b.querySelector('a[href="#progress"]'),'… and the banner says the result wasn’t saved and where to make room');
    /* a setting that can't be written says so too */
    b.hidden=true; w.Settings.set('sound',true);
    assert(!b.hidden&&/that setting wasn’t saved/.test(b.textContent),'a setting that can’t be saved says so');
    L.removeItem('clo:gtm-own'); b.hidden=true;
    /* Progress: how much is kept, and Clear analysis caches */
    S.put('bc-evals',{a:'z'.repeat(50000)});
    w.location.hash='#progress'; await sleep(100);
    const st=d.getElementById('p-storagetext').textContent, btn=d.getElementById('p-clearcache');
    assert(/million characters on this device/.test(st)&&/analysis caches/.test(st)&&!btn.hidden,'Progress says how much is kept and how much is caches: '+st);
    btn.click();
    assert(L.getItem('clo:bc-evals')==null&&S.get('tactics-progress')&&/Cleared the analysis caches/.test(d.getElementById('p-note').textContent)&&btn.hidden,'Clear analysis caches frees them and keeps progress');
  }
  {
    /* Guess the move: one paste adds at most 100 games */
    const {w}=await makePage(); const d=w.document;
    w.location.hash='#guess'; await sleep(100);
    const one=i=>`[White "A${i}"]\n[Black "B"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 5. d4 exd4 6. cxd4 Bb4+ 7. Nc3 Nxe4 ${i%2?'8. O-O':'8. Qe2'} 1-0\n`;
    d.getElementById('g-addbox').value=Array.from({length:130},(_,i)=>one(i)).join('\n');
    await w.GtmTab.addGames();
    const own=w.Store.get('gtm-own')||[];
    assert(own.length===100&&/Added the first 100 games: one paste adds up to 100/.test(d.getElementById('g-adderr').textContent),'one paste adds at most 100 games, and says so ('+own.length+')');
  }
};
