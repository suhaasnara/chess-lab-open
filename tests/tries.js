/* Guess the move: tries before the move is shown (23 Nov 2026, his ask). Settings → Guess the move → 1, 2 or 3.
   A weaker guess with a try left keeps the game move hidden and puts the piece back; only the first try scores. */
'use strict';

module.exports=async H=>{
  const {makePage,sleep,assert,section}=H;

  section('t85: Guess the move — tries before the move is shown');
  /* the engine rates every other move as much weaker, so a wrong guess is a miss */
  const {w}=await makePage({analyse:async()=>[{uci:'a2a3',cp:5,mate:null}]});
  await sleep(300);
  const $=id=>w.document.getElementById(id), G=w.GtmTab;
  assert(w.Settings.get('gtries')==='1','one try by default (as before)');
  w.location.hash='#settings'; await sleep(60);
  const sel=w.document.querySelector('#s-rows select[data-k="gtries"]');
  assert(sel&&[...sel.options].map(o=>o.value).join()==='1,2,3','Settings has a Tries row: 1, 2 or 3');
  sel.value='3'; sel.dispatchEvent(new w.Event('change')); await sleep(10);
  assert(w.Settings.get('gtries')==='3','choosing 3 saves it');

  const idx=await w.fetch('data/gtm/index.json').then(r=>r.json());
  w.location.hash='#guess'; await sleep(60);
  await G.load(idx[0].file); await sleep(30);
  const S=G.state;
  assert(/3 tries a move/.test($('g-status').textContent),'the opening message says how many tries');
  /* skip to the first guessed move */
  S.gen++; let p=S.game.theory; while((p%2===0?'w':'b')!==S.game.winner) p++;
  S.g=new w.Chess(); for(let i=0;i<p-1;i++) S.g.move(S.game.moves[i]); S.ply=p-1;
  G.next(); await sleep(700);
  assert(S.ply===p&&S.left===2,'at your move, with two more tries');
  const gameMv=new w.Chess(S.g.fen()).move(S.game.moves[S.ply]);
  const wrong=()=>{ const c=new w.Chess(S.g.fen()); return c.moves({verbose:true}).find(m=>m.from+m.to!==gameMv.from+gameMv.to&&!(S.game.m[String(S.ply)].alts||[]).some(u=>u.slice(0,4)===m.from+m.to)) };
  const fen0=S.g.fen(), w1=wrong();
  await G.userMove(w1.from,w1.to,w1.promotion); await sleep(60);
  assert(S.ply===p&&S.g.fen()===fen0,'a weaker first try: the game move is not played');
  assert(/Try again/.test($('g-status').textContent)&&/2 tries left/.test($('g-status').textContent)&&!$('g-status').textContent.includes(S.game.moves[p]),'the status says try again, 2 tries left, and does not give the move away');
  assert(S.rows.length===1&&S.rows[0].earned===0&&S.rows[0].guess===w1.san&&S.missed===1,'the first try is what scores: a 0 row for it');
  const w2=wrong();
  await G.userMove(w2.from,w2.to,w2.promotion); await sleep(60);
  assert(S.ply===p&&/Last try/.test($('g-status').textContent),'a second weaker try: one last try');
  assert(S.rows.length===1&&S.missed===1,'… and nothing is counted again');
  await G.userMove(gameMv.from,gameMv.to,gameMv.promotion); await sleep(60);
  assert(S.ply===p+1&&S.pts===0&&S.rows.length===1&&S.got===0,'finding it on the last try plays the move and scores nothing');
  assert(/first answer is what counts/.test($('g-status').textContent),'… and says the first answer counted');

  /* out of tries: the move is shown */
  await sleep(1200);
  for(let i=0;i<20&&((S.ply%2===0?'w':'b')!==S.game.winner||S.busy);i++) await sleep(200);
  const q=S.ply; w.Settings.set('gtries','2'); S.left=1;
  const gm2=new w.Chess(S.g.fen()).move(S.game.moves[q]);
  const x1=wrong(); await G.userMove(x1.from,x1.to,x1.promotion); await sleep(60);
  assert(S.ply===q&&/Last try/.test($('g-status').textContent),'with 2 tries: a miss leaves one last try');
  const x2=wrong(); await G.userMove(x2.from,x2.to,x2.promotion); await sleep(60);
  assert(S.ply===q+1&&$('g-status').textContent.includes(S.game.moves[q]),'out of tries: the game move is shown and played');
  w.Settings.set('gtries','1');
  void gm2;
};
