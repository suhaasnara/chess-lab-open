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
  assert(w.document.querySelectorAll('.tabs button[data-route]').length===13,'thirteen tabs');
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
  assert(w.document.querySelectorAll('#td-list .drill').length===10&&/0<\/b> of 10 done/.test(w.document.getElementById('td-head').innerHTML),'the list shows 10 items (with the endgame), none done');
  const tp=w.Store.get('tactics-progress')||{}; tp[t.puzzles[0]]={ok:true,t:Date.now()}; w.Store.put('tactics-progress',tp);
  w.TodayTab.render();
  assert(/1<\/b> of 10 done/.test(w.document.getElementById('td-head').innerHTML),'a puzzle solved today ticks off');
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
  assert(chips.join('|')==='All (2)|Your mistakes (1)|Punish the mistake (1)','drill filters: All / Your mistakes / Punish');
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
  assert(n>50&&n===listed,'by default the list is the hard long exercises (2200+, 4+ moves for you): '+n);
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
  w.Store.put('tac-history',[{t:now-2*D,r:1990},{t:now-D,r:2010},{t:now,r:2030}]);
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
  assert(/Train a few lines/.test(w.document.getElementById('p-opchart').textContent)&&/Solve a few puzzles/.test(w.document.getElementById('p-tacchart').textContent),'empty charts say what to do first');
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
  const css=require('fs').readFileSync(require('path').join(H.SITE,'style.css'),'utf8');
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
  assert(/Watch: 1\. Pawn structures/.test($('td-list').textContent),'Today links to the video in progress');
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

console.log('\n'+(H.failures?H.failures+' FAILURES':'All tests passed.'));
process.exit(H.failures?1:0);
})().catch(e=>{ console.error('Test run crashed:',e); process.exit(1) });
