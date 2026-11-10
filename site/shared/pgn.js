/* Shared (Chess Lab and Chess Lab Open). Home: chess-lab-open/site/shared/ (MIT); the private kit pulls a pinned copy.
   PGN reading and position ids. Needs only chess.js (0.10.x API) and TextEncoder. Everything is on window.PGN; each
   site keeps its own names for these (e.g. `function posId(k){ return PGN.posId(k) }`), so no global is declared twice.

   PGN.normKey(fen)  'board side castling ep', the en passant square kept only when the capture is legal
   PGN.posId(key)    53-bit FNV-1a pair of the key, base 36. NEVER change these two: opening progress, repertoires,
                     books and stored notes are all keyed by them (drill ids are separate: prefix + sha1(fen|uci)[:8]).
   PGN.NAGS          $n -> sign: !, ?, !!, ??, !?, ?!, □, =, ∞, ⩲, ⩱, ±, ∓, +−, −+, ⨀, ⟳, →, ↑, ⇆, ⊕, ∆, N
   PGN.shapes(c)     a comment's [%cal Ge2e4,Rd4d5] / [%csl Yd4] as "Ge2e4 Rd4d5 Yd4" (Shapes.auto's format)
   PGN.cleanNote(c)  a comment as plain text: no [%clk]/[%eval]/[%cal] tags, Lichess diagram/bracket markers or Chessable links
   PGN.read(text)    every game, nested variations, comments, NAGs and move marks -> one position -> move graph:
     { edges: Map(normKey -> [uci, ...]) both sides' moves, in the order first met,
       notes: {"<posId>|<uci>": {mk, text, sh}}  marks (!? ⩲ ...), note text, arrows/circles for that move,
       games, bad (moves that were not legal: the rest of that line is skipped), starts: [fen or '' per game] }
     A [FEN "..."] header starts that game there ('' in starts when it has none or it is invalid). A comment before
     a game's first move (or a variation's) goes to the next move. A null move (-- or Z0) ends its line. */
window.PGN=(()=>{
  function normKey(fen){
    const f=fen.split(' ');
    if(f[3]&&f[3]!=='-'){ const g=new Chess(fen); if(!g.moves({verbose:true}).some(m=>m.flags.includes('e'))) f[3]='-' }
    return f.slice(0,4).join(' ');
  }
  function posId(k){
    let h1=0x811c9dc5, h2=(0x01000193^0x9e3779b9)>>>0;
    for(const ch of new TextEncoder().encode(k)){ h1=Math.imul((h1^ch)>>>0,0x01000193)>>>0; h2=Math.imul((h2^ch)>>>0,0x01000193)>>>0 }
    return ((h1&0x1fffff)*4294967296+h2).toString(36);
  }
  const NAGS={1:'!',2:'?',3:'!!',4:'??',5:'!?',6:'?!',7:'□',8:'□',10:'=',11:'=',12:'=',13:'∞',14:'⩲',15:'⩱',16:'±',17:'∓',18:'+−',19:'−+',22:'⨀',23:'⨀',32:'⟳',33:'⟳',36:'→',37:'→',40:'↑',41:'↑',132:'⇆',133:'⇆',138:'⊕',139:'⊕',140:'∆',146:'N'};
  function shapes(c){ const out=[]; String(c).replace(/\[%c(?:al|sl)\s+([^\]]*)\]/g,(_,l)=>{ for(const x of l.split(/[\s,]+/)) if(/^[GRBY][a-h][1-8]([a-h][1-8])?$/.test(x)) out.push(x); return '' }); return [...new Set(out)].join(' ') }
  function cleanNote(c){ return String(c).replace(/\[%[^\]]*\]/g,'').replace(/StartFEN[\s\S]*?EndFEN/g,' ').replace(/StartBracket/g,'(').replace(/EndBracket/g,')')
    .replace(/\[\/(?:course|variation)\/[^\]]*\]/g,'').replace(/[-�]/g,'').replace(/\s+/g,' ').replace(/\(\s+/g,'(').replace(/\s+\)/g,')').trim().replace(/^[()\s]*$/,'') }
  const TOKEN=/\[\s*(\w+)\s+"((?:[^"\\]|\\.)*)"\s*\]|\{[^}]*\}|;[^\n]*|\(|\)|\$\d+|[^\s(){}[\];]+/g;
  function read(text){
    const edges=new Map(), notes={}, starts=[]; let games=0, bad=0;
    const add=(fen,uci)=>{ const k=normKey(fen); let a=edges.get(k); if(!a){ a=[]; edges.set(k,a) } if(!a.includes(uci)) a.push(uci) };
    const note=k=>notes[k]||(notes[k]={mk:'',text:'',sh:''});
    const addText=(k,txt)=>{ const e=note(k); if(!e.text.includes(txt)) e.text=e.text?e.text+'\n\n'+txt:txt };
    const addMark=(k,mk)=>{ const e=note(k); if(!e.mk.includes(mk)) e.mk+=mk };
    const re=new RegExp(TOKEN.source,'g');
    const src=String(text).replace(/^﻿/,'').replace(/\r/g,'');
    let start=null, g=null, before=null, stack=[], broken=false, inGame=false, lastKey=null, pre='', m;
    const begin=()=>{ let ok=false; if(start){ try{ ok=new Chess().validate_fen(start).valid }catch(e){} }
      g=ok?new Chess(start):new Chess(); before=null; stack=[]; broken=false; inGame=true; games++; starts.push(ok?g.fen():''); lastKey=null };
    while((m=re.exec(src))){
      const t=m[0];
      if(m[1]){ if(inGame){ inGame=false; start=null; pre='' } if(m[1].toLowerCase()==='fen') start=m[2].trim(); continue }
      if(t[0]==='{'){ const c=cleanNote(t.slice(1,-1)), sh=shapes(t);
        if(lastKey&&!broken){ if(c) addText(lastKey,c); if(sh){ const e=note(lastKey); e.sh=e.sh?e.sh+' '+sh:sh } }
        else if(c) pre=pre?pre+' '+c:c;
        continue }
      if(t[0]==='$'){ const mk=NAGS[+t.slice(1)]; if(mk&&lastKey&&!broken) addMark(lastKey,mk); continue }
      if(t[0]===';') continue;
      if(/^(1-0|0-1|1\/2-1\/2|\*)$/.test(t)){ if(inGame){ inGame=false; start=null } pre=''; continue }
      if(!inGame) begin();
      if(t==='('){ stack.push({fen:g.fen(),before,broken,lastKey}); if(before){ g=new Chess(before); broken=false } else broken=true; before=null; lastKey=null; pre=''; continue }
      if(t===')'){ const s=stack.pop(); if(s){ g=new Chess(s.fen); before=s.before; broken=s.broken; lastKey=s.lastKey } pre=''; continue }
      const mk=(t.match(/[!?]+$/)||[''])[0];
      const san=t.replace(/^\d+\.+/,'').replace(/^\.+/,'').replace(/[!?]+$/,'').replace(/^0-0-0/,'O-O-O').replace(/^0-0/,'O-O');
      if(!san||/^\d+$/.test(san)||san==='e.p.'||broken) continue;
      if(san==='--'||san==='Z0'){ broken=true; continue }
      const fb=g.fen(); const r=g.move(san,{sloppy:true});
      if(!r){ bad++; broken=true; continue }
      const uci=r.from+r.to+(r.promotion||'');
      add(fb,uci); before=fb;
      lastKey=posId(normKey(fb))+'|'+uci;
      if(mk) addMark(lastKey,mk); if(pre){ addText(lastKey,pre); pre='' }
    }
    for(const k in notes) if(!notes[k].mk&&!notes[k].text&&!notes[k].sh) delete notes[k];
    return {edges,notes,games,bad,starts};
  }
  return {normKey,posId,NAGS,shapes,cleanNote,read};
})();
