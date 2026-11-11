/* Chess Lab Open — shared helpers: settings, storage, position ids, winning chances,
   the Stockfish worker and the board component.
   Code by Suhaas Narayanan (with Claude), MIT. Engine: Stockfish (GPL-3.0), see sf/Copying.txt. */
'use strict';
const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

/* ---------- Settings (per browser) ---------- */
window.Settings=(()=>{
  const DEF={ptheme:false,board:'maple',input:'both',omistakes:'all',ocaptured:false,anim:'normal',sound:false,shapeColor:'G',olevel:'masters',olen:'long',omode:'rated',sfDepth:'auto',oshare:3,theme:'auto',
    ovariety:'balanced',ominshare:0,otrappy:false,evalCol:true,osfinfo:false,coords:true,lastMove:true,dests:true,autoNext:false};
  let cur={};
  try{ cur=JSON.parse(localStorage.getItem('clo-settings')||'{}') }catch(e){}
  const get=k=>cur[k]!==undefined?cur[k]:DEF[k];
  /* Theme: light, dark or auto (match the device). Only the colour variables in style.css change; the board keeps its own.
     The small script in index.html's head sets it before the first paint, so a dark page never flashes light. */
  const theme=()=>{ const t=get('theme'); document.documentElement.dataset.theme=t==='light'||t==='dark'?t:'auto' };
  theme();
  /* board display toggles: coordinates, last-move highlight, move dots */
  const classes=()=>{ const b=document.body; if(!b) return; b.classList.toggle('no-coords',get('coords')===false||get('coords')==='false');
    b.classList.toggle('no-last',get('lastMove')===false||get('lastMove')==='false'); b.classList.toggle('no-dests',get('dests')===false||get('dests')==='false') };
  const set=(k,v)=>{ cur[k]=v; try{ localStorage.setItem('clo-settings',JSON.stringify(cur)) }catch(e){}
    if(k==='board') document.body.dataset.board=v==='maple'?'':v;
    if(k==='theme') theme();
    classes();
    dispatchEvent(new Event('settings-change')) };
  const boot=()=>{ const b=get('board'); if(b!=='maple') document.body.dataset.board=b; classes() };
  if(document.body) boot(); else document.addEventListener('DOMContentLoaded',boot);
  return {DEF,get,set,all:()=>({...DEF,...cur})};
})();

/* ---------- Progress store (localStorage, with export/import) ---------- */
window.Store=(()=>{
  const PRE='clo:';
  const get=k=>{ try{ const v=localStorage.getItem(PRE+k); return v?JSON.parse(v):null }catch(e){ return null } };
  const put=(k,v)=>{ try{ localStorage.setItem(PRE+k,JSON.stringify(v)) }catch(e){} };
  const del=k=>{ try{ localStorage.removeItem(PRE+k) }catch(e){} };
  const keys=()=>{ const out=[]; try{ for(let i=0;i<localStorage.length;i++){ const k=localStorage.key(i); if(k&&k.startsWith(PRE)) out.push(k.slice(PRE.length)) } }catch(e){} return out };
  const exportAll=()=>{ const o={_app:'chess-lab-open',_v:1,_t:new Date().toISOString()}; for(const k of keys()) o[k]=get(k); return o };
  const importAll=o=>{ if(!o||o._app!=='chess-lab-open') throw new Error('Not a Chess Lab Open export.');
    let n=0; for(const k in o){ if(k[0]==='_') continue; put(k,o[k]); n++ } return n };
  /* A Chess Lab pack (a friend's own games analysed by the private kit, sent as one file): merged in, never overwriting.
     Drills are united with yours by id (the same move found by Analyze my games is the same drill; your results in
     adrills-progress are never touched); the pack's report card, blunder-check positions, prep and player go to pack-*
     keys (replaced by a newer pack); its repertoires become imported repertoires (pack-<id>, replaced on reload).
     All or nothing: if this browser's storage is full, everything written is put back and the error says so. */
  const PACK_KEYS=['pack-player','pack-meta','pack-report','pack-bc','pack-prep'];
  const importPack=o=>{
    if(!o||typeof o!=='object'||o._app!=='chess-lab-pack') throw new Error(o&&o._app==='chess-lab-open'?'That is a progress export: use Import progress for it.':'Not a Chess Lab pack.');
    if(!(o._v>=1)||o._v>1) throw new Error('This pack is from a newer version of Chess Lab (version '+o._v+'). Reload the page to get the latest Chess Lab Open, then try again.');
    if(!Array.isArray(o.drills||[])||!Array.isArray(o.bc||[])) throw new Error('This pack is damaged (drills or blunder check are not lists).');
    const okDrill=d=>d&&typeof d.id==='string'&&/^[ap][0-9a-f]{8}$/.test(d.id)&&typeof d.fen==='string'&&typeof d.playedUci==='string';
    const okBc=d=>d&&typeof d.id==='string'&&/^k[0-9a-f]{8}$/.test(d.id)&&typeof d.fen==='string'&&typeof d.null==='string'&&Array.isArray(d.threats)&&Array.isArray(d.goods);
    const drills=(o.drills||[]).filter(okDrill), bc=(o.bc||[]).filter(okBc);
    const mine=get('adrills')||[], at=new Map(mine.map((d,i)=>[d.id,i]));
    let added=0, updated=0;
    for(const d of drills){ const r={...d,pack:1}; if(at.has(d.id)){ mine[at.get(d.id)]={...mine[at.get(d.id)],...r}; updated++ } else { at.set(d.id,mine.length); mine.push(r); added++ } }
    const writes=[['adrills',mine],['pack-player',o.player||null],['pack-meta',Object.assign({},o.meta||{},{loaded:new Date().toISOString(),t:o._t||null})],
      ['pack-report',o.report||null],['pack-bc',bc],['pack-prep',o.prep||null]];
    const reps=[];
    for(const r of Array.isArray(o.reps)?o.reps:[]){
      if(!r||!r.pgn||!/^[a-z0-9-]{1,40}$/i.test(String(r.id||''))||!(r.side==='white'||r.side==='black')||!window.OpeningsTab) continue;
      const p=OpeningsTab.parseRepPGN(r.pgn), id='pack-'+r.id;
      writes.push(['rep-'+id,{name:String(r.name||'Repertoire'),side:r.side,pos:Object.fromEntries(Object.entries(p.pos).map(([k,v])=>[k,v.join(' ')])),ann:p.ann,startFen:p.startFen||undefined}]);
      reps.push({id,name:String(r.name||'Repertoire'),side:r.side,positions:p.positions,notes:Object.keys(p.ann).length,startFen:p.startFen||undefined});
    }
    if(reps.length){ const ids=new Set(reps.map(r=>r.id)); writes.push(['reps-index',(get('reps-index')||[]).filter(r=>!ids.has(r.id)).concat(reps)]) }
    const before=writes.map(([k])=>[k,localStorage.getItem(PRE+k)]);
    try{ for(const [k,v] of writes) localStorage.setItem(PRE+k,JSON.stringify(v)) }
    catch(e){
      for(const [k,v] of before){ try{ v==null?localStorage.removeItem(PRE+k):localStorage.setItem(PRE+k,v) }catch(x){} }
      const kb=Math.round(writes.reduce((a,[,v])=>a+JSON.stringify(v).length,0)/1024);
      throw new Error(`This pack doesn’t fit in this browser’s storage (it needs about ${kb} KB; browsers give a site about 5 MB). Nothing was changed. Export your progress, remove imported repertoires or Guess-the-move games you no longer use, and load the pack again.`);
    }
    return {drills:drills.length,added,updated,bc:bc.length,games:o.report&&o.report.overall?o.report.overall.games:0,reps:reps.length,player:o.player&&o.player.name||''};
  };
  const pack=()=>{ const m=get('pack-meta'); return m?{player:get('pack-player')||{},meta:m,report:get('pack-report'),bc:get('pack-bc')||[],prep:get('pack-prep')}:null };
  return {get,put,del,keys,exportAll,importAll,importPack,pack,PACK_KEYS};
})();
const deep=o=>o==null?o:JSON.parse(JSON.stringify(o));
/* Lichess puzzle theme ids as words: hangingPiece -> Hanging piece, mateIn4 -> Mate in 4, backRankMate -> Back rank mate. */
const themeName=t=>{ if(!t) return ''; if(t==='attackingF2F7') return 'Attacking f2/f7'; const w=String(t).replace(/([a-z])([A-Z0-9])/g,'$1 $2').replace(/([0-9])([A-Za-z])/g,'$1 $2').toLowerCase(); return w[0].toUpperCase()+w.slice(1) };

/* ---------- Position ids (same scheme as the private kit: progress stays compatible) ---------- */
/* Key: 'board side castling ep' with the en passant square kept only when the capture is legal. */
function normKey(fen){ return PGN.normKey(fen) }   /* shared/pgn.js */
/* 53-bit FNV of the key, base 36. */
function posId(k){ return PGN.posId(k) }
/* Drill ids: prefix + sha1(fen|playedUci)[:8] — never change this; progress is keyed by it. */
async function drillId(prefix,fen,uci){
  const data=new TextEncoder().encode(fen+'|'+uci);
  const buf=await crypto.subtle.digest('SHA-1',data);
  return prefix+[...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('').slice(0,8);
}

/* ---------- Evals ---------- */
/* Lichess winning chances, p in pawns, result -1..1 from the mover's side of the sign. */
const wc=p=>2/(1+Math.exp(-0.368208*Math.max(-15,Math.min(15,p))))-1;
const cpPawns=cp=>Math.abs(cp)>=9900?(cp>0?99:-99):cp/100;
const fmtEval=p=>p==null?'':(p>0?'+':'')+p.toFixed(1);

/* ---------- One Stockfish worker for the whole app (shared/engine.js) ---------- */
/* The lite WebAssembly build is served with this site (sf/); unpkg and cdnjs are fallbacks
   for environments that serve the page without its files. */
window.SharedEngine=(()=>{
  const HERE=(p=>{ try{ return new URL(p,location.href).href }catch(e){ return p } });
  const SF='https://unpkg.com/stockfish@18.0.8/bin/';
  return EngineKit.create([
    ['Stockfish 18 lite',HERE('sf/stockfish-18-lite-single.js'),HERE('sf/stockfish-18-lite-single.wasm'),12000],
    ['Stockfish 18 lite (unpkg)',SF+'stockfish-18-lite-single.js',HERE('sf/stockfish-18-lite-single.wasm'),12000],
    ['Stockfish 10','https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js',null,30000]]);
})();

/* The board (Board.draw / Board.bind, makeBoard, endBanner): shared/board.js. */

/* Parse a typed move: SAN (Qd3, exd5, O-O) or squares (e2e4). Returns {from,to,promotion} or null. */
function parseTyped(game,txt){
  let t=txt.trim().replace(/0-0-0/g,'O-O-O').replace(/0-0/g,'O-O').replace(/o-o-o/gi,'O-O-O').replace(/o-o/gi,'O-O');
  if(/^[a-h][1-8]-?[a-h][1-8][qrbn]?$/i.test(t)){
    const lo=t.toLowerCase().replace('-',''); const mv=game.moves({square:lo.slice(0,2),verbose:true}).find(m=>m.to===lo.slice(2,4));
    return mv?{from:lo.slice(0,2),to:lo.slice(2,4),promotion:lo[4]||mv.promotion&&'q'}:null;
  }
  t=t.replace(/^([kqrn])(?=[a-h1-8x])/,c=>c.toUpperCase());
  const g=new Chess(game.fen()); const m=g.move(t,{sloppy:true});
  return m?{from:m.from,to:m.to,promotion:m.promotion}:null;
}

/* SAN of a uci move from a fen, or the uci itself when illegal. */
function sanOf(fen,uci){
  const g=new Chess(fen); const m=g.move({from:uci.slice(0,2),to:uci.slice(2,4),promotion:uci[4]||'q'});
  return m?m.san:uci;
}

/* Arrows and circles (window.Shapes): shared/shapes.js. */

/* ---------- PGN move marks and evaluation signs ($1 = !, $14 = ⩲, ...) ---------- */
const NAGS=PGN.NAGS;   /* shared/pgn.js: $n -> sign */
/* a comment's [%cal Ge2e4,Rd4d5] / [%csl Yd4] shapes as "Ge2e4 Rd4d5 Yd4" (Shapes.auto's format) */
function pgnShapes(c){ return PGN.shapes(c) }
/* a PGN comment as plain text: no [%clk]/[%eval]/[%cal] tags, no Lichess or Chessable export markers */
function cleanNote(c){ return PGN.cleanNote(c) }
/* move marks (!, ?, ...) and evaluation signs (⩲, ±, ...) as styled spans: good marks green, mistakes red, signs muted */
const MARK_NAMES={'!':'good move','?':'mistake','!!':'brilliant move','??':'blunder','!?':'interesting move','?!':'dubious move','□':'only move','=':'equal position','∞':'unclear position','⩲':'White is slightly better','⩱':'Black is slightly better','±':'White is better','∓':'Black is better','+−':'White is winning','−+':'Black is winning','N':'novelty','⟳':'development advantage','→':'with an attack','↑':'with the initiative','⇆':'with counterplay','∆':'with the idea','⊕':'time trouble','⨀':'zugzwang'};
const MARK_CLS={'!':'mk-good','!!':'mk-good','!?':'mk-int','?!':'mk-warn','?':'mk-bad','??':'mk-bad','□':'mk-good'};
const markTokens=mk=>String(mk||'').match(/!!|\?\?|!\?|\?!|[!?]|\+−|−\+|\S/g)||[];
function markHtml(mk){ return markTokens(mk).map(t=>`<span class="mk ${MARK_CLS[t]||'mk-sign'}" title="${esc(MARK_NAMES[t]||t)}">${esc(t)}</span>`).join('') }
