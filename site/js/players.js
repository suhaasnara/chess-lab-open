/* Chess Lab Open — Players: what an opponent plays, from their public online games.
   Type a Lichess or Chess.com username: their recent games are fetched by your browser from the public API
   (no account, nothing uploaded) and kept on this device. You get what they play with each colour, an explorer of
   their moves, "Train vs" in the opening trainer (the opponent plays their moves while their games go, then the
   book) and a printable pre-round sheet. */
'use strict';
(function(){
const MAX_GAMES=200, PLIES=30;
const S={pid:null,color:'w',line:[],board:null,sheet:false,busy:false};
const index=()=>Store.get('players-index')||[];
const pdata=id=>Store.get('player-'+id);
const TREES=new Map();
const SPEEDS=[['bullet','Bullet'],['blitz','Blitz'],['rapid','Rapid'],['classical','Classical']];

/* ---------- Fetching (public APIs, in your browser) ---------- */
async function fetchLichess(user,speeds){
  const url=`https://lichess.org/api/games/user/${encodeURIComponent(user)}?max=${MAX_GAMES}&moves=true&perfType=${speeds.join(',')}`;
  const r=await fetch(url,{headers:{Accept:'application/x-ndjson'}});
  if(r.status===404) throw new Error('No such Lichess user.');
  if(r.status===429) throw new Error('Lichess asks to wait a minute (too many requests). Try again shortly.');
  if(!r.ok) throw new Error('Lichess answered '+r.status+'.');
  const out=[]; let name=user;
  for(const line of (await r.text()).split('\n')){ if(!line.trim()) continue; let j; try{ j=JSON.parse(line) }catch(e){ continue }
    if(j.variant&&j.variant!=='standard'||j.initialFen) continue;
    const wn=j.players.white.user?j.players.white.user.name:'', bn=j.players.black.user?j.players.black.user.name:'';
    const c=wn.toLowerCase()===user.toLowerCase()?'w':bn.toLowerCase()===user.toLowerCase()?'b':null; if(!c) continue; name=c==='w'?wn:bn;
    if(['aborted','noStart','created','started'].includes(j.status)) continue;
    const sc=j.winner?((j.winner==='white')===(c==='w')?1:0):0.5;
    const ms=(j.moves||'').split(' ').filter(Boolean).slice(0,PLIES); if(ms.length<4) continue;
    out.push({d:new Date(j.createdAt).toISOString().slice(0,10),c,r:sc,m:ms.join(' '),o:c==='w'?bn||'Anonymous':wn||'Anonymous',or:c==='w'?j.players.black.rating:j.players.white.rating,sp:j.speed,url:'https://lichess.org/'+j.id}) }
  return {name,games:out};
}
async function fetchChesscom(user,speeds){
  const base=`https://api.chess.com/pub/player/${encodeURIComponent(user.toLowerCase())}`;
  const ar=await fetch(base+'/games/archives');
  if(ar.status===404) throw new Error('No such Chess.com user.');
  if(!ar.ok) throw new Error('Chess.com answered '+ar.status+'.');
  const archives=(await ar.json()).archives||[]; const out=[]; let name=user;
  const want=new Set(speeds.map(s=>s==='classical'?'daily':s));   /* Chess.com has no classical pool: its long games are rapid/daily */
  for(const u of archives.slice(-12).reverse()){
    const r=await fetch(u); if(!r.ok) continue;
    for(const j of ((await r.json()).games||[]).reverse()){
      if(j.rules!=='chess'||!want.has(j.time_class)||/\[SetUp "1"\]/.test(j.pgn||'')) continue;
      const c=j.white.username.toLowerCase()===user.toLowerCase()?'w':'b'; name=c==='w'?j.white.username:j.black.username;
      const me=c==='w'?j.white:j.black; const sc=me.result==='win'?1:['agreed','repetition','stalemate','insufficient','50move','timevsinsufficient'].includes(me.result)?0.5:0;
      const ms=pgnMoves(j.pgn||'').slice(0,PLIES); if(ms.length<4) continue;
      out.push({d:new Date(j.end_time*1000).toISOString().slice(0,10),c,r:sc,m:ms.join(' '),o:c==='w'?j.black.username:j.white.username,or:c==='w'?j.black.rating:j.white.rating,sp:j.time_class,url:j.url});
      if(out.length>=MAX_GAMES) break }
    if(out.length>=MAX_GAMES) break }
  return {name,games:out};
}
function pgnMoves(pgn){ const g=new Chess(), out=[];
  const body=pgn.replace(/\{[^}]*\}/g,' ').replace(/\[[^\]]*\]\s*/g,'').replace(/\([^()]*\)/g,' ').replace(/\$\d+/g,' ').replace(/\d+\.\.\./g,'');
  for(const t of body.match(/\S+/g)||[]){ if(/^(1-0|0-1|1\/2-1\/2|\*)$/.test(t)) continue; const san=t.replace(/^\d+\.+/,''); if(!san) continue;
    const m=g.move(san,{sloppy:true}); if(!m) break; out.push(m.san); if(out.length>=PLIES) break } return out }
async function addPlayer(site,user,speeds){
  user=String(user||'').trim().replace(/^@/,''); if(!/^[\w-]{2,30}$/.test(user)) throw new Error('That is not a username.');
  if(!speeds.length) throw new Error('Pick at least one time control.');
  const f=site==='chesscom'?await fetchChesscom(user,speeds):await fetchLichess(user,speeds);
  if(!f.games.length) throw new Error('No standard games in those time controls.');
  const id=(site==='chesscom'?'cc-':'li-')+user.toLowerCase();
  const p={id,site,user,name:f.name,t:Date.now(),speeds,games:f.games};
  Store.put('player-'+id,p); if(!Store.get('player-'+id)) throw new Error('This browser has no room left to keep these games.');
  const idx=index().filter(x=>x.id!==id); idx.unshift({id,site,user,name:f.name,n:f.games.length,t:p.t}); Store.put('players-index',idx);
  TREES.delete(id); return p;
}

/* ---------- Their tree: every position from their games with that colour (first 30 plies) ---------- */
/* tree.get(posId) = {n: games through here, mv: {uci: {n, s, san, me}}}; me = the player made this move; s = their score sum */
function tree(id,color){
  const k=id+'|'+color; if(TREES.has(k)) return TREES.get(k);
  const p=pdata(id), t=new Map(); if(!p){ TREES.set(k,t); return t }
  for(const g of p.games){ if(g.c!==color) continue; const c=new Chess();
    for(const san of g.m.split(' ')){ const key=posId(normKey(c.fen())); const turn=c.turn(); const m=c.move(san); if(!m) break;
      const e=t.get(key)||{n:0,mv:{}}; e.n++; const u=m.from+m.to+(m.promotion||''); const x=e.mv[u]||(e.mv[u]={n:0,s:0,c:0,san:m.san,me:turn===color});
      x.n++; if(g.r!=null){ x.s+=g.r; x.c++ } t.set(key,e) } }
  TREES.set(k,t); return t;
}
/* their moves at fen (they are `color`): [{uci,san,n,score}] most played first */
function movesAt(id,color,fen){ const e=tree(id,color).get(posId(normKey(fen))); if(!e) return [];
  return Object.entries(e.mv).map(([uci,x])=>({uci,san:x.san,n:x.n,score:x.c?x.s/x.c:null,me:x.me})).sort((a,b)=>b.n-a.n) }
function record(p,color){ let w=0,d=0,l=0; for(const g of p.games) if(!color||g.c===color){ if(g.r===1) w++; else if(g.r===0.5) d++; else if(g.r===0) l++ } return {w,d,l,n:w+d+l} }
const pct=r=>r.n?Math.round(100*(r.w+r.d/2)/r.n)+'%':'—';
const lineText=(ms,from=0)=>ms.map((m,i)=>{ const ply=i+from; return (ply%2===0?(ply/2+1)+'.':i===0?Math.ceil(ply/2)+'…':'')+m }).join(' ');

/* ---------- The line to expect (pre-round sheet) ----------
   From the start: at their turn their most played move; at yours the move from your imported repertoire for that
   colour that leads into most of their games, else what their opponents played most. Stops where they have fewer
   than 2 games. Each move says where it came from. */
function myRepMoves(fen,myColor){ if(!window.OpeningsTab) return []; const out=new Set();
  for(const r of (Store.get('reps-index')||[])){ if((r.side==='white'?'w':'b')!==myColor) continue; const d=Store.get('rep-'+r.id); const ms=d&&d.pos&&d.pos[posId(normKey(fen))]; if(ms) ms.split(' ').forEach(u=>out.add(u)) }
  return [...out] }
function expectLine(id,theirColor){
  const me=theirColor==='w'?'b':'w', c=new Chess(), out=[];
  for(let ply=0;ply<20;ply++){ const fen=c.fen(), here=movesAt(id,theirColor,fen); const tot=here.reduce((a,x)=>a+x.n,0); let pick=null;
    if(c.turn()===theirColor){ if(tot<2) break; const x=here[0]; pick={san:x.san,src:'they',n:x.n,tot} }
    else { const rep=myRepMoves(fen,me); const inRep=here.filter(x=>rep.some(u=>u.slice(0,4)===x.uci.slice(0,4)));
      if(inRep.length) pick={san:inRep[0].san,src:'prep',n:inRep[0].n,tot};
      else if(rep.length&&tot<2){ pick={san:sanOf(fen,rep[0]),src:'prep',n:0,tot} }
      else if(here.length&&tot>=2) pick={san:here[0].san,src:'opp',n:here[0].n,tot}; else break }
    if(!pick||!c.move(pick.san)) break; out.push(pick) }
  while(out.length&&out[out.length-1].src!=='they') out.pop();
  return out;
}
function firstMoves(id,color){ const p=pdata(id); const o={};
  for(const g of p.games){ if(g.c!==color) continue; const ms=g.m.split(' '); const k=color==='w'?ms[0]:ms[0]+' '+ms[1]; const r=o[k]||(o[k]={n:0,s:0,c:0}); r.n++; if(g.r!=null){ r.s+=g.r; r.c++ } }
  return Object.entries(o).sort((a,b)=>b[1].n-a[1].n) }

/* ---------- Rendering ---------- */
function renderList(){
  const el=$('p-list'), idx=index();
  el.innerHTML=idx.length?idx.map(x=>`<button class="drill" data-pid="${esc(x.id)}" aria-current="${S.pid===x.id}"><span class="src">${x.site==='chesscom'?'C.com':'Lichess'}</span><span><span class="opp">${esc(x.name)}</span><br><span class="meta">${x.n} games · fetched ${new Date(x.t).toISOString().slice(0,10)}</span></span><span class="evalchip">&#9654;</span></button>`).join('')
    :'<p class="empty">No players yet. Type an opponent’s username above. Their public games are fetched by your browser and kept only on this device.</p>';
}
function render(){
  renderList();
  const v=$('p-view'), sh=$('p-sheet'); sh.hidden=!S.sheet; v.hidden=S.sheet;
  const p=S.pid&&pdata(S.pid);
  if(!p){ v.innerHTML='<div class="card"><span class="label">Players</span><h2>Scout an opponent</h2><p class="note">Add a player to see what they play with White and Black, browse their moves on a board, train against their openings and print a pre-round sheet.</p></div>'; if(S.board) S.board=null; return }
  if(S.sheet){ sh.innerHTML=sheetHtml(p); return }
  const rw=record(p,'w'), rb=record(p,'b'), col=S.color;
  const fm=(c)=>firstMoves(p.id,c).slice(0,6).map(([k,r])=>`<b>${esc(c==='w'?'1.'+k:'1.'+k.replace(' ',' '))}</b> ${r.n}${r.c?` <span class="note">(${Math.round(100*r.s/r.c)}%)</span>`:''}`).join(' · ')||'<span class="note">none</span>';
  v.innerHTML=`<div class="card"><div class="phead"><div><span class="label">${p.site==='chesscom'?'Chess.com':'Lichess'} · ${p.games.length} games${p.speeds?' · '+p.speeds.join(', '):''}</span>
      <h2 style="margin:4px 0 2px"><a href="${p.site==='chesscom'?'https://www.chess.com/member/':'https://lichess.org/@/'}${esc(encodeURIComponent(p.user))}" target="_blank" rel="noopener">${esc(p.name)}</a></h2>
      <p class="note" style="margin:0">As White ${rw.w}–${rw.l}${rw.d?' ='+rw.d:''} (${pct(rw)}) · as Black ${rb.w}–${rb.l}${rb.d?' ='+rb.d:''} (${pct(rb)}) · ${esc(p.games[p.games.length-1].d)} to ${esc(p.games[0].d)}</p></div>
      <div class="btns"><button class="btn sm primary" data-act="sheet">Pre-round sheet</button><button class="btn sm" data-act="refresh">Refresh games</button><button class="btn sm" data-act="remove">Remove</button></div></div>
      <div class="row2" style="margin-top:10px"><div><span class="label">As White they open</span><p class="ptxt">${fm('w')}</p></div><div><span class="label">As Black they answer</span><p class="ptxt">${fm('b')}</p></div></div>
      <div class="btns"><button class="btn sm" data-train="w">Train vs ${esc(p.name)}: you have White</button><button class="btn sm" data-train="b">You have Black</button></div></div>
    <div class="panel" style="margin-top:12px"><div class="boardwrap"><div class="board" id="p-board" role="group" aria-label="Their moves on a board"></div>
      <div class="boardtools"><div class="seg" role="group" aria-label="Their colour"><button data-col="w" aria-pressed="${col==='w'}">Their White games</button><button data-col="b" aria-pressed="${col==='b'}">Their Black games</button></div>
      <button class="btn sm" data-act="start" aria-label="Start">⏮</button><button class="btn sm" data-act="back" aria-label="Back">◀</button><button class="btn sm" data-act="flip">Flip</button></div></div>
      <div class="side"><div class="card"><span class="label">Position</span><p class="mono" id="p-line" style="margin:6px 0 0"></p></div><div class="card"><span class="label" id="p-movehead">Moves</span><div id="p-moves"></div></div></div></div>`;
  S.board=makeBoard($('p-board'),{onMove:(f,t,pr)=>{ const g=cur(); const m=g.move({from:f,to:t,promotion:pr||'q'}); if(m){ S.line.push(m.san); drawExplorer() } }});
  drawExplorer();
}
function cur(){ const g=new Chess(); for(const s of S.line) if(!g.move(s)) break; return g }
function drawExplorer(){
  if(!S.board||!S.pid) return; const g=cur(), fen=g.fen(), here=movesAt(S.pid,S.color,fen), tot=here.reduce((a,x)=>a+x.n,0), p=pdata(S.pid);
  const h=g.history({verbose:true}), last=h[h.length-1];
  S.board.set(g,{last:last?{from:last.from,to:last.to}:null,orient:S.orientSet?S.board.orient:(S.color==='w'?'b':'w')});
  $('p-line').textContent=S.line.length?lineText(S.line):'Starting position';
  const theirTurn=g.turn()===S.color;
  $('p-movehead').textContent=theirTurn?`${p.name} plays · ${tot} game${tot===1?'':'s'}`:`Their opponents played · ${tot} game${tot===1?'':'s'}`;
  $('p-moves').innerHTML=here.length?here.map(x=>`<div class="bookrow pmrow"><button type="button" class="linkbtn mv" data-uci="${x.uci}">${esc(x.san)}</button><span class="wdl" title="${p.name}'s score after this move"><i class="w" style="width:${x.score==null?0:Math.round(100*x.score)}%;background:var(--good)"></i></span><span class="note">${Math.round(100*x.n/tot)}%</span><span class="note">${x.n} · ${x.score==null?'—':Math.round(100*x.score)+'%'}</span></div>`).join('')
    :`<p class="note">${tot?'':'None of their games reach this position.'}</p>`;
}
function sheetHtml(p){
  const block=myColor=>{ const their=myColor==='w'?'b':'w', l=expectLine(p.id,their), r=record(p,their), fm=firstMoves(p.id,their).slice(0,5), tot=fm.reduce((a,[,x])=>a+x.n,0);
    const recent=p.games.filter(g=>g.c===their).slice(0,5);
    return `<section class="card shblock"><h2>You have ${myColor==='w'?'White':'Black'}</h2>
      <p class="note" style="margin:0 0 6px">${esc(p.name)} with ${their==='w'?'White':'Black'}: ${r.w} won, ${r.d} drawn, ${r.l} lost (${pct(r)}) in ${r.n} game${r.n===1?'':'s'}</p>
      <span class="label">${their==='w'?'First move':'Answers to your first move'}</span>
      <p class="ptxt">${fm.map(([k,x])=>`<b>${esc('1.'+k)}</b> ${Math.round(100*x.n/tot)}%${x.c?` <span class="note">(scores ${Math.round(100*x.s/x.c)}%)</span>`:''}`).join(' · ')||'<span class="note">No games.</span>'}</p>
      <span class="label">Line to expect</span>
      ${l.length?`<p class="shline mono">${l.map((m,i)=>`${i%2===0?`<span class="note">${i/2+1}.</span>`:''}<span class="sm-${m.src}" title="${m.src==='they'?`their choice in ${m.n} of ${m.tot} games`:m.src==='prep'?'your repertoire':`what their opponents played most (${m.n} of ${m.tot})`}">${esc(m.san)}</span>`).join(' ')}</p>
        <p class="note shkey"><b>bold</b> = their most played move · <u>underlined</u> = your imported repertoire · plain = what their opponents played most</p>`:'<p class="note">Not enough games to see a line.</p>'}
      <span class="label">Recent games</span>
      <table class="shtab"><tbody>${recent.map(g=>`<tr><td class="mono">${esc(g.d)}</td><td>vs ${esc(g.o)}${g.or?` <span class="note">${g.or}</span>`:''}</td><td><b>${g.r===1?'won':g.r===0?'lost':g.r===0.5?'drew':'?'}</b></td><td class="mono note">${esc(lineText(g.m.split(' ').slice(0,8)))}</td></tr>`).join('')}</tbody></table>
      <div class="btns shbtns noprint"><button class="btn sm primary" data-train="${myColor}">Train vs ${esc(p.name)}</button></div></section>` };
  return `<div class="btns noprint" style="margin-bottom:10px"><button class="btn sm" data-act="unsheet">← Back</button><button class="btn sm primary" data-act="print">Print</button></div>
    <header class="card shhead"><span class="label">Pre-round sheet · ${p.site==='chesscom'?'Chess.com':'Lichess'} games</span><h1 style="margin:4px 0">${esc(p.name)}</h1>
      <p class="note" style="margin:0">${p.games.length} online games (${esc((p.speeds||[]).join(', '))}), ${esc(p.games[p.games.length-1].d)} to ${esc(p.games[0].d)}. Online habits; over the board may differ.</p></header>
    <div class="shgrid">${block('w')}${block('b')}</div>`;
}
function select(id){ S.pid=id; S.line=[]; S.sheet=false; S.orientSet=false; render() }
function train(myColor){ const pid=S.pid; location.hash='#openings'; setTimeout(()=>OpeningsTab.selectOpening('pl-'+pid+'-'+myColor),30) }

function init(){
  const sec=$('players'); if(!sec) return;
  $('p-speeds').innerHTML=SPEEDS.map(([v,l])=>`<label class="toggle" style="margin:0"><input type="checkbox" value="${v}"${v==='bullet'?'':' checked'}> ${l}</label>`).join('');
  $('p-form').addEventListener('submit',async e=>{ e.preventDefault(); if(S.busy) return;
    const err=$('p-err'); const speeds=[...$('p-speeds').querySelectorAll('input:checked')].map(x=>x.value);
    S.busy=true; $('p-go').disabled=true; err.textContent='Fetching their games…';
    try{ const p=await addPlayer($('p-site').value,$('p-user').value,speeds); err.textContent=`${p.games.length} games.`; $('p-user').value=''; select(p.id) }
    catch(x){ err.textContent=x instanceof TypeError?'Could not reach '+($('p-site').value==='chesscom'?'Chess.com':'Lichess')+' (offline, or blocked by a browser extension).':String(x.message||x) }
    S.busy=false; $('p-go').disabled=false });
  sec.addEventListener('click',async e=>{
    const pb=e.target.closest('[data-pid]'); if(pb){ select(pb.dataset.pid); return }
    const c=e.target.closest('[data-col]'); if(c){ S.color=c.dataset.col; S.line=[]; S.orientSet=false; render(); return }
    const u=e.target.closest('[data-uci]'); if(u){ const g=cur(); const m=g.move({from:u.dataset.uci.slice(0,2),to:u.dataset.uci.slice(2,4),promotion:u.dataset.uci[4]||'q'}); if(m){ S.line.push(m.san); drawExplorer() } return }
    const t=e.target.closest('[data-train]'); if(t){ train(t.dataset.train); return }
    const a=e.target.closest('[data-act]'); if(!a) return; const act=a.dataset.act;
    if(act==='back'){ S.line.pop(); drawExplorer() } else if(act==='start'){ S.line=[]; drawExplorer() }
    else if(act==='flip'){ S.board.flip(); S.orientSet=true }
    else if(act==='sheet'){ S.sheet=true; render(); if(document.scrollingElement) document.scrollingElement.scrollTop=0 } else if(act==='unsheet'){ S.sheet=false; render() }
    else if(act==='print'){ document.body.classList.add('print-sheet'); const done=()=>{ document.body.classList.remove('print-sheet'); removeEventListener('afterprint',done) }; addEventListener('afterprint',done); try{ window.print() }catch(_){ done() } }
    else if(act==='remove'){ if(!confirm('Remove this player and their games from this browser?')) return; Store.del('player-'+S.pid); for(const k of ['w','b']) Store.del('stats-pl-'+S.pid+'-'+k); Store.put('players-index',index().filter(x=>x.id!==S.pid)); S.pid=null; render() }
    else if(act==='refresh'){ const p=pdata(S.pid); if(!p||S.busy) return; S.busy=true; a.disabled=true; a.textContent='Fetching…';
      try{ await addPlayer(p.site,p.user,p.speeds||['blitz','rapid','classical']); select(p.id) }catch(x){ a.textContent='Could not refresh'; } S.busy=false }
  });
  Keys.on('players',{ArrowLeft:['Back a move in the explorer',()=>{ if(!S.board||S.sheet||!S.line.length) return false; S.line.pop(); drawExplorer() }],
    Home:['Back to the start',()=>{ if(!S.board||S.sheet) return false; S.line=[]; drawExplorer() }]});
  render();
}
window.PlayersTab={init,render,select,addPlayer,movesAt,expectLine,tree,pgnMoves,index,data:pdata,get state(){return S}};
})();
