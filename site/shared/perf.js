/* Shared (Chess Lab and Chess Lab Open). Home: chess-lab-open/site/shared/ (MIT); the private kit pulls a pinned copy.
   Performance rating, the way the games' own rating system does it (14 Nov 2026).

   The formula follows the rating system the ratings come from:
     US Chess  — the rulebook's linear formula (34E10): each game counts as the opponent's rating + 400 for a win,
                 − 400 for a loss, the opponent's rating for a draw; the average of those. A perfect score is the
                 highest-rated opponent + 400, a zero score the lowest − 400 (US Chess's own calculator).
     FIDE      — the opponents' average + dp from FIDE's table for the score (Rating Regulations 8.1.1); 100% / 0%
                 are dp ±800.
     Lichess, Chess.com, unspecified — neither site publishes a formula for a set of games: the FIDE method, labelled so.
   The 400-point rule (on unless opts.cap===false): an opponent rated more than 400 below YOUR rating in that game counts
   as exactly 400 below (FIDE's rule for rating changes). Without it a win over a much weaker player LOWERS the
   performance rating. Games where your own rating is unknown are not capped.
   Unrated opponents (no rating, 0, "?") are left out and counted; ratings outside the pool's plausible range are left
   out and counted as "looks wrong"; provisional ratings count and are counted.
   Score vs expected: your points minus the points your ratings predicted (Elo expectation, the difference capped at
   400 as FIDE does), over the games where both ratings are known.
   The private kit's lib/report.py (perf_stats) is the Python twin: keep the two the same (tests/perf_parity.js).

     Perf.calc(games, system, opts)  games [{opp, score 0/0.5/1, own?, prov?}] -> result (see below)
     Perf.system(x)                  'uschess' | 'fide' | 'lichess' | 'chesscom' | 'unspecified' from a system id,
                                     a site ('pgn' -> unspecified) or a pool label ('OTB classical' -> uschess)
     Perf.LABEL[system], Perf.help(result, opts)   plain words for the ? bubble
   result: {system, method 'uschess'|'fide', oppN, oppAvg, oppMed, perf (null under MIN rated games), raw (perf without
            the 400-point rule), capped, unrated, flagged, prov, exp (points over expectation, 1 decimal), expN, min} */
'use strict';
window.Perf=(()=>{
  const MIN=5;
  const DP=[800,677,589,538,501,470,444,422,401,383,366,351,336,322,309,296,284,273,262,251,240,230,220,211,
    202,193,184,175,166,158,149,141,133,125,117,110,102,95,87,80,72,65,57,50,43,36,29,21,14,7,0];
  const dp=p=>{ const k=Math.round(p*100+1e-9); return k>=50?DP[100-k]:-DP[k] };
  const LABEL={uschess:'US Chess',fide:'FIDE',lichess:'Lichess',chesscom:'Chess.com',unspecified:'Unspecified'};
  /* plausible ratings per pool: outside them a number is more likely a typo or the wrong pool than a rating */
  const RANGE={uschess:[100,2900],fide:[1000,2900],lichess:[400,3400],chesscom:[100,3500],unspecified:[100,3500]};
  function system(x){
    const s=String(x||'').toLowerCase();
    if(LABEL[s]) return s;
    if(/fide/.test(s)) return 'fide';
    if(/lichess/.test(s)) return 'lichess';
    if(/chess\.?com/.test(s)) return 'chesscom';
    if(/us ?chess|uscf|otb|over the board/.test(s)) return 'uschess';
    return 'unspecified';
  }
  const methodOf=sys=>sys==='uschess'?'uschess':'fide';
  const expect=(own,opp)=>{ const d=Math.max(-400,Math.min(400,opp-own)); return 1/(1+Math.pow(10,d/400)) };
  function calc(games,sys,opts={}){
    sys=system(sys); const cap=opts.cap!==false, min=opts.min||MIN, [lo,hi]=RANGE[sys];
    let unrated=0, flagged=0, capped=0, prov=0; const rated=[];
    for(const g of games||[]){
      const opp=+g.opp;
      if(!(opp>0)){ unrated++; continue }
      if(opp<lo||opp>hi){ flagged++; continue }
      const own=+g.own>=lo&&+g.own<=hi?+g.own:null;
      const adj=cap&&own!=null&&opp<own-400?own-400:opp;
      if(adj!==opp) capped++;
      if(g.prov) prov++;
      rated.push({opp,adj,own,score:+g.score});
    }
    const n=rated.length, method=methodOf(sys);
    const out={system:sys,method,oppN:n,oppAvg:null,oppMed:null,perf:null,raw:null,capped,unrated,flagged,prov,exp:null,expN:0,min};
    if(!n) return out;
    const r=rated.map(g=>g.opp).sort((a,b)=>a-b);
    out.oppAvg=Math.round(r.reduce((a,b)=>a+b,0)/n); out.oppMed=Math.round(n%2?r[(n-1)/2]:(r[n/2-1]+r[n/2])/2);
    const perfOf=key=>{
      const xs=rated.map(g=>g[key]), pts=rated.reduce((a,g)=>a+g.score,0);
      if(method==='uschess'){
        if(pts===n) return Math.max(...xs)+400;
        if(pts===0) return Math.min(...xs)-400;
        return rated.reduce((a,g)=>a+g[key]+400*(2*g.score-1),0)/n;
      }
      return xs.reduce((a,b)=>a+b,0)/n+dp(pts/n);
    };
    if(n>=min){ out.perf=Math.round(perfOf('adj')); out.raw=Math.round(perfOf('opp')) }
    const both=rated.filter(g=>g.own!=null);
    if(both.length){ out.expN=both.length; out.exp=Math.round(10*both.reduce((a,g)=>a+g.score-expect(g.own,g.opp),0))/10 }
    return out;
  }
  const plural=(n,w)=>`${n} ${w}${n===1?'':'s'}`;
  /* the ? bubble: which system and formula and why, the 400-point rule, what was left out, and the caveat */
  function help(R,opts={}){
    if(!R) return '';
    const sys=LABEL[R.system]||R.system, why=opts.why||'';
    const f=R.method==='uschess'
      ?'US Chess’s formula: each game counts as the opponent’s rating +400 for a win, −400 for a loss, the opponent’s rating for a draw, averaged (all wins: the highest-rated opponent +400; all losses: the lowest −400).'
      :`FIDE’s method: your opponents’ average rating plus the difference FIDE’s table gives for your score (+0 at 50%, +193 at 75%, +800 at 100%)${R.system==='fide'?'':`, used because ${sys==='Unspecified'?'the rating system isn’t known':sys+' publishes no formula for a set of games'}`}.`;
    const bits=[`${sys} ratings${why?` (${why})`:''}. ${f}`];
    bits.push(`400-point rule: an opponent rated more than 400 below you (your rating in that game) counts as exactly 400 below, as FIDE does for rating changes; otherwise a win over a much weaker player would lower the number.${R.capped?` It applied to ${plural(R.capped,'game')}${R.raw!=null&&R.raw!==R.perf?`; without it: ${R.raw}`:''}.`:' It changed nothing here.'}`);
    const left=[R.unrated&&`${plural(R.unrated,'game')} against unrated opponents`,R.flagged&&`${plural(R.flagged,'game')} where the opponent’s rating looks wrong for ${sys} ratings`].filter(Boolean);
    if(left.length) bits.push(`Left out: ${left.join(' and ')}.`);
    if(R.prov) bits.push(`${plural(R.prov,'opponent rating')} provisional.`);
    if(R.exp!=null) bits.push(`Score vs expected: your points minus what your ratings predicted (${R.expN} games where both ratings are known).`);
    bits.push(`Only shown from ${R.min} rated games: over a handful of games a performance rating swings by hundreds of points.`);
    return bits.join(' ');
  }
  const fmtExp=v=>v==null?'—':(v>0?'+':v<0?'−':'±')+Math.abs(v).toFixed(1);
  return {calc,system,help,expect,dp,DP,LABEL,RANGE,MIN,fmtExp};
})();
