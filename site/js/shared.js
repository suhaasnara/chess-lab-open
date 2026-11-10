/* Chess Lab Open — shared helpers: settings, storage, position ids, winning chances,
   the Stockfish worker and the board component.
   Code by Suhaas Narayanan (with Claude), MIT. Engine: Stockfish (GPL-3.0), see sf/Copying.txt. */
'use strict';
const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

/* ---------- Settings (per browser) ---------- */
window.Settings=(()=>{
  const DEF={board:'maple',input:'tap',olevel:'masters',olen:'long',omode:'rated',sfDepth:'auto',oshare:3,theme:'auto',
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
  return {get,put,del,keys,exportAll,importAll};
})();
const deep=o=>o==null?o:JSON.parse(JSON.stringify(o));
/* Lichess puzzle theme ids as words: hangingPiece -> Hanging piece, mateIn4 -> Mate in 4, backRankMate -> Back rank mate. */
const themeName=t=>{ if(!t) return ''; if(t==='attackingF2F7') return 'Attacking f2/f7'; const w=String(t).replace(/([a-z])([A-Z0-9])/g,'$1 $2').replace(/([0-9])([A-Za-z])/g,'$1 $2').toLowerCase(); return w[0].toUpperCase()+w.slice(1) };

/* ---------- Position ids (same scheme as the private kit: progress stays compatible) ---------- */
/* Key: 'board side castling ep' with the en passant square kept only when the capture is legal. */
function normKey(fen){
  const f=fen.split(' ');
  if(f[3]!=='-'){ const g=new Chess(fen); if(!g.moves({verbose:true}).some(m=>m.flags.includes('e'))) f[3]='-' }
  return f.slice(0,4).join(' ');
}
/* 53-bit FNV of the key, base 36. */
function posId(k){
  let h1=0x811c9dc5, h2=(0x01000193^0x9e3779b9)>>>0;
  for(const ch of new TextEncoder().encode(k)){ h1=Math.imul((h1^ch)>>>0,0x01000193)>>>0; h2=Math.imul((h2^ch)>>>0,0x01000193)>>>0 }
  return ((h1&0x1fffff)*4294967296+h2).toString(36);
}
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

/* ---------- One Stockfish worker for the whole app ---------- */
window.SharedEngine=(()=>{
  const emit=()=>dispatchEvent(new Event('engine-change'));
  /* The lite WebAssembly build is served with this site (sf/); unpkg and cdnjs are fallbacks
     for environments that serve the page without its files. */
  const HERE=(p=>{ try{ return new URL(p,location.href).href }catch(e){ return p } });
  const SF='https://unpkg.com/stockfish@18.0.8/bin/';
  const URLS=[
    ['Stockfish 18 lite',HERE('sf/stockfish-18-lite-single.js'),HERE('sf/stockfish-18-lite-single.wasm'),12000],
    ['Stockfish 18 lite (unpkg)',SF+'stockfish-18-lite-single.js',HERE('sf/stockfish-18-lite-single.wasm'),12000],
    ['Stockfish 10','https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js',null,30000]];
  let w=null, ok=false, queue=Promise.resolve(), listener=null, failed=false, name='', started=false, readyRes, why='', okIdx=-1, restarts=0;
  let ready=new Promise(r=>readyRes=r);
  function tryUrl(k){
    if(k>=URLS.length){ failed=true; readyRes(); emit(); return }
    const boot="var F=function(m){postMessage('__sf_fail:'+String(m||'').slice(0,120))};self.addEventListener('unhandledrejection',function(e){e.preventDefault();F(e.reason&&(e.reason.message||e.reason))});self.addEventListener('error',function(e){e.preventDefault();F(e.message)});try{importScripts('"+URLS[k][1]+"')}catch(e){F(e.message)}";
    let nw; try{ nw=new Worker(URL.createObjectURL(new Blob([boot],{type:'application/javascript'}))+(URLS[k][2]?'#'+encodeURIComponent(URLS[k][2]):'')) }catch(e){ return tryUrl(k+1) }
    const timer=setTimeout(()=>{ if(!ok){ try{nw.terminate()}catch(_){} if(!why) why=URLS[k][0]+' did not answer in time'; tryUrl(k+1) } },URLS[k][3]);
    nw.onmessage=e=>{ const l=typeof e.data==='string'?e.data:''; if(!ok&&l.startsWith('__sf_fail')){ clearTimeout(timer); try{nw.terminate()}catch(_){} if(!why) why=URLS[k][0]+' could not start here ('+(l.slice(10)||'unknown reason')+')'; return tryUrl(k+1) } if(!ok&&l==='uciok'){ ok=true; clearTimeout(timer); name=URLS[k][0]; w=nw; okIdx=k; readyRes(); emit() } else if(ok) listener&&listener(l) };
    nw.onerror=()=>{ clearTimeout(timer); if(!ok){ try{nw.terminate()}catch(_){} tryUrl(k+1) } else { failed=true; emit() } };
    nw.postMessage('uci');
  }
  function start(){ if(started) return; started=true; tryUrl(0) }
  function restart(){
    try{ w&&w.terminate() }catch(e){} w=null; ok=false; listener=null; restarts++;
    ready=new Promise(r=>readyRes=r);
    if(restarts>5){ failed=true; why='the engine stopped answering repeatedly'; readyRes(); emit(); return }
    tryUrl(Math.max(0,okIdx));
  }
  /* Returns lines sorted best first: [{uci, cp, mate}], cp in pawns from the side to move. */
  function analyse(fen,depth,multipv=1,limitMs=12000){
    start();
    const job=()=>ready.then(()=>new Promise(res=>{
      if(!w||failed){res(null);return}
      const lines={}; let done=false;
      const finish=r=>{ if(done) return; done=true; clearTimeout(t); clearTimeout(kill); listener=null; res(r) };
      const t=setTimeout(()=>w&&w.postMessage('stop'),limitMs);
      const kill=setTimeout(()=>{ const got=Object.keys(lines).sort((a,b)=>a-b).map(k=>lines[k]); finish(got.length?got:null); restart() },limitMs+2500);
      listener=l=>{
        if(l.startsWith('info')&&l.includes(' pv ')&&l.includes(' score ')){
          const p=l.split(' '); const mi=p.indexOf('multipv'); const k=mi>=0?+p[mi+1]:1; const si=p.indexOf('score');
          const cp=p[si+1]==='cp'?parseInt(p[si+2])/100:(parseInt(p[si+2])>0?99:-99); const mate=p[si+1]==='mate'?parseInt(p[si+2]):null;
          lines[k]={uci:p[p.indexOf('pv')+1],cp,mate};
        }
        if(l.startsWith('bestmove')) finish(Object.keys(lines).sort((a,b)=>a-b).map(k=>lines[k]));
      };
      w.postMessage('setoption name MultiPV value '+multipv); w.postMessage('position fen '+fen); w.postMessage('go depth '+depth);
    }));
    const p=queue.then(job); queue=p.catch(()=>{}); return p;
  }
  /* A move at limited strength (UCI_LimitStrength / UCI_Elo, the engine's own scale, 1320-3190).
     The limit is switched off again right after, so analysis keeps full strength; jobs share the
     one queue, so they never overlap. */
  function play(fen,elo,movetime=700){
    start();
    const job=()=>ready.then(()=>new Promise(res=>{
      if(!w||failed){res(null);return}
      let done=false; const finish=u=>{ if(done) return; done=true; clearTimeout(kill); listener=null; w&&w.postMessage('setoption name UCI_LimitStrength value false'); res(u) };
      const kill=setTimeout(()=>{ finish(null); restart() },movetime+6000);
      listener=l=>{ if(l.startsWith('bestmove')){ const u=l.split(' ')[1]; finish(u&&u!=='(none)'?u:null) } };
      w.postMessage('setoption name MultiPV value 1'); w.postMessage('setoption name UCI_LimitStrength value true');
      w.postMessage('setoption name UCI_Elo value '+Math.max(1320,Math.min(3190,Math.round(elo))));
      w.postMessage('position fen '+fen); w.postMessage('go movetime '+movetime);
    }));
    const p=queue.then(job); queue=p.catch(()=>{}); return p;
  }
  return {start,analyse,play,restart,get failed(){return failed},get ready(){return ok},get name(){return name},get why(){return why},get restarts(){return restarts}};
})();
/* Remember finished searches, so revisiting a position answers instantly. */
(()=>{ const raw=SharedEngine.analyse, cache=new Map(), inflight=new Map();
  SharedEngine.analyse=function(fen,depth,mpv=1,limitMs){ const k=fen+'|'+depth+'|'+mpv; if(cache.has(k)) return Promise.resolve(cache.get(k));
    if(inflight.has(k)) return inflight.get(k);
    const p=raw(fen,depth,mpv,limitMs).then(r=>{ inflight.delete(k); if(r&&r.length){ cache.set(k,r); if(cache.size>3000) cache.delete(cache.keys().next().value) } return r },e=>{ inflight.delete(k); throw e });
    inflight.set(k,p); return p };
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
const NAGS={1:'!',2:'?',3:'!!',4:'??',5:'!?',6:'?!',7:'□',8:'□',10:'=',11:'=',12:'=',13:'∞',14:'⩲',15:'⩱',16:'±',17:'∓',18:'+−',19:'−+',22:'⨀',23:'⨀',32:'⟳',33:'⟳',36:'→',37:'→',40:'↑',41:'↑',132:'⇆',133:'⇆',138:'⊕',139:'⊕',140:'∆',146:'N'};
/* a comment's [%cal Ge2e4,Rd4d5] / [%csl Yd4] shapes as "Ge2e4 Rd4d5 Yd4" (Shapes.auto's format) */
function pgnShapes(c){ const out=[]; String(c).replace(/\[%c(?:al|sl)\s+([^\]]*)\]/g,(_,l)=>{ for(const x of l.split(/[\s,]+/)) if(/^[GRBY][a-h][1-8]([a-h][1-8])?$/.test(x)) out.push(x); return '' }); return [...new Set(out)].join(' ') }
/* a PGN comment as plain text: no [%clk]/[%eval]/[%cal] tags, no Lichess or Chessable export markers */
function cleanNote(c){ return String(c).replace(/\[%[^\]]*\]/g,'').replace(/StartFEN[\s\S]*?EndFEN/g,' ').replace(/StartBracket/g,'(').replace(/EndBracket/g,')')
  .replace(/\[\/(?:course|variation)\/[^\]]*\]/g,'').replace(/[-�]/g,'').replace(/\s+/g,' ').replace(/\(\s+/g,'(').replace(/\s+\)/g,')').trim().replace(/^[()\s]*$/,'') }
/* move marks (!, ?, ...) and evaluation signs (⩲, ±, ...) as styled spans: good marks green, mistakes red, signs muted */
const MARK_NAMES={'!':'good move','?':'mistake','!!':'brilliant move','??':'blunder','!?':'interesting move','?!':'dubious move','□':'only move','=':'equal position','∞':'unclear position','⩲':'White is slightly better','⩱':'Black is slightly better','±':'White is better','∓':'Black is better','+−':'White is winning','−+':'Black is winning','N':'novelty','⟳':'development advantage','→':'with an attack','↑':'with the initiative','⇆':'with counterplay','∆':'with the idea','⊕':'time trouble','⨀':'zugzwang'};
const MARK_CLS={'!':'mk-good','!!':'mk-good','!?':'mk-int','?!':'mk-warn','?':'mk-bad','??':'mk-bad','□':'mk-good'};
const markTokens=mk=>String(mk||'').match(/!!|\?\?|!\?|\?!|[!?]|\+−|−\+|\S/g)||[];
function markHtml(mk){ return markTokens(mk).map(t=>`<span class="mk ${MARK_CLS[t]||'mk-sign'}" title="${esc(MARK_NAMES[t]||t)}">${esc(t)}</span>`).join('') }
