/* Chess Lab Open — router: which section is on screen (#openings, #tactics, ...). */
'use strict';
(function(){
const VIEWS=['today','openings','tactics','calc','endgames','analyze','drills','play','guess','players','watch','progress','settings'];
const BOARD_VIEWS=['openings','tactics','calc','endgames','drills','play','guess','players'];
const TITLES={today:'Today',openings:'Openings',tactics:'Tactics',calc:'Calculation',endgames:'Endgames',analyze:'Analyze my games',drills:'Drills',play:'Play',guess:'Guess the move',players:'Players',watch:'Watch',progress:'Progress',settings:'Settings'};
let shown=null, first=true;
/* The header (shared/nav.js): the same main row and Extra menu as the private Chess Lab, plus Analyze my games. */
Nav.mount(document.getElementById('tabs'),{
  main:[['today','Today'],['openings','Openings'],['drills','Drills'],['tactics','Tactics'],['analyze','Analyze my games'],['progress','Progress']],
  extra:[['guess','Guess the move','Master games and your own, move by move'],['calc','Calculation','Long puzzles, timed, with a free board'],
    ['endgames','Endgames','Textbook endings against perfect defence'],['watch','Watch','Your video library: place, notes, bookmarks'],
    ['play','Play','Games against Stockfish, blindfold'],['players','Players','Any Lichess or Chess.com player: openings, pre-round sheet']]});
function route(){
  let v=(location.hash||'#today').slice(1).split('?')[0].split('/')[0];   /* #analyze?site=lichess&u=name: a prefilled link */
  if(!VIEWS.includes(v)) v='today';
  const changed=shown!==null&&shown!==v; shown=v;
  document.body.dataset.view=v;
  document.title=v==='today'?'Chess Lab Open':TITLES[v]+' · Chess Lab Open';
  const h=$('view-title'); if(h){ h.textContent=v==='today'?'':'Chess Lab Open: '+TITLES[v]; h.hidden=v==='today' }
  for(const id of VIEWS) $(id).hidden=id!==v;
  Nav.set(v);   /* shared/nav.js: marks the tab (or Extra) and keeps it in view on narrow screens */
  if(BOARD_VIEWS.includes(v)) SharedEngine.start();   /* the 7 MB engine downloads once a board page is open */
  if(v==='calc') CalcTab.ensure();
  if(v==='openings'||v==='analyze') Book.ready();   /* start the Elite book download as soon as it may be needed */
  if(v==='progress'){ ProgressTab.render(); CalcTab.ensure().then(()=>{ if(document.body.dataset.view==='progress') ProgressTab.render() }) }
  if(v==='today') TodayTab.render();
  if(v==='drills') DrillsTab.refresh();
  if(v==='watch') WatchTab.render();
  if(v==='players') PlayersTab.render();
  if(changed&&document.scrollingElement) document.scrollingElement.scrollTop=0;
  if(first){ first=false; const top=()=>{ if(document.scrollingElement) document.scrollingElement.scrollTop=0 };   /* a #tab link jumps to the section; start at the top instead */
    requestAnimationFrame(top); addEventListener('load',top,{once:true}) }
}
/* Phones and tablets (one column, board on top): picking from the list below brings the board back into view. */
document.addEventListener('click',e=>{   /* capture phase: the list re-renders on click, so find the section first */
  if(innerWidth>860) return;
  const it=e.target.closest('section .list > button, section .list > .item, section .list > [role=button]');
  if(!it||it.closest('#today')||it.closest('.opop')) return;
  const s=it.closest('section');
  setTimeout(()=>{
    const b=s&&[...s.querySelectorAll('.board')].find(x=>x.offsetParent);
    if(!b) return;
    const top=b.getBoundingClientRect().top, nav=(document.querySelector('.tabs')||{}).offsetHeight||0;
    if(top<nav||top>innerHeight*0.5) scrollTo({top:scrollY+top-nav-8,behavior:'smooth'});
  },60);
},true);
addEventListener('hashchange',route);
OpeningsTab.init(); TacticsTab.init(); CalcTab.init(); EndgamesTab.init(); TodayTab.init(); AnalyzeTab.init(); DrillsTab.init(); PlayTab.init(); GtmTab.init(); PlayersTab.init(); WatchTab.init(); ProgressTab.init(); SettingsTab.init();
route();
})();
