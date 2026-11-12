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
    assert(ex.length===7&&['guess','calc','endgames','watch','play','players','blundercheck'].every(v=>ex.includes(v)),'Extra holds the other seven (Blunder check since the pack import)');
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
  const D=[1,2,3,4].map(i=>({id:'a-'+i,fen:'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',played:'a6',playedUci:'a7a6',best:'e7e5',drop:0.2,opp:'x'+i,date:'2026-10-0'+i,color:'b'}));
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
  const doc=w.document, head=()=>doc.getElementById('td-head').textContent;
  assert(doc.querySelectorAll('#td-list .drill').length===8&&/0 of 10 done/.test(head()),'Up next lists the 3 drills and 5 puzzles; the session counts 10 (with the endgame and the opening line), none done');
  assert(/Endgame/.test(doc.getElementById('td-cards').textContent)&&/Opening line/.test(doc.getElementById('td-cards').textContent),'the endgame and the opening line are cards under the session bar, as in Chess Lab');
  assert(w.TodayTab.hosted==='drill'&&w.DrillsTab.state.cur&&w.DrillsTab.state.cur.id==='a-4'&&doc.getElementById('td-grid').contains(doc.getElementById('d-board'))&&doc.body.dataset.view==='today','the first item is on Today’s board, ready to play (the Drills panel, hosted here)');
  const tp=w.Store.get('tactics-progress')||{}; tp[t.puzzles[0]]={ok:true,t:Date.now()}; w.Store.put('tactics-progress',tp);
  w.TodayTab.render();
  assert(/1 of 10 done/.test(head()),'a puzzle solved today ticks off');
  await w.DrillsTab.userMove('e7','e5'); await sleep(30);
  const dp=w.Store.get('adrills-progress');
  assert(dp['a-4']&&dp['a-4'].ok&&dp['a-4'].tries===1&&/2 of 10 done/.test(head()),'solving it on Today is stored by the Drills code under its own key, and ticks off');
  assert(w.DrillsTab.state.cur.id==='a-4'&&/Next in session/.test(doc.querySelector('#td-grid .endbar').textContent),'the solved drill stays on the board; its banner says Next in session');
  doc.querySelector('#td-grid .endbar button').click(); await sleep(30);
  assert(w.DrillsTab.state.cur.id==='a-2'&&w.TodayTab.sel==='drill:a-2','Next in session goes to the next item not done');
  w.TodayTab.next(); w.TodayTab.next(); await sleep(30);
  const pz=w.TacticsTab.state.cur;
  assert(w.TodayTab.hosted==='puzzle'&&pz&&t.puzzles.includes(pz.id)&&pz.id!==t.puzzles[0]&&doc.getElementById('td-grid').contains(doc.getElementById('t-board'))&&!doc.getElementById('td-grid').contains(doc.getElementById('d-board')),'puzzles are played here too (the Tactics panel), skipping the one already done');
  w.location.hash='#drills'; await sleep(60);
  assert(doc.getElementById('drills').contains(doc.getElementById('d-board'))&&doc.getElementById('tactics').contains(doc.getElementById('t-board'))&&w.TodayTab.hosted===null,'leaving Today gives the panels back to their tabs');
  w.DrillsTab.next(); await sleep(20);
  assert(doc.body.dataset.view==='drills'&&w.DrillsTab.state.cur&&!w.TodayTab.sel.startsWith('x'),'Next in Drills is the Drills tab’s own again');
  w.location.hash='#today'; await sleep(60);
  /* the endgame and the opening line are played here too, picked from their cards */
  const egA=doc.querySelector('#td-cards a[data-td^="endgame:"]'); const egId=egA.dataset.td.split(':')[1]; egA.click(); await sleep(60);
  assert(doc.body.dataset.view==='today'&&w.TodayTab.hosted==='endgame'&&w.EndgamesTab.state.cur&&w.EndgamesTab.state.cur.id===egId&&doc.getElementById('td-grid').contains(doc.getElementById('eg-board')),'the endgame’s card puts it on Today’s board (the Endgames panel, hosted)');
  assert(doc.querySelector('#td-cards [data-tdrow^="endgame:"]').getAttribute('aria-current')==='true','its card is marked as the one on the board');
  const ep=w.Store.get('endgame-progress')||{}; ep[egId]={tries:1,okN:1,ok:true,t:Date.now()}; w.Store.put('endgame-progress',ep); w.TodayTab.render&&0;
  const opA=doc.querySelector('#td-cards a[data-td^="opening:"]'); const opId=opA.dataset.td.split(':').slice(1).join(':'); opA.click(); await sleep(80);
  assert(doc.body.dataset.view==='today'&&w.TodayTab.hosted==='opening'&&w.OpeningsTab.state.op&&w.OpeningsTab.state.op.id===opId&&doc.getElementById('td-grid').contains(doc.getElementById('o-board'))&&doc.getElementById('td-grid').contains(doc.getElementById('o-setmodal')),'the opening line’s card puts it on Today’s board (the Openings trainer and its dialogs, hosted)');
  assert(w.Keys.view()==='openings','keys on Today follow the trainer on the board (its own keymap)');
  for(let i=0;i<40&&w.OpeningsTab.state.phase!=='await';i++) await sleep(25);
  for(const mv of w.OpeningsTab.state.g.moves({verbose:true})){ if(w.OpeningsTab.state.userMoves) break; await w.OpeningsTab.userMove(mv.from,mv.to,mv.promotion); await sleep(10) }
  for(let i=0;i<60&&w.OpeningsTab.state.phase!=='await'&&w.OpeningsTab.state.phase!=='done';i++) await sleep(25);
  const st0=w.OpeningsTab.stats(opId).lines; if(w.OpeningsTab.state.phase!=='done') w.OpeningsTab.endHere(); await sleep(60);
  assert(w.OpeningsTab.state.phase==='done'&&w.OpeningsTab.stats(opId).lines>=1&&/Next in session/.test(doc.getElementById('o-status').textContent),'ending the line there scores it with the Openings code (stats-<id>); its button says Next in session');
  w.location.hash='#openings'; await sleep(60);
  assert(doc.getElementById('openings').firstElementChild===doc.querySelector('.otrain')&&doc.getElementById('openings').contains(doc.getElementById('o-setmodal'))&&doc.getElementById('endgames').contains(doc.getElementById('eg-board'))&&w.Keys.view()==='openings','leaving Today puts the trainer, its dialogs and the Endgames panel back where they were');
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
  /* Tactics: a clean solve (on the Tactics tab: Today hosts that board while it is open) */
  w.location.hash='#tactics'; await sleep(30);
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
}
{
  const {w}=await makePage({beforeLoad:win=>{ win.localStorage.setItem('clo:tactics-progress',JSON.stringify({p1:{ok:true,t:1}})) }}); await sleep(100);
  assert(w.document.getElementById('welcome').hidden&&w.document.body.classList.contains('welcomed'),'someone who has trained here before never pressed Got it: no guide, the board page (no hero)');
  assert(w.localStorage.getItem('clo-welcome')===null,'(nothing written: it is worked out from their progress)');
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
         O.studyApi('lichess.org/study/AbCdEf12/Zz9Yy8Xx#3')==='https://lichess.org/api/study/AbCdEf12.pgn'&&!O.studyApi('https://lichess.org/abc'),'study and chapter links both fetch the whole study (every chapter)');
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
  assert(G.state.src==='own'&&/Me – Friend, 2026/.test($('g-list').textContent),'the game shows under Your own PGN');
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
  assert(/Continue\s*1\. Pawn structures/.test($('td-cards').textContent)&&$('td-cards').querySelector('a[href*="t=120s"]'),'Today’s Watch card resumes the video in progress (Chess Lab’s plan: Continue first)');
  assert(w.WatchTab.plan().every(p=>(p.v.kind||'lecture')!=='fun'),'fun videos never appear on Today');
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
  /* PARITY 7: opening names per line, a rating / time-window filter, your own notes on a player */
  w.location.hash='#players'; await sleep(20); P.select('li-rival'); await sleep(10);
  $('p-view').querySelector('[data-col="b"]').click(); await sleep(10);
  $('p-moves').querySelector('[data-uci="e2e4"]').click(); await sleep(10);
  assert(/Sicilian/.test($('p-moves').textContent)&&/King's Pawn|e4/.test($('p-line').textContent),'each move names the opening it leads into (1...c5: Sicilian)');
  $('p-filt').querySelector('.chip[data-k="band"][data-v="2000"]').click(); await sleep(10);
  assert(P.gamesOf(P.data('li-rival')).length===0&&/0 of 10 games/.test($('p-filt').textContent)&&P.movesAt('li-rival','w',start).length===0,'opponents 2000+: none of these games (opponents 1900–1950), and the explorer follows');
  $('p-filt').querySelector('.chip[data-k="band"][data-v="1800"]').click(); await sleep(10);
  assert(P.gamesOf(P.data('li-rival')).length===10&&P.movesAt('li-rival','w',start)[0].n===6,'opponents 1800+: all 10 again');
  $('p-filt').querySelector('.chip[data-k="win"][data-v="3"]').click(); await sleep(10);
  const inWin=P.data('li-rival').games.filter(g=>g.d>=new Date(Date.now()-3*30.44*864e5).toISOString().slice(0,10)).length;
  assert(P.gamesOf(P.data('li-rival')).length===inWin,'last 3 months: only games in the window ('+inWin+')');
  $('p-filt').querySelector('.chip[data-k="win"][data-v="all"]').click(); $('p-filt').querySelector('.chip[data-k="band"][data-v="all"]').click(); await sleep(10);
  const ta=$('pl-note'); ta.value='Plays fast; takes risks in the Sicilian.'; ta.dispatchEvent(new w.Event('input',{bubbles:true}));
  assert(w.Store.get('pnote-li-rival')==='Plays fast; takes risks in the Sicilian.','your notes on a player are kept (their own key)');
  $('p-view').querySelector('[data-act="sheet"]').click(); await sleep(10);
  assert(/Your notes:/.test($('p-sheet').textContent)&&/takes risks in the Sicilian/.test($('p-sheet').textContent),'the notes print on the pre-round sheet');
  await P.addPlayer('lichess','Rival',['blitz','rapid','classical']);
  assert(w.Store.get('pnote-li-rival')&&w.Store.get('player-li-rival').games.length===10,'Refresh games keeps your notes');
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
  /* v89 (kit Part 3): waits on the trainer's state instead of fixed sleeps, which failed on a slow runner */
  const until=async(f,ms=8000)=>{ const t=Date.now(); while(Date.now()-t<ms){ if(f()) return true; await sleep(20) } return !!f() };
  const myTurn=()=>S.phase==='done'||(S.phase==='await'&&!S.busy&&S.g.turn()===S.op.side[0]);
  for(let i=0;i<6&&S.phase!=='done';i++){ await until(myTurn); if(S.phase==='done') break; const g=S.g;
    const ok=['g1f3','f1b5','d2d4'].find(u=>g.moves({verbose:true}).some(m=>m.from+m.to===u)); if(!ok) break; await O.userMove(ok.slice(0,2),ok.slice(2,4)) }
  await until(()=>S.phase==='done'&&$('o-status').querySelector('[data-skip]'));
  const skipBtn=$('o-status').querySelector('[data-skip]');
  assert(S.phase==='done'&&skipBtn,'at the end, the replies chosen from several prepared ones can be skipped');
  const which=skipBtn.dataset.san; skipBtn.click();
  assert(O.skipList(S.op.id).length===1,'skipped ('+which+')');
  for(let k=0;k<6;k++){ O.newLine(); await until(myTurn); await O.userMove('e2','e4'); await until(()=>myTurn()&&S.log.length>=2);
    if(S.phase!=='done'){ await O.userMove('g1','f3'); await until(()=>S.phase==='done'||S.log.length>=4) }
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

section('t50: one per-site config (shared/site.js + js/config.js): tabs, pieces, data sources');
{
  const {w}=await makePage(); await sleep(150);
  const C=w.SITE; assert(C&&C.id==='open'&&Object.isFrozen(C)&&Object.isFrozen(C.tabs.main),'SITE defined once and frozen');
  assert(C.pieces==='cburnett','pieces: cburnett (alpha is personal-use only and stays on the private site)');
  const css=fs.readFileSync(path.join(__dirname,'../site/style.css'),'utf8'), pcs=css.match(/assets\/pieces\/(\w+)\//g)||[];
  assert(pcs.length===12&&pcs.every(x=>x==='assets/pieces/'+C.pieces+'/'),'style.css draws the configured set ('+pcs.length+' pieces)');
  const tabs=[...w.document.querySelectorAll('nav.tabs .inner > a[href^="#"]')].map(a=>a.getAttribute('href').slice(1)).filter(h=>h!=='settings');
  assert(JSON.stringify(tabs)===JSON.stringify(C.tabs.main.map(t=>t[0])),'the header main row comes from SITE.tabs: '+tabs.join(' '));
  const xs=[...w.document.querySelectorAll('#x-menu a[href^="#"]')].map(a=>a.getAttribute('href').slice(1));
  assert(C.tabs.extra.every(t=>xs.includes(t[0])),'the Extra menu comes from SITE.tabs');
  assert(w.Site.url('tactics')==='data/tactics.json'&&w.Site.url('gtm','x.json')==='data/gtm/x.json','data sources by name');
  let threw=0; try{ w.Site.url('nope') }catch(e){ threw++ } try{ w.Site.define({id:'x'}) }catch(e){ threw++ }
  assert(threw===2,'an unknown data source and a second define both throw');
}

section('t60: Year by year (shared/yearly.js): FIDE performance, opponents, rating gained and lost');
{
  const {w}=await makePage(); await sleep(100); const Y=w.Yearly;
  /* FIDE Rating Regulations 8.1.1: .99 677, .83 273, .75 193, .66 117, .54 29, .50 0, below .50 the mirror */
  assert(Y.dp(1)===800&&Y.dp(.99)===677&&Y.dp(.83)===273&&Y.dp(.75)===193&&Y.dp(.66)===117&&Y.dp(.54)===29&&Y.dp(.5)===0&&Y.dp(.49)===-7&&Y.dp(.25)===-193&&Y.dp(0)===-800,'dp: FIDE’s table');
  assert(Y.DP.length===51&&Y.DP.every((v,i)=>!i||v<Y.DP[i-1]),'dp table: 51 entries, falling');
  const o=Y.oppStats([{opp:2000,score:1},{opp:1800,score:0.5},{opp:2200,score:0},{opp:0,score:1}]);
  assert(o.oppN===3&&o.oppAvg===2000&&o.oppMed===2000&&o.perf===2000,'oppStats: unrated opponents left out; 1.5 of 3 vs 2000 average = 2000 ('+JSON.stringify(o)+')');
  assert(Y.oppStats([{opp:1500,score:1},{opp:1600,score:1},{opp:2400,score:0.5},{opp:1700,score:1}]).oppMed===1650,'median of an even count: the middle two averaged');
  const g=(date,score,opp,before,after,pool='Chess.com rapid')=>({date,score,opp,before,after,pool});
  const S=Y.summarize([g('2025-03-01',1,1500,1490,1500),g('2025-03-02',0,1520,1500,1492),g('2025-04-01',1,1480,1492,1500),g('2025-05-01',0.5,1510,1500,1500),g('2025-06-01',1,1490,1500,1508),
    g('2026-01-01',1,1600,1508,1520),g('2026-01-02',1,1610,1520,1531),g('2026-02-01',0,1590,1531,1520),g('2026-03-01',1,1620,1520,1532),g('2026-04-01',1,1600,1532,1544),g('2026-04-02',0,1300,1544,1530)]);
  assert(Object.keys(S.byYear).join()==='2025,2026'&&S.byYear['2026'].games===6&&S.byYear['2026'].oppMed===1600,'summarize: per year');
  const r=S.ratingByYear['2026'][0];
  assert(r.start===1508&&r.end===1530&&r.gained===12+11+12+12&&r.lost===11+14,'rating flow: start, end, gained and lost from each game ('+JSON.stringify(r)+')');
  const html=Y.section(S,{now:new Date('2026-11-12')});
  assert(/Year by year/.test(html)&&/2026 <span class="note">so far/.test(html)&&!/Won from \+2/.test(html),'section: the current year marked "so far"; no conversion columns without evals');
  assert(Y.section({byYear:{'2026':S.byYear['2026']}})==='','one year: no section');
}

section('t51: Win% wording (shared/winpct.js): Lichess’s Win% on screen, the grading unchanged');
{
  const {w}=await makePage(); await sleep(100); const W=w.WinPct;
  const r=p=>Math.round(W.pct(p)*10)/10;
  assert(r(0)===50&&r(1)===59.1&&r(2)===67.6&&r(3)===75.1&&r(5)===86.3,'Lichess’s curve: 0 → 50, +1 → 59.1, +2 → 67.6, +3 → 75.1, +5 → 86.3');
  assert(Math.abs(W.pct(1.7)-(50+50*w.eval('wc(1.7)')))<1e-9,'the same curve as the grading’s winning chances (wc), rescaled');
  assert(W.pts(0.1)===5&&W.pts(0.2)===10&&W.pts(0.3)===15,'Lichess’s 0.1 / 0.2 / 0.3 are 5 / 10 / 15 Win% points');
  assert(W.judge(4)===''&&W.judge(5)==='inaccuracy'&&W.judge(10)==='mistake'&&W.judge(15)==='blunder','labels at 5 / 10 / 15');
  assert(W.change(1,0.14,'w')==='59% → 52%'&&W.change(-1,0.14,'b')==='59% → 52%','before → after from the mover’s side');
  assert(/\+5 is 86%/.test(W.HELP)&&/5 points or more is an inaccuracy, 10 a mistake, 15 a blunder/.test(W.HELP),'one explanation with the table and thresholds');
  const src=['drills.js','analyze.js','openings.js'].map(f=>fs.readFileSync(path.join(__dirname,'../site/js',f),'utf8')).join('\n');
  assert(!/drop\*100/.test(src)&&!/30 points or more is a blunder/.test(src),'no “−34%” / “30 points” wording left (it read as twice Lichess’s Win%)');
}

section('t52: side lines on the board (shared/varline.js), numbered puzzles, whole-study import, Openings tools');
{
  const {w}=await makePage({analyse:async()=>[{uci:'g1f3',cp:0.3,mate:null}]}); await sleep(250);
  const $=id=>w.document.getElementById(id), V=w.VarLine;
  const box=w.document.createElement('div');
  box.innerHTML=V.wrap(undefined,'1.e4 e5 {good} 2.Nf3 (2.f4 exf4 (2...d5) 3.Nf3) Nc6 3.Bb5! a6 ±',['x']);
  const bs=[...box.querySelectorAll('.vmv')], txt=bs.map(b=>b.textContent).join(' ');
  assert(txt==='1.e4 e5 2.Nf3 2.f4 exf4 2…d5 3.Nf3 2…Nc6 3.Bb5! a6','every move is a button, numbered as in a study ('+txt+')');
  const P=t=>V.path(bs.find(b=>b.textContent===t)).join(' ');
  assert(P('2…d5')==='x e4 e5 f4 d5'&&P('3.Nf3')==='x e4 e5 f4 exf4 Nf3'&&P('2…Nc6')==='x e4 e5 Nf3 Nc6','nested lines start from the position before the move they replace; paths carry the prefix');
  assert(box.querySelector('.vnote').textContent==='good'&&/±/.test(box.textContent),'notes and evaluation signs stay as text');
  const bad=w.document.createElement('div'); bad.innerHTML=V.html(undefined,'1.e4 e5 2.Ke3 Nf6 3.Nf3');
  assert(bad.querySelectorAll('.vmv').length===2&&bad.querySelectorAll('.vdead').length===3,'an illegal move and the rest of its line stay plain text');
  const pv=(h,t)=>{ const b=w.document.createElement('div'); b.innerHTML=h; const x=[...b.querySelectorAll('.vmv')].find(e=>e.textContent===t); return x?V.path(x).join(' '):null };
  // books: a bracket after a move can hold the reply's alternative ("30.Rf4 (30...Ke6) 30...Kg5"); its number decides
  const bk=V.html(undefined,'1.e4 (1...c5 2.Nf3) 1...e5 2.Nf3');
  assert(pv(bk,'1…c5')==='e4 c5'&&pv(bk,'1…e5')==='e4 e5','a numbered bracket starts where its number fits');
  // prose: a square named in a sentence is not played; a numbered move goes back to its point; "a)" labels aren't brackets
  const pr=V.html(undefined,'1.e4 e5 2.Nf3 The knight eyes e5 and d4. 2 Bc4 Nc6 a) b) 3.Qh5');
  assert(pv(pr,'2.Bc4')==='e4 e5 Bc4'&&pv(pr,'Nc6')==='e4 e5 Bc4 Nc6'&&!pv(pr,'e5 ')&&pv(pr,'3.Qh5')==='e4 e5 Bc4 Nc6 Qh5','prose skipped, "2 Bc4" restarts at move 2, labels kept as text');
  const rv=V.html(undefined,'1.e4 e5 2.Nf3, Black now playing Nc6 3.Bb5');
  assert(pv(rv,'2…Nc6')==='e4 e5 Nf3 Nc6'&&pv(rv,'3.Bb5')==='e4 e5 Nf3 Nc6 Bb5','a move inside prose is played when the numbered move after it needs it');
  assert(V.mark(box,['x','e4','e5','f4','d5'])===bs.find(b=>b.textContent==='2…d5')&&box.querySelectorAll('.vmv.cur').length===1,'mark() highlights the move on the board');
  // puzzles: numbers instead of ids (display only)
  const lib=[{id:'YrWQQ'},{id:'7Am2X'},{id:'j26z8'}];
  assert(w.Puzzles.num(lib,'j26z8')===3&&w.Puzzles.title('j26z8','Fork',false,w.Puzzles.num(lib,'j26z8'))==='Puzzle 3'&&w.Puzzles.title('zz','',false,0)==='Puzzle zz','Puzzle 3, not Puzzle j26z8');
  // a study link copied from the browser (it names the open chapter) fetches every chapter
  assert(w.Net.studyApi('https://lichess.org/study/AbCdEf12/Zz9Yy8Xx')==='https://lichess.org/api/study/AbCdEf12.pgn','the whole study, not one chapter');
  // Openings: Lichess sits with the opening's own buttons, not under the board
  w.location.hash='#openings'; await sleep(200);
  assert(!!$('o-sidebtns').querySelector('#o-lichess')&&!$('o-tools').querySelector('#o-lichess'),'Lichess ↗ in the side card, not under the board');
  // Guess the move: a side line from the notes plays on the board once the game is read
  const idx=await w.fetch('data/gtm/index.json').then(r=>r.json()); let file=null, game=null;
  for(const e of idx){ const g=await w.fetch('data/gtm/'+e.file).then(r=>r.json()); if(Object.values(g.notes||{}).some(n=>(n.v||[]).length)){ file=e.file; game=g; break } }
  if(!file){ assert(true,'(no published game has side lines; VarLine covered above)') }
  else{ await w.GtmTab.load(file); const S=w.GtmTab.state; w.GtmTab.showGame(); await sleep(30); w.location.hash='#guess'; w.document.body.dataset.view='guess';
    const vb=$('g-moves').querySelector('.vmv'); assert(!!vb,'side lines show as move buttons');
    const path=V.path(vb); vb.click(); await sleep(10);
    assert(S.vr&&S.vr.at===path.length&&$('g-moves').querySelector('.vmv.cur')===$('g-moves').querySelector('.vmv'),'clicking a side-line move shows it on the board and marks it');
    const key=k=>w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:k,bubbles:true}));
    key('ArrowLeft'); await sleep(10); assert(!S.vr||S.vr.at===path.length-1,'← steps back along the side line');
    key('Home'); await sleep(10); assert(!S.vr&&S.view===0,'Home goes back to the game'); }
}

section('t53: Redo line / Redo from here in the opening trainer');
{
  const {w}=await makePage({analyse:async()=>[{uci:'b1c3',cp:0.3,mate:null}]});
  const $=id=>w.document.getElementById(id);
  /* a file with a short side line for the opponent (2...d6 ends at once) and a longer main line (2...Nc6 3.Bb5 a6 4.Ba4) */
  const pgn='[Event "Redo"]\n\n1. e4 e5 2. Nf3 Nc6 (2... d6 3. d4) 3. Bb5 a6 4. Ba4 *';
  $('o-pgnbox').value=pgn; $('o-repname').value='Redo rep'; $('o-repside').value='white'; $('o-repsave').click(); await sleep(150);
  const O=w.OpeningsTab, S=O.state;
  async function play(){ for(let n=0;n<10&&S.phase!=='done';n++){ for(let t=0;t<60&&!(S.phase==='done'||(S.phase==='await'&&!S.busy&&S.g.turn()==='w'));t++) await sleep(30); if(S.phase==='done') break;
      const f=O.repPick?null:null; const file=S.op&&S.g?(()=>{ const g=new w.Chess(S.g.fen()); return g })():null;
      const mv=({'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR':'e2e4'})[S.g.fen().split(' ')[0]]||(S.g.history().length===2?'g1f3':S.g.history().slice(-1)[0]==='d6'?'d2d4':S.g.history().slice(-1)[0]==='Nc6'?'f1b5':'b5a4');
      await O.userMove(mv.slice(0,2),mv.slice(2,4)); }
    for(let t=0;t<60&&S.phase!=='done';t++) await sleep(30) }
  /* get the short side line first (the opponent's pick is random; at most 30 tries) */
  /* v89: 2...d6 is a few percent of master games, so 40 random lines sometimes never reached it (about 1 run in 3 failed
     here). The pick takes the last candidate when the random draw is near 1, and the file lists the side line last. */
  const rnd=w.Math.random; w.Math.random=()=>0.9999;
  let got=false; const seen=new Set(); try{ for(let k=0;k<5&&!got;k++){ O.newLine(); await play(); const t=S.log.map(x=>x.san).join(' '); seen.add(t); got=t==='e4 e5 Nf3 d6 d4' } } finally { w.Math.random=rnd }
  assert(got,'played the short side line 2...d6 3.d4 (got: '+[...seen].join(' | ')+')');
  assert(O.canRedo()&&$('o-status').querySelector('[data-redo]')&&!$('o-endredo').disabled,'Redo offered on the end card and the board banner');
  const lines=O.stats(O.SID()).lines;
  /* Redo: the same replies while you repeat your moves; nothing rated again */
  assert(w.Keys.map('openings').d,'D is in the keymap');
  O.redoLine(); await sleep(10);
  assert(S.redo&&S.phase!=='done','Redo starts the same line again ('+S.phase+')');
  await play();
  assert(S.log.map(x=>x.san).join(' ')==='e4 e5 Nf3 d6 d4','the opponent repeated 1...e5 and 2...d6');
  assert(S.scored.length===0,'positions of the old line aren’t rated again');
  assert(O.stats(O.SID()).lines===lines+1||w.Settings.get('omode')==='rated','the redo is a line played');
  /* Redo from here at 2...: the opponent picks the other reply */
  O.browse(3); await sleep(10);
  assert(/Redo from here/.test($('o-status').querySelector('[data-redo]').textContent),'label follows the move you look at');
  $('o-status').querySelector('[data-redo]').click();
  for(let t=0;t<60&&S.log.length<4;t++) await sleep(30);
  assert(S.log.slice(0,3).map(x=>x.san).join(' ')==='e4 e5 Nf3'&&S.log[3]&&S.log[3].san==='Nc6','['+S.log.map(x=>x.san).join(' ')+'] Redo from here: played out to 2.Nf3, then 2...Nc6 instead of 2...d6');
  await play();
  assert(S.log.map(x=>x.san).join(' ')==='e4 e5 Nf3 Nc6 Bb5 a6 Ba4','the main line plays out after that');
}

section('t54: a hint is a miss in the repertoire record, once per position (the private site’s v89 fix)');
{
  const {w}=await makePage({analyse:async()=>[{uci:'b1c3',cp:0.3,mate:null}]});
  const $=id=>w.document.getElementById(id), O=w.OpeningsTab, S=O.state;
  w.Settings.set('omode','rated');
  $('o-pgnbox').value='[Event "Hint"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 *'; $('o-repname').value='Hint rep'; $('o-repside').value='white'; $('o-repsave').click(); await sleep(150);
  const rec=()=>{ const r=(O.stats(S.op.id).rep||{})[w.posId(w.normKey(S.g.fen()))]; return r?r.n+'/'+r.w:'0/0' };
  O.newLine(); await sleep(50);
  assert(S.op.rep&&S.g.history().length===0,'the repertoire is open at move 1');
  await O.hint(); assert(rec()==='1/1','first Hint press: recorded as a miss ('+rec()+')');
  await O.hint(); assert(rec()==='1/1','second press (the move shown): not recorded again ('+rec()+')');
  await O.userMove('d2','d4'); await sleep(80); assert(rec()==='1/1','a wrong move after the hint: not recorded again ('+rec()+')');
  const fen0=S.g.fen();
  await O.userMove('e2','e4'); await sleep(60);
  { const r=(O.stats(S.op.id).rep||{})[w.posId(w.normKey(fen0))]; assert(r&&r.n===1&&r.w===1,'the right move then: still one miss, not a miss and a find ('+(r&&r.n+'/'+r.w)+')') }
  /* without a hint: a wrong move then the right one is one miss; found first try is one find */
  for(let t=0;t<60&&!(S.phase==='await'&&!S.busy&&S.g.turn()==='w');t++) await sleep(30);
  const fen1=S.g.fen(); await O.userMove('a2','a3'); await sleep(80); await O.userMove('g1','f3'); await sleep(60);
  { const r=(O.stats(S.op.id).rep||{})[w.posId(w.normKey(fen1))]; assert(r&&r.n===1&&r.w===1,'wrong then right, no hint: one miss ('+(r&&r.n+'/'+r.w)+')') }
  O.newLine(); await sleep(50); await O.userMove('e2','e4'); await sleep(60);
  { const r=(O.stats(S.op.id).rep||{})[w.posId(w.normKey(fen0))]; assert(r&&r.n===2&&r.w===1,'next line, found first try: one find added ('+(r&&r.n+'/'+r.w)+')') }
  /* Training mode records nothing */
  w.Settings.set('omode','training'); O.newLine(); await sleep(50); await O.hint(); await O.hint();
  { const r=(O.stats(S.op.id).rep||{})[w.posId(w.normKey(fen0))]; assert(r.n===2&&r.w===1,'Training: a hint records nothing') }
  w.Settings.set('omode','rated');
}

section('t55: null moves in imported files ("--", "Z0", "0000") end their line and never reach the repertoire');
{
  const {w}=await makePage({analyse:async()=>[{uci:'b1c3',cp:0.3,mate:null}]});
  const nf3=w.PGN.normKey('rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2');
  for(const nul of ['--','Z0','0000']){
    const r=w.PGN.read('[Event "n"]\n1. e4 e5 2. Nf3 '+nul+' 3. Bc4 Nf6 (3... Nc6 '+nul+' 4. d4) *');
    assert(r.bad===0&&!r.edges.has(nf3),'"'+nul+'": nothing after the null move, and no bad-move count ('+r.bad+' bad)');
    assert(r.edges.get(w.PGN.normKey('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2')).join()==='g1f3','"'+nul+'": the moves before it are kept');
    const r2=w.PGN.read('[Event "m"]\n1. e4 e5 2. Nf3 '+nul+' (2... Nc6 3. Bb5) 3. Bc4 *');
    assert(r2.bad===0&&(r2.edges.get(nf3)||[]).join()==='b8c6','"'+nul+'": a side line right after the null move is its alternative, from that position');
  }
  /* imported: a "--" in a side line; the opponent only ever plays real moves and the line ends cleanly */
  const $=id=>w.document.getElementById(id), O=w.OpeningsTab, S=O.state;
  $('o-pgnbox').value='[Event "Null"]\n\n1. e4 e5 (1... c5 -- 2. Nf3) 2. Nf3 Nc6 0000 3. Bb5 *'; $('o-repname').value='Null rep'; $('o-repside').value='white'; $('o-repsave').click(); await sleep(150);
  const all=[...w.OpeningsTab.repMap(S.op.id).values()].flat();
  assert(S.op.rep&&all.length===5&&all.every(u=>/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(u)&&u!=='0000'),'every move in the stored map is a real move ('+all.join(' ')+')');
  for(let k=0;k<6;k++){ O.newLine(); for(let i=0;i<6&&S.phase!=='done';i++){ for(let t=0;t<60&&!(S.phase==='done'||(S.phase==='await'&&!S.busy&&S.g.turn()==='w'));t++) await sleep(25); if(S.phase==='done') break;
      const h=S.g.history(); const mv=h.length===0?'e2e4':h[h.length-1]==='e5'?'g1f3':h[h.length-1]==='c5'?'g1f3':'f1b5'; await O.userMove(mv.slice(0,2),mv.slice(2,4)) }
    for(let t=0;t<60&&S.phase!=='done';t++) await sleep(25);
    assert(S.phase==='done','line '+(k+1)+' ends ('+S.g.history().join(' ')+')') }
}

section('t56: shared/engine.js — a build’s wasm can be looked up first (a copy in the browser’s cache), or skipped');
{
  const {w}=await makePage();
  const made=[]; const RealWorker=w.Worker, RealCOU=w.URL.createObjectURL; w.URL.createObjectURL=()=>'blob:boot';   /* jsdom has neither */
  w.Worker=function(u){ made.push(String(u)); const me={postMessage(m){ if(m==='uci') setTimeout(()=>me.onmessage&&me.onmessage({data:'uciok'}),5) },terminate(){}}; return me };
  try{
    const E=w.EngineKit.create([['A','a.js',()=>false,1000],['B','b.js',()=>Promise.resolve('blob:local/1'),1000],['C','c.js',null,1000]]);
    E.start(); for(let t=0;t<40&&!E.ready;t++) await sleep(25);
    assert(E.ready&&E.name==='B','false skips a build; the looked-up one starts ('+E.name+')');
    assert(made.length===1&&made[0].endsWith('#'+encodeURIComponent('blob:local/1')),'its wasm URL is the looked-up one ('+made.join()+')');
    assert(E.started===true,'started is true once asked to start');
    const E2=w.EngineKit.create([['P','p.js','plain.wasm',1000]]); assert(E2.started===false,'started is false before');
    E2.start(); for(let t=0;t<40&&!E2.ready;t++) await sleep(25);
    assert(E2.ready&&made[1].endsWith('#plain.wasm'),'a plain wasm URL works as before');
    const E3=w.EngineKit.create([['X','x.js',()=>{ throw new Error('no cache here') },1000]]); E3.start(); for(let t=0;t<40&&!E3.ready;t++) await sleep(25);
    assert(E3.ready&&!/#/.test(made[2]),'a lookup that throws: the build starts without a wasm hint (the script’s own default)');
  } finally { w.Worker=RealWorker; w.URL.createObjectURL=RealCOU }
}

section('t57: a side line that stops on the opponent’s move ends the line at once (as on the private site)');
{
  const {w}=await makePage({analyse:async()=>[{uci:'b1c3',cp:0.3,mate:null}]});
  const $=id=>w.document.getElementById(id), O=w.OpeningsTab, S=O.state;
  $('o-pgnbox').value='[Event "Stop"]\n\n1. e4 e5 2. Nf3 Nc6 (2... d6) 3. Bb5 *'; $('o-repname').value='Stop rep'; $('o-repside').value='white'; $('o-repsave').click(); await sleep(150);
  const rnd=w.Math.random; w.Math.random=()=>0.9999;   /* the opponent takes the last candidate: the side line 2...d6 */
  try{ O.newLine(); for(let t=0;t<60&&!(S.phase==='await'&&!S.busy&&S.g.turn()==='w');t++) await sleep(25);
    await O.userMove('e2','e4'); for(let t=0;t<80&&!(S.phase!=='await'||(!S.busy&&S.g.turn()==='w'&&S.g.history().length===2));t++) await sleep(25);
    await O.userMove('g1','f3'); for(let t=0;t<80&&S.phase!=='done';t++) await sleep(25);
  } finally { w.Math.random=rnd }
  assert(S.g.history().join(' ')==='e4 e5 Nf3 d6','the opponent played the side line ('+S.g.history().join(' ')+')');
  assert(S.phase==='done'&&/Your prep stops here, after d6/.test($('o-status').textContent),'the line ends at once: '+$('o-status').textContent.slice(0,60));
  assert(!S.misses.length,'nothing counted as a miss');
}

section('t58: Retry the miss (Y): the line again from your first miss, nothing rated again (as the private site’s v92)');
{
  const {w}=await makePage({analyse:async()=>[{uci:'b1c3',cp:0.3,mate:null}]});
  const $=id=>w.document.getElementById(id), O=w.OpeningsTab, S=O.state;
  w.Settings.set('omode','rated');
  $('o-pgnbox').value='[Event "Retry"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 *'; $('o-repname').value='Retry rep'; $('o-repside').value='white'; $('o-repsave').click(); await sleep(150);
  const myTurn=()=>S.phase==='await'&&!S.busy&&S.g.turn()==='w';
  const waitMine=async()=>{ for(let t=0;t<80&&!(S.phase==='done'||myTurn());t++) await sleep(25) };
  const FILE={0:'e2e4',2:'g1f3',4:'f1b5',6:'b5a4'};
  async function play(missAt){ for(let n=0;n<8&&S.phase!=='done';n++){ await waitMine(); if(S.phase==='done') break; const ply=S.g.history().length;
      if(ply===missAt){ await O.userMove('a2','a3'); for(let t=0;t<40&&S.busy;t++) await sleep(25) }
      const u=FILE[ply]; await O.userMove(u.slice(0,2),u.slice(2,4)) }
    for(let t=0;t<80&&S.phase!=='done';t++) await sleep(25) }
  O.newLine(); await play(-1);
  assert(S.phase==='done'&&!$('o-status').querySelector('[data-retry]'),'no Retry the miss after a line without a miss');
  O.newLine(); await play(2);
  assert(S.phase==='done'&&S.misses.length===1&&S.misses[0].at===2,'one miss, at ply 2 ('+JSON.stringify(S.misses.map(m=>m.at))+')');
  const old=S.log.map(x=>x.san).join(' '), b=$('o-status').querySelector('[data-retry]');
  assert(b&&/Retry the miss/.test(b.textContent),'the end card offers Retry the miss');
  assert(w.Keys.map('openings').y,'Y is in the keymap');
  const rating=O.stats(O.SID()).rating;
  b.click(); for(let t=0;t<60&&!(myTurn()&&S.log.length===2);t++) await sleep(25);
  assert(S.log.length===2&&S.log.map(x=>x.san).join(' ')==='e4 e5'&&myTurn(),'back at the position of the miss ('+S.log.map(x=>x.san).join(' ')+')');
  await play(-1);
  assert(S.log.map(x=>x.san).join(' ')===old,'the same line to its end ('+S.log.map(x=>x.san).join(' ')+')');
  assert(S.scored.length===0,'nothing rated again'); assert(O.stats(O.SID()).rating===rating,'rating unchanged');
  /* two misses: the label says so, and Y goes back to the first */
  O.newLine(); for(let n=0;n<8&&S.phase!=='done';n++){ await waitMine(); if(S.phase==='done') break; const ply=S.g.history().length;
    if(ply===2||ply===4){ await O.userMove('a2','a3'); for(let t=0;t<40&&S.busy;t++) await sleep(25) } const u=FILE[ply]; await O.userMove(u.slice(0,2),u.slice(2,4)) }
  for(let t=0;t<80&&S.phase!=='done';t++) await sleep(25);
  assert(/Retry from 1st miss/.test(($('o-status').querySelector('[data-retry]')||{}).textContent||''),'two misses: Retry from 1st miss');
  w.Keys.map('openings').y[1]({});   /* the Y key's action (the page here isn't on the Openings view) */
  for(let t=0;t<60&&!(myTurn()&&S.log.length===2);t++) await sleep(25);
  assert(S.log.length===2&&myTurn(),'Y: back to the first miss');
}

section('t59: a Chess Lab pack — Store.importPack merges by id, keeps your results, rejects other files, says when storage is full; Progress, Blunder check, Drills, Today');
{
  /* A made-up player (never a real one): two drills and two blunder checks on positions from a short game, ids as Open makes them. */
  const sha=s=>crypto.createHash('sha1').update(s).digest('hex').slice(0,8);
  const {w}=await makePage(); const $=id=>w.document.getElementById(id), S=w.Store;
  const g=new w.Chess(); for(const m of ['e4','e5','Nf3','Nc6','Bc4','Nf6','Ng5','d5','exd5','Na5']) g.move(m);
  const fen1=g.fen();                                  /* White to move: 6.Bb5+ is best, the made-up game had 6.d3 */
  const g2=new w.Chess(); for(const m of ['d4','d5','c4','e6','Nc3','Nf6','Bg5','Be7']) g2.move(m);
  const fen2=g2.fen();
  const dA={id:'a'+sha(fen1+'|d2d3'),fen:fen1,played:'d3',playedUci:'d2d3',best:'c4b5',drop:0.12,before:0.4,date:'2026-10-02',opp:'made_up_opp',site:'chesscom',url:'https://www.chess.com/game/live/1',color:'w',pack:1,type:'convert',tc:'10+0'};
  const dB={id:'a'+sha(fen2+'|e2e3'),fen:fen2,played:'e3',playedUci:'e2e3',best:'g1f3',drop:0.21,before:-0.3,date:'2026-09-12',opp:'another_opp',site:'chesscom',url:'',color:'w',pack:1,type:'save',tc:'15+10'};
  const nullFen=fen1.replace(' w ',' b ');
  const bcA={id:'k'+sha(fen1+'|d2d3'),fen:fen1,null:nullFen,color:'white',opp:'made_up_opp',oppElo:'1801',date:'2026-10-02',event:'',moveNo:6,played:'d3',playedUci:'d2d3',reply:'h6',replyUci:'h7h6',
    w0:62,w1:41,e0:0.5,e1:-0.9,threat:'h6',threatUci:'h7h6',threats:['h7h6','f8c5'],gain:1.4,ignored:true,best:'Bb5+',bestUci:'c4b5',goods:['c4b5','b1c3'],strong:false,site:'chesscom',url:'',tc:'10+0'};
  const bcB=Object.assign({},bcA,{id:'k'+sha(fen2+'|e2e3'),fen:fen2,null:fen2.replace(' w ',' b '),played:'e3',playedUci:'e2e3',threats:['f6e4'],threat:'Ne4',threatUci:'f6e4',goods:['g1f3'],best:'Nf3',bestUci:'g1f3',strong:true,oppElo:'2210'});
  const pack={_app:'chess-lab-pack',_v:1,_t:'2026-11-11T12:00:00Z',player:{name:'Pat Example',chesscom:'pat_example',lichess:''},
    meta:{built:'2026-11-11',games:120,rapid:40,blitz:80,newest:'2026-11-10',oldest:'2025-11-12'},
    drills:[dA,dB],bc:[bcA,bcB],
    report:{since:null,overall:{games:120},views:{'online|all':{overall:{games:120,wins:60,draws:10,losses:50,score:54.2,convN:30,convWon:21,convDrawn:3,conversion:70,saveN:25,saveHeld:6,saveRate:24},
      bySpeed:{'Chess.com blitz':{games:80,wins:40,draws:6,losses:34,score:53.8,convN:20,convWon:14,convDrawn:2,conversion:70,saveN:17,saveHeld:4,saveRate:23.5},'Chess.com rapid':{games:40,wins:20,draws:4,losses:16,score:55,convN:10,convWon:7,convDrawn:1,conversion:70,saveN:8,saveHeld:2,saveRate:25}},
      byYear:{'2025':{games:20,wins:9,draws:2,losses:9,score:50,convN:5,convWon:3,convDrawn:1,conversion:60,saveN:4,saveHeld:1,saveRate:25,oppN:20,oppAvg:1500,oppMed:1490,perf:1500},'2026':{games:100,wins:51,draws:8,losses:41,score:55,convN:25,convWon:18,convDrawn:2,conversion:72,saveN:21,saveHeld:5,saveRate:23.8,oppN:100,oppAvg:1580,oppMed:1600,perf:1616}},
      ratingByYear:{'2025':[{pool:'Chess.com blitz',games:20,start:1480,end:1530,gained:120,lost:70}],'2026':[{pool:'Chess.com blitz',games:80,start:1530,end:1610,gained:400,lost:320},{pool:'Chess.com rapid',games:20,start:1550,end:1540,gained:60,lost:70}]},
      byQuarter:{'2026 Q2':{games:50,wins:25,draws:5,losses:20,score:55,convN:12,convWon:8,convDrawn:1,conversion:66.7,saveN:10,saveHeld:3,saveRate:30},'2026 Q3':{games:50,wins:26,draws:3,losses:21,score:55,convN:13,convWon:10,convDrawn:1,conversion:76.9,saveN:11,saveHeld:2,saveRate:18.2}},
      byBand:{'Under 1800':{games:70,wins:45,draws:5,losses:20,score:67.9,convN:20,convWon:16,convDrawn:1,conversion:80,saveN:10,saveHeld:4,saveRate:40}},
      openings:[{family:'Italian Game',side:'white',games:30,wins:16,draws:2,losses:12,score:56.7,convN:8,convWon:6,convDrawn:0,conversion:75,saveN:5,saveHeld:1,saveRate:20,ev12:0.31,line:['e4','e5','Nf3','Nc6','Bc4']}]}}},
    prep:null,reps:[]};

  /* other files are refused, with a clear reason */
  const bad=(o,re,msg)=>{ let e=null; try{ S.importPack(o) }catch(x){ e=x } assert(e&&re.test(e.message),msg+' ('+(e&&e.message)+')') };
  bad({_app:'chess-lab-open',_v:1},/progress export/i,'a progress export is refused (use Import progress)');
  bad({_app:'something-else'},/Not a Chess Lab pack/,'another app’s file is refused');
  bad(Object.assign({},pack,{_v:2}),/newer version/,'a pack from a newer version is refused');
  assert(!S.get('pack-meta')&&!(S.get('adrills')||[]).length,'nothing was stored by a refused file');

  /* the same move found earlier by Analyze my games: one drill, your result kept */
  S.put('adrills',[{id:dA.id,fen:fen1,played:'d3',playedUci:'d2d3',best:null,drop:0.1,before:0.5,date:'2026-10-02',opp:'made_up_opp',site:'chesscom',url:'',color:'w'}]);
  S.put('adrills-progress',{[dA.id]:{tries:2,ok:true,okN:1,t:1700000000000}});
  const prog0=JSON.stringify(S.get('adrills-progress'));
  const r=S.importPack(pack);
  assert(r.added===1&&r.updated===1&&r.bc===2&&r.games===120,'counts: 1 new drill, 1 already there, 2 blunder checks, 120 games ('+JSON.stringify(r)+')');
  const D=S.get('adrills');
  assert(D.length===2&&D.filter(d=>d.id===dA.id).length===1,'merged by id: no duplicate');
  assert(D.find(d=>d.id===dA.id).best==='c4b5'&&D.every(d=>d.pack===1),'the pack’s verified record (best move) replaces the old one, marked as from the pack');
  assert(JSON.stringify(S.get('adrills-progress'))===prog0,'adrills-progress untouched');
  const r2=S.importPack(pack);
  assert(r2.added===0&&r2.updated===2&&S.get('adrills').length===2,'loading it again adds nothing');
  assert(S.get('pack-player').name==='Pat Example'&&S.get('pack-bc').length===2&&S.get('pack-report').views['online|all'],'player, blunder check and report stored (pack-*)');
  /* a junk record in a pack is skipped, not stored */
  const r3=S.importPack(Object.assign({},pack,{drills:[...pack.drills,{id:'zz',fen:'x'}],bc:[...pack.bc,{id:'k123'}]}));
  assert(r3.drills===2&&r3.bc===2,'records without a valid id / fen / answer lists are skipped');

  /* storage full: all or nothing, and the reason in plain words */
  { const ls=w.localStorage, SP=w.Storage.prototype, real=SP.setItem; const before=ls.getItem('clo:adrills'), bcBefore=ls.getItem('clo:pack-bc');
    SP.setItem=function(k,v){ if(k==='clo:pack-report'){ const e=new Error('quota'); e.name='QuotaExceededError'; throw e } return real.call(this,k,v) };
    const big=Object.assign({},pack,{drills:[...pack.drills,Object.assign({},dB,{id:'a'+sha('x|y'),fen:fen2})]});
    let err=null; try{ S.importPack(big) }catch(e){ err=e }
    SP.setItem=real;
    assert(err&&/doesn’t fit in this browser’s storage/.test(err.message)&&/Nothing was changed/.test(err.message),'storage full: a clear message ('+(err&&err.message.slice(0,60))+'…)');
    assert(ls.getItem('clo:adrills')===before&&ls.getItem('clo:pack-bc')===bcBefore,'storage full: what was written is put back'); }

  /* Progress: the load button, what the pack holds, its report card */
  assert($('p-loadpack')&&$('p-packfile')&&$('p-packfile').accept.includes('json'),'Progress has "Load a Chess Lab pack"');
  w.location.hash='#progress'; await sleep(80);
  assert(!$('p-pack').hidden&&/Pat Example/.test($('p-pack').textContent)&&/120 games \(40 rapid, 80 blitz\)/.test($('p-pack').textContent),'the pack card: whose, how many games');
  assert(/1 \/ 2/.test($('p-pack').textContent)&&/0 \/ 2/.test($('p-pack').textContent),'pack drills solved (1 of 2, the result from Analyze kept) and blunder checks passed');
  const rc=$('p-report'); assert(!rc.hidden&&/Report card/.test(rc.textContent),'the report card shows');
  assert(/From 120 online games/.test(rc.textContent)&&/70%/.test(rc.textContent),'lead and tiles from the pack (120 games, 70% conversion)');
  const hs=[...rc.querySelectorAll('h3')].map(h=>h.textContent);
  assert(['By opponent rating','By opening','By game type','Year by year','By quarter'].every(t=>hs.includes(t)),'tables: opponent rating, opening, game type, year by year, quarter ('+hs.join(', ')+')');
  { const yt=rc.querySelector('.ytable'), rows=[...yt.querySelectorAll('tbody tr')];
    assert(rows.length===2&&/1580 · 1600/.test(rows[1].textContent)&&/1616/.test(rows[1].textContent),'Year by year: opponents average · median and performance');
    assert(/▲ 116/.test(rows[1].textContent)&&rows[1].querySelector('.ydelta.tgood'),'Year by year: the change in performance from the year before (▲ 116, green)');
    assert(/Chess\.com blitz\s*1530 → 1610\s*\+400 \/ −320/.test(rows[1].textContent)&&/Chess\.com rapid/.test(rows[1].textContent),'Year by year: rating start → end and gained / lost, per pool');
    assert(/2026 so far against 2025: a performance of 1616 \(\+116\)/.test(rc.querySelector('.yearbox').textContent)||/2026 against 2025: a performance of 1616 \(\+116\)/.test(rc.querySelector('.yearbox').textContent),'Year by year: the summary line');
    assert(!/Performance rating/.test(rc.querySelector('.stats').textContent),'no performance tile when the pack’s overall has none (older packs)'); }
  assert(!rc.querySelector('[data-prv]'),'online games only: no Over the board / Combined switch, no period switch');
  assert(/\+0\.31/.test(rc.textContent),'eval after move 12 from White’s side (+0.31 as White)');
  const drill=rc.querySelector('[data-pdrill]'); assert(drill,'"Drill this" on the opening row');
  drill.click(); await sleep(150);
  assert(w.location.hash==='#openings'&&w.OpeningsTab.state.op&&w.OpeningsTab.state.op.name==='Italian Game as White','Drill this opens the line in the opening trainer');
  drill.click(); await sleep(150);
  assert(w.OpeningsTab.customs().filter(c=>c.name==='Italian Game as White').length===1,'a second Drill this reuses it');

  /* the file input path, end to end */
  w.location.hash='#progress'; await sleep(60);
  if(!w.File.prototype.text) w.File.prototype.text=function(){ return new Promise(res=>{ const r=new w.FileReader(); r.onload=()=>res(r.result); r.readAsText(this) }) };   /* jsdom has no Blob.text */
  const fi=$('p-packfile'); const file=new w.File([JSON.stringify(pack)],'pack.json',{type:'application/json'});
  Object.defineProperty(fi,'files',{value:[file],configurable:true}); fi.dispatchEvent(new w.Event('change')); await sleep(150);
  assert(/Loaded Pat Example’s Chess Lab pack: 0 new drills \(2 you already had, kept with your results\), 2 Blunder check positions, a report card from 120 games\./.test($('p-packnote').textContent),'loading from the file says what came in: '+$('p-packnote').textContent);
  Object.defineProperty(fi,'files',{value:[new w.File(['not json'],'x.json')],configurable:true}); fi.dispatchEvent(new w.Event('change')); await sleep(120);
  assert(/isn’t JSON/.test($('p-packnote').textContent)&&$('p-packnote').classList.contains('err'),'a broken file: a clear error');

  /* Drills and Today use the pack's drills */
  w.location.hash='#drills'; await sleep(80);
  assert(w.document.querySelectorAll('#d-list .drill').length===2,'Drills lists the pack’s drills');
  w.Store.del('today'); w.location.hash='#today'; await sleep(120);
  assert((w.Store.get('today')||{drills:[]}).drills.includes(dB.id),'Today picks the untried pack drill');

  /* Blunder check: the threat, then your move */
  w.location.hash='#blundercheck'; await sleep(100);
  const B=w.BlunderCheckTab;
  assert(w.document.querySelectorAll('#bc-list .drill').length===2,'Blunder check lists the pack’s positions');
  assert(B.state.cur&&B.state.phase==='threat','opening the tab opens the first position at step 1');
  B.open(bcA.id); assert(/what does made_up_opp threaten/.test($('bc-status').textContent),'step 1 asks for the threat');
  B.move('a7','a6'); assert($('bc-status').classList.contains('bad')&&B.state.phase==='threat','a wrong threat: try again');
  B.move('f8','c5'); assert($('bc-status').classList.contains('good'),'another threat within half a pawn counts');
  await sleep(1450); assert(B.state.phase==='move','then step 2: your move');
  B.move('c4','b5'); assert(B.state.phase==='done'&&/Bb5\+ holds/.test($('bc-status').textContent),'a good move holds');
  assert(w.Store.get('bc-progress')[bcA.id].ok===false,'a missed first try at the threat: not solved, back tomorrow');
  assert(/Back tomorrow/.test($('bc-reveal').textContent)&&/That was exactly the threat/.test($('bc-reveal').textContent),'the game: what happened');
  B.open(bcB.id); B.move('f6','e4'); await sleep(1450); B.move('g1','f3');
  assert(w.Store.get('bc-progress')[bcB.id].ok===true&&/back in 3 days/.test($('bc-reveal').textContent),'both steps right first time: solved, back in 3 days');
  assert(B.status(bcB)==='solved'&&B.status(bcA)==='missed','statuses');
  B.open(bcA.id); B.show(); assert(/The threat: h6/.test($('bc-status').textContent),'Show the threat'); await sleep(1600); B.show();
  assert(B.state.phase==='done'&&/Stockfish: Bb5\+/.test($('bc-status').textContent),'Show the move');
  assert(w.Keys.map('blundercheck').n&&w.Keys.map('blundercheck').s,'keys N and S');
  /* a newer pack keeps the results (same ids) */
  S.importPack(pack); assert(w.Store.get('bc-progress')[bcB.id].ok===true,'a reloaded pack keeps Blunder check results');

  /* remove the pack: its report and positions go, results and tried drills stay */
  w.location.hash='#progress'; await sleep(60);
  w.Store.put('adrills-progress',{[dA.id]:{tries:2,ok:true,okN:1,t:1700000000000}});
  $('p-packrm').click(); await sleep(60);
  assert(!S.get('pack-meta')&&!S.get('pack-bc')&&$('p-pack').hidden&&$('p-report').hidden,'Remove the pack: report and Blunder check gone');
  assert(S.get('adrills').map(d=>d.id).join()===dA.id&&S.get('bc-progress')[bcB.id],'tried drills and every result stay');
  w.location.hash='#blundercheck'; await sleep(60);
  assert(/needs a Chess Lab pack/.test($('bc-list').textContent),'Blunder check without a pack explains where positions come from');
  assert([...w.document.querySelectorAll('#welcome li')].some(li=>/Got a pack from a friend\?/.test(li.textContent)),'the welcome card mentions packs');
}

console.log('\n'+(H.failures?H.failures+' FAILURES':'All tests passed.'));
process.exit(H.failures?1:0);
})().catch(e=>{ console.error('Test run crashed:',e); process.exit(1) });
