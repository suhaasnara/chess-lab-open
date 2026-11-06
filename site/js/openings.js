/* Chess Lab Open — the opening trainer.
   Presets train you against the elite book (or a club band: the Opponent slider);
   imported repertoires (paste your own PGN) are the answer key, the opponent plays
   the book's replies among your file's moves. Rating v2: each move is a "game"
   against a difficulty from the masters' share of the right move(s). */
'use strict';
(function(){
const START='rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const PRESETS=[
  {id:'preset-italian',name:'Italian Game',side:'white',moves:['e4','e5','Nf3','Nc6','Bc4']},
  {id:'preset-spanish',name:'Ruy Lopez (Spanish)',side:'white',moves:['e4','e5','Nf3','Nc6','Bb5']},
  {id:'preset-najdorf',name:'Sicilian Najdorf',side:'black',moves:['e4','c5','Nf3','d6','d4','cxd4','Nxd4','Nf6','Nc3','a6']},
  {id:'preset-french',name:'French Defence',side:'black',moves:['e4','e6']},
  {id:'preset-caro',name:'Caro-Kann',side:'black',moves:['e4','c6']},
  {id:'preset-qgd',name:"Queen's Gambit Declined",side:'black',moves:['d4','d5','c4','e6']},
  {id:'preset-kid',name:"King's Indian Defence",side:'black',moves:['d4','Nf6','c4','g6']},
  {id:'preset-english',name:'English Opening',side:'white',moves:['c4']},
  {id:'preset-scotch',name:'Scotch Game',side:'white',moves:['e4','e5','Nf3','Nc6','d4']},
  {id:'preset-london',name:'London System',side:'white',moves:['d4','d5','Bf4']},
];
const LENS={short:5,medium:8,long:12,vlong:20,max:30};
const R2_START=1800, R2_PROV=8;

/* ---------- Imported repertoires ---------- */
function repIndex(){ return Store.get('reps-index')||[] }
function repData(id){ const d=Store.get('rep-'+id); if(!d) return null;
  const m=new Map(); for(const k in d.pos) m.set(k,d.pos[k].split(' ')); return m }
const REPMAPS=new Map();
function repMap(id){ if(!REPMAPS.has(id)) REPMAPS.set(id,repData(id)); return REPMAPS.get(id) }

/* Parse a PGN with variations into {posId: [uci...]} (both sides' moves). */
function parseRepPGN(text){
  const clean=text.replace(/\{[^}]*\}/g,' ').replace(/\$\d+/g,' ').replace(/;[^\n]*/g,' ');
  const games=clean.split(/(?=\[Event )/).filter(s=>s.replace(/\[[^\]]*\]/g,'').trim());
  const pos={}; let moves=0;
  const add=(fen,mv)=>{ const k=posId(normKey(fen)); const u=mv.from+mv.to+(mv.promotion||'');
    pos[k]=pos[k]||[]; if(!pos[k].includes(u)){ pos[k].push(u); moves++ } };
  for(const gtext of games){
    const body=gtext.replace(/\[[^\]]*\]\s*/g,'');
    const toks=body.match(/\(|\)|[^\s()]+/g)||[];
    const stack=[]; let g=new Chess();
    const rebuild=hist=>{ const n=new Chess(); for(const mv of hist) n.move(mv); return n };
    for(const t of toks){
      if(t==='('){ stack.push(g.history({verbose:true})); g.undo(); continue }   /* a variation branches from before the last move */
      if(t===')'){ const h=stack.pop(); if(h) g=rebuild(h); continue }
      if(/^(1-0|0-1|1\/2-1\/2|\*)$/.test(t)) continue;
      const san=t.replace(/^\d+\.+/,'').replace(/^\.+/,'');
      if(!san) continue;
      const fen=g.fen(); const m=g.move(san,{sloppy:true});
      if(m) add(fen,m);
    }
  }
  if(!moves) throw new Error('No moves found in that PGN.');
  return {pos,positions:Object.keys(pos).length,moves};
}

/* ---------- State ---------- */
const S={op:null,g:null,phase:'idle',busy:false,log:[],userMoves:0,misses:[],scored:[],hintStage:0,
  startRating:0,recent:{},fens:[],endMsg:''};
let board=null;

const side=()=>S.op?S.op.side:'white';
const myColor=()=>side()==='white'?'w':'b';
const training=()=>Settings.get('omode')==='training';
const lineMax=()=>LENS[Settings.get('olen')]||12;

function stats(id){ const s=deep(Store.get('stats-'+id))||{};
  const r=Object.assign({rating:R2_START,lines:0,history:[],n2:0},s);
  if(!Array.isArray(r.history)) r.history=[]; return r }
const saveStats=(id,s)=>Store.put('stats-'+id,s);

/* How hard the right move is to find here (masters' share of the good moves). */
async function moveDifficulty(fen,good){
  const bk=await Book.moves(fen,'masters');
  if(!bk||bk.demo||bk.total<20) return 2350;
  const p=good&&good.length
    ?bk.rows.filter(r=>good.some(u=>u.slice(0,4)===r.uci.slice(0,4))).reduce((a,r)=>a+r.share,0)
    :Math.max(...bk.rows.map(r=>r.share));
  if(p<=0) return 2350; const q=Math.min(0.97,Math.max(0.03,p));
  return Math.round(Math.max(1600,Math.min(2600,2200+400*Math.log10((1-q)/q))));
}

/* ---------- Openings list ---------- */
function openings(){
  const reps=repIndex().map(r=>({...r,rep:true}));
  return [...reps,...PRESETS];
}
function renderList(filter=''){
  const el=$('o-list'); el.innerHTML='';
  const f=filter.toLowerCase();
  for(const o of openings()){
    if(f&&!(o.name.toLowerCase().includes(f)||o.side.includes(f)||(o.rep?'repertoire':'preset').includes(f))) continue;
    const st=stats(o.id);
    const b=document.createElement('button'); b.className='drill'; b.setAttribute('aria-current',S.op&&S.op.id===o.id?'true':'false');
    b.innerHTML=`<span class="src">${o.rep?'Rep':'Book'}</span><span><span class="opp">${esc(o.name)}</span><br><span class="meta">${o.side==='white'?'White':'Black'}${st.lines?` · ${st.lines} lines · ${st.rating}`:''}</span></span><span class="evalchip">${o.rep?'&#9654;':'&#9654;'}</span>`;
    b.addEventListener('click',()=>{ selectOpening(o.id); $('o-pop').hidden=true; $('o-pick').setAttribute('aria-expanded','false') });
    el.appendChild(b);
  }
  if(!el.children.length) el.innerHTML='<p class="empty">Nothing matches. Import a repertoire below.</p>';
}
function selectOpening(id){
  const o=openings().find(x=>x.id===id); if(!o) return;
  S.op=o; $('o-pickname').textContent=o.name;
  newLine();
}

/* ---------- Line play ---------- */
function newLine(){
  if(!S.op) return;
  S.g=new Chess(); S.phase='await'; S.busy=false; S.log=[]; S.userMoves=0; S.misses=[]; S.scored=[]; S.hintStage=0; S.fens=[START]; S.endMsg='';
  S.startRating=stats(S.op.id).rating;
  for(const san of (S.op.moves||[])){ const m=S.g.move(san); if(m){ S.log.push({san:m.san,uci:m.from+m.to+(m.promotion||''),who:'book'}); S.fens.push(S.g.fen()) } }
  draw();
  if(S.g.turn()!==myColor()) opponentMove(); else status('','Your move.','Play your prep. Hint is H.');
  renderSide(); renderBook();
}
function draw(last){
  board.set(S.g,{last:last===undefined?lastMove():last,orient:myColor(),locked:S.phase!=='await'});
}
function lastMove(){ const h=S.g.history({verbose:true}); const m=h[h.length-1]; return m?{from:m.from,to:m.to}:null }

/* The moves the repertoire gives at this position. */
function repMovesAt(fen){ if(!S.op||!S.op.rep) return []; const m=repMap(S.op.id); if(!m) return []; return m.get(posId(normKey(fen)))||[] }

async function opponentMove(){
  if(S.phase!=='await'&&S.phase!=='busy') return;
  S.phase='busy'; S.busy=true; draw(); status('','Thinking…','');
  const fen=S.g.fen();
  let uci=null, note='';
  if(S.op.rep){
    const file=repMovesAt(fen);
    if(!file.length) return endLine('End of your prep in this line.');
    const bk=await Book.oppMoves(fen);
    const recent=S.recent[S.op.id]||[];
    const weights=file.map(u=>{
      let share=0.02;
      if(bk&&!bk.demo){ const r=bk.rows.find(x=>x.uci.slice(0,4)===u.slice(0,4)); if(r) share=Math.max(r.share,0.005) }
      const rep=recent.filter(x=>x===fenKeyU(fen,u)).length;
      return Math.pow(share,0.6)*Math.pow(0.35,rep);
    });
    uci=pick(file,weights);
    (S.recent[S.op.id]=recent.concat(fenKeyU(fen,uci)).slice(-12));
    if(bk&&!bk.demo&&bk.level&&bk.level!=='masters') note=Book.levelLabel(bk.level)+' opponent';
  }else{
    const bk=await Book.oppMoves(fen);
    if(!bk||!bk.rows.length||(!bk.demo&&bk.total<20)) return endLine('The book runs out here.');
    if(bk.demo){
      /* the demo book has no game counts: keep only the named moves Stockfish rates as sound */
      const ok=await soundDemoMoves(fen,bk.rows.map(r=>r.uci));
      uci=pick(ok.map(x=>x.uci),ok.map(x=>x.w));
      note='Named lines, checked by Stockfish (no book here).';
    }else{
      const rows=bk.rows.filter(r=>r.share>=0.01);
      uci=pick(rows.map(r=>r.uci),rows.map(r=>Math.pow(Math.max(r.share,0.005),0.75)));
    }
  }
  if(!uci) return endLine('The book runs out here.');
  const m=S.g.move({from:uci.slice(0,2),to:uci.slice(2,4),promotion:uci[4]||'q'});
  if(!m) return endLine('The book runs out here.');
  S.log.push({san:m.san,uci,who:'opp'}); S.fens.push(S.g.fen());
  S.phase='await'; S.busy=false; S.hintStage=0;
  draw();
  status('','Your move.',note);
  renderSide(); renderBook();
}
/* Demo-book moves Stockfish rates within 0.06 winning chances of the best of them (depth 12),
   weighted toward the best. Without the engine, only the first listed move. */
async function soundDemoMoves(fen,ucis){
  if(ucis.length<=1||SharedEngine.failed) return ucis.slice(0,1).map(u=>({uci:u,w:1}));
  const out=[];
  for(const u of ucis){
    const g=new Chess(fen); const m=g.move({from:u.slice(0,2),to:u.slice(2,4),promotion:u[4]||'q'}); if(!m) continue;
    const a=await SharedEngine.analyse(g.fen(),12,1,6000).catch(()=>null);
    if(!a||!a.length) continue;
    const mover=a[0].mate!=null?(a[0].mate>0?-15:15):-a[0].cp;   /* pawns, from the mover's side */
    out.push({uci:u,c:wc(mover)});
  }
  if(!out.length) return ucis.slice(0,1).map(u=>({uci:u,w:1}));
  const best=Math.max(...out.map(x=>x.c));
  return out.filter(x=>best-x.c<=0.06).map(x=>({uci:x.uci,w:Math.exp(-(best-x.c)/0.02)}));
}
const fenKeyU=(fen,u)=>posId(normKey(fen))+'|'+u;
function pick(items,weights){
  const tot=weights.reduce((a,b)=>a+b,0); if(!(tot>0)) return items[Math.floor(Math.random()*items.length)];
  let r=Math.random()*tot; for(let i=0;i<items.length;i++){ r-=weights[i]; if(r<=0) return items[i] } return items[items.length-1];
}

async function userMove(from,to,promo){
  if(!S.op||S.phase!=='await'||S.busy) return;
  const fen=S.g.fen();
  const test=new Chess(fen); const m=test.move({from,to,promotion:promo||'q'});
  if(!m) return;
  const uci=from+to+(m.promotion||'');
  S.busy=true;
  if(S.op.rep){
    const file=repMovesAt(fen);
    const hit=file.some(u=>u.slice(0,4)===uci.slice(0,4));
    if(hit){ await accept(fen,m,uci,file,1,'In your repertoire.') }
    else{
      S.busy=false;
      S.misses.push({fen,played:m.san,answer:file.map(u=>sanOf(fen,u)).join(' or ')});
      if(!S.scored.some(s=>s.fen===fen)) S.scored.push({fen,s:0,d:await moveDifficulty(fen,file),miss:true});
      board.flash([from,to],'bad');
      status('bad',`${m.san} isn’t in your repertoire.`,`Try again, or press H for a hint${file.length?` — your file gives ${file.length>1?file.length+' moves':sanOf(fen,file[0])} here`:''}.`);
      return;
    }
  }else{
    const bk=await Book.moves(fen,'masters');
    const row=bk&&bk.rows.find(r=>r.uci.slice(0,4)===uci.slice(0,4));
    const minShare=(+Settings.get('oshare')||3)/100;
    if(row&&(bk.demo||row.share>=minShare)){
      await accept(fen,m,uci,null,1,bk.demo?'A known line.':`Elite players chose ${m.san} in ${Math.round(row.share*100)}% of ${bk.total.toLocaleString()} games.`);
    }else if(row){
      await accept(fen,m,uci,null,0.5,`Rare: ${Math.round(row.share*100)||'<1'}% of elite games — playable.`);
    }else{
      /* Off book: ask Stockfish how much it costs against the best book move. */
      status('', 'Checking…','');
      const depth=+Settings.get('sfDepth')>0?+Settings.get('sfDepth'):14;
      const top=bk&&bk.rows[0];
      let verdictText='Not a book move.';
      let drop=null;
      const a=await SharedEngine.analyse(fen,depth,2,8000).catch(()=>null);
      if(a&&a.length){
        const best=cpPawns(a[0].cp*100);
        const after=await SharedEngine.analyse(test.fen(),depth,1,8000).catch(()=>null);
        if(after&&after.length){
          const mine=-cpPawns(after[0].cp*100);
          drop=wc(best)-wc(mine);
          if(drop<0.1){ await accept(fen,m,uci,null,0.5,`Off book but playable (about ${Math.abs(best-mine).toFixed(1)} pawns from the top move).`); return }
          verdictText=`${m.san} loses about ${(best-mine).toFixed(1)} pawns. Best here: ${top?sanOf(fen,top.uci):sanOf(fen,a[0].uci)}.`;
        }
      }else if(top){ verdictText=`Not a book move. Elite players prefer ${sanOf(fen,top.uci)}.` }
      S.busy=false;
      S.misses.push({fen,played:m.san,answer:top?sanOf(fen,top.uci):'',drop});
      if(!S.scored.some(s=>s.fen===fen)) S.scored.push({fen,s:0,d:await moveDifficulty(fen),miss:true});
      board.flash([from,to],'bad');
      status('bad',verdictText,'Try again, or press H for a hint.');
      return;
    }
  }
}
async function accept(fen,m,uci,good,score,noteText){
  if(!S.scored.some(s=>s.fen===fen)) S.scored.push({fen,s:score,d:await moveDifficulty(fen,good||[uci])});
  S.g.move({from:m.from,to:m.to,promotion:m.promotion});
  S.log.push({san:m.san,uci,who:'me',ok:score>=1?'ok':'half'}); S.fens.push(S.g.fen());
  S.userMoves++; S.busy=false; S.hintStage=0;
  draw(); board.flash([m.from,m.to],'good');
  status('good',score>=1?`${m.san} ✓`:`${m.san} — half credit`,noteText||'');
  renderSide();
  if(S.userMoves>=lineMax()) return endLine('Line complete.');
  setTimeout(()=>{ if(S.phase==='await') opponentMove() },650);
}

function endLine(msg){
  S.phase='done'; S.busy=false;
  const st=stats(S.op.id);
  let delta=0;
  if(!training()&&S.scored.length){
    const meanS=S.scored.reduce((a,x)=>a+x.s,0)/S.scored.length;
    const meanD=S.scored.reduce((a,x)=>a+x.d,0)/S.scored.length;
    const E=1/(1+Math.pow(10,(meanD-st.rating)/400));
    const K=st.n2<R2_PROV?40:16;
    const w=Math.min(1,S.scored.length/4);
    delta=Math.round(K*w*(meanS-E));
    st.rating+=delta; st.n2++; st.lines++; st.last=Date.now();
    st.history.push({t:Date.now(),r:st.rating,m:training()?'t':'r'});
    if(st.history.length>200) st.history=st.history.slice(-200);
    saveStats(S.op.id,st);
  }else if(training()){ st.lines++; st.last=Date.now(); saveStats(S.op.id,st) }
  S.endMsg=msg;
  const missTxt=S.misses.length?`<br>${S.misses.length} miss${S.misses.length>1?'es':''}: ${S.misses.map(x=>`${esc(x.played)}${x.answer?' (prep: '+esc(x.answer)+')':''}`).join(', ')}`:'<br>Every move you played was right.';
  status(S.misses.length?'warn':'good',`${msg}${training()?'':` · ${delta>=0?'+':''}${delta} rating`}`,'');
  $('o-status').innerHTML+=missTxtSafe(missTxt);
  const nx=document.createElement('button'); nx.className='btn primary endnext'; nx.textContent='Next line (N)';
  nx.addEventListener('click',newLine); $('o-status').appendChild(nx);
  draw(null); renderSide(); renderBook();
}
const missTxtSafe=h=>h; /* built from escaped parts above */

function status(tone,head,rest){
  const el=$('o-status'); el.className='status'+(tone?' '+tone:'');
  el.innerHTML=`<strong>${esc(head)}</strong>${rest?esc(rest):''}`;
}

/* ---------- Side panel ---------- */
function renderSide(){
  renderAcct();
  if(!S.op){ $('o-name').textContent=' '; return }
  const names=Book.nameOf(S.fens);
  $('o-name').textContent=S.op.name;
  const st=stats(S.op.id);
  const delta=st.rating-S.startRating;
  $('o-rate').innerHTML=training()?'<span class="note">Training mode: the rating doesn’t move.</span>'
    :`<b>${st.rating}</b><span class="delta ${delta>0?'up':delta<0?'down':''}">${delta?(delta>0?'+':'')+delta+' this line':''}</span><span class="note">· ${st.lines} lines</span>`;
  const btns=$('o-sidebtns'); btns.innerHTML='';
  if(S.op.rep){
    const del=document.createElement('button'); del.className='btn sm'; del.textContent='Delete repertoire';
    del.addEventListener('click',()=>{ if(!confirm('Delete this repertoire and its stats?')) return;
      Store.del('rep-'+S.op.id); Store.del('stats-'+S.op.id); REPMAPS.delete(S.op.id);
      Store.put('reps-index',repIndex().filter(r=>r.id!==S.op.id)); S.op=null; $('o-pickname').textContent='Choose an opening'; renderList(); renderSide() });
    btns.appendChild(del);
  }
  /* move list */
  const ml=$('o-movelist'); let html=''; let n=1;
  S.log.forEach((e,i)=>{ if(i%2===0) html+=`<span class="note">${Math.floor(i/2)+1}.</span> `;
    html+=`<b class="${e.ok==='ok'?'ok':e.ok==='half'?'inacc':''}">${esc(e.san)}</b> ` });
  ml.innerHTML=html||'<span class="note">No moves yet.</span>';
  const facts=$('o-facts');
  facts.innerHTML=`<dt>Opening</dt><dd>${names?esc(names[1])+' <span class="note">('+esc(names[0])+')</span>':'—'}</dd>
    <dt>Side</dt><dd>${side()==='white'?'White':'Black'}</dd>
    <dt>Opponent</dt><dd>${esc(Book.levelLabel(Settings.get('olevel')))}</dd>
    <dt>Book</dt><dd>${Book.hasBook(Settings.get('olevel'))?esc(Book.levelLabel(Settings.get('olevel')))+' games (Lichess, CC0)':'Named lines (no game counts)'}</dd>`;
  const lk=$('o-lichess');
  lk.href='https://lichess.org/analysis/pgn/'+encodeURIComponent(S.log.map(e=>e.san).join(' '));
}
async function renderBook(){
  const el=$('o-bookrows');
  const show=training()||S.phase==='done';
  $('o-booklabel').textContent=Book.levelLabel(Settings.get('olevel'))+' book';
  if(!S.op){ el.innerHTML='<p class="note">Pick an opening to see the book.</p>'; return }
  if(!show){ el.innerHTML='<p class="note">The book shows here after the line (Rated mode).</p>'; return }
  const bk=await Book.oppMoves(S.g?S.g.fen():START);
  if(!bk){ el.innerHTML='<p class="note">No book data for this position.</p>'; return }
  el.innerHTML=(bk.demo?'<p class="note">Offline demo book: named lines, no game counts.</p>':'')+
    bk.rows.slice(0,8).map(r=>{
      const tot=r.games||1, pw=Math.round(100*r.w/tot), pd=Math.round(100*r.d/tot), pb=100-pw-pd;
      return `<div class="bookrow"><span class="mv">${esc(r.san||sanOf(S.g?S.g.fen():START,r.uci))}</span>
        <span class="wdl" title="${pw}% / ${pd}% / ${pb}%"><i class="w" style="width:${pw}%"></i><i class="d" style="width:${pd}%"></i><i class="b" style="width:${pb}%"></i></span>
        <span class="note">${r.games?Math.round(r.share*100)+'%':''}</span>
        <span class="note">${r.games?r.games.toLocaleString():''}</span></div>`;
    }).join('');
}

/* ---------- Hint ---------- */
async function hint(){
  if(!S.op||S.phase!=='await') return;
  const fen=S.g.fen();
  let u=null;
  if(S.op.rep){ const file=repMovesAt(fen); u=file[0] }
  else{ const bk=await Book.moves(fen,'masters'); u=bk&&bk.rows.length?bk.rows.reduce((a,b)=>a.share>=b.share?a:b).uci:null;
    if(!u){ const a=await SharedEngine.analyse(fen,12,1,6000).catch(()=>null); u=a&&a[0]&&a[0].uci } }
  if(!u){ status('warn','No hint here.',''); return }
  if(S.hintStage===0){ S.hintStage=1; board.setHint(u.slice(0,2)); status('warn','Hint: this piece moves.','Press H again for the move.') }
  else{ board.setHint(u.slice(0,2),u.slice(2,4)); status('warn','Answer: '+sanOf(fen,u),'That move earns no rating now.');
    if(!S.scored.some(s=>s.fen===fen)) S.scored.push({fen,s:0,d:await moveDifficulty(fen),hint:true}) }
}

/* ---------- Import ---------- */
function openImport(){ $('o-importmodal').hidden=false; $('o-reperr').textContent='' }
function doImport(){
  const text=$('o-pgnbox').value;
  const name=$('o-repname').value.trim()||'My repertoire';
  const sideV=$('o-repside').value;
  try{
    const r=parseRepPGN(text);
    const id='imp-'+Date.now().toString(36);
    Store.put('rep-'+id,{name,side:sideV,pos:Object.fromEntries(Object.entries(r.pos).map(([k,v])=>[k,v.join(' ')]))});
    const idx=repIndex(); idx.push({id,name,side:sideV,positions:r.positions}); Store.put('reps-index',idx);
    $('o-importmodal').hidden=true; $('o-pgnbox').value='';
    renderList(); selectOpening(id);
  }catch(e){ $('o-reperr').textContent=String(e.message||e) }
}

function renderAcct(){
  const el=$('o-acct'); if(!el) return;
  const lv=Settings.get('olevel');
  el.textContent=Book.hasBook(lv)
    ?(lv==='masters'?'Games between Lichess players rated 2500+ and 2300+ (Lichess Elite Database).':'Rated rapid and classical Lichess games at this level (Lichess open database).')
    :'This level’s book isn’t loaded, so the opponent uses named lines checked by Stockfish.';
}
function syncLevel(){
  const lv=Settings.get('olevel'); const i=Math.max(0,Book.ORDER.indexOf(Book.LEVELS[lv]?lv:'masters'));
  $('o-level').value=String(i); $('o-levelname').textContent=Book.levelLabel(Book.ORDER[i]);
  renderSide(); renderBook();
}
/* ---------- Wiring ---------- */
function init(){
  board=makeBoard($('o-board'),{onMove:userMove});
  $('o-pick').addEventListener('click',()=>{ const pop=$('o-pop'); pop.hidden=!pop.hidden; $('o-pick').setAttribute('aria-expanded',String(!pop.hidden)); if(!pop.hidden){ renderList($('o-search').value); $('o-search').focus() } });
  $('o-search').addEventListener('input',e=>renderList(e.target.value));
  $('o-newline').addEventListener('click',newLine);
  $('o-hint').addEventListener('click',hint);
  $('o-flip').addEventListener('click',()=>board.flip());
  $('o-import').addEventListener('click',openImport);
  $('o-repsave').addEventListener('click',doImport);
  $('o-repcancel').addEventListener('click',()=>{ $('o-importmodal').hidden=true });
  $('o-rated').addEventListener('click',()=>{ Settings.set('omode','rated'); modeBtns() });
  $('o-training').addEventListener('click',()=>{ Settings.set('omode','training'); modeBtns(); renderBook() });
  /* Opponent level slider: weakest (Lichess 1000) to Elite 2500+; same setting as Settings → Opponent level */
  const lvl=$('o-level');
  lvl.addEventListener('input',()=>{ $('o-levelname').textContent=Book.levelLabel(Book.ORDER[+lvl.value]) });
  lvl.addEventListener('change',()=>{ Settings.set('olevel',Book.ORDER[+lvl.value]); syncLevel(); if(window.SettingsTab&&SettingsTab.refresh) SettingsTab.refresh() });
  syncLevel();
  function modeBtns(){ const t=training(); $('o-rated').setAttribute('aria-pressed',String(!t)); $('o-training').setAttribute('aria-pressed',String(t)); renderSide() }
  modeBtns();
  $('o-moveform').addEventListener('submit',e=>{
    e.preventDefault(); const txt=$('o-movein').value; $('o-moveerr').textContent='';
    if(!txt.trim())return;
    if(!S.g||S.phase!=='await'||S.busy){ $('o-moveerr').textContent='Wait for the position.'; return }
    const mv=parseTyped(S.g,txt);
    if(!mv){ $('o-moveerr').textContent=`${txt} isn’t legal here. ${S.g.turn()==='w'?'White':'Black'} to move.`; return }
    $('o-movein').value=''; userMove(mv.from,mv.to,mv.promotion);
  });
  document.addEventListener('keydown',e=>{
    if(document.body.dataset.view!=='openings') return;
    if(/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if(e.key==='n'||e.key==='N') newLine();
    if(e.key==='h'||e.key==='H') hint();
    if(e.key==='f'||e.key==='F') board.flip();
  });
  addEventListener('settings-change',()=>{ if(document.body.dataset.view==='openings'){ renderSide(); renderBook() } });
  renderList();
  board.set(new Chess(),{orient:'w',locked:true});
}
window.OpeningsTab={init,syncLevel,soundDemoMoves,get state(){return S},selectOpening,newLine,userMove,parseRepPGN,moveDifficulty,openings,stats};
})();
