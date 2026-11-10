/* Test harness: loads site/index.html in jsdom with the scripts run in order,
   a fetch that serves site files from disk, a mocked opening explorer and a
   mocked engine — the same pattern as the private kit's tests. */
'use strict';
const {JSDOM}=require('jsdom');
const fs=require('fs'), path=require('path');
const SITE=path.join(__dirname,'..','site');

const SCRIPTS=['vendor/chess.js','shared/board.js','shared/shapes.js','shared/pgn.js','shared/engine.js','shared/trainer-core.js','shared/net.js','shared/endgame-core.js','shared/keys.js','shared/puzzles.js','shared/help.js','shared/reader.js','shared/controls.js','js/shared.js','js/book.js','js/openings.js','js/tactics.js','js/calc.js','js/endgames.js',
  'js/analyze.js','js/drills.js','js/play.js','js/gtm.js','js/players.js','js/watch.js','js/today.js','js/progress.js','js/settingspage.js','js/router.js'];

/* A small book standing in for the static books (data/masters.json, data/club/*.json), keyed by 'board side'. */
const EXPLORER={
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w':[
    ['e2e4',4000,3000,3000],['d2d4',3500,3200,3300],['g1f3',1000,900,800],['c2c4',900,800,700]],
  'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b':[
    ['e7e5',2000,1500,1500],['c7c5',2500,1700,1800]],
  'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w':[['g1f3',2200,1600,1400]],
  'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b':[['b8c6',1500,1200,1000]],
  'rnbqkbnr/pppppppp/8/8/2P5/8/PP1PPPPP/RNBQKBNR b':[['e7e5',1200,900,900]],
  'rnbqkbnr/pppp1ppp/8/4p3/2P5/8/PP1PPPPP/RNBQKBNR w':[['b1c3',1500,1100,900],['g1f3',400,300,300]],
  'rnbqkbnr/pppp1ppp/8/4p3/2P5/2N5/PP1PPPPP/R1BQKBNR b':[['g8f6',900,700,600]],
};
/* the mock book in the static format: { posId: [[uci, games, white, draws, black]] } */
function staticBook(w){
  const out={};
  for(const k in EXPLORER){
    const fen=k+' KQkq - 0 1';
    out[w.posId(w.normKey(fen))]=EXPLORER[k].map(r=>[r[0],r[1]+r[2]+r[3],r[1],r[2],r[3]]);
  }
  return out;
}

async function makePage(opts={}){
  const html=fs.readFileSync(path.join(SITE,'index.html'),'utf8');
  const dom=new JSDOM(html,{url:'https://chess-lab-open.test/',runScripts:'dangerously',pretendToBeVisual:true});
  const w=dom.window;
  if(opts.url) dom.reconfigure({url:opts.url});
  w.TextEncoder=TextEncoder;
  try{ Object.defineProperty(w,'crypto',{value:require('crypto').webcrypto}) }catch(e){}
  w.confirm=()=>true;
  w.fetch=async(url,init)=>{
    url=String(url);
    if(opts.fetch){ const r=await opts.fetch(url,init); if(r) return r }
    if(/data\/(masters|club\/b\d\d)\.json/.test(url)){
      if(opts.noBooks) return {ok:false,status:404,json:async()=>{throw new Error('404')},text:async()=>''};
      return okJson(staticBook(w));
    }
    const m=url.match(/^https:\/\/chess-lab-open\.test\/(.+)$/)||url.match(/^(?!https?:)(.+)$/);
    if(m){
      const p=path.join(SITE,m[1].split('?')[0]);
      if(fs.existsSync(p)) return {ok:true,status:200,json:async()=>JSON.parse(fs.readFileSync(p,'utf8')),text:async()=>fs.readFileSync(p,'utf8')};
      return {ok:false,status:404,json:async()=>{throw new Error('404')},text:async()=>''};
    }
    return {ok:false,status:404,json:async()=>{throw new Error('404')},text:async()=>''};
  };
  function okJson(o){ return {ok:true,status:200,json:async()=>o,text:async()=>JSON.stringify(o)} }
  let scriptErr=null;
  w.addEventListener('error',e=>{ if(!scriptErr) scriptErr=e.error||e.message });
  for(const s of SCRIPTS){
    const code=fs.readFileSync(path.join(SITE,s),'utf8');
    const el=w.document.createElement('script'); el.textContent=code;
    w.document.body.appendChild(el);
    if(scriptErr) throw new Error(s+' failed to run: '+(scriptErr.message||scriptErr));
  }
  /* The engine: never a real worker in jsdom. Tests pass their own analyse. */
  w.SharedEngine.start=()=>{};
  w.SharedEngine.analyse=opts.analyse||(async()=>null);
  await w.Book.ready();
  return {dom,w};
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let failures=0;
function assert(cond,msg){ if(cond){ console.log('   ok -',msg) } else { failures++; console.log('   FAIL -',msg) } }
function section(name){ console.log('\n== '+name) }
module.exports={makePage,sleep,assert,section,get failures(){return failures},SITE};
