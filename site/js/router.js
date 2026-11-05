/* Chess Lab Open — router: which section is on screen (#openings, #tactics, ...). */
'use strict';
(function(){
const VIEWS=['openings','tactics','analyze','drills','play','guess','progress','settings'];
function route(){
  let v=(location.hash||'#openings').slice(1).split('/')[0];
  if(!VIEWS.includes(v)) v='openings';
  document.body.dataset.view=v;
  for(const id of VIEWS) $(id).hidden=id!==v;
  document.querySelectorAll('.tabs button[data-route]').forEach(b=>b.setAttribute('aria-current',String(b.dataset.route===v)));
  if(v==='progress') ProgressTab.render();
  if(v==='drills') DrillsTab.refresh();
}
document.querySelectorAll('.tabs button[data-route]').forEach(b=>b.addEventListener('click',()=>{ location.hash='#'+b.dataset.route }));
addEventListener('hashchange',route);
OpeningsTab.init(); TacticsTab.init(); AnalyzeTab.init(); DrillsTab.init(); PlayTab.init(); GtmTab.init(); ProgressTab.init(); SettingsTab.init();
route();
/* Start the engine once a board page is open, so the first check doesn't wait for the 7 MB download. */
setTimeout(()=>{ try{ SharedEngine.start() }catch(e){} },2500);
})();
