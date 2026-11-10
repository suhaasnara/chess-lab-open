/* Chess Lab: the per-site config (v82). Each site states once what makes it that site, and the shared code and the site's
   own tabs read it from here instead of carrying their own copies:
     tabs    the header's main row and Extra menu (shared/nav.js's {main, extra} items)
     pieces  the piece set the site's CSS draws ('cburnett' here; the private site 'alpha', licensed for personal use only)
     data    where each data file is served from: Site.url('tactics') etc.; a function for files per item
   Site.define(cfg) once, before router.js; window.SITE is the frozen config.
   Home: chess-lab-open/site/shared/ (MIT). The private kit pulls a pinned copy; edit it here, never there. */
'use strict';
window.Site=(()=>{
  let cfg=null;
  const freeze=o=>{ if(o&&typeof o==='object'&&!Object.isFrozen(o)){ Object.freeze(o); for(const k of Object.keys(o)) freeze(o[k]) } return o };
  function define(c){
    if(cfg) throw new Error('Site.define: already defined');
    for(const k of ['id','name','tabs','pieces','data']) if(c[k]==null) throw new Error('Site.define: missing '+k);
    if(!Array.isArray(c.tabs.main)||!Array.isArray(c.tabs.extra)) throw new Error('Site.define: tabs needs main and extra');
    cfg=freeze(c); window.SITE=cfg; return cfg;
  }
  /* Site.url('players') -> 'players.json'; Site.url('player', id) -> 'players/<id>.json' */
  function url(name,...args){
    if(!cfg) throw new Error('Site.url before Site.define');
    const u=cfg.data[name]; if(u==null) throw new Error('Site.url: no data source "'+name+'"');
    return typeof u==='function'?u(...args):u;
  }
  return {define,url,get config(){ return cfg }};
})();
