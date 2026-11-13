/* Chess Lab Open — the report card of Analyze my games: filters, stats and charts (14 Nov 2026).
   Every stat follows the filters at the top (colour, time control, period, opponent rating, rated or not, rating system,
   file). Results need no engine and use every game; mistakes, accuracy and move quality use the analyzed games.
   Ratings are only compared inside one pool (rating system + time control): a performance rating is never a blend of a
   US Chess and a Lichess rating (shared/perf.js). Charts are plain SVG/HTML in the site's colours, each with its table.

     AStats.render(ctx)  HTML for the whole report; ctx {user, site, rows, allGames, total, final, fileNote, files,
                         yearly(games, sc), save(mistakes, toPunish, final)}
     AStats.click(e) / AStats.change(e)  filter and toggle events from the report; true when it should redraw
     AStats.last         {mistakes, toPunish} of the last render (Save drills uses them)
     AStats.quality(rows), AStats.leftBook(game), AStats.filter(games, F), AStats.perfCell(games)  (tests) */
'use strict';
window.AStats=(()=>{
  const F0={col:'all',speed:'all',period:'all',rmin:'',rmax:'',rated:'all',sys:'all',file:'all'};
  let F={...F0}, BANDCOL='all', OPCOL='w', OPEN=null, last=null, bookTried=false, bookDone=false;
  const sc=g=>g.result==='1/2-1/2'?0.5:(g.result==='1-0')===(g.color==='w')?1:0;
  const own=g=>g.color==='w'?g.wr:g.br, opp=g=>g.color==='w'?g.br:g.wr, oppName=g=>g.color==='w'?g.black:g.white;
  const sysOf=g=>g.sys||(g.site==='pgn'?'uschess':g.site);
  const ONLINE=new Set(['lichess','chesscom']);
  const SPEED={blitz:'Blitz',rapid:'Rapid',classical:'Classical',correspondence:'Correspondence'};
  /* a rating pool: the system, and the time control (Lichess blitz and rapid are different ratings; US Chess has its
     regular and quick ratings) */
  const poolKey=g=>`${sysOf(g)}|${g.speed}`;
  const poolName=k=>{ const [s,sp]=k.split('|'); return `${Perf.LABEL[s]||s} ${(SPEED[sp]||sp||'').toLowerCase()}`.trim() };
  const pct=(a,b)=>b?Math.round(100*a/b):null;
  const q=t=>Help.q(t);

  /* ---------- filters ---------- */
  const monthsAgo=n=>{ const d=new Date(); d.setMonth(d.getMonth()-n); return d.toISOString().slice(0,10) };
  function filter(games,f=F){
    const rmin=+f.rmin||0, rmax=+f.rmax||0;
    return games.filter(g=>{
      if(f.col!=='all'&&g.color!==f.col) return false;
      if(f.speed!=='all'&&g.speed!==f.speed) return false;
      if(f.period!=='all'){ const d=g.date||''; if(/^\d{4}$/.test(f.period)){ if(d.slice(0,4)!==f.period) return false }
        else if(f.period==='m3'){ if(!d||d<monthsAgo(3)) return false } else if(f.period==='m12'){ if(!d||d<monthsAgo(12)) return false } }
      const o=opp(g)||0;
      if(f.rated==='rated'&&!(o>0)) return false; if(f.rated==='unrated'&&o>0) return false;
      if((rmin||rmax)&&!(o>0)) return false; if(rmin&&o<rmin) return false; if(rmax&&o>rmax) return false;
      if(f.sys!=='all'&&sysOf(g)!==f.sys) return false;
      if(f.file!=='all'&&g.file!==f.file) return false;
      return true });
  }
  function filterBar(all,shown,files){
    const speeds=[...new Set(all.map(g=>g.speed))].filter(Boolean), years=[...new Set(all.map(g=>(g.date||'').slice(0,4)).filter(Boolean))].sort();
    const syss=[...new Set(all.map(sysOf))], fls=[...new Set(all.map(g=>g.file).filter(Boolean))];
    const sel=(k,label,opts)=>`<label class="afl">${label}<select data-af="${k}">${opts.map(([v,l])=>`<option value="${esc(v)}"${String(F[k])===String(v)?' selected':''}>${esc(l)}</option>`).join('')}</select></label>`;
    const on=Object.keys(F0).some(k=>String(F[k])!==String(F0[k]));
    return `<div class="card afilters" role="group" aria-label="Filters">
      <div class="afrow">
        <div class="afl"><span>Colour</span><div class="seg" role="group">${[['all','Both'],['w','White'],['b','Black']].map(([v,l])=>`<button type="button" data-afc="${v}" aria-pressed="${F.col===v}">${l}</button>`).join('')}</div></div>
        ${speeds.length>1?sel('speed','Time control',[['all','All'],...speeds.map(s=>[s,SPEED[s]||s])]):''}
        ${sel('period','Period',[['all','All time'],['m3','Last 3 months'],['m12','Last 12 months'],...years.slice().reverse().map(y=>[y,y])])}
        <div class="afl"><span>Opponent rating</span><span class="afrange"><input type="number" inputmode="numeric" step="100" min="0" max="3500" placeholder="from" data-af="rmin" value="${esc(F.rmin)}" aria-label="Opponent rating from"><span>–</span><input type="number" inputmode="numeric" step="100" min="0" max="3500" placeholder="to" data-af="rmax" value="${esc(F.rmax)}" aria-label="Opponent rating to"></span></div>
        ${sel('rated','Opponent',[['all','Rated or not'],['rated','Rated only'],['unrated','Unrated only']])}
        ${syss.length>1?sel('sys','Rating system',[['all','All'],...syss.map(s=>[s,Perf.LABEL[s]||s])]):''}
        ${fls.length>1?sel('file','File',[['all','All files'],...fls.map(f=>[f,f])]):''}
      </div>
      <p class="note afcount"><b>${shown}</b> of ${all.length} games${on?` · <button type="button" class="linkbtn" data-afreset>Reset filters</button>`:''}</p></div>`;
  }

  /* ---------- small marks ---------- */
  /* a win / draw / loss bar: green, grey, red with a 2px gap; the numbers are in the table beside it */
  function wdlBar(w,d,l,title=''){
    const n=w+d+l; if(!n) return '';
    const seg=(c,v,lab)=>v?`<i class="${c}" style="flex:${v}" title="${lab} ${v} (${Math.round(100*v/n)}%)"></i>`:'';
    return `<span class="awdl" role="img" aria-label="${title?esc(title)+': ':''}${w} won, ${d} drawn, ${l} lost">${seg('w',w,'Won')}${seg('d',d,'Drawn')}${seg('l',l,'Lost')}</span>`;
  }
  const wdlOf=gs=>{ const w=gs.filter(g=>sc(g)===1).length, d=gs.filter(g=>sc(g)===0.5).length; return [w,d,gs.length-w-d] };
  /* performance per pool: one figure when the games are one pool, else one per pool, labelled */
  function perfs(gs){
    const by=new Map(); for(const g of gs){ const k=poolKey(g); if(!by.has(k)) by.set(k,[]); by.get(k).push(g) }
    return [...by.entries()].sort((a,b)=>b[1].length-a[1].length).map(([k,xs])=>({pool:k,...Perf.calc(xs.map(g=>({opp:opp(g),own:own(g),score:sc(g),prov:g.color==='w'?g.bp:g.wp})),k.split('|')[0])}));
  }
  const whyOf=(R,files)=>{ if(!files||R.system!=='uschess'&&R.system!=='fide'&&R.system!=='unspecified') return ''; const f=files.find(x=>x.sys===R.system); return f?f.why:'' };
  function perfCell(gs,files){
    const P=perfs(gs), shown=P.filter(r=>r.perf!=null);
    if(!shown.length){ const n=P.reduce((a,r)=>a+r.oppN,0); return `<span class="note" title="A performance rating needs ${Perf.MIN} or more rated games in one rating pool.">${n?`— <small>(${n} rated)</small>`:'—'}</span>` }
    const one=P.length===1;
    return shown.map(r=>`<span class="aperf" title="${esc(Perf.help(r,{why:whyOf(r,files)}))}"><b class="mono">${r.perf}</b>${one?'':` <small class="note">${esc(poolName(r.pool))}</small>`}</span>`).join('');
  }
  function oppCell(gs){ const r=gs.map(opp).filter(x=>x>0).sort((a,b)=>a-b); if(!r.length) return '—';
    const n=r.length, avg=Math.round(r.reduce((a,b)=>a+b,0)/n), med=Math.round(n%2?r[(n-1)/2]:(r[n/2-1]+r[n/2])/2);
    return `<span class="mono">${avg}</span> <span class="note mono">· ${med}</span>` }
  function expCell(gs){ const P=perfs(gs).filter(r=>r.exp!=null); if(!P.length) return '—';
    const e=Math.round(10*P.reduce((a,r)=>a+r.exp,0))/10, n=P.reduce((a,r)=>a+r.expN,0);
    return `<span class="mono ${e>=0.5?'tgood':e<=-0.5?'tbad':''}" title="${n} games where both ratings are known: your points minus what your ratings predicted">${Perf.fmtExp(e)}</span>` }
  /* one results row: name (+ a W/D/L bar), games, score, opponents avg · median, performance, score vs expected */
  const resRow=(name,gs,files,extra='')=>{ const [w,d,l]=wdlOf(gs), s=gs.reduce((a,g)=>a+sc(g),0);
    return `<tr${extra}><td class="arname">${name}${wdlBar(w,d,l,typeof name==='string'?name.replace(/<[^>]*>/g,''):'')}</td><td class="num" data-l="Games">${gs.length}<div class="note">${w} / ${d} / ${l}</div></td><td class="num" data-l="Score">${gs.length?pct(s,gs.length)+'%':'—'}</td>
      <td class="num" data-l="Opponents avg · median">${oppCell(gs)}</td><td class="num" data-l="Performance">${perfCell(gs,files)}</td><td class="num" data-l="vs expected">${expCell(gs)}</td></tr>` };
  const RES_HEAD=label=>`<thead><tr><th>${label}</th><th class="num">Games<div class="note">W / D / L</div></th><th class="num">Score</th><th class="num">Opponents${q('Your opponents’ average and median rating (the median is the middle one, so one very low or high opponent can’t move it). Unrated opponents are left out.')}<div class="note">avg · median</div></th>
    <th class="num">Performance${q('The performance rating by the games’ own rating system: US Chess’s formula for US Chess ratings, FIDE’s method for FIDE, Lichess and Chess.com, from 5 or more rated games in one pool; an opponent more than 400 below you counts as 400 below. When the games span several rating pools, each pool gets its own figure. Hover a figure for exactly how it was worked out.')}</th>
    <th class="num">vs expected${q('Your points minus the points your ratings predicted (the Elo expectation from your rating and your opponent’s in each game). +2.0 means two points more than expected: the clearest sign of whether a score is about the opposition or about the play.')}</th></tr></thead>`;

  /* ---------- results by opponent rating: 100% stacked bars ---------- */
  function bandsOf(gs){
    const rated=gs.filter(g=>opp(g)>0); if(!rated.length) return {w:200,rows:[]};
    const w=rated.length>=150?100:200;
    const m=new Map(); for(const g of rated){ const b=Math.floor(opp(g)/w)*w; if(!m.has(b)) m.set(b,[]); m.get(b).push(g) }
    return {w,rows:[...m.entries()].sort((a,b)=>a[0]-b[0]).map(([b,xs])=>({lo:b,hi:b+w-1,gs:xs}))};
  }
  function bandChart(B){
    if(B.rows.length<2) return '';
    const n=B.rows.length, bw=Math.max(18,Math.min(44,560/n)), gap=4, H=150, L=34, W=L+n*(bw+gap)+4;
    const y=v=>8+H-H*v;
    const bars=B.rows.map((r,i)=>{ const [w,d,l]=wdlOf(r.gs), N=r.gs.length, x=L+i*(bw+gap);
      const fw=w/N, fd=d/N, fl=l/N; let top=y(1);
      const seg=(f,c,lab,v)=>{ if(!f) return ''; const h=H*f-2>1?H*f-2:H*f; const out=`<rect class="${c}" x="${x}" y="${top}" width="${bw}" height="${Math.max(1,h)}" rx="2"><title>${r.lo}–${r.hi}: ${lab} ${v} of ${N} (${Math.round(100*f)}%)</title></rect>`; top+=H*f; return out };
      return seg(fw,'cw','won',w)+seg(fd,'cd','drew',d)+seg(fl,'cl','lost',l)+`<text class="cn" x="${x+bw/2}" y="${H+22}" text-anchor="middle">${r.lo}</text>` }).join('');
    const grid=[0,.25,.5,.75,1].map(v=>`<line class="cg" x1="${L-4}" x2="${W}" y1="${y(v)}" y2="${y(v)}"/><text class="cn" x="${L-8}" y="${y(v)+4}" text-anchor="end">${v*100}%</text>`).join('');
    return `<figure class="achart"><svg viewBox="0 0 ${W} ${H+30}" role="img" aria-label="Results by opponent rating, as shares of won, drawn and lost games per ${B.w}-point band">${grid}${bars}</svg>
      <figcaption class="alegend"><span><i class="cw"></i>Won</span><span><i class="cd"></i>Drawn</span><span><i class="cl"></i>Lost</span><span class="note">Each bar: one ${B.w}-point band of opponent ratings, its lower edge below.</span></figcaption></figure>`;
  }

  /* ---------- openings ---------- */
  const fensOf=g=>{ if(g._fens) return g._fens; const c=new Chess(), f=[c.fen()]; for(const s of g.moves.slice(0,24)){ if(!c.move(s,{sloppy:true})) break; f.push(c.fen()) } Object.defineProperty(g,'_fens',{value:f}); return f };
  const openingOf=g=>{ const nm=Book.nameOf(fensOf(g).slice(0,21)); return nm?nm[1].split(':')[0]:'Other' };
  /* leaving book: the first move (by either side) that the Elite book (Lichess Elite Database) has no 5+ games of */
  const BOOKMIN=5;
  function leftBook(g){
    if(!Book.hasStatic) return null;
    const f=fensOf(g), c=new Chess();
    for(let i=0;i<Math.min(g.moves.length,f.length-1);i++){
      const b=Book.now(f[i],'masters'), m=c.move(g.moves[i],{sloppy:true}); if(!m) return null;
      const uci=m.from+m.to+(m.promotion||'');
      const r=b&&b.rows.find(x=>x.uci===uci);
      if(!r||r.games<BOOKMIN) return {ply:i,me:(i%2===0?'w':'b')===g.color,move:Math.floor(i/2)+1};
    }
    return {ply:Math.min(g.moves.length,f.length-1),me:null,move:null,deep:true};   /* still in book after 24 plies */
  }

  /* ---------- move quality ---------- */
  /* Each of your moves by the Win% it lost (Lichess's Win%, 0–100 from your side). The three worst classes are the
     site's (inaccuracy 5+, mistake 10+, blunder 15+ points); Best is under 1 point lost (the engine's move or one as
     good — the move itself isn't compared), Excellent 1–2.5, Good 2.5–5. Book: your moves while the game was still in
     the Elite book. Missed win: a move from +2 or better (pawns, your side) to under +1. */
  const QC=[['book','Book'],['best','Best'],['excellent','Excellent'],['good','Good'],['inacc','Inaccuracy'],['mist','Mistake'],['blun','Blunder']];
  const classOf=x=>x<1?'best':x<2.5?'excellent':x<5?'good':x<10?'inacc':x<15?'mist':'blun';
  function quality(rows,pick=()=>true){
    const c=Object.fromEntries(QC.map(([k])=>[k,0])); let missed=0, n=0;
    const byPh={opening:{},middlegame:{},endgame:{}};
    for(const r of rows){ const lb=leftBook(r.game), at=(r.marks.phase&&r.marks.phase.at)||{};
      for(const m of r.marks.moves||[]){ if(!pick(r,m)) continue; n++;
        const k=lb&&m.ply<lb.ply?'book':classOf(m.winLost); c[k]++;
        const ph=at[m.ply]||'opening'; byPh[ph][k]=(byPh[ph][k]||0)+1; byPh[ph].n=(byPh[ph].n||0)+1;
        if(m.before>=2&&m.after<1&&m.winLost>=5) missed++ } }
    return {c,n,missed,byPh};
  }

  /* ---------- over time: score and accuracy by month (one axis, both in %) ---------- */
  function timeChart(all,rows){
    const months=[...new Set(all.map(g=>(g.date||'').slice(0,7)).filter(Boolean))].sort(); if(months.length<4) return '';
    const by=new Map(months.map(m=>[m,{g:[],a:[]}]));
    for(const g of all){ const m=(g.date||'').slice(0,7); if(by.has(m)) by.get(m).g.push(g) }
    for(const r of rows){ const m=(r.game.date||'').slice(0,7); if(by.has(m)) for(const k in r.marks.phase) by.get(m).a.push(...r.marks.phase[k]) }
    const pts=months.map(m=>{ const o=by.get(m); return {m,s:o.g.length>=3?100*o.g.reduce((a,g)=>a+sc(g),0)/o.g.length:null,n:o.g.length,a:o.a.length>=30?o.a.reduce((a,b)=>a+b,0)/o.a.length:null} });
    if(pts.filter(p=>p.s!=null).length<3) return '';
    const W=640, H=170, L=36, R=8, T=10, x=i=>L+(W-L-R)*(months.length===1?0.5:i/(months.length-1)), y=v=>T+H-H*v/100;
    const line=(k,c,lab)=>{ const P=pts.map((p,i)=>p[k]==null?null:[x(i),y(p[k]),p]); let d='', on=false;
      for(const p of P){ if(!p){ on=false; continue } d+=(on?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1); on=true }
      return `<path class="${c}" d="${d}" fill="none"/>`+P.filter(Boolean).map(([px,py,p])=>`<circle class="${c}" cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="4"><title>${p.m}: ${lab} ${Math.round(p[k])}%${k==='s'?` (${p.n} games)`:''}</title></circle>`).join('') };
    const grid=[0,25,50,75,100].map(v=>`<line class="cg" x1="${L-4}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}"/><text class="cn" x="${L-8}" y="${y(v)+4}" text-anchor="end">${v}%</text>`).join('');
    const step=Math.ceil(months.length/8), xl=months.map((m,i)=>i%step?'':`<text class="cn" x="${x(i)}" y="${T+H+18}" text-anchor="middle">${m.slice(2).replace('-','/')}</text>`).join('');
    const hasA=pts.some(p=>p.a!=null);
    return `<div class="card wide"><span class="label">Over time${q('Your score (points as a share of games, months with 3+ games) and your average accuracy (months with 30+ analyzed moves of yours), month by month. Both are percentages, so they share one axis.')}</span>
      <figure class="achart"><svg viewBox="0 0 ${W} ${H+28}" role="img" aria-label="Score${hasA?' and accuracy':''} by month">${grid}${xl}${line('s','ls','score')}${hasA?line('a','la','accuracy'):''}</svg>
      <figcaption class="alegend"><span><i class="ls"></i>Score</span>${hasA?'<span><i class="la"></i>Accuracy</span>':''}</figcaption></figure></div>`;
  }

  /* ---------- the report ---------- */
  function render(ctx){
    const {user,site,rows:rows0,allGames,total,final,files}=ctx;
    const all=filter(allGames), ids=new Set(all.map(g=>g.id)), rows=rows0.filter(r=>ids.has(r.game.id));
    const SITE={lichess:'Lichess',chesscom:'Chess.com',pgn:files&&files.length>1?'Your PGN files':'Your PGN file'}[site]||site, got=site==='pgn'?'in the file'+(files&&files.length>1?'s':''):'fetched';
    const head=`<div class="rhead"><h2>Report card: ${esc(user)}</h2><span class="note">${esc(SITE)} · ${allGames.length} games ${got}${final?'':' · analyzing…'}</span></div>`;
    const bar=filterBar(allGames,all.length,files);
    if(!all.length){ last={mistakes:[],toPunish:[]}; return head+bar+'<p class="empty">No games match these filters.</p>' }
    const W=rows.filter(r=>r.marks.score===1).length, D=rows.filter(r=>r.marks.score===0.5).length, L=rows.length-W-D;
    const blun=rows.reduce((a,r)=>a+r.marks.blun,0), mist=rows.reduce((a,r)=>a+r.marks.mist,0), inacc=rows.reduce((a,r)=>a+r.marks.inacc,0);
    const convs=rows.filter(r=>r.marks.conv!=null), saves=rows.filter(r=>r.marks.save!=null);
    const conv=convs.length?Math.round(100*convs.filter(r=>r.marks.conv).length/convs.length):null;
    const save=saves.length?Math.round(100*saves.filter(r=>r.marks.save).length/saves.length):null;
    const yearly=ctx.yearly(all,sc);
    const ph={opening:[],middlegame:[],endgame:[]}; for(const r of rows) if(r.marks.phase) for(const k in ph) ph[k].push(...r.marks.phase[k]);
    const avg=a=>a.length?Math.round(a.reduce((x,y)=>x+y,0)/a.length):null;
    const mistakes=rows.flatMap(r=>r.marks.drops.map(d=>({...d,game:r.game}))).sort((a,b)=>b.drop-a.drop);
    const pun=rows.flatMap(r=>r.marks.punish.map(d=>({...d,game:r.game})));
    const toPunish=pun.filter(p=>p.verdict!=='punished').sort((a,b)=>b.drop-a.drop);
    last={mistakes,toPunish};
    const modes=[...new Set(rows.map(r=>r.game.evsrc).filter(Boolean))];
    const MODE={lichess:'Lichess server analysis',file:'evals in the file',standard:'Standard analysis',deep:'Deep analysis'};
    const syss=[...new Set(all.map(sysOf))], mixed=syss.length>1||new Set(all.filter(g=>opp(g)>0).map(poolKey)).size>1;
    /* ---- tiles ---- */
    const noRows=!rows.length;
    const tiles=`<div class="stats">
      <div class="stat"><b class="sm">${noRows?'—':`${W}–${D}–${L}`}</b><span class="note">wins / draws / losses in ${rows.length} analyzed game${rows.length===1?'':'s'}${final?'':' of '+total+'…'}${q('Results of the games analyzed here, from your side. Results of every game, analyzed or not, are under Results below.')}</span></div>
      <div class="stat"><b class="sm">${noRows?'—':`${blun} / ${mist} / ${inacc}`}</b><span class="note">your blunders / mistakes / inaccuracies${noRows?'':`, ${(blun/rows.length).toFixed(1)} / ${(mist/rows.length).toFixed(1)} / ${(inacc/rows.length).toFixed(1)} per game`}${q('Each of your moves is judged by how much it dropped your Win%. '+WinPct.HELP)}</span></div>
      <div class="stat"><b>${conv==null?'—':conv+'%'}</b><span class="note">won from +2 (${convs.length} games)${q('Of the games where you were 2 pawns or more ahead (by the engine), the share you went on to win.')}</span></div>
      <div class="stat"><b>${save==null?'—':save+'%'}</b><span class="note">saved from −2 (${saves.length} games)${q('Of the games where you were 2 pawns or more behind, the share you drew or won.')}</span></div>
      ${Yearly.tile(yearly)}
      <div class="stat"><b class="sm">${pun.length?pun.length-toPunish.length+' / '+pun.length:'—'}</b><span class="note">opponents’ mistakes you punished${q("Your opponents' moves that dropped their Win% by 10 points or more (a Lichess mistake), and how many of them you made pay for (your next move kept most of the gain). "+WinPct.HELP)}</span></div>
    </div>`;
    /* ---- results ---- */
    const colRows=['w','b'].map(c=>[c,all.filter(g=>g.color===c)]).filter(([,gs])=>gs.length);
    const bandGs=BANDCOL==='all'?all:all.filter(g=>g.color===BANDCOL), B=bandsOf(bandGs), unrated=bandGs.filter(g=>!(opp(g)>0)).length;
    const speeds=[...new Set(all.map(g=>g.speed))];
    const mixNote=mixed?`<p class="note awarn">These games span ${syss.length>1?`several rating systems (${syss.map(s=>Perf.LABEL[s]).join(', ')})`:'several rating pools'}: a rating band mixes scales, and each pool gets its own performance figure. Pick one under Rating system${speeds.length>1?' or Time control':''} to compare like with like.</p>`:'';
    const results=`<div class="card wide"><span class="label">Results${q('Every game counts here, analyzed or not: results need no engine. Score = your points as a share of the games.')}</span>
      <p class="note">From all ${all.length} ${site==='pgn'?'games in the file'+(files&&files.length>1?'s':''):'fetched games'}${all.length<allGames.length?' that match the filters':''}.</p>
      <div class="tablewrap"><table class="rtable atable ares">${RES_HEAD('You had')}<tbody>${colRows.map(([c,gs])=>resRow(c==='w'?'White':'Black',gs,files)).join('')}</tbody></table></div>
      ${speeds.length>1?`<h4 class="ah4">By time control</h4><div class="tablewrap"><table class="rtable atable ares">${RES_HEAD('Time control')}<tbody>${speeds.map(s=>resRow(SPEED[s]||s,all.filter(g=>g.speed===s),files)).join('')}</tbody></table></div>`:''}
      <h4 class="ah4">By opponent rating</h4>
      <div class="seg mseg" role="group" aria-label="Colour">${[['all','Both colours'],['w','As White'],['b','As Black']].map(([v,l])=>`<button type="button" data-bandcol="${v}" aria-pressed="${BANDCOL===v}">${l}</button>`).join('')}</div>
      ${mixNote}
      ${B.rows.length?bandChart(B)+`<div class="tablewrap"><table class="rtable atable ares">${RES_HEAD('Opponent rated')}<tbody>${B.rows.map(r=>resRow(`${r.lo}–${r.hi}`,r.gs,files)).join('')}</tbody></table></div>`:'<p class="note">No rated opponents in these games.</p>'}
      ${unrated?`<p class="note">${unrated} game${unrated===1?'':'s'} against unrated opponents ${unrated===1?'is':'are'} not in any band.</p>`:''}</div>`;
    /* ---- openings by colour ---- */
    const opsOf=c=>{ const m=new Map(); for(const g of all.filter(g=>g.color===c)){ const k=openingOf(g); if(!m.has(k)) m.set(k,[]); m.get(k).push(g) } return [...m.entries()].sort((a,b)=>b[1].length-a[1].length).slice(0,10) };
    const rowOf=new Map(rows.map(r=>[r.game.id,r]));
    const bmi=gs=>{ const rs=gs.map(g=>rowOf.get(g.id)).filter(Boolean); if(!rs.length) return '—'; const n=rs.length;
      return `${(rs.reduce((a,r)=>a+r.marks.blun,0)/n).toFixed(1)} / ${(rs.reduce((a,r)=>a+r.marks.mist,0)/n).toFixed(1)} / ${(rs.reduce((a,r)=>a+r.marks.inacc,0)/n).toFixed(1)}` };
    const gameLine=g=>`<div class="agline"><span class="note">${esc(g.date||'')}</span><span>vs ${esc(oppName(g))}${opp(g)>0?` <span class="note">${opp(g)}</span>`:''}</span><span class="pill ${sc(g)===1?'good':sc(g)===0?'bad':'none'}">${sc(g)===1?'Won':sc(g)===0?'Lost':'Drawn'}</span>${g.url?`<a class="note" href="${esc(g.url)}" target="_blank" rel="noopener">game ↗</a>`:`<span class="note">${esc(g.event||'')}</span>`}</div>`;
    const opTable=c=>{ const L=opsOf(c); if(!L.length) return '<p class="note">No games with this colour.</p>';
      return `<div class="tablewrap"><table class="rtable atable aops"><thead><tr><th>Opening</th><th class="num">Games<div class="note">W / D / L</div></th><th class="num">Score</th><th class="num">Opponents<div class="note">avg · median</div></th><th class="num">Performance</th><th class="num">B / M / I${q('Your blunders / mistakes / inaccuracies per analyzed game in that opening.')}<div class="note">per game</div></th></tr></thead><tbody>${L.map(([k,gs])=>{ const [w,d,l]=wdlOf(gs), s=gs.reduce((a,g)=>a+sc(g),0), key=c+':'+k, open=OPEN===key;
        return `<tr class="aoprow"><td class="arname"><button type="button" class="linkbtn" data-opgames="${esc(key)}" aria-expanded="${open}">${esc(k)}</button>${wdlBar(w,d,l,k)}</td><td class="num" data-l="Games">${gs.length}<div class="note">${w} / ${d} / ${l}</div></td><td class="num" data-l="Score">${pct(s,gs.length)}%</td><td class="num" data-l="Opponents avg · median">${oppCell(gs)}</td><td class="num" data-l="Performance">${perfCell(gs,files)}</td><td class="num" data-l="B / M / I per game">${bmi(gs)}</td></tr>`+
          (open?`<tr class="agames"><td colspan="6">${gs.slice().sort((a,b)=>(b.ts||0)-(a.ts||0)).map(gameLine).join('')}</td></tr>`:'') }).join('')}</tbody></table></div>` };
    const openings=`<div class="card wide"><span class="label">Your openings${q('Your 10 most played openings with each colour (named by the last named position in the first 20 moves), with results from every game and your errors from the analyzed ones. Tap an opening for its games.')}</span>
      <div class="seg mseg" role="group" aria-label="Colour">${[['w','As White'],['b','As Black']].map(([v,l])=>`<button type="button" data-optab="${v}" aria-pressed="${OPCOL===v}">${l}</button>`).join('')}</div>
      <div data-oppane="w"${OPCOL==='w'?'':' hidden'}>${opTable('w')}</div><div data-oppane="b"${OPCOL==='b'?'':' hidden'}>${opTable('b')}</div></div>`;
    /* ---- leaving book ---- */
    let book='';
    if(!Book.hasStatic){
      if(!bookTried){ bookTried=true; Book.ready().then(()=>{ bookDone=true; if(Book.hasStatic&&window.AnalyzeTab) AnalyzeTab.rerender() }).catch(()=>{}) }
      book=`<div class="card"><span class="label">Leaving the book</span><p class="note">${bookTried&&bookDone?'The opening book could not be loaded (offline?).':'Loading the opening book (Lichess Elite Database)…'}</p></div>` }
    else{
      const lb=all.map(g=>[g,leftBook(g)]).filter(([,x])=>x&&!x.deep);
      const mine=lb.filter(([,x])=>x.me);
      const byOp=new Map(); for(const [g,x] of lb){ const k=openingOf(g); if(!byOp.has(k)) byOp.set(k,[]); byOp.get(k).push(x) }
      const top=[...byOp.entries()].sort((a,b)=>b[1].length-a[1].length).slice(0,10);
      book=`<div class="card"><span class="label">Leaving the book${q(`The book is the Lichess Elite Database (games between 2500+ and 2300+ players): a move counts as book when it was played there ${BOOKMIN}+ times in that position. The game leaves the book at the first move that isn’t — by you or by your opponent.`)}</span>
        ${lb.length?`<p class="note">You left the book first in <b>${pct(mine.length,lb.length)}%</b> of ${lb.length} games${mine.length?`, on average at move <b>${(mine.reduce((a,[,x])=>a+x.move,0)/mine.length).toFixed(1)}</b>`:''}.</p>
        <div class="tablewrap"><table class="rtable atable"><thead><tr><th>Opening</th><th class="num">Games</th><th class="num">You left first</th><th class="num">At move<div class="note">when you did</div></th></tr></thead><tbody>${top.map(([k,xs])=>{ const m=xs.filter(x=>x.me);
          return `<tr><td>${esc(k)}</td><td class="num" data-l="Games">${xs.length}</td><td class="num" data-l="You left first"><span class="${pct(m.length,xs.length)>=60?'tbad':pct(m.length,xs.length)<=35?'tgood':''}">${pct(m.length,xs.length)}%</span></td><td class="num" data-l="At move">${m.length?(m.reduce((a,x)=>a+x.move,0)/m.length).toFixed(1):'—'}</td></tr>` }).join('')}</tbody></table></div>`:'<p class="note">No games here leave the book within 12 moves.</p>'}</div>`;
    }
    /* ---- move quality ---- */
    const Q=quality(rows), Qw=quality(rows,r=>r.game.color==='w'), Qb=quality(rows,r=>r.game.color==='b');
    const qp=(o,k)=>o.n?(100*o.c[k]/o.n).toFixed(1)+'%':'—';
    const quality_=rows.length?`<div class="card"><span class="label">Move quality${q('Each of your moves by the Win% it lost (Lichess’s Win%, from your side): Best under 1 point (the engine’s move or one as good; the move itself isn’t compared), Excellent 1–2.5, Good 2.5–5, Inaccuracy 5–10, Mistake 10–15, Blunder 15+ (the site’s thresholds, the same as the tiles above). Book: your moves while the game was still in the Elite book. Missed wins: moves from +2 or better to under +1.')}</span>
      <p class="note">${Q.n} of your moves in ${rows.length} analyzed games${modes.length?` (${modes.map(m=>MODE[m]).join(', ')})`:''}.</p>
      <div class="tablewrap"><table class="rtable atable aq"><thead><tr><th>Move</th><th class="num">All</th><th class="num">As White</th><th class="num">As Black</th></tr></thead><tbody>${QC.filter(([k])=>k!=='book'||Q.c.book).map(([k,l])=>`<tr class="q-${k}"><td><i class="qdot q${k}"></i>${l}</td><td class="num" data-l="All">${qp(Q,k)} <span class="note">${Q.c[k]}</span></td><td class="num" data-l="As White">${qp(Qw,k)}</td><td class="num" data-l="As Black">${qp(Qb,k)}</td></tr>`).join('')}
        <tr><td>Missed win</td><td class="num" data-l="All">${Q.missed}</td><td class="num" data-l="As White">${Qw.missed}</td><td class="num" data-l="As Black">${Qb.missed}</td></tr></tbody></table></div>
      <h4 class="ah4">By phase</h4>
      <div class="tablewrap"><table class="rtable atable aq"><thead><tr><th>Phase</th><th class="num">Accuracy</th><th class="num">Best / Exc.</th><th class="num">Good</th><th class="num">Inacc.</th><th class="num">Mist.</th><th class="num">Blun.</th></tr></thead><tbody>${['opening','middlegame','endgame'].map(p=>{ const o=Q.byPh[p], n=o.n||0, f=k=>n?Math.round(100*(o[k]||0)/n)+'%':'—';
        return `<tr><td>${p[0].toUpperCase()+p.slice(1)} <span class="note">${n}</span></td><td class="num" data-l="Accuracy">${avg(ph[p])==null?'—':avg(ph[p])+'%'}</td><td class="num" data-l="Best / Excellent">${n?Math.round(100*((o.best||0)+(o.excellent||0)+(o.book||0))/n)+'%':'—'}</td><td class="num" data-l="Good">${f('good')}</td><td class="num" data-l="Inaccuracy">${f('inacc')}</td><td class="num" data-l="Mistake">${f('mist')}</td><td class="num" data-l="Blunder">${f('blun')}</td></tr>` }).join('')}</tbody></table></div>
      <p class="note">Accuracy is Lichess’s per-move accuracy averaged per phase (book moves count in Best).${q('Phases as Lichess divides a game: the middlegame starts when 10 or fewer major and minor pieces are left or a back rank is sparse; the endgame when 6 or fewer are left.')}</p></div>`
      :`<div class="card"><span class="label">Move quality and accuracy</span><p class="note">${final?'No analyzed games match these filters.':'Appears as soon as the first game is analyzed.'}</p></div>`;
    /* ---- costliest moments ---- */
    const costly=`<div class="card wide"><span class="label">Your costliest moments (${mistakes.length})${q('Your moves that dropped your Win% the most: before the move → after it, from your side. '+WinPct.HELP)}</span>
      <div style="margin-top:6px">${mistakes.slice(0,10).map(m=>`<div class="gamerow"><span class="src">${esc(m.game.date)}</span>
        <span>${esc(m.san)} <span class="note">vs ${esc(oppName(m.game))}</span></span>
        <span class="pill ${m.drop>=0.3?'bad':'warn'}" title="Win%, from your side">${WinPct.change(m.before,m.drop,m.game.color)}</span>
        ${m.game.url?`<a class="note" href="${esc(m.game.url)}" target="_blank" rel="noopener">game ↗</a>`:`<span class="note">${esc(m.game.event||'')}</span>`}</div>`).join('')||`<p class="note">${rows.length?'None found. Clean play!':'Waiting for analyzed games.'}</p>`}</div></div>`;
    return `${head}${bar}
      <p class="lead note">Your results, mistakes and the positions worth drilling, from your own games.</p>
      ${tiles}
      ${ctx.save(mistakes,toPunish,final)}
      ${Yearly.section(yearly)}
      <div class="repgrid">
        ${results}
        ${openings}
        ${quality_}
        ${book}
        ${timeChart(all,rows)}
        ${costly}
      </div>`;
  }

  function click(e){
    const t=e.target;
    const c=t.closest('[data-afc]'); if(c){ F.col=c.dataset.afc; return true }
    if(t.closest('[data-afreset]')){ F={...F0}; return true }
    const b=t.closest('[data-bandcol]'); if(b){ BANDCOL=b.dataset.bandcol; return true }
    const o=t.closest('[data-optab]'); if(o){ OPCOL=o.dataset.optab; return true }
    const g=t.closest('[data-opgames]'); if(g){ OPEN=OPEN===g.dataset.opgames?null:g.dataset.opgames; return true }
    return false;
  }
  function change(e){ const s=e.target.closest('[data-af]'); if(!s) return false;
    let v=s.value; if(s.dataset.af==='rmin'||s.dataset.af==='rmax') v=v===''?'':String(Math.max(0,Math.min(3500,+v||0)));
    F[s.dataset.af]=v; return true }
  return {render,click,change,filter,quality,leftBook,perfs,perfCell,bandsOf,classOf,
    get last(){ return last }, get F(){ return F }, set F(v){ F={...F0,...v} }, reset(){ F={...F0}; BANDCOL='all'; OPCOL='w'; OPEN=null }};
})();
