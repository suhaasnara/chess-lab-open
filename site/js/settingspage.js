/* Chess Lab Open — Settings page. */
'use strict';
(function(){
const ROWS=[
  {k:'board',label:'Board colour',opts:[['maple','Maple (Lichess image)'],['brown','Brown'],['blue','Blue'],['green','Green'],['grey','Grey']]},
  {k:'olevel',label:'Opponent level (openings)',note:'Masters, or Lichess club games by rating band (live from the opening explorer).',
   opts:[['masters','Masters'],['b22','Club 2200+'],['b20','Club 2000–2200'],['b18','Club 1800–2000']]},
  {k:'olen',label:'Line length',note:'How many of your moves an opening line lasts.',
   opts:[['short','Short (5)'],['medium','Medium (8)'],['long','Long (12)'],['vlong','Very long (20)'],['max','Max (30)']]},
  {k:'omode',label:'Openings mode',opts:[['rated','Rated'],['training','Training (no rating)']]},
  {k:'oshare',label:'Book move threshold',note:'A preset move below this masters’ share counts as rare (half credit).',
   opts:[['1','1%'],['3','3%'],['5','5%'],['10','10%']]},
  {k:'sfDepth',label:'Stockfish depth for checks',opts:[['auto','Auto'],['12','12'],['14','14'],['16','16'],['18','18']]},
];
function init(){
  const el=$('s-rows'); el.innerHTML='';
  for(const r of ROWS){
    const row=document.createElement('div'); row.className='setrow';
    const sel=document.createElement('select');
    for(const [v,name] of r.opts){ const o=document.createElement('option'); o.value=v; o.textContent=name; sel.appendChild(o) }
    sel.value=String(Settings.get(r.k));
    sel.addEventListener('change',()=>Settings.set(r.k,sel.value));
    row.innerHTML=`<span>${esc(r.label)}${r.note?`<br><span class="note">${esc(r.note)}</span>`:''}</span>`;
    row.appendChild(sel); el.appendChild(row);
  }
}
window.SettingsTab={init};
})();
