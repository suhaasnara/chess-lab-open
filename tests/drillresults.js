/* Drills: one result per attempt (the pre-TestFlight review, 23 Nov 2026). A wrong try, a Hint or the shown Solution
   is a miss (back tomorrow, okN back to 0), and finding the move afterwards doesn't turn it into a solve. A Stockfish
   check that ends after you moved on to another drill is dropped instead of landing on that one. */
'use strict';

module.exports=async H=>{
  const {makePage,sleep,assert,section}=H;

  section('t86: Drills — the first thing you do decides the result');
  let slow=0;
  const {w}=await makePage({analyse:async(fen,depth,mpv)=>{ if(slow) await sleep(slow);
    return mpv>=3?[{uci:'e1g1',cp:0.4,mate:null},{uci:'d2d3',cp:0.35,mate:null},{uci:'h2h3',cp:-0.2,mate:null}]:[{uci:'e1g1',cp:0.4,mate:null}] }});
  const fen='r1bqkb1r/1ppp1ppp/p1n2n2/4p3/B3P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 5';
  const drill=(id,o={})=>Object.assign({id,fen,played:'Ke2',playedUci:'e1e2',best:'e1g1',drop:0.35,date:'2026-11-01',opp:'Opp '+id,site:'lichess',color:'w',v:1},o);
  w.Store.put('adrills',[drill('a00000001'),drill('a00000002'),drill('a00000003'),drill('a00000004',{best:null}),drill('a00000005',{best:null})]);
  w.location.hash='#drills'; await sleep(60);   /* on the Drills tab itself (Today hosts the panel through its own flow) */
  const D=w.DrillsTab, S=D.state, rec=id=>(w.Store.get('adrills-progress')||{})[id];
  const open=id=>{ D.load(w.Store.get('adrills').find(x=>x.id===id)) };
  const endbar=()=>{ const b=w.document.getElementById('d-board').nextElementSibling; return b&&b.classList.contains('endbar')?b.textContent:'' };

  /* a wrong try (a move the engine finds much weaker), then the right one */
  open('a00000001'); await D.userMove('h2','h4'); await sleep(30);
  assert(rec('a00000001').ok===false&&rec('a00000001').okN===0,'a wrong try is a miss');
  await D.userMove('e1','g1'); await sleep(30);
  assert(rec('a00000001').ok===false&&rec('a00000001').tries===1,'finding it afterwards keeps the miss (one result per attempt)');
  assert(!/Solved/.test(endbar())&&/back tomorrow/.test(endbar()),'the banner doesn’t say Solved');

  /* the Solution shown, then played */
  open('a00000002'); await D.show(); await sleep(30); await D.userMove('e1','g1'); await sleep(30);
  assert(rec('a00000002').ok===false&&rec('a00000002').tries===1,'Solution, then the move: a miss');

  /* a Hint, then the move */
  open('a00000003'); await D.hint(); await sleep(30); await D.userMove('e1','g1'); await sleep(30);
  assert(rec('a00000003').ok===false,'Hint, then the move: a miss');

  /* a solved drill missed at its review starts the 3, 7, 21 days again */
  const p=w.Store.get('adrills-progress'); p.a00000003={tries:3,ok:true,okN:2,t:Date.now()-8*864e5}; w.Store.put('adrills-progress',p);
  open('a00000003'); await D.userMove('h2','h4'); await sleep(30);
  assert(rec('a00000003').ok===false&&rec('a00000003').okN===0&&rec('a00000003').tries===4,'a missed review: back tomorrow, okN back to 0');
  open('a00000003'); await D.userMove('e1','g1'); await sleep(30);
  assert(rec('a00000003').ok===true&&rec('a00000003').okN===1,'and the next solve starts the reviews again');

  /* a check still running when another drill opens (no stored best move, so the engine judges the move) */
  slow=400; open('a00000004'); const pending=D.userMove('e1','g1'); await sleep(50);
  open('a00000005'); await pending; await sleep(500);
  assert(!rec('a00000004')&&!rec('a00000005'),'a check that ends after you moved on saves nothing, on either drill');
  assert(S.cur.id==='a00000005'&&!S.done&&!S.busy,'the drill you moved on to is still yours to try');
  slow=0; await D.userMove('e1','g1'); await sleep(50);
  assert(rec('a00000005')&&rec('a00000005').ok===true,'… and solving it counts');
};
