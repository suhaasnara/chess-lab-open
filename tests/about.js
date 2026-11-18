/* Tests for the About page (#about, 18 Nov 2026): it routes, says what it must, and stays exact. It is also the iPhone
   and Apple Watch app's privacy policy, so every outside host the site's code calls must be named on it: a new one fails
   here until the page says so. The parts about the app show only inside it. */
'use strict';
const fs=require('fs'), path=require('path');

module.exports=async H=>{
  const {makePage,sleep,assert,section}=H;

  section('t78: About, privacy and licences (#about)');
  { const {w}=await makePage(); const d=w.document;
    w.location.hash='#about'; await sleep(60);
    const s=d.getElementById('about');
    assert(d.body.dataset.view==='about'&&!s.hidden&&d.title.startsWith('About'),'#about opens the page, with its own title');
    const t=s.textContent.replace(/\s+/g,' ');
    assert(/We collect nothing/.test(t)&&/no accounts, no analytics, no ads, no tracking and no cookies/.test(t),'the privacy policy says plainly that nothing is collected');
    assert(/In effect since \d+ \w+ 20\d\d/.test(t),'… and when it took effect');
    for(const [part,lic] of [['Stockfish','GPL-3.0'],['chess.js','BSD-2-Clause'],['cburnett','GPLv2+'],['maple','AGPL-3.0+'],['Lichess puzzles','CC0'],['fonts','SIL Open Font License']]){
      const row=[...s.querySelectorAll('#ab-licences tr')].find(r=>r.textContent.includes(part));
      assert(row&&row.textContent.includes(lic),`licence row: ${part}, ${lic}`) }
    assert(d.querySelector('footer a[href="#about"]')&&d.querySelector('#settings a[href="#about"]'),'linked from the footer and from Settings');
    assert(!d.documentElement.classList.contains('in-app')&&s.querySelectorAll('.app-only').length>=3,'on the website the app-only parts are marked to stay hidden');

    // every outside host the code can call is named on the page
    const src=['js','shared'].flatMap(dir=>fs.readdirSync(path.join(H.SITE,dir)).filter(f=>f.endsWith('.js')).map(f=>fs.readFileSync(path.join(H.SITE,dir,f),'utf8'))).join('\n');
    const called=new Set([...src.matchAll(/https:\/\/([a-z0-9.-]+)/g)].map(m=>m[1]));   /* every host in the code, links too */
    const named=h=>t.includes(h)||[...s.querySelectorAll('a')].some(a=>{ try{ return new URL(a.href).hostname===h }catch(e){ return false } });
    const missing=[...called].filter(h=>!named(h));
    assert(called.size>=5&&!missing.length,`every host the code calls is on the page (${[...called].sort().join(', ')})${missing.length?' — missing: '+missing.join(', '):''}`);
  }
  { const {w}=await makePage({beforeLoad:w=>{ w.Capacitor={isNativePlatform:()=>true,Plugins:{}}; w.localStorage.setItem('clo-app',JSON.stringify({welcomed:true,asked:true})) }});
    const d=w.document; await sleep(100);
    assert(d.documentElement.classList.contains('in-app'),'inside the app the page has class in-app, so the app-only parts show');
    const box=d.getElementById('appbox');
    assert(box&&box.querySelector('a[href="#about"]'),'the app\'s Settings card links to About, privacy and licences');
    assert(/github\.com\/suhaasnara\/chess-lab-open-app/.test(d.getElementById('ab-source').innerHTML)&&/GPL-3\.0-or-later/.test(d.getElementById('ab-licences').textContent),'… where the app\'s source and licence are named');
  }
};
