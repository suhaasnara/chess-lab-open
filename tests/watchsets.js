/* Tests for tools/build_watch_sets.js, the Apple Watch sets of the public app: on the real data every move is legal
   and every SAN matches chess.js (the build would throw otherwise), nothing is dropped, the ids are this site's, the
   sets fit the budget, the same data gives the same bytes; the fixture follows each line; bad data stops the build. */
'use strict';
const path=require('path'), fs=require('fs');

module.exports=async H=>{
  const {assert,section}=H;
  const {build,BUDGET}=require('../tools/build_watch_sets.js');
  const {Chess}=require('../site/vendor/chess.js');
  const read=f=>JSON.parse(fs.readFileSync(path.join(H.SITE,'data',f),'utf8'));
  const data={tactics:read('tactics.json'),calc:read('calc.json'),blind:read('blind.json')};
  const throws=(fn,re)=>{ try{ fn(); return false }catch(e){ return re.test(e.message) } };
  const sp=s=>s?s.split(' '):[];

  section('t75: the Apple Watch sets (tools/build_watch_sets.js) from the real data');
  {
    const t0=Date.now();
    const r=build(data,{commit:'abc1234',made:1763280000000,fixture:false});   /* throws on any illegal move or SAN mismatch */
    assert(true,`all ${r.counts.tactic+r.counts.calc+r.counts.blind} puzzles built: every move legal, every SAN as chess.js writes it (${((Date.now()-t0)/1000).toFixed(1)} s)`);
    assert(r.counts.tactic===data.tactics.length&&r.counts.calc===data.calc.length&&r.counts.blind===data.blind.length,
      `nothing dropped: ${r.counts.tactic} tactics, ${r.counts.calc} calculation, ${r.counts.blind} blind`);
    assert(/^open-abc1234-[0-9a-f]{8}$/.test(r.version)&&['tactic','calc','blind'].every(t=>r.sets[t].sets===r.version&&r.sets[t].made===1763280000000&&r.sets[t].v===1),
      'every set file carries the same version ('+r.version+') and the commit time');
    assert(r.sets.tactic.items.every((x,i)=>x.id===data.tactics[i].id&&x.fen===data.tactics[i].fen&&x.r===data.tactics[i].rating&&x.u===data.tactics[i].moves.join(' '))&&
           r.sets.calc.items.every((x,i)=>x.id===data.calc[i].id&&x.u===data.calc[i].moves.join(' '))&&
           r.sets.blind.items.every((x,i)=>x.id===data.blind[i].id&&x.hs===data.blind[i].hidden.join(' ')&&x.u===data.blind[i].sol.join(' ')),
      "ids, positions, ratings and moves are this site's own (watch results are recorded under the same ids)");
    const all=[...r.sets.tactic.items,...r.sets.calc.items,...r.sets.blind.items];
    assert(all.every(x=>sp(x.u).length===sp(x.s).length&&(!x.hu||sp(x.hu).length===16&&sp(x.hs).length===16)),'one SAN for every UCI move; 16 hidden moves in every Blind puzzle');
    const bytes=['tactic','calc','blind'].reduce((n,t)=>n+Buffer.byteLength(JSON.stringify(r.sets[t])),0);
    assert(bytes<=BUDGET,`the three sets fit the budget: ${(bytes/1024).toFixed(0)} KB of ${(BUDGET/1024).toFixed(0)} KB`);
    /* spot checks against chess.js, independent of the builder's own code path */
    const z=r.sets.tactic.items.find(x=>x.id==='00FF5');
    assert(z&&z.s==='Qh4 Bxf7+ Ke7 Bxh5'&&z.m==='attackingF2F7','a known tactic (00FF5): Qh4 Bxf7+ Ke7 Bxh5');
    const b=r.sets.blind.items[0], g=new Chess(b.fen); sp(b.hu).forEach(u=>g.move({from:u.slice(0,2),to:u.slice(2,4),promotion:u[4]}));
    const first=sp(b.u)[0];
    assert(g.moves({verbose:true}).some(m=>m.from+m.to+(m.promotion||'')===first),'Blind: the hidden UCI moves lead to the real position, where the solution starts');
  }

  section('t76: the watch sets: same data, same bytes; the fixture follows every line');
  {
    const small={tactics:data.tactics.slice(0,40),calc:data.calc.slice(0,10),blind:data.blind.slice(0,10)};
    const a=build(small,{commit:'abc1234',made:1}), b=build(small,{commit:'abc1234',made:1});
    assert(JSON.stringify(a.sets)===JSON.stringify(b.sets)&&a.version===b.version,'a rebuild gives the same bytes and version');
    const c=build({...small,tactics:small.tactics.slice(1)},{commit:'abc1234',made:1});
    assert(c.version!==a.version,'different data, a different version');
    assert(a.fixture.items.length===60&&a.fixture.sets===a.version,'the fixture has one entry per puzzle, for the same version');
    const ok=a.fixture.items.every(([type,id,pos])=>{
      const x=a.sets[type].items.find(y=>y.id===id), line=type==='blind'?[...sp(x.hu),...sp(x.u)]:sp(x.u);
      if(pos.length!==line.length+1) return false;
      const g=new Chess(x.fen);
      return line.every((u,i)=>{ const [fen,leg]=pos[i]; const fine=fen===g.fen()&&leg.split(' ').includes(u);
        g.move({from:u.slice(0,2),to:u.slice(2,4),promotion:u[4]}); return fine })&&pos[line.length][0]===g.fen();
    });
    assert(ok,"each fixture position is chess.js's FEN before that move, and its legal moves include the move played");
    const mates=a.fixture.items.filter(([type,id,pos])=>new Chess(pos[pos.length-1][0]).in_checkmate());
    assert(mates.length>0&&mates.every(([,,pos])=>pos[pos.length-1][1]===''),`after a mate the fixture lists no legal moves (${mates.length} lines end in mate)`);
  }

  section('t77: the watch sets: bad data stops the build');
  {
    const T=data.tactics[0], B=data.blind[0];
    const one=(t,c,b)=>()=>build({tactics:t||[T],calc:c||[data.calc[0]],blind:b||[B]},{fixture:false});
    assert(throws(one([{...T,moves:[T.moves[0],'a1a8']}]),/isn't legal/),'an illegal move in a tactic');
    assert(throws(one(null,null,[{...B,hidden:B.hidden.slice(0,15)}]),/16 hidden/),'a Blind puzzle without 16 hidden moves');
    const h=B.hidden[15], wrong=/[+#]$/.test(h)?h.slice(0,-1):h+'+';   /* chess.js accepts the move but writes it differently */
    assert(throws(one(null,null,[{...B,hidden:[...B.hidden.slice(0,15),wrong]}]),/in the data/),`a hidden move whose SAN differs from chess.js (${wrong} for ${h})`);
    assert(throws(one([T,T]),/twice/),'an id used twice');
    assert(throws(one([{...T,fen:'not a fen'}]),/bad FEN/),'a bad FEN');
    assert(throws(one(null,null,[]),/no puzzles/),'an empty set');
  }
};
