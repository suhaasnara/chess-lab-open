/* A board you can't move on scrolls the page (his iPhone, Chrome, 23 Nov 2026: "issues with the scroll", on Today).
   shared.css gives the squares with pieces touch-action:none on a .movable board, so a drag there moves the piece
   instead of scrolling. .movable used to be added once and never removed: after Today's puzzle or drill was solved,
   every piece on the board (21 of 21 in the probe) swallowed a swipe, on a board half the height of an iPhone's screen.
   Now .movable is on only while the board takes a move; a finished puzzle, drill or game, a game being read and Today's
   preview scroll from anywhere. A drag on your own piece while you can move (also while the reply is coming) still moves it. */
'use strict';
const fs=require('fs'), path=require('path');

module.exports=async H=>{
  const {makePage,sleep,assert,section}=H;

  section('t87: a finished or read-only board scrolls the page');
  const css=fs.readFileSync(path.join(__dirname,'..','site','shared','shared.css'),'utf8').replace(/\/\*[\s\S]*?\*\//g,'');
  const rules=css.match(/[^{}]*\{\s*touch-action:\s*none\s*\}/g)||[];
  const pieceRules=rules.filter(r=>/\.sq/.test(r));
  assert(pieceRules.length>0&&pieceRules.every(r=>r.split(',').every(s=>/\.board\.movable\s/.test(s))),'the squares only stop a swipe on a .movable board ('+pieceRules.map(r=>r.trim()).join(' | ')+')');

  const {w}=await makePage({analyse:async(fen,depth,mpv)=>[{uci:'e1g1',cp:0.4,mate:null}]});
  await sleep(200);
  const $=id=>w.document.getElementById(id), mov=id=>$(id).classList.contains('movable');
  const tap=(bd,sq)=>{ const c=bd.querySelector(`.sq[data-sq="${sq}"]`); for(const t of ['pointerdown','pointerup']) (t==='pointerdown'?c:bd).dispatchEvent(new w.MouseEvent(t,{bubbles:true,button:0})) };

  /* Tactics (Today hosts this panel): live, the reply coming, solved */
  w.location.hash='#tactics'; await sleep(60);
  const T=w.TacticsTab, lib=T.lib, z=lib.find(p=>p.moves.length>=4);
  T.load(z); await sleep(30);
  assert(mov('t-board'),'a puzzle to solve: the board takes moves (a drag on your piece moves it)');
  { const e=z.moves[T.state.step]; await T.userMove(e.slice(0,2),e.slice(2,4),e[4]); }
  assert(mov('t-board')&&$('t-board').querySelector('.sq.own'),'while the reply is coming your pieces still don’t scroll (his recheck)');
  await sleep(600);
  for(let i=0;i<6&&!T.state.solved;i++){ const e=z.moves[T.state.step]; await T.userMove(e.slice(0,2),e.slice(2,4),e[4]); await sleep(600) }
  assert(T.state.solved,'the puzzle is solved');
  const tb=$('t-board');
  assert(!mov('t-board'),'solved: the board no longer stops a swipe on its pieces');
  assert(tb.querySelector('.flash-good'),'the solve’s green flash is still on the board (no redraw)');
  const pc=[...tb.querySelectorAll('.sq')].find(q=>q.querySelector('.pc')).dataset.sq;
  tap(tb,pc);
  assert(!tb.querySelector('.sel'),'solved: tapping a piece doesn’t pick it up');
  T.load(lib.find(p=>p!==z&&p.moves.length>=2)); await sleep(30);
  assert(mov('t-board'),'the next puzzle takes moves again');

  /* Drills: solved, then the next one */
  const fen='r1bqkb1r/1ppp1ppp/p1n2n2/4p3/B3P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 5';
  const drill=id=>({id,fen,played:'Ke2',playedUci:'e1e2',best:'e1g1',drop:0.35,date:'2026-11-01',opp:'Opp '+id,site:'lichess',color:'w',v:1});
  w.Store.put('adrills',[drill('s00000001'),drill('s00000002')]);
  w.location.hash='#drills'; await sleep(60);
  const D=w.DrillsTab;
  D.load(w.Store.get('adrills')[0]); await sleep(20);
  assert(mov('d-board'),'a drill to solve: the board takes moves');
  await D.userMove('e1','g1'); await sleep(30);
  assert(D.state.done&&!mov('d-board'),'a solved drill: the board scrolls from anywhere');
  D.load(w.Store.get('adrills')[1]); await sleep(20);
  assert(mov('d-board'),'the next drill takes moves again');

  /* Guess the move: playing, reading the game, restarting */
  const idx=await w.fetch('data/gtm/index.json').then(r=>r.json());
  w.location.hash='#guess'; await sleep(60);
  const G=w.GtmTab; await G.load(idx[0].file); await sleep(30);
  assert(mov('g-board'),'a game to guess: the board takes moves');
  G.showGame(); await sleep(20);
  assert(!mov('g-board'),'Read the game: the board scrolls from anywhere');
  G.viewAt(12); await sleep(10);
  assert(!mov('g-board'),'stepping through the game keeps it that way');
  G.restart(); await sleep(30);
  assert(mov('g-board'),'Restart game: the board takes moves again');
  { const S=G.state; S.gen++; S.g=new w.Chess(S.game.fen||undefined); for(let i=0;i<S.game.moves.length;i++) S.g.move(S.game.moves[i]); S.ply=S.game.moves.length; G.next(); await sleep(20) }
  assert(G.state.done&&!mov('g-board'),'a finished game: the board scrolls from anywhere');

  /* boards with no move to take: Today's preview, the Settings preview */
  w.location.hash='#today'; await sleep(60);
  assert(!mov('td-board'),'Today’s preview board never stops a swipe');
  w.location.hash='#settings'; await sleep(60);
  assert(!$('s-board')||!mov('s-board'),'the Settings preview board never stops a swipe');
};
