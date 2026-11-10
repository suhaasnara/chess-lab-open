/* Chess Lab Open — Progress: totals, per-opening table, export/import. */
'use strict';
(function(){
/* ---------- charts: inline SVG, one series each (no legend needed; the card title names it).
   Line 2px in the site navy, recessive grid, a dot + tooltip on every point (hover / tap). ---------- */
const NS='http://www.w3.org/2000/svg';
const fmtDay=t=>new Date(t).toLocaleDateString(undefined,{month:'short',day:'numeric'});
const TAC_MIN=5;   /* the puzzle rating shows (tile and chart alike) after this many rated puzzles */
const rating=()=>Store.get('tac-rating')||{r:2000,n:0};
function lineChart(el,pts,{empty,label}){
  if(pts.length<2){ el.innerHTML=`<p class="note">${esc(empty)}</p>`; return }
  const W=520,H=190,L=44,R=12,T=12,B=26;
  const ys=pts.map(p=>p[1]); let lo=Math.min(...ys), hi=Math.max(...ys); if(hi-lo<40){ const m=(hi+lo)/2; lo=m-20; hi=m+20 }
  const pad=(hi-lo)*0.1; lo=Math.floor((lo-pad)/10)*10; hi=Math.ceil((hi+pad)/10)*10;
  const X=i=>L+(W-L-R)*(pts.length>1?i/(pts.length-1):0), Y=v=>T+(H-T-B)*(1-(v-lo)/(hi-lo));
  const ticks=[lo,Math.round((lo+hi)/2/10)*10,hi];
  let g=ticks.map(v=>`<line x1="${L}" x2="${W-R}" y1="${Y(v)}" y2="${Y(v)}" class="grid"/><text x="${L-6}" y="${Y(v)+4}" class="axis" text-anchor="end">${v}</text>`).join('');
  g+=`<text x="${L}" y="${H-6}" class="axis">${fmtDay(pts[0][0])}</text><text x="${W-R}" y="${H-6}" class="axis" text-anchor="end">${fmtDay(pts[pts.length-1][0])}</text>`;
  const d=pts.map((p,i)=>(i?'L':'M')+X(i).toFixed(1)+' '+Y(p[1]).toFixed(1)).join(' ');
  const dots=pts.map((p,i)=>`<g class="pt"><circle cx="${X(i).toFixed(1)}" cy="${Y(p[1]).toFixed(1)}" r="9" class="hit"/><circle cx="${X(i).toFixed(1)}" cy="${Y(p[1]).toFixed(1)}" r="4" class="dot"/><title>${fmtDay(p[0])}: ${label} ${p[1]}</title></g>`).join('');
  const last=pts[pts.length-1];
  el.innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)} over time, from ${pts[0][1]} to ${last[1]}">${g}<path d="${d}" class="line"/>${dots}
    <text x="${X(pts.length-1)-6}" y="${Y(last[1])-10}" class="val" text-anchor="end">${last[1]}</text></svg>`;
}
function barChart(el,bars,{empty}){
  if(!bars.some(b=>b.n)){ el.innerHTML=`<p class="note">${esc(empty)}</p>`; return }
  const W=520,H=190,L=44,R=12,T=16,B=30, bw=(W-L-R)/bars.length;
  const Y=v=>T+(H-T-B)*(1-v);
  let g=[0,0.5,1].map(v=>`<line x1="${L}" x2="${W-R}" y1="${Y(v)}" y2="${Y(v)}" class="grid"/><text x="${L-6}" y="${Y(v)+4}" class="axis" text-anchor="end">${v*100}%</text>`).join('');
  bars.forEach((b,i)=>{ const x=L+i*bw+bw*0.22, w=bw*0.56;
    g+=`<text x="${x+w/2}" y="${H-10}" class="axis" text-anchor="middle">${esc(b.label)}</text>`;
    if(!b.n) return;
    const h=Math.max(2,(H-T-B)*b.v), y=Y(b.v), r=Math.min(4,h/2);
    g+=`<g class="pt"><path d="M${x} ${Y(0)} V${y+r} Q${x} ${y} ${x+r} ${y} H${x+w-r} Q${x+w} ${y} ${x+w} ${y+r} V${Y(0)} Z" class="bar"/>
      <text x="${x+w/2}" y="${y-5}" class="val" text-anchor="middle">${Math.round(b.v*100)}%</text><title>${esc(b.label)}: average ${Math.round(b.v*100)}% over ${b.n} exercise${b.n>1?'s':''}</title></g>` });
  el.innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Average Calculation score by exercise rating">${g}</svg>`;
}
/* activity: one cell per day, 12 weeks, one hue from light to dark by how many things you did */
function activity(el){
  const ts=[];
  for(const v of Object.values(Store.get('tactics-progress')||{})) if(v.t) ts.push(v.t);
  for(const v of Object.values(Store.get('adrills-progress')||{})) if(v.t) ts.push(v.t);
  for(const v of Object.values(Store.get('calc-progress')||{})) if(v.t) ts.push(v.t);
  for(const v of Object.values(Store.get('endgame-progress')||{})) if(v.t) ts.push(v.t);
  for(const o of OpeningsTab.openings()) for(const h of OpeningsTab.stats(o.id).history) ts.push(h.t);
  for(const g of Store.get('play-games')||[]) ts.push(g.t);
  const key=t=>{ const d=new Date(t); return d.getFullYear()*10000+(d.getMonth()+1)*100+d.getDate() };
  const cnt={}; for(const t of ts) cnt[key(t)]=(cnt[key(t)]||0)+1;
  const end=new Date(); end.setHours(0,0,0,0); const start=new Date(end); start.setDate(end.getDate()-end.getDay()-77);
  const C=16,G=3,L=30,T=4; let cells='', days=0, streak=0;
  for(let i=0;i<84;i++){ const d=new Date(start); d.setDate(start.getDate()+i); if(d>end) break;
    const n=cnt[key(d.getTime())]||0; if(n) days++;
    const lv=n===0?0:n<3?1:n<8?2:n<15?3:4;
    cells+=`<rect x="${L+Math.floor(i/7)*(C+G)}" y="${T+(i%7)*(C+G)}" width="${C}" height="${C}" rx="3" class="lv${lv}"><title>${fmtDay(d)}: ${n} item${n===1?'':'s'}</title></rect>` }
  for(let d=new Date(end);;d.setDate(d.getDate()-1)){ if(cnt[key(d.getTime())]) streak++; else if(d.getTime()!==end.getTime()) break; else continue }
  const W=L+12*(C+G), H=T+7*(C+G);
  const lab=['Sun','','Tue','','Thu','','Sat'].map((s,i)=>s?`<text x="0" y="${T+i*(C+G)+12}" class="axis" style="font-size:8.5px">${s}</text>`:'').join('');
  el.innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Days with practice in the last 12 weeks: ${days}" style="max-width:${Math.round(W*1.3)}px">${lab}${cells}</svg>
    <p class="note" style="margin:6px 0 0">${days} day${days===1?'':'s'} with practice · current streak ${streak} day${streak===1?'':'s'} · darker = more done (puzzles, drills, calculation, opening lines, games)</p>`;
}
function charts(withStats){
  const sel=$('p-op'); const cur=sel.value;
  const ops=withStats.filter(x=>x.st.history.length).sort((a,b)=>b.st.lines-a.st.lines);
  sel.innerHTML=ops.map(({o})=>`<option value="${esc(o.id)}">${esc(o.name)}</option>`).join('')||'<option value="">—</option>';
  if(ops.some(x=>x.o.id===cur)) sel.value=cur;
  const pick=ops.find(x=>x.o.id===sel.value);
  lineChart($('p-opchart'),pick?pick.st.history.map(h=>[h.t,h.r]):[],{empty:'Train a few lines in Rated mode to see your opening rating move.',label:'rating'});
  { const n=(rating().n||0); lineChart($('p-tacchart'),n>=TAC_MIN?(Store.get('tac-history')||[]).map(h=>[h.t,h.r]):[],{empty:`Solve ${TAC_MIN} puzzles (first try counts) to see your puzzle rating${n?` — ${n} so far`:''}.`,label:'puzzle rating'}) }
  const cp=Store.get('calc-progress')||{}, lib=(window.CalcTab&&CalcTab.lib)||[];
  const bands=[[0,2200,'Under 2200'],[2200,2400,'2200–2399'],[2400,2600,'2400–2599'],[2600,9999,'2600+']].map(([lo,hi,label])=>{
    const xs=lib.filter(z=>z.rating>=lo&&z.rating<hi&&cp[z.id]).map(z=>cp[z.id].score); return {label,n:xs.length,v:xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:0} });
  barChart($('p-calcchart'),bands,{empty:'Submit a few Calculation exercises to see how deep you see at each level.'});
  activity($('p-activity'));
}
function render(){
  const idx=(Store.get('reps-index')||[]).map(r=>({...r,rep:true}));
  const all=[...idx,...OpeningsTab.openings().filter(o=>!o.rep)];
  const withStats=all.map(o=>({o,st:OpeningsTab.stats(o.id)})).filter(x=>x.st.lines>0);
  const tac=Store.get('tac-rating')||{r:null,n:0};
  const tsolved=Object.values(Store.get('tactics-progress')||{}).filter(x=>x.ok).length;
  const dr=Store.get('adrills')||[]; const dp=Store.get('adrills-progress')||{};
  const eg=window.EndgamesTab?EndgamesTab.stats():{solved:0,total:0};
  $('p-stats').innerHTML=`
    <div class="stat"><b>${withStats.reduce((a,x)=>a+x.st.lines,0)}</b><span class="note">opening lines trained</span></div>
    <div class="stat"><b>${tac.n>=TAC_MIN?tac.r:'–'}</b><span class="note">puzzle rating (${tac.n>=TAC_MIN?Help.n(tac.n,'rated puzzle'):`after ${TAC_MIN} rated puzzles; ${tac.n} so far`})${Help.q('Elo against each puzzle’s Lichess rating, first try only. It shows once you have solved or missed '+TAC_MIN+' puzzles, so one lucky puzzle can’t set it.')}</span></div>
    <div class="stat"><b>${tsolved}</b><span class="note">${tsolved===1?'puzzle':'puzzles'} solved</span></div>
    <div class="stat"><b>${Object.values(dp).filter(x=>x.ok).length} / ${dr.length}</b><span class="note">game drills solved</span></div>
    <div class="stat"><b>${eg.solved} / ${eg.total||'–'}</b><span class="note">endgames solved</span></div>`;
  { const lines=withStats.reduce((a,x)=>a+x.st.lines,0), ds=Object.values(dp).filter(x=>x.ok).length;
    const parts=[lines?Help.n(lines,'opening line')+' trained':'',tsolved?Help.n(tsolved,'puzzle')+' solved':'',dr.length?`${ds} of ${Help.n(dr.length,'drill')} from your games solved`:'',eg.solved?`${eg.solved} of ${eg.total} endgames won or held`:''].filter(Boolean);
    $('p-lead').textContent=parts.length?`From this browser: ${parts.join(', ')}.${tac.n>=TAC_MIN?` Puzzle rating ${tac.r} after ${Help.n(tac.n,'rated puzzle')}.`:''}`
      :'Nothing here yet. Train an opening line, solve a few puzzles, or run Analyze my games: everything you do shows up on this page.' }
  const t=$('p-table');
  t.innerHTML='<tr><th>Opening</th><th>Side</th><th>Lines</th><th>Rating</th><th>Last trained</th></tr>'+(
    withStats.sort((a,b)=>b.st.lines-a.st.lines).map(({o,st})=>{
      const last=st.history.length?new Date(st.history[st.history.length-1].t).toISOString().slice(0,10):'—';
      return `<tr><td>${esc(o.name)}</td><td>${o.side}</td><td>${st.lines}</td><td>${st.rating}</td><td>${last}</td></tr>`;
    }).join('')||'<tr><td colspan="5" class="note">Nothing trained yet. Opening lines you play in Rated mode show up here.</td></tr>');
  charts(withStats);
}
function init(){
  $('p-op').addEventListener('change',()=>render());
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
