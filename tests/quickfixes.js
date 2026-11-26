/* The 26 Nov 2026 quick fixes (roadmap rows #257, #258, #287, #288, #265, #263, #264), one section each. */
'use strict';

module.exports=async H=>{
  const {makePage,sleep,assert,section}=H;

  section('t90: Next moves past the item on the board, in the filtered list (Drills, Tactics; roadmap #257)');
  {
    const {w}=await makePage({analyse:async()=>[{uci:'e1g1',cp:0.4,mate:null}]});
    const fen='r1bqkb1r/1ppp1ppp/p1n2n2/4p3/B3P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 5';
    const drill=(id,o={})=>Object.assign({id,fen,played:'Ke2',playedUci:'e1e2',best:'e1g1',drop:0.35,date:'2026-11-01',opp:'Opp '+id,site:'lichess',color:'w',v:1},o);
    w.Store.put('adrills',[drill('a00000001'),drill('a00000002'),drill('a00000003',{kind:'punish',oppMove:'Nd4'}),drill('a00000004')]);
    w.location.hash='#drills'; await sleep(60);
    const D=w.DrillsTab, S=D.state;
    D.load(w.Store.get('adrills')[0]); await D.userMove('h2','h4'); await sleep(30);   /* a miss on the first drill */
    D.next(); await sleep(10);
    assert(S.cur.id==='a00000002','after a miss, Next goes to the next drill (it reloaded the missed one)');
    D.next(); await sleep(10);
    assert(S.cur.id==='a00000003','an untried drill can be skipped with Next');
    D.next(); D.next(); await sleep(10);
    assert(S.cur.id==='a00000001','Next wraps round to the missed drill at the end');
    S.kind='punish'; D.refresh(); D.next(); await sleep(10);
    assert(S.cur.id==='a00000003','Next follows the filters (Type: Punish)');
    D.next(); await sleep(10);
    assert(S.cur.id==='a00000003','the only drill the filters leave stays on the board');
    S.kind='all'; D.refresh();

    w.location.hash='#tactics'; await w.TacticsTab.ensure(); await sleep(30);
    const T=w.TacticsTab, TS=T.state;
    const a=TS.cur&&TS.cur.id; T.next(); await sleep(10);
    const b=TS.cur&&TS.cur.id;
    assert(a&&b&&a!==b,'an untried puzzle can be skipped: Next opens another one');
    T.next(); await sleep(10);
    assert(TS.cur.id!==a&&TS.cur.id!==b,'and the next one after that (it kept coming back to the first)');
    const ids=new Set(T.filtered().map(z=>z.id));
    assert(ids.has(TS.cur.id),'Next stays inside the filtered list');
    /* solve the puzzle on the board: the Unsolved filter now leaves it out, and Next still goes on from its place */
    const c=TS.cur; T.saveResult(c.id,true); T.next(); await sleep(10);
    assert(TS.cur.id!==c.id&&TS.cur.id!==a&&TS.cur.id!==b,'after a solve, Next goes on from there (not back to the top)');
  }
  section('t91: the result says what was recorded and when it comes back (Drills, Endgames, Blind tactics; roadmap #258)');
  {
    const {w}=await makePage({analyse:async()=>[{uci:'e1g1',cp:0.4,mate:null}]});
    const fen='r1bqkb1r/1ppp1ppp/p1n2n2/4p3/B3P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 5';
    const drill=id=>({id,fen,played:'Ke2',playedUci:'e1e2',best:'e1g1',drop:0.35,date:'2026-11-01',opp:'Opp',site:'lichess',color:'w',v:1});
    w.Store.put('adrills',[drill('a00000011'),drill('a00000012'),drill('a00000013')]);
    w.Store.put('adrills-progress',{a00000012:{tries:1,ok:true,okN:1,t:Date.now()-4*864e5}});
    w.location.hash='#drills'; await sleep(60);
    const D=w.DrillsTab, $=id=>w.document.getElementById(id), bar=id=>{ const b=$(id).nextElementSibling; return b&&b.classList.contains('endbar')?b.textContent:'' };
    const open=id=>D.load(w.Store.get('adrills').find(x=>x.id===id));
    open('a00000011'); await D.userMove('e1','g1'); await sleep(20);
    assert(/Solved, back in 3 days/.test(bar('d-board'))&&/Solved: back in 3 days/.test($('d-status').textContent),'Drills: a first solve says "Solved, back in 3 days" on the strip and the card');
    open('a00000012'); await D.userMove('e1','g1'); await sleep(20);
    assert(/back in 7 days/.test(bar('d-board')),'a second solve in a row: back in 7 days');
    open('a00000013'); await D.show(); await sleep(20);
    assert(/Missed, back tomorrow/.test(bar('d-board'))&&/back tomorrow/.test($('d-status').textContent),'a shown Solution: missed, back tomorrow');

    /* Blind tactics (shared/blind.js): a clean solve, then a give-up */
    w.location.hash='#blind'; await sleep(400);
    const T=w.BlindTab.api, S=T.state;
    const z1=S.cur; for(let i=0;i<z1.sol.length;i+=2){ T.submit(z1.sol[i]); await sleep(420) }
    const bl=()=>{ const e=w.document.querySelector('#blind .endbar'); return e?e.textContent:'' };
    assert(S.solved&&/first try · solved, back in 3 days/.test(bl())&&/Solved: back in 3 days/.test(w.document.querySelector('#bl-root .status').textContent),'Blind tactics: a clean solve says "solved, back in 3 days"');
    T.next(); await sleep(10); T.giveUp(); await sleep(20);
    assert(/Given up · missed, back tomorrow/.test(bl()),'a give-up says "missed, back tomorrow"');
  }
  {
    /* Endgames: a held draw (the live tablebase grades it), then a slip */
    const DATA={groups:[{id:'pawn',name:'King and pawn'}],positions:[
      {id:'t-hold',group:'pawn',title:'Test hold',fen:'8/8/4k3/8/4PK2/8/8/8 b - - 0 1',goal:'draw',end:'hold:1',text:'',tb:{cat:'draw'},line:[],nodes:{}}]};
    let w0=null;
    const {w}=await makePage({fetch:async url=>{
      if(/data\/endgames\.json/.test(url)) return {ok:true,status:200,json:async()=>DATA};
      if(/tablebase\.lichess\.ovh/.test(url)){ const f=decodeURIComponent(url.split('fen=')[1]); const gg=new w0.Chess(f);
        const ms=gg.moves({verbose:true}).map(m=>({uci:m.from+m.to,category:m.to==='f6'?'draw':m.to==='d6'?'win':'loss',dtz:5,dtm:15}));
        ms.sort((a,b)=>(a.category==='loss'?0:1)-(b.category==='loss'?0:1));
        return {ok:true,status:200,json:async()=>({category:'draw',moves:ms})} }
      return null }, beforeLoad:x=>{ w0=x }});
    const E=w.EndgamesTab; w.location.hash='#endgames'; await sleep(80);
    const bar=()=>w.document.querySelector('#endgames .endbar').textContent, st=()=>w.document.getElementById('eg-status').textContent;
    E.load(E.byId('t-hold')); await E.userMove('e6','f6'); await sleep(400);
    assert(/Solved, back in 3 days/.test(bar())&&/Solved: back in 3 days/.test(st()),'Endgames: a solve says "Solved, back in 3 days"');
    E.load(E.byId('t-hold')); await E.userMove('e6','d6'); await sleep(400);
    assert(/Counted as a miss: back tomorrow/.test(st()),'a slip says it was counted as a miss, back tomorrow');
  }
  section('t92: Calculation — a Stockfish check still running when you move on is dropped (roadmap #263)');
  {
    let slow=300;
    const {w}=await makePage({analyse:async()=>{ await sleep(slow); return [{uci:'x',cp:-9,mate:null}] }});
    w.location.hash='#calc'; await sleep(60);
    for(let i=0;i<40&&!(w.CalcTab.lib||[]).length;i++) await sleep(100);
    const C=w.CalcTab, S=C.state, rec=id=>(w.Store.get('calc-progress')||{})[id];
    /* a legal first move that isn't the solution's: Stockfish is asked */
    const wrongFirst=z=>{ C.load(z); const g=new w.Chess(S.start); const m=g.moves({verbose:true}).find(x=>x.from+x.to!==z.moves[1].slice(0,4)); C.userMove(m.from,m.to,m.promotion) };
    const [z1,z2,z3]=C.lib.slice(0,3);
    wrongFirst(z1); const p=C.submit(); await sleep(50);
    assert(/Checking your first move/.test(w.document.getElementById('cc-status').textContent),'a different first move is checked by Stockfish');
    C.next(); const now=S.cur; await p; await sleep(30);
    assert(!rec(z1.id),'Next during the check: nothing is saved for the old exercise');
    assert(S.cur===now&&now!==z1&&!S.sub&&!S.busy&&!/Solution/.test(w.document.getElementById('cc-line').textContent),'the new exercise is still open to play (not locked, no solution shown)');
    wrongFirst(z2); const p2=C.submit(); await sleep(50); C.lobby();
    let err=null; try{ await p2; await sleep(30) }catch(e){ err=e }
    assert(!err&&!rec(z2.id)&&!w.document.getElementById('cc-lobby').hidden,'Back to the list during the check: no error, nothing saved, the list stays');
    wrongFirst(z3); const p3=C.submit(); await sleep(50); C.load(z3); await p3; await sleep(30);
    assert(!rec(z3.id)&&!S.sub,'the same exercise opened again: the old check is dropped too');
    slow=0; wrongFirst(z3); await C.submit(); await sleep(30);
    assert(rec(z3.id)&&rec(z3.id).tries===1&&S.sub,'a check left to finish still scores');
  }
  section('t94: Today — the opening line ticks when that opening is played as the other side (roadmap #264)');
  {
    const {w}=await makePage({analyse:async()=>[{uci:'g1f3',cp:0.3,mate:null}]});
    const O=w.OpeningsTab, S=O.state;
    w.Store.put('oas',{'preset-english':'black'});   /* Play as Black on the English */
    const t=w.TodayTab.plan(); t.opening='preset-english'; w.Store.put('today',t);
    const op=()=>w.TodayTab.items().find(x=>x.kind==='opening');
    assert(op()&&!op().done,'the English is today’s opening line, not done yet');
    /* a line as Black: 1.c4 is played for White, you answer 1…e5, then end the line */
    O.selectOpening('preset-english'); for(let i=0;i<80&&!(S.phase==='await'&&!S.busy&&S.g.turn()==='b');i++) await sleep(25);
    assert(O.SID()==='preset-english@black','the trainer plays it as Black (stats-preset-english@black)');
    await O.userMove('e7','e5'); for(let i=0;i<80&&!(S.phase==='await'&&!S.busy&&S.g.turn()==='b');i++) await sleep(25);
    O.endHere(); await sleep(150);
    const bs=O.stats('preset-english@black'), base=O.stats('preset-english');
    assert(bs.last&&op().done,'Today ticks the line played as Black (it read the White stats)');
    assert(bs.history.length&&typeof bs.history[bs.history.length-1].e==='number'&&!base.history.length,'the line’s eval is kept with the Black stats, not the White ones');
    assert(O.sidOf(O.openings().find(o=>o.id==='preset-english'))==='preset-english@black'&&O.statsAs(O.openings().find(o=>o.id==='preset-english'))===O.stats('preset-english@black')||O.statsAs(O.openings().find(o=>o.id==='preset-english')).last===bs.last,'Today reads the side the opening is played as now');
  }
};
