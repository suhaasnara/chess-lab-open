/* Chess Lab Open — router: which section is on screen (#openings, #tactics, ...). */
'use strict';
(function(){
const VIEWS=['today','openings','tactics','blind','calc','endgames','analyze','drills','play','guess','players','watch','blundercheck','game','progress','settings'];
const TITLES={today:'Today',openings:'Openings',tactics:'Tactics',blind:'Blind tactics',calc:'Calculation',endgames:'Endgames',analyze:'Analyze my games',drills:'Drills',play:'Play',guess:'Guess the move',players:'Players',watch:'Watch',blundercheck:'Blunder check',game:'A game you analyzed',progress:'Progress',settings:'Settings'};
/* The header (shared/nav.js): the same main row and Extra menu as the private Chess Lab, plus Analyze my games. */
Nav.mount(document.getElementById('tabs'),SITE.tabs);   /* js/config.js */
/* the section on screen: shared/router.js with this site's views; the rest is this site's own work for each view */
/* The engine (Stockfish, about 7 MB) is the biggest download, and each visit fetches it again, so it starts only where it
   is used (11 Nov 2026, as on the private site): at once on the tabs built on it (Drills, Play, Guess the move,
   Calculation); on Today, where you land, at your first touch of a board (14 Nov 2026: it used to start after 3 s
   there too, 7 MB for a visitor who only reads the page); elsewhere when something asks for it (a preset's off-book check, an eval, Analyze, an endgame off its stored
   lines: SharedEngine.analyse/play start it). Drilling an imported repertoire never needs it until the line ends with
   the eval bar on. */
const ENGINE_FIRST=['drills','play','guess','calc'];
function engineFor(v){ if(ENGINE_FIRST.includes(v)) SharedEngine.start() }
document.addEventListener('pointerdown',e=>{ const b=e.target.closest&&e.target.closest('#today .board'); if(b&&!b.closest('#o-board')) SharedEngine.start() },true);
function onShow(v){
  const h=$('view-title'); if(h){ h.textContent=v==='today'?'':'Chess Lab Open: '+TITLES[v]; h.hidden=v==='today' }
  engineFor(v);
  if(v==='calc') CalcTab.ensure();
  if(v==='blind') BlindTab.show();   /* the set (about 1 MB) loads on first use; no engine on this tab */
  if(v==='openings'||v==='analyze') Book.ready();   /* start the Elite book download as soon as it may be needed */
  if(v==='analyze') AnalyzeTab.restore();   /* the last report, from the kept games (js/agames.js); nothing if one is on screen */
  if(v==='game') GameView.show();   /* #game?id=&ply=: a game you analyzed, at a move (js/gameview.js) */
  if(v==='openings') OpeningsTab.openDefault();   /* as in Chess Lab: the page opens on an opening (your last one, else the top of your list) */
  if(v==='progress'){ ProgressTab.render(); CalcTab.ensure().then(()=>{ if(document.body.dataset.view==='progress') ProgressTab.render() }) }
  if(v==='today'||v==='tactics') TacticsTab.ensure();   /* the puzzle library: only on the pages that use it */
  if(v==='today') TodayTab.render();
  if(v==='drills') DrillsTab.refresh();
  if(v==='watch') WatchTab.render();
  if(v==='players') PlayersTab.render();
  if(v==='blundercheck') BlunderCheckTab.refresh(true);
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
OpeningsTab.init(); TacticsTab.init(); BlindTab.init(); CalcTab.init(); EndgamesTab.init(); TodayTab.init(); AnalyzeTab.init(); DrillsTab.init(); PlayTab.init(); GtmTab.init(); PlayersTab.init(); WatchTab.init(); BlunderCheckTab.init(); GameView.init(); ProgressTab.init(); SettingsTab.init();
Router.start({views:Object.fromEntries(VIEWS.map(v=>[v,v==='game'?{el:v,nav:'analyze'}:{el:v}])),fallback:'today',scrollTop:true,onShow,
  title:v=>v==='today'?'Chess Lab Open':TITLES[v]+' · Chess Lab Open'});
})();
