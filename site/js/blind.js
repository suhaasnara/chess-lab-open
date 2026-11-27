/* Think Ahead — Blind tactics (Extra): the shared screen (shared/blind.js) on this site's storage.
   Progress in localStorage: blind-progress {id: {n, ok, okN, t, h, a}} and blind-rating {r, n, hist} (in the progress
   export like every key); settings: Settings 'blind' {lo, hi, plies, len, status}. Data: data/blind.json (CC0). */
'use strict';
(function(){
let T=null;
function init(){
  T=BlindTactics.mount($('bl-root'),{view:'blind',
    load:()=>fetch(Site.url('blind')).then(r=>{ if(!r.ok) throw new Error('HTTP '+r.status); return r.json() }),
    store:{get:k=>Store.get(k),put:(k,v)=>Store.put(k,v)},
    settings:{get:()=>Settings.get('blind'),set:v=>Settings.set('blind',v)},
    onResult:()=>{ if(document.body.dataset.view==='progress') ProgressTab.render();
      /* the app's tap or buzz for the result just recorded (shared/native.js; nothing on the website) */
      const L=Object.values(Store.get('blind-progress')||{}).filter(r=>r&&r.t).sort((a,b)=>b.t-a.t)[0]; if(L&&Date.now()-L.t<5000) window.Native&&Native.verdict(L.ok?'good':'bad') }});
}
/* what the page is for (26 Nov 2026, roadmap #291): a line under the settings card, by this site (the screen is shared) */
function about(){ const set=document.querySelector('#bl-root [data-b="set"]'); if(!set||document.getElementById('bl-about')) return;
  set.insertAdjacentHTML('afterend','<p class="note" id="bl-about" style="margin:8px 0 0">The moves before the puzzle are listed, not played: see them in your head, then solve it. <a href="#help?pages">What is each page for?</a></p>') }
window.BlindTab={init:()=>{ init(); about() },show:()=>T&&T.show(),get api(){ return T }};
})();
