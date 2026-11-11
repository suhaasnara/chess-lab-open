/* Chess Lab Open — a loaded Chess Lab pack on Progress: what it holds, and its report card.
   The report card is the private Chess Lab's (lib/report.py's views, laid out as its Progress tab does: tiles, then
   tables by opponent rating, opening, game type, year and quarter), from the friend's own games. Over the board / Online /
   Combined and the period switch show only when the pack has those views. Evals from White's side, as everywhere. */
'use strict';
(function(){
const pct=v=>v==null?'—':Math.round(v)+'%';
const MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const RV=()=>Object.assign({src:'otb',period:'since'},Store.get('pack-view')||{});
const SRC={otb:'Over the board',online:'Online',all:'Combined'};
const sinceText=s=>{ const m=String(s||'').match(/^(\d{4})\.(\d\d)/); return m?`Since ${MON[+m[2]-1]} ${m[1]}`:'Recent' };

/* the views the pack has, and the one to show (the saved choice when the pack has it) */
function pickView(rep){
  const V=rep.views||{}, has=k=>!!(V[k]&&V[k].overall&&V[k].overall.games);
  const srcs=['otb','online','all'].filter(s=>has(s+'|all')||has(s+'|since'));
  const v=RV(); let src=srcs.includes(v.src)?v.src:(srcs.includes('all')&&srcs.includes('otb')?'otb':srcs[0]);
  /* only one source (all online, say): Combined repeats it, so show just that one */
  const real=srcs.filter(s=>s!=='all'); if(real.length===1) src=real[0];
  const pers=['since','all'].filter(p=>has(src+'|'+p));
  const per=pers.includes(v.period)?v.period:pers[pers.length-1];
  return {src,per,srcs:real.length>1?srcs:[],pers:pers.length>1?pers:[],R:V[src+'|'+per]};
}
function render(){
  const P=Store.pack(), card=$('p-pack'), el=$('p-report'); if(!card||!el) return;
  if(!P){ card.hidden=true; el.hidden=true; card.innerHTML=''; el.innerHTML=''; return }
  const m=P.meta||{}, who=P.player&&P.player.name||'you', drills=(Store.get('adrills')||[]).filter(d=>d.pack), dp=Store.get('adrills-progress')||{};
  const bc=P.bc||[], bres=(Store.get('bc-progress')||{});
  const span=m.oldest&&m.newest?` from ${esc(m.oldest)} to ${esc(m.newest)}`:'';
  const games=m.games?`${m.games} games${m.rapid!=null?` (${m.rapid} rapid, ${m.blitz} blitz)`:''}${span}`:'';
  card.hidden=false;
  card.innerHTML=`<div class="rhead"><span class="label">Chess Lab pack · ${esc(who)}</span><span class="note">built ${esc(m.built||'')}${m.loaded?` · loaded ${esc(m.loaded.slice(0,10))}`:''}</span></div>
    <p class="note" style="margin:4px 0 8px">Analysed by the private Chess Lab kit${games?` from ${games}`:''}: drills checked by Stockfish at depth 22, a Blunder check and a report card. Load a newer pack any time: it merges in and keeps your results.</p>
    <div class="stats packstats">
      <div class="stat"><b>${drills.filter(d=>dp[d.id]&&dp[d.id].ok).length} / ${drills.length}</b><span class="note">pack drills solved (in <a href="#drills">Drills</a> and <a href="#today">Today</a>)</span></div>
      <div class="stat"><b>${bc.filter(d=>bres[d.id]&&bres[d.id].ok).length} / ${bc.length}</b><span class="note">blunder checks passed (<a href="#blundercheck">Blunder check</a>)</span></div>
    </div>
    <div class="btns"><a class="btn sm" href="#blundercheck">Blunder check</a><a class="btn sm" href="#drills">Drills</a><button type="button" class="btn sm" id="p-packrm" title="Takes the pack's report card and Blunder check positions off this browser, and its drills you haven't tried. Your results stay.">Remove the pack</button></div>`;
  const rep=P.report;
  if(!rep||!rep.views){ el.hidden=true; el.innerHTML=''; return }
  const {src,per,srcs,pers,R}=pickView(rep);
  if(!R||!R.overall||!R.overall.games){ el.hidden=true; return }
  el.hidden=false;
  const o=R.overall;
  const tone=(v,base,n)=>v==null||base==null||n<8?'':v<=base-10?'tbad':v>=base+10?'tgood':'';
  const head=first=>`<thead><tr><th>${first}</th><th class="num">Games</th><th class="num">W / D / L</th><th class="num">Score</th><th class="num">Won from +2</th><th class="num">Held from −2</th></tr></thead>`;
  const row=(name,s)=>`<tr><td>${name}</td><td class="num" data-l="Games">${s.games}</td><td class="num note" data-l="W / D / L">${s.wins} / ${s.draws} / ${s.losses}</td><td class="num ${tone(s.score,o.score,s.games)}" data-l="Score">${pct(s.score)}</td>
    <td class="num ${tone(s.conversion,o.conversion,s.convN)}" data-l="Won from +2">${s.convN?`${pct(s.conversion)} <span class="note">of ${s.convN}</span>`:'—'}</td>
    <td class="num ${tone(s.saveRate,o.saveRate,s.saveN)}" data-l="Held from −2">${s.saveN?`${pct(s.saveRate)} <span class="note">of ${s.saveN}</span>`:'—'}</td></tr>`;
  const table=(title,first,entries)=>entries.length?`<h3>${title}</h3><div class="tablewrap"><table class="rtable">${head(first)}<tbody>${entries.map(([k,s])=>row(esc(k),s)).join('')}</tbody></table></div>`:'';
  const tile=(b,l)=>`<div class="stat"><b>${b}</b><span class="note">${l}</span></div>`;
  const ev=v=>v==null?'—':(v>0?'+':v<0?'−':'')+Math.abs(v).toFixed(2);
  const seg=(k,opts,cur)=>`<span class="seg mini" role="group">${opts.map(([v,l])=>`<button type="button" data-prv="${k}" data-v="${v}" aria-pressed="${cur===v}">${l}</button>`).join('')}</span>`;
  const bar=(srcs.length?seg('src',srcs.map(s=>[s,SRC[s]]),src):'')+(pers.length?seg('period',[['since',sinceText(rep.since)],['all','All time']],per):'');
  const scope=src==='otb'?'over-the-board games':src==='online'?'online games (rapid and blitz)':'games, over the board and online';
  const when=per==='since'?` ${sinceText(rep.since).replace(/^Since/,'since')}`:'';
  const dropped=o.convN-o.convWon-0.5*(o.convDrawn||0);
  const strong=src!=='online'&&R.vs2200otb&&R.vs2200otb.games?R.vs2200otb:null;
  const bands=['Under 1800','1800–1999','2000–2199','2200+'].filter(k=>R.byBand&&R.byBand[k]).map(k=>[k,R.byBand[k]]);
  const years=Object.entries(R.byYear||{}), quarters=Object.entries(R.byQuarter||{}).slice(-8);
  const drillBtn=s=>s.line&&s.line.length?`<button type="button" class="btn sm" data-pdrill="${esc(JSON.stringify({name:s.family+' as '+(s.side==='white'?'White':'Black'),side:s.side,moves:s.line}))}" title="${esc(s.line.join(' '))}">Drill this</button>`:'';
  const openTable=R.openings&&R.openings.length?`<h3>By opening</h3><div class="tablewrap"><table class="rtable"><thead><tr><th>Opening</th><th>Side</th><th class="num">Games</th><th class="num">Score</th><th class="num">Eval after move 12</th><th class="num">Won from +2</th><th class="num">Held from −2</th><th></th></tr></thead><tbody>${R.openings.map(s=>`<tr><td>${esc(s.family)}</td><td class="note" data-l="Side">${s.side==='white'?'White':'Black'}</td><td class="num" data-l="Games">${s.games}</td><td class="num ${tone(s.score,o.score,s.games)}" data-l="Score">${pct(s.score)}</td><td class="num mono ${s.ev12==null?'':(s.side==='black'?-s.ev12:s.ev12)<=-0.4?'tbad':(s.side==='black'?-s.ev12:s.ev12)>=0.4?'tgood':''}" data-l="Eval after 12">${ev(s.ev12==null?null:s.side==='black'?-s.ev12:s.ev12)}</td><td class="num" data-l="Won from +2">${s.convN?`${pct(s.conversion)} <span class="note">of ${s.convN}</span>`:'—'}</td><td class="num" data-l="Held from −2">${s.saveN?`${pct(s.saveRate)} <span class="note">of ${s.saveN}</span>`:'—'}</td><td>${drillBtn(s)}</td></tr>`).join('')}</tbody></table></div><p class="note">"Drill this" opens the line reached most often in those games in the opening trainer (saved under Mine).</p>`:'';
  const lead=`From ${o.games} ${scope}${when}, bullet excluded. ${o.convN?`You reached +2 in ${o.convN} and won ${o.convWon}; the ${o.convN-o.convWon} that got away cost about ${dropped%1?dropped.toFixed(1):dropped} point${dropped===1?'':'s'}.`:''} ${o.saveN?`You fell to −2 in ${o.saveN} and saved ${o.saveHeld}.`:''}`;
  const tiles=`<div class="stats">${tile(pct(o.conversion),`Conversion · won ${o.convWon} of ${o.convN} after reaching +2`)}${tile(pct(o.saveRate),`Save rate · drew or won ${o.saveHeld} of ${o.saveN} after −2`)}${tile(pct(o.score),`Score · ${o.wins} W, ${o.draws} D, ${o.losses} L`)}${strong?tile(pct(strong.score),`vs 2200+ over the board · ${strong.games} games`):''}</div>`;
  const body=table('By opponent rating','Opponent',bands)+openTable+(src!=='otb'?table('By game type','Game type',Object.entries(R.bySpeed||{}).sort((a,b)=>b[1].games-a[1].games)):'')
    +(years.length>1?table('By year','Year',years):'')+(quarters.length>1?table('By quarter','Quarter',quarters):'');
  el.innerHTML=`<div class="rhead"><h2>Report card</h2><div class="rbar">${bar}</div></div>
    <p class="lead note">${lead}</p>${tiles}${body}
    <p class="note repfoot"><b>How these are counted.</b> "Won from +2": games where Stockfish had you at +2.0 or better for two positions in a row, and the share of those you won. "Held from −2": games where you were at −2.0 or worse for two positions in a row, and the share you drew or won. "Eval after move 12" is from White's side like every eval here (+ favours White; green = good for you, red = bad), averaged over the games with each game capped at ±3; it shows how the opening went. Opponent rating is the rating in the game. Evals from Stockfish 18 at depth 11 or deeper. Green and red mark figures at least 10 points above or below the overall number, on 8 or more games. By year and by quarter: periods with 5 or more games.</p>`;
}
function remove(){
  const dp=Store.get('adrills-progress')||{};
  Store.put('adrills',(Store.get('adrills')||[]).filter(d=>!d.pack||dp[d.id]));
  for(const k of Store.PACK_KEYS) Store.del(k);
  if(window.DrillsTab) DrillsTab.refresh();
  if(window.BlunderCheckTab) BlunderCheckTab.refresh();
  if(window.ProgressTab) ProgressTab.render();
}
function init(){
  document.addEventListener('click',e=>{
    const b=e.target.closest('[data-prv]');
    if(b&&b.closest('#p-report')){ const v=RV(); v[b.dataset.prv]=b.dataset.v; Store.put('pack-view',v); render(); return }
    const d=e.target.closest('[data-pdrill]');
    if(d){ const x=JSON.parse(d.dataset.pdrill); const have=OpeningsTab.customs().find(c=>c.name===x.name&&c.side===x.side&&(c.moves||[]).join(' ')===x.moves.join(' '));
      const id=have?have.id:OpeningsTab.saveCustom(x); location.hash='#openings'; setTimeout(()=>{ OpeningsTab.renderList(); OpeningsTab.selectOpening(id) },60); return }
    if(e.target.closest('#p-packrm')) remove();
  });
}
window.PackReport={init,render,remove,pickView};
})();
