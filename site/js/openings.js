/* Chess Lab Open — the opening trainer.
   Presets train you against the elite book (or a club band: the Opponent slider);
   imported repertoires (your own PGN or a Lichess study) are the answer key, and the opponent plays
   your prepared replies, weighted by how often they are played (the "Sidelines in repertoires" setting).
   The PGN's own notes, move marks (!, ?, ⩲ ...) and arrows show in the Notes card beside the moves
   (Training: as you play; Rated: when the line ends, so they can't give your next move away).
   Rating v2: each move is a "game" against a difficulty from the elite share of the right move(s);
   a position you take back is not rated again. */
'use strict';
(function(){
const START='rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
/* "Anything": no PGN needed. Start from move 1; the opponent plays the book at your level, your moves are judged as in presets.
   Fixed ids, so their ratings and stats stay. */
const ANY=[{id:'preset-any-white',name:'Anything as White',side:'white',moves:[],any:true},
  {id:'preset-any-black',name:'Anything as Black',side:'black',moves:[],any:true}];
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
const LEN_NAMES={short:'Short',medium:'Medium',long:'Long',vlong:'Very long',max:'Max'};
const VARIETY={realistic:['Realistic','Replies come up as often as they are played in games: the main line most of the time.'],
  balanced:['Balanced','Sidelines you prepared come up much more often than in games, and the main line still leads.'],
  sidelines:['Sidelines first','Most lines test the sidelines; the main line is one option among them.']};
const R2_START=1800, R2_PROV=8;
const cssq=s=>String(s).replace(/["\\]/g,'\\$&');

/* ---------- Imported repertoires ---------- */
function repIndex(){ return Store.get('reps-index')||[] }
function repData(id){ const d=Store.get('rep-'+id); if(!d) return null;
  const m=new Map(); for(const k in d.pos) m.set(k,d.pos[k].split(' ')); return m }
const REPMAPS=new Map(), ANNS=new Map();
function repMap(id){ if(!REPMAPS.has(id)) REPMAPS.set(id,repData(id)); return REPMAPS.get(id) }
/* the repertoire's notes: {"<posId>|<uci>": [marks, text, shapes]} */
function repAnn(id){ if(!ANNS.has(id)){ const d=Store.get('rep-'+id); ANNS.set(id,d&&d.ann&&Object.keys(d.ann).length?d.ann:null) } return ANNS.get(id) }
/* where a repertoire's lines start: your choice (Store ostart-<id> = {moves:[SAN]}), else move 1 */
function repStart(id){ const u=Store.get('ostart-'+id); return u&&Array.isArray(u.moves)?u.moves.slice():[] }

/* Parse a PGN with variations, comments and NAGs. Returns
   {pos: {posId: [uci...]} (both sides' moves), ann: {"posId|uci": [marks, text, shapes]}, positions, moves, games, bad, startFen}.
   A [FEN] header starts that game from its position; one FEN shared by every game becomes the repertoire's start. */
function parseRepPGN(text){
  const r=PGN.read(text);   /* shared/pgn.js */
  const pos={}, ann={}; let moves=0;
  for(const [k,us] of r.edges){ pos[posId(k)]=us.slice(); moves+=us.length }
  for(const k in r.notes){ const e=r.notes[k]; ann[k]=[e.mk,e.text,e.sh] }
  if(!moves) throw new Error('No moves found in that PGN.');
  const st=[...new Set(r.starts.map(f=>f?normKey(f):''))]; const startFen=st.length===1&&st[0]&&st[0]!==normKey(START)?st[0]+' 0 1':null;
  return {pos,ann,positions:Object.keys(pos).length,moves,games:r.games,bad:r.bad,startFen};
}

/* ---------- State ---------- */
const S={op:null,g:null,phase:'idle',busy:false,log:[],userMoves:0,misses:[],scored:[],hintStage:0,
  startRating:0,recent:{},fens:[],endMsg:'',lineId:0,browse:null,oppPicks:[],arrange:false};
let board=null;

const side=()=>S.op?S.op.side:'white';
const myColor=()=>side()==='white'?'w':'b';
const training=()=>Settings.get('omode')==='training';
const lineMax=()=>LENS[Settings.get('olen')]||12;
const startFen=()=>S.op&&S.op.startFen||START;
const peek=()=>training()||S.phase==='done';                 /* notes, marks and arrows are shown */
const browsing=()=>S.browse!=null&&S.g&&S.browse<S.log.length;
const variety=()=>VARIETY[Settings.get('ovariety')]?Settings.get('ovariety'):'balanced';

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

/* ---------- Openings list: your order (Arrange), search, Statistics ---------- */
function openings(){
  const reps=repIndex().map(r=>({...r,rep:true,moves:repStart(r.id),startFen:r.startFen||null}));
  /* Players (the Players tab): you against their moves, one entry per colour you have */
  const pls=(Store.get('players-index')||[]).flatMap(p=>['w','b'].map(c=>({id:'pl-'+p.id+'-'+c,name:'vs '+p.name,side:c==='w'?'white':'black',player:p.id,their:c==='w'?'b':'w',moves:[]})));
  return [...ANY,...customs(),...reps,...PRESETS,...pls];
}
/* ---------- Your own positions (Store custom-<id> = {name, side, moves:[SAN], fen?}) ---------- */
function customs(){ return Store.keys().filter(k=>k.startsWith('custom-')).map(k=>{ const v=Store.get(k)||{};
  return {id:k,custom:true,name:v.name||'My position',side:v.side==='black'?'black':'white',moves:Array.isArray(v.moves)?v.moves:[],startFen:v.fen||null,t:v.t||0} })
  .sort((a,b)=>a.t-b.t) }
/* Check and store a custom opening; returns its id. Moves must be legal from the start (or from fen). */
function saveCustom({name,side,moves,fen},id){
  name=String(name||'').trim(); if(!name) throw new Error('Give the position a name.');
  let g; if(fen){ let ok=false; try{ ok=new Chess().validate_fen(fen).valid }catch(e){} if(!ok) throw new Error('That FEN is not a legal position.'); g=new Chess(fen) } else g=new Chess();
  const ms=[]; for(const s of moves||[]){ const m=g.move(s,{sloppy:true}); if(!m) throw new Error(`${s} is not legal there.`); ms.push(m.san) }
  if(g.game_over()) throw new Error('The game is already over in that position.');
  id=id||'custom-'+Date.now().toString(36)+Math.floor(Math.random()*1296).toString(36);
  const prev=Store.get(id)||{};
  Store.put(id,{name:name.slice(0,80),side:side==='black'?'black':'white',moves:ms,fen:fen&&normKey(fen)!==normKey(START)?fen:undefined,t:prev.t||Date.now()});
  if(!Store.get(id)) throw new Error('This browser has no room left to store it.');
  return id;
}
function deleteCustom(id){ for(const k of ['','stats-','ostart-']) Store.del(k+id); if(S.op&&S.op.id===id){ S.op=null; $('o-pickname').textContent='Choose an opening' } renderList(); renderSide() }
function ordered(ops){ const ids=(Store.get('olist')||{}).ids||[]; if(!ids.length) return ops; const at=new Map(ids.map((id,i)=>[id,i]));
  return ops.map((o,i)=>[o,at.has(o.id)?at.get(o.id):1e6+i]).sort((a,b)=>a[1]-b[1]).map(x=>x[0]) }
function saveOrder(ids){ const all=ordered(openings()).map(o=>o.id); Store.put('olist',{ids:ids.concat(all.filter(id=>!ids.includes(id)))}) }
const listText=o=>[o.name,o.side,o.rep?'repertoire rep':o.player?'player opponent vs':o.custom?'mine position custom':o.any?'anything any preset book':'preset book'].join(' ').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
function startText(ms,fen){ const n=ms.length; if(!n) return 'move 1'; const t=(fen||START).split(' '), off=t[1]==='b'?1:0, n0=+t[5]||1;
  const i=Math.max(0,n-2); return ms.slice(i).map((m,j)=>{ const ply=i+j+off; return (ply%2===0?(n0+ply/2)+'.':j===0?(n0+Math.floor(ply/2))+'…':'')+m }).join(' ') }
function renderList(filter){
  const el=$('o-list'); if(filter===undefined) filter=$('o-search').value;
  $('o-arrange').textContent=S.arrange?'Done':'Arrange'; $('o-arrange').setAttribute('aria-pressed',String(S.arrange));
  $('o-resetorder').hidden=!S.arrange||!(Store.get('olist')||{}).ids; $('o-search').disabled=S.arrange;
  if(S.arrange) return renderArrange();
  el.innerHTML='';
  const q=filter.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').split(/\s+/).filter(Boolean);
  for(const o of ordered(openings())){
    if(q.length&&!q.every(w=>listText(o).includes(w))) continue;
    const st=stats(o.id);
    if(o.player&&!q.length&&!st.lines&&!(S.op&&S.op.id===o.id)) continue;   /* players show once trained (or found by search) */
    const b=document.createElement('button'); b.className='drill'; b.dataset.id=o.id; b.setAttribute('aria-current',S.op&&S.op.id===o.id?'true':'false');
    const from=(o.rep||o.custom)&&(o.moves.length||o.startFen)?` · from ${esc(startText(o.moves,o.startFen))}`:'';
    b.innerHTML=`<span class="src">${o.rep?'Rep':o.player?'Player':o.custom?'Mine':o.any?'Any':'Book'}</span><span><span class="opp">${esc(o.name)}</span><br><span class="meta">${o.side==='white'?'White':'Black'}${from}${st.lines?` · ${st.lines} lines · ${st.rating}`:''}</span></span><span class="evalchip">&#9654;</span>`;
    b.addEventListener('click',()=>{ selectOpening(o.id); setPop(false) });
    el.appendChild(b);
  }
  if(!el.children.length) el.innerHTML='<p class="empty">Nothing matches. Import a repertoire below, or make a new position.</p>';
  if(!q.length){ const n=document.createElement('button'); n.className='drill newpos'; n.id='o-newpos';
    n.innerHTML='<span class="src">+</span><span><span class="opp">New position</span><br><span class="meta">Play the moves of both sides, then train from there</span></span><span class="evalchip">&#9654;</span>';
    n.addEventListener('click',()=>{ setPop(false); openNew() }); el.insertBefore(n,el.firstChild) }
}
/* ---------- New position: a setup board (both sides' moves, or a FEN), a name and your side ---------- */
const NP={g:null,fen:null,board:null,edit:null};
function openNew(op){
  NP.edit=op&&op.custom?op.id:null; NP.fen=op&&op.startFen||null; NP.g=new Chess(NP.fen||undefined);
  for(const m of (op&&op.moves)||[]) NP.g.move(m,{sloppy:true});
  $('o-npname').value=op?op.name:''; $('o-npside').value=op?op.side:'white'; $('o-npfen').value=NP.fen||''; $('o-nperr').textContent='';
  $('o-nptitle').textContent=NP.edit?'Edit position':'New position';
  $('o-newmodal').hidden=false;
  if(!NP.board) NP.board=makeBoard($('o-npboard'),{onMove:(f,t,pr)=>{ const m=NP.g.move({from:f,to:t,promotion:pr||'q'}); if(m) renderNew() }});
  NP.orient=null; renderNew();
}
function renderNew(){
  const h=NP.g.history({verbose:true}), last=h[h.length-1];
  NP.board.set(NP.g,{last:last?{from:last.from,to:last.to}:null,orient:NP.orient||($('o-npside').value==='black'?'b':'w')});
  const sans=h.map(m=>m.san), t=(NP.fen||START).split(' '), off=t[1]==='b'?1:0, n0=+t[5]||1;
  $('o-npmoves').textContent=sans.length?sans.map((m,i)=>{ const ply=i+off; return (ply%2===0?(n0+ply/2)+'. ':i===0?(n0+Math.floor(ply/2))+'… ':'')+m }).join(' '):(NP.fen?'From your FEN':'Starting position');
  if(!$('o-npname').value.trim()||$('o-npname').dataset.auto==='1'){ const nm=!NP.fen&&Book.nameOf([START,...(()=>{ const g=new Chess(), f=[]; for(const s of sans){ g.move(s); f.push(g.fen()) } return f })()]);
    if(nm){ $('o-npname').value=nm[1]; $('o-npname').dataset.auto='1' } }
}
function saveNew(){
  try{ const id=saveCustom({name:$('o-npname').value,side:$('o-npside').value,moves:NP.g.history(),fen:NP.fen},NP.edit||undefined);
    $('o-newmodal').hidden=true; if(location.hash==='#openings/new') history.replaceState(null,'','#openings'); renderList(); selectOpening(id); return id }
  catch(e){ $('o-nperr').textContent=String(e.message||e); return null }
}
/* Save this position: the moves on the board in this line become a new position of your own (your side). */
function saveCurrent(name){
  if(!S.op||!S.g) return null; const v=browsing()?S.browse:S.log.length, ms=S.log.slice(0,v).map(x=>x.san);
  const nm=Book.nameOf(S.fens.slice(0,v+1)); const def=(nm?nm[1]:S.op.name)+(ms.length?' after '+startText(ms,startFen()):'');
  if(name===undefined){ name=window.prompt('Name for this position:',def); if(name===null) return null }
  try{ const id=saveCustom({name:name||def,side:side(),moves:ms,fen:S.op.startFen||null}); renderList(); status('good','Saved as '+(name||def)+'.','It is in the openings list (Mine).'); return id }
  catch(e){ status('bad','Could not save it.',String(e.message||e)); return null }
}
/* Arrange: drag the grip (mouse or finger) or use the arrows; saved at once. */
function renderArrange(){
  const ops=ordered(openings()), el=$('o-list');
  el.innerHTML=`<p class="note" style="margin:0 2px 4px">Drag ⠿ or use ↑ ↓ to put the openings you're working on first. Saved as you go.</p>`+
    ops.map((o,i)=>`<div class="drill arr" data-id="${esc(o.id)}"><span class="grip" title="Drag to move" aria-hidden="true">⠿</span><span><span class="opp">${esc(o.name)}</span><br><span class="meta">${o.side==='white'?'White':'Black'}${o.rep?' · repertoire':''}</span></span>`+
      `<span class="arrbtns"><button class="btn sm" data-mv="-1" aria-label="Move ${esc(o.name)} up"${i?'':' disabled'}>↑</button><button class="btn sm" data-mv="1" aria-label="Move ${esc(o.name)} down"${i<ops.length-1?'':' disabled'}>↓</button></span></div>`).join('');
}
function moveItem(id,d){ const ids=ordered(openings()).map(o=>o.id), i=ids.indexOf(id), j=i+d; if(i<0||j<0||j>=ids.length) return;
  [ids[i],ids[j]]=[ids[j],ids[i]]; saveOrder(ids); renderArrange();
  const el=$('o-list').querySelector(`.arr[data-id="${cssq(id)}"] [data-mv="${d}"]`)||$('o-list').querySelector(`.arr[data-id="${cssq(id)}"] button:not([disabled])`); if(el) el.focus() }
function setArrange(on){ S.arrange=on; renderList() }
function setPop(on){ const p=$('o-pop'); p.hidden=!on; $('o-pick').setAttribute('aria-expanded',String(on));
  if(on){ renderList(); if(innerWidth>860) $('o-search').focus({preventScroll:true}) } else if(S.arrange){ S.arrange=false; renderList() } }
function firstListed(){ return ordered(openings())[0] }
function selectOpening(id){
  const o=openings().find(x=>x.id===id)||firstListed(); if(!o) return;
  S.op=o; $('o-pickname').textContent=o.name; $('o-picklab').textContent=`${o.side==='white'?'White':'Black'} · ${o.rep?'repertoire':o.player?'vs a player':o.custom?'your position':o.any?'any opening':'opening'}`;
  if(o.rep) Book.moves(START,'b22');   /* club shares for prepared sidelines the elite book leaves out */
  newLine();
}

/* ---------- Line play ---------- */
function newLine(){
  if(!S.op) return;
  S.lineId++;
  $('o-endbar').hidden=true; $('o-boardbox').classList.remove('end-good','end-warn');
  S.g=new Chess(startFen()); S.phase='await'; S.busy=false; S.outBook=0; S.log=[]; S.userMoves=0; S.misses=[]; S.scored=[]; S.hintStage=0; S.fens=[S.g.fen()]; S.endMsg=''; S.browse=null; S.oppPicks=[]; S.tb=null; S.finalEv=null; S.orientSet=false;
  S.startRating=stats(S.op.id).rating;
  for(const san of (S.op.moves||[])){ const m=S.g.move(san,{sloppy:true}); if(!m) break; S.log.push({san:m.san,uci:m.from+m.to+(m.promotion||''),who:'book',before:S.fens[S.fens.length-1]}); S.fens.push(S.g.fen()) }
  draw();
  if(S.g.turn()!==myColor()) opponentMove(); else status('','Your move.','Play your prep. Hint is H.');
  renderSide(); renderBook(); renderEval();
}
function viewPos(){ if(!browsing()) return {g:S.g,last:lastMove(S.g)}; const g=new Chess(S.fens[S.browse]); return {g,last:lastMove(g)} }
function draw(){
  const v=viewPos();
  board.set(v.g,{last:v.last,orient:board?.orient&&S.orientSet?board.orient:myColor(),locked:browsing()||S.phase!=='await'});
  $('o-board').classList.toggle('browsing',browsing());
  Shapes.auto($('o-board'),noteShapes());
  tools();
}
function lastMove(g){ const h=g.history({verbose:true}); const m=h[h.length-1]; return m?{from:m.from,to:m.to}:null }

/* The moves the repertoire gives at this position. */
function repMovesAt(fen){ if(!S.op||!S.op.rep) return []; const m=repMap(S.op.id); if(!m) return []; return m.get(posId(normKey(fen)))||[] }
const after=(fen,u)=>{ const g=new Chess(fen); g.move({from:u.slice(0,2),to:u.slice(2,4),promotion:u[4]||'q'}); return g.fen() };

/* ---------- The opponent in a repertoire: your prepared replies, weighted (Sidelines in repertoires) ----------
   x = a reply's share of games here x the share of games that stay inside your file for two more opponent moves.
   Realistic weights x like the games do; Balanced and Sidelines first flatten it so prepared sidelines come up more.
   A reply that came up more often in your last 6 lines here than its weight says is pushed down; lines you missed before
   come up more. Moves the elite book leaves out take their share in the club 2200+ book. */
function oppBookNow(fen){ const lv=Settings.get('olevel'); if(lv&&lv!=='masters'){ const b=Book.now(fen,lv); if(b&&b.total>=20){ b.level=lv; return b } }
  const m=Book.now(fen,'masters'); if(m) m.level='masters'; return m }
function replyShare(fen,u,bk){ const row=bk&&bk.rows.find(r=>r.uci.slice(0,4)===u.slice(0,4)); if(row) return row.share;
  if(!bk||bk.level!=='masters') return 0; const cb=Book.now(fen,'b22'); if(!cb||cb.total<20) return 0;
  const cr=cb.rows.find(r=>r.uci.slice(0,4)===u.slice(0,4)); return cr?cr.share:0 }
const STAY=new Map();
function stayIn(fen,k){ const kids=repMovesAt(fen); if(!k||!kids.length) return 1; const bk=oppBookNow(fen); if(!bk||bk.total<20) return 1;
  const key=S.op.id+'|'+bk.level+'|'+posId(normKey(fen))+'|'+k; if(STAY.has(key)) return STAY.get(key);
  let s=0; for(const u of kids){ const sh=replyShare(fen,u,bk); if(sh) s+=sh*stayAfter(after(fen,u),k-1) }
  STAY.set(key,s); return s }
function stayAfter(fen,k){ const mine=repMovesAt(fen); if(!k||!mine.length) return 1; let best=0;
  for(const m of mine){ best=Math.max(best,stayIn(after(fen,m),k)); if(best>=1) break } return best }
function varietyWeight(x,top){ const v=variety(); if(v==='realistic'||x<0.015) return Math.pow(Math.max(x,0.0005),0.75);
  return v==='balanced'?Math.pow(x,0.4):Math.pow(x,0.25)*(top?0.35:1) }
const practical=(r,mover)=>((mover==='w'?r.w:r.b)+r.d/2)/Math.max(1,r.games);
function recentLines(){ return (Store.get('orecent')||{})[S.op.id]||[] }
function rememberLine(){ if(!S.op||!S.op.rep||!S.oppPicks.length) return; const all=Store.get('orecent')||{};
  all[S.op.id]=(all[S.op.id]||[]).concat([S.oppPicks.slice(0,40)]).slice(-6); Store.put('orecent',all) }
function repRecord(fen,ok){ if(training()) return; const s=stats(S.op.id); s.rep=s.rep||{}; const id=posId(normKey(fen)); const st=s.rep[id]||{n:0,w:0}; st.n++; if(!ok) st.w++; s.rep[id]=st; saveStats(S.op.id,s) }
function repPick(fen,file){
  const bk=oppBookNow(fen), useBook=!!(bk&&!bk.demo&&bk.total>=20), rs=stats(S.op.id).rep||{};
  let kids=file.slice();
  const min=(+Settings.get('ominshare')||0)/100;
  if(min>0&&useBook){ const keep=kids.filter(u=>replyShare(fen,u,bk)>=min); if(keep.length) kids=keep }
  const recent=recentLines(), opp=fen.split(' ')[1], trappy=!!Settings.get('otrappy');
  const opts=kids.map(u=>{ const f=after(fen,u), cid=posId(normKey(f)), st=rs[cid]; const sh=useBook?replyShare(fen,u,bk):0;
    return {u,cid,weak:st?(st.w+1)/(st.n+2):0.6,seen:recent.reduce((a,l)=>a+(l.includes(cid)?1:0),0),x:sh?sh*stayAfter(f,2):0,row:bk&&bk.rows.find(r=>r.uci.slice(0,4)===u.slice(0,4))} });
  const top=Math.max(...opts.map(o=>o.x)); for(const o of opts) o.pop=useBook?varietyWeight(o.x,o.x===top&&top>0):1;
  const popSum=opts.reduce((a,o)=>a+o.pop,0)||1, seenSum=opts.reduce((a,o)=>a+o.seen,0);
  for(const o of opts){ o.w=(0.25+o.weak)*o.pop*Math.pow(0.3,Math.max(0,o.seen-seenSum*o.pop/popSum));
    if(trappy&&o.row&&o.row.games>=20) o.w*=Math.pow(practical(o.row,opp)/0.5,4) }
  const p=pickW(opts,opts.map(o=>o.w)); S.oppPicks.push(p.cid);
  const why=!rs[p.cid]?'a line you have not trained yet':p.weak>=0.4?'a line you have missed before':`one of ${kids.length} replies you prepared`;
  return {uci:p.u,why:file.length>1?'Your prep · '+why:''};
}
function pickW(items,weights){
  const tot=weights.reduce((a,b)=>a+b,0); if(!(tot>0)) return items[Math.floor(Math.random()*items.length)];
  let r=Math.random()*tot; for(let i=0;i<items.length;i++){ r-=weights[i]; if(r<=0) return items[i] } return items[items.length-1];
}
/* The opponent's book pick in presets: weighted by games, only moves at or above the minimum share;
   "trappy" favours moves that score well in practice for the side playing them. */
function pickBook(bk,fen){
  const min=Math.max(0.01,(+Settings.get('ominshare')||0)/100), mover=fen.split(' ')[1], trappy=!!Settings.get('otrappy');
  let rows=bk.rows.filter(r=>r.share>=min); if(!rows.length) rows=[bk.rows.slice().sort((a,b)=>b.games-a.games)[0]];
  const w=r=>trappy?Math.sqrt(r.games)*(r.games>=20?Math.pow(practical(r,mover)/0.5,6):1):Math.pow(Math.max(r.share,0.005),0.75);
  return pickW(rows,rows.map(w)).uci;
}

async function opponentMove(){
  if(S.phase!=='await'&&S.phase!=='busy') return;
  const lid=S.lineId;
  S.phase='busy'; S.busy=true; draw(); status('','Thinking…','');
  const fen=S.g.fen();
  let uci=null, note='';
  if(S.op.rep){
    const file=repMovesAt(fen);
    if(!file.length) return endLine('End of your prep in this line.');
    const bk=await Book.oppMoves(fen); await Book.moves(fen,'b22'); if(lid!==S.lineId) return;
    const p=repPick(fen,file); uci=p.uci; note=p.why;
    if(bk&&!bk.demo&&bk.level&&bk.level!=='masters') note=(note?note+' · ':'')+Book.levelLabel(bk.level)+' opponent';
  }else{
    /* against a player: their own moves while their games go, then the book */
    const theirs=S.op.player&&window.PlayersTab?PlayersTab.movesAt(S.op.player,S.op.their,fen).filter(x=>x.me):[];
    const bk=theirs.length?null:await Book.oppMoves(fen); if(lid!==S.lineId) return;
    if(theirs.length){ const tot=theirs.reduce((a,x)=>a+x.n,0); const x=pickW(theirs,theirs.map(y=>y.n)); uci=x.uci;
      note=`${S.op.name.replace(/^vs /,'')} played ${x.san} in ${x.n} of ${tot} game${tot>1?'s':''} here.` }
    else if(!bk||!bk.rows.length||(!bk.demo&&bk.total<20)){
      /* past the book: Stockfish plays on until the line length (your moves are judged by the engine already) */
      uci=await engineReply(fen); if(lid!==S.lineId) return;
      if(!uci) return endLine('The book runs out here.');
      if(!S.outBook){ S.outBook=S.log.length; }
      note='Out of book: Stockfish plays on.';
    }else
    if(bk.demo){
      /* the demo book has no game counts: keep only the named moves Stockfish rates as sound */
      const ok=await soundDemoMoves(fen,bk.rows.map(r=>r.uci)); if(lid!==S.lineId) return;
      uci=pickW(ok.map(x=>x.uci),ok.map(x=>x.w));
      note='Named lines, checked by Stockfish (no book here).';
    }else{ uci=pickBook(bk,fen); if(S.op.player) note='Out of their games: the book plays on.' }
  }
  if(!uci) return endLine('The book runs out here.');
  const m=S.g.move({from:uci.slice(0,2),to:uci.slice(2,4),promotion:uci[4]||'q'});
  if(!m) return endLine('The book runs out here.');
  S.log.push({san:m.san,uci:m.from+m.to+(m.promotion||''),who:'opp',before:fen}); S.fens.push(S.g.fen());
  S.phase='await'; S.busy=false; S.hintStage=0; S.browse=null;
  draw();
  status('','Your move.',note);
  renderSide(); renderBook(); renderEval();
}
/* Past the book: Stockfish's reply (MultiPV 3, depth 12), picking among moves within 0.05 winning
   chances of the best (0.1 with "trappy"), weighted toward the best, so lines don't all go the same way. */
async function engineReply(fen){
  if(SharedEngine.failed) return null;
  const a=await SharedEngine.analyse(fen,12,3,8000).catch(()=>null);
  if(!a||!a.length) return null;
  const val=l=>l.mate!=null?(l.mate>0?15:-15):l.cp;
  const best=wc(val(a[0])), lim=Settings.get('otrappy')?0.1:0.05;
  const ok=a.filter(l=>best-wc(val(l))<=lim);
  return pickW(ok.map(l=>l.uci),ok.map(l=>Math.exp(-(best-wc(val(l)))/0.015)));
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
/* a position you took back isn't rated again in this line (its first try already counted) */
const scoredAt=fen=>S.scored.some(s=>s.fen===fen);

async function userMove(from,to,promo){
  if(!S.op||S.phase!=='await'||S.busy||browsing()) return;
  const lid=S.lineId, fen=S.g.fen();
  const test=new Chess(fen); const m=test.move({from,to,promotion:promo||'q'});
  if(!m) return;
  const uci=from+to+(m.promotion||'');
  S.busy=true; tools();
  if(S.op.rep){
    const file=repMovesAt(fen);
    const hit=file.some(u=>u.slice(0,4)===uci.slice(0,4));
    if(hit){ repRecord(fen,true); await accept(fen,m,uci,file,1,'In your repertoire.',lid) }
    else{
      if(!file.length){ S.busy=false; return endLine('End of your prep in this line.') }
      S.misses.push({fen,played:m.san,answer:file.map(u=>sanOf(fen,u)).join(' or ')}); repRecord(fen,false);
      if(!scoredAt(fen)) S.scored.push({fen,s:0,d:await moveDifficulty(fen,file),miss:true});
      if(lid!==S.lineId) return;
      S.busy=false; tools();
      board.flash([from,to],'bad');
      status('bad',`${m.san} isn’t in your repertoire.`,`Try again, or use Hint (H)${file.length?` — your file gives ${file.length>1?file.length+' moves':sanOf(fen,file[0])} here`:''}.`);
      return;
    }
  }else{
    const bk=await Book.moves(fen,'masters'); if(lid!==S.lineId) return;
    const row=bk&&bk.rows.find(r=>r.uci.slice(0,4)===uci.slice(0,4));
    const minShare=(+Settings.get('oshare')||3)/100;
    if(row&&(bk.demo||row.share>=minShare)){
      await accept(fen,m,uci,null,1,bk.demo?'A known line.':`Elite players chose ${m.san} in ${Math.round(row.share*100)}% of ${bk.total.toLocaleString()} games.`,lid);
    }else if(row){
      await accept(fen,m,uci,null,0.5,`Rare: ${Math.round(row.share*100)||'<1'}% of elite games — playable.`,lid);
    }else{
      /* Off book: ask Stockfish how much it costs against the best book move. */
      status('', 'Checking…','');
      const depth=+Settings.get('sfDepth')>0?+Settings.get('sfDepth'):14;
      const top=bk&&bk.rows[0];
      let verdictText='Not a book move.';
      let drop=null;
      const a=await SharedEngine.analyse(fen,depth,2,8000).catch(()=>null);
      if(lid!==S.lineId) return;
      if(a&&a.length){
        const best=cpPawns(a[0].cp*100);
        const after2=await SharedEngine.analyse(test.fen(),depth,1,8000).catch(()=>null);
        if(lid!==S.lineId) return;
        if(after2&&after2.length){
          const mine=-cpPawns(after2[0].cp*100);
          drop=wc(best)-wc(mine);
          if(drop<0.1){
            /* past the end of the book, a move as good as Stockfish's is simply right */
            if(S.outBook&&!(bk&&bk.rows.length)) await accept(fen,m,uci,null,1,`Out of book: as good as Stockfish’s choice${a[0].uci.slice(0,4)===uci.slice(0,4)?'':' ('+sanOf(fen,a[0].uci)+')'}.`,lid);
            else await accept(fen,m,uci,null,0.5,`Off book but playable (about ${Math.abs(best-mine).toFixed(1)} pawns from the top move).`,lid);
            return }
          verdictText=`${m.san} loses about ${(best-mine).toFixed(1)} pawns. Best here: ${top?sanOf(fen,top.uci):sanOf(fen,a[0].uci)}.`;
        }
      }else if(top){ verdictText=`Not a book move. Elite players prefer ${sanOf(fen,top.uci)}.` }
      S.misses.push({fen,played:m.san,answer:top?sanOf(fen,top.uci):'',drop});
      if(!scoredAt(fen)) S.scored.push({fen,s:0,d:await moveDifficulty(fen),miss:true});
      if(lid!==S.lineId) return;
      S.busy=false; tools();
      board.flash([from,to],'bad');
      status('bad',verdictText,'Try again, or use Hint (H).');
      return;
    }
  }
}
async function accept(fen,m,uci,good,score,noteText,lid){
  if(!scoredAt(fen)){ const d=await moveDifficulty(fen,good||[uci]); if(!scoredAt(fen)) S.scored.push({fen,s:S.tb&&S.tb.has(fen)?0:score,d}) }
  if(lid!==undefined&&lid!==S.lineId) return;
  S.g.move({from:m.from,to:m.to,promotion:m.promotion});
  S.log.push({san:m.san,uci,who:'me',ok:score>=1?'ok':'half',before:fen}); S.fens.push(S.g.fen());
  S.userMoves++; S.busy=false; S.hintStage=0; S.browse=null;
  draw(); board.flash([m.from,m.to],'good');
  status('good',score>=1?`${m.san} ✓`:`${m.san} — half credit`,noteText||'');
  renderSide(); renderEval();
  if(S.userMoves>=lineMax()) return endLine('Line complete.');
  const id=S.lineId, n=S.log.length;   /* only for this line and this move: Next line or a take back in the meantime cancels the reply */
  setTimeout(()=>{ if(S.lineId===id&&S.log.length===n&&S.phase==='await'&&S.g.turn()!==myColor()) opponentMove() },650);
}

/* ---------- Take back: your last move and the reply to it ---------- */
function lastMine(){ for(let i=S.log.length-1;i>=0;i--){ const w=S.log[i].who; if(w==='me') return i; if(w!=='opp') return -1 } return -1 }
function canTakeBack(){ return !!(S.op&&S.g&&S.phase==='await'&&!S.busy&&!browsing()&&lastMine()>=0) }
function takeBack(){
  if(!canTakeBack()) return; const j=lastMine();
  const fen=S.log[j].before; (S.tb=S.tb||new Set()).add(fen);
  S.log.length=j; S.fens.length=j+1; S.g=new Chess(S.fens[j]); S.userMoves=Math.max(0,S.userMoves-1);
  S.hintStage=0; S.browse=null; S.oppPicks=S.oppPicks.slice(0,Math.max(0,S.log.filter(x=>x.who==='opp').length));
  draw(); renderSide(); renderBook(); renderEval();
  status('warn','Taken back.',training()?'Try another move.':'Try another move. This position isn’t rated again in this line.');
}

function endLine(msg){
  S.phase='done'; S.busy=false; S.browse=null;
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
    st.history.push({t:Date.now(),r:st.rating,m:'r'});
    if(st.history.length>200) st.history=st.history.slice(-200);
    saveStats(S.op.id,st);
  }else if(training()){ st.lines++; st.last=Date.now(); st.history.push({t:Date.now(),r:st.rating,m:'t'}); if(st.history.length>200) st.history=st.history.slice(-200); saveStats(S.op.id,st) }
  rememberLine();
  S.endMsg=msg;
  const missTxt=S.misses.length?`<br>${S.misses.length} miss${S.misses.length>1?'es':''}: ${S.misses.map(x=>`${esc(x.played)}${x.answer?' (prep: '+esc(x.answer)+')':''}`).join(', ')}`:'<br>Every move you played was right.';
  status(S.misses.length?'warn':'good',`${msg}${training()?'':` · ${delta>=0?'+':''}${delta} rating`}`,'');
  $('o-status').innerHTML+=missTxt+'<span id="o-sfinfo"></span>';
  const nx=document.createElement('button'); nx.className='btn primary endnext'; nx.textContent='Next line (N)';
  nx.addEventListener('click',newLine); $('o-status').appendChild(nx);
  /* a banner on the board itself, so the end of the line is obvious on a phone */
  const box=$('o-boardbox'); box.classList.remove('end-good','end-warn'); box.classList.add(S.misses.length?'end-warn':'end-good');
  $('o-endtext').textContent=(S.misses.length?`${msg} ${S.misses.length} miss${S.misses.length>1?'es':''}`:`${msg} ✓ All right`)+(training()?'':` · ${delta>=0?'+':''}${delta}`);
  $('o-endbar').hidden=false;
  draw(); renderSide(); renderBook(); renderEval();
  finalEval(S.op.id,S.lineId);
  if(!S.misses.length&&Settings.get('autoNext')){ const id=S.lineId; setTimeout(()=>{ if(S.lineId===id&&S.phase==='done'&&document.body.dataset.view==='openings') newLine() },2500) }
}
/* Stockfish's view of the final position (White's side): stored with the line for Statistics; shown with "Stockfish info". */
async function finalEval(id,lid){
  if(SharedEngine.failed) return; const fen=S.g.fen(); const g=new Chess(fen); if(g.game_over()) return;
  const a=await SharedEngine.analyse(fen,12,1,6000).catch(()=>null); if(!a||!a.length||lid!==S.lineId) return;
  const p=a[0].mate!=null?(a[0].mate>0?99:-99):a[0].cp, white=fen.split(' ')[1]==='w'?p:-p;
  const st=stats(id); const h=st.history[st.history.length-1]; if(h&&Date.now()-h.t<120000){ h.e=Math.max(-20,Math.min(20,Math.round(white*100)/100)); saveStats(id,st) }
  S.finalEv={ev:white,best:sanOf(fen,a[0].uci),mate:a[0].mate};
  const el=$('o-sfinfo'); if(el&&Settings.get('osfinfo')) el.innerHTML=`<br><span class="note">Stockfish: ${esc(fmtW(white,a[0].mate,fen))} · best ${esc(sanOf(fen,a[0].uci))}</span>`;
  renderEval();
}
const fmtW=(p,mate,fen)=>{ if(mate!=null){ const w=fen.split(' ')[1]==='w'?mate:-mate; return '#'+(w<0?'-':'')+Math.abs(w) } return (p>0?'+':'')+p.toFixed(1) };

function status(tone,head,rest){
  const el=$('o-status'); el.className='status'+(tone?' '+tone:'');
  el.innerHTML=`<strong>${esc(head)}</strong>${rest?esc(rest):''}`;
}

/* ---------- Eval bar (Settings: Show eval): after each move in Training, at the end of the line in Rated ---------- */
async function renderEval(){
  const bar=$('o-evalbar'), on=!!Settings.get('evalCol')&&S.g&&peek();
  bar.hidden=!on; if(!on) return;
  const v=viewPos(), fen=v.g.fen(), lid=S.lineId, at=S.browse;
  if(v.g.game_over()) return;
  const a=await SharedEngine.analyse(fen,12,1,6000).catch(()=>null); if(!a||!a.length||lid!==S.lineId||at!==S.browse) return;
  const p=a[0].mate!=null?(a[0].mate>0?15:-15):a[0].cp, white=fen.split(' ')[1]==='w'?p:-p;
  bar.querySelector('i').style.width=Math.round(50+50*wc(white))+'%';
  bar.title='Stockfish: '+fmtW(white,a[0].mate,fen)+' (White’s side)';
  $('o-evaltxt').textContent=fmtW(white,a[0].mate,fen);
}

/* ---------- Notes: the PGN's own comments, move marks and arrows ---------- */
function annAt(i){ const A=S.op&&S.op.rep&&repAnn(S.op.id), x=S.log[i]; if(!A||!x) return null;
  const e=A[posId(normKey(x.before))+'|'+x.uci]; return e?{marks:e[0]||'',text:e[1]||'',shapes:e[2]||''}:null }
function noteShapes(){ if(!S.op||!S.g||!peek()) return ''; const i=(browsing()?S.browse:S.log.length)-1; const a=i>=0?annAt(i):null; return a&&a.shapes||'' }
function renderNotes(){
  const card=$('o-notecard'), el=$('o-notes'); const A=S.op&&S.op.rep&&repAnn(S.op.id);
  card.hidden=!A; if(!A||!S.g){ el.innerHTML=''; return }
  const open=peek(), t=startFen().split(' '), off=t[1]==='b'?1:0, n0=+t[5]||1, cur=browsing()?S.browse-1:S.log.length-1;
  const out=[]; let line=[], notes=0;
  const flush=()=>{ if(line.length) out.push(`<p class="cline">${line.join(' ')}</p>`); line=[] };
  S.log.forEach((x,i)=>{ const a=annAt(i), ply=i+off, num=n0+Math.floor(ply/2), white=ply%2===0;
    const lab=white?`${num}. ${esc(x.san)}`:(line.length?esc(x.san):`${num}… ${esc(x.san)}`);
    line.push(`<button type="button" class="cm${i===cur?' cur':''}${open&&a&&a.text?' has':''}" data-ply="${i+1}"${i===cur?' aria-current="true"':''}>${lab}${open&&a&&a.marks?markHtml(a.marks):''}</button>`);
    if(open&&a&&a.text){ notes++; flush(); out.push(`<div class="ctext${i===cur?' cur':''}">${a.text.split('\n\n').map(p=>`<p>${esc(p)}</p>`).join('')}</div>`) } });
  flush();
  const head=!open?'<p class="note">Rated: your PGN’s notes on these moves open when the line ends, so they can’t give your next move away. Training shows them as you play.</p>'
    :!S.log.length?'<p class="note">Your PGN’s notes, marks and arrows appear here under each move as the line is played.</p>'
    :notes?'':'<p class="note">No notes on these moves.</p>';
  el.innerHTML=head+`<div class="cflow">${out.join('')||'<span class="note">Starting position</span>'}</div>`;
  const c=el.querySelector('.cm.cur'); if(c){ const nt=c.parentElement.nextElementSibling, tg=nt&&nt.classList.contains('ctext')?nt:c;
    const r=tg.getBoundingClientRect(), R=el.getBoundingClientRect(); if(r.bottom>R.bottom||r.top<R.top) el.scrollTop+=r.top-R.top-30 }
}

/* ---------- Side panel ---------- */
function renderSide(){
  renderAcct();
  if(!S.op){ $('o-name').textContent='Choose an opening'; return }
  const names=Book.nameOf(S.fens);
  $('o-name').textContent=S.op.name;
  const st=stats(S.op.id);
  const delta=st.rating-S.startRating;
  $('o-rate').innerHTML=training()?'<span class="note">Training mode: the rating doesn’t move.</span>'
    :`<b>${st.rating}</b><span class="delta ${delta>0?'up':delta<0?'down':''}">${delta?(delta>0?'+':'')+delta+' this line':''}</span><span class="note">· ${st.lines} lines</span>`;
  const btns=$('o-sidebtns'); btns.innerHTML='';
  { const b=document.createElement('button'); b.className='btn sm'; b.id='o-savepos'; b.textContent='Save this position'; b.title='Make the moves on the board a position of your own, to train from';
    b.disabled=!S.g; b.addEventListener('click',()=>saveCurrent()); btns.appendChild(b) }
  if(S.op.custom){ const e=document.createElement('button'); e.className='btn sm'; e.id='o-editpos'; e.textContent='Rename or edit'; e.addEventListener('click',()=>openNew(S.op)); btns.appendChild(e);
    const d=document.createElement('button'); d.className='btn sm'; d.id='o-delpos'; d.textContent='Delete position';
    d.addEventListener('click',()=>{ if(confirm('Delete this position and its stats?')) deleteCustom(S.op.id) }); btns.appendChild(d) }
  if(S.op.rep){
    /* start lines from the position on the board (moves you can step back to with ←) */
    const v=browsing()?S.browse:S.log.length, ms=S.log.slice(0,v).map(x=>x.san), cur=S.op.moves||[];
    const okStart=v>0&&S.log.slice(0,v).every(x=>repMovesAt(x.before).some(u=>u.slice(0,4)===x.uci.slice(0,4)));
    if(okStart&&!(ms.length===cur.length&&ms.every((m,i)=>m===cur[i]))){ const b=document.createElement('button'); b.className='btn sm'; b.id='o-setstart';
      b.textContent='Start lines here'; b.title='This repertoire’s lines start from the position on the board ('+startText(ms,startFen())+')';
      b.addEventListener('click',()=>{ Store.put('ostart-'+S.op.id,{moves:ms}); S.op.moves=ms.slice(); renderList(); newLine() }); btns.appendChild(b) }
    if(cur.length){ const b=document.createElement('button'); b.className='btn sm'; b.id='o-resetstart'; b.textContent='Start from move 1';
      b.title='Lines start at '+startText(cur,startFen())+' now';
      b.addEventListener('click',()=>{ Store.del('ostart-'+S.op.id); S.op.moves=[]; renderList(); newLine() }); btns.appendChild(b) }
    const del=document.createElement('button'); del.className='btn sm'; del.textContent='Delete repertoire';
    del.addEventListener('click',()=>{ if(!confirm('Delete this repertoire and its stats?')) return;
      for(const k of ['rep-','stats-','ostart-']) Store.del(k+S.op.id); REPMAPS.delete(S.op.id); ANNS.delete(S.op.id);
      Store.put('reps-index',repIndex().filter(r=>r.id!==S.op.id)); S.op=null; $('o-pickname').textContent='Choose an opening'; renderList(); renderSide(); renderNotes() });
    btns.appendChild(del);
  }
  /* move list: click a move to see that position (← → step through, End comes back) */
  const ml=$('o-movelist'); let html=''; const off=startFen().split(' ')[1]==='b'?1:0, n0=+startFen().split(' ')[5]||1, cur=browsing()?S.browse-1:-1;
  S.log.forEach((e,i)=>{ const ply=i+off; if(ply%2===0||i===0) html+=`<span class="note">${n0+Math.floor(ply/2)}${ply%2?'…':'.'}</span> `;
    const a=peek()?annAt(i):null;
    html+=`<button type="button" class="omv ${e.ok==='ok'?'ok':e.ok==='half'?'inacc':''}${i===cur?' cur':''}" data-ply="${i+1}">${esc(e.san)}${a&&a.marks?markHtml(a.marks):''}</button> ` });
  ml.innerHTML=html||'<span class="note">No moves yet.</span>';
  const facts=$('o-facts');
  facts.innerHTML=`<dt>Opening</dt><dd>${names?esc(names[1])+' <span class="note">('+esc(names[0])+')</span>':'—'}</dd>
    <dt>Side</dt><dd>${side()==='white'?'White':'Black'}</dd>
    <dt>Opponent</dt><dd>${esc(Book.levelLabel(Settings.get('olevel')))}</dd>
    <dt>Book</dt><dd>${Book.hasBook(Settings.get('olevel'))?esc(Book.levelLabel(Settings.get('olevel')))+' games (Lichess, CC0)':'Named lines (no game counts)'}</dd>`+
    (S.op.rep?`<dt>Sidelines</dt><dd>${esc(VARIETY[variety()][0])}</dd>`:'');
  const lk=$('o-lichess');
  lk.href=S.op.startFen?'https://lichess.org/analysis/'+encodeURIComponent(S.g.fen().replace(/ /g,'_')):'https://lichess.org/analysis/pgn/'+encodeURIComponent(S.log.map(e=>e.san).join(' '));
  renderNotes(); tools();
}
function tools(){
  const b=$('o-back'); if(b) b.disabled=!canTakeBack();
  const n=S.log?S.log.length:0, at=browsing()?S.browse:n;
  $('o-prev').disabled=!S.g||at<=0; $('o-next').disabled=!browsing();
  $('o-browsenote').hidden=!browsing(); if(browsing()) $('o-browsenote').textContent=`Viewing move ${S.browse} of ${n} · → or End to come back`;
}
/* step through the line on the board (view only; the board takes moves again at the end) */
function browse(k){ if(!S.g||!S.log.length) return; S.browse=(k==null||k>=S.log.length)?null:Math.max(0,k); draw(); renderSide(); renderEval() }
async function renderBook(){
  const el=$('o-bookrows');
  const show=training()||S.phase==='done';
  const lv=Settings.get('olevel');
  $('o-booklabel').textContent=lv==='masters'?'Elite book':'Book: '+Book.levelLabel(lv)+' and Elite';
  if(!S.op){ el.innerHTML='<p class="note">Pick an opening to see the book.</p>'; return }
  if(!show){ el.innerHTML='<p class="note">The book shows here after the line (Rated mode).</p>'; return }
  const fen=viewPos().g.fen();
  /* with a club level on: that level's moves first, then the elite book's */
  const books=[];
  if(lv!=='masters'){ const c=await Book.moves(fen,lv); if(c&&!c.demo) books.push([Book.levelLabel(lv),c]) }
  const e=await Book.moves(fen,'masters'); if(e) books.push([e.demo?'Named lines':Book.levelLabel('masters'),e]);
  if(!books.length){ el.innerHTML='<p class="note">No book data for this position.</p>'; return }
  const table=(title,bk)=>`<div class="booksec"><div class="note booktitle">${esc(title)}${bk.total?' · '+bk.total.toLocaleString()+' games':''}</div>`+
    (bk.demo?'<p class="note">No game counts here: named lines only.</p>':'')+
    bk.rows.slice(0,8).map(r=>{
      const tot=r.games||1, pw=Math.round(100*r.w/tot), pd=Math.round(100*r.d/tot), pb=100-pw-pd;
      return `<div class="bookrow"><span class="mv">${esc(r.san||sanOf(fen,r.uci))}</span>
        <span class="wdl" title="${pw}% / ${pd}% / ${pb}%"><i class="w" style="width:${pw}%"></i><i class="d" style="width:${pd}%"></i><i class="b" style="width:${pb}%"></i></span>
        <span class="note">${r.games?Math.round(r.share*100)+'%':''}</span>
        <span class="note">${r.games?r.games.toLocaleString():''}</span></div>`;
    }).join('')+'</div>';
  el.innerHTML=books.map(([t,b])=>table(t,b)).join('');
}

/* ---------- Hint ---------- */
async function hint(){
  if(!S.op||S.phase!=='await'||browsing()) return;
  const fen=S.g.fen();
  let u=null;
  if(S.op.rep){ const file=repMovesAt(fen); u=file[0] }
  else{ const bk=await Book.moves(fen,'masters'); u=bk&&bk.rows.length?bk.rows.reduce((a,b)=>a.share>=b.share?a:b).uci:null;
    if(!u){ const a=await SharedEngine.analyse(fen,12,1,6000).catch(()=>null); u=a&&a[0]&&a[0].uci } }
  if(!u){ status('warn','No hint here.',''); return }
  if(S.hintStage===0){ S.hintStage=1; board.setHint(u.slice(0,2)); status('warn','Hint: this piece moves.','Hint again (H) shows the move.') }
  else{ board.setHint(u.slice(0,2),u.slice(2,4)); status('warn','Answer: '+sanOf(fen,u),'That move earns no rating now.');
    if(!scoredAt(fen)) S.scored.push({fen,s:0,d:await moveDifficulty(fen),hint:true}) }
}

/* ---------- Import ---------- */
function openImport(){ $('o-importmodal').hidden=false; $('o-reperr').textContent=''; setPop(false) }
/* A Lichess study link -> its PGN (public API, no login; private studies are refused by Lichess). */
function studyApi(url){
  const m=String(url).trim().match(/lichess\.org\/study\/([A-Za-z0-9]{8})(?:\/([A-Za-z0-9]{8}))?/);
  return m?'https://lichess.org/api/study/'+m[1]+(m[2]?'/'+m[2]:'')+'.pgn':null;
}
async function fetchStudy(){
  const api=studyApi($('o-studyurl').value); const err=$('o-reperr');
  if(!api){ err.textContent='That is not a Lichess study link (https://lichess.org/study/…).'; return false }
  err.textContent='Fetching the study…';
  try{
    const r=await fetch(api); if(r.status===403||r.status===404){ err.textContent='Lichess would not share that study: make it public or unlisted, then try again.'; return false }
    if(!r.ok) throw new Error('Lichess answered '+r.status);
    const pgn=await r.text(); if(!/\d\.\s*[A-Za-z]/.test(pgn)) throw new Error('the study has no moves');
    $('o-pgnbox').value=pgn;
    const tag=k=>{ const m=pgn.match(new RegExp('\\['+k+' "([^"]*)"\\]')); return m?m[1]:'' };
    if(!$('o-repname').value.trim()) $('o-repname').value=(tag('StudyName')||tag('Event')||'').slice(0,60);
    const o=tag('Orientation'); if(o==='black'||o==='white') $('o-repside').value=o;
    const n=(pgn.match(/\[Event /g)||[]).length;
    err.textContent=`Fetched ${n} chapter${n===1?'':'s'}. Check the name and side, then Import.`; return true;
  }catch(e){ err.textContent='Could not fetch the study ('+(e.message||e)+').'; return false }
}
async function doImport(){
  if(!$('o-pgnbox').value.trim()&&$('o-studyurl').value.trim()){ if(!await fetchStudy()) return }
  if(studyApi($('o-pgnbox').value)&&$('o-pgnbox').value.trim().length<200){ $('o-studyurl').value=$('o-pgnbox').value.trim(); $('o-pgnbox').value=''; if(!await fetchStudy()) return }
  const text=$('o-pgnbox').value;
  const name=$('o-repname').value.trim()||'My repertoire';
  const sideV=$('o-repside').value;
  try{
    const r=parseRepPGN(text);
    const id='imp-'+Date.now().toString(36);
    const data={name,side:sideV,pos:Object.fromEntries(Object.entries(r.pos).map(([k,v])=>[k,v.join(' ')])),ann:r.ann,startFen:r.startFen||undefined};
    Store.put('rep-'+id,data);
    if(!Store.get('rep-'+id)) throw new Error('This browser has no room left to store that repertoire (it keeps everything on this device). Export your progress and remove an old repertoire, or import a smaller PGN.');
    const idx=repIndex(); idx.push({id,name,side:sideV,positions:r.positions,notes:Object.keys(r.ann).length,startFen:r.startFen||undefined}); Store.put('reps-index',idx);
    $('o-importmodal').hidden=true; $('o-pgnbox').value=''; $('o-studyurl').value=''; $('o-repname').value='';
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
  STAY.clear(); renderSide(); renderBook();
}

/* ---------- Trainer settings (the gear on the Openings tab) ---------- */
const SETTINGS_KEYS=['olen','ovariety','ominshare','otrappy','evalCol','osfinfo','oshare','sfDepth'];
function renderSetModal(){
  const D=k=>Settings.get(k);
  const seg=(k,opts)=>`<div class="seg mseg" role="group">${opts.map(([v,l])=>`<button type="button" data-seg="${k}" data-v="${v}" aria-pressed="${String(D(k))===String(v)}">${esc(l)}</button>`).join('')}</div>`;
  const sw=(k,label,hint)=>`<div class="mset"><label class="toggle swrow"><input type="checkbox" data-k="${k}"${D(k)?' checked':''}> <b>${label}</b></label>${hint?`<p class="note">${hint}</p>`:''}</div>`;
  const sel=(k,label,opts,hint)=>`<div class="mset"><label class="field"><b>${label}</b><select data-k="${k}">${opts.map(([v,l])=>`<option value="${esc(v)}"${String(D(k))===String(v)?' selected':''}>${esc(l)}</option>`).join('')}</select></label>${hint?`<p class="note">${hint}</p>`:''}</div>`;
  const len=D('olen');
  $('o-setbody').innerHTML=
    `<div class="mset"><b>Line length</b>${seg('olen',Object.keys(LENS).map(k=>[k,LEN_NAMES[k]]))}<p class="note">${LEN_NAMES[len]||'Long'}: the line ends after ${LENS[len]||12} of your moves, or earlier if the book or your prep runs out.</p></div>`+
    `<div class="mset"><b>Sidelines in repertoires</b>${seg('ovariety',Object.entries(VARIETY).map(([k,[l]])=>[k,l]))}<p class="note">${esc(VARIETY[variety()][1])}</p></div>`+
    `<div class="mset"><label class="field"><b>Opponent only plays moves played at least <span id="o-minv">${+D('ominshare')||0}%</span> of the time</b>
      <input type="range" data-k="ominshare" min="0" max="80" step="5" value="${+D('ominshare')||0}"></label>
      <p class="note">Measured in the opponent's book at each position. 0% plays any book move, in proportion to how often it is chosen. If no move reaches the bar, the most played one is used. In repertoires it skips the prepared replies that are rarely played.</p></div>`+
    sw('otrappy','Opponent prefers trappy lines','Book replies lean toward the ones that score best in practice for the side playing them. Past the book, Stockfish picks among moves within 0.1 winning chances of its best instead of 0.05.')+
    sw('evalCol','Show eval','An eval bar under the board (Stockfish, White’s side). In Rated mode it appears when the line ends.')+
    sw('osfinfo','Stockfish info after each line','Stockfish’s eval and best move for the final position, under the result.')+
    sel('oshare','Book move threshold (presets)',[['1','1%'],['3','3%'],['5','5%'],['10','10%']],'A preset move below this share of elite games counts as rare (half credit).')+
    sel('sfDepth','Stockfish depth for checks',[['auto','Auto (14)'],['12','12'],['14','14'],['16','16'],['18','18'],['20','20']],'How deep Stockfish checks moves that are not in the book. Each step of 2 roughly doubles the time.');
}
function openSettings(){ renderSetModal(); $('o-setmodal').hidden=false; const f=$('o-setbody').querySelector('button,input,select'); if(f) f.focus() }

/* ---------- Statistics: one row per opening you have trained ---------- */
const ST={sort:'lines',dir:-1,all:false};
function statRows(){
  return ordered(openings()).map(o=>{ const st=stats(o.id); const ev=st.history.map(h=>h.e).filter(e=>typeof e==='number');
    const last=st.last?new Date(st.last).toISOString().slice(0,10):'';
    return {o,name:o.name,side:o.side,lines:st.lines||0,rating:Math.round(st.rating),avg:ev.length?ev.reduce((a,b)=>a+b,0)/ev.length:null,nev:ev.length,last,misses:Object.values(st.rep||{}).reduce((a,x)=>a+(x.w||0),0)} })
    .filter(r=>ST.all||r.lines>0);
}
function renderStats(){
  const rows=statRows(), k=ST.sort, d=ST.dir;
  rows.sort((a,b)=>{ const x=a[k], y=b[k]; if(x==null&&y==null) return 0; if(x==null) return 1; if(y==null) return -1; return (typeof x==='string'?x.localeCompare(y):x-y)*d });
  const W=rows.filter(r=>r.side==='white'), B=rows.filter(r=>r.side==='black'), sum=a=>a.reduce((t,r)=>t+r.lines,0);
  const avgR=a=>{ const t=a.filter(r=>r.lines>0); return t.length?Math.round(t.reduce((s,r)=>s+r.rating,0)/t.length):'—' };
  const tile=(lab,all,w,b)=>`<div class="stat"><span class="label">${lab}</span><b>${all}</b><span class="note">White ${w} · Black ${b}</span></div>`;
  const th=(key,label)=>`<th><button type="button" class="sortbtn" data-sort="${key}" aria-sort="${ST.sort===key?(ST.dir>0?'ascending':'descending'):'none'}">${label}${ST.sort===key?(ST.dir>0?' ↑':' ↓'):''}</button></th>`;
  $('o-statsbody').innerHTML=`<div class="stats">${tile('Lines played',sum(rows),sum(W),sum(B))}${tile('Openings trained',rows.filter(r=>r.lines>0).length,W.filter(r=>r.lines>0).length,B.filter(r=>r.lines>0).length)}${tile('Average rating',avgR(rows),avgR(W),avgR(B))}</div>
    <label class="toggle"><input type="checkbox" id="o-stall"${ST.all?' checked':''}> Show openings you haven't trained</label>
    ${rows.length?`<div class="tablewrap" style="margin-top:10px"><table class="stable"><thead><tr>${th('name','Opening')}${th('side','Side')}${th('lines','Lines')}${th('rating','Rating')}${th('avg','Average eval')}${th('misses','Misses')}${th('last','Last trained')}<th><span class="sr-only">Train</span></th></tr></thead>
      <tbody>${rows.map(r=>`<tr><td>${esc(r.name)}${r.o.rep?' <span class="src">Rep</span>':''}</td><td>${r.side==='white'?'White':'Black'}</td><td>${r.lines}</td><td>${r.rating}</td><td title="${r.nev?`Average of ${r.nev} line${r.nev>1?'s':''}, White’s side`:'No evals yet'}">${r.avg==null?'—':(r.avg>0?'+':'')+r.avg.toFixed(2)}</td><td>${r.misses||''}</td><td class="note">${esc(r.last)}</td><td><button class="btn sm" type="button" data-train="${esc(r.o.id)}">Train</button></td></tr>`).join('')}</tbody></table></div>`
      :'<p class="note">No lines played yet. Finish a line in Openings and it shows up here.</p>'}
    <p class="note">Average eval: Stockfish’s view of the final position of each line (depth 12, White’s side, + favours White). Misses: repertoire moves you got wrong, all time.</p>`;
}
function openStats(){ setPop(false); renderStats(); $('o-statsmodal').hidden=false }

/* ---------- Wiring ---------- */
function init(){
  board=makeBoard($('o-board'),{onMove:userMove});
  $('o-pick').addEventListener('click',()=>setPop($('o-pop').hidden));
  document.addEventListener('pointerdown',e=>{ if(!$('o-pop').hidden&&!e.target.closest('.opick')&&!e.target.closest('.modal')) setPop(false) });
  $('o-search').addEventListener('input',e=>renderList(e.target.value));
  $('o-search').addEventListener('keydown',e=>{ if(e.key==='Enter'){ const b=$('o-list').querySelector('button.drill'); if(b) b.click() } });
  $('o-arrange').addEventListener('click',()=>setArrange(!S.arrange));
  $('o-resetorder').addEventListener('click',()=>{ Store.del('olist'); renderList() });
  $('o-list').addEventListener('click',e=>{ if(!S.arrange) return; const m=e.target.closest('[data-mv]'); if(m) moveItem(m.closest('.arr').dataset.id,+m.dataset.mv) });
  $('o-list').addEventListener('pointerdown',e=>{
    const g=e.target.closest('.grip'); if(!S.arrange||!g) return; e.preventDefault(); const item=g.closest('.arr'), L=$('o-list'); item.classList.add('dragging');
    const move=ev=>{ const y=ev.clientY, items=[...L.querySelectorAll('.arr:not(.dragging)')];
      const nxt=items.find(x=>{ const r=x.getBoundingClientRect(); return y<r.top+r.height/2 }); if(nxt) L.insertBefore(item,nxt); else L.appendChild(item);
      const r=L.getBoundingClientRect(); if(y<r.top+30) L.scrollTop-=12; else if(y>r.bottom-30) L.scrollTop+=12 };
    const up=()=>{ removeEventListener('pointermove',move); removeEventListener('pointerup',up); removeEventListener('pointercancel',up); item.classList.remove('dragging');
      saveOrder([...L.querySelectorAll('.arr')].map(x=>x.dataset.id)); renderArrange() };
    addEventListener('pointermove',move); addEventListener('pointerup',up); addEventListener('pointercancel',up);
  });
  $('o-newline').addEventListener('click',newLine);
  $('o-endnext').addEventListener('click',newLine);
  $('o-hint').addEventListener('click',hint);
  $('o-back').addEventListener('click',takeBack);
  $('o-prev').addEventListener('click',()=>browse((browsing()?S.browse:S.log.length)-1));
  $('o-next').addEventListener('click',()=>{ if(browsing()) browse(S.browse+1) });
  $('o-flip').addEventListener('click',()=>{ board.flip(); S.orientSet=board.orient!==myColor(); Shapes.auto($('o-board'),noteShapes()) });
  $('o-import').addEventListener('click',openImport);
  $('o-npundo').addEventListener('click',()=>{ NP.g.undo(); renderNew() });
  $('o-npreset').addEventListener('click',()=>{ NP.g=new Chess(NP.fen||undefined); renderNew() });
  $('o-npflip').addEventListener('click',()=>{ NP.orient=NP.board.orient==='w'?'b':'w'; renderNew() });
  $('o-npside').addEventListener('change',()=>{ NP.orient=null; renderNew() });
  $('o-npname').addEventListener('input',()=>{ $('o-npname').dataset.auto='' });
  $('o-npfenload').addEventListener('click',()=>{ const f=$('o-npfen').value.trim(); let ok=!f; if(f){ try{ ok=new Chess().validate_fen(f).valid }catch(e){} }
    if(!ok){ $('o-nperr').textContent='That FEN is not a legal position.'; return } NP.fen=f||null; NP.g=new Chess(f||undefined); $('o-nperr').textContent='';
    if(f) $('o-npside').value=NP.g.turn()==='w'?'white':'black'; renderNew() });
  $('o-npsave').addEventListener('click',saveNew);
  $('o-npcancel').addEventListener('click',()=>{ $('o-newmodal').hidden=true; if(location.hash==='#openings/new') history.replaceState(null,'','#openings') });
  $('o-newmodal').addEventListener('click',e=>{ if(e.target.id==='o-newmodal') $('o-npcancel').click() });
  const hashNew=()=>{ if(location.hash==='#openings/new') openNew() }; addEventListener('hashchange',hashNew); setTimeout(hashNew,0);
  $('o-statsbtn').addEventListener('click',openStats);
  $('o-gear').addEventListener('click',openSettings);
  $('o-repsave').addEventListener('click',doImport);
  $('o-studyget').addEventListener('click',fetchStudy);
  $('o-studyurl').addEventListener('keydown',e=>{ if(e.key==='Enter') fetchStudy() });
  $('o-repcancel').addEventListener('click',()=>{ $('o-importmodal').hidden=true });
  $('o-pgnfile').addEventListener('change',async e=>{ const f=e.target.files&&e.target.files[0]; if(!f) return;
    if(f.size>8e6){ $('o-reperr').textContent='That file is over 8 MB: too big to keep in this browser.'; return }
    $('o-pgnbox').value=await f.text(); if(!$('o-repname').value.trim()) $('o-repname').value=f.name.replace(/\.pgn$/i,'').slice(0,60);
    $('o-reperr').textContent=`Read ${f.name}. Check the name and side, then Import.`; e.target.value='' });
  /* settings modal: every control writes its setting at once */
  $('o-setbody').addEventListener('click',e=>{ const b=e.target.closest('[data-seg]'); if(!b) return; Settings.set(b.dataset.seg,b.dataset.v); renderSetModal() });
  $('o-setbody').addEventListener('input',e=>{ const t=e.target; if(t.type==='range'){ $('o-minv').textContent=t.value+'%' } });
  $('o-setbody').addEventListener('change',e=>{ const t=e.target, k=t.dataset.k; if(!k) return; Settings.set(k,t.type==='checkbox'?t.checked:t.type==='range'?+t.value:t.value); renderSetModal() });
  $('o-setreset').addEventListener('click',()=>{ for(const k of SETTINGS_KEYS) Settings.set(k,Settings.DEF[k]); renderSetModal() });
  for(const id of ['o-setclose','o-statsclose']) $(id).addEventListener('click',()=>{ $(id).closest('.modal').hidden=true });
  for(const id of ['o-setmodal','o-statsmodal','o-importmodal']) $(id).addEventListener('click',e=>{ if(e.target.id===id) $(id).hidden=true });
  $('o-statsbody').addEventListener('click',e=>{ const so=e.target.closest('[data-sort]'); if(so){ const k=so.dataset.sort; if(ST.sort===k) ST.dir=-ST.dir; else { ST.sort=k; ST.dir=(k==='name'||k==='side'||k==='last')?1:-1 } renderStats(); return }
    const tr=e.target.closest('[data-train]'); if(tr){ $('o-statsmodal').hidden=true; selectOpening(tr.dataset.train) } });
  $('o-statsbody').addEventListener('change',e=>{ if(e.target.id==='o-stall'){ ST.all=e.target.checked; renderStats() } });
  const jump=e=>{ const b=e.target.closest('[data-ply]'); if(b&&S.g) browse(+b.dataset.ply>=S.log.length?null:+b.dataset.ply) };
  $('o-movelist').addEventListener('click',jump); $('o-notes').addEventListener('click',jump);
  $('o-rated').addEventListener('click',()=>{ Settings.set('omode','rated'); modeBtns() });
  $('o-training').addEventListener('click',()=>{ Settings.set('omode','training'); modeBtns(); renderBook() });
  /* Opponent level slider: weakest (Lichess 1000) to Elite 2500+; same setting as Settings → Opponent level */
  const lvl=$('o-level');
  lvl.addEventListener('input',()=>{ $('o-levelname').textContent=Book.levelLabel(Book.ORDER[+lvl.value]) });
  lvl.addEventListener('change',()=>{ Settings.set('olevel',Book.ORDER[+lvl.value]); syncLevel(); if(window.SettingsTab&&SettingsTab.refresh) SettingsTab.refresh() });
  syncLevel();
  function modeBtns(){ const t=training(); $('o-rated').setAttribute('aria-pressed',String(!t)); $('o-training').setAttribute('aria-pressed',String(t)); if(S.g) draw(); renderSide(); renderEval() }
  modeBtns();
  // the type-a-move box is hidden by default (keeps the board and its buttons on screen); the choice is remembered
  const typeOn=on=>{ $('o-moveform').hidden=!on; $('o-type').setAttribute('aria-pressed',String(on)); try{ localStorage.setItem('clo-typing',on?'1':'0') }catch(e){} };
  try{ if(localStorage.getItem('clo-typing')==='1') typeOn(true) }catch(e){}
  $('o-type').addEventListener('click',()=>{ const on=$('o-moveform').hidden; typeOn(on); if(on) $('o-movein').focus() });
  $('o-moveform').addEventListener('submit',e=>{
    e.preventDefault(); const txt=$('o-movein').value; $('o-moveerr').textContent='';
    if(!txt.trim())return;
    if(!S.g||S.phase!=='await'||S.busy||browsing()){ $('o-moveerr').textContent='Wait for the position.'; return }
    const mv=parseTyped(S.g,txt);
    if(!mv){ $('o-moveerr').textContent=`${txt} isn’t legal here. ${S.g.turn()==='w'?'White':'Black'} to move.`; return }
    $('o-movein').value=''; userMove(mv.from,mv.to,mv.promotion);
  });
  document.addEventListener('keydown',e=>{
    if(document.body.dataset.view!=='openings') return;
    if(e.key==='Escape'){ for(const id of ['o-setmodal','o-statsmodal','o-importmodal','o-newmodal']) $(id).hidden=true; if(!$('o-pop').hidden) setPop(false); return }
    if(/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)||e.altKey||e.ctrlKey||e.metaKey) return;
    if(!$('o-setmodal').hidden||!$('o-statsmodal').hidden||!$('o-importmodal').hidden||!$('o-newmodal').hidden) return;
    const k=e.key.length===1?e.key.toLowerCase():e.key; let used=true;
    if(k==='n') newLine(); else if(k==='h') hint(); else if(k==='f') $('o-flip').click(); else if(k==='b') takeBack();
    else if(k==='ArrowLeft') browse((browsing()?S.browse:S.log.length)-1); else if(k==='ArrowRight'){ if(browsing()) browse(S.browse+1) }
    else if(k==='Home') browse(0); else if(k==='End') browse(null); else used=false;
    if(used&&k.length>1) e.preventDefault();
  });
  addEventListener('settings-change',()=>{ STAY.clear(); if(document.body.dataset.view==='openings'){ renderSide(); renderBook(); renderEval() } });
  renderList();
  board.set(new Chess(),{orient:'w',locked:true});
}
window.OpeningsTab={init,customs,saveCustom,deleteCustom,openNew,saveNew,saveCurrent,studyApi,fetchStudy,doImport,syncLevel,soundDemoMoves,get state(){return S},selectOpening,newLine,userMove,parseRepPGN,moveDifficulty,openings,stats,
  takeBack,canTakeBack,browse,annAt,repPick,ordered,saveOrder,setArrange,moveItem,renderStats,openStats,openSettings,firstListed};
})();
