/* Chess Lab Open — your own PGN file as a source for Analyze my games (over-the-board games, or any export).
   Everything happens in this browser: the file is read here and never uploaded.

   PgnFile.parse(text)        -> {games:[{h (headers), sans (main line), evals (pawns, White's side, per ply, or null)}], skipped}
                                 side lines and comments are skipped; [%eval 0.31] / [%eval #-3] in the main line are kept
   PgnFile.players(parsed)    -> [[name, games]] most frequent first (who "you" are is the name in nearly every game)
   PgnFile.toGamesAsync(parsed, me, onProgress) -> the same, a few games at a time (the page stays responsive)
   PgnFile.toGames(parsed, me) -> Analyze's game records for the games "me" played (White or Black), oldest first:
                                 {site:'pgn'|'lichess'|'chesscom', id, date, ts, white, black, wr, br, wd, bd, color, result,
                                  moves, analysis, speed, url}; games from a set position (FEN), bullet, unfinished or with an
                                 illegal move are counted in `skipped`, not analysed */
'use strict';
window.PgnFile=(()=>{
  const TOKEN=/\[\s*(\w+)\s+"((?:[^"\\]|\\.)*)"\s*\]|\{[^}]*\}|;[^\n]*|\(|\)|\$\d+|[^\s(){}[\];]+/g;
  const RESULTS=new Set(['1-0','0-1','1/2-1/2','*']);
  function evalOf(c){ const m=/\[%eval\s+(#?)(-?[\d.]+)/.exec(c); if(!m) return null; const v=parseFloat(m[2]); return m[1]?(v>0?99:v<0?-99:0):v }
  function parse(text){
    const games=[]; let cur=null, depth=0;
    const start=()=>{ cur={h:{},sans:[],evals:[],result:null}; games.push(cur); depth=0 };
    const src=String(text||'').replace(/^﻿/,'').replace(/\r/g,'');
    for(const m of src.matchAll(TOKEN)){
      const t=m[0];
      if(m[1]){ if(!cur||cur.sans.length||cur.result) start(); cur.h[m[1]]=m[2].replace(/\\"/g,'"'); continue }
      if(!cur) start();
      if(t==='('){ depth++; continue } if(t===')'){ depth=Math.max(0,depth-1); continue }
      if(depth) continue;
      if(t[0]==='{'){ const e=evalOf(t); if(e!=null&&cur.sans.length) cur.evals[cur.sans.length-1]=e; continue }
      if(t[0]===';'||t[0]==='$') continue;
      if(RESULTS.has(t)){ cur.result=t; continue }
      const san=t.replace(/^\d+\.+/,'').replace(/[!?]+$/,'');
      if(!san||/^\d+\.*$/.test(t)) continue;
      cur.sans.push(san);
    }
    return {games:games.filter(g=>g.sans.length||Object.keys(g.h).length)};
  }
  const norm=s=>String(s||'').trim();
  function players(P){
    const n=new Map();
    for(const g of P.games) for(const k of ['White','Black']){ const v=norm(g.h[k]); if(v&&v!=='?') n.set(v,(n.get(v)||0)+1) }
    return [...n.entries()].sort((a,b)=>b[1]-a[1]);
  }
  const int=v=>{ const x=parseInt(String(v||'').replace(/^\+/,''),10); return isFinite(x)?x:null };
  function speedOf(h){
    const tc=h.TimeControl||'';
    let m=/^(\d+)(?:\+(\d+))?$/.exec(tc);   // seconds + increment: the clock decides
    if(m){ const t=+m[1]+40*(+m[2]||0); return t<180?'bullet':t<480?'blitz':t<1500?'rapid':'classical' }
    const ev=(h.Event||'').toLowerCase();
    for(const k of ['bullet','blitz','rapid','classical']) if(ev.includes(k)) return k;
    m=/^G\/?(\d+)/i.exec(tc)||/(?:^|;)(?:\d+\/)?(\d+)(?::|$)/.exec(tc);   // G/90;d5 (US Chess) or 40/5400:1800 (minutes or seconds)
    if(m){ let base=+m[1]; if(base>300) base=base/60; return base<5?'blitz':base<30?'rapid':'classical' }
    return 'classical';   // an over-the-board file without a time control: classical
  }
  function dateOf(h){
    const d=(h.Date||h.UTCDate||'').replace(/\?\?/g,'01');
    return /^\d{4}\.\d\d\.\d\d$/.test(d)&&!/^\?/.test(h.Date||'')?d.replace(/\./g,'-'):'';
  }
  /* toGamesAsync: the same, handing the browser back every few games so a big file never freezes the page
     (13 Nov 2026: a 208-game file locked Chrome while every move was checked), with onProgress(done, total) */
  async function toGamesAsync(P,me,onProgress){
    const all=P.games, out={games:[],skipped:{notYou:0,fen:0,bullet:0,unfinished:0,illegal:0}};
    for(let i=0;i<all.length;i+=3){ const r=toGames({games:all.slice(i,i+3)},me,i);
      out.games.push(...r.games); for(const k in r.skipped) out.skipped[k]+=r.skipped[k];
      onProgress&&onProgress(Math.min(all.length,i+3),all.length); await new Promise(res=>setTimeout(res,0)) }
    out.games.sort((a,b)=>a.ts-b.ts); return out }
  function toGames(P,me,base=0){
    const who=norm(me).toLowerCase(), out=[]; const skipped={notYou:0,fen:0,bullet:0,unfinished:0,illegal:0};
    P.games.forEach((x,j)=>{ const i=base+j;
      const h=x.h, w=norm(h.White).toLowerCase(), b=norm(h.Black).toLowerCase();
      if(w!==who&&b!==who){ skipped.notYou++; return }
      if(h.FEN||h.SetUp==='1'){ skipped.fen++; return }
      const result=h.Result&&RESULTS.has(h.Result)&&h.Result!=='*'?h.Result:x.result&&x.result!=='*'?x.result:null;
      if(!result){ skipped.unfinished++; return }
      const speed=speedOf(h); if(speed==='bullet'){ skipped.bullet++; return }
      const g=new Chess(), moves=[];
      for(const san of x.sans){ const m=g.move(san,{sloppy:true}); if(!m){ skipped.illegal++; return } moves.push(m.san) }
      if(moves.length<6){ skipped.unfinished++; return }
      const site=/lichess\.org/i.test(h.Site||'')?'lichess':/chess\.com/i.test((h.Site||'')+(h.Link||''))?'chesscom':'pgn';
      const date=dateOf(h), color=w===who?'w':'b';
      /* stored evals: used when the file has them for most of the game (a Lichess study after its server analysis, ChessBase) */
      const n=x.evals.filter(v=>v!=null).length; let analysis=null;
      if(n>=0.7*moves.length){ let last=0; analysis=moves.map((_,k)=>{ const v=x.evals[k]; if(v!=null) last=v; return Math.abs(last)>=99?{mate:last>0?1:-1}:{eval:Math.round(last*100)} }) }
      const rnd=parseFloat(h.Round)||0;
      out.push({site,id:'f'+PGN.posId([h.White,h.Black,h.Date,h.Round,moves.join(' ')].join('|')),date,ts:(date?Date.parse(date):0)+rnd*60000+i,
        white:norm(h.White),black:norm(h.Black),wr:int(h.WhiteElo),br:int(h.BlackElo),wd:int(h.WhiteRatingDiff),bd:int(h.BlackRatingDiff),
        color,result,moves,analysis,speed,url:/^https?:\/\//.test(h.Site||'')?h.Site:/^https?:\/\//.test(h.Link||'')?h.Link:'',event:h.Event||''});
    });
    out.sort((a,b)=>a.ts-b.ts);
    return {games:out,skipped};
  }
  return {parse,players,toGames,toGamesAsync,speedOf};
})();
