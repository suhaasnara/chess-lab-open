/* Shared (Chess Lab and Chess Lab Open). Home: chess-lab-open/site/shared/ (MIT); the private kit pulls a pinned copy.
   Year by year on a report card: one row per year with the results, the opponents' average and median rating, the
   performance rating, the player's own rating at the start and end of the year (points gained / lost, per rating pool),
   conversion and saves, each with the change from the year before; a line above it says what changed most.

     Yearly.DP, Yearly.dp(p)          FIDE's table of score fraction -> rating difference (Rating Regulations 8.1.1);
                                      the private kit's lib/report.py has the same table: keep the two the same
     Yearly.oppStats(games)           {oppN, oppAvg, oppMed, perf} over games [{opp, score}] with a rated opponent
     Yearly.ratingFlow(games)         {year: [{pool, games, start, end, gained, lost}]} from [{date, pool, before, after}]
     Yearly.summarize(games)          {byYear, ratingByYear} for pages that hold the games themselves (Analyze my games):
                                      games [{date 'YYYY-MM-DD', score 0/0.5/1, opp, pool, before, after}]
     Yearly.section(R, opts)          HTML: the Year by year table from a report view (byYear, ratingByYear) or '' when
                                      it has fewer than two years. opts.minYear (default 5 games), opts.now (a Date).
     Yearly.tile(o)                   HTML: a performance tile for a summary ({perf, oppAvg, oppMed, oppN}) or ''

   Performance rating: FIDE's, the opponents' average rating + dp(score), over the games where the opponent's rating is
   known (a perfect or zero score gives ±800). The ratings are the ones in the games (over the board: what the PGN gives;
   online: that site's pool), so a view that mixes pools mixes rating scales. */
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
    return {oppN:n,oppAvg:Math.round(avg),oppMed:Math.round(med),perf:Math.round(avg+dp(p))};
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
        (out[y]=out[y]||[]).push({pool,games:rs.length,start:rs[0].before,end:rs[rs.length-1].after,
          gained:d.filter(x=>x>0).reduce((a,b)=>a+b,0),lost:-d.filter(x=>x<0).reduce((a,b)=>a+b,0)});
      }
    }
    for(const y in out) out[y].sort((a,b)=>b.games-a.games);
    return Object.fromEntries(Object.entries(out).sort());
  }
  function summarize(games,min=5){
    const by=new Map();
    for(const g of games){ const y=(g.date||'').slice(0,4); if(!/^\d{4}$/.test(y)) continue; if(!by.has(y)) by.set(y,[]); by.get(y).push(g) }
    const byYear={};
    for(const [y,gs] of [...by.entries()].sort()){
      if(gs.length<min) continue;
      const w=gs.filter(g=>g.score===1).length, d=gs.filter(g=>g.score===0.5).length;
      byYear[y]={games:gs.length,wins:w,draws:d,losses:gs.length-w-d,score:Math.round(1000*gs.reduce((a,g)=>a+g.score,0)/gs.length)/10,...oppStats(gs)};
    }
    return {byYear,ratingByYear:ratingFlow([...games].sort((a,b)=>(a.date<b.date?-1:a.date>b.date?1:(a.order||0)-(b.order||0))),min)};
  }

  const pct=v=>v==null?'—':Math.round(v)+'%';
  const signed=v=>(v>0?'+':v<0?'−':'±')+Math.abs(v);
  /* the change from the year before: green/red when it is better/worse for the player (neutral for opponents' strength) */
  const delta=(cur,prev,{unit='',min=1,tone=true}={})=>{
    if(cur==null||prev==null) return '';
    const d=Math.round(cur-prev); if(Math.abs(d)<min) return `<span class="note ydelta">±0${unit}</span>`;
    return `<span class="note ydelta ${tone?d>0?'tgood':'tbad':''}">${d>0?'▲':'▼'} ${Math.abs(d)}${unit}</span>`;
  };
  const ratingCell=rows=>rows&&rows.length?rows.map(r=>`<div class="yrate"><div class="note ypool">${esc(r.pool)}${r.official?q('From US Chess’s own record of your rated events: the regular rating going into the year’s first event and coming out of its last, and the points won and lost event by event.'):''}</div><b class="mono">${r.start} → ${r.end}</b> <span class="note">+${r.gained} / −${r.lost}</span></div>`).join(''):'<span class="note">—</span>';

  function section(R,opts={}){
    const Y=Object.entries((R&&R.byYear)||{}).filter(([,s])=>s.games>=(opts.minYear||5)); if(Y.length<2) return '';
    const RB=(R&&R.ratingByYear)||{}, now=opts.now||new Date(), thisYear=String(now.getFullYear());
    const name=y=>y===thisYear?`${y} <span class="note">so far</span>`:y;
    const hasConv=Y.some(([,s])=>s.convN!=null), hasRate=Y.some(([y])=>RB[y]&&RB[y].length);
    const rows=Y.map(([y,s],i)=>{ const p=i?Y[i-1][1]:null; return `<tr>
      <td class="yname">${name(y)}</td>
      <td class="num" data-l="Games">${s.games}<div class="note">${s.wins} / ${s.draws} / ${s.losses}</div></td>
      <td class="num" data-l="Score">${pct(s.score)} ${p?delta(s.score,p.score,{unit:'%'}):''}</td>
      <td class="num" data-l="Opponents (avg · median)">${s.oppAvg==null?'—':`<span class="mono">${s.oppAvg} · ${s.oppMed}</span> ${p?delta(s.oppAvg,p.oppAvg,{tone:false}):''}`}</td>
      <td class="num" data-l="Performance">${s.perf==null?'—':`<b class="mono">${s.perf}</b> ${p?delta(s.perf,p.perf):''}`}</td>
      ${hasRate?`<td class="num yratecell" data-l="Rating">${ratingCell(RB[y])}</td>`:''}
      ${hasConv?`<td class="num" data-l="Won from +2">${s.convN?`${pct(s.conversion)} <span class="note">of ${s.convN}</span> ${p&&p.convN>=5&&s.convN>=5?delta(s.conversion,p.conversion,{unit:'%'}):''}`:'—'}</td>
      <td class="num" data-l="Held from −2">${s.saveN?`${pct(s.saveRate)} <span class="note">of ${s.saveN}</span> ${p&&p.saveN>=5&&s.saveN>=5?delta(s.saveRate,p.saveRate,{unit:'%'}):''}`:'—'}</td>`:''}</tr>` }).join('');
    return `<div class="yearbox"><h3>Year by year</h3><p class="note">${esc(highlights(Y,RB,thisYear))}</p>
      <div class="tablewrap"><table class="rtable ytable"><thead><tr><th>Year</th><th class="num">Games<div class="note">W / D / L</div></th><th class="num">Score</th>
      <th class="num">Opponents${q('The average and the median rating of your opponents that year (the median is the middle one: one very low or very high opponent can’t move it). The ratings are the ones in the games.')}<div class="note">average · median</div></th>
      <th class="num">Performance${q('FIDE’s performance rating: your opponents’ average rating plus the rating difference FIDE’s table gives for your score (+0 at 50%, +193 at 75%, +800 at 100%). Only games where the opponent’s rating is known.')}</th>
      ${hasRate?`<th class="num">Rating${q('Your rating at the start and the end of the year, and the points you gained and lost game by game, separately for each rating pool you played 5+ games in. Online it is the site’s rating in each game; Chess.com gives the rating after each game, Lichess the rating before it and the change.')}<div class="note">start → end · gained / lost</div></th>`:''}
      ${hasConv?`<th class="num">Won from +2</th><th class="num">Held from −2</th>`:''}</tr></thead>
      <tbody>${rows}</tbody></table></div>
      <p class="note">▲ ▼ the change from the year before (green better, red worse; the opponents’ rating is neither). Years with ${opts.minYear||5} or more games.</p></div>`;
  }
  /* one or two sentences: the latest year against the one before, and the best year by performance */
  function highlights(Y,RB,thisYear){
    const [y1,a]=Y[Y.length-1], [y0,b]=Y[Y.length-2], so=y1===thisYear?' so far':'';
    const parts=[];
    if(a.perf!=null&&b.perf!=null) parts.push(`a performance of ${a.perf} (${signed(a.perf-b.perf)})`);
    if(a.oppAvg!=null&&b.oppAvg!=null) parts.push(`against opponents averaging ${a.oppAvg} (${signed(a.oppAvg-b.oppAvg)})`);
    if(a.score!=null&&b.score!=null) parts.push(`a score of ${Math.round(a.score)}% (${signed(Math.round(a.score-b.score))} points)`);
    let t=`${y1}${so} against ${y0}: ${parts.join(', ')}.`;
    const conv=a.convN>=5&&b.convN>=5&&a.conversion!=null&&b.conversion!=null&&Math.abs(a.conversion-b.conversion)>=5?`You converted ${pct(a.conversion)} of your +2 games (${pct(b.conversion)} in ${y0})`:'';
    const save=a.saveN>=5&&b.saveN>=5&&a.saveRate!=null&&b.saveRate!=null&&Math.abs(a.saveRate-b.saveRate)>=5?`held ${pct(a.saveRate)} from −2 (${pct(b.saveRate)})`:'';
    if(conv||save) t+=` ${conv?conv+(save?' and '+save:''):save[0].toUpperCase()+save.slice(1)}.`;
    const r=(RB[y1]||[])[0]; if(r) t+=` ${r.pool}: ${r.start} → ${r.end}${so} (+${r.gained}, −${r.lost}).`;
    const best=Y.filter(([,s])=>s.perf!=null).sort((x,z)=>z[1].perf-x[1].perf)[0];
    if(best&&Y.length>2) t+=` Best year by performance: ${best[0]} (${best[1].perf}).`;
    return t;
  }
  const tile=o=>o&&o.perf!=null?`<div class="stat"><b class="mono">${o.perf}</b><span class="note">Performance rating · opponents ${o.oppAvg} average, ${o.oppMed} median (${o.oppN} rated)${q('FIDE’s performance rating: your opponents’ average rating plus the rating difference FIDE’s table gives for your score. The median opponent is the middle one, which one very weak or very strong opponent can’t move.')}</span></div>`:'';
  return {DP,dp,oppStats,ratingFlow,summarize,section,tile,highlights};
})();
