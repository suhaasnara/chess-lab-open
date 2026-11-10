/* Shared (Chess Lab and Chess Lab Open). Home: chess-lab-open/site/shared/ (MIT); the private kit pulls a pinned copy.
   Two small filter controls.
   Controls.range(el, {min, max, step, lo, hi, label, onChange(lo, hi)})   a two-handle slider (two range inputs over one
     track; keyboard and touch work as on any range input). Returns {set(lo, hi), get()}.
   Controls.multi(el, {label, options:[[value, text]], selected:[values], none:'Any', onChange(values)})   a dropdown with
     a checkbox per option (a <details>, so it opens like a menu and needs no script to show). Empty = any.
     Returns {set(values), get()}. */
window.Controls=(()=>{
  const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  let uid=0;
  function range(el,o){
    const id='rg'+(++uid), st=o.step||100;
    el.innerHTML=`<div class="rng"><div class="rng-head"><span class="label" id="${id}">${esc(o.label||'Rating')}</span> <b class="rng-val mono"></b></div>
      <div class="rng-track"><span class="rng-fill"></span><input type="range" class="rng-lo" min="${o.min}" max="${o.max}" step="${st}" aria-labelledby="${id}" aria-label="From">
      <input type="range" class="rng-hi" min="${o.min}" max="${o.max}" step="${st}" aria-labelledby="${id}" aria-label="To"></div></div>`;
    const lo=el.querySelector('.rng-lo'), hi=el.querySelector('.rng-hi'), val=el.querySelector('.rng-val'), fill=el.querySelector('.rng-fill');
    const paint=()=>{ const a=+lo.value, b=+hi.value, span=o.max-o.min; val.textContent=a<=o.min&&b>=o.max?'any':`${a}–${b}`;
      fill.style.left=((a-o.min)/span*100)+'%'; fill.style.right=((o.max-b)/span*100)+'%' };
    const fix=which=>{ if(+lo.value>+hi.value){ if(which==='lo') hi.value=lo.value; else lo.value=hi.value } paint() };
    lo.addEventListener('input',()=>fix('lo')); hi.addEventListener('input',()=>fix('hi'));
    const fire=()=>o.onChange&&o.onChange(+lo.value,+hi.value);
    lo.addEventListener('change',fire); hi.addEventListener('change',fire);
    const api={set(a,b){ lo.value=a==null?o.min:a; hi.value=b==null?o.max:b; paint() },get:()=>[+lo.value,+hi.value]};
    api.set(o.lo,o.hi); return api;
  }
  function multi(el,o){
    let sel=new Set(o.selected||[]);
    const sum=()=>sel.size?(sel.size<=2?[...sel].map(v=>(o.options.find(x=>x[0]===v)||[v,v])[1]).join(', '):`${sel.size} chosen`):(o.none||'Any');
    el.innerHTML=`<details class="msel"><summary><span class="label">${esc(o.label||'')}</span> <span class="msel-sum"></span></summary>
      <div class="msel-pop" role="group" aria-label="${esc(o.label||'')}"><div class="msel-acts"><button type="button" class="btn sm" data-all="0">Clear</button></div>
      ${o.options.map(([v,t])=>`<label class="msel-row"><input type="checkbox" value="${esc(v)}"> ${esc(t)}</label>`).join('')}</div></details>`;
    const d=el.querySelector('details'), s=el.querySelector('.msel-sum');
    const paint=()=>{ s.textContent=sum(); el.querySelectorAll('input[type=checkbox]').forEach(c=>{ c.checked=sel.has(c.value) }) };
    el.addEventListener('change',e=>{ const c=e.target; if(!c.matches('input[type=checkbox]')) return; if(c.checked) sel.add(c.value); else sel.delete(c.value); paint(); o.onChange&&o.onChange([...sel]) });
    el.querySelector('[data-all]').addEventListener('click',()=>{ sel=new Set(); paint(); o.onChange&&o.onChange([]) });
    document.addEventListener('click',e=>{ if(d.open&&!el.contains(e.target)) d.open=false });
    paint();
    return {set(v){ sel=new Set(v||[]); paint() },get:()=>[...sel]};
  }
  return {range,multi};
})();
