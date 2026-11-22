#!/usr/bin/env node
/* Think Ahead — the Apple Watch sets for the public app (suhaasnara/chess-lab-open-app, docs/01-design.md §2.1, §2.4).

   Turns three of this site's puzzle files into the sets the watch app carries, with chess.js (site/vendor/chess.js), so
   the watch never has to turn moves into text:
     site/data/tactics.json -> tactics.json   {id, fen, r, m, u, s}
     site/data/calc.json    -> calc.json      {id, fen, r, m, u, s}
     site/data/blind.json   -> blind.json     {id, fen, r, m, hu, hs, u, s}
   Every line is one string of moves separated by spaces (u, hu: UCI; s, hs: SAN), a fifth smaller than JSON arrays.
   Tactics and Calculation: fen is Lichess's (before the opponent's setup move); u[0] is that setup move, as on this site.
   Blind tactics: fen is 16 plies before the puzzle; hu / hs are the 16 hidden moves (the last one is the opponent's move
   that sets the puzzle); u / s are the solution from the real position (your move first). r is the Lichess rating, m
   the motif. Ids are this site's ids: the watch's results are recorded under them (js/native.js).

   No legal-move lists and no mate alternatives: the watch has its own move generator (the app's Board.swift). To keep
   the two generators honest, a test fixture (never shipped) holds chess.js's FEN and legal moves for every position
   along every line; the watch's Swift tests replay the sets and must match it exactly.

   Each set file says which sets version it belongs to: "open-<commit>-<first 8 hex of the sets' SHA-256>", and `made`,
   the Open commit's time (ms): the watch keeps the newer of two versions by `made`. The same data gives the same
   version and the same bytes.

   Usage: node tools/build_watch_sets.js [--out build/watch-sets] [--fixture build/watch-sets-fixture.json] [--no-fixture]
   Any move that isn't legal, or a SAN that doesn't match chess.js, stops the build (exit 1). Prints sizes; fails over
   the budget (4 MB for the three sets). */
'use strict';
const fs=require('fs'), path=require('path'), crypto=require('crypto'), {execFileSync}=require('child_process');
const ROOT=path.join(__dirname,'..');
const {Chess}=require(path.join(ROOT,'site','vendor','chess.js'));

const BUDGET=4*1024*1024;
const FILES={tactic:'tactics.json',calc:'calc.json',blind:'blind.json'};
const uciOf=m=>m.from+m.to+(m.promotion||'');
const sha256=b=>crypto.createHash('sha256').update(b).digest('hex');
const legal=g=>g.moves({verbose:true}).map(uciOf).sort().join(' ');

/* play one UCI move; null if it isn't legal */
function playUci(g,u){
  if(!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(u)) return null;
  return g.move({from:u.slice(0,2),to:u.slice(2,4),promotion:u[4]||undefined});
}

/* one line of UCI moves from fen -> {s, positions}; throws on an illegal move. positions: [fen, legal] before each
   move and after the last, for the fixture */
function lineFromUci(fen,ucis,where,fix){
  const g=new Chess();
  if(!g.load(fen)) throw new Error(where+': bad FEN '+fen);
  const s=[], pos=[];
  ucis.forEach((u,i)=>{
    if(fix) pos.push([g.fen(),legal(g)]);
    const m=playUci(g,u); if(!m) throw new Error(`${where}: move ${i+1} (${u}) isn't legal in ${g.fen()}`);
    if(uciOf(m)!==u) throw new Error(`${where}: move ${i+1} (${u}) plays as ${uciOf(m)}`);
    s.push(m.san);
  });
  if(fix) pos.push([g.fen(),legal(g)]);
  return {s,pos,g};
}

function tacticLike(z,where,fix){
  const {s,pos}=lineFromUci(z.fen,z.moves,where,fix);
  return {item:{id:String(z.id),fen:z.fen,r:z.rating|0,m:z.motif||'',u:z.moves.join(' '),s:s.join(' ')},pos};
}

function blindItem(z,where,fix){
  const g=new Chess(); if(!g.load(z.fen)) throw new Error(where+': bad FEN '+z.fen);
  if(!Array.isArray(z.hidden)||z.hidden.length!==16) throw new Error(where+': expected 16 hidden moves, has '+(z.hidden||[]).length);
  const hu=[], hs=[], pos=[];
  z.hidden.forEach((san,i)=>{
    if(fix) pos.push([g.fen(),legal(g)]);
    const m=g.move(san); if(!m) throw new Error(`${where}: hidden move ${i+1} (${san}) isn't legal in ${g.fen()}`);
    if(m.san!==san) throw new Error(`${where}: hidden move ${i+1} is ${san} in the data, ${m.san} by chess.js`);
    hu.push(uciOf(m)); hs.push(m.san);
  });
  const sol=lineFromUci(g.fen(),z.sol,where+' solution',fix);
  return {item:{id:String(z.id),fen:z.fen,r:z.rating|0,m:z.motif||'',hu:hu.join(' '),hs:hs.join(' '),u:z.sol.join(' '),s:sol.s.join(' ')},pos:pos.concat(sol.pos)};
}

/* data: {tactics, calc, blind} as in site/data; commit: Open's short commit; made: its time (ms).
   -> {sets: {tactic, calc, blind} (the file objects), version, fixture (or null), counts} */
function build(data,{commit='nogit',made=0,fixture=true}={}){
  const items={tactic:[],calc:[],blind:[]}, fx=[];
  const seen=new Set();
  const add=(type,list,fn)=>{
    if(!Array.isArray(list)||!list.length) throw new Error(type+': no puzzles in the data');
    for(const z of list){
      const where=`${type} ${z&&z.id}`;
      if(!z||!z.id) throw new Error(type+': a puzzle without an id');
      if(seen.has(type+' '+z.id)) throw new Error(where+': id used twice');
      seen.add(type+' '+z.id);
      const {item,pos}=fn(z,where,fixture);
      items[type].push(item); if(fixture) fx.push([type,item.id,pos]);
    }
  };
  add('tactic',data.tactics,tacticLike);
  add('calc',data.calc,tacticLike);
  add('blind',data.blind,blindItem);
  const version=`open-${commit}-${sha256(JSON.stringify(items)).slice(0,8)}`;
  const sets={};
  for(const t in items) sets[t]={v:1,type:t,sets:version,made,n:items[t].length,source:'Lichess puzzles (CC0), via Chess Lab Open',items:items[t]};
  return {sets,version,fixture:fixture?{v:1,sets:version,about:'Test fixture for the watch app: chess.js FEN and legal moves (UCI, sorted) before each move of every line and after the last. Never shipped.',items:fx}:null,
    counts:Object.fromEntries(Object.entries(items).map(([t,l])=>[t,l.length]))};
}

function git(args){ try{ return execFileSync('git',args,{cwd:ROOT,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim() }catch(e){ return null } }

function main(argv){
  const arg=(k,d)=>{ const i=argv.indexOf(k); return i<0?d:argv[i+1] };
  const out=path.resolve(arg('--out',path.join(ROOT,'build','watch-sets')));
  const fixPath=argv.includes('--no-fixture')?null:path.resolve(arg('--fixture',path.join(ROOT,'build','watch-sets-fixture.json')));
  const read=f=>JSON.parse(fs.readFileSync(path.join(ROOT,'site','data',f),'utf8'));
  let commit=git(['rev-parse','--short=7','HEAD'])||'nogit';
  const made=(+git(['log','-1','--format=%ct'])||0)*1000;
  /* data or this builder changed since the commit: the version says so, so it can't pass for the commit's sets */
  if(commit!=='nogit'&&git(['status','--porcelain','--','site/data/tactics.json','site/data/calc.json','site/data/blind.json','site/vendor/chess.js','tools/build_watch_sets.js'])) commit+='+dirty';
  const t0=Date.now();
  const r=build({tactics:read('tactics.json'),calc:read('calc.json'),blind:read('blind.json')},{commit,made,fixture:!!fixPath});
  fs.mkdirSync(out,{recursive:true});
  const manifest={v:1,sets:r.version,made,commit,files:{}};
  let total=0;
  for(const t in FILES){
    const b=Buffer.from(JSON.stringify(r.sets[t]));
    fs.writeFileSync(path.join(out,FILES[t]),b); total+=b.length;
    manifest.files[FILES[t]]={type:t,n:r.counts[t],bytes:b.length,sha256:sha256(b)};
  }
  fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,1)+'\n');
  const kb=n=>(n/1024).toFixed(0)+' KB';
  console.log(`Watch sets ${r.version} (${((Date.now()-t0)/1000).toFixed(1)} s) -> ${path.relative(process.cwd(),out)||'.'}`);
  for(const f in manifest.files){ const x=manifest.files[f]; console.log(`  ${f.padEnd(13)} ${String(x.n).padStart(6)} puzzles  ${kb(x.bytes).padStart(8)}`) }
  console.log(`  ${'total'.padEnd(13)} ${' '.repeat(15)}  ${kb(total).padStart(8)}  (budget ${kb(BUDGET)})`);
  if(fixPath){ fs.mkdirSync(path.dirname(fixPath),{recursive:true}); const b=Buffer.from(JSON.stringify(r.fixture));
    fs.writeFileSync(fixPath,b); console.log(`  fixture (not shipped): ${r.fixture.items.length} lines, ${kb(b.length)} -> ${path.relative(process.cwd(),fixPath)}`) }
  if(total>BUDGET){ console.error(`Over budget: ${kb(total)} > ${kb(BUDGET)}`); return 1 }
  return 0;
}

module.exports={build,BUDGET,FILES};
if(require.main===module){
  try{ process.exit(main(process.argv.slice(2))) }catch(e){ console.error('build_watch_sets: '+e.message); process.exit(1) }
}
