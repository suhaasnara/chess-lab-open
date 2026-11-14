/* Shared (Chess Lab and Chess Lab Open). Home: chess-lab-open/site/shared/ (MIT); the private kit pulls a pinned copy.
   Blind tactics (12 Nov 2026), after listudy's blind tactics, with a rating range: the board shows the position N plies
   before a Lichess puzzle, the hidden moves are listed under it, and you solve without the board moving. On listudy every
   tactic ends in a simple motif, so more hidden plies only means visualizing a two-mover; a rating range makes the tactic
   itself hard as well.

   Data: blind.json (Chess Lab Open's tools/pick_blind.py, CC0 Lichess puzzles and their games): [{id: 'bt-'+Lichess id,
   rating, fen (16 plies before the puzzle position), hidden: [16 SAN; the last is the opponent's move that sets the
   puzzle], sol: [UCI: your move, the reply, ...], themes, motif}]. Loaded on first use.

   BlindTactics.mount(root, site) builds the screen in root (an empty element; the site shows and hides it). site = {
     view:     the Keys view name ('blind')
     load():   Promise of the puzzle list (each site's own fetch: Site.url('blind'))
     store:    {get(key), put(key, value), subscribe?(fn)}   keys 'blind-progress' {id: {n, ok, okN, t, h?, a?}} and
               'blind-rating' {r, n, hist: [{t, r}]} (each site's own storage: Open localStorage, Chess Lab the account)
     settings: {get() -> object or null, set(object)}       the settings field 'blind' {lo, hi, plies, len, status}
     onResult?(): after a result is saved (the site's Progress, Today...) }
   Returns {show(), state, load(puzzle), submit(text), clickSquare(sq), peek(), giveUp(), next(), filtered(), summary()}.

   Rules (the site's Tactics rules): a wrong move is a miss and you try again; only the first try at a puzzle counts for
   the Blind rating (Elo against the Lichess rating, K 32 for the first 30, then 16; starts at 1500); Peek (P) shows the
   real position for 2 s and marks the puzzle assisted (scored as a miss, like a hint); Give up (G) plays the hidden moves
   and the solution on the board. A move that isn't legal in the real position is not a miss (it says so). Reviews as in
   Blunder check: a puzzle you solved comes back after 3, 7, 21 days, a miss the next day. No engine anywhere. */
'use strict';
window.BlindTactics=(()=>{
  const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const themeName=t=>{ if(!t) return ''; if(t==='attackingF2F7') return 'Attacking f2/f7'; const w=String(t).replace(/([a-z])([A-Z0-9])/g,'$1 $2').replace(/([0-9])([A-Za-z])/g,'$1 $2').toLowerCase(); return w[0].toUpperCase()+w.slice(1) };
  const NOT_THEME=['middlegame','endgame','opening','advantage','crushing','mate','short','long','veryLong','oneMove','master','masterVsMaster','superGM'];
  const DAY=864e5, REVIEW=[3,7,21], R0=1500, MINR=1000, MAXR=2900, PEEK_MS=2000;
  const DEF={lo:null,hi:null,plies:4,len:'any',status:'todo',auto:false,run:0};
  const AUTO_UP=3, AUTO_DOWN=2;   /* Auto (13 Nov 2026): one more hidden ply after 3 clean solves in a row, one fewer after 2 misses in a row */
  const you=z=>Math.ceil(z.sol.length/2);   /* your moves in the solution */
  const due=r=>!!r&&(r.ok?Date.now()-r.t>=REVIEW[Math.min(REVIEW.length-1,Math.max(1,r.okN||1)-1)]*DAY:r.t<new Date().setHours(0,0,0,0));
  const daily=list=>{ const seed=new Date().toISOString().slice(0,10);
    const h=s=>{ let x=2166136261; for(const c of s) x=Math.imul(x^c.charCodeAt(0),16777619); return x>>>0 };
    return list.map(z=>[h(seed+z.id),z]).sort((a,b)=>a[0]-b[0]).map(x=>x[1]) };
  /* A typed move in the real position: SAN (Nxe5, exd5, O-O, 0-0, nf3), or squares (g1f3, g1-f3, e7e8q). */
  function parse(g,txt){
    let t=String(txt||'').trim().replace(/[+#!?]+$/,''); if(!t) return null;
    t=t.replace(/^0-0-0$/,'O-O-O').replace(/^0-0$/,'O-O').replace(/^o-o-o$/i,'O-O-O').replace(/^o-o$/i,'O-O');
    const sq=t.toLowerCase().replace(/[-x]/g,'').match(/^([a-h][1-8])([a-h][1-8])([qrbn])?$/);
    if(sq){ const mv=g.moves({square:sq[1],verbose:true}).filter(m=>m.to===sq[2]); if(!mv.length) return null;
      return {from:sq[1],to:sq[2],promotion:mv[0].promotion?(sq[3]||'q'):undefined} }
    const tries=[t]; if(/^[kqrn]/.test(t)) tries.push(t[0].toUpperCase()+t.slice(1)); if(/^b[a-h1-8x]/.test(t)) tries.push('B'+t.slice(1));
    t=t.replace(/=?([qrbn])$/i,(m,p)=>'='+p.toUpperCase()); if(!tries.includes(t)) tries.push(t);
    for(const x of tries){ const c=new Chess(g.fen()); const m=c.move(x,{sloppy:true}); if(m) return {from:m.from,to:m.to,promotion:m.promotion} }
    return null;
  }
  const uciOf=m=>m.from+m.to+(m.promotion||'');

  function mount(root,site){
    const st=site.store, view=site.view||'blind';
    const S={lib:null,cur:null,real:null,shown:null,step:0,solved:false,scored:false,failed:false,assisted:false,gaveUp:false,
      sel:null,peekT:0,playT:0,gen:0,log:[],review:null,ri:0,cfg:Object.assign({},DEF,site.settings.get()||{})};
    const q=id=>root.querySelector('[data-b="'+id+'"]');
    root.innerHTML=`<div class="grid tv bl">
  <div class="bl-left">
    <div class="filters"><div data-b="rate"></div>
      <div class="card bl-set" data-b="set">
        <div class="bl-range" data-b="range"></div>
        <label class="bl-row"><span class="label">Hidden moves</span> <input type="range" min="2" max="16" step="1" data-b="plies" aria-label="Hidden plies"> <b class="mono" data-b="pliesv"></b></label>
        <label class="bl-row bl-auto"><input type="checkbox" data-b="auto"> <span>Auto: one more after 3 clean solves in a row, one fewer after 2 misses</span></label>
        <p class="note bl-autonote" data-b="autonote" hidden></p>
        <div data-b="lenrow"></div>
      </div>
      <div class="filters" data-b="chips" style="margin:0"></div>
    </div>
    <div class="label tvlabel" data-b="listlabel"></div>
    <div class="list long" data-b="list"></div>
  </div>
  <div class="panel">
    <div class="boardwrap" data-b="wrap">
      <div class="board" data-b="board" role="group" aria-label="Chess board: the position before the hidden moves"></div>
      <div class="boardtools bl-bar" data-b="tools">
        <button type="button" class="btn sm primary" data-b="next">Next <kbd>N</kbd></button>
        <button type="button" class="btn sm" data-b="peek">Peek <kbd>P</kbd></button>
        <button type="button" class="btn sm" data-b="giveup">Give up <kbd>G</kbd></button>
        <button type="button" class="btn sm" data-b="flip">Flip <kbd>F</kbd></button>
      </div>
    </div>
    <div class="side">
      <div data-b="head"></div>
      <div class="card bl-moves">
        <div class="label">The hidden moves</div>
        <p class="bl-line mono" data-b="line"></p>
        <form class="bl-form" data-b="form" autocomplete="off">
          <input type="text" data-b="in" inputmode="text" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Your move: Nxe5 or g1f3" aria-label="Your move (SAN or squares)">
          <button type="submit" class="btn sm primary" data-b="go">Play <kbd>↵</kbd></button>
        </form>
        <p class="note bl-how">Type a move, or tap the piece's square and then where it goes: both are read in the real position, after the hidden moves. Esc leaves the box so the keys work.</p>
      </div>
      <div class="status" data-b="status" aria-live="polite"><strong>Loading the puzzles…</strong></div>
    </div>
  </div>
</div>`;
    const boardEl=q('board');
    const board=makeBoard(boardEl,{});
    const endbar=endBanner(boardEl,()=>next(),'Next puzzle');
    board.set(new Chess(),{locked:true});

    /* ---------- progress and the Blind rating ---------- */
    const prog=()=>st.get('blind-progress')||{};
    const rating=()=>{ const r=st.get('blind-rating')||{}; return {r:r.r||R0,n:r.n||0,hist:r.hist||[]} };
    function score(ok){
      if(S.scored||!S.cur) return; S.scored=true;
      const p=prog(), id=S.cur.id, before=p[id], rec=Object.assign({n:0,ok:false,okN:0,t:0},before||{});
      rec.n++; rec.ok=ok; rec.okN=ok?(rec.okN||0)+1:0; rec.t=Date.now();
      if(ok) rec.h=hp(); if(S.assisted) rec.a=1; else delete rec.a;
      p[id]=rec; st.put('blind-progress',p);
      if(!before&&S.cur.rating){   /* first try at each puzzle counts */
        const rt=rating(), K=rt.n<30?32:16, E=1/(1+Math.pow(10,(S.cur.rating-rt.r)/400));
        rt.r=Math.round(rt.r+K*((ok?1:0)-E)); rt.n++; rt.hist=rt.hist.concat([{t:Date.now(),r:rt.r}]).slice(-500);
        st.put('blind-rating',rt) }
      if(S.cfg.auto) autoStep(ok&&!S.assisted);
      renderRate(); site.onResult&&site.onResult();
    }
    /* Auto: the setting moves for the next puzzle, never the one on the board */
    function autoStep(clean){
      let run=S.cfg.run||0; run=clean?(run>0?run+1:1):(run<0?run-1:-1);
      const was=S.cfg.plies;
      if(run>=AUTO_UP){ if(S.cfg.plies<16) S.cfg.plies++; run=0 }
      else if(run<=-AUTO_DOWN){ if(S.cfg.plies>2) S.cfg.plies--; run=0 }
      S.cfg.run=run; S.autoMsg=S.cfg.plies!==was?`Auto: ${S.cfg.plies} hidden plies from the next puzzle (${S.cfg.plies>was?'up':'down'} from ${was}).`:'';
      saveCfg(); renderSet();
    }
    function autoNote(){ const el=q('autonote'); if(!S.cfg.auto){ el.hidden=true; return } el.hidden=false; const r=S.cfg.run||0;
      el.textContent=S.autoMsg||(r>0?`${Help.n(AUTO_UP-r,'more clean solve')} in a row for ${Math.min(16,S.cfg.plies+1)} plies.`:r<0?`One more miss and it drops to ${Math.max(2,S.cfg.plies-1)}.`:`${AUTO_UP} clean solves in a row add a ply; ${AUTO_DOWN} misses take one off.`) }
    const summary=()=>Object.assign(stats(prog(),rating()),{assisted:Object.values(prog()).filter(x=>x.a).length});
    function renderRate(){ const s=summary();
      q('rate').innerHTML=TV.rate('Blind rating',s.rated?s.rating:'–',s.rated?`${Help.n(s.rated,'rated puzzle')} · ${s.solved} solved${s.avgPlies?` · ${s.avgPlies} hidden plies on average`:''}`:'first try at each puzzle counts') }

    /* ---------- settings and filters ---------- */
    const saveCfg=()=>site.settings.set(Object.assign({},S.cfg));
    let RANGE=null;
    function renderSet(){
      if(!RANGE) RANGE=Controls.range(q('range'),{label:'Rating range',min:MINR,max:MAXR,step:100,lo:S.cfg.lo==null?MINR:S.cfg.lo,hi:S.cfg.hi==null?MAXR:S.cfg.hi,
        onChange:(a,b)=>{ S.cfg.lo=a<=MINR?null:a; S.cfg.hi=b>=MAXR?null:b; saveCfg(); renderList() }});
      const pl=q('plies'); pl.value=S.cfg.plies; q('pliesv').textContent=S.cfg.plies+' plies';
      q('auto').checked=!!S.cfg.auto; autoNote();
      q('lenrow').innerHTML=TV.chips('Length','len',[['any','Any'],['2','2+ moves'],['3','3+ moves']],S.cfg.len);
      q('chips').innerHTML=TV.chips('Status','status',[['todo','To do'],['missed','Missed'],['solved','Solved'],['all','Any']],S.cfg.status);
    }
    q('plies').addEventListener('input',e=>{ q('pliesv').textContent=e.target.value+' plies' });
    q('plies').addEventListener('change',e=>{ S.cfg.plies=Math.max(2,Math.min(16,+e.target.value||4)); saveCfg(); if(S.cur&&!S.scored&&!S.log.length) load(S.cur); else renderLine() });
    q('auto').addEventListener('change',e=>{ S.cfg.auto=e.target.checked; S.cfg.run=0; S.autoMsg=''; saveCfg(); autoNote() });
    TV.onChip(root,(k,v)=>{ if(k==='len'||k==='status'){ S.cfg[k]=v; saveCfg(); renderSet(); renderList() } });
    function filtered(){
      const p=prog(), c=S.cfg, n=c.len==='any'?0:+c.len;
      return (S.lib||[]).filter(z=>{
        if(c.lo!=null&&z.rating<c.lo) return false; if(c.hi!=null&&z.rating>c.hi) return false;
        if(n&&you(z)<n) return false;
        const r=p[z.id];
        if(c.status==='todo') return !r||due(r);
        if(c.status==='missed') return !!r&&!r.ok;
        if(c.status==='solved') return !!r&&r.ok;
        return true });
    }
    /* Next: reviews that are due first, then new ones, in a shuffle that holds for the day */
    const ordered=()=>{ const p=prog(), l=daily(filtered()); return l.filter(z=>p[z.id]&&due(p[z.id])).concat(l.filter(z=>!p[z.id]),l.filter(z=>p[z.id]&&!due(p[z.id]))) };
    function renderList(){
      const el=q('list'), p=prog(), list=ordered();
      q('listlabel').textContent=`${list.length.toLocaleString()} puzzle${list.length===1?'':'s'}${list.length>200?' · first 200 shown':''} · Next picks the next one`;
      el.classList.toggle('isempty',!list.length);
      el.innerHTML=list.length?list.slice(0,200).map(z=>{ const r=p[z.id], done=!!r;
        return TV.row({badge:z.rating,title:esc(Puzzles.title(z.id,themeName(z.motif),done,Puzzles.num(S.lib,z.id))),
          meta:[r&&due(r)?'<span class="tag info">review</span>':'',r&&r.a?'peeked':''].filter(Boolean).join(' · ')||(r?'done':'not tried'),   /* 14 Nov: never how many moves the solution has (that is part of the puzzle) */
          right:TV.dots([[r?(r.ok?'good':'bad'):'','Puzzle']]),current:!!(S.cur&&S.cur.id===z.id),data:{id:z.id}}) }).join('')
        :'<p class="empty">No puzzles match. Widen the rating range, pick Any solution length, or Any status.</p>';
    }
    q('list').addEventListener('click',e=>{ const b=e.target.closest('.drill'); if(!b||!S.lib) return; const z=S.lib.find(x=>x.id===b.dataset.id); if(z){ load(z); if(innerWidth<=860) q('wrap').scrollIntoView({behavior:'smooth',block:'start'}) } });

    /* ---------- one puzzle ---------- */
    const side=()=>S.me==='w'?'White':S.me==='b'?'Black':'';
    const hp=()=>S.cur?S.cur.hidden.length-S.hiddenFrom:S.cfg.plies;   /* the hidden plies of the puzzle on the board (Auto may change the setting for the next one) */
    function startFen(z){ const g=new Chess(z.fen), k=Math.max(0,z.hidden.length-S.cfg.plies); for(let i=0;i<k;i++) g.move(z.hidden[i]); return g }
    function load(z){
      clearTimeout(S.peekT); clearInterval(S.playT); endbar.hide();
      S.autoMsg=''; if(S.cfg.auto) autoNote();
      S.gen++; S.cur=z; S.step=0; S.solved=S.scored=S.failed=S.assisted=S.gaveUp=false; S.sel=null; S.log=[]; S.review=null;
      S.shown=startFen(z); S.real=new Chess(S.shown.fen()); S.hiddenFrom=Math.max(0,z.hidden.length-S.cfg.plies);
      for(let i=S.hiddenFrom;i<z.hidden.length;i++) S.real.move(z.hidden[i]);
      S.puzzleFen=S.real.fen(); S.me=S.real.turn();
      board.set(new Chess(S.shown.fen()),{last:null,orient:S.real.turn(),locked:true});
      renderHead(); renderLine(); renderList();
      say('','Picture the position after the hidden moves.',' The board stays where it is while you solve.');
      q('peek').disabled=q('giveup').disabled=false;
      if(window.matchMedia&&matchMedia('(hover:hover) and (pointer:fine)').matches){   /* the box has focus on laptops (phones: no keyboard popping up) */
        const f=()=>{ if(S.cur===z&&!S.scored&&!root.closest('[hidden]')) q('in').focus({preventScroll:true}) };
        f(); if(document.readyState!=='complete') addEventListener('load',()=>setTimeout(f,0),{once:true}) }   /* Firefox moves focus at the end of loading */
      q('in').value='';
    }
    function renderHead(){ const z=S.cur; if(!z) return; const done=S.scored||S.solved||S.gaveUp||!!prog()[z.id];
      const th=(z.themes||[]).filter(t=>!NOT_THEME.includes(t)).map(themeName).join(', ')||themeName(z.motif);
      q('head').innerHTML=TV.head({kicker:'Blind tactics · Lichess puzzle',right:rating().n?String(rating().r):'',
        title:esc(Puzzles.title(z.id,themeName(z.motif),done,Puzzles.num(S.lib,z.id))),
        chips:[`<span class="mono">${z.rating}</span>`,`${side()} to move`,Help.n(hp(),'hidden ply','hidden plies'),
          `Themes: ${esc(Puzzles.theme(th,done))}`,done?`<a href="https://lichess.org/training/${esc(z.id.slice(3))}" target="_blank" rel="noopener">Lichess ↗</a>`:'']}) }
    /* the move list: the hidden moves (numbered from the shown position), the task, then your moves and the replies as text */
    function renderLine(){
      const z=S.cur, el=q('line'); if(!z){ el.textContent=''; return }
      const g=new Chess(S.shown.fen()); let n=+S.shown.fen().split(' ')[5]||1, w=S.shown.turn()==='w';
      const parts=[]; const push=(san,cls)=>{ parts.push((w?`<span class="bl-no">${n}.</span>`:(parts.length===0||parts[parts.length-1].task?`<span class="bl-no">${n}…</span>`:''))+`<span class="${cls}">${esc(san)}</span>`); if(!w) n++; w=!w };
      for(let i=S.hiddenFrom;i<z.hidden.length;i++){ push(z.hidden[i],'bl-h'); g.move(z.hidden[i]) }
      const task={task:true,toString(){ return `<span class="bl-task">${esc(side())} to play and win</span>` }};
      parts.push(task);
      for(const m of S.log) push(m.san,m.you?'bl-you':'bl-opp');
      el.innerHTML=parts.map(String).join(' ');
    }
    function say(tone,head,rest){ const el=q('status'); el.className='status'+(tone?' '+tone:''); el.innerHTML=`<strong>${esc(head)}</strong>${esc(rest||'')}` }
    const expected=()=>S.cur&&S.cur.sol[S.step];
    function attempt(mv){
      if(!S.cur||S.solved||S.gaveUp) return false;
      const exp=expected(); if(!exp) return false;
      const t=new Chess(S.real.fen()); const m=t.move(mv); if(!m) return false;
      const u=uciOf(m), hit=u===exp||u.slice(0,4)===exp.slice(0,4)&&(!exp[4]||exp[4]===u[4]);
      if(!hit&&!t.in_checkmate()){   /* any mate also counts, as in Tactics */
        if(!S.scored) score(false);
        S.failed=true; renderHead(); renderList();
        say('bad',`${m.san} isn’t it.`,' Try again: only the first try counts.'); return true }
      S.real.move(mv); S.log.push({san:m.san,you:true}); S.step++;
      const reply=S.cur.sol[S.step];
      if(!reply||t.in_checkmate()){ finish(); return true }
      const gen=S.gen; renderLine(); say('good',`${m.san} ✓`,' Your opponent replies…');
      setTimeout(()=>{ if(gen!==S.gen) return; const r=S.real.move({from:reply.slice(0,2),to:reply.slice(2,4),promotion:reply[4]||undefined});
        S.step++; if(r) S.log.push({san:r.san,you:false}); renderLine();
        say('',r?`${r.san}. Your move.`:'Your move.',' The board still shows the start.') },350);
      return true;
    }
    function finish(){
      S.solved=true; if(!S.scored) score(!S.failed&&!S.assisted);
      const clean=!S.failed&&!S.assisted;
      renderLine(); renderHead(); renderList();
      say('good','Solved!',clean?' First try: it counts for your Blind rating.':S.assisted?' (you peeked, so it counts as a miss)':' (not a clean first try)');
      endbar.show(clean?'good':'warn',clean?'Solved ✓ first try':'Solved, not first try','Next puzzle');
      replay(false);
    }
    function submit(txt){
      if(!S.cur||S.solved||S.gaveUp) return false;
      const mv=parse(S.real,txt);
      if(!mv){ if(String(txt||'').trim()) say('warn',`“${String(txt).trim()}” isn’t a legal move in the real position.`,' Not counted. Check the hidden moves: the board is '+Help.n(hp(),'ply','plies')+' behind.'); return false }
      const ok=attempt(mv); if(ok) q('in').value=''; return ok;
    }
    q('form').addEventListener('submit',e=>{ e.preventDefault(); submit(q('in').value) });
    q('in').addEventListener('keydown',e=>{ if(e.key==='Escape'){ e.preventDefault(); q('in').blur() } });
    /* tap or click: a from-square then a to-square, read in the real position */
    function clickSquare(sq){
      if(!S.cur||S.solved||S.gaveUp||S.peeking) return;
      if(!S.sel){ const p=S.real.get(sq); if(p&&p.color!==S.real.turn()){ say('warn',`In the real position that is ${p.color==='w'?'a White':'a Black'} piece.`,' Pick one of yours.'); return }
        S.sel=sq; mark(); return }
      if(S.sel===sq){ S.sel=null; mark(); return }
      const from=S.sel; S.sel=null; mark();
      const legal=S.real.moves({square:from,verbose:true}).filter(m=>m.to===sq);
      if(!legal.length){ const p=S.real.get(sq); if(p&&p.color===S.real.turn()){ S.sel=sq; mark(); return }
        say('warn',`${from}–${sq} isn’t legal in the real position.`,' Not counted.'); return }
      attempt({from,to:sq,promotion:legal[0].promotion?'q':undefined});
    }
    function mark(){ boardEl.querySelectorAll('.sq.bl-sel').forEach(x=>x.classList.remove('bl-sel')); if(S.sel){ const x=boardEl.querySelector(`.sq[data-sq="${S.sel}"]`); if(x) x.classList.add('bl-sel') } }
    boardEl.addEventListener('click',e=>{ const c=e.target.closest('.sq'); if(c&&!S.review) clickSquare(c.dataset.sq) });

    /* Peek: the real position for 2 s; the puzzle is then assisted (a miss for the rating, like a hint) */
    function peek(){
      if(!S.cur||S.solved||S.gaveUp) return false;
      S.assisted=true; if(!S.scored) score(false); renderHead(); renderList();
      clearTimeout(S.peekT); S.peeking=true; S.sel=null;
      board.set(new Chess(S.real.fen()),{last:null,locked:true}); boardEl.classList.add('bl-peek');
      say('warn','Peeking: the real position.',' Back in 2 seconds. The puzzle now counts as assisted.');
      const gen=S.gen; S.peekT=setTimeout(()=>{ if(gen!==S.gen) return; S.peeking=false; boardEl.classList.remove('bl-peek'); board.set(new Chess(S.shown.fen()),{last:null,locked:true}); say('',`${side()} to play.`,' (assisted)') },PEEK_MS);
      return true;
    }
    /* After the end: the hidden moves and the solution play on the board; ← → step through them */
    function replay(animate){
      clearTimeout(S.peekT); S.peeking=false; boardEl.classList.remove('bl-peek');
      const g=new Chess(S.shown.fen()), seq=[{fen:g.fen(),last:null}];
      for(let i=S.hiddenFrom;i<S.cur.hidden.length;i++){ const m=g.move(S.cur.hidden[i]); seq.push({fen:g.fen(),last:m&&{from:m.from,to:m.to}}) }
      S.puzzleIdx=seq.length-1;
      for(const u of S.cur.sol){ const m=g.move({from:u.slice(0,2),to:u.slice(2,4),promotion:u[4]||undefined}); if(!m) break; seq.push({fen:g.fen(),last:{from:m.from,to:m.to}}) }
      if(S.solved&&S.log.length){   /* your own mating move may differ from the stored one */
        const r=new Chess(S.puzzleFen); seq.length=S.puzzleIdx+1; for(const x of S.log){ const m=r.move(x.san); if(m) seq.push({fen:r.fen(),last:{from:m.from,to:m.to}}) } }
      S.review=seq; S.ri=animate?0:seq.length-1; show();
      if(animate){ clearInterval(S.playT); const gen=S.gen; S.playT=setInterval(()=>{ if(gen!==S.gen||!S.review||S.ri>=S.review.length-1){ clearInterval(S.playT); return } S.ri++; show() },650) }
    }
    function show(){ const x=S.review[S.ri]; board.set(new Chess(x.fen),{last:x.last,locked:true}) }
    function stepRev(d){ if(!S.review) return false; clearInterval(S.playT); S.ri=Math.max(0,Math.min(S.review.length-1,S.ri+d)); show(); return true }
    function giveUp(){
      if(!S.cur||S.solved||S.gaveUp) return false;
      if(!S.scored) score(false);
      S.gaveUp=true; const z=S.cur;
      const sans=[], g=new Chess(S.puzzleFen); for(const u of z.sol){ const m=g.move({from:u.slice(0,2),to:u.slice(2,4),promotion:u[4]||undefined}); if(m) sans.push(m.san) }
      S.log=sans.map((san,i)=>({san,you:i%2===0})); renderLine(); renderHead(); renderList();
      say('bad','The solution: '+sans.join(' '),' Playing the hidden moves and the solution on the board (← → to step).');
      endbar.show('bad','Given up','Next puzzle'); q('peek').disabled=q('giveup').disabled=true;
      replay(true); return true;
    }
    function next(){
      if(!S.lib) return false;
      const list=ordered(), z=list.find(x=>!S.cur||x.id!==S.cur.id)||list[0];
      if(z) load(z); else say('warn','No puzzles match these settings.',' Widen the rating range or pick Any.');
      return true;
    }
    if(window.TV&&TV.bar) TV.bar(q('tools'),{primary:'[data-b="next"]',host:root});   /* 14 Nov: the shared bottom bar (phones and iPads), Next beside the right corner like every other page */
    q('next').addEventListener('click',()=>next());
    q('peek').addEventListener('click',()=>peek());
    q('giveup').addEventListener('click',()=>giveUp());
    q('flip').addEventListener('click',()=>board.flip());
    Keys.on(view,{ArrowLeft:['Back through the moves (after the puzzle)',()=>stepRev(-1)],ArrowRight:['Forward through the moves (after the puzzle)',()=>stepRev(1)],
      n:['Next puzzle',()=>next()],f:['Flip the board',()=>board.flip()],p:['Peek at the real position for 2 s (counts as assisted)',()=>peek()],
      g:['Give up: play the hidden moves and the solution',()=>giveUp()]},
      'Type your move in the box and press Enter. Esc leaves the box, so these keys work; click in the box to type again.');
    if(st.subscribe) st.subscribe(()=>{ if(S.lib){ renderRate(); renderList() } });
    addEventListener('settings-change',()=>{ const c=site.settings.get(); if(c&&JSON.stringify(Object.assign({},DEF,c))!==JSON.stringify(S.cfg)){ S.cfg=Object.assign({},DEF,c); if(RANGE) RANGE.set(S.cfg.lo==null?MINR:S.cfg.lo,S.cfg.hi==null?MAXR:S.cfg.hi); if(S.lib){ renderSet(); renderList() } } });

    let loading=null;
    function show_(){
      renderRate();
      if(!loading) loading=Promise.resolve().then(()=>site.load()).then(j=>{ S.lib=Array.isArray(j)?j.filter(z=>z&&z.id&&z.fen&&Array.isArray(z.hidden)&&Array.isArray(z.sol)&&z.sol.length):[];
          renderSet(); renderRate(); renderList(); if(!S.cur) next() })
        .catch(e=>{ loading=null; say('bad','The puzzles could not load.',' Check the connection and open the tab again.'); q('list').innerHTML='<p class="empty">The Blind tactics set could not load.</p>' });
      return loading;
    }
    renderSet(); renderRate();
    return {show:show_,get state(){ return S },load,submit,clickSquare,peek,giveUp,next,filtered,summary,parse:t=>S.real&&parse(S.real,t),
      get board(){ return board }, get lib(){ return S.lib }};
  }
  /* The Progress tile on both sites: BlindTactics.stats(progress, rating) -> {solved, tried, rating (null before the first
     rated puzzle), rated, avgPlies (hidden plies of the solved puzzles, on average), due} */
  function stats(p,r){ const v=Object.values(p||{}), ok=v.filter(x=>x&&x.ok), hs=ok.map(x=>x.h).filter(Boolean); r=r||{};
    return {tried:v.length,solved:ok.length,rating:r.n?r.r:null,rated:r.n||0,avgPlies:hs.length?Math.round(hs.reduce((a,b)=>a+b,0)/hs.length*10)/10:null,due:v.filter(due).length} }
  return {mount,parse,stats,DEF};
})();
