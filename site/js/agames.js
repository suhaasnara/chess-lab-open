/* Chess Lab Open — the games you analyzed, kept in this browser (13 Nov 2026).
   Analyze my games used to forget its games when the page closed (only Stockfish's evals stayed, in pgn-evals), so a
   drill or a costly moment could only link out to Lichess or Chess.com, and an over-the-board game nowhere. Now every
   game of the last run is kept, compactly, with the report's settings, so that:
     - the game view (#game?id=…&ply=…, js/gameview.js) opens any of them at a move, over-the-board PGN games included;
     - the last report comes back after a reload, rebuilt from these games and the stored evals (no fetch, no engine);
     - drills and blunder checks (adrills, abc: fields g = game id, ply = the move's index) open their own game.
   Store key `agames` = {v:1, g:{<game id>: record}, last:{site, user, files, fileNote, ids, bc, total, mode, t} | null}.
   Records: the game's tags and moves ("e4 e5 …"); its evals only where nothing else keeps them (Lichess's server analysis,
   evals in the PGN, and games a saved drill points to: ev, White's side, pawns, as everywhere); Stockfish's evals of the
   rest stay in pgn-evals. Kept: the last run's games plus every game a saved drill or blunder check points to. When the
   browser's storage is full, only the games your drills point to are kept and the report isn't restored (saveRun says). */
'use strict';
window.AGames=(()=>{
  const KEY='agames', EVKEY='pgn-evals';
  const ENGINE=new Set(['standard','deep']);
  const blank=()=>({v:1,g:{},last:null});
  const load=()=>{ const o=Store.get(KEY); return o&&o.v===1&&o.g&&typeof o.g==='object'?o:blank() };
  const round=evs=>evs.map(v=>v==null?null:Math.round(v*100)/100);
  const FIELDS=['id','site','date','ts','white','black','wr','br','wd','bd','wp','bp','color','result','speed','url','file','sys','event','evsrc'];
  /* a game as Analyze holds it -> a record; pin: keep its evals in the record (a drill points to it) */
  function pack(game,evs,pin){
    const r={}; for(const k of FIELDS){ const v=game[k]; if(v!=null&&v!=='') r[k]=v }
    r.moves=(game.moves||[]).join(' ');
    if(evs&&evs.length&&(pin||!ENGINE.has(game.evsrc))) r.ev=round(evs);
    if(Array.isArray(game.analysis)){ const b={}; game.analysis.forEach((a,i)=>{ if(a&&a.best) b[i]=a.best }); if(Object.keys(b).length) r.best=b }
    return r;
  }
  /* a record -> a game as Analyze holds it (Lichess / PGN evals become its analysis again, best moves included) */
  function unpack(r){
    const g={...r,moves:r.moves?r.moves.split(' '):[],analysis:null}; delete g.ev; delete g.best;
    if(r.ev&&!ENGINE.has(r.evsrc)) g.analysis=r.ev.map((v,i)=>{ const a=v!=null&&Math.abs(v)>=99?{mate:v>0?1:-1}:{eval:Math.round((v||0)*100)}; if(r.best&&r.best[i]) a.best=r.best[i]; return a });
    return g;
  }
  /* a game's evals (White's side, pawns, one per ply): its own, else Stockfish's stored ones */
  function evals(r){
    if(!r) return null; if(r.ev&&r.ev.length) return r.ev;
    const e=(Store.get(EVKEY)||{})[r.id]; if(!e) return null;
    return Array.isArray(e)?e:(e.e&&e.e.length?e.e:null);
  }
  /* the games saved drills and blunder checks point to */
  function refs(){ const s=new Set(); for(const k of ['adrills','abc']) for(const d of Store.get(k)||[]) if(d&&d.g) s.add(d.g); return s }
  /* after a run: its games (with evsById: id -> evals) and what the report needs to come back */
  function saveRun(run,evsById){
    const o=load(), keep=refs(), g={};
    for(const id of keep) if(o.g[id]) g[id]=o.g[id];
    for(const game of run.games) g[game.id]=pack(game,evsById.get(game.id),keep.has(game.id));
    const last={site:run.site,user:run.user,files:run.files||[],fileNote:run.fileNote||'',ids:run.games.map(x=>x.id),bc:run.bc||[],total:run.total||run.games.length,mode:run.mode||'',t:Date.now()};
    if(Store.tryPut(KEY,{v:1,g,last})) return 'ok';
    const g2={}; for(const id of keep) if(g[id]) g2[id]=g[id];
    return Store.tryPut(KEY,{v:1,g:g2,last:null})?'partial':'full';
  }
  /* a drill or blunder check was saved from these games: keep them with their evals (they may outlive the next run) */
  function pin(entries){
    const o=load(); let ch=false;
    for(const {game,evs} of entries){ if(!game||!game.id) continue; const r=o.g[game.id];
      if(!r){ o.g[game.id]=pack(game,evs,true); ch=true }
      else if(!r.ev&&evs&&evs.length){ r.ev=round(evs); ch=true } }
    return ch?Store.tryPut(KEY,o):true;
  }
  const get=id=>load().g[id]||null;
  const href=(id,ply,from)=>`#game?id=${encodeURIComponent(id)}${ply!=null?'&ply='+ply:''}${from?'&from='+from:''}`;
  return {get,has:id=>!!load().g[id],last:()=>load().last,all:()=>load().g,evals,pack,unpack,saveRun,pin,refs,href,KEY};
})();
