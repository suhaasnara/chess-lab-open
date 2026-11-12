/* Chess Lab Open — Blind tactics (Extra): the shared screen (shared/blind.js) on this site's storage.
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
    onResult:()=>{ if(document.body.dataset.view==='progress') ProgressTab.render() }});
}
window.BlindTab={init,show:()=>T&&T.show(),get api(){ return T }};
})();
