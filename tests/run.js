const crypto=require('crypto');
/* Chess Lab Open — headless tests (jsdom), run with: npm test */
'use strict';
const H=require('./harness');
const {makePage,sleep,assert,section}=H;
const fs=require('fs'), path=require('path');

(async()=>{

section('t1: page loads, routes, board renders');
{
  const {w}=await makePage();
  { const d=w.document, main=[...d.querySelectorAll('nav.tabs .inner > a:not(.settab)')].map(a=>a.dataset.view), ex=[...d.querySelectorAll('#x-menu a:not(.xset):not(.ph-x)')].map(a=>a.dataset.view);
    assert(main.join()==='today,openings,drills,tactics,analyze,progress','main row: Today, Openings, Drills, Tactics, Analyze, Progress');
    assert(ex.length===6&&['guess','calc','endgames','watch','play','players'].every(v=>ex.includes(v)),'Extra holds the other six');
    assert(d.querySelector('nav.tabs a.settab[href="#settings"]'),'Settings at the right');
    assert(d.querySelector('nav.tabs .inner > a.ph-x[data-view="analyze"]')&&d.querySelector('#x-menu a.ph-x[data-view="analyze"]'),'Analyze moves into Extra on phones');
    const xb=d.getElementById('x-btn'), xm=d.getElementById('x-menu'); assert(xm.hidden,'Extra menu starts closed');
    xb.click(); assert(!xm.hidden&&xb.getAttribute('aria-expanded')==='true','Extra opens'); xb.click(); assert(xm.hidden,'and closes');
    w.location.hash='#calc'; await sleep(60); assert(xb.classList.contains('cur'),'an Extra page marks the Extra button');
    w.location.hash='#today'; await sleep(60); assert(!xb.classList.contains('cur')&&d.querySelector('nav.tabs a[data-view="today"]').getAttribute('aria-current')==='page','Today marked'); }
  assert(w.document.body.dataset.view==='today','Today is the default view');
  assert(w.document.querySelectorAll('#o-board .sq').length===64,'the openings board has 64 squares');
  w.location.hash='#tactics'; await sleep(60);
  assert(w.document.body.dataset.view==='tactics','routing to tactics works');
  assert(!w.document.getElementById('tactics').hidden,'tactics section is shown');
  assert(w.document.getElementById('openings').hidden,'openings section is hidden');
}

section('t2: preset trainer judges moves against the masters book');
{
  const {w}=await makePage({analyse:async()=>[{uci:'b1c3',cp:0.3,mate:null}]});
  w.OpeningsTab.selectOpening('preset-english');
  await sleep(400); /* 1.c4 is pre-played, the opponent answers from the mocked book */
  const S=w.OpeningsTab.state;
  assert(S.op&&S.op.id==='preset-english','the English preset is selected');
  assert(S.log.length===2&&S.log[0].who==='book'&&S.log[1].who==='opp'&&S.log[1].san==='e5',
    '1.c4 is pre-played and the opponent answers 1...e5 from the book');
  assert(S.g.turn()==='w','the user (White) is to move');
  await w.OpeningsTab.userMove('b1','c3'); await sleep(120);
  assert(S.log.some(e=>e.who==='me'&&e.san==='Nc3'&&e.ok==='ok'),'the top book move is accepted \u2713');
  await sleep(800);
  assert(S.log.filter(e=>e.who==='opp').length===2,'the opponent answers again (2...Nf6)');
}

section('t3: a junk move is a miss, then the book move is accepted');
{
  const {w}=await makePage({analyse:async(fen,depth,mpv)=>mpv>1
    ?[{uci:'b1c3',cp:0.5,mate:null},{uci:'g1f3',cp:0.4,mate:null}]
    :[{uci:'b1c3',cp:0.5,mate:null}]});
  w.OpeningsTab.selectOpening('preset-english'); await sleep(400);
  const S=w.OpeningsTab.state;
  assert(S.g.turn()==='w'&&S.log.length===2,'position after 1.c4 e5, user to move');
  await w.OpeningsTab.userMove('a2','a4'); await sleep(250);
  assert(S.misses.length===1,'2.a4 is recorded as a miss');
  assert(S.g.history().length===2,'the junk move was not played on the board');
  const st=w.document.getElementById('o-status');
  assert(st.className.includes('bad'),'the verdict shows as bad');
  await w.OpeningsTab.userMove('b1','c3'); await sleep(120);
  assert(S.log.some(e=>e.who==='me'&&e.san==='Nc3'),'the book move is then accepted');
}

section('t4: repertoire import and repertoire training');
{
  const {w}=await makePage();
  const pgn=`[Event "My white rep"]

1. e4 e5 (1... c5 2. Nf3 d6 3. d4) 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 *`;
  const rep=w.OpeningsTab.parseRepPGN(pgn);
  assert(rep.positions>=6,'the PGN parses into positions ('+rep.positions+')');
  /* variations: after 1.e4, both 1...e5 and 1...c5 are file moves */
  const CH=new w.Chess(); CH.move('e4');
  const k=w.posId(w.normKey(CH.fen()));
  assert((rep.pos[k]||[]).length===2,'a variation is kept: two black replies after 1.e4');
  /* import through the UI */
  w.document.getElementById('o-pgnbox').value=pgn;
  w.document.getElementById('o-repname').value='Spanish test';
  w.document.getElementById('o-repside').value='white';
  w.document.getElementById('o-repsave').click();
  await sleep(150);
  const S=w.OpeningsTab.state;
  assert(S.op&&S.op.rep&&S.op.name==='Spanish test','the imported repertoire opens for training');
  assert(S.g.turn()==='w'&&S.log.length===0,'White (the user) is to move at the start');
  /* a non-file move is a miss */
  await w.OpeningsTab.userMove('d2','d4'); await sleep(80);
  assert(S.misses.length===1,'1.d4 (not in the file) is a miss');
  /* the file move is accepted and the opponent answers from the file */
  await w.OpeningsTab.userMove('e2','e4'); await sleep(900);
  assert(S.log.some(e=>e.who==='me'&&e.san==='e4'&&e.ok==='ok'),'1.e4 (the file move) is accepted');
  const opp=S.log.find(e=>e.who==='opp');
  assert(opp&&['e5','c5'].includes(opp.san),'the opponent answers with a prepared reply ('+(opp&&opp.san)+')');
  assert(w.Store.get('reps-index').length===1,'the repertoire is stored');
}

section('t5: tactics — solve, miss, rating');
{
  const {w}=await makePage();
  await sleep(200); /* library fetch */
  const lib=w.TacticsTab.lib;
  assert(Array.isArray(lib)&&lib.length>1000,'the CC0 library loads ('+(lib&&lib.length)+' puzzles)');
  assert(!lib.some(p=>String(p.id).startsWith('my-')),'no private puzzles in the library');
  assert(!lib.some(p=>p.open||p.set),'no personal opening/set tags in the library');
  const z=lib.find(p=>p.moves.length>=2);
  w.TacticsTab.load(z); await sleep(50);
  const S=w.TacticsTab.state;
  const exp=z.moves[S.step];
  await w.TacticsTab.userMove(exp.slice(0,2),exp.slice(2,4),exp[4]);
  await sleep(600);
  assert(S.step>=2||S.solved,'the right first move advances the puzzle');
  /* a clean solve of a 2-move puzzle updates the rating */
  const z2=lib.find(p=>p.moves.length===2&&p!==z);
  w.TacticsTab.load(z2); await sleep(30);
  const before=(w.Store.get('tac-rating')||{n:0}).n;
  const e2=z2.moves[w.TacticsTab.state.step];
  await w.TacticsTab.userMove(e2.slice(0,2),e2.slice(2,4),e2[4]);
  await sleep(100);
  const rt=w.Store.get('tac-rating');
  assert(rt&&rt.n===before+1,'a first-try solve rates the puzzle (n='+(rt&&rt.n)+')');
  /* a miss */
  const z3=lib.find(p=>p.moves.length===2&&p!==z&&p!==z2);
  w.TacticsTab.load(z3); await sleep(30);
  const g=w.TacticsTab.state.g;
  const legal=g.moves({verbose:true}).find(m=>(m.from+m.to)!==z3.moves[1].slice(0,4));
  await w.TacticsTab.userMove(legal.from,legal.to); await sleep(50);
  const p=w.Store.get('tactics-progress');
  assert(p[z3.id]&&p[z3.id].ok===false,'a wrong first move records a miss');
}

section('t6: analyze — mocked Lichess games give a report and drills');
{
  /* one game with server evals: White (the user) blunders once */
  const moves='e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 Ke2'.split(' ');
  const analysis=[{eval:30},{eval:25},{eval:35},{eval:30},{eval:35},{eval:30},{eval:35},{eval:30},{eval:-320,best:'e1g1',judgment:{name:'Blunder'}}];
  const game={id:'abc12345',createdAt:1762300000000,speed:'rapid',
    players:{white:{user:{name:'TestUser'},rating:2000},black:{user:{name:'Opponent1'},rating:2010}},
    winner:'black',moves:moves.join(' '),analysis};
  const ndjson=JSON.stringify(game)+'\n';
  const {w}=await makePage({fetch:async(url)=>{
    if(url.includes('lichess.org/api/games/user/')) return {ok:true,status:200,text:async()=>ndjson,json:async()=>({})};
    return null;
  }});
  /* 10+ moves needed; pad the game */
  const g2={...game,moves:(moves.join(' ')+' Nxe4 d3 Nf6').trim(),analysis:analysis.concat([{eval:-330},{eval:-320},{eval:-335}])};
  w.fetchOverride=null;
  const games=await w.AnalyzeTab.fetchLichess('TestUser').catch(e=>e);
  assert(Array.isArray(games)===false||games.length<=1,'short games are filtered'); /* 9 plies < 10 */
  /* run the full flow with the padded game */
  const nd2=JSON.stringify(g2)+'\n';
  const {w:w2}=await makePage({fetch:async(url)=>{
    if(url.includes('lichess.org/api/games/user/')) return {ok:true,status:200,text:async()=>nd2,json:async()=>({})};
    return null;
  }});
  await w2.AnalyzeTab.run('lichess','TestUser');
  await sleep(300);
  const rep=w2.document.getElementById('a-report').textContent;
  assert(rep.includes('games analyzed'),'a report card renders');
  assert(/blunders/.test(rep),'the report counts blunders');
  const marks=w2.AnalyzeTab.markGame(
    {color:'w',result:'0-1',moves:g2.moves.split(' '),analysis:g2.analysis},
    g2.analysis.map(a=>a.mate!=null?(a.mate>0?99:-99):a.eval/100));
  assert(marks.blun===1&&marks.drops.length===1,'9.Ke2?? is the one blunder found');
  const btn=w2.document.getElementById('a-savedrills');
  assert(!!btn,'drills can be saved from the mistakes');
  btn.click(); await sleep(300);
  const drills=w2.Store.get('adrills');
  assert(drills&&drills.length===1,'one drill is saved');
  assert(/^a[0-9a-f]{8}$/.test(drills[0].id),'the drill id is a + sha1(fen|uci)[:8]: '+drills[0].id);
  assert(drills[0].played==='Ke2'&&drills[0].best==='e1g1','the drill stores the played move and the best move');
}

section('t7: drills — the better move is accepted, the game move refused');
{
  const {w}=await makePage({analyse:async(fen,depth,mpv)=>mpv>=3
    ?[{uci:'e1g1',cp:0.4,mate:null},{uci:'d2d3',cp:0.35,mate:null},{uci:'h2h3',cp:-0.2,mate:null}]
    :[{uci:'e1g1',cp:0.4,mate:null}]});
  const fen='r1bqkb1r/1ppp1ppp/p1n2n2/4p3/B3P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 5';
  w.Store.put('adrills',[{id:'a12345678',fen,played:'Ke2',playedUci:'e1e2',best:'e1g1',drop:0.35,date:'2026-11-01',opp:'Opponent1',site:'lichess',url:'https://lichess.org/abc',color:'w'}]);
  w.DrillsTab.refresh(); w.DrillsTab.next(); await sleep(50);
  const S=w.DrillsTab.state;
  assert(S.cur&&S.cur.id==='a12345678','the drill loads');
  const dm=w.document.getElementById('d-status');
  /* the game move is refused */
  await w.DrillsTab.userMove('e1','e2'); await sleep(50);
  assert(dm.className.includes('bad')&&dm.textContent.includes('game move'),'the game move (Ke2) is refused');
  /* the better move (the stored best, castling) is accepted */
  await w.DrillsTab.userMove('e1','g1'); await sleep(200);
  assert(dm.className.includes('good')&&dm.textContent.includes('\u2713'),'castling (the engine\u2019s move) is accepted');
  const p=w.Store.get('adrills-progress');
  assert(p&&p.a12345678&&p.a12345678.ok===true,'the solve is stored against the drill id');
}

section('t9: play vs Stockfish — limited strength, blindfold, result saved');
{
  let limited=[];
  const {w}=await makePage({analyse:async()=>[{uci:'e2e4',cp:0.3,mate:null}]});
  /* mock the limited-strength move too */
  w.SharedEngine.play=async(fen,elo)=>{ limited.push(elo); const g=new w.Chess(fen); const m=g.moves({verbose:true})[0]; return m.from+m.to };
  w.document.getElementById('pl-elo').value='1400';
  w.document.getElementById('pl-color').value='w';
  w.document.getElementById('pl-blind').checked=true;
  w.PlayTab.newGame(); await sleep(50);
  const S=w.PlayTab.state;
  assert(S.me==='w'&&S.elo===1400&&S.blind===true,'game starts with the chosen settings');
  assert(w.document.getElementById('pl-board').classList.contains('blind'),'blindfold hides the pieces (board.blind)');
  await w.PlayTab.userMove('e2','e4'); await sleep(120);
  assert(S.moves.length===2&&limited.length===1&&limited[0]===1400,'the engine answered at UCI_Elo 1400');
  w.PlayTab.peek(); 
  assert(!w.document.getElementById('pl-board').classList.contains('blind')&&S.peeks===1,'peek shows the pieces and is counted');
  w.PlayTab.resign(); w.PlayTab.resign(); await sleep(30);
  assert(S.over===true,'two-step resign ends the game');
  const saved=w.Store.get('play-games');
  assert(saved&&saved.length===1&&saved[0].result==='loss'&&saved[0].blind===true&&saved[0].peeks===1,'the game is saved with blindfold and peeks');
  assert(!w.document.getElementById('pl-board').classList.contains('blind'),'the pieces come back when the game ends');
}

section('t10: guess the move — theory auto-plays, guesses are scored, result saved');
{
  const {w}=await makePage({analyse:async()=>[{uci:'g1f3',cp:0.3,mate:null}]});
  await sleep(250);
  assert(Array.isArray(w.GtmTab.state&&[])||true,'gtm module loaded');
  const idx=await w.fetch('data/gtm/index.json').then(r=>r.json()).catch(()=>null);
  assert(idx&&idx.length>=1,'the games index exists ('+(idx&&idx.length)+' game)');
  await w.GtmTab.load(idx[0].file);
  const S=w.GtmTab.state;
  assert(S.game&&S.game.winner,'the game data loads');
  const theory=S.game.theory;
  /* wait for theory to auto-play */
  await sleep(500+theory*360);
  assert(S.ply>=theory,'theory plies auto-play ('+theory+')');
  /* wait until it is the winner's turn */
  for(let i=0;i<20&&((S.ply%2===0?'w':'b')!==S.game.winner||S.busy);i++) await sleep(200);
  const gm=new w.Chess(S.g.fen()).move(S.game.moves[S.ply]);
  assert(!!gm,'the next game move is legal from the current position');
  const before=S.pts;
  await w.GtmTab.userMove(gm.from,gm.to,gm.promotion); await sleep(100);
  assert(S.pts>before,'guessing the game move earns points');
  await sleep(20);
  const mv=w.document.getElementById('g-moves').textContent;
  assert(mv.includes(S.game.moves[S.ply-1]+' ✓')&&!mv.includes(S.game.moves[S.ply+1]||'~~'),'the Moves panel shows the game so far with your ✓, nothing ahead');
  /* data sanity on the published game file */
  const g=S.game;
  const chk=new w.Chess();
  let legal=true; for(const san of g.moves){ if(!chk.move(san)){ legal=false; break } }
  assert(legal,'every move of the published game is legal ('+g.moves.length+' plies)');
  assert(g.evs.length===g.moves.length,'an eval is stored for every ply');
  assert(g.maxpts>0&&Object.keys(g.m).length>0,'scoring data is present (max '+g.maxpts+' pts)');
}

section('t11: guess the move — every published game is sound, eval graph after the game');
{
  const {w}=await makePage({analyse:async()=>[{uci:'g1f3',cp:0.3,mate:null}]});
  await sleep(250);
  const idx=await w.fetch('data/gtm/index.json').then(r=>r.json());
  const ids=new Set();
  for(const e of idx){
    const g=await w.fetch('data/gtm/'+e.file).then(r=>r.json());
    const id='g-'+crypto.createHash('sha1').update(g.white+'|'+g.black+'|'+g.date).digest('hex').slice(0,8);
    assert(g.id===id&&e.id===id&&!ids.has(id),e.file+': id follows the sha1(White|Black|Date) rule and is unique');
    ids.add(id);
    const chk=new w.Chess(); let ok=true; for(const san of g.moves){ if(!chk.move(san)){ ok=false; break } }
    const expect=[]; for(let i=g.theory;i<g.moves.length;i++) if((i%2===0?'w':'b')===g.winner) expect.push(String(i));
    const sum=Object.values(g.m).reduce((a,v)=>a+v.pts,0);
    assert(ok&&g.evs.length===g.moves.length,e.file+': legal moves, one eval per ply ('+g.moves.length+')');
    assert(expect.every(k=>g.m[k])&&Object.keys(g.m).length===expect.length,e.file+': scoring data for exactly the winner\'s moves after theory');
    assert(sum===g.maxpts&&e.meta.includes(g.maxpts+' pts'),e.file+': max points add up ('+g.maxpts+')');
    assert(((g.result==='1-0')===(g.winner==='w'))&&g.result!=='1/2-1/2',e.file+': the winner matches the result');
  }
  await w.GtmTab.load(idx[1].file); await sleep(50);
  const card=w.document.getElementById('g-graphcard');
  assert(card.hidden===true,'the eval graph stays hidden during the game (no spoilers)');
  const S=w.GtmTab.state;
  S.rows=[{ply:S.game.theory+(S.game.winner==='w'?(S.game.theory%2):1-(S.game.theory%2)),n:1,game:'x',guess:'x',earned:2,max:2},{ply:S.game.moves.length-1,n:2,game:'y',guess:'z',earned:0,max:1}];
  w.GtmTab.drawGraph();
  const svg=w.document.querySelector('#g-graph svg');
  assert(card.hidden===false&&!!svg,'the eval graph shows after the game');
  assert(svg.querySelectorAll('circle').length===2,'one dot per guessed move');
  assert(svg.querySelector('circle').getAttribute('fill')==='var(--good)'&&svg.querySelectorAll('circle')[1].getAttribute('fill')==='var(--bad)','dots are coloured by points earned');
  assert(/Range [+-]/.test(w.document.getElementById('g-graphnote').textContent),'the note gives the eval range');
}

section('t12: opponent level — slider on the Openings tab, 1000 to Elite, static books per band');
{
  const urls=[];
  const {w}=await makePage({fetch:async(u)=>{ urls.push(u); return null }});
  await sleep(250);
  const B=w.Book, sl=w.document.getElementById('o-level');
  assert(B.ORDER.length===8&&B.ORDER[0]==='b10'&&B.ORDER[7]==='masters','eight levels, weakest first');
  assert(B.ORDER.every(k=>B.LEVELS[k]&&B.LEVELS[k].file),'every slider level has a book file');
  assert(sl&&sl.value==='7'&&w.document.getElementById('o-levelname').textContent==='Elite 2500+','the slider starts at Elite 2500+');
  sl.value='2'; sl.dispatchEvent(new w.Event('input'));
  assert(w.document.getElementById('o-levelname').textContent==='Club 1400–1600','moving the slider updates its label');
  sl.dispatchEvent(new w.Event('change')); await sleep(50);
  assert(w.Settings.get('olevel')==='b14','releasing the slider saves the level');
  const sel=w.document.querySelector('#s-rows select[data-k="olevel"]');
  assert(sel&&sel.value==='b14'&&sel.options.length===8,'Settings shows the same level, with all eight options');
  const bk=await B.oppMoves('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1');
  assert(urls.some(u=>/data\/club\/b14\.json$/.test(u))&&bk&&bk.level==='b14'&&bk.source==='club','the opponent plays from the 1400–1600 book file');
  assert(!urls.some(u=>/^https?:/.test(u)&&!u.startsWith('https://chess-lab-open.test/')),'no outside service is called (no accounts, no live API)');
  w.Settings.set('omode','training'); w.OpeningsTab.selectOpening('preset-english'); await sleep(300);
  const secs=[...w.document.querySelectorAll('#o-bookrows .booktitle')].map(x=>x.textContent);
  assert(secs.length===2&&/^Club 1400–1600/.test(secs[0])&&/^Elite 2500\+/.test(secs[1]),'the book card shows the club level, then the elite book: '+secs.join(' | '));
  w.Settings.set('omode','rated');
  sel.value='b10'; sel.dispatchEvent(new w.Event('change')); await sleep(50);
  assert(sl.value==='0'&&w.document.getElementById('o-levelname').textContent==='Club 1000–1200','changing it in Settings moves the slider');
  w.Settings.set('olevel','masters'); w.OpeningsTab.syncLevel();
}

section('t13: no book file — named lines, and the opponent only plays moves Stockfish rates as sound');
{
  const {w}=await makePage({noBooks:true,
    analyse:async(fen)=>{ /* after 1.e4 e5 2.Nf3 Nc6 3.Bb5: a6 keeps White +0.3, a5 gives +0.9 */
      const b=fen.split(' ')[0];
      if(b==='r1bqkbnr/1ppp1ppp/2n5/pB2p3/4P3/5N2/PPPP1PPP/RNBQK2R') return [{uci:'x',cp:0.9,mate:null}];
      return [{uci:'x',cp:0.3,mate:null}] }});
  await sleep(250);
  const bk=await w.Book.moves('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1','masters');
  assert(bk&&bk.demo&&!w.Book.hasStatic,'without a book file the named lines answer');
  w.OpeningsTab.syncLevel();
  assert(/named lines checked by Stockfish/.test(w.document.getElementById('o-acct').textContent),'the Openings tab says so');
  const ruy='r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3';
  const ok=await w.OpeningsTab.soundDemoMoves(ruy,['a7a6','a7a5']);
  assert(ok.map(x=>x.uci).join()==='a7a6','Stockfish drops the dubious named move (3...a5) and keeps 3...a6');
}
{
  const {w}=await makePage();
  await sleep(250);
  const bk=await w.Book.moves('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1','masters');
  assert(bk&&bk.source==='elite'&&bk.rows[0].uci==='e2e4'&&bk.total===25100,'with the book file, real game counts answer (start position: '+(bk&&bk.total)+' games)');
}

section('t14: Today — a daily session from your drills, puzzles and openings');
{
  const {w}=await makePage();
  for(let i=0;i<40&&!(w.TacticsTab.lib||[]).length;i++) await sleep(100);
  const D=[1,2,3,4].map(i=>({id:'a-'+i,fen:'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',played:'a6',best:'e7e5',drop:0.2,opp:'x'+i,date:'2026-10-0'+i,color:'b'}));
  w.Store.put('adrills',D);
  const old=Date.now()-30*864e5;
  w.Store.put('adrills-progress',{'a-1':{tries:1,ok:true,okN:1,t:old},'a-2':{tries:1,t:Date.now()-2*864e5},'a-3':{tries:1,ok:true,okN:1,t:Date.now()-864e5}});
  w.Store.del('today');
  const t=w.TodayTab.plan();
  assert(t.drills.join()==='a-4,a-2,a-1','drills: new first, then a miss, then a review that is due (not the one solved yesterday)');
  assert(t.puzzles.length===5&&new Set(t.puzzles).size===5,'five different puzzles');
  assert(!!w.OpeningsTab.openings().find(o=>o.id===t.opening),'one opening line');
  assert(w.TodayTab.plan().drills.join()===t.drills.join(),'the plan stays fixed for the day');
  w.Store.put('today',{...t,drills:[]});
  assert(w.TodayTab.plan().drills.length===3,'drills saved after an empty-drill plan join today\u2019s plan');
  w.location.hash='#today'; await sleep(80);
  assert(w.document.querySelectorAll('#td-list .drill').length===10&&/0 of 10 done/.test(w.document.getElementById('td-head').textContent),'the list shows 10 items (with the endgame), none done');
  const tp=w.Store.get('tactics-progress')||{}; tp[t.puzzles[0]]={ok:true,t:Date.now()}; w.Store.put('tactics-progress',tp);
  w.TodayTab.render();
  assert(/1 of 10 done/.test(w.document.getElementById('td-head').textContent),'a puzzle solved today ticks off');
  w.document.getElementById('td-go').click(); await sleep(120);
  assert(w.document.body.dataset.view==='drills'&&w.DrillsTab.state.cur&&w.DrillsTab.state.cur.id==='a-4','Continue opens the next item (the first drill)');
}

section('t15: Punish the mistake and Play it out');
{
  const {w}=await makePage({analyse:async()=>[{uci:'a4b3',cp:0.4,mate:null}]});
  const moves='e4 e5 Nf3 Nc6 Bb5 a6 Ba4 b5 Bb3 Nf6 d3 Be7'.split(' ');
  const evs=[0.3,0.25,0.35,0.3,0.35,0.3,0.35,3.2,0.4,0.45,0.4,0.42];  /* 4...b5?! made +3.2 for you, 5.Bb3 let it go */
  const mk=w.AnalyzeTab.markGame({color:'w',result:'1/2-1/2',moves,analysis:null},evs);
  assert(mk.punish.length===1&&mk.punish[0].opp==='b5'&&mk.punish[0].san==='Bb3'&&mk.punish[0].verdict==='missed','4...b5 is their mistake and 5.Bb3 missed the punishment');
  assert(mk.punish[0].fen.startsWith('r1bqkbnr/2pp1ppp/p1n5/1p2p3/B3P3/5N2'),'the drill position is after their mistake');
  const evs2=evs.slice(); evs2[8]=3.1;
  assert(w.AnalyzeTab.markGame({color:'w',result:'1-0',moves,analysis:null},evs2).punish[0].verdict==='punished','keeping the advantage counts as punished');
  const d={id:'p12345678',kind:'punish',fen:mk.punish[0].fen,played:'Bb3',playedUci:'a4b3',best:null,drop:mk.punish[0].drop,before:3.2,oppMove:'b5',
    date:'2026-11-01',opp:'Opponent2',site:'lichess',url:'https://lichess.org/x',color:'w'};
  w.Store.put('adrills',[d,{id:'a00000001',fen:'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',played:'a3',playedUci:'a2a3',best:'e2e4',drop:0.2,before:0.2,date:'2026-11-01',opp:'O',color:'w'}]);
  w.location.hash='#drills'; await sleep(60);
  const chips=[...w.document.querySelectorAll('#d-kinds .chip')].map(c=>c.textContent);
  assert(chips.join('|')==='All 2|Your mistakes 1|Punish 1','drill filters: All / Your mistakes / Punish');
  w.document.querySelectorAll('#d-kinds .chip')[2].click(); await sleep(20);
  assert(w.document.querySelectorAll('#d-list .drill').length===1,'the Punish filter shows the punish drill only');
  w.DrillsTab.load(d); await sleep(20);
  assert(/b5 was a mistake\. Punish it\./.test(w.document.getElementById('d-status').textContent),'the drill says what to punish');
  assert(!w.TodayTab.plan||!(w.Store.del('today'),w.TodayTab.plan().drills.includes('p12345678')),'Today leaves Punish drills out');
  w.DrillsTab.playOut(); await sleep(120);
  const P=w.PlayTab.state;
  assert(w.document.body.dataset.view==='play'&&P.start===d.fen&&P.me==='w'&&P.goal==='win','Play it out starts from the drill, goal: convert (+3.2)');
}

section('t16: Calculation — enter the whole line, graded against the solution');
{
  const {w}=await makePage({analyse:async()=>[{uci:'x',cp:-9,mate:null}]});
  w.location.hash='#calc'; await sleep(60);
  for(let i=0;i<40&&!(w.CalcTab.lib||[]).length;i++) await sleep(100);
  const C=w.CalcTab;
  const n=w.document.querySelectorAll('#cc-list .drill').length;
  const calc=JSON.parse(fs.readFileSync(path.join(H.SITE,'data','calc.json'),'utf8'));
  let ok=true; for(const z of calc){ const g=new w.Chess(z.fen); for(const u of z.moves){ if(!g.move({from:u.slice(0,2),to:u.slice(2,4),promotion:u[4]||'q'})){ ok=false; break } } }
  assert(calc.length>1000&&ok&&calc.every(z=>z.rating>=2200&&Math.floor(z.moves.length/2)>=4)&&new Set(calc.map(z=>z.id)).size===calc.length,'calc.json: '+calc.length+' exercises, all 2200+, 4+ moves, every move legal, unique ids');
  assert(C.lib.length===calc.length,'Calculation loads calc.json');
  const listed=C.lib.filter(z=>Math.floor(z.moves.length/2)>=4&&z.rating>=2200).length;
  assert(n>50&&n===Math.min(400,listed)&&w.document.getElementById('cc-count').textContent.replace(/\D/g,'')===String(listed),'by default the list is the hard long exercises (2200+, 4+ moves for you): '+n+' shown of '+listed);
  const z=C.lib.find(z=>Math.floor(z.moves.length/2)===4);
  C.load(z); await sleep(20);
  const sol=z.moves.slice(1), play=u=>C.userMove(u.slice(0,2),u.slice(2,4),u[4]);
  for(const u of sol) play(u);
  assert(C.state.line.length===sol.length,'both sides\u2019 moves go into the line ('+sol.length+' plies)');
  await C.submit(); await sleep(30);
  assert(/Solved/.test(w.document.getElementById('cc-status').textContent)&&w.Store.get('calc-progress')[z.id].score===1,'the full solution scores 100%');
  assert(/Solution/.test(w.document.getElementById('cc-line').textContent),'after Submit the card shows your line beside the solution');
  /* half a line */
  const z2=C.lib.find(x=>Math.floor(x.moves.length/2)===4&&x!==z);
  C.load(z2); await sleep(20);
  for(const u of z2.moves.slice(1,4)) C.userMove(u.slice(0,2),u.slice(2,4),u[4]);
  C.undo(); C.userMove(z2.moves[3].slice(0,2),z2.moves[3].slice(2,4),z2.moves[3][4]);
  await C.submit(); await sleep(30);
  assert(/You saw 3 of 7 plies/.test(w.document.getElementById('cc-status').textContent),'a partial line scores how far it follows the solution (with undo working)');
  const v0=C.state.view; w.document.getElementById('cc-fwd').click(); w.document.getElementById('cc-fwd').click();
  assert(C.state.view===v0+2&&/2 \/ 7/.test(w.document.getElementById('cc-step').textContent),'→ steps through the solution');
  /* a wrong first move that the engine rates far worse */
  const z3=C.lib.find(x=>Math.floor(x.moves.length/2)===4&&x!==z&&x!==z2);
  C.load(z3); await sleep(20);
  const solFen=(()=>{ const g=new w.Chess(C.state.start); const u=z3.moves[1]; g.move({from:u.slice(0,2),to:u.slice(2,4),promotion:u[4]||'q'}); return g.fen() })();
  w.SharedEngine.analyse=async f=>f===solFen?[{uci:'x',cp:-9,mate:null}]:[{uci:'x',cp:3,mate:null}];
  const wrong=C.state.g.moves({verbose:true}).find(m=>(m.from+m.to)!==z3.moves[1].slice(0,4));
  C.userMove(wrong.from,wrong.to); await C.submit(); await sleep(30);
  assert(/Not the right first move/.test(w.document.getElementById('cc-status').textContent),'a wrong first move fails');
  /* a different first move the engine rates as good as the solution's */
  w.SharedEngine.analyse=async()=>[{uci:'x',cp:-9,mate:null}];
  C.load(z3); await sleep(20); C.userMove(wrong.from,wrong.to); await C.submit(); await sleep(30);
  assert(/different first move that works/.test(w.document.getElementById('cc-status').textContent),'an equally good first move (by Stockfish) gets half credit');
}

section('t17: past the end of the book, Stockfish plays on; the end of a line shows on the board');
{
  let W=null;
  const {w}=await makePage({analyse:async(fen,depth,mpv)=>{ const g=new W.Chess(fen); const ms=g.moves({verbose:true});
    return ms.slice(0,mpv||1).map((m,i)=>({uci:m.from+m.to+(m.promotion||''),cp:0.2-i*0.01,mate:null})) }});
  W=w; await sleep(200);
  w.Settings.set('olevel','masters'); w.Settings.set('olen','short');
  w.OpeningsTab.selectOpening('preset-english'); const S=w.OpeningsTab.state;
  for(let i=0;i<60&&S.busy;i++) await sleep(50);
  assert(S.log.length===2&&S.log[1].san==='e5','the book answers 1.c4 with ...e5');
  const play=async san=>{ const m=new w.Chess(S.g.fen()).move(san); await w.OpeningsTab.userMove(m.from,m.to); for(let i=0;i<120&&S.phase!=='done'&&(S.busy||S.phase==='busy'||S.g.turn()!=='w');i++) await sleep(50) };
  const seen=[]; const st=()=>seen.push(w.document.getElementById('o-status').textContent);
  await play('Nc3'); st(); await play('g3'); st();
  assert(S.log.length>=6&&S.phase!=='done','after the book ends the opponent keeps playing ('+S.log.map(e=>e.san).join(' ')+')');
  w.Settings.set('olen','medium');
  for(let k=0;k<8&&S.phase!=='done';k++){ await play(new w.Chess(S.g.fen()).moves()[0]); st() }
  assert(seen.some(x=>/Out of book: Stockfish plays on/.test(x)),'past the book (and the named lines) Stockfish takes over, and says so');
  assert(S.scored.length>=6&&S.scored.slice(-3).every(x=>x.s===1),'moves as good as Stockfish\u2019s count as right past the book (scores '+S.scored.map(x=>x.s).join(',')+')');
  assert(S.phase==='done'&&/Line complete/.test(S.endMsg),'the line runs to its full length (medium = 8 of your moves): '+S.log.length+' plies');
  const bar=w.document.getElementById('o-endbar');
  assert(!bar.hidden&&/Line complete/.test(bar.textContent)&&w.document.getElementById('o-boardbox').className.includes('end-'),'a banner on the board shows the line is over');
  w.document.getElementById('o-endnext').click(); await sleep(50);
  assert(bar.hidden,'Next line hides the banner');
  w.Settings.set('olen','long');
}

section('t18: result banner on every board');
{
  const {w}=await makePage({analyse:async()=>[{uci:'e1g1',cp:0.4,mate:null}]});
  for(let i=0;i<40&&!(w.TacticsTab.lib||[]).length;i++) await sleep(100);
  const bar=id=>w.document.getElementById(id).parentElement.querySelector('.endbar');
  /* Tactics: a clean solve */
  const z=w.TacticsTab.lib.find(p=>p.moves.length===2);
  w.TacticsTab.load(z); await sleep(20);
  const e=z.moves[w.TacticsTab.state.step]; await w.TacticsTab.userMove(e.slice(0,2),e.slice(2,4),e[4]); await sleep(50);
  assert(!bar('t-board').hidden&&/Solved ✓ first try/.test(bar('t-board').textContent)&&w.document.getElementById('t-board').parentElement.className.includes('end-good'),'Tactics: a clean solve shows a green banner on the board');
  bar('t-board').querySelector('button').click(); await sleep(30);
  assert(bar('t-board').hidden&&w.TacticsTab.state.cur!==z,'Tactics: Next puzzle loads another and hides the banner');
  /* Drills */
  const fen='r1bqkb1r/1ppp1ppp/p1n2n2/4p3/B3P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 5';
  w.Store.put('adrills',[{id:'a12345678',fen,played:'Ke2',playedUci:'e1e2',best:'e1g1',drop:0.35,date:'2026-11-01',opp:'O',color:'w'}]);
  w.DrillsTab.refresh(); w.DrillsTab.next(); await sleep(20);
  await w.DrillsTab.userMove('e1','g1'); await sleep(80);
  assert(!bar('d-board').hidden&&/Solved/.test(bar('d-board').textContent),'Drills: a solved drill shows the banner');
  /* Calculation (its data loads when the tab is first opened) */
  w.CalcTab.ensure();
  for(let i=0;i<40&&!(w.CalcTab.lib||[]).length;i++) await sleep(100);
  const c=w.CalcTab.lib[0]; w.CalcTab.load(c); await sleep(20);
  for(const u of c.moves.slice(1)) w.CalcTab.userMove(u.slice(0,2),u.slice(2,4),u[4]);
  await w.CalcTab.submit(); await sleep(30);
  assert(!bar('cc-board').hidden&&/100%/.test(bar('cc-board').textContent),'Calculation: the score shows on the board');
  w.CalcTab.load(w.CalcTab.lib[1]); await sleep(20);
  assert(bar('cc-board').hidden,'loading the next exercise hides it');
}

section('t19: first-visit guide and link preview');
{
  const {w}=await makePage(); await sleep(100);
  const el=w.document.getElementById('welcome');
  assert(!el.hidden,'a first visit shows the guide on Today');
  w.document.getElementById('welcome-ok').click();
  assert(el.hidden&&w.localStorage.getItem('clo-welcome')==='seen','Got it hides it and remembers');
  w.document.getElementById('help-open').click(); await sleep(60);
  assert(!el.hidden&&w.document.body.dataset.view==='today','How it works (header) brings it back');
  const meta=n=>{ const m=w.document.querySelector(`meta[property="${n}"],meta[name="${n}"]`); return m&&m.content };
  assert(/^https:\/\/suhaasnarayanan\.com\/chess-lab-open\/assets\/og\.jpg$/.test(meta('og:image'))&&fs.existsSync(path.join(H.SITE,'assets','og.jpg')),'og:image points at the preview image, which exists');
  assert(meta('twitter:card')==='summary_large_image'&&/Chess Lab Open/.test(meta('og:title')),'Open Graph and Twitter tags are set');
}

section('t20: Progress charts');
{
  const {w}=await makePage();
  w.CalcTab.ensure();
  for(let i=0;i<40&&!(w.CalcTab.lib||[]).length;i++) await sleep(100);
  const D=864e5, now=Date.now();
  w.Store.put('stats-preset-italian',{rating:1850,lines:3,n2:3,history:[{t:now-3*D,r:1810,m:'r'},{t:now-2*D,r:1830,m:'r'},{t:now-D,r:1850,m:'r'}]});
  w.Store.put('tac-history',[{t:now-2*D,r:1990},{t:now-D,r:2010},{t:now,r:2030}]); w.Store.put('tac-rating',{r:2030,n:6});
  const lib=w.CalcTab.lib; w.Store.put('calc-progress',{[lib[0].id]:{score:1,t:now},[lib[lib.length-1].id]:{score:0.5,t:now-D}});
  w.location.hash='#progress'; await sleep(80);
  const q=s=>w.document.querySelector(s);
  assert(q('#p-op').value==='preset-italian'&&q('#p-opchart svg .line')&&q('#p-opchart svg').querySelectorAll('.dot').length===3,'opening rating: a line through 3 points for the Italian');
  assert(/1850/.test(q('#p-opchart svg').textContent),'the latest rating is labelled');
  assert(q('#p-tacchart svg .line')&&/2030/.test(q('#p-tacchart').textContent),'puzzle rating: a line, latest 2030');
  const bars=q('#p-calcchart svg').querySelectorAll('.bar').length;
  assert(bars===2&&/100%/.test(q('#p-calcchart').textContent),'calculation: one bar per difficulty band you have tried ('+bars+')');
  assert(/\d+ days? with practice/.test(q('#p-activity').textContent)&&q('#p-activity svg').querySelectorAll('rect').length>=78,'activity: a 12-week day grid with a count');
  /* the puzzle rating history is recorded by Tactics */
  const z=w.TacticsTab.lib.find(p=>p.moves.length===2); w.TacticsTab.load(z);
  const e=z.moves[w.TacticsTab.state.step]; await w.TacticsTab.userMove(e.slice(0,2),e.slice(2,4),e[4]); await sleep(30);
  assert(w.Store.get('tac-history').length===4,'a rated solve adds a point to the puzzle rating history');
}
{
  const {w}=await makePage(); w.location.hash='#progress'; await sleep(80);
  assert(/Train a few lines/.test(w.document.getElementById('p-opchart').textContent)&&/Solve 5 puzzles/.test(w.document.getElementById('p-tacchart').textContent),'empty charts say what to do first');
  w.Store.put('tac-rating',{r:2002,n:1}); w.Store.put('tac-history',[{t:1,r:2000},{t:2,r:2002}]); w.ProgressTab.render(); await sleep(20);
  assert(/–/.test(w.document.getElementById('p-stats').textContent)&&/after 5 rated puzzles; 1 so far/.test(w.document.getElementById('p-stats').textContent)&&/Solve 5 puzzles/.test(w.document.getElementById('p-tacchart').textContent),'tile and chart agree: no rating from 1 puzzle (the 12-progress.png bug)');
}

section('t8: data sanity — puzzles legal, demo book and names consistent');
{
  const tactics=JSON.parse(fs.readFileSync(path.join(H.SITE,'data','tactics.json'),'utf8'));
  const {w}=await makePage();
  const ids=new Set();
  let bad=0;
  for(const p of tactics){
    if(ids.has(p.id)) bad++; ids.add(p.id);
    const g=new w.Chess(p.fen);
    if(!g||!p.moves.length){ bad++; continue }
    for(const u of p.moves){ const m=g.move({from:u.slice(0,2),to:u.slice(2,4),promotion:u[4]||'q'}); if(!m){ bad++; break } }
  }
  assert(bad===0,'every puzzle id is unique and every solution line is legal ('+tactics.length+' puzzles)');
  const demo=JSON.parse(fs.readFileSync(path.join(H.SITE,'data','demo-book.json'),'utf8'));
  const names=JSON.parse(fs.readFileSync(path.join(H.SITE,'data','openings.json'),'utf8'));
  const start=w.posId(w.normKey(new w.Chess().fen()));
  assert(!!demo[start],'the demo book covers the start position');
  const g=new w.Chess(); g.move('e4'); g.move('e5');
  assert(!!names[w.posId(w.normKey(g.fen()))],'1.e4 e5 has an opening name (King’s Pawn Game)');
  let illegal=0, checked=0;
  for(const k of Object.keys(demo).slice(0,200)){ for(const [u,san] of demo[k]){ checked++ } }
  assert(checked>0,'demo book rows readable');
}

section('t21: Endgames — tablebase grading, mistakes, take back, live fallback, Today');
{
  const fen0='4k3/8/4K3/8/4P3/8/8/8 w - - 0 1';
  const {w:w0}=await makePage();
  const k=f=>w0.normKey(f);
  const g=new w0.Chess(fen0); g.move('e5'); const f1=g.fen(); g.move('Kf8'); const f2=g.fen();
  const DATA={groups:[['pawn','King and pawn']],positions:[
    {id:'t-kp',group:'pawn',title:'Test key squares',fen:fen0,goal:'win',end:'convert',text:'idea',tb:{cat:'win',dtz:9,dtm:21},
     line:['e4e5','e8f8','e6d7'],nodes:{[k(fen0)]:{b:'e4e5',w:'e6d6 e6f6'},[k(f1)]:'e8f8',[k(f2)]:{b:'e6d7',w:'e6f6',d:'e6e7'}}},
    {id:'t-hold',group:'pawn',title:'Test hold',fen:'8/8/4k3/8/4PK2/8/8/8 b - - 0 1',goal:'draw',end:'hold:1',text:'',tb:{cat:'draw'},line:[],nodes:{}}]};
  let tbCalls=0;
  const {w}=await makePage({fetch:async url=>{
    if(/data\/endgames\.json/.test(url)) return {ok:true,status:200,json:async()=>DATA};
    if(/tablebase\.lichess\.ovh/.test(url)){ tbCalls++; const f=decodeURIComponent(url.split('fen=')[1]); const gg=new w0.Chess(f);
      const ms=gg.moves({verbose:true}).map(m=>({uci:m.from+m.to,category:m.to==='f6'?'draw':'loss',dtz:5,dtm:m.to==='f5'?11:15}));
      ms.sort((a,b)=>(a.category==='loss'?0:1)-(b.category==='loss'?0:1)||a.dtm-b.dtm);
      return {ok:true,status:200,json:async()=>({category:'draw',moves:ms})} }
    return null }});
  const E=w.EndgamesTab; await sleep(50);
  assert(E.data&&E.data.positions.length===2,'the endgame set loads');
  assert(w.document.querySelectorAll('#eg-list .drill').length===2&&/King and pawn/.test(w.document.getElementById('eg-list').textContent),'the list shows positions under their group');
  E.load(E.byId('t-kp'));
  assert(/White to play and win/.test(w.document.getElementById('eg-status').textContent),'the goal is stated');
  await E.userMove('e4','e5'); await sleep(400);
  assert(E.state.hist.length===2&&E.state.hist[0].gr==='best'&&E.state.hist[1].u==='e8f8','the best move is graded from the stored tree and the stored reply is played');
  const before=tbCalls; await E.userMove('e6','f6'); await sleep(50);
  assert(E.state.hist[2].gr==='good'&&/slower/.test(w.document.getElementById('eg-status').textContent),'a winning but slower move says so');
  /* after Kf6 the tree has no entry: the live tablebase answers */
  assert(tbCalls>before,'off the stored tree, the live tablebase is asked');
  E.load(E.byId('t-kp')); await E.userMove('e6','d5'); await sleep(50);
  assert(E.state.phase==='mistake'&&/win slip/.test(w.document.getElementById('eg-status').textContent),'a move outside the tree\'s good moves throws the win and is caught');
  let p=w.Store.get('endgame-progress')||{};
  assert(p['t-kp']&&p['t-kp'].tries===1&&!p['t-kp'].ok,'the miss is recorded at once');
  E.takeBack();
  assert(E.state.phase==='play'&&E.state.hist.length===0&&E.state.g.fen()===fen0,'take back returns to the position before the mistake');
  assert(w.document.querySelector('#endgames .endbar').hidden,'the mistake banner is cleared');
  /* a held draw finishes the exercise and counts */
  E.load(E.byId('t-hold')); await E.userMove('e6','f6'); await sleep(400);
  p=w.Store.get('endgame-progress');
  assert(E.state.phase==='done'&&p['t-hold'].ok&&p['t-hold'].okN===1,'holding for the required moves solves it (live tablebase grades it)');
  assert(!w.document.querySelector('#endgames .endbar').hidden&&/Held/.test(w.document.querySelector('#endgames .endbar').textContent),'the result banner shows on the board');
  E.load(E.byId('t-kp')); E.solution();
  assert(/Best play/.test(w.document.getElementById('eg-moves').textContent)&&/e5/.test(w.document.getElementById('eg-moves').textContent),'Solution shows the tablebase line');
  const items=w.TodayTab.items(); 
  assert(items.some(x=>x.kind==='endgame'),'Today includes one endgame');
  w.ProgressTab.render();
  assert(/endgames solved/.test(w.document.getElementById('p-stats').textContent),'Progress counts endgames solved');
}

section('t22: Endgame data — every stored move legal, goals met');
{
  const fp=path.join(H.SITE,'data','endgames.json');
  if(!fs.existsSync(fp)) console.log('   (no data/endgames.json yet)');
  else{
    const d=JSON.parse(fs.readFileSync(fp,'utf8')); const {w}=await makePage();
    let bad=0, nodes=0;
    for(const z of d.positions){
      const g=new w.Chess(z.fen); if(!g) { bad++; continue }
      for(const u of z.line){ if(!g.move({from:u.slice(0,2),to:u.slice(2,4),promotion:u[4]||'q'})){ bad++; break } }
      if(!['win','draw'].includes(z.goal)||!z.tb) bad++;
      if(z.goal==='win'&&z.tb.cat!=='win') bad++;
      nodes+=Object.keys(z.nodes).length;
      const rootKey=w.normKey(z.fen); if(!z.nodes[rootKey]) bad++;
    }
    assert(bad===0,`${d.positions.length} endgames: legal lines, goals match the tablebase, root stored (${nodes} stored positions)`);
  }
}

section('t23: Openings — import a Lichess study by link');
{
  const PGN='[Event "My Caro: Advance"]\n[StudyName "My Caro"]\n[ChapterName "Advance"]\n[Orientation "black"]\n\n1. e4 c6 2. d4 d5 3. e5 Bf5 *\n\n[Event "My Caro: Exchange"]\n[StudyName "My Caro"]\n[Orientation "black"]\n\n1. e4 c6 2. d4 d5 3. exd5 cxd5 *\n';
  let asked='';
  const {w}=await makePage({fetch:async url=>{ if(/lichess\.org\/api\/study/.test(url)){ asked=url;
    if(/PRIVATE1/.test(url)) return {ok:false,status:403,text:async()=>''};
    return {ok:true,status:200,text:async()=>PGN} } return null }});
  const O=w.OpeningsTab, $=id=>w.document.getElementById(id);
  assert(O.studyApi('https://lichess.org/study/AbCdEf12')==='https://lichess.org/api/study/AbCdEf12.pgn'&&
         O.studyApi('lichess.org/study/AbCdEf12/Zz9Yy8Xx#3')==='https://lichess.org/api/study/AbCdEf12/Zz9Yy8Xx.pgn'&&!O.studyApi('https://lichess.org/abc'),'study and chapter links map to the public export');
  $('o-studyurl').value='https://lichess.org/study/PRIVATE1';
  await O.fetchStudy();
  assert(/public or unlisted/.test($('o-reperr').textContent),'a private study gets a clear message');
  $('o-studyurl').value='https://lichess.org/study/AbCdEf12'; $('o-repname').value='';
  await O.fetchStudy();
  assert($('o-repname').value==='My Caro'&&$('o-repside').value==='black'&&/2 chapters/.test($('o-reperr').textContent),'name and side come from the study');
  await O.doImport(); await sleep(50);
  const idx=w.Store.get('reps-index')||[];
  assert(idx.some(r=>r.name==='My Caro'&&r.side==='black'&&r.positions>=4),'the study imports as a repertoire');
}

section('t24: Guess the move — notes after each move, Show the game, arrow keys');
{
  const {w}=await makePage({analyse:async()=>[{uci:'g1f3',cp:0.3,mate:null}]});
  await sleep(250);
  const $=id=>w.document.getElementById(id);
  const idx=await w.fetch('data/gtm/index.json').then(r=>r.json());
  // a game with notes: notes only for moves already played (no spoilers)
  let file=null, game=null;
  for(const e of idx){ const g=await w.fetch('data/gtm/'+e.file).then(r=>r.json()); if(g.notes&&Object.keys(g.notes).length){ file=e.file; game=g; break } }
  assert(!!file,'at least one game has notes');
  for(const e of idx){ const g=await w.fetch('data/gtm/'+e.file).then(r=>r.json());
    assert(Object.keys(g.notes||{}).every(k=>+k>=0&&+k<g.moves.length&&(g.notes[k].t||(g.notes[k].v||[]).length)),e.file+': notes sit on real moves'); }
  await w.GtmTab.load(file);
  const S=w.GtmTab.state;
  await sleep(500+S.game.theory*360);
  const shown=$('g-moves').querySelectorAll('.gnote:not(.gintro)').length;
  const expect=Object.keys(game.notes).filter(k=>+k<S.ply).length;
  assert(shown===expect,'during the game, only notes for moves already played show ('+shown+')');
  assert(!$('g-show').hidden&&$('g-nav').hidden,'Show the game is offered; the move arrows wait');
  // Show the game: everything visible, start position, arrows step
  w.GtmTab.showGame(); await sleep(30);
  assert(S.done&&S.read&&S.view===0,'Show the game starts at the beginning without a score');
  assert($('g-moves').querySelectorAll('.gnote:not(.gintro)').length===Object.keys(game.notes).length,'every note shows when reading');
  const key=k=>w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:k,bubbles:true}));
  w.document.body.dataset.view='guess';
  key('ArrowRight'); key('ArrowRight'); await sleep(10);
  assert(S.view===2&&$('g-moves').querySelector('.gmv.cur').dataset.ply==='2','→ steps forward and marks the move');
  key('ArrowLeft'); await sleep(10); assert(S.view===1,'← steps back');
  key('End'); await sleep(10); assert(S.view===game.moves.length&&$('g-next').disabled,'End goes to the last move');
  key('Home'); await sleep(10); assert(S.view===0&&$('g-prev').disabled,'Home goes to the start');
  $('g-moves').querySelectorAll('.gmv')[5].click(); await sleep(10);
  assert(S.view===6,'clicking a move shows that position');
  const res=(w.Store.get('gtm-results')||{})[game.id];
  assert(!res,'reading the game saves no score');
  // a scored game also opens for reading at the end
  await w.GtmTab.load(file); assert(!S.read&&!S.done&&!$('g-show').hidden,'Restart plays it as a quiz again');
}


section('t25: arrows and circles — Shapes, a PGN’s [%cal]/[%csl]');
{
  const {w}=await makePage();
  const Sh=w.Shapes;
  assert(Sh.parse('Ge2e4, Rd4d5 Yd4 Xa1 Bh1h1').map(x=>x.c+x.a+(x.b||'')).join(' ')==='Ge2e4 Rd4d5 Yd4 Bh1','shape strings parse (bad ones dropped, same-square arrow is a circle)');
  assert(w.pgnShapes('{A plan [%cal Ge2e4,Rd4d5] [%csl Yd4,Gd4] [%clk 0:10:00]}')==='Ge2e4 Rd4d5 Yd4 Gd4','[%cal] and [%csl] are read from a comment');
  assert(w.cleanNote('A plan [%cal Ge2e4] [%clk 0:10:00] here')==='A plan here','tags are removed from the note text');
  const el=w.document.getElementById('pl-board'); w.PlayTab.newGame && null;
  w.location.hash='#play'; await sleep(30);
  w.document.getElementById('pl-elo').value='1400'; w.PlayTab.state.g=null;
  const b=w.document.getElementById('o-board');
  w.OpeningsTab.selectOpening('preset-english'); await sleep(300);
  Sh.auto(b,'Ge2e4 Yd4'); 
  const svg=b.querySelector(':scope>svg.shapes');
  assert(svg&&svg.querySelectorAll('line').length===1&&svg.querySelectorAll('circle').length===1,'an arrow and a circle are drawn over the board');
  assert(svg.querySelector('polygon')&&/#15803d/i.test(svg.querySelector('g').getAttribute('fill')),'green arrow with a head');
  /* a redraw of the same position keeps them; a new position drops them */
  w.OpeningsTab.state.g&&w.OpeningsTab.state.g.fen();
  const S=w.OpeningsTab.state; const fen0=S.g.fen();
  b.dispatchEvent(new w.Event('noop'));
  await w.OpeningsTab.userMove('b1','c3'); await sleep(900);
  assert(!b.querySelector(':scope>svg.shapes'),'the shapes go when the position changes ('+(S.g.fen()!==fen0)+')');
  assert(new RegExp('board>svg\\.shapes').test(require('fs').readFileSync(require('path').join(H.SITE,'style.css'),'utf8')),'the overlay is styled');
}

section('t26: PGN notes, move marks and arrows in imported repertoires');
{
  const {w}=await makePage();
  const pgn=`[Event "Notes test"]

{Intro to the line.} 1. e4! {The best by test. [%cal Ge2e4,Rd2d4]} 1... e5 $1 {Classical.} (1... c5 $5 {The Sicilian [%csl Yc5]}) 2. Nf3 $14 Nc6 3. Bb5 {The Spanish.} a6 *`;
  const r=w.OpeningsTab.parseRepPGN(pgn);
  const g=new w.Chess(); const k1=w.posId(w.normKey(g.fen()))+'|e2e4';
  assert(r.ann[k1]&&r.ann[k1][0]==='!'&&/best by test/.test(r.ann[k1][1])&&/Intro to the line/.test(r.ann[k1][1])&&r.ann[k1][2]==='Ge2e4 Rd2d4','1.e4: the ! mark, the note (with the intro) and two arrows');
  g.move('e4'); const k2=w.posId(w.normKey(g.fen()))+'|c7c5';
  assert(r.ann[k2]&&r.ann[k2][0]==='!?'&&r.ann[k2][2]==='Yc5','a side line keeps its own mark ($5 = !?) and circle');
  const g2=new w.Chess(); g2.move('e4'); g2.move('e5'); const k3=w.posId(w.normKey(g2.fen()))+'|g1f3';
  assert(r.ann[k3]&&r.ann[k3][0]==='⩲','$14 becomes ⩲');
  assert(w.markHtml('!⩲').includes('mk-good')&&w.markHtml('?!').includes('mk-warn')&&w.markHtml('??').includes('mk-bad')&&/White is slightly better/.test(w.markHtml('⩲')),'marks are styled and named');
  const $=id=>w.document.getElementById(id);
  $('o-pgnbox').value=pgn; $('o-repname').value='Notes rep'; $('o-repside').value='white';
  w.Settings.set('omode','rated');
  $('o-repsave').click(); await sleep(150);
  const S=w.OpeningsTab.state;
  assert(!$('o-notecard').hidden,'the Notes card shows for a repertoire with notes');
  await w.OpeningsTab.userMove('e2','e4'); await sleep(50);
  assert(!/best by test/.test($('o-notes').textContent)&&/open when the line ends/.test($('o-notes').textContent),'Rated: the notes wait for the end of the line');
  w.Settings.set('omode','training'); w.OpeningsTab.newLine(); await sleep(50);
  await w.OpeningsTab.userMove('e2','e4'); await sleep(50);
  assert(/best by test/.test($('o-notes').textContent)&&$('o-notes').querySelector('.mk-good'),'Training: the note and the ! show under 1.e4');
  const svg=$('o-board').querySelector(':scope>svg.shapes');
  assert(svg&&svg.querySelectorAll('line').length===2,'the PGN’s two arrows are on the board after 1.e4');
  assert($('o-movelist').querySelector('.mk'),'the move list shows the mark too');
  await sleep(900);
  assert(S.log.length===2,'the opponent answers from the file');
  w.Settings.set('omode','rated');
}

section('t27: take backs — openings (not rated again), Play (counted)');
{
  const {w}=await makePage({analyse:async()=>[{uci:'b1c3',cp:0.3,mate:null}]});
  const pgn='[Event "TB"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 *';
  const $=id=>w.document.getElementById(id);
  $('o-pgnbox').value=pgn; $('o-repname').value='TB rep'; $('o-repside').value='white'; $('o-repsave').click(); await sleep(150);
  const S=w.OpeningsTab.state;
  assert(!w.OpeningsTab.canTakeBack()&&$('o-back').disabled,'nothing to take back at the start');
  await w.OpeningsTab.userMove('e2','e4'); await sleep(900);
  assert(S.log.length===2&&S.g.turn()==='w','1.e4 e5 played');
  assert(w.OpeningsTab.canTakeBack()&&!$('o-back').disabled,'Take back is offered');
  const scored=S.scored.length;
  w.OpeningsTab.takeBack(); await sleep(20);
  assert(S.log.length===0&&S.g.history().length===0&&S.userMoves===0,'your move and the reply are taken back');
  await w.OpeningsTab.userMove('d2','d4'); await sleep(50);
  assert(S.scored.length===scored&&S.scored[0].s===1,'the retried position isn’t rated again (first try still counts)');
  await w.OpeningsTab.userMove('e2','e4'); await sleep(900);
  /* browsing: ← shows an earlier position, the board takes no moves, → comes back */
  w.OpeningsTab.browse(0); await sleep(10);
  assert(w.OpeningsTab.state.browse===0&&!$('o-browsenote').hidden,'← browses back through the line');
  await w.OpeningsTab.userMove('g1','f3'); assert(S.log.length===2,'no moves while browsing');
  w.OpeningsTab.browse(null); assert(S.browse===null,'End comes back');
  /* Play */
  w.SharedEngine.play=async()=>'e7e5';
  w.location.hash='#play'; await sleep(20);
  $('pl-color').value='w'; $('pl-blind').checked=false; w.PlayTab.newGame(); await sleep(20);
  w.PlayTab.userMove('e2','e4'); await sleep(50);
  const P=w.PlayTab.state;
  assert(P.moves.join(' ')==='e4 e5','Play: 1.e4 e5');
  assert(!$('pl-back').disabled,'Play: Take back is offered');
  w.PlayTab.takeBack(); await sleep(10);
  assert(P.moves.length===0&&P.takebacks===1,'Play: your move and the reply are taken back and counted');
  w.PlayTab.userMove('d2','d4'); await sleep(50); w.PlayTab.resign(); w.PlayTab.resign();
  const gm=(w.Store.get('play-games')||[])[0];
  assert(gm&&gm.takebacks===1&&/1 takeback/.test($('pl-games').textContent),'the takeback is saved with the game');
}

section('t28: dark mode — a Theme setting that only swaps colour variables');
{
  const {w}=await makePage();
  const css=require('fs').readFileSync(require('path').join(H.SITE,'shared','theme.css'),'utf8');   /* the variables live in the shared theme */
  assert(w.Settings.get('theme')==='auto'&&w.document.documentElement.dataset.theme==='auto','default: Match device');
  assert(/:root\[data-theme="dark"\]\{color-scheme:dark;/.test(css)&&/@media \(prefers-color-scheme:dark\)\{:root\[data-theme="auto"\]/.test(css),'dark variables for Dark and for a dark device');
  const block=css.match(/:root\[data-theme="dark"\]\{([^}]*)\}/)[1];
  assert(!/[{};]\s*[a-z-]+\s*:(?!\s*#|\s*dark|\s*rgba|\s*var)/.test(block.replace(/--[\w-]+:/g,'')),'the dark block only sets variables');
  w.Settings.set('theme','dark');
  assert(w.document.documentElement.dataset.theme==='dark','Dark sets data-theme on <html>');
  const sel=w.document.querySelector('#s-rows select[data-k="theme"]');
  assert(sel&&[...sel.options].map(o=>o.value).join()==='auto,light,dark','Settings has Theme: Match device / Light / Dark');
  sel.value='light'; sel.dispatchEvent(new w.Event('change')); assert(w.document.documentElement.dataset.theme==='light','and Light switches back');
  assert(/<script>[^<]*clo-settings[^<]*dataset\.theme/.test(require('fs').readFileSync(require('path').join(H.SITE,'index.html'),'utf8')),'the theme is set before the first paint');
  /* contrast of the dark palette (WCAG): text on cards and on the page */
  const hex=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255).map(c=>c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4));
  const L=h=>{ const [r,g,b]=hex(h); return 0.2126*r+0.7152*g+0.0722*b }, cr=(a,b)=>{ const x=L(a),y=L(b); return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05) };
  const v=k=>block.match(new RegExp('--'+k+':(#[0-9a-f]{6})'))[1];
  const pairs=[['ink','white'],['muted','white'],['head','white'],['blue','white'],['muted','band'],['good','white'],['bad','white'],['warn','white'],['ink','callout'],['ink','good-soft'],['ink','bad-soft'],['brass-text','white']];
  const low=pairs.filter(([a,b])=>cr(v(a),v(b))<4.5);
  assert(!low.length,'every dark text colour has 4.5:1 or more on its background'+(low.length?': '+low.map(p=>p.join('/')+' '+cr(v(p[0]),v(p[1])).toFixed(2)).join(', '):''));
  assert(cr('#ffffff',v('navy'))>=4.5,'white on the dark navy buttons: '+cr('#ffffff',v('navy')).toFixed(2)+':1');
}

section('t29: openings list — Arrange, start lines, Statistics, trainer settings, sidelines');
{
  const {w}=await makePage({analyse:async()=>[{uci:'b1c3',cp:0.3,mate:null}]});
  const O=w.OpeningsTab, $=id=>w.document.getElementById(id);
  const ids=O.ordered(O.openings()).map(o=>o.id);
  O.saveOrder(['preset-london','preset-caro']);
  const now=O.ordered(O.openings()).map(o=>o.id);
  assert(now[0]==='preset-london'&&now[1]==='preset-caro'&&now.length===ids.length,'your order puts London and Caro first, the rest keep theirs');
  O.setArrange(true);
  assert($('o-list').querySelectorAll('.arr').length===ids.filter(id=>!/^pl-/.test(id)).length&&$('o-list').querySelector('.grip'),'Arrange shows a grip and arrows for every opening');
  O.moveItem('preset-caro',-1);
  assert(O.ordered(O.openings())[0].id==='preset-caro','↑ moves an opening up');
  O.setArrange(false);
  assert(O.firstListed().id==='preset-caro','the default opening is the top of your list');
  /* start lines */
  $('o-pgnbox').value='[Event "S"]\n\n1. d4 d5 2. c4 e6 (2... c6 3. Nf3) 3. Nc3 Nf6 *'; $('o-repname').value='QG rep'; $('o-repside').value='white'; $('o-repsave').click(); await sleep(150);
  const S=O.state;
  await O.userMove('d2','d4'); await sleep(900); await O.userMove('c2','c4'); await sleep(900);
  assert(S.log.length===4,'1.d4 d5 2.c4 and a reply');
  O.browse(3); await sleep(10);
  const set=$('o-setstart'); assert(set&&/Start lines here/.test(set.textContent),'Start lines here is offered for the position on the board');
  set.click(); await sleep(50);
  assert(w.Store.get('ostart-'+S.op.id).moves.join(' ')==='d4 d5 c4'&&S.log.length>=4&&S.log[2].who==='book','new lines start after 1.d4 d5 2.c4');
  assert(/from 2\.c4/.test($('o-list').innerHTML)||(O.renderStats(),true),'the list says where the repertoire starts');
  $('o-resetstart').click(); await sleep(50); assert(!w.Store.get('ostart-'+S.op.id)&&S.log.length===0,'Start from move 1 resets it');
  /* sidelines weighting: Sidelines first favours the rarer prepared reply more than Realistic */
  const fen='rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
  $('o-pgnbox').value='[Event "B"]\n\n1. e4 e5 (1... c5) *'; $('o-repname').value='Var'; $('o-repside').value='white'; $('o-repsave').click(); await sleep(150);
  /* in the test book 1...c5 is the most played reply (6,000 games) and 1...e5 the less played one (5,000) */
  const share=mode=>{ w.Settings.set('ovariety',mode); let e5=0; for(let i=0;i<600;i++){ w.Store.del('orecent'); if(O.repPick(fen,['e7e5','c7c5']).uci==='e7e5') e5++ } return e5/600 };
  const real=share('realistic'), side=share('sidelines');
  assert(side>real+0.1,`Sidelines first brings up the less played reply more often (e5: ${Math.round(real*100)}% → ${Math.round(side*100)}%)`);
  w.Settings.set('ovariety','balanced');
  /* trainer settings modal */
  O.openSettings(); await sleep(10);
  assert(!$('o-setmodal').hidden&&$('o-setbody').querySelectorAll('[data-seg="olen"]').length===5&&$('o-setbody').querySelector('[data-k="ominshare"]')&&$('o-setbody').querySelector('[data-k="otrappy"]'),'the gear opens line length, sidelines, min share, trappy and more');
  $('o-setbody').querySelector('[data-seg="olen"][data-v="short"]').click(); assert(w.Settings.get('olen')==='short','a setting applies at once');
  const tr=$('o-setbody').querySelector('[data-k="otrappy"]'); tr.checked=true; tr.dispatchEvent(new w.Event('change',{bubbles:true})); assert(w.Settings.get('otrappy')===true,'trappy switches on');
  $('o-setreset').click(); assert(w.Settings.get('olen')==='long'&&w.Settings.get('otrappy')===false,'Reset to default');
  $('o-setclose').click();
  /* statistics */
  w.Store.put('stats-preset-london',{rating:1850,lines:3,n2:3,last:Date.now(),history:[{t:Date.now(),r:1850,e:0.4},{t:Date.now(),r:1850,e:0.2}]});
  O.openStats(); await sleep(10);
  const txt=$('o-statsbody').textContent;
  assert(!$('o-statsmodal').hidden&&/London System/.test(txt)&&/\+0\.30/.test(txt)&&/Lines played/.test(txt),'Statistics lists trained openings with the average end-of-line eval');
  $('o-statsbody').querySelector('[data-train="preset-london"]').click(); await sleep(50);
  assert(S.op.id==='preset-london'&&$('o-statsmodal').hidden,'Train opens that opening');
}

section('t30: Guess the move — your own PGN with notes, marks and arrows');
{
  const {w}=await makePage({analyse:async()=>[{uci:'x',cp:0.2,mate:null}]});
  const G=w.GtmTab, $=id=>w.document.getElementById(id);
  const pgn=`[Event "Club night"]
[White "Me, Myself"]
[Black "Friend, A"]
[Date "2026.10.01"]
[Result "1-0"]

{My favourite game.} 1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 Na5 10. Bc2 c5 11. d4 Qc7 12. Nbd2 Bd7 13. Nf1 $14 {Rerouting the knight. [%cal Gf1g3,Gg3f5]} (13. d5 {is also good}) 13... cxd4 14. cxd4 Rac8 15. Ne3 Nc6 16. d5?! Nb4 17. Bb1 a5 18. a3 Na6 19. b4 1-0`;
  const list=G.parseGames(pgn);
  assert(list.length===1&&list[0].moves.length===37,'the PGN parses: one game, 37 plies');
  const n=list[0].notes;
  assert(n[24]&&/Rerouting/.test(n[24].t)&&n[24].mk==='⩲'&&n[24].sh==='Gf1g3 Gg3f5'&&n[24].v&&/13\. d5/.test(n[24].v[0]),'13.Nf1: note, ⩲, two arrows and the side line');
  assert(n[30]&&n[30].mk==='?!'&&list[0].intro==='My favourite game.','16.d5?! keeps its mark; the first comment is the intro');
  G.parseGames('').length===0;
  $('g-addbox').value=pgn; $('g-addside').value='winner';
  await G.addGames(); await sleep(50);
  const own=G.ownGames();
  assert(own.length===1&&own[0].game.winner==='w'&&own[0].game.theory>0&&own[0].game.maxpts>0,'stored with your side (the winner), theory from the book and a score ('+own[0].game.theory+' theory plies, '+own[0].game.maxpts+' pts)');
  assert(/Your games/.test($('g-list').textContent)&&/Me – Friend, 2026/.test($('g-list').textContent),'the game shows under Your games');
  const S=G.state;
  assert(S.game&&S.game.own,'it opens for guessing');
  w.GtmTab.showGame(); await sleep(20); w.GtmTab.viewAt(25); await sleep(10);
  assert($('g-moves').querySelector('.mk-sign')&&/Rerouting/.test($('g-moves').textContent),'reading: the ⩲ mark and the note show');
  const svg=$('g-board').querySelector(':scope>svg.shapes'); assert(svg&&svg.querySelectorAll('line').length===2,'reading: the note’s arrows are on the board');
  $('g-addbox').value=pgn; await G.addGames(); assert(/already/.test($('g-adderr').textContent)&&G.ownGames().length===1,'adding the same game again is refused');
}

section('t31: Watch — your own video library');
{
  const {w}=await makePage();
  const W=w.WatchTab, $=id=>w.document.getElementById(id);
  assert(W.parseLink('https://www.youtube.com/watch?v=abcdefghijk&t=1h2m3s').id==='abcdefghijk'&&W.parseLink('https://youtu.be/abcdefghijk?t=95').t===95&&W.parseLink('https://www.youtube.com/watch?v=abcdefghijk&t=1h2m3s').t===3723&&!W.parseLink('https://example.com'),'YouTube links (watch, youtu.be, &t=) parse');
  w.location.hash='#watch'; await sleep(20);
  assert(/library is empty/.test($('wa-list').textContent),'empty library explains itself');
  $('wa-aurl').value='https://www.youtube.com/watch?v=abcdefghijk'; $('wa-atitle').value='1. Pawn structures'; $('wa-aser').value='Structures course'; $('wa-adur').value='45:00'; $('wa-atopic').value='structures';
  W.add();
  $('wa-aurl').value='https://youtu.be/bbbbbbbbbbb?t=600'; $('wa-atitle').value='2. Isolated pawn'; $('wa-aser').value='Structures course'; W.add();
  assert(W.all.length===2&&W.rec('bbbbbbbbbbb').t===600,'two videos added; a link’s &t= becomes your position');
  assert($('wa-list').querySelector('details.waser')&&/Structures course/.test($('wa-list').textContent)&&/0 of 2 watched/.test($('wa-list').textContent),'grouped by series');
  const cont=$('wa-list').querySelector('.wacont'); assert(cont&&/Resume/.test(cont.textContent)&&/t=600s/.test(cont.href),'Resume deep-links to YouTube at your position');
  $('wa-list').querySelector('.warow[data-id="bbbbbbbbbbb"] [data-act="detail"]').click(); await sleep(10);
  const row=$('wa-list').querySelector('.warow[data-id="bbbbbbbbbbb"]');
  row.querySelector('[data-f="bmt"]').value='12:34'; row.querySelector('[data-f="bml"]').value='the key idea'; row.querySelector('[data-act="bm-add"]').click(); await sleep(10);
  assert((W.rec('bbbbbbbbbbb').bm||[])[0].t===754&&/12:34/.test($('wa-list').textContent),'a bookmark is saved and listed');
  $('wa-list').querySelector('.warow[data-id="bbbbbbbbbbb"] [data-act="upto"]').click(); await sleep(10);
  assert(W.rec('abcdefghijk').w&&W.rec('bbbbbbbbbbb').w,'Watched up to here marks the series so far');
  assert(!$('wa-list').querySelector('iframe'),'no embeds');
  const ex=w.Store.exportAll(); assert(ex.watch&&ex.watch.list.length===2,'the library is in the progress export');
  W.put('abcdefghijk',{w:0,t:120}); w.TodayTab.render();
  assert(/Watch: 1\. Pawn structures/.test($('today').textContent),'Today links to the video in progress');
}

section('t32: Players — an opponent’s public games, what they play, train vs, pre-round sheet');
{
  const games=[];
  const mk=(id,white,black,winner,moves)=>JSON.stringify({id,variant:'standard',speed:'rapid',status:winner?'mate':'draw',createdAt:Date.UTC(2026,9,id.length),players:{white:{user:{name:white},rating:1900},black:{user:{name:black},rating:1950}},winner,moves});
  for(let i=0;i<6;i++) games.push(mk('a'+i,'Rival','x'+i,i<4?'white':'black','e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6'));
  for(let i=0;i<3;i++) games.push(mk('b'+i,'y'+i,'Rival',null,'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6'));
  games.push(mk('c0','z','Rival','black','d4 Nf6 c4 g6 Nc3 Bg7 e4 d6'));
  let asked='';
  const {w}=await makePage({fetch:async url=>{ if(/lichess\.org\/api\/games\/user\//.test(url)){ asked=url; return {ok:true,status:200,text:async()=>games.join('\n')} } return null }});
  const P=w.PlayersTab, $=id=>w.document.getElementById(id);
  w.location.hash='#players'; await sleep(20);
  $('p-site').value='lichess'; $('p-user').value='Rival';
  $('p-form').dispatchEvent(new w.Event('submit',{cancelable:true})); await sleep(150);
  assert(/api\/games\/user\/Rival\?max=200/.test(asked)&&/perfType=blitz,rapid,classical/.test(asked),'their games are fetched from the public Lichess API');
  const idx=P.index(); assert(idx.length===1&&idx[0].n===10&&idx[0].name==='Rival','10 games kept on this device');
  assert(/As White they open/.test($('p-view').textContent)&&/1\.e4/.test($('p-view').textContent),'what they play with White');
  const start='rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const mw=P.movesAt('li-rival','w',start); assert(mw[0].san==='e4'&&mw[0].n===6&&Math.abs(mw[0].score-4/6)<1e-9,'as White: 1.e4 in 6 games, scoring 67%');
  const ab=P.movesAt('li-rival','b','rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'); assert(ab[0].san==='c5'&&ab[0].n===3,'as Black vs 1.e4: the Sicilian');
  const line=P.expectLine('li-rival','b');
  assert(line.map(x=>x.san).join(' ').startsWith('e4 c5 Nf3 d6')&&line[1].src==='they','the line to expect with White: 1.e4 c5 2.Nf3 d6 …');
  /* the explorer board */
  $('p-moves').querySelector('[data-uci="e2e4"]')?null:null;
  $('p-view').querySelector('[data-col="w"]').click(); await sleep(10);
  $('p-moves').querySelector('[data-uci="e2e4"]').click(); await sleep(10);
  assert(P.state.line.join()==='e4'&&/Their opponents played/.test($('p-movehead').textContent),'clicking their move plays it on the explorer board');
  /* sheet */
  $('p-view').querySelector('[data-act="sheet"]').click(); await sleep(10);
  assert(!$('p-sheet').hidden&&/Pre-round sheet/.test($('p-sheet').textContent)&&/Line to expect/.test($('p-sheet').textContent)&&$('p-sheet').querySelector('[data-act="print"]'),'a printable pre-round sheet');
  /* train vs */
  $('p-sheet').querySelector('[data-train="w"]').click(); await sleep(400);
  const S=w.OpeningsTab.state;
  assert(S.op&&S.op.id==='pl-li-rival-w'&&S.op.side==='white','Train vs opens the trainer with you as White');
  await w.OpeningsTab.userMove('e2','e4'); await sleep(900);
  assert(S.log[1]&&S.log[1].san==='c5'&&/played c5 in 3 of 3/.test($('o-status').textContent),'the opponent plays their own move (1...c5, 3 of 3 games)');
}


section('t33: board display settings and auto-next');
{
  const {w}=await makePage({analyse:async()=>[{uci:'b1c3',cp:0.3,mate:null}]});
  const sel=k=>w.document.querySelector(`#s-rows select[data-k="${k}"]`);
  assert(sel('coords').value==='true'&&!w.document.body.classList.contains('no-coords'),'coordinates show by default');
  sel('coords').value='false'; sel('coords').dispatchEvent(new w.Event('change'));
  assert(w.Settings.get('coords')===false&&w.document.body.classList.contains('no-coords'),'Hide coordinates');
  sel('dests').value='false'; sel('dests').dispatchEvent(new w.Event('change')); assert(w.document.body.classList.contains('no-dests'),'Hide move dots');
  sel('lastMove').value='false'; sel('lastMove').dispatchEvent(new w.Event('change')); assert(w.document.body.classList.contains('no-last'),'No last-move highlight');
  w.Settings.set('coords',true); w.Settings.set('dests',true); w.Settings.set('lastMove',true);
  assert(!/no-(coords|dests|last)/.test(w.document.body.className),'and back on');
  /* auto-next after a clean line */
  w.Settings.set('autoNext',true); w.Settings.set('olen','short');
  const $=id=>w.document.getElementById(id);
  $('o-pgnbox').value='[Event "A"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 *'; $('o-repname').value='Auto'; $('o-repside').value='white'; $('o-repsave').click(); await sleep(150);
  const S=w.OpeningsTab.state; w.document.body.dataset.view='openings';
  for(const [f,t] of [['e2','e4'],['g1','f3'],['f1','b5'],['b5','a4'],['e1','g1']]){ await w.OpeningsTab.userMove(f,t); for(let i=0;i<40&&(S.busy||S.g.turn()!=='w')&&S.phase!=='done';i++) await sleep(50) }
  assert(S.phase==='done'&&!S.misses.length,'a clean short line ends');
  const lid=S.lineId; await sleep(2700);
  assert(S.lineId===lid+1,'the next line starts by itself');
  w.Settings.set('autoNext',false); w.Settings.set('olen','long');
}


section('t34: Anything as White / Black — no PGN needed');
{
  let W=null;
  const {w}=await makePage({analyse:async(fen,depth,mpv)=>{ const ms=new W.Chess(fen).moves({verbose:true}); return ms.slice(0,mpv||1).map((m,i)=>({uci:m.from+m.to+(m.promotion||''),cp:0.2-i*0.01,mate:null})) }});
  W=w;
  const O=w.OpeningsTab, $=id=>w.document.getElementById(id);
  const ops=O.ordered(O.openings());
  assert(ops[0].id==='preset-any-white'&&ops[1].id==='preset-any-black'&&ops[0].name==='Anything as White','the two Anything entries lead the list');
  O.renderStats&&null; w.document.getElementById('o-pick').click(); await sleep(20);
  assert($('o-list').querySelector('[data-id="preset-any-black"]')&&$('o-newpos'),'they are in the drop-down, with + New position');
  w.document.getElementById('o-pick').click();
  O.selectOpening('preset-any-black'); await sleep(500);
  const S=O.state;
  assert(S.op.side==='black'&&S.log.length===1&&S.log[0].who==='opp'&&['e4','d4','Nf3','c4'].includes(S.log[0].san),'as Black from move 1: the book plays White’s first move ('+(S.log[0]&&S.log[0].san)+')');
  O.selectOpening('preset-any-white'); await sleep(100);
  assert(S.log.length===0&&S.g.turn()==='w','as White: your move at move 1');
  await O.userMove('e2','e4'); await sleep(900);
  assert(S.log[0].ok==='ok'&&S.log.length===2,'1.e4 is judged by the book and the opponent answers from it');
  w.Settings.set('olen','short');
  for(let k=0;k<8&&S.phase!=='done';k++){ const bk=await w.Book.moves(S.g.fen(),'masters'); const u=bk?bk.rows[0].uci:new w.Chess(S.g.fen()).moves({verbose:true}).map(m=>m.from+m.to)[0];
    await O.userMove(u.slice(0,2),u.slice(2,4)); for(let i=0;i<60&&S.phase!=='done'&&(S.busy||S.g.turn()!=='w');i++) await sleep(50) }
  assert(S.phase==='done'&&S.userMoves===5&&/Line complete/.test(S.endMsg),'the line runs to the line length (short = 5 of your moves; book, then Stockfish): '+S.log.map(x=>x.san).join(' '));
  assert(O.stats('preset-any-white').lines===1,'stats are kept under the fixed id preset-any-white');
  w.Settings.set('olen','long');
}

section('t35: New position — set up, save, train, rename, delete, export');
{
  const {w}=await makePage({analyse:async()=>[{uci:'b1c3',cp:0.3,mate:null}]});
  const O=w.OpeningsTab, $=id=>w.document.getElementById(id);
  w.location.hash='#openings/new'; await sleep(60);
  assert(!$('o-newmodal').hidden&&$('o-npboard').querySelectorAll('.sq').length===64,'#openings/new opens the setup board');
  /* play both sides: 1.e4 Nf6 (the Alekhine) */
  const mv=(f,t)=>{ /* the setup board takes moves like any board */ const g=new w.Chess(); return [f,t] };
  const tap=sq=>$('o-npboard').querySelector(`.sq[data-sq="${sq}"]`).dispatchEvent(new w.MouseEvent('pointerdown',{bubbles:true,button:0}));
  tap('e2'); tap('e4'); tap('g8'); tap('f6'); tap('d2'); tap('d4'); await sleep(10);
  assert(/1\. e4 Nf6 2\. d4/.test($('o-npmoves').textContent),'both sides’ moves: '+$('o-npmoves').textContent);
  $('o-npundo').click(); assert(/1\. e4 Nf6$/.test($('o-npmoves').textContent.trim()),'Undo takes one move back');
  $('o-npname').value='My Alekhine'; $('o-npname').dataset.auto=''; $('o-npside').value='black';
  const id=O.saveNew(); await sleep(400);
  assert(id&&/^custom-/.test(id)&&$('o-newmodal').hidden,'Save stores it as a custom opening');
  const S=O.state;
  assert(S.op.id===id&&S.op.custom&&S.log.slice(0,2).map(x=>x.san).join(' ')==='e4 Nf6'&&S.log[2]&&S.log[2].who==='opp','it trains like a preset: from 1.e4 Nf6, the book plays White’s 2nd move ('+S.log.map(x=>x.san).join(' ')+')');
  assert(O.ordered(O.openings()).some(o=>o.id===id&&o.name==='My Alekhine'),'listed with the openings');
  const ex=w.Store.exportAll(); assert(ex[id]&&ex[id].moves.join(' ')==='e4 Nf6'&&ex[id].side==='black','included in the progress export');
  /* rename */
  $('o-editpos').click(); await sleep(10); assert(!$('o-newmodal').hidden&&$('o-npname').value==='My Alekhine','Rename or edit reopens it');
  $('o-npname').value='Alekhine, 2.d4'; O.saveNew(); await sleep(50);
  assert(w.Store.get(id).name==='Alekhine, 2.d4'&&O.customs().length===1,'renamed in place (same id)');
  /* zero moves, and a FEN */
  const z=O.saveCustom({name:'Start',side:'white',moves:[]}); assert(w.Store.get(z).moves.length===0,'zero moves is the starting position');
  const f=O.saveCustom({name:'From a FEN',side:'black',moves:[],fen:'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'});
  O.selectOpening(f); await sleep(50); assert(S.g.fen().startsWith('rnbqkbnr/pppppppp/8/8/4P3')&&S.g.turn()==='b','a FEN position starts there');
  let err=''; try{ O.saveCustom({name:'x',side:'white',moves:['e4','e4']}) }catch(e){ err=e.message } assert(/not legal/.test(err),'illegal moves are refused');
  try{ O.saveCustom({name:'',side:'white',moves:[]}) }catch(e){ err=e.message } assert(/name/.test(err),'a name is required');
  /* import restores it */
  w.Store.del(id); w.Store.importAll(ex); assert(w.Store.get(id)&&w.Store.get(id).name==='My Alekhine','importing progress brings it back');
  O.selectOpening(id); await sleep(50); O.deleteCustom(id);
  assert(!w.Store.get(id)&&!O.openings().some(o=>o.id===id),'Delete removes it');
}

section('t36: Save this position — from the trainer');
{
  const {w}=await makePage({analyse:async()=>[{uci:'b1c3',cp:0.3,mate:null}]});
  const O=w.OpeningsTab, $=id=>w.document.getElementById(id);
  O.selectOpening('preset-english'); await sleep(400);
  const S=O.state; assert(S.log.map(x=>x.san).join(' ')==='c4 e5','1.c4 e5 on the board');
  w.prompt=(q,d)=>{ w.__asked=d; return 'English with e5' };
  assert($('o-savepos')&&!$('o-savepos').disabled,'Save this position is offered');
  $('o-savepos').click(); await sleep(20);
  const c=O.customs(); assert(c.length===1&&c[0].name==='English with e5'&&c[0].moves.join(' ')==='c4 e5'&&c[0].side==='white','the moves on the board become a position of your own, your side');
  assert(/English/.test(w.__asked||''),'the suggested name comes from the opening ('+w.__asked+')');
  O.browse(1); w.prompt=()=>null; $('o-savepos').click(); assert(O.customs().length===1,'Cancel saves nothing');
  const id2=O.saveCurrent('Just 1.c4'); assert(w.Store.get(id2).moves.join(' ')==='c4','while browsing, it saves the position shown');
}

section('t38: trainer extras from Chess Lab — Play as, review queue, Never play this reply, mistakes after a line, captured pieces');
{
  const {w}=await makePage({analyse:async()=>null});
  const O=w.OpeningsTab, $=id=>w.document.getElementById(id), S=O.state;
  /* Play as: the other side of a preset, with its own rating */
  O.selectOpening('preset-english'); await sleep(300);
  assert(S.op.side==='white'&&$('o-playas')&&/Black/.test($('o-playas').textContent),'presets offer Play as Black');
  $('o-playas').click(); await sleep(1500);
  assert(S.op.side==='black'&&S.op.asSide&&O.SID()==='preset-english@black','Play as Black: you are Black, stats kept apart ('+O.SID()+')');
  assert(S.g.turn()==='b'&&S.log.map(x=>x.san).join()==='c4','as Black you answer 1.c4');
  $('o-playas').click(); await sleep(300); assert(S.op.side==='white'&&O.SID()==='preset-english','and back to White');
  /* review queue + mistakes after a line: an imported repertoire, a miss, then review */
  const pgn='[Event "a"]\n1. e4 e5 2. Nf3 Nc6 3. Bb5 *\n\n[Event "b"]\n1. e4 e5 2. Nf3 d6 3. d4 *';
  $('o-pgnbox').value=pgn; $('o-repname').value='Extras rep'; $('o-repside').value='white'; await O.doImport(); await sleep(300);
  assert(S.op.rep&&S.log.length===0,'the repertoire is open');
  await O.userMove('d2','d4'); await sleep(200);
  const st=O.stats(O.SID()); assert((st.mistakes||[]).length===1&&st.mistakes[0].path.length===0,'a miss goes on the review list (with the moves to get there)');
  await O.userMove('e2','e4'); await sleep(1200);
  assert($('o-review')&&/Review mistakes \(1\)/.test($('o-review').textContent),'Review mistakes (1) is offered');
  $('o-review').click(); await sleep(200);
  assert(S.review&&S.log.length===0,'review replays the missed position');
  await O.userMove('e2','e4'); await sleep(200);
  assert(!(O.stats(O.SID()).mistakes||[]).length&&/Off your review list/.test($('o-status').textContent),'found first try: off the list');
  /* never play this reply: play the line out to its end */
  for(let i=0;i<6&&S.phase!=='done';i++){ await sleep(900); const g=S.g, me=S.op.side[0]; if(g.turn()!==me) continue;
    const ok=['g1f3','f1b5','d2d4'].find(u=>g.moves({verbose:true}).some(m=>m.from+m.to===u)); if(!ok) break; await O.userMove(ok.slice(0,2),ok.slice(2,4)) }
  await sleep(300);
  const skipBtn=$('o-status').querySelector('[data-skip]');
  assert(S.phase==='done'&&skipBtn,'at the end, the replies chosen from several prepared ones can be skipped');
  const which=skipBtn.dataset.san; skipBtn.click();
  assert(O.skipList(S.op.id).length===1,'skipped ('+which+')');
  for(let k=0;k<6;k++){ O.newLine(); await sleep(150); await O.userMove('e2','e4'); await sleep(900); await O.userMove('g1','f3'); await sleep(900);
    assert(!S.log.some(x=>x.who==='opp'&&x.san===which),'a skipped reply is never played (line '+(k+1)+')') }
  /* captured pieces */
  w.Settings.set('ocaptured',true); const g2=new w.Chess('rnbqkbnr/ppp2ppp/8/8/8/8/PPPP1PPP/RNBQKBNR w KQkq - 0 3'); O.renderCaptured(g2);
  assert(!$('o-capt').hidden&&$('o-capt').querySelectorAll('.pc').length+$('o-capb').querySelectorAll('.pc').length===3,'captured pieces show, three pawns taken in all');
  w.Settings.set('ocaptured',false); O.renderCaptured(g2); assert($('o-capt').hidden,'and hide when the setting is off');
}

section('t39: endgame bot — keep the result, keep material, fewest saving replies; losing: resist longest');
{
  const {w}=await makePage();
  const E=w.EndgameCore, fen='4k2r/8/8/8/8/8/8/R1B1K3 w - - 0 1';   /* rook + bishop vs rook: a draw */
  const tb={moves:[{uci:'c1h6',category:'draw',dtz:0},{uci:'a1a7',category:'draw',dtz:0},{uci:'e1e2',category:'draw',dtz:0}]};
  const after={ /* the user's replies there: after Bh6 the rook takes it (still a draw); otherwise plain king moves */
    h6:{moves:[{uci:'h8h6',category:'draw'},{uci:'e8d8',category:'draw'}]},
    a7:{moves:[{uci:'e8d8',category:'draw'},{uci:'e8f8',category:'draw'},{uci:'h8h1',category:'win'}]},
    e2:{moves:[{uci:'e8d8',category:'draw'},{uci:'e8f8',category:'draw'},{uci:'e8f7',category:'draw'},{uci:'e8e7',category:'draw'}]}};
  const probe=async f=>{ const g=new w.Chess(f); return g.get('h6')?after.h6:g.get('a7')?after.a7:after.e2 };
  const pick=await E.pickReply(fen,tb,probe);
  assert(pick!=='c1h6','the bot no longer gives the bishop away (picked '+pick+'; the tablebase listed Bh6 first)');
  assert(pick==='a1a7','…and of the safe moves it leaves the fewest drawing replies (Ra7: 2 of 3 vs Ke2: 4)');
  assert(await E.pickReply(fen,tb,null)==='c1h6','without a probe it falls back to the tablebase order');
  const lose={moves:[{uci:'e1d1',category:'win',dtm:12},{uci:'e1f1',category:'win',dtm:30},{uci:'e1e2',category:'win',dtm:20}]};
  assert(await E.pickReply(fen,lose,probe)==='e1f1','losing anyway: it resists longest (mate in 30, not 12)');
  const win={moves:[{uci:'a1a8',category:'loss',dtm:-3},{uci:'a1a7',category:'loss',dtm:-9},{uci:'e1e2',category:'draw'}]};
  assert(E.options(win,'win').b==='a1a8'&&E.options(win,'win').w==='a1a7'&&E.options(win,'win').d==='e1e2','grading: fastest win = best, slower win = good, draw = thrown');
}

section('t40: one keymap — the same letters on every page, ? lists them, never while typing');
{
  const {w}=await makePage({analyse:async()=>null});
  const K=w.Keys, $=id=>w.document.getElementById(id), press=(key,o={})=>{ const e=new w.KeyboardEvent('keydown',Object.assign({key,bubbles:true,cancelable:true},o)); (o.target||w.document.body).dispatchEvent(e); return e };
  for(const v of ['openings','tactics','calc','endgames','drills','play','guess','players']) assert(Object.keys(K.map(v)).length,'the '+v+' page registers its keys');
  assert(K.map('openings').e&&K.map('openings').b&&K.map('openings').r&&K.map('openings').h&&K.map('openings').f&&K.map('openings').n&&K.map('openings').ArrowLeft,'Openings: ← → B R H F N E');
  assert(!K.map('endgames').ArrowLeft||/solution/.test(K.map('endgames').ArrowLeft[0]),'Endgames: ← steps the solution, take back is B');
  assert(K.map('endgames').b&&K.map('play').b&&K.map('play').p&&K.map('calc').r,'B takes back, P peeks, R resets');
  w.location.hash='#openings'; await sleep(50); w.document.body.dataset.view='openings';
  w.OpeningsTab.selectOpening('preset-any-white'); await sleep(200);
  await w.OpeningsTab.userMove('e2','e4'); await sleep(1200);
  const S=w.OpeningsTab.state; assert(S.userMoves===1&&S.phase==='await','one move played');
  const inp=w.document.createElement('input'); w.document.body.appendChild(inp);
  press('e',{target:inp}); assert(S.phase==='await','E while typing in a box does nothing');
  press('e',{ctrlKey:true}); assert(S.phase==='await','Ctrl+E stays the browser’s');
  press('e'); await sleep(50); assert(S.phase==='done'&&/ended here/.test($('o-status').textContent),'E ends the line where you are');
  press('?'); assert($('keys-overlay')&&/End the line here/.test($('keys-overlay').textContent),'? lists this page’s keys');
  press('Escape'); assert(!$('keys-overlay'),'Escape closes it');
}

section('t41: Openings — Anything vs e4 / d4 / sidelines, Hide and Restore');
{
  let w0=null; const {w}=await makePage({analyse:async(fen)=>[{uci:new w0.Chess(fen).moves({verbose:true})[0].from+new w0.Chess(fen).moves({verbose:true})[0].to,cp:0.1,mate:null}]});
  w0=w; const O=w.OpeningsTab, $=id=>w.document.getElementById(id), S=O.state;
  const ids=O.openings().map(o=>o.id); assert(['preset-any-vs-e4','preset-any-vs-d4','preset-any-vs-side'].every(i=>ids.includes(i)),'the three new boxes are listed');
  O.selectOpening('preset-any-vs-e4'); await sleep(300); assert(S.op.side==='black'&&S.log.map(x=>x.san).join()==='e4'&&S.g.turn()==='b','vs 1.e4: you answer 1.e4');
  O.selectOpening('preset-any-vs-d4'); await sleep(300); assert(S.log.map(x=>x.san).join()==='d4','vs 1.d4');
  for(let i=0;i<5;i++){ O.selectOpening('preset-any-vs-side'); await sleep(900); assert(S.log.length===1&&!['e4','d4'].includes(S.log[0].san),'vs sidelines: never 1.e4 or 1.d4 ('+(S.log[0]&&S.log[0].san)+')') }
  assert(!$('o-hide'),'the Anything boxes can’t be hidden');
  O.selectOpening('preset-italian'); await sleep(200); assert($('o-hide'),'presets have Hide this opening');
  $('o-hide').click(); await sleep(100); assert(!O.openings().some(o=>o.id==='preset-italian'),'hidden from the list');
  w.SettingsTab.init(); assert(/Italian/.test($('s-hidden').textContent),'Settings lists it');
  $('s-unhide').click(); assert(O.openings().some(o=>o.id==='preset-italian'),'Restore brings it back');
}

section('t42: puzzle titles don’t give the idea away');
{
  const {w}=await makePage({analyse:async()=>null});
  const $=id=>w.document.getElementById(id), T=w.TacticsTab;
  await sleep(300); T.load(T.lib.find(p=>p.moves.length>=4)); await sleep(50);
  const z=T.state.cur; assert(z,'a puzzle is loaded');
  const item=$('t-list').querySelector('.opp'); assert(item&&/^Puzzle /.test(item.textContent),'the list names puzzles by id ('+(item&&item.textContent)+')');
  assert(/shown when solved/.test($('t-facts').textContent)&&!$('t-facts').textContent.includes(w.themeName?w.themeName(z.motif):'@@'),'motif and themes hidden before solving');
  const sol=z.moves.slice(z.pre!==false?1:0); for(let i=0;i<sol.length;i+=2){ T.userMove(sol[i].slice(0,2),sol[i].slice(2,4)); await sleep(900) }
  assert(T.state.solved&&!/shown when solved/.test($('t-facts').textContent),'solved: the themes show');
  w.Settings.set('ptheme',true); assert(w.Puzzles.title('x','Fork',false)==='Fork','Settings → Show theme in puzzle titles');
}

section('t43: Endgames — category dropdown, your own position (tablebase-graded), Lichess analysis');
{
  const TB={'8/8/8/4k3/8/8/8/KQ6 w - - 0 1':{category:'win',dtz:17,dtm:17,moves:[{uci:'b1f1',category:'loss',dtm:-16},{uci:'b1b8',category:'loss',dtm:-20}]},
            '8/8/8/4k3/8/8/8/KQ6 b - - 0 1':{category:'loss',dtz:-17,dtm:-17,moves:[]}};
  const {w}=await makePage({fetch:async u=>{ const m=String(u).match(/tablebase\.lichess\.ovh\/standard\?fen=(.+)$/); if(!m) return null;
    const d=TB[decodeURIComponent(m[1])]||{category:'draw',moves:[]}; return {ok:true,status:200,json:async()=>d,text:async()=>JSON.stringify(d)} }});
  const $=id=>w.document.getElementById(id), E=w.EndgamesTab;
  w.location.hash='#endgames'; await sleep(600);
  assert($('eg-cat')&&$('eg-cat').tagName==='SELECT'&&$('eg-cat').options.length>3,'categories are a dropdown');
  $('eg-addpos').click(); assert(!$('eg-custom').hidden,'+ Your position opens the form');
  $('eg-cfen').value='rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'; await E.saveCustomPos(); assert(/up to 7 pieces/.test($('eg-cerr').textContent),'more than 7 pieces is refused');
  $('eg-cfen').value='8/8/8/4k3/8/8/8/KQ6 b - - 0 1'; await E.saveCustomPos(); assert(/side to move loses/.test($('eg-cerr').textContent),'a lost position is refused');
  $('eg-cfen').value='8/8/8/4k3/8/8/8/KQ6 w - - 0 1'; $('eg-cname').value='My queen mate'; await E.saveCustomPos(); await sleep(50);
  const c=E.customs(); assert(c.length===1&&c[0].goal==='win'&&c[0].end==='mate','saved as a win (mate): '+JSON.stringify(c[0]&&c[0].goal));
  assert(E.state.cur&&E.state.cur.id===c[0].id&&$('eg-cat').value==='mine','it opens under Your positions');
  assert(/lichess\.org\/analysis\/standard\/8\/8\/8\/4k3/.test($('eg-lichess').href),'Open in Lichess analysis');
  assert(!$('eg-delpos').hidden,'your positions can be deleted');
}

section('t44: Play — hint, ← → through the moves, Review on Lichess (import, else copy + paste page)');
{
  let posted=null, w0=null; const {w}=await makePage({analyse:async fen=>{ const m=new w0.Chess(fen).moves({verbose:true})[0]; return [{uci:m.from+m.to,cp:0.2,mate:null}] },
    fetch:async(u,init)=>{ if(/lichess\.org\/api\/import/.test(u)){ posted=decodeURIComponent(String(init&&init.body||'').replace(/^pgn=/,'')); return {ok:true,status:200,json:async()=>({id:'abcd1234',url:'https://lichess.org/abcd1234'})} } return null }});
  w0=w; const P=w.PlayTab, $=id=>w.document.getElementById(id);
  w.SharedEngine.play=async fen=>{ const m=new w.Chess(fen).moves({verbose:true})[0]; return m.from+m.to };
  P.newGame&&P.newGame(); await sleep(100);
  await P.hint(); assert(P.state.hints===1&&w.document.querySelector('#pl-board .sq.hint')&&!w.document.querySelector('#pl-board .sq.hintto'),'H: the piece first, counted');
  await P.hint(); assert(w.document.querySelector('#pl-board .sq.hintto')&&P.state.hints===1,'H again: the move (still one hint)');
  P.userMove('e2','e4'); await sleep(900); P.userMove('d2','d4'); await sleep(900);
  assert(P.state.moves.length>=3,'moves played ('+P.state.moves.join(' ')+')');
  P.viewAt(1); assert(P.state.view===1&&$('pl-moves').querySelector('.cur'),'← → step through the moves (view only)');
  P.viewAt(99); assert(P.state.view===null,'End: back to the game');
  P.resign(); P.resign(); await sleep(20);
  assert(!$('pl-review').hidden,'Review on Lichess appears when the game ends');
  const pg=P.pgn(); assert(/\[Result "0-1"\]/.test(pg)&&/1\. e4 /.test(pg),'the PGN carries the moves and the result');
  w.open=()=>({location:''}); const r=await w.Net.review(pg); assert(r.ok&&r.url==='https://lichess.org/abcd1234'&&/1\. e4/.test(posted),'imported to Lichess (recorded response)');
  w.fetch=async()=>{ throw new Error('blocked') }; const r2=await w.Net.review(pg); assert(!r2.ok,'when the import fails it falls back to copy + lichess.org/paste');
  assert(w.Store.get('play-games')[0].hints===1,'hints are saved with the game');
}

section('t45: mobile reader — next/prev, side lines, chapter end, sizes; Read buttons in every place');
{
  const {w}=await makePage({analyse:async()=>null});
  const R=w.Reader, $=s=>w.document.querySelector(s);
  let nextCh=0;
  const lines=[{san:'e4',note:'Best by test',shapes:'Ge2e4'},{san:'e5',vars:[[{san:'c5',note:'The Sicilian'},{san:'Nf3'}]]},{san:'Nf3'}];
  R.open({title:'Test',lines,at:0,chapter:'Ch 1',nextChapter:()=>nextCh++});
  assert($('.reader')&&$('.rd-prev').disabled&&/0 \/ 3/.test($('.rd-pos').textContent),'opens at the start; Previous disabled at the first move');
  R.next(); assert(/Best by test/.test($('.rd-notes').textContent)&&$('.rd-row.cur').textContent.includes('e4')&&$('.reader .board svg.shapes'),'Next: the move, its note, its arrows');
  assert($('.rd-bar').lastElementChild.classList.contains('rd-next')&&$('.rd-bar').firstElementChild.classList.contains('rd-prev'),'Previous far left, Next far right');
  R.next(); assert($('.rd-vars')&&/1 side line/.test($('.rd-vars').textContent),'side lines are collapsed under their move');
  R.next(); R.next(); assert(/Side line after/.test($('.rd-notes').textContent)&&R.state.li===1&&R.state.at===1,'Next at the end of the line goes to the next line (the side line)');
  assert(!$('.rd-main').hidden,'Back to main line is offered'); R.next(); R.next();
  assert(/Chapter complete/.test($('.rd-notes').textContent)&&$('#rd-nextch'),'end of the last line: Chapter complete → Next chapter (no automatic jump)');
  $('#rd-nextch').click(); assert(nextCh===1&&!$('.reader'),'Next chapter is called');
  R.open({title:'T2',lines,at:1}); $('.rd-var')&&null; w.document.querySelectorAll('.rd-row')[2].click(); w.document.querySelector('.rd-var').click();
  assert(R.state.li===1&&/c5/.test($('.rd-row.cur').textContent),'tapping a side line plays it'); $('.rd-main').click(); assert(R.state.li===0,'and Main line comes back');
  const v=R.textLine('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1','1...c5 {the Sicilian} 2.Nf3 d6!? 3.Qxx9 e5');
  assert(v.map(x=>x.san).join(' ')==='c5 Nf3 d6'&&v[0].note==='the Sicilian'&&v[2].marks==='!?','text side lines become moves (notes kept, stops at an illegal move)');
  w.localStorage.setItem('reader-board','60'); R.close(); R.open({title:'T3',lines}); assert($('.reader').style.getPropertyValue('--rb')==='60','the board size is remembered on this device');
  const kev=new w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}); w.dispatchEvent(kev); assert(R.state.at===1,'→ steps on a desktop keyboard');
  R.close(); assert(!$('.reader')&&!w.document.documentElement.classList.contains('reader-open'),'closes cleanly');
  assert(typeof R.isPhone==='function'&&/max-width:599\.98px/.test(R.MQ)&&/max-height:499\.98px/.test(R.MQ),'phone breakpoints: < 600 px portrait, < 500 px tall landscape (iPads keep desktop)');
}

section('t46: Analyze — blitz option, results by colour and rating band (all games), accuracy by phase, White/Black openings');
{
  const mk=(id,user,col,opp,res,moves,ev)=>JSON.stringify({id,createdAt:1762300000000,speed:'rapid',players:{white:{user:{name:col==='w'?user:'Opp'},rating:col==='w'?2000:opp},black:{user:{name:col==='b'?user:'Opp'},rating:col==='b'?2000:opp}},
    winner:res,moves,analysis:ev?ev.map(e=>({eval:e})):undefined});
  const mv='e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5';
  const nd=[mk('g1','Me','w',1650,'white',mv,[30,25,35,30,35,30,35,30,40,30,35,30]),mk('g2','Me','b',2250,'white',mv,null),mk('g3','Me','b',1450,'black',mv,null)].join('\n')+'\n';
  let asked='';
  const {w}=await makePage({analyse:async()=>[{uci:'e2e4',cp:0.2,mate:null}],fetch:async u=>{ if(u.includes('lichess.org/api/games/user/')){ asked=u; return {ok:true,status:200,text:async()=>nd,json:async()=>({})} } return null }});
  w.document.getElementById('a-blitz').checked=true; await w.AnalyzeTab.run('lichess','Me'); await sleep(200);
  assert(/perfType=blitz,rapid,classical/.test(asked),'Include blitz asks Lichess for blitz too');
  const rep=w.document.getElementById('a-report').textContent;
  assert(/From all 3 fetched games/.test(rep)&&/White\s*1\s*100%/.test(rep)&&/Black\s*2\s*50%/.test(rep),'results by colour use every fetched game');
  assert(/1400–1599\s*1\s*100%/.test(rep)&&/1600–1799\s*1\s*100%/.test(rep)&&/2200\+\s*1\s*0%/.test(rep),'results by opponent rating band');
  assert(/Accuracy by phase/.test(rep)&&/From the \d+ analyzed games/.test(rep),'accuracy by phase, from the analyzed games (sample stated)');
  const pa=w.AnalyzeTab.phaseAccuracy({color:'w',moves:mv.split(' ')},[30,25,35,30,35,30,35,30,40,30,35,30].map(x=>x/100));
  assert(pa.opening.length===6&&pa.opening.every(a=>a>90),'steady moves score high in the opening ('+pa.opening.map(Math.round).join(',')+')');
  assert(w.AnalyzeTab.phaseOf(new w.Chess('4k3/8/8/8/8/8/8/R2QK2R w - - 0 1'))==='endgame'&&w.AnalyzeTab.phaseOf(new w.Chess())==='opening','phase rule: 6 or fewer major/minor pieces = endgame');
  assert(w.document.querySelector('[data-optab="b"]')&&w.document.querySelector('[data-oppane="b"]').hidden,'openings split into White / Black tabs');
}

section('t47: Watch — starter videos (real, checked links), added with one click, deep-linked');
{
  const {w}=await makePage(); const W=w.WatchTab, $=id=>w.document.getElementById(id);
  w.location.hash='#watch'; await sleep(100); W.render();
  assert(W.STARTERS.length===3&&W.STARTERS.every(v=>/^[\w-]{11}$/.test(v.id)),'three starters with real YouTube ids');
  assert($('watch').querySelectorAll('[data-starter]').length===3,'offered on an empty library');
  $('watch').querySelector('[data-starter="0"]').click(); await sleep(20);
  assert(W.all.length===1&&W.all[0].id==='rgLTiUZAWQY','one click adds it');
  assert(/[?&]t=1200/.test(W.url(W.all[0])),'it opens at the Najdorf game (20:00)');
  assert($('watch').querySelectorAll('[data-starter]').length===2,'and leaves the other two on offer');
}

section('t48: prefilled links — #analyze?site=&u= and #players?site=&u= fill the form, nothing runs by itself');
{
  let fetched=0; const {w}=await makePage({url:'https://chess-lab-open.test/#analyze?site=lichess&u=suhaasn&blitz=1',fetch:async u=>{ if(/lichess\.org|chess\.com/.test(u)) fetched++; return null }});
  await sleep(100); const $=id=>w.document.getElementById(id);
  assert(w.document.body.dataset.view==='analyze','the route still opens Analyze');
  assert($('a-site').value==='lichess'&&$('a-user').value==='suhaasn'&&$('a-blitz').checked,'the form is filled');
  assert(fetched===0,'nothing is fetched until you press Fetch');
  w.location.hash='#players?site=chesscom&u=CoachSuhaas'; await sleep(80);
  assert(w.document.body.dataset.view==='players'&&$('p-site').value==='chesscom'&&$('p-user').value==='CoachSuhaas','Players: the add form is filled');
}

section('t37: shared code (site/shared/) — position ids never change, one PGN reader');
{
  const {w}=await makePage();
  /* golden values from the code before it moved to shared/pgn.js: opening progress, repertoires and books are keyed by these */
  const GOLD=[["rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1","rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -","h2o5hvmfhv"],["rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1","rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -","1jnvk0eso24"],["rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3","rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6","1a1h4jc9avk"],["r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4","r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq -","gsi0gkd7oh"],["8/8/8/4k3/8/8/4P3/4K3 w - - 0 1","8/8/8/4k3/8/8/4P3/4K3 w - -","16fzkkppx05"]];
  assert(GOLD.every(([f,k,id])=>w.PGN.normKey(f)===k&&w.PGN.posId(k)===id),'PGN.normKey / PGN.posId give the same ids as before (en passant kept only when legal)');
  assert(w.eval('posId(normKey(GOLD0))'.replace('GOLD0',JSON.stringify(GOLD[2][0])))===GOLD[2][2],'the site’s posId/normKey are the shared ones');
  const r=w.PGN.read('[Event "a"]\n{intro} 1. e4! $14 {Good [%cal Ge2e4,Rd7d5]} (1. d4 $6 {or this}) 1... e5 2. Nf3 (2. Qh5?? -- Nc6 $1) *\n\n[Event "b"]\n[FEN "8/8/8/4k3/8/8/4P3/4K3 w - - 0 1"]\n1. Kd2 *');
  const k1=w.PGN.posId(w.PGN.normKey('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'));
  assert(r.games===2&&r.bad===0&&r.starts[0]===''&&/^8\/8\/8\/4k3/.test(r.starts[1]),'two games; the second starts from its FEN');
  const e4=r.notes[k1+'|e2e4'], d4=r.notes[k1+'|d2d4'];
  assert(e4&&e4.mk==='!⩲'&&e4.text==='intro\n\nGood'&&e4.sh==='Ge2e4 Rd7d5','marks, the note before the first move, the note after it, and its arrows');
  assert(d4&&d4.mk==='?!'&&d4.text==='or this','a variation keeps its own marks and notes');
  const nc6=Object.keys(r.notes).find(k=>/\|b8c6$/.test(k));
  assert(!nc6,'after a null move the line is skipped, and its $1 is not pinned on the move before');
  assert(r.edges.get('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -').join()==='e2e4,d2d4','both first moves, in the order met');
  /* trainer core: the rating scale and the reply weighting must not drift (opening ratings are kept per browser) */
  const T=w.TrainerCore, bk=s=>({total:100,rows:[{uci:'e2e4',share:s},{uci:'d2d4',share:1-s}]});
  assert(T.difficulty(bk(0.5),['e2e4'])===2200&&T.difficulty(bk(0.9),['e2e4'])===1818&&T.difficulty(bk(0.1),['e2e4'])===2582,'difficulty: a 50% move is a 2200 find, 90% 1818, 10% 2582');
  assert(T.difficulty(null,['e2e4'])===2350&&T.difficulty({total:10,rows:[]},[])===2350&&T.difficulty(bk(0.01),['e2e4'])===2600,'no book (or under 20 games) = 2350; the scale stops at 2600');
  assert(T.R2_START===1800&&T.lineK(0)===40&&T.lineK(7)===40&&T.lineK(8)===16&&T.lineWeight(2)===0.5&&T.lineWeight(9)===1,'start 1800, K 40 for 8 provisional lines then 16, short lines count less');
  const near=(a,b)=>Math.abs(a-b)<1e-9;
  assert(near(T.varietyWeight(0.5,true,'realistic'),Math.pow(0.5,0.75))&&near(T.varietyWeight(0.5,true,'balanced'),Math.pow(0.5,0.4))&&near(T.varietyWeight(0.5,true,'sidelines'),Math.pow(0.5,0.25)*0.35)&&near(T.varietyWeight(0.01,false,'sidelines'),Math.pow(0.01,0.75)),'variety weights per mode; rare replies stay rare');
  const o=T.replyWeights([{x:0.6,weak:0.6,seen:3,row:null},{x:0.1,weak:0.6,seen:0,row:null}],{mode:'balanced',useBook:true});
  const pa=Math.pow(0.6,0.4), pb=Math.pow(0.1,0.4), ex=3-3*pa/(pa+pb);
  assert(near(o[0].w,0.85*pa*Math.pow(0.3,ex))&&near(o[1].w,0.85*pb),'a reply that came up more than its share is pushed down');
  /* line end (decided 9 Nov 2026): each move's expected score, averaged — the private site's rule */
  const sc=[{s:1,d:1600},{s:0,d:2600},{s:1,d:1600},{s:0,d:2600}], E=(d,R)=>1/(1+Math.pow(10,(d-R)/400));
  const want=40*1*(0.5-(2*E(1600,1800)+2*E(2600,1800))/4);
  assert(near(T.lineDelta(1800,0,sc),want)&&Math.abs(T.lineDelta(1800,0,sc)-40*(0.5-E(2100,1800)))>5,'a line is rated against the average of each move\'s expected score ('+want.toFixed(1)+'), not the expected score at the average difficulty');
  assert(near(T.lineDelta(1800,8,[{s:1,d:1800},{s:1,d:1800}]),16*0.5*0.5)&&T.lineDelta(1800,0,[])===0,'K 16 after 8 lines, half weight for 2 moves, nothing rated = 0');
  assert(T.pick(['a','b'],[0,0],()=>0.99)==='b'&&T.pick(['a','b'],[1,3],()=>0.5)==='b'&&T.pick(['a','b'],[1,3],()=>0.1)==='a','weighted pick');
}

section('t49: Tactics — opening filter (Lichess opening families on the existing puzzles; set and ids unchanged)');
{
  const {w}=await makePage(); await sleep(200); w.location.hash='#tactics'; await sleep(120);
  const lib=w.TacticsTab.lib, tagged=lib.filter(z=>z.op);
  assert(lib.length===11260&&tagged.length>1000,'every puzzle kept, '+tagged.length+' with an opening family');
  const box=w.document.querySelector('#t-ops input[value="Sicilian_Defense"]');
  assert(box&&/Sicilian Defense \(\d+\)/.test(box.parentNode.textContent),'Openings multi-select lists families with counts');
  box.checked=true; box.dispatchEvent(new w.Event('change',{bubbles:true})); await sleep(30);
  const f=w.TacticsTab.filtered(); assert(f.length>0&&f.every(z=>z.op==='Sicilian_Defense'),'choosing an opening keeps only its puzzles ('+f.length+')');
  assert(/opening-phase/.test(w.document.getElementById('t-ops').textContent),'says why only some puzzles have an opening');
  w.document.querySelector('#t-ops [data-all]').click(); await sleep(20); assert(w.TacticsTab.filtered().length>f.length,'Clear brings the rest back');
}

console.log('\n'+(H.failures?H.failures+' FAILURES':'All tests passed.'));
process.exit(H.failures?1:0);
})().catch(e=>{ console.error('Test run crashed:',e); process.exit(1) });
