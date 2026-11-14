/* Chess Lab Open — the game view (#game?id=<game id>&ply=<move index>&from=<view>), 13 Nov 2026.
   Any game you analyzed (js/agames.js keeps them), opened at a move: from the report's games and costliest moments,
   a drill's or a blunder check's "The game", and Today through the Drills panel. Over-the-board PGN games too, which
   had nowhere to link before.
   ply = the index of a move in the game (0 = White's first): the board opens on the position before it, with that move
   marked in the list (the moment the link is about). ← → step, Home / End, F flips; the eval graph and every move are
   clickable. Your own moves carry the site's marks by the Win% they lost (?! 5+, ? 10+, ?? 15+ points: the drills'
   thresholds), the opponent's too. Evals from White's side, as everywhere. Nothing is stored here: this view only reads. */
'use strict';
(function(){
const SITE={lichess:'Lichess',chesscom:'Chess.com',pgn:'Your PGN file'};
const MODE={lichess:'Lichess server analysis',file:'evals in the file',standard:'Standard analysis (Stockfish, depth 11)',deep:'Deep analysis (Stockfish, depth 16)'};
const BACK={analyze:'Analyze my games',drills:'Drills',blundercheck:'Blunder check',today:'Today'};
const S={id:null,game:null,evs:null,fens:[],marks:[],p:0,focus:null,from:''};
let board=null;
const fmtW=v=>v==null||isNaN(v)?'—':Math.abs(v)>=50?(v>0?'+M':'−M'):(v>0?'+':v<0?'−':'')+Math.abs(v).toFixed(1);
const mover=i=>i%2===0?'w':'b';
const no=i=>`${Math.floor(i/2)+1}${i%2?'…':'.'}`;
const GLYPH={inacc:'?!',mist:'?',blun:'??'};
/* Win% before → after for the side that moved, worked out as the report and Drills show it (WinPct.change on the drop
   rounded to 0.01), so the same move reads the same everywhere */
const winText=(m,i)=>m.drop>0?WinPct.change(m.before,+m.drop.toFixed(2),mover(i)):`${Math.round(WinPct.side(m.before,mover(i)))}% → ${Math.round(WinPct.side(m.after,mover(i)))}%`;
const params=()=>new URLSearchParams(String(location.hash).split('?')[1]||'');

/* the game, its positions and the mark of every move (Win% lost by the side that moved, from White-side evals) */
function load(id){
  const rec=AGames.get(id); let game=rec?AGames.unpack(rec):null, evs=rec?AGames.evals(rec):null;
  if(!game&&window.AnalyzeTab&&AnalyzeTab.live){ const L=AnalyzeTab.live(id); if(L){ game=L.game; evs=L.evs } }
  if(!game) return false;
  const g=new Chess(), fens=[g.fen()], sans=[];
  for(const san of game.moves){ const m=g.move(san,{sloppy:true}); if(!m) break; sans.push(m.san); fens.push(g.fen()) }
  const marks=[]; let prev=0.2;
  for(let i=0;i<sans.length;i++){
    const cur=evs&&evs[i]!=null?evs[i]:null; if(cur==null){ marks.push(null); continue }
    const sgn=mover(i)==='w'?1:-1, drop=(wc(prev)-wc(cur))*sgn;
    const best=game.analysis&&game.analysis[i]&&game.analysis[i].best||(rec&&rec.best&&rec.best[i])||null;
    marks.push({before:prev,after:cur,drop,kind:drop>=0.3?'blun':drop>=0.2?'mist':drop>=0.1?'inacc':'',best,me:mover(i)===game.color});
    prev=cur }
  Object.assign(S,{id,game,evs,fens,sans,marks});
  return true;
}
/* saved drills and blunder checks of this game at a move (by their game link, or the same position and move) */
function savedAt(i){
  const hit=d=>d&&(d.g===S.id&&d.ply===i||!d.g&&d.fen===S.fens[i]&&d.played===S.sans[i]);
  return {drill:(Store.get('adrills')||[]).find(hit)||null,bc:(Store.get('abc')||[]).find(hit)||null};
}
function show(){
  const q=params(), id=q.get('id')||'', ply=q.get('ply');
  S.from=BACK[q.get('from')]?q.get('from'):'';
  $('gv-back').textContent='← '+(S.from?BACK[S.from]:'Analyze my games'); $('gv-back').href='#'+(S.from||'analyze');
  if(!id||!load(id)){ empty(); return }
  S.focus=ply!=null&&/^\d+$/.test(ply)&&+ply<S.sans.length?+ply:null;
  S.p=S.focus!=null?S.focus:0;
  $('gv-main').hidden=false; $('gv-empty').hidden=true;
  board.set(new Chess(S.fens[S.p]),{orient:S.game.color||'w',last:null,locked:true});
  head(); facts(); moves(); go(S.p,true);
}
function empty(){
  S.id=null; S.game=null; $('gv-main').hidden=true; $('gv-empty').hidden=false;
  $('gv-empty').innerHTML=`<h2>This game isn’t kept in this browser</h2><p class="note">Games are kept from your last run of <a href="#analyze">Analyze my games</a> and every game a saved drill or blunder check comes from. Analyze your games again (Stockfish’s evals are kept, so nothing is redone) and open it from the report.</p>`;
}
function head(){
  const g=S.game, opp=g.color==='w'?g.br:g.wr, res=g.result==='1/2-1/2'?'½–½':g.result==='1-0'?'1–0':'0–1';
  const sc=g.result==='1/2-1/2'?'Drawn':(g.result==='1-0')===(g.color==='w')?'Won':'Lost';
  $('gv-head').innerHTML=TV.head({kicker:`${esc(g.site==='pgn'?(g.file||SITE.pgn):SITE[g.site]||'')}${g.date?' · '+esc(g.date):''}${g.event?' · '+esc(g.event):''}`,
    title:`${esc(g.white)} – ${esc(g.black)}`,
    chips:[g.color==='w'?'You had White':'You had Black',`${sc} <span class="mono">${res}</span>`,opp>0?`Opponent <span class="mono">${esc(opp)}</span>`:'']});
  const url=g.url&&/^https:\/\/(www\.)?(lichess\.org|chess\.com)\//.test(g.url)?g.url:'';
  $('gv-ext').hidden=!url; if(url){ $('gv-ext').href=url; $('gv-ext').innerHTML=(/lichess/.test(url)?'Lichess':'Chess.com')+' game &#8599;' }
}
function facts(){
  const g=S.game, r=(n,v)=>v?`<dt>${n}</dt><dd>${v}</dd>`:'';
  const pl=(n,e)=>`${esc(n)}${e>0?` <span class="note mono">${esc(e)}</span>`:''}`;
  const sp={blitz:'Blitz',rapid:'Rapid',classical:'Classical',correspondence:'Correspondence'}[g.speed]||g.speed||'';
  $('gv-facts').innerHTML=r('White',pl(g.white,g.wr))+r('Black',pl(g.black,g.br))+r('Result',esc(g.result||''))+r('Date',esc(g.date||''))+r('Event',esc(g.event||''))+
    r('Time control',esc(sp))+r('Rating system',g.sys&&window.Perf&&Perf.LABEL[g.sys]?esc(Perf.LABEL[g.sys]):'')+r('From',esc(g.site==='pgn'?(g.file||'a PGN file'):SITE[g.site]||''))+
    r('Evals',S.evs?esc(MODE[g.evsrc]||'stored'):'none kept (analyze the game again)');
}
function moves(){
  let h='';
  S.sans.forEach((san,i)=>{ const m=S.marks[i], cls=['gmv'];
    if(m&&m.kind) cls.push(m.kind==='inacc'?'inacc':'miss'); if(m&&m.me) cls.push('gvme'); if(i===S.focus) cls.push('gvfocus');
    if(i%2===0||i===0) h+=`<span class="gvno">${no(i)}</span>`;
    h+=`<button type="button" class="${cls.join(' ')}" data-ply="${i+1}" title="${m?`${m.me?'You':'Opponent'}: Win% ${winText(m,i)} (${fmtW(m.after)})`:''}">${esc(san)}${m&&m.kind?markHtml(GLYPH[m.kind]):''}</button> ` });
  $('gv-moves').innerHTML=h||'<p class="note">No moves.</p>';
}
/* the position after p moves */
function go(p,first){
  p=Math.max(0,Math.min(S.sans.length,p)); if(p===S.p&&!first) return; S.p=p;
  const g=new Chess(S.fens[p]); let last=null;
  if(p>0){ const t=new Chess(S.fens[p-1]), m=t.move(S.sans[p-1],{sloppy:true}); if(m) last={from:m.from,to:m.to} }
  board.set(g,{last,locked:true});
  for(const b of document.querySelectorAll('#gv-moves .gmv')) b.classList.toggle('cur',+b.dataset.ply===p);
  const c=document.querySelector('#gv-moves .gmv.cur'), L=$('gv-moves');
  if(c&&L){ const top=c.offsetTop-L.offsetTop; if(top<L.scrollTop||top>L.scrollTop+L.clientHeight-28) L.scrollTop=Math.max(0,top-L.clientHeight/3) }
  status(); actions(); graph();
  $('gv-lichess').href='https://lichess.org/analysis/'+encodeURIComponent(S.fens[p].replace(/ /g,'_'))+'?color='+(S.game.color==='b'?'black':'white');
  $('gv-prev').disabled=p===0; $('gv-next').disabled=p===S.sans.length;
}
function moveText(i){ const m=S.marks[i], who=mover(i)===S.game.color?'you':'your opponent';
  if(!m) return `${no(i)}${esc(S.sans[i])} (${who})`;
  return `<b class="mono">${no(i)}${esc(S.sans[i])}${m.kind?GLYPH[m.kind]:''}</b> (${who}): Win% ${winText(m,i)}${m.kind?` · ${WinPct.judge(50*m.drop)}`:''}${m.kind&&m.best?` · Stockfish preferred <b class="mono">${esc(sanOf(S.fens[i],m.best))}</b>`:''}`;
}
function status(){
  const p=S.p, el=$('gv-status'), ev=p>0&&S.evs&&S.evs[p-1]!=null?S.evs[p-1]:null;
  let h;
  if(S.focus!=null&&p===S.focus) h=`<strong>The moment: move ${no(p)}</strong>In the game: ${moveText(p)}. → plays it.`;
  else if(p===0) h=`<strong>Start of the game.</strong>→ steps through the moves; tap any move or the graph.`;
  else h=`<strong>After ${no(p-1)}${esc(S.sans[p-1])}</strong>${moveText(p-1)}.`;
  const m=S.focus!=null&&p===S.focus?S.marks[p]:p>0?S.marks[p-1]:null;
  el.className='status'+(m&&m.kind==='blun'||m&&m.kind==='mist'?' bad':m&&m.kind==='inacc'?' warn':'');
  el.innerHTML=h+(ev!=null?` <span class="note">Eval ${fmtW(ev)} (White’s side).</span>`:'');
}
function actions(){
  const at=S.p<S.sans.length?savedAt(S.p):{drill:null,bc:null}, el=$('gv-actions'), b=[];
  if(at.drill) b.push(`<button type="button" class="btn sm primary" data-gvdrill="${esc(at.drill.id)}">Train this drill</button>`);
  if(at.bc) b.push(`<button type="button" class="btn sm${at.drill?'':' primary'}" data-gvbc="${esc(at.bc.id)}">Blunder check this</button>`);
  el.innerHTML=b.length?`<p class="note" style="margin:0 0 6px">${at.drill&&at.bc?'This position is a saved drill and a blunder check.':at.drill?'This position is a saved drill.':'This position is a saved blunder check.'}</p><div class="btns">${b.join('')}</div>`:'';
  el.hidden=!b.length;
}
/* eval graph: winning chances from White's side (the kit's -1..1), your marked moves as dots, the current move as a line */
function graph(){
  const ev=S.evs, card=$('gv-graphcard'); if(!ev||!ev.length){ card.hidden=true; return } card.hidden=false;
  const n=Math.min(ev.length,S.sans.length), W=320,H=120,P=6;
  const X=i=>P+(W-2*P)*(n>1?i/(n-1):0), Y=v=>H/2-(H/2-P)*v, c=i=>wc(ev[i]||0);
  const pts=[]; for(let i=0;i<n;i++) pts.push([X(i),Y(c(i))]);
  const line=pts.map((p,i)=>(i?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1)).join(' ');
  const area=`M${X(0)} ${H/2} `+pts.map(p=>'L'+p[0].toFixed(1)+' '+p[1].toFixed(1)).join(' ')+` L${X(n-1)} ${H/2} Z`;
  let dots=''; for(let i=0;i<n;i++){ const m=S.marks[i]; if(!m||!m.kind||!m.me) continue;
    dots+=`<circle cx="${X(i).toFixed(1)}" cy="${Y(c(i)).toFixed(1)}" r="${m.kind==='blun'?4:3}" fill="${m.kind==='inacc'?'var(--warn)':'var(--bad)'}" stroke="var(--white)" stroke-width="1"><title>${no(i)}${esc(S.sans[i])}${GLYPH[m.kind]} (${fmtW(ev[i])})</title></circle>` }
  const cur=S.p>0&&S.p-1<n?`<line x1="${X(S.p-1).toFixed(1)}" x2="${X(S.p-1).toFixed(1)}" y1="${P}" y2="${H-P}" stroke="var(--head)" stroke-width="1.4" stroke-dasharray="3 2"/>`:'';
  $('gv-graph').innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Evaluation through the game, White's side; tap to go to a move" data-n="${n}">
    <rect x="0" y="0" width="${W}" height="${H}" fill="var(--white)"/><path d="${area}" fill="var(--callout)"/>
    <line x1="${P}" y1="${H/2}" x2="${W-P}" y2="${H/2}" stroke="var(--line)" stroke-width="1"/>
    <path d="${line}" fill="none" stroke="var(--chart)" stroke-width="1.6" vector-effect="non-scaling-stroke"/>${cur}${dots}</svg>`;
}
function init(){
  board=makeBoard($('gv-board'),{});
  board.set(new Chess(),{locked:true});
  TV.fitBoard('#gv-wrap','#gv-tools');
  $('gv-moves').addEventListener('click',e=>{ const b=e.target.closest('[data-ply]'); if(b) go(+b.dataset.ply) });
  $('gv-graph').addEventListener('click',e=>{ const sv=$('gv-graph').querySelector('svg'); if(!sv) return; const r=sv.getBoundingClientRect(), n=+sv.dataset.n||0; if(!r.width||n<1) return;
    const f=Math.max(0,Math.min(1,(e.clientX-r.left-r.width*6/320)/(r.width*(1-12/320)))); go(Math.round(f*(n-1))+1) });
  $('gv-prev').addEventListener('click',()=>go(S.p-1)); $('gv-next').addEventListener('click',()=>go(S.p+1));
  $('gv-start').addEventListener('click',()=>go(0)); $('gv-end').addEventListener('click',()=>go(S.sans.length));
  $('gv-flip').addEventListener('click',()=>board.flip());
  $('gv-actions').addEventListener('click',e=>{
    const d=e.target.closest('[data-gvdrill]'); if(d){ const x=(Store.get('adrills')||[]).find(y=>y.id===d.dataset.gvdrill); location.hash='#drills'; if(x) setTimeout(()=>DrillsTab.load(x),30); return }
    const k=e.target.closest('[data-gvbc]'); if(k){ const id=k.dataset.gvbc; location.hash='#blundercheck'; setTimeout(()=>BlunderCheckTab.open(id),30) } });
  const on=()=>!!S.game;
  Keys.on('game',{ArrowLeft:['Previous move',()=>{ if(!on()) return false; go(S.p-1) }],ArrowRight:['Next move',()=>{ if(!on()) return false; go(S.p+1) }],
    Home:['Start of the game',()=>{ if(!on()) return false; go(0) }],End:['End of the game',()=>{ if(!on()) return false; go(S.sans.length) }],
    f:['Flip the board',()=>board.flip()]});
}
window.GameView={init,show,go,get state(){ return S }};
})();
