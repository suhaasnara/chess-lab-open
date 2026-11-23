/* Guess the move: critical moments (23 Nov 2026). data/gtm/critical.json marks, by game id, the plies where the player
   should slow down (tools/pick_critical.py; "hand" entries are Suhaas's). At one, the board gets a brass ring and the
   status says "Critical moment: take your time."; afterwards the move carries a ★. The games list counts them, and a
   played game's score sits in its second line, not in the year's chip (his iPad note: it read as a date). */
'use strict';
const fs=require('fs'), path=require('path');

module.exports=async H=>{
  const {makePage,sleep,assert,section,SITE}=H;
  const dir=path.join(SITE,'data','gtm');
  const idx=JSON.parse(fs.readFileSync(path.join(dir,'index.json'),'utf8'));
  const crit=JSON.parse(fs.readFileSync(path.join(dir,'critical.json'),'utf8'));

  section('t83: Guess the move — critical moments: the data');
  { const ids=new Set(idx.map(e=>e.id)), keys=Object.keys(crit).filter(k=>k!=='_about');
    assert(keys.length>=8,'most games have critical moments ('+keys.length+' of '+idx.length+')');
    for(const k of keys){
      const c=crit[k], e=idx.find(x=>x.id===k);
      assert(ids.has(k),k+': a game in the index');
      if(!e) continue;
      const g=JSON.parse(fs.readFileSync(path.join(dir,e.file),'utf8'));
      assert(c.by==='auto'||c.by==='hand',e.title+': marked "auto" or "hand"');
      const p=c.plies;
      assert(Array.isArray(p)&&p.every(Number.isInteger)&&p.every((x,i)=>!i||x>p[i-1]),e.title+': plies are whole numbers, in order, no repeats');
      assert(p.every(x=>x>=g.theory&&x<g.moves.length&&(x%2===0?'w':'b')===g.winner&&g.m[String(x)]),e.title+': every critical ply is one of the winner\'s guessed moves ('+p.join(', ')+')');
      if(c.by==='auto') assert(p.length>=1&&p.length<=Math.max(1,Math.min(5,Math.floor(Object.keys(g.m).length/10))),e.title+': a few moments, not every move ('+p.length+')');
    }
    /* Gukesh – Carlsen, Norway Chess 2025: 53.Rxe2+ after Carlsen's 52...Qc2?? is the moment the game turned */
    const gc=idx.find(e=>e.file==='game17.json');
    assert(gc&&crit[gc.id]&&crit[gc.id].plies.includes(104),'Gukesh – Carlsen: 53.Rxe2+ is marked');
  }

  section('t84: Guess the move — critical moments: the cue, the star, the list');
  { const {w}=await makePage({analyse:async()=>[{uci:'g1f3',cp:0.3,mate:null}]});
    await sleep(300);
    const $=id=>w.document.getElementById(id), G=w.GtmTab;
    const e=idx.find(x=>crit[x.id]), plies=crit[e.id].plies;
    w.location.hash='#guess'; await sleep(60);
    /* the list: a count of the moments; the chip is the year */
    w.scrollTo=()=>{};
    G.lobby(); await sleep(20);
    const src=[...w.document.querySelectorAll('#g-src input')].find(i=>i.value===(e.set==='masters'?'masters':'mine'));
    src.checked=true; src.dispatchEvent(new w.Event('change',{bubbles:true})); await sleep(20);
    const row=w.document.querySelector(`#g-list .drill[data-id="${e.id}"]`);
    assert(row&&row.textContent.includes(plies.length===1?'1 critical moment':plies.length+' critical moments'),'the games list says how many critical moments a game has');
    assert(/^(1[89]\d\d|20\d\d|—)$/.test(row.querySelector('.evalchip').textContent),'the chip on the left is the year');

    await G.load(e.file); await sleep(30);
    const S=G.state;
    assert(G.critOf(S.game).size===plies.length&&/critical moment/.test($('g-status').textContent),'the game\'s moments load, and the opening message mentions them');
    /* jump to the opponent's move just before the first critical ply; next() plays it and asks, as in the game */
    const target=plies[0];
    S.gen++; S.g=new w.Chess(); for(let i=0;i<target-1;i++) S.g.move(S.game.moves[i]);
    S.ply=target-1; S.busy=false; S.done=false; S.read=false;
    G.next(); await sleep(700);
    assert(S.ply===target,'at the critical ply');
    assert($('g-board').classList.contains('crit'),'the board gets the brass ring');
    assert($('g-status').className.includes('crit')&&/Critical moment: take your time/.test($('g-status').textContent),'the status says: Critical moment, take your time');
    const gm=new w.Chess(S.g.fen()).move(S.game.moves[S.ply]);
    await G.userMove(gm.from,gm.to,gm.promotion); await sleep(60);
    assert(!$('g-board').classList.contains('crit'),'the ring goes once you have answered');
    const star=[...$('g-moves').querySelectorAll('.gmv')].find(b=>+b.dataset.ply===target+1);
    assert(star&&star.querySelector('.gcrit'),'the move list marks the critical move with a ★');
    await sleep(1000);
    if(!plies.includes(S.ply)) assert(!$('g-board').classList.contains('crit')&&!$('g-status').className.includes('crit'),'an ordinary move: no ring, the usual prompt');

    /* a played game: its score is in the second line, the chip stays the year */
    const maxpts=S.game.maxpts, res=w.Store.get('gtm-results')||{}; res[e.id]={pts:7,max:maxpts,t:Date.now()}; w.Store.put('gtm-results',res);
    G.lobby(); await sleep(20);
    const row2=w.document.querySelector(`#g-list .drill[data-id="${e.id}"]`);
    assert(!/\//.test(row2.querySelector('.evalchip').textContent)&&row2.querySelector('.meta').textContent.includes('7 of '+maxpts+' pts'),'a played game: the chip stays the year, the score reads "7 of N pts" in its line');
    assert((row2.querySelector('.meta').textContent.match(/pts/g)||[]).length===1,'… and the max points are not said twice');

    /* without critical.json (an older copy, or offline) nothing breaks */
    const {w:w2}=await makePage({fetch:async u=>/critical\.json/.test(u)?{ok:false,status:404,json:async()=>{ throw new Error('404') }}:null});
    await sleep(300);
    await w2.GtmTab.load(e.file); await sleep(30);
    assert(w2.GtmTab.state.game&&w2.GtmTab.critOf(w2.GtmTab.state.game).size===0,'no critical.json: the game plays without moments');
  }
};
