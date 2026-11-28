/* The 27 Nov 2026 launch wants (roadmap #277, #279, #399). */
'use strict';

module.exports=async H=>{
  const {makePage,sleep,assert,section}=H;
  const seed=(k,v)=>w=>w.localStorage.setItem('clo:'+k,JSON.stringify(v));

  section('t111: Play keeps the game in progress and offers to continue it (roadmap #277)');
  {
    const {w}=await makePage();
    w.SharedEngine.play=async()=>'e7e5';
    const $=id=>w.document.getElementById(id), P=w.PlayTab;
    $('pl-elo').value='1400'; $('pl-color').value='w'; $('pl-blind').checked=false;
    P.newGame(); await sleep(20);
    assert(w.Store.get('play-current')==null,'a new game with no moves yet isn’t kept');
    P.userMove('e2','e4'); await sleep(50);
    const c=w.Store.get('play-current');
    assert(c&&c.moves.join(' ')==='e4 e5'&&c.me==='w'&&c.elo===1400&&c.blind===false,'after each move the moves, the side and the bot are kept: '+JSON.stringify(c));
    P.takeBack(); await sleep(10);
    assert(w.Store.get('play-current')==null,'taking back to the start leaves nothing to continue');
    P.userMove('d2','d4'); await sleep(50);
    assert(w.Store.get('play-current').moves.join(' ')==='d4 e5'&&w.Store.get('play-current').takebacks===1,'… and the takeback is kept with the game');
    const saved=w.Store.get('play-current');

    /* the app or tab closed: a new page load offers it */
    const {w:w2}=await makePage({beforeLoad:seed('play-current',saved)});
    w2.SharedEngine.play=async()=>'g8f6';
    const $2=id=>w2.document.getElementById(id), P2=w2.PlayTab;
    assert(/game in progress/.test($2('pl-status').textContent)&&$2('pl-continue'),'Play offers to continue: '+$2('pl-status').textContent);
    assert(/White vs Stockfish \(1400\)/.test($2('pl-status').textContent),'… naming the side and the bot');
    $2('pl-continue').click(); await sleep(20);
    const S=P2.state;
    assert(S.moves.join(' ')==='d4 e5'&&S.me==='w'&&S.elo===1400&&S.takebacks===1&&S.g.turn()==='w'&&!S.over,'Continue puts the game back where it was, your move');
    assert(!$2('play').classList.contains('idle')&&!$2('pl-resign').hidden,'… with the game’s buttons');
    P2.userMove('c2','c4'); await sleep(50);
    assert(S.moves.join(' ')==='d4 e5 c4 Nf6'&&w2.Store.get('play-current').moves.length===4,'… and it goes on being kept');
    P2.resign(); P2.resign(); await sleep(20);
    assert(w2.Store.get('play-current')==null,'the game ending clears it');
    const g=(w2.Store.get('play-games')||[])[0];
    assert(g&&g.moves==='d4 e5 c4 Nf6'&&g.takebacks===1,'… and it is saved with your games, takebacks and all');

    /* the bot to move when it was closed: it answers on Continue */
    const {w:w3}=await makePage({beforeLoad:seed('play-current',{t:Date.now(),me:'b',elo:'max',blind:true,peeks:2,moves:['e4']})});
    w3.SharedEngine.analyse=async()=>[{uci:'g1f3',cp:0.2,mate:null}];
    const $3=id=>w3.document.getElementById(id);
    assert(/Black vs Stockfish at full strength · blindfold/.test($3('pl-status').textContent),'a blindfold game as Black is offered as such');
    $3('pl-continue').click(); await sleep(30);
    const S3=w3.PlayTab.state;
    assert(S3.blind&&S3.peeks===2&&$3('pl-board').classList.contains('blind'),'blindfold and its peeks come back');
    assert(S3.moves.length===1&&S3.g.turn()==='b','your move as Black');

    /* a kept game that doesn't replay is dropped, not offered */
    const {w:w4}=await makePage({beforeLoad:seed('play-current',{t:Date.now(),me:'w',elo:1800,moves:['e4','e4']})});
    assert(!w4.document.getElementById('pl-continue')&&w4.Store.get('play-current')==null,'an unreadable kept game is dropped quietly');
    const {w:w5}=await makePage();
    assert(!w5.document.getElementById('pl-continue'),'no game kept: no offer');
  }
};
