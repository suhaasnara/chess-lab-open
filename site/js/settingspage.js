/* Chess Lab Open — Settings page. */
'use strict';
(function(){
const ROWS=[
  {k:'theme',label:'Theme',note:'Dark redraws the page in dark colours; the board keeps its own. Match device follows your phone or computer.',
   opts:[['auto','Match device'],['light','Light'],['dark','Dark']]},
  {k:'board',label:'Board colour',opts:[['maple','Maple (Lichess image)'],['brown','Brown'],['blue','Blue'],['green','Green'],['grey','Grey']]},
  {k:'anim',label:'Piece animation',opts:[['none','None'],['fast','Fast'],['normal','Normal'],['slow','Slow']]},
  {k:'sound',label:'Move sounds',opts:[['false','Off'],['true','On']]},
  {k:'input',label:'How you move pieces',opts:[['both','Tap or drag'],['click','Tap two squares'],['drag','Drag only']]},
  {k:'shapeColor',label:'Arrow colour (plain right-click)',note:'Right-click a square for a circle, right-drag for an arrow. Shift = red, Alt = blue, Shift+Alt = yellow. Firefox opens its own menu on Shift+right-click, so pick red here instead.',
   opts:[['G','Green'],['R','Red'],['B','Blue'],['Y','Yellow']]},
  {k:'ptheme',label:'Show theme in puzzle titles',note:'Off: Today, Tactics and Calculation name a puzzle by its id, and its themes show once it is done, so the title doesn’t give the idea away.',opts:[['false','No'],['true','Yes']]},
  {k:'coords',label:'Board coordinates',opts:[['true','Show'],['false','Hide']]},
  {k:'lastMove',label:'Highlight the last move',opts:[['true','Yes'],['false','No']]},
  {k:'dests',label:'Show where a piece can go',opts:[['true','Yes'],['false','No']]},
  {k:'autoNext',label:'Next line by itself',note:'After a line with no misses, the next one starts after 2.5 seconds.',opts:[['false','No'],['true','Yes']]},
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
    sel.addEventListener('change',()=>{ Settings.set(r.k,sel.value==='true'?true:sel.value==='false'?false:sel.value); if(r.k==='olevel'&&window.OpeningsTab&&OpeningsTab.syncLevel) OpeningsTab.syncLevel() });
    row.innerHTML=`<span>${esc(r.label)}${r.note?`<br><span class="note">${esc(r.note)}</span>`:''}</span>`;
    row.appendChild(sel); el.appendChild(row);
  }
  hiddenRow();
}
/* Restore hidden openings (Openings → Hide this opening keeps their progress) */
function hiddenRow(){ const el=$('s-rows'); let row=document.getElementById('s-hidden'); if(!row){ row=document.createElement('div'); row.className='setrow'; row.id='s-hidden'; el.appendChild(row) }
  const ids=Store.get('ohidden')||[], names=ids.map(id=>(OpeningsTab.PRESETS.find(o=>o.id===id)||{}).name).filter(Boolean);
  row.innerHTML=`<span>Hidden openings<br><span class="note">${names.length?esc(names.join(', ')):'None. Hide one from its panel on the Openings tab.'}</span></span>`+(names.length?'<button type="button" class="btn sm" id="s-unhide">Restore hidden openings</button>':'');
  const b=row.querySelector('#s-unhide'); if(b) b.onclick=()=>{ Store.del('ohidden'); hiddenRow(); if(window.OpeningsTab&&OpeningsTab.renderList) OpeningsTab.renderList() } }
function refresh(){ hiddenRow(); document.querySelectorAll('#s-rows select[data-k]').forEach(s=>{ s.value=String(Settings.get(s.dataset.k)) }) }
window.SettingsTab={init,refresh};
})();
