/* Shared (Chess Lab and Chess Lab Open). Home: chess-lab-open/site/shared/ (MIT); the private kit pulls a pinned copy.
   The opening trainer's rules that don't depend on where the data comes from. Pure functions on plain data; each site
   looks up its own books and repertoires and passes the numbers in. Everything is on window.TrainerCore.

   Rating v2 (on an over-the-board scale): each move you find is a "game" against how hard it was to find.
     difficulty(book, good) -> 1600..2600: a move masters choose half the time is a 2200 find, 90% ~1820, 10% ~2580;
       book = {total, rows:[{uci, share}]} (masters), or null; with no book (or < 20 games) deep prep counts as 2350.
       good = the right move(s) (uci; matched on from+to), or empty = the most-played move.
     R2_START (1800: every opening's first rating), R2_PROV (8: provisional lines), lineK(n2) = 40 while provisional,
     then 16; lineWeight(n) = short lines count less (full weight from 4 rated moves).
     lineDelta(rating, n2, scored): the line is rated once at its end. scored = [{s, d}] per rated move (s = 1 found,
       0.5 inaccuracy or playable alternative, 0 missed; d = its difficulty). Each move is a game: the expected score
       is averaged over the moves (decided by Suhaas, 9 Nov 2026), so delta = K × weight × (mean s − mean expected).
       Unrounded; each site rounds or clamps as it always has.
   Opponent replies in a repertoire ("Sidelines in repertoires"):
     VARIETY {realistic, balanced, sidelines}: [label, explanation]
     varietyWeight(x, top, mode): x = the reply's share × the share of games that stay in your file. Replies under 1.5%
       keep their small game-frequency weight in every mode, so moves nobody plays stay rare.
     weakness(stat) = your miss rate after the reply ({n, w} = times seen, times missed; unseen 0.6)
     replyWeights(opts, {mode, useBook, trappy, mover}) sets o.pop and o.w on each opt {x, weak, seen, row}:
       w = (0.25 + weak) × pop × 0.3^(how much more often it came up in your last 6 lines than its share says),
       × (practical score / 0.5)^4 for a trappy opponent (rows with 20+ games).
     practical(row, mover) = the mover's score from the book row's results (draws half).
     pick(items, weights, rnd) = weighted random pick (uniform when every weight is 0). */
window.TrainerCore=(()=>{
  const R2_START=1800, R2_PROV=8;
  const lineK=n2=>(n2||0)<R2_PROV?40:16;
  const lineWeight=n=>Math.min(1,n/4);
  const expected=(d,R)=>1/(1+Math.pow(10,(d-R)/400));
  function lineDelta(R,n2,scored){
    if(!scored||!scored.length) return 0;
    const S=scored.reduce((a,x)=>a+x.s,0)/scored.length, E=scored.reduce((a,x)=>a+expected(x.d,R),0)/scored.length;
    return lineK(n2)*lineWeight(scored.length)*(S-E);
  }
  function difficulty(bk,good){
    if(!bk||!(bk.total>=20)||!bk.rows||!bk.rows.length) return 2350;
    const p=good&&good.length
      ?bk.rows.filter(r=>good.some(u=>u.slice(0,4)===r.uci.slice(0,4))).reduce((a,r)=>a+r.share,0)
      :Math.max(...bk.rows.map(r=>r.share));
    if(p<=0) return 2350; const q=Math.min(0.97,Math.max(0.03,p));
    return Math.round(Math.max(1600,Math.min(2600,2200+400*Math.log10((1-q)/q))));
  }
  const VARIETY={realistic:['Realistic','Replies come up as often as they are played in games: the main line most of the time.'],
    balanced:['Balanced','Sidelines you prepared come up much more often than in games, and the main line still leads.'],
    sidelines:['Sidelines first','Most lines test the sidelines; the main line is one option among them.']};
  function varietyWeight(x,top,mode){ if(mode==='realistic'||x<0.015) return Math.pow(Math.max(x,0.0005),0.75);
    return mode==='sidelines'?Math.pow(x,0.25)*(top?0.35:1):Math.pow(x,0.4) }
  const weakness=st=>st?(st.w+1)/(st.n+2):0.6;
  const practical=(r,mover)=>((mover==='w'?r.w:r.b)+r.d/2)/Math.max(1,r.games);
  function replyWeights(opts,o){
    const top=Math.max(...opts.map(x=>x.x)); for(const x of opts) x.pop=o.useBook?varietyWeight(x.x,x.x===top&&top>0,o.mode):1;
    const popSum=opts.reduce((a,x)=>a+x.pop,0)||1, seenSum=opts.reduce((a,x)=>a+x.seen,0);
    for(const x of opts){ x.w=(0.25+x.weak)*x.pop*Math.pow(0.3,Math.max(0,x.seen-seenSum*x.pop/popSum));
      if(o.trappy&&x.row&&x.row.games>=20) x.w*=Math.pow(practical(x.row,o.mover)/0.5,4) }
    return opts;
  }
  function pick(items,weights,rnd=Math.random){
    const tot=weights.reduce((a,b)=>a+b,0); if(!(tot>0)) return items[Math.floor(rnd()*items.length)];
    let r=rnd()*tot; for(let i=0;i<items.length;i++){ r-=weights[i]; if(r<=0) return items[i] } return items[items.length-1];
  }
  return {R2_START,R2_PROV,lineK,lineWeight,expected,lineDelta,difficulty,VARIETY,varietyWeight,weakness,practical,replyWeights,pick};
})();
