/* Tests for "Your prep in your games" on Analyze's report card (20 Nov 2026, js/astats.js prepOf / prepCard): games
   walked through the imported repertoires of their colour as one answer key. */
'use strict';

module.exports=async H=>{
  const {makePage,sleep,assert,section}=H;

  section('t82: Analyze, your prep in your games (imported repertoires)');
  { const {w}=await makePage(); await sleep(30);
    const A=w.AStats, S=w.Store, pid=f=>w.posId(w.normKey(f));
    /* a White repertoire: 1.e4 e5 2.Nf3 Nc6 3.Bb5, and 1.e4 c5 2.Nf3 (both sides' moves, by position) */
    const c=new w.Chess(), pos={};
    const add=(fen,uci)=>{ const k=pid(fen); pos[k]=pos[k]?pos[k]+' '+uci:uci };
    const line=ucis=>{ const g=new w.Chess(); for(const u of ucis){ const f=g.fen(); if(!(pos[pid(f)]||'').split(' ').includes(u)) add(f,u); g.move({from:u.slice(0,2),to:u.slice(2,4)}) } };
    line(['e2e4','e7e5','g1f3','b8c6','f1b5']); line(['e2e4','c7c5','g1f3']);
    S.put('reps-index',[{id:'rw',name:'My 1.e4',side:'white'}]); S.put('rep-rw',{pos});
    const G=(moves,color='w',id='g'+Math.random())=>({id,color,moves,date:'2026-11-01',white:'Me',black:'Opp',result:'1-0'});
    const you=A.prepOf(G(['e4','e5','Nf3','Nc6','Bc4']));
    assert(you&&you.who==='you'&&you.san==='Bc4'&&you.move===3&&you.prep.join()==='Bb5'&&you.rep.name==='My 1.e4','you left your prep at 3.Bc4 (prep: Bb5)');
    const opp=A.prepOf(G(['e4','e6','d4']));
    assert(opp&&opp.who==='opp'&&opp.san==='e6'&&opp.move===1,'the opponent left it with 1...e6');
    const end=A.prepOf(G(['e4','e5','Nf3','Nc6','Bb5','a6']));
    assert(end&&end.who==='end','the game ran to the end of the file');
    const other=A.prepOf(G(['d4','d5']));
    assert(other&&other.who==='other','your first move outside the file is another opening');
    assert(A.prepOf(G(['e4','e5'],'b'))===null,'no Black repertoire: nothing for a Black game');
    /* transpositions count: positions, not move orders */
    const tr=A.prepOf(G(['Nf3','Nc6','e4','e5','Bb5']));
    assert(tr&&tr.who==='other','a different first move is another opening, even if it transposes later');
    /* the card */
    const html=A.render({user:'me',site:'pgn',rows:[],allGames:[G(['e4','e5','Nf3','Nc6','Bc4'],'w','a1'),G(['e4','e5','Nf3','Nc6','Bc4'],'w','a2'),G(['e4','e6'],'w','a3'),G(['d4'],'w','a4')],
      total:4,final:true,files:[],yearly:()=>null,save:()=>''});
    assert(/Your prep in your games/.test(html)&&/reached your repertoires: you left your prep first in <b>2<\/b>/.test(html)&&/the opponent in <b>1<\/b>/.test(html),'the card counts 3 games (another opening left out): you 2, opponent 1');
    assert(/You played <b>3\.Bc4<\/b>, your prep: <b>Bb5<\/b>/.test(html)&&/2 games/.test(html),'the same slip in two games is one row');
    assert(/They played <b>1…e6<\/b>/.test(html),'an unprepared reply is listed');
    /* Practise: the slip goes on the repertoire's review list, and Openings plays it from there */
    S.put('rep-rw',{pos}); S.put('reps-index',[{id:'rw',name:'My 1.e4',side:'white'}]);
    const box=w.document.getElementById('a-report'); box.innerHTML=html;
    const pb=box.querySelector('[data-pprac]'); assert(pb&&pb.dataset.pprac==='rw'&&pb.dataset.ppath==='e4 e5 Nf3 Nc6','a Practise button on your slip, with the moves before it');
    pb.click(); await sleep(150);
    const ms=(S.get('stats-rw')||{}).mistakes||[];
    assert(ms.length===1&&ms[0].path.join(' ')==='e4 e5 Nf3 Nc6','the slip is on the repertoire\'s review list');
    const st=w.OpeningsTab.state;
    assert(w.location.hash==='#openings'&&st.op&&st.op.id==='rw'&&st.review&&st.g.history().join(' ')==='e4 e5 Nf3 Nc6'&&st.g.turn()==='w','Openings opens that repertoire at the slip, your move, as a review');
    pb.click(); await sleep(100);
    assert(((S.get('stats-rw')||{}).mistakes||[]).length===1,'pressing it again adds nothing twice');
    w.location.hash='#analyze'; await sleep(50);
    S.put('reps-index',[]);
    const none=A.render({user:'me',site:'pgn',rows:[],allGames:[G(['e4'])],total:1,final:true,files:[],yearly:()=>null,save:()=>''});
    assert(/Import your repertoire in Openings/.test(none),'no repertoire: says how to get one');
  }
};
