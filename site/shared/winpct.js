/* Shared (Chess Lab and Chess Lab Open). Home: chess-lab-open/site/shared/ (MIT); the private kit pulls a pinned copy.
   Win%: how both sites put a Stockfish eval into words, the way Lichess does (https://lichess.org/page/accuracy):
     Win% = 50 + 50 * (2 / (1 + exp(-0.00368208 * centipawns)) - 1)
   The grading code keeps working on Lichess's -1..1 "winning chances" (wc), where Lichess's own thresholds are
   0.1 / 0.2 / 0.3. On the 0-100 Win% scale those are 5 / 10 / 15 points: one wc unit is 50 Win% points.
   This file only changes what the page says, never how a move is judged.
     WinPct.pct(pawns)              Win% for White (0-100) from an eval in pawns, White's side
     WinPct.side(pawns, side)       the same from 'w' / 'b' (or true = White)
     WinPct.pts(dropWc)             a drop on the -1..1 scale, in Win% points (rounded)
     WinPct.judge(points)           'blunder' | 'mistake' | 'inaccuracy' | ''
     WinPct.change(pawns, dropWc, side)  '59% → 52%' (before the move, after it, from that side)
     WinPct.HELP                    the one-paragraph explanation every "?" uses; WinPct.URL Lichess's page */
'use strict';
window.WinPct=(()=>{
  const K=0.00368208;
  const pct=p=>100/(1+Math.exp(-K*100*Math.max(-15,Math.min(15,+p||0))));
  const white=s=>s===true||s==='w'||s==='white';
  const side=(p,s)=>white(s)?pct(p):100-pct(p);
  const pts=d=>Math.round((+d||0)*50);
  const judge=n=>n>=15?'blunder':n>=10?'mistake':n>=5?'inaccuracy':'';
  const change=(p,d,s)=>{ const b=side(p,s), a=Math.max(0,b-(+d||0)*50); return `${Math.round(b)}% → ${Math.round(a)}%` };
  const HELP='Win% is Lichess’s chance of winning from Stockfish’s eval, from your side: 0.0 is 50%, +1 is 59%, +2 is 68%, '+
    '+3 is 75%, +5 is 86%. A move that drops it by 5 points or more is an inaccuracy, 10 a mistake, 15 a blunder. '+
    'A pawn counts most near equality: +5 to +3 costs 11 points, +1 to −1 costs 18. Below 15% no move can be a '+
    'blunder (there aren’t 15 points left to lose).';
  return {pct,side,pts,judge,change,HELP,URL:'https://lichess.org/page/accuracy'};
})();
