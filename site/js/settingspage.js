/* Chess Lab Open — Settings page. */
'use strict';
(function(){
const ROWS=[
  {k:'theme',label:'Theme',note:'Dark redraws the page in dark colours; the board keeps its own. Match device follows your phone or computer.',
   opts:[['auto','Match device'],['light','Light'],['dark','Dark']]},
  {k:'board',label:'Board colour',opts:[['maple','Maple (Lichess image)'],['brown','Brown'],['blue','Blue'],['green','Green'],['grey','Grey']]},
  {k:'olevel',label:'Opponent level (openings)',note:'Lichess Elite games (2500+ vs 2300+), or Lichess rapid and classical games by rating band, 1000 to 2200+. All books ship with the site; no account needed. Also on the Openings tab.',
   opts:Book.ORDER.slice().reverse().map(k=>[k,Book.levelLabel(k)])},
  {k:'olen',label:'Line length',note:'How many of your moves an opening line lasts.',
   opts:[['short','Short (5)'],['medium','Medium (8)'],['long','Long (12)'],['vlong','Very long (20)'],['max','Max (30)']]},
  {k:'omode',label:'Openings mode',opts:[['rated','Rated'],['training','Training (no rating)']]},
  {k:'ovariety',label:'Sidelines in repertoires',note:'How often your imported repertoire’s sidelines come up. More trainer settings: the ⚙ on the Openings tab.',
   opts:[['realistic','Realistic (as often as played)'],['balanced','Balanced'],['sidelines','Sidelines first']]},
  {k:'oshare',label:'Book move threshold',note:'A preset move below this share of elite games counts as rare (half credit).',
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
    sel.dataset.k=r.k; sel.setAttribute('aria-label',r.label);
    sel.addEventListener('change',()=>{ Settings.set(r.k,sel.value); if(r.k==='olevel'&&window.OpeningsTab&&OpeningsTab.syncLevel) OpeningsTab.syncLevel() });
    row.innerHTML=`<span>${esc(r.label)}${r.note?`<br><span class="note">${esc(r.note)}</span>`:''}</span>`;
    row.appendChild(sel); el.appendChild(row);
  }
}
function refresh(){ document.querySelectorAll('#s-rows select[data-k]').forEach(s=>{ s.value=String(Settings.get(s.dataset.k)) }) }
window.SettingsTab={init,refresh};
})();
