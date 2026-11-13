/* Chess Lab Open — your own PGN file as a source for Analyze my games (over-the-board games, or any export).
   Everything happens in this browser: the file is read here and never uploaded.

   PgnFile.parse(text)        -> {games:[{h (headers), sans (main line), evals (pawns, White's side, per ply, or null)}], skipped}
                                 side lines and comments are skipped; [%eval 0.31] / [%eval #-3] in the main line are kept
   PgnFile.players(parsed)    -> [[name, games]] most frequent first (who "you" are is the name in nearly every game)
   PgnFile.toGamesAsync(parsed, me, onProgress) -> the same, a few games at a time (the page stays responsive)
   PgnFile.toGames(parsed, me) -> Analyze's game records for the games "me" played (White or Black), oldest first:
                                 {site:'pgn'|'lichess'|'chesscom', id, date, ts, white, black, wr, br, wd, bd, wp, bp, color,
                                  result, moves, analysis, speed, url, file, sys}; games from a set position (FEN), bullet,
                                 unfinished or with an illegal move are counted in `skipped`, not analysed.
                                 me: one name or a list of names (a Lichess handle in one file, a full name in another).
   Several files (14 Nov 2026; Lichess studies stop at 64 chapters, so one player's games come as several exports):
   PgnFile.merge([{name, parsed, sys}]) -> one parsed set, each game tagged with its file and rating system; the same
                                 game in two files (same players, date and moves) is kept once: {games, dupes}
   PgnFile.detect(parsed)     -> {sys, why}: the rating system the file's ratings are in — Lichess / Chess.com by the Site
                                 tag, FIDE when the file carries FIDE ids, otherwise over the board = US Chess (assumed);
                                 no ratings at all: unspecified */
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
    const all=P.games, out={games:[],skipped:{notYou:0,fen:0,bullet:0,unfinished:0,illegal:0,byFile:{}}};
    for(let i=0;i<all.length;i+=3){ const r=toGames({games:all.slice(i,i+3)},me,i);
      out.games.push(...r.games); for(const k in r.skipped) if(k!=='byFile') out.skipped[k]+=r.skipped[k];
      for(const [f,o] of Object.entries(r.skipped.byFile)){ const t=out.skipped.byFile[f]=out.skipped.byFile[f]||{}; for(const k in o) t[k]=(t[k]||0)+o[k] }
      onProgress&&onProgress(Math.min(all.length,i+3),all.length); await new Promise(res=>setTimeout(res,0)) }
    out.games.sort((a,b)=>a.ts-b.ts); return out }
  /* provisional ratings as US Chess writes them: 1450P, 1450P12, 1450/12 */
  const provOf=v=>/^\s*\d+\s*(P\d*|\/\d+)\s*$/i.test(String(v||''));
  const siteOf=h=>/lichess\.org/i.test(h.Site||'')?'lichess':/chess\.com/i.test((h.Site||'')+(h.Link||''))?'chesscom':'pgn';
  function detect(P){
    const c={lichess:0,chesscom:0,fide:0,otb:0,rated:0};
    for(const x of P.games){ const h=x.h, s=siteOf(h);
      if(s!=='pgn'){ c[s]++; continue }
      if(int(h.WhiteElo)>0||int(h.BlackElo)>0) c.rated++;
      if(h.WhiteFideId||h.BlackFideId) c.fide++; else c.otb++ }
    const n=P.games.length||1;
    if(c.lichess>=n/2) return {sys:'lichess',why:'the games are from lichess.org'};
    if(c.chesscom>=n/2) return {sys:'chesscom',why:'the games are from Chess.com'};
    if(c.fide>=n/2) return {sys:'fide',why:'the file carries FIDE ids'};
    if(!c.rated) return {sys:'unspecified',why:'the file has no ratings'};
    return {sys:'uschess',why:'assumed: over-the-board games without FIDE ids',assumed:true};
  }
  function merge(files){
    const seen=new Set(), games=[]; let dupes=0;
    files.forEach((f,fi)=>{ for(const x of f.parsed.games){ const h=x.h;
      const k=[norm(h.White).toLowerCase(),norm(h.Black).toLowerCase(),(h.Date||h.UTCDate||'').replace(/\?/g,''),x.sans.join(' ')].join('|');
      if(x.sans.length&&seen.has(k)){ dupes++; continue } seen.add(k);
      games.push(Object.assign({},x,{file:f.name,fileIdx:fi,sys:f.sys})) } });
    return {games,dupes};
  }
  function toGames(P,me,base=0){
    const fileSys=P.games.some(x=>!x.sys)?detect(P).sys:null;   /* one file read directly (not through merge): its own guess */
    const names=(Array.isArray(me)?me:[me]).map(n=>norm(n).toLowerCase()).filter(Boolean), out=[]; const skipped={notYou:0,fen:0,bullet:0,unfinished:0,illegal:0,byFile:{}};
    P.games.forEach((x,j)=>{ const i=base+j;
      const sk=k=>{ skipped[k]++; if(x.file){ const f=skipped.byFile[x.file]=skipped.byFile[x.file]||{}; f[k]=(f[k]||0)+1 } };
      const h=x.h, w=norm(h.White).toLowerCase(), b=norm(h.Black).toLowerCase();
      const iw=names.includes(w), ib=names.includes(b);
      if(!iw&&!ib||iw&&ib){ sk('notYou'); return }
      if(h.FEN||h.SetUp==='1'){ sk('fen'); return }
      const result=h.Result&&RESULTS.has(h.Result)&&h.Result!=='*'?h.Result:x.result&&x.result!=='*'?x.result:null;
      if(!result){ sk('unfinished'); return }
      const speed=speedOf(h); if(speed==='bullet'){ sk('bullet'); return }
      const g=new Chess(), moves=[];
      for(const san of x.sans){ const m=g.move(san,{sloppy:true}); if(!m){ sk('illegal'); return } moves.push(m.san) }
      if(moves.length<6){ sk('unfinished'); return }
      const site=siteOf(h);
      const date=dateOf(h), color=iw?'w':'b';
      /* the rating system: an online game's own site; otherwise the file's (chosen or detected) */
      const sys=site!=='pgn'?site:(x.sys||fileSys||'unspecified');
      /* stored evals: used when the file has them for most of the game (a Lichess study after its server analysis, ChessBase) */
      const n=x.evals.filter(v=>v!=null).length; let analysis=null;
      if(n>=0.7*moves.length){ let last=0; analysis=moves.map((_,k)=>{ const v=x.evals[k]; if(v!=null) last=v; return Math.abs(last)>=99?{mate:last>0?1:-1}:{eval:Math.round(last*100)} }) }
      const rnd=parseFloat(h.Round)||0;
      out.push({site,id:'f'+PGN.posId([h.White,h.Black,h.Date,h.Round,moves.join(' ')].join('|')),date,ts:(date?Date.parse(date):0)+rnd*60000+i,
        white:norm(h.White),black:norm(h.Black),wr:int(h.WhiteElo),br:int(h.BlackElo),wd:int(h.WhiteRatingDiff),bd:int(h.BlackRatingDiff),wp:provOf(h.WhiteElo),bp:provOf(h.BlackElo),file:x.file||'',sys,
        color,result,moves,analysis,speed,url:/^https?:\/\//.test(h.Site||'')?h.Site:/^https?:\/\//.test(h.Link||'')?h.Link:'',event:h.Event||''});
    });
    out.sort((a,b)=>a.ts-b.ts);
    return {games:out,skipped};
  }
  return {parse,players,toGames,toGamesAsync,speedOf,detect,merge,provOf};
})();
