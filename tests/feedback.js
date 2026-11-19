/* Tests for the 18 Nov 2026 phone feedback (from the first run in the iPhone app): lists are part of the page with
   "Show more"; the room for the bottom bar is at the end of the page, so the footer isn't under it; Openings' strip under
   the board no longer repeats the card; Guess the move's "Read the game" is in the bar; Analyze puts the drills first. */
'use strict';
const fs=require('fs'), path=require('path');

module.exports=async H=>{
  const {makePage,sleep,assert,section}=H;
  const read=f=>fs.readFileSync(path.join(H.SITE,f),'utf8');

  section('t80: phones: a list is part of the page, 20 rows and Show more');
  { const phone=w=>{ w.matchMedia=q=>({matches:/max-width:\s*860px/.test(q),media:q,addEventListener(){},removeEventListener(){}}) };
    const {w}=await makePage({beforeLoad:phone}); const d=w.document;
    w.location.hash='#tactics'; await w.TacticsTab.ensure(); await sleep(150);
    const list=d.getElementById('t-list'), rows=[...list.children], shown=rows.filter(x=>!x.classList.contains('lm-hide'));
    const more=list.nextElementSibling;
    assert(rows.length>40&&shown.length<=21&&shown.length>=20,`the Tactics list shows 20 of ${rows.length} rows (and the current one)`);
    assert(more&&more.classList.contains('lmore')&&!more.hidden&&/Show more \(\d/.test(more.textContent),'… with "Show more" under it, saying how many are left');
    more.click();
    assert(rows.filter(x=>!x.classList.contains('lm-hide')).length>=40,'… which adds the next 20');
    const cur=rows.find(x=>x.getAttribute('aria-current')==='true');
    assert(!cur||!cur.classList.contains('lm-hide'),'the current puzzle is never hidden');
    const css=read('shared/trainview.css');
    assert(/\.tv \.list,\.tv \.list\.long,\.tv \.list\.longest\{max-height:none;min-height:0;overflow:visible\}/.test(css),'on phones the list is no longer a 300 px scrolling box');
  }
  { const {w}=await makePage(); await w.TacticsTab.ensure(); await sleep(100);
    const list=w.document.getElementById('t-list');
    assert(!list.querySelector('.lm-hide')&&list.nextElementSibling.hidden,'on a laptop (no phone query) the whole list stays in its column, no button'); }

  section('t81: the footer is never under the bottom bar; Openings, Guess the move, Analyze');
  { const css=read('shared/trainview.css');
    assert(/body:has\(\.bbar-host:not\(\[hidden\]\)\)\{padding-bottom:calc\(88px \+ env\(safe-area-inset-bottom,0px\)\)!important\}/.test(css)&&!/\n\s*\.bbar-host\{padding-bottom/.test(css),
      'the room for the bar is at the end of the page (body), not inside the page, so the footer after it is clear');
    const op=read('js/openings.js'), line=op.split('\n').find(l=>l.includes("$('o-endtext').textContent="))||'';
    assert(line&&!/\$\{msg\}/.test(line)&&!/All right/.test(line),'Openings: the strip under the board no longer repeats the card ("Line ended here … All right")');
    const {w}=await makePage(); const d=w.document;
    assert(d.getElementById('g-show').textContent.trim()==='Read the game','Guess the move: the button is "Read the game"');
    assert(!/'#g-show'/.test(read('js/router.js').split('\n').find(l=>l.includes("TV.bar('#g-tools'"))||''),'… and it is in the bottom bar itself, not under ⋯');
    const as=read('js/astats.js'), i=as.indexOf('return `${head}'), body=as.slice(i,i+400);
    assert(i>0&&body.indexOf('ctx.save(')<body.indexOf('${bar}')&&body.indexOf('${bar}')<body.indexOf('${tiles}'),'Analyze: the source line, then the drills card, then the filters and the report');
  }
};
