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
};
