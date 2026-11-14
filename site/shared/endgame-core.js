/* Shared (Chess Lab and Chess Lab Open). Home: chess-lab-open/site/shared/ (MIT); the private kit pulls a pinned copy.
   Endgames graded by the Lichess tablebase. Needs chess.js. Everything is on window.EndgameCore.

   A tablebase answer (tablebase.lichess.ovh/standard?fen=) lists the moves of the side to move; each move's `category`
   is the result for the OTHER side after it (loss = the mover wins). res(category) turns it into the mover's result:
   W (win), D (draw), L (loss). met(move) = 0 for a move that mates, else moves to mate (dtm) when known, else
   10000 + dtz: smaller = faster.

   EndgameCore.options(tb, goal) -> {b, w, d}: the user's moves as space-separated uci, in the stored-tree shape:
     b = the fastest wins, w = other wins, d = draws (goal 'win' grades best/good/throw; goal 'draw' hold/throw).
   EndgameCore.pickReply(fen, tb, probe) -> uci: the bot's move (the user's opponent).
     1. Keep the best result there is (win > draw > loss).
     2. Losing anyway: resist longest (the largest dtm, else dtz) — never a random losing move.
     3. Otherwise, among moves that keep the result (probe(fenAfter) gets the tablebase for up to 8 of them):
        keep material (the bot's material after the user's best reply), then leave the user the fewest replies that
        don't lose for them (the saving replies), then the fastest win.
     Without probe answers it falls back to the tablebase's own order. Tested on rook + bishop vs rook, where taking
     the first drawing move gave the bishop away. */
window.EndgameCore=(()=>{
  const res=c=>({loss:'W',win:'L','maybe-loss':'W','maybe-win':'L','syzygy-loss':'W','syzygy-win':'L','blessed-loss':'D','cursed-win':'D'})[c]||'D';
  const RANK={W:2,D:1,L:0};
  const met=m=>m.checkmate?0:m.dtm!=null?Math.abs(m.dtm):10000+Math.abs(m.dtz||0);   /* a mating move has no dtm: it is the fastest win, never the slowest (14 Nov 2026) */
  const VAL={p:1,n:3,b:3,r:5,q:9,k:0};
  function material(g,color){ let s=0; for(const row of g.board()) for(const p of row) if(p&&p.color===color) s+=VAL[p.type]; return s }
  const U=u=>({from:u.slice(0,2),to:u.slice(2,4),promotion:u[4]||undefined});
  function options(d,goal){
    const ms=(d&&d.moves)||[]; if(!ms.length) return null;
    const W=ms.filter(m=>res(m.category)==='W'), D=ms.filter(m=>res(m.category)==='D');
    if(goal==='win'&&W.length){ const best=Math.min(...W.map(met)); const b=W.filter(m=>met(m)===best).map(m=>m.uci);
      return {b:b.join(' '),w:W.filter(m=>!b.includes(m.uci)).map(m=>m.uci).join(' '),d:D.map(m=>m.uci).join(' ')} }
    return {b:'',w:W.map(m=>m.uci).join(' '),d:D.map(m=>m.uci).join(' ')};
  }
  async function pickReply(fen,d,probe){
    const ms=(d&&d.moves)||[]; if(!ms.length) return null;
    const top=Math.max(...ms.map(m=>RANK[res(m.category)]));
    let C=ms.filter(m=>RANK[res(m.category)]===top);
    if(top===0) return C.reduce((a,m)=>met(m)>met(a)?m:a).uci;       /* losing: resist longest */
    if(C.length===1||!probe) return C[0].uci;
    const me=fen.split(' ')[1];
    const cand=C.slice(0,8);
    const info=await Promise.all(cand.map(async m=>{
      const g=new Chess(fen); if(!g.move(U(m.uci))) return null;
      let d2=null; try{ d2=await probe(g.fen()) }catch(e){}
      const rs=(d2&&d2.moves)||[];
      if(!rs.length) return {m,mat:material(g,me),saving:g.game_over()?0:99,known:false};
      /* the user's best reply (the tablebase lists it first), and how many replies don't lose for them */
      const best=rs[0], g2=new Chess(g.fen()); g2.move(U(best.uci));
      return {m,mat:material(g2,me),saving:rs.filter(x=>res(x.category)!=='L').length,known:true};
    }));
    const ok=info.filter(x=>x&&x.known);
    if(!ok.length) return C[0].uci;
    ok.sort((a,b)=>b.mat-a.mat||a.saving-b.saving||(top===2?met(a.m)-met(b.m):0));
    return ok[0].m.uci;
  }
  return {res,met,options,pickReply,material};
})();
