/* Chess Lab Open — optional "Connect Lichess" (OAuth 2 with PKCE, no scopes).
   Since October 2026 the Lichess opening explorer only answers signed-in requests.
   A scope-less token can only read public data; it is kept in this browser
   (localStorage) and sent only to lichess.org and explorer.lichess.ovh. No server of ours sees it.
   Code by Suhaas Narayanan (with Claude), MIT. */
'use strict';
window.LichessAuth=(()=>{
  const HOST='https://lichess.org', CLIENT='chess-lab-open', KEY='clo-lichess';
  const read=()=>{ try{ return JSON.parse(localStorage.getItem(KEY)||'null') }catch(e){ return null } };
  const write=v=>{ try{ v?localStorage.setItem(KEY,JSON.stringify(v)):localStorage.removeItem(KEY) }catch(e){} };
  let cur=read();
  if(cur&&cur.exp&&cur.exp<Date.now()) { cur=null; write(null) }
  const listeners=[];
  const changed=()=>listeners.forEach(f=>{ try{ f() }catch(e){} });

  const b64url=buf=>btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  const rand=n=>{ const a=new Uint8Array(n); crypto.getRandomValues(a); return b64url(a) };
  const redirectUri=()=>location.origin+location.pathname;

  async function login(){
    const verifier=rand(48), state=rand(16);
    const challenge=b64url(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier)));
    try{ sessionStorage.setItem(KEY+'-pkce',JSON.stringify({verifier,state,hash:location.hash||'#openings'})) }catch(e){}
    const q=new URLSearchParams({response_type:'code',client_id:CLIENT,redirect_uri:redirectUri(),
      code_challenge_method:'S256',code_challenge:challenge,state});
    api.go(HOST+'/oauth?'+q.toString());
  }
  /* Back from Lichess: ?code=…&state=… (or ?error=…). Exchange the code for a token. */
  async function handleRedirect(){
    const p=new URLSearchParams(location.search);
    if(!p.has('code')&&!p.has('error')) return null;
    let saved=null; try{ saved=JSON.parse(sessionStorage.getItem(KEY+'-pkce')||'null'); sessionStorage.removeItem(KEY+'-pkce') }catch(e){}
    const clean=()=>{ try{ history.replaceState(null,'',location.pathname+((saved&&saved.hash)||location.hash||'')) }catch(e){} };
    if(p.has('error')||!saved||p.get('state')!==saved.state){ clean(); return {ok:false,why:p.get('error')||'state mismatch'} }
    try{
      const r=await fetch(HOST+'/api/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
        body:new URLSearchParams({grant_type:'authorization_code',code:p.get('code'),code_verifier:saved.verifier,
          redirect_uri:redirectUri(),client_id:CLIENT}).toString()});
      if(!r.ok) throw new Error('token '+r.status);
      const j=await r.json();
      cur={token:j.access_token,exp:Date.now()+(+j.expires_in||31536000)*1000-86400000,user:null};
      write(cur); clean();
      try{ const a=await fetch(HOST+'/api/account',{headers:{Authorization:'Bearer '+cur.token}}); if(a.ok){ const u=await a.json(); cur.user=u.username||u.id||null; write(cur) } }catch(e){}
      changed(); return {ok:true};
    }catch(e){ clean(); return {ok:false,why:String(e.message||e)} }
  }
  async function logout(){
    const t=cur&&cur.token; cur=null; write(null); changed();
    if(t) try{ await fetch(HOST+'/api/token',{method:'DELETE',headers:{Authorization:'Bearer '+t}}) }catch(e){}
  }
  /* The explorer refused the token (revoked or expired): forget it. */
  function invalidate(){ if(cur){ cur=null; write(null); changed() } }
  const api={go:u=>location.assign(u),login,logout,handleRedirect,invalidate,onChange:f=>listeners.push(f),
    get token(){ return cur&&cur.token||null }, get user(){ return cur&&cur.user||null },
    ready:null};
  api.ready=handleRedirect();
  return api;
})();
