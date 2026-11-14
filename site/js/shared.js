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
    let n=0; for(const k in o){ if(k[0]==='_') continue; put(k,o[k]); n++ } migrate(); return n };   /* an old export can hold a pack's keys */
  /* put that says whether it worked (false when this browser's storage is full) */
  const tryPut=(k,v)=>{ try{ localStorage.setItem(PRE+k,JSON.stringify(v)); return true }catch(e){ return false } };
  /* Chess Lab packs are retired (13 Nov 2026): a friend's own games now go through Analyze my games. A browser that loaded
     one keeps everything it brought: its drills (in adrills, marked pack:1) join a drill set "From your Chess Lab pack"
     (removable like any saved set), its Blunder check positions join abc (your blunder checks) in the same set, results
     untouched (adrills-progress, bc-progress; same ids). Then the pack-* keys go. Runs at start-up and after an import
     (an old progress export can still hold pack-* keys); nothing is deleted unless the new keys were written. */
  const PACK_KEYS=['pack-player','pack-meta','pack-report','pack-bc','pack-prep','pack-view'];
  const migrate=()=>{
    if(!PACK_KEYS.some(k=>get(k)!=null)) return null;
    const meta=get('pack-meta')||{}, bc=(get('pack-bc')||[]).filter(d=>d&&typeof d.id==='string'&&/^k[0-9a-f]{8}$/.test(d.id));
    const D=get('adrills')||[], mine=D.filter(d=>d&&d.pack);
    let ok=true;
    if(mine.length||bc.length){
      const sets=get('adrill-sets')||[];
      if(!sets.some(s=>s.id==='pack')) sets.push({id:'pack',t:Date.parse(meta.loaded||'')||Date.now(),label:'From your Chess Lab pack'});
      for(const d of mine) d.b=[...new Set([...(d.b||[]),'pack'])];
      const A=get('abc')||[], at=new Map(A.map((d,i)=>[d.id,i]));
      for(const d of bc){ const r={...d,site:d.site||d.src||'',b:['pack']};
        if(at.has(d.id)){ const o=A[at.get(d.id)]; o.b=[...new Set([...(o.b||[]),'pack'])] } else { at.set(d.id,A.length); A.push(r) } }
      ok=tryPut('adrills',D)&&tryPut('abc',A)&&tryPut('adrill-sets',sets);
    }
    if(ok) for(const k of PACK_KEYS) del(k);
    return ok?{drills:mine.length,bc:bc.length}:null;
  };
  return {get,put,tryPut,del,keys,exportAll,importAll,migrate,PACK_KEYS};
})();
Store.migrate();
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
