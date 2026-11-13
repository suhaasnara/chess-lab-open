/* Shared (Chess Lab and Chess Lab Open). Home: chess-lab-open/site/shared/ (MIT); the private kit pulls a pinned copy.
   Year by year on a report card. One row per year (games, score, conversion, saves, each with the change from the year
   before), then one line per RATING POOL that year (OTB classical, Chess.com blitz, Lichess rapid ...): the pool's games
   and score, the opponents' average and median rating, the performance rating, and the player's rating at the start and
   end of the year with the points gained and lost. Ratings are only ever compared inside one pool: a US Chess rating
   and a Chess.com blitz rating are on different scales, so nothing here averages across pools.

     Yearly.DP, Yearly.dp(p)      FIDE's table of score fraction -> rating difference (Rating Regulations 8.1.1);
                                  the private kit's lib/report.py has the same table: keep the two the same
     Yearly.oppStats(games)       {oppN, oppAvg, oppMed, perf} over games [{opp, score}] with a rated opponent
                                  (perf only from 5+ rated games)
     Yearly.summarize(games)      {byYear, poolsByYear, pools} for pages that hold the games (Analyze my games):
                                  games [{date 'YYYY-MM-DD', order, score 0/0.5/1, opp, pool, before, after}]
     Yearly.section(R, opts)      HTML for a report view (byYear, poolsByYear) or '' with fewer than two years
     Yearly.tile(R)               HTML: a performance tile from R.pools (one figure per pool) or ''
*/
'use strict';
window.Yearly=(()=>{
  const DP=[800,677,589,538,501,470,444,422,401,383,366,351,336,322,309,296,284,273,262,251,240,230,220,211,
    202,193,184,175,166,158,149,141,133,125,117,110,102,95,87,80,72,65,57,50,43,36,29,21,14,7,0];
  const dp=p=>{ const k=Math.round(p*100+1e-9); return k>=50?DP[100-k]:-DP[k] };
  const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const q=t=>window.Help?Help.q(t):'';

  function oppStats(gs){
    const rated=gs.filter(g=>g.opp>0);
    if(!rated.length) return {oppN:0,oppAvg:null,oppMed:null,perf:null};
    const r=rated.map(g=>g.opp).sort((a,b)=>a-b), n=r.length;
    const avg=r.reduce((a,b)=>a+b,0)/n, med=n%2?r[(n-1)/2]:(r[n/2-1]+r[n/2])/2;
    const p=rated.reduce((a,g)=>a+g.score,0)/n;
    return {oppN:n,oppAvg:Math.round(avg),oppMed:Math.round(med),perf:n>=5?Math.round(avg+dp(p)):null};
  }
  /* games in time order within each pool, each with the rating before and after it (unknown: null) */
  function ratingFlow(games,min=5){
    const pools=new Map();
    for(const g of games){ if(!(g.before>0)||!(g.after>0)||!g.date) continue; if(!pools.has(g.pool)) pools.set(g.pool,[]); pools.get(g.pool).push(g) }
    const out={};
    for(const [pool,gs] of [...pools.entries()].sort((a,b)=>a[0]<b[0]?-1:1)){
      const by=new Map(); for(const g of gs){ const y=g.date.slice(0,4); if(!by.has(y)) by.set(y,[]); by.get(y).push(g) }
      for(const [y,rs] of by){
        const d=rs.map(g=>g.after-g.before);
        if(rs.length<min||!d.some(x=>x)) continue;
        const net=rs.some(g=>g.net);   // ratings typed into a PGN: start and end only (game-by-game sums would add up typos)
        (out[y]=out[y]||[]).push({pool,games:rs.length,start:rs[0].before,end:rs[rs.length-1].after,
          gained:net?null:d.filter(x=>x>0).reduce((a,b)=>a+b,0),lost:net?null:-d.filter(x=>x<0).reduce((a,b)=>a+b,0)});
      }
    }
    for(const y in out) out[y].sort((a,b)=>b.games-a.games);
    return Object.fromEntries(Object.entries(out).sort());
  }
  const byKey=(xs,k)=>{ const m=new Map(); for(const x of xs){ const v=k(x); if(!m.has(v)) m.set(v,[]); m.get(v).push(x) } return m };
  function poolRows(gs,min=5){
    return [...byKey(gs,g=>g.pool)].filter(([,xs])=>xs.length>=min).map(([pool,xs])=>({pool,games:xs.length,
      score:Math.round(1000*xs.reduce((a,g)=>a+g.score,0)/xs.length)/10,...oppStats(xs)})).sort((a,b)=>b.games-a.games);
  }
  function summarize(games,min=5){
    games=games.filter(g=>/^\d{4}/.test(g.date||'')).sort((a,b)=>(a.date<b.date?-1:a.date>b.date?1:(a.order||0)-(b.order||0)));
    const flow=ratingFlow(games,min), byYear={}, poolsByYear={};
    for(const [y,gs] of [...byKey(games,g=>g.date.slice(0,4))].sort()){
      if(gs.length<min) continue;
      const w=gs.filter(g=>g.score===1).length, d=gs.filter(g=>g.score===0.5).length;
      byYear[y]={games:gs.length,wins:w,draws:d,losses:gs.length-w-d,score:Math.round(1000*gs.reduce((a,g)=>a+g.score,0)/gs.length)/10};
      const f=new Map((flow[y]||[]).map(r=>[r.pool,r]));
      poolsByYear[y]=poolRows(gs,min).map(r=>f.has(r.pool)?{...r,start:f.get(r.pool).start,end:f.get(r.pool).end,gained:f.get(r.pool).gained,lost:f.get(r.pool).lost}:r);
    }
    return {byYear,poolsByYear,pools:poolRows(games,min)};
  }

  const pct=v=>v==null?'—':Math.round(v)+'%';
  const signed=v=>(v>0?'+':v<0?'−':'±')+Math.abs(v);
  /* the change from the year before: green/red when it is better/worse for the player (neutral for opponents' strength) */
  const delta=(cur,prev,{unit='',min=1,tone=true}={})=>{
    if(cur==null||prev==null) return '';
    const d=Math.round(cur-prev); if(Math.abs(d)<min) return `<span class="note ydelta">±0${unit}</span>`;
    return `<span class="note ydelta ${tone?d>0?'tgood':'tbad':''}">${d>0?'▲':'▼'} ${Math.abs(d)}${unit}</span>`;
  };
  const HELP={
    opp:'The average and the median rating of your opponents in this pool (the median is the middle one: one very low or very high opponent can’t move it). Ratings are only compared inside one pool: over the board, Chess.com blitz, Lichess rapid and so on are different scales.',
    perf:'FIDE’s performance rating: your opponents’ average rating plus the rating difference FIDE’s table gives for your score (+0 at 50%, +193 at 75%, +800 at 100%), inside one pool, from 5 or more games where the opponent’s rating is known.',
    rating:'Your rating at the start and the end of the year in this pool, and the points you gained and lost game by game (Chess.com gives the rating after each game, Lichess the rating before it and the change). Over the board on the private site: US Chess’s own record, event by event. Ratings typed into a PGN file (over the board) give the start and end only, as the net change: added up game by game, a single typo would count twice.',
    us:'From US Chess’s own record of your rated events: the regular rating going into the year’s first event and coming out of its last, and the points won and lost event by event.'};
  const label=r=>r.pool==='OTB classical'?'Over the board':String(r.pool).replace(/^OTB /,'Over the board, ');
  const poolName=r=>r.official?`Over the board · US Chess${q(HELP.us)}`:esc(label(r));

  function section(R,opts={}){
    const Y=Object.entries((R&&R.byYear)||{}).filter(([,s])=>s.games>=(opts.minYear||5)); if(Y.length<2) return '';
    const PB=(R&&R.poolsByYear)||{}, now=opts.now||new Date(), thisYear=String(now.getFullYear());
    const name=y=>y===thisYear?`${y} <span class="note">so far</span>`:y;
    const hasConv=Y.some(([,s])=>s.convN!=null);
    const single=Y.every(([y])=>(PB[y]||[]).length<=1)&&new Set(Y.flatMap(([y])=>(PB[y]||[]).map(r=>r.pool))).size<=1;
    const prevPool=(i,pool)=>{ for(let j=i-1;j>=0;j--){ const r=(PB[Y[j][0]]||[]).find(x=>x.pool===pool); if(r) return r } return null };
    const oppCell=(r,p)=>r.oppAvg==null?'—':`<span class="mono">${r.oppAvg} · ${r.oppMed}</span> ${p?delta(r.oppAvg,p.oppAvg,{tone:false}):''}`;
    const perfCell=(r,p)=>r.perf==null?'—':`<b class="mono">${r.perf}</b> ${p?delta(r.perf,p.perf):''}`;
    const rateCell=r=>r.start==null?'<span class="note">—</span>':`<b class="mono">${r.start} → ${r.end}</b> <span class="note ygl">${r.gained==null?`net ${signed(r.end-r.start)}`:`+${r.gained} / −${r.lost}`}</span>`;
    const convCells=(s,p)=>hasConv?`<td class="num" data-l="Won from +2">${s.convN?`${pct(s.conversion)} <span class="note">of ${s.convN}</span> ${p&&p.convN>=5&&s.convN>=5?delta(s.conversion,p.conversion,{unit:'%'}):''}`:'—'}</td>
      <td class="num" data-l="Held from −2">${s.saveN?`${pct(s.saveRate)} <span class="note">of ${s.saveN}</span> ${p&&p.saveN>=5&&s.saveN>=5?delta(s.saveRate,p.saveRate,{unit:'%'}):''}`:'—'}</td>`:'';
    const rows=Y.map(([y,s],i)=>{ const p=i?Y[i-1][1]:null, pools=PB[y]||[];
      if(single){ const r=pools[0]||{}, pr=r.pool?prevPool(i,r.pool):null;
        return `<tr class="yrow"><td class="yname">${name(y)}${r.pool?`<div class="note">${poolName(r)}</div>`:''}</td><td class="num" data-l="Games">${s.games}<div class="note">${s.wins} / ${s.draws} / ${s.losses}</div></td>
          <td class="num" data-l="Score">${pct(s.score)} ${p?delta(s.score,p.score,{unit:'%'}):''}</td>
          <td class="num" data-l="Opponents (avg · median)">${r.pool?oppCell(r,pr):'—'}</td><td class="num" data-l="Performance">${r.pool?perfCell(r,pr):'—'}</td>
          <td class="num" data-l="Rating">${r.pool?rateCell(r):'—'}</td>${convCells(s,p)}</tr>` }
      return `<tr class="yrow"><td class="yname">${name(y)}</td><td class="num" data-l="Games">${s.games}<div class="note">${s.wins} / ${s.draws} / ${s.losses}</div></td>
        <td class="num" data-l="Score">${pct(s.score)} ${p?delta(s.score,p.score,{unit:'%'}):''}</td><td class="ycomb" colspan="3"></td>${convCells(s,p)}</tr>`+
        pools.map(r=>{ const pr=prevPool(i,r.pool); return `<tr class="ypoolrow"><td class="ypname">${poolName(r)}</td><td class="num" data-l="Games">${r.games}</td><td class="num" data-l="Score">${pct(r.score)}</td>
          <td class="num" data-l="Opponents (avg · median)">${oppCell(r,pr)}</td><td class="num" data-l="Performance">${perfCell(r,pr)}</td><td class="num" data-l="Rating">${rateCell(r)}</td>${hasConv?'<td></td><td></td>':''}</tr>` }).join('') }).join('');
    return `<div class="yearbox"><h3>Year by year</h3><p class="note">${highlights(Y,PB,thisYear)}</p>
      <div class="tablewrap"><table class="rtable ytable${single?'':' ymulti'}"><thead><tr><th>Year</th><th class="num">Games<div class="note">W / D / L</div></th><th class="num">Score</th>
      <th class="num">Opponents${q(HELP.opp)}<div class="note">average · median</div></th>
      <th class="num">Performance${q(HELP.perf)}</th>
      <th class="num">Rating${q(HELP.rating)}<div class="note">start → end · gained / lost</div></th>
      ${hasConv?`<th class="num">Won from +2</th><th class="num">Held from −2</th>`:''}</tr></thead>
      <tbody>${rows}</tbody></table></div>
      <p class="note">▲ ▼ the change from the year before (green better, red worse; the opponents’ rating is neither); opponents, performance and rating against the same pool’s previous year. Years and pools with ${opts.minYear||5} or more games.</p></div>`;
  }
  /* the latest year against the one before: score overall, then per pool (at most three) performance and rating */
  function highlights(Y,PB,thisYear){
    const [y1,a]=Y[Y.length-1], [y0,b]=Y[Y.length-2], so=y1===thisYear?' so far':'';
    let t=`${y1}${so} against ${y0}: a score of ${Math.round(a.score)}% (${signed(Math.round(a.score-b.score))} points)`;
    const conv=a.convN>=5&&b.convN>=5&&a.conversion!=null&&b.conversion!=null&&Math.abs(a.conversion-b.conversion)>=5?`, ${pct(a.conversion)} won from +2 (${pct(b.conversion)})`:'';
    t+=conv+'.';
    const prev=new Map((PB[y0]||[]).map(r=>[r.pool,r]));
    for(const r of (PB[y1]||[]).slice(0,3)){
      const p=prev.get(r.pool), bits=[];
      if(r.perf!=null) bits.push(`performance ${r.perf}${p&&p.perf!=null?` (${signed(r.perf-p.perf)})`:''}`);
      if(r.oppAvg!=null) bits.push(`opponents averaging ${r.oppAvg}${p&&p.oppAvg!=null?` (${signed(r.oppAvg-p.oppAvg)})`:''}`);
      if(r.start!=null) bits.push(`rating ${r.start} → ${r.end} (${r.gained==null?`net ${signed(r.end-r.start)}`:`+${r.gained}, −${r.lost}`})`);
      if(bits.length) t+=` ${r.official?'Over the board (US Chess)':label(r)}: ${bits.join(', ')}.`;
    }
    return esc(t);
  }
  /* one tile: each pool's performance (never one figure across pools) */
  const tile=R=>{ const P=((R&&R.pools)||[]).filter(r=>r.perf!=null).slice(0,4); if(!P.length) return '';
    if(P.length===1){ const o=P[0]; return `<div class="stat"><b class="mono">${o.perf}</b><span class="note">Performance rating${R.pools.length>1?` · ${esc(label(o))}`:''} · opponents ${o.oppAvg} average, ${o.oppMed} median (${o.oppN} rated)${q(HELP.perf)}</span></div>` }
    return `<div class="stat"><span class="note">Performance rating, by pool${q(HELP.perf)}</span>${P.map(o=>`<div class="yperf" title="Opponents ${o.oppAvg} average, ${o.oppMed} median (${o.oppN} rated)"><b class="mono">${o.perf}</b> <span class="note">${esc(label(o))}</span></div>`).join('')}</div>` };
  return {DP,dp,oppStats,ratingFlow,poolRows,summarize,section,tile,highlights};
})();
