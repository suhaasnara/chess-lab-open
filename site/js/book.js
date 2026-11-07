/* Chess Lab Open — the opening book. No accounts, no live API: every book ships with the site.
   Sources, in order:
   1. Static books built from CC0 Lichess data by .github/workflows/build-books.yml:
      data/masters.json  — the Lichess Elite Database (2500+ vs 2300+ games), tools/build_masters.py
      data/club/<lv>.json — the Lichess open database, rated rapid + classical games by the
                           players' average rating, tools/build_club.py
      Each file is loaded the first time its level is used.
   2. A small built-in "demo book" of named opening lines (CC0, lichess-org/chess-openings)
      where a static book has nothing: moves without game counts, clearly labelled.
   All lookups go through Book.moves(fen, level). */
'use strict';
window.Book=(()=>{
  /* Rating bands as in the Lichess explorer: 1000 = 1000–1199 … 2200 = 2200+ (Lichess ratings). */
  const LEVELS={masters:{label:'Elite 2500+',file:'data/masters.json'},
    b22:{label:'Club 2200+',file:'data/club/b22.json'},
    b20:{label:'Club 2000–2200',file:'data/club/b20.json'},
    b18:{label:'Club 1800–2000',file:'data/club/b18.json'},
    b16:{label:'Club 1600–1800',file:'data/club/b16.json'},
    b14:{label:'Club 1400–1600',file:'data/club/b14.json'},
    b12:{label:'Club 1200–1400',file:'data/club/b12.json'},
    b10:{label:'Club 1000–1200',file:'data/club/b10.json'}};
  /* weakest to strongest: the order of the Opponent slider */
  const ORDER=['b10','b12','b14','b16','b18','b20','b22','masters'];
  let NAMES=null, DEMO=null;
  const STATIC={};        /* level -> book object, or null when the file is missing */
  const loading={};       /* level -> promise */
  const cache=new Map();  /* key: posId|level -> rows */
  const load=(url)=>fetch(url).then(r=>{ if(!r.ok) throw new Error(url+': '+r.status); return r.json() });
  const namesP=load('data/openings.json').then(j=>{NAMES=j}).catch(()=>{NAMES={}});
  const demoP=load('data/demo-book.json').then(j=>{DEMO=j}).catch(()=>{DEMO={}});
  function staticBook(level){
    const lv=LEVELS[level]?level:'masters';
    if(!loading[lv]) loading[lv]=load(LEVELS[lv].file).then(j=>{STATIC[lv]=j}).catch(()=>{STATIC[lv]=null});
    return loading[lv];
  }
  /* the Elite book (6 MB) loads when Openings or Analyze first needs it, not on every visit */

  const key=fen=>posId(normKey(fen));
  function fromRows(rows){ const total=rows.reduce((a,r)=>a+r[1],0);
    return {total,rows:rows.map(r=>({uci:r[0],games:r[1],w:r[2],d:r[3],b:r[4],ev:r[5],share:total?r[1]/total:0}))} }
  function demoRows(fen){
    const ent=DEMO&&DEMO[key(fen)];
    if(!ent) return null;
    const out=fromRows(ent.map(e=>[e[0],0,0,0,0]));
    out.rows.forEach((r,i)=>{ r.san=ent[i][1]; r.share=1/out.rows.length });
    out.demo=true; return out;
  }
  /* The book at a position for a level ('masters' or a club band).
     Returns {total, rows:[{uci,san?,games,w,d,b,share}], source, demo?} or null when nothing covers it. */
  async function moves(fen,level='masters'){
    const lv=LEVELS[level]?level:'masters';
    await Promise.all([namesP,demoP,staticBook(lv)]);
    const k=key(fen)+'|'+lv;
    if(cache.has(k)) return cache.get(k);
    let out=null;
    const book=STATIC[lv], rows=book&&book[key(fen)];
    if(rows&&rows.length){ out=fromRows(rows); out.source=lv==='masters'?'elite':'club' }
    if(!out){ const d=demoRows(fen); if(d){ d.source='demo'; out=d } }
    if(out&&!out.rows.length) out=null;
    if(out) cache.set(k,out);
    return out;
  }
  /* The same lookup without waiting, for a book that has already loaded (else null). Used where many positions are
     looked at in one go (how much of the book stays inside your repertoire). */
  function now(fen,level='masters'){
    const lv=LEVELS[level]?level:'masters', book=STATIC[lv]; if(!book) return null;
    const k=key(fen)+'|'+lv; if(cache.has(k)){ const c=cache.get(k); return c&&!c.demo?c:null }
    const rows=book[key(fen)]; if(!rows||!rows.length) return null;
    const out=fromRows(rows); out.source=lv==='masters'?'elite':'club'; cache.set(k,out); return out;
  }
  /* The opponent's book: the chosen club band where it has 20+ games, else the elite book. */
  async function oppMoves(fen){
    const lv=Settings.get('olevel');
    if(lv&&lv!=='masters'&&LEVELS[lv]){
      const b=await moves(fen,lv);
      if(b&&!b.demo&&b.total>=20){ b.level=lv; return b }
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
  return {moves,now,oppMoves,nameOf,levelLabel,LEVELS,ORDER,
    hasBook:lv=>!!STATIC[LEVELS[lv]?lv:'masters'],
    get hasStatic(){return !!STATIC.masters},
    ready:()=>Promise.all([namesP,demoP,staticBook('masters')])};
})();
