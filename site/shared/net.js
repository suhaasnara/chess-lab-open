/* Shared (Chess Lab and Chess Lab Open). Home: chess-lab-open/site/shared/ (MIT); the private kit pulls a pinned copy.
   Everything that needs the internet: Lichess studies, the Lichess tablebase, and a clear "needs internet" state.
   Pages that may not fetch from other addresses (a claude.ai artifact frame) get the same clear state, with where the
   feature does work, instead of failing silently.

   Net.online()                    false when the browser says it is offline
   Net.studyApi(url)               the PGN export URL of a lichess.org/study/<id>[/<chapter>] link, or null
   Net.fetchStudy(url)             -> {pgn, name, side ('white'|'black'|''), chapters}; throws Error with a message for people
   Net.tablebase(fen, ms=6000)     -> the Lichess tablebase's JSON for a position (7 pieces or fewer), or null
   Net.needs(el, what, retry)      draws the "needs internet" card into el (what = "Lichess study import", ...)
   Net.blockedHere                 set by a site whose page can't reach other addresses (string: where it does work) */
window.Net=(()=>{
  const online=()=>!(typeof navigator!=='undefined'&&navigator.onLine===false);
  const escH=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  function why(e){
    if(!online()) return 'You are offline. This needs the internet.';
    if(api.blockedHere) return 'This page can’t reach other websites. '+api.blockedHere;
    return 'Could not reach the site'+(e&&e.message?' ('+e.message+')':'')+'. Check the connection, or a browser extension that blocks it.';
  }
  async function get(url,ms=15000,as='text'){
    if(!online()) throw new Error(why());
    const ctl=new AbortController(), t=setTimeout(()=>ctl.abort(),ms);
    try{ const r=await fetch(url,{signal:ctl.signal}); return {status:r.status,ok:r.ok,body:r.ok?await (as==='json'?r.json():r.text()):null} }
    catch(e){ throw new Error(why(e&&e.name==='AbortError'?{message:'timed out'}:e)) }
    finally{ clearTimeout(t) }
  }
  function studyApi(url){
    const m=String(url||'').trim().match(/lichess\.org\/study\/([A-Za-z0-9]{8})(?:\/([A-Za-z0-9]{8}))?/);
    return m?'https://lichess.org/api/study/'+m[1]+(m[2]?'/'+m[2]:'')+'.pgn':null;
  }
  async function fetchStudy(url){
    const u=studyApi(url); if(!u) throw new Error('That is not a Lichess study link (https://lichess.org/study/…).');
    const r=await get(u);
    if(r.status===403||r.status===404) throw new Error('Lichess would not share that study: make it public or unlisted, then try again.');
    if(!r.ok) throw new Error('Lichess answered '+r.status+'.');
    const pgn=r.body; if(!/\d\.\s*[A-Za-z]/.test(pgn)) throw new Error('That study has no moves.');
    const tag=k=>{ const m=pgn.match(new RegExp('\\['+k+' "([^"]*)"\\]')); return m?m[1]:'' };
    const o=tag('Orientation');
    return {pgn,name:(tag('StudyName')||tag('Event')||'').slice(0,60),side:o==='black'||o==='white'?o:'',chapters:(pgn.match(/\[Event /g)||[]).length};
  }
  async function tablebase(fen,ms=6000){
    try{ const r=await get('https://tablebase.lichess.ovh/standard?fen='+encodeURIComponent(fen),ms,'json'); return r.ok?r.body:null }catch(e){ return null }
  }
  function needs(el,what,retry){
    if(!el) return; el.innerHTML=`<div class="card needs-net"><p><b>${escH(what)} needs the internet.</b></p><p class="note">${escH(why())}</p>${retry?'<button type="button" class="btn sm">Try again</button>':''}</div>`;
    if(retry) el.querySelector('button').onclick=retry;
  }
  const api={online,studyApi,fetchStudy,tablebase,needs,why,get,blockedHere:''};
  return api;
})();
