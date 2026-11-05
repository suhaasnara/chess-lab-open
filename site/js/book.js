/* Chess Lab Open — the opening book.
   Sources, in order:
   1. data/masters.json if you have built one with tools/build_masters.py
      (a static book from CC0 games: Lichess Elite database / Lichess broadcasts).
   2. The Lichess opening explorer API (https://explorer.lichess.ovh), fetched live
      in your browser: the masters database, or club games by rating band for the
      "Opponent level" setting. Nothing is redistributed; see CREDITS.md.
   3. A small built-in "demo book" of named opening lines (CC0,
      lichess-org/chess-openings) when the network is unreachable: moves without
      game counts, clearly labelled.
   All lookups go through Book.moves(fen, level). */
'use strict';
window.Book=(()=>{
  const EXPLORER='https://explorer.lichess.ovh';
  /* Opponent levels: masters book, or Lichess rapid+classical games by rating bucket. */
  const LEVELS={masters:{label:'Masters'},
    b22:{label:'Club 2200+',ratings:'2200,2500'},
    b20:{label:'Club 2000–2200',ratings:'2000'},
    b18:{label:'Club 1800–2000',ratings:'1800'}};
  let NAMES=null, DEMO=null, STATIC=null, staticTried=false;
  let online=true, lastError='';
  const cache=new Map(); /* key: posId|level -> rows */
  const load=(url)=>fetch(url).then(r=>{ if(!r.ok) throw new Error(url+': '+r.status); return r.json() });
  const namesP=load('data/openings.json').then(j=>{NAMES=j}).catch(()=>{NAMES={}});
  const demoP=load('data/demo-book.json').then(j=>{DEMO=j}).catch(()=>{DEMO={}});
  const staticP=load('data/masters.json').then(j=>{STATIC=j}).catch(()=>{}).finally(()=>{staticTried=true});

  const key=fen=>posId(normKey(fen));
  function fromRows(rows){ const total=rows.reduce((a,r)=>a+r[1],0);
    return {total,rows:rows.map(r=>({uci:r[0],games:r[1],w:r[2],d:r[3],b:r[4],ev:r[5],share:total?r[1]/total:0}))} }

  async function explorer(fen,level){
    const lv=LEVELS[level]||LEVELS.masters;
    const url=lv.ratings
      ?`${EXPLORER}/lichess?variant=standard&speeds=rapid,classical&ratings=${lv.ratings}&moves=14&topGames=0&recentGames=0&fen=${encodeURIComponent(fen)}`
      :`${EXPLORER}/masters?moves=14&topGames=0&fen=${encodeURIComponent(fen)}`;
    const r=await fetch(url);
    if(r.status===429){ await new Promise(res=>setTimeout(res,20000)); return explorer(fen,level) }
    if(!r.ok) throw new Error('explorer '+r.status);
    const j=await r.json();
    const rows=(j.moves||[]).map(m=>[m.uci,(m.white||0)+(m.draws||0)+(m.black||0),m.white||0,m.draws||0,m.black||0]);
    return fromRows(rows);
  }
  function demoRows(fen){
    const ent=DEMO&&DEMO[key(fen)];
    if(!ent) return null;
    const out=fromRows(ent.map(e=>[e[0],0,0,0,0]));
    out.rows.forEach((r,i)=>{ r.san=ent[i][1]; r.share=1/out.rows.length });
    out.demo=true; return out;
  }
  /* The book at a position. level: 'masters' (default) | 'b22' | 'b20' | 'b18'.
     Returns {total, rows:[{uci,san?,games,w,d,b,share}], source, demo?} or null when nothing covers it. */
  async function moves(fen,level='masters'){
    await Promise.all([namesP,demoP,staticP]);
    const k=key(fen)+'|'+level;
    if(cache.has(k)) return cache.get(k);
    let out=null;
    if(STATIC&&level==='masters'){ const rows=STATIC[key(fen)]; if(rows){ out=fromRows(rows); out.source='static' } }
    if(!out&&online){
      try{ out=await explorer(fen,level); out.source=LEVELS[level]&&LEVELS[level].ratings?'club':'masters' }
      catch(e){ online=false; lastError=String(e&&e.message||e); setTimeout(()=>{online=true},30000) }
    }
    if(!out||(!out.total&&!out.rows.length)){ const d=demoRows(fen); if(d){ d.source='demo'; out=d } }
    if(out&&!out.rows.length) out=null;
    if(out) cache.set(k,out);
    return out;
  }
  /* The opponent's book: the chosen club band where it has 20+ games, else the masters. */
  async function oppMoves(fen){
    const lv=Settings.get('olevel');
    if(lv&&lv!=='masters'&&LEVELS[lv]){
      const b=await moves(fen,lv);
      if(b&&b.total>=20){ b.level=lv; return b }
    }
    const m=await moves(fen,'masters'); if(m) m.level='masters'; return m;
  }
  /* The name of the opening on the board: the last named position reached. */
  function nameOf(fens){
    if(!NAMES) return null;
    let best=null;
    for(const f of fens){ const n=NAMES[posId(normKey(f))]; if(n) best=n }
    return best; /* [eco, name] */
  }
  function levelLabel(lv){ return (LEVELS[lv]||LEVELS.masters).label }
  return {moves,oppMoves,nameOf,levelLabel,LEVELS,
    get online(){return online}, get lastError(){return lastError},
    get hasStatic(){return !!STATIC},
    ready:()=>Promise.all([namesP,demoP,staticP])};
})();
