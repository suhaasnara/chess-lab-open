/* Shared (Chess Lab and Chess Lab Open). Home: chess-lab-open/site/shared/ (MIT); the private kit pulls a pinned copy.
   One Stockfish worker for the whole app, with a watchdog and a result cache. Each site passes its own list of builds
   (where its Stockfish files are served from), best first:

     window.SharedEngine = EngineKit.create([[name, scriptUrl, wasmUrl|null|()=>url|Promise<url>|false, startTimeoutMs], ...])

   SharedEngine.analyse(fen, depth, multipv=1, limitMs=12000) -> [{uci, cp, mate}] best first, cp in pawns from the
     side to move (callers show evals from White's side); null if the engine failed. Finished searches are cached
     (3,000 positions) and a search already queued or running is shared, not repeated.
   SharedEngine.play(fen, elo, movetime=700) -> uci at limited strength (UCI_Elo 1320-3190, switched off right after).
   SharedEngine.start(), .restart(); getters failed, ready, started (asked to start: downloading or ready), name, why, restarts. Fires 'engine-change' on window.

   The worker is a small boot script that importScripts() the build; the .wasm is found from the worker URL's #fragment.
   A build that can't start reports it at once (__sf_fail), so the next one starts without waiting for its timer.
   Watchdog: every search has a time limit; at the limit it sends "stop" and takes the deepest line so far; with no
   "bestmove" 2.5 s later the worker is replaced by a fresh one of the same build (after 5 restarts: failed). */
window.EngineKit=(()=>{
  function create(URLS){
    const emit=()=>dispatchEvent(new Event('engine-change'));
    let w=null, ok=false, queue=Promise.resolve(), listener=null, failed=false, name='', started=false, readyRes, why='', okIdx=-1, restarts=0;
    let ready=new Promise(r=>readyRes=r);
    /* a build's wasm may be a function (a site's own lookup, e.g. a copy kept in the browser's cache): it returns, or
       resolves to, the URL to use; false skips that build */
    function tryUrl(k){
      if(k>=URLS.length){ failed=true; readyRes(); emit(); return }
      const wv=URLS[k][2];
      if(typeof wv==='function'){ Promise.resolve().then(wv).catch(()=>null).then(u=>u===false?tryUrl(k+1):build(k,u||null)); return }
      build(k,wv);
    }
    function build(k,wasm){
      const boot="var F=function(m){postMessage('__sf_fail:'+String(m||'').slice(0,120))};self.addEventListener('unhandledrejection',function(e){e.preventDefault();F(e.reason&&(e.reason.message||e.reason))});self.addEventListener('error',function(e){e.preventDefault();F(e.message)});try{importScripts('"+URLS[k][1]+"')}catch(e){F(e.message)}";
      let nw; try{ nw=new Worker(URL.createObjectURL(new Blob([boot],{type:'application/javascript'}))+(wasm?'#'+encodeURIComponent(wasm):'')) }catch(e){ return tryUrl(k+1) }
      const timer=setTimeout(()=>{ if(!ok){ try{nw.terminate()}catch(_){} if(!why) why=URLS[k][0]+' did not answer in time'; tryUrl(k+1) } },URLS[k][3]);
      nw.onmessage=e=>{ const l=typeof e.data==='string'?e.data:''; if(!ok&&l.startsWith('__sf_fail')){ clearTimeout(timer); try{nw.terminate()}catch(_){} if(!why) why=URLS[k][0]+' could not start here ('+(l.slice(10)||'unknown reason')+')'; return tryUrl(k+1) } if(!ok&&l==='uciok'){ ok=true; clearTimeout(timer); name=URLS[k][0]; w=nw; okIdx=k; readyRes(); emit() } else if(ok) listener&&listener(l) };
      nw.onerror=()=>{ clearTimeout(timer); if(!ok){ try{nw.terminate()}catch(_){} tryUrl(k+1) } else { failed=true; emit() } };
      nw.postMessage('uci');
    }
    function start(){ if(started) return; started=true; tryUrl(0) }
    function restart(){
      try{ w&&w.terminate() }catch(e){} w=null; ok=false; listener=null; restarts++;
      ready=new Promise(r=>readyRes=r);
      if(restarts>5){ failed=true; why='the engine stopped answering repeatedly'; readyRes(); emit(); return }
      tryUrl(Math.max(0,okIdx));
    }
    function analyse(fen,depth,multipv=1,limitMs=12000){
      start();
      const job=()=>ready.then(()=>new Promise(res=>{
        if(!w||failed){res(null);return}
        const lines={}; let done=false;
        const finish=r=>{ if(done) return; done=true; clearTimeout(t); clearTimeout(kill); listener=null; res(r) };
        const t=setTimeout(()=>w&&w.postMessage('stop'),limitMs);
        const kill=setTimeout(()=>{ const got=Object.keys(lines).sort((a,b)=>a-b).map(k=>lines[k]); finish(got.length?got:null); restart() },limitMs+2500);
        listener=l=>{
          if(l.startsWith('info')&&l.includes(' pv ')&&l.includes(' score ')){
            const p=l.split(' '); const mi=p.indexOf('multipv'); const k=mi>=0?+p[mi+1]:1; const si=p.indexOf('score');
            const cp=p[si+1]==='cp'?parseInt(p[si+2])/100:(parseInt(p[si+2])>0?99:-99); const mate=p[si+1]==='mate'?parseInt(p[si+2]):null;
            lines[k]={uci:p[p.indexOf('pv')+1],cp,mate};
          }
          if(l.startsWith('bestmove')) finish(Object.keys(lines).sort((a,b)=>a-b).map(k=>lines[k]));
        };
        w.postMessage('setoption name MultiPV value '+multipv); w.postMessage('position fen '+fen); w.postMessage('go depth '+depth);
      }));
      const p=queue.then(job); queue=p.catch(()=>{}); return p;
    }
    function play(fen,elo,movetime=700){
      start();
      const job=()=>ready.then(()=>new Promise(res=>{
        if(!w||failed){res(null);return}
        let done=false; const finish=u=>{ if(done) return; done=true; clearTimeout(kill); listener=null; w&&w.postMessage('setoption name UCI_LimitStrength value false'); res(u) };
        const kill=setTimeout(()=>{ finish(null); restart() },movetime+6000);
        listener=l=>{ if(l.startsWith('bestmove')){ const u=l.split(' ')[1]; finish(u&&u!=='(none)'?u:null) } };
        w.postMessage('setoption name MultiPV value 1'); w.postMessage('setoption name UCI_LimitStrength value true');
        w.postMessage('setoption name UCI_Elo value '+Math.max(1320,Math.min(3190,Math.round(elo))));
        w.postMessage('position fen '+fen); w.postMessage('go movetime '+movetime);
      }));
      const p=queue.then(job); queue=p.catch(()=>{}); return p;
    }
    const E={start,analyse,play,restart,get failed(){return failed},get ready(){return ok},get started(){return started},get name(){return name},get why(){return why},get restarts(){return restarts}};
    /* Remember finished searches, so revisiting a position answers instantly; share searches already in flight. */
    const raw=E.analyse, cache=new Map(), inflight=new Map();
    E.analyse=function(fen,depth,mpv=1,limitMs){ const k=fen+'|'+depth+'|'+mpv; if(cache.has(k)) return Promise.resolve(cache.get(k));
      if(inflight.has(k)) return inflight.get(k);
      const p=raw(fen,depth,mpv,limitMs).then(r=>{ inflight.delete(k); if(r&&r.length){ cache.set(k,r); if(cache.size>3000) cache.delete(cache.keys().next().value) } return r },e=>{ inflight.delete(k); throw e });
      inflight.set(k,p); return p };
    return E;
  }
  return {create};
})();
