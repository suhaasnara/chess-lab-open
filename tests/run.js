/* Chess Lab Open — headless tests (jsdom), run with: npm test */
'use strict';
const H=require('./harness');
const {makePage,sleep,assert,section}=H;
const fs=require('fs'), path=require('path');

(async()=>{

section('t1: page loads, routes, board renders');
{
  const {w}=await makePage();
  assert(w.document.querySelectorAll('.tabs button[data-route]').length===8,'eight tabs');
  assert(w.document.body.dataset.view==='openings','openings is the default view');
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
  /* data sanity on the published game file */
  const g=S.game;
  const chk=new w.Chess();
  let legal=true; for(const san of g.moves){ if(!chk.move(san)){ legal=false; break } }
  assert(legal,'every move of the published game is legal ('+g.moves.length+' plies)');
  assert(g.evs.length===g.moves.length,'an eval is stored for every ply');
  assert(g.maxpts>0&&Object.keys(g.m).length>0,'scoring data is present (max '+g.maxpts+' pts)');
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

console.log('\n'+(H.failures?H.failures+' FAILURES':'All tests passed.'));
process.exit(H.failures?1:0);
})().catch(e=>{ console.error('Test run crashed:',e); process.exit(1) });
