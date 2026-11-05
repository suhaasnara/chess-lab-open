/* Chess Lab Open — Progress: totals, per-opening table, export/import. */
'use strict';
(function(){
function render(){
  const idx=(Store.get('reps-index')||[]).map(r=>({...r,rep:true}));
  const all=[...idx,...OpeningsTab.openings().filter(o=>!o.rep)];
  const withStats=all.map(o=>({o,st:OpeningsTab.stats(o.id)})).filter(x=>x.st.lines>0);
  const tac=Store.get('tac-rating')||{r:null,n:0};
  const tsolved=Object.values(Store.get('tactics-progress')||{}).filter(x=>x.ok).length;
  const dr=Store.get('adrills')||[]; const dp=Store.get('adrills-progress')||{};
  $('p-stats').innerHTML=`
    <div class="stat"><b>${withStats.reduce((a,x)=>a+x.st.lines,0)}</b><span class="note">opening lines trained</span></div>
    <div class="stat"><b>${tac.n?tac.r:'–'}</b><span class="note">puzzle rating (${tac.n} rated)</span></div>
    <div class="stat"><b>${tsolved}</b><span class="note">puzzles solved</span></div>
    <div class="stat"><b>${Object.values(dp).filter(x=>x.ok).length} / ${dr.length}</b><span class="note">game drills solved</span></div>`;
  const t=$('p-table');
  t.innerHTML='<tr><th>Opening</th><th>Side</th><th>Lines</th><th>Rating</th><th>Last trained</th></tr>'+
    withStats.sort((a,b)=>b.st.lines-a.st.lines).map(({o,st})=>{
      const last=st.history.length?new Date(st.history[st.history.length-1].t).toISOString().slice(0,10):'—';
      return `<tr><td>${esc(o.name)}</td><td>${o.side}</td><td>${st.lines}</td><td>${st.rating}</td><td>${last}</td></tr>`;
    }).join('')||'<tr><td colspan="5" class="note">Nothing trained yet.</td></tr>';
}
function init(){
  $('p-export').addEventListener('click',()=>{
    const blob=new Blob([JSON.stringify(Store.exportAll(),null,1)],{type:'application/json'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
    a.download='chess-lab-open-progress-'+new Date().toISOString().slice(0,10)+'.json'; a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),5000);
  });
  $('p-import').addEventListener('click',()=>$('p-file').click());
  $('p-file').addEventListener('change',e=>{
    const f=e.target.files[0]; if(!f) return;
    f.text().then(txt=>{ const n=Store.importAll(JSON.parse(txt)); $('p-note').textContent=`Imported ${n} entries.`; render() })
      .catch(err=>{ $('p-note').textContent=String(err.message||err) });
    e.target.value='';
  });
}
window.ProgressTab={init,render};
})();
