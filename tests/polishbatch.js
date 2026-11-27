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
};
