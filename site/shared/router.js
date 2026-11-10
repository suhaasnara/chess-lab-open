/* Shared (Chess Lab and Chess Lab Open). Home: chess-lab-open/site/shared/ (MIT); the private kit pulls a pinned copy.
   The page router: which section is on screen for the address's #hash. Each site passes its own table of views.
     Router.start({
       views:    {name: {el: 'id' | ['id', ...],  view?: 'body data-view' (default name),  nav?: 'tab to mark' (default name)}},
       prefixes: {'sheet/': {name: 'players', view: 'sheet'}},   // hashes that start with this map to a view (checked first)
       fallback: 'today',                                        // an unknown or empty hash
       title:    v => 'document title' | null,                   // optional
       scrollTop: true,                                          // a new view starts at the top (the first load too)
       onShow:   (name, {changed, first}) => {}                  // the site's own work for that view (render, start the engine ...)
     })
   A hash is read up to '?' and '/' ("#analyze?u=name", "#openings/new"), unless a prefix matches. Elements of every other
   view are hidden; elements shared by several views (one module showing several tabs) stay shown for each of them.
   Router.current() = the name on screen; Router.route() re-applies the current hash. */
window.Router=(()=>{
  let C=null, shown=null, first=true;
  const ids=x=>Array.isArray(x)?x:[x];
  function parse(hash){
    const raw=String(hash||'').replace(/^#/,'').split('?')[0];
    for(const [pre,to] of Object.entries(C.prefixes||{})) if(raw.startsWith(pre)) return {name:to.name,view:to.view||to.name};
    let name=raw.split('/')[0]; if(!C.views[name]) name=C.fallback;
    return {name,view:C.views[name].view||name};
  }
  function route(){
    const {name,view}=parse(location.hash), V=C.views[name];
    const changed=shown!==null&&shown!==name, wasFirst=first; shown=name; first=false;
    document.body.dataset.view=view;
    if(C.title){ const t=C.title(name); if(t!=null) document.title=t }
    const on=new Set(ids(V.el));
    for(const v of Object.values(C.views)) for(const id of ids(v.el)){ const e=document.getElementById(id); if(e) e.hidden=!on.has(id) }
    if(window.Nav) Nav.set(V.nav||name);   /* shared/nav.js: marks the tab (or Extra), closes the menu, keeps the tab in view */
    if(C.scrollTop){ const top=()=>{ if(document.scrollingElement) document.scrollingElement.scrollTop=0 };
      if(changed) top(); if(wasFirst){ requestAnimationFrame(top); addEventListener('load',top,{once:true}) } }   /* a #tab link jumps to the section; start at the top instead */
    if(C.onShow) C.onShow(name,{changed,first:wasFirst});
  }
  function start(cfg){ C=cfg; addEventListener('hashchange',route); route() }
  return {start,route,current:()=>shown,parse:h=>parse(h)};
})();
