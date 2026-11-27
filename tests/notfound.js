/* The 404 page (site/404.html, launch checklist 27 Nov 2026). GitHub Pages shows it at whatever address was missing,
   however deep, so every link and file it uses must be absolute and must exist. */
'use strict';
const fs=require('fs'), path=require('path');

module.exports=async H=>{
  const {assert,section}=H;
  section('t105: the 404 page');
  const html=fs.readFileSync(path.join(H.SITE,'404.html'),'utf8');
  const refs=[...html.matchAll(/(?:href|src)="([^"]+)"/g)].map(m=>m[1]);
  const local=refs.filter(u=>!/^https:\/\//.test(u));
  assert(local.length>=8&&local.every(u=>u.startsWith('/chess-lab-open/')),'every link and file on the 404 page is absolute (/chess-lab-open/…)');
  const missing=local.map(u=>u.replace(/^\/chess-lab-open\//,'').split('#')[0]).filter(f=>f&&!fs.existsSync(path.join(H.SITE,f)));
  assert(missing.length===0,'every file it loads exists'+(missing.length?': '+missing.join(', '):''));
  assert(/<meta name="robots" content="noindex">/.test(html)&&/Page not found · Think Ahead/.test(html),'it says Page not found and is kept out of search results');
  assert(/clo-settings[^<]*dataset\.theme/.test(html),'it follows the visitor\'s Light / Dark choice');
};
