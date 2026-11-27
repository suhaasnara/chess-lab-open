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
};
