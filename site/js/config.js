/* Chess Lab Open — this site's config (shared/site.js): its tabs, its pieces and where its data is served from.
   The private Chess Lab has its own (same shape); the shared code reads whichever site it is running on. */
'use strict';
Site.define({
  id:'open', name:'Chess Lab Open',
  tabs:{
    main:[['today','Today'],['openings','Openings'],['drills','Drills'],['tactics','Tactics'],['analyze','Analyze my games','Report card and drills from your own games'],['progress','Progress']],
    extra:[   /* grouped, two columns (shared nav.js, 13 Nov 2026) */
      ['blind','Blind tactics','Solve a puzzle from a position several moves back','Puzzles'],['calc','Calculation','Long puzzles, timed, with a free board','Puzzles'],
      ['blundercheck','Blunder check','Your blunders from a Chess Lab pack: spot the threat, then your move','Puzzles'],
      ['guess','Guess the move','Master games and your own, move by move','Study and play'],['endgames','Endgames','Textbook endings against perfect defence','Study and play'],
      ['play','Play','Games against Stockfish, blindfold','Study and play'],['watch','Watch','Your video library: place, notes, bookmarks','Study and play'],
      ['players','Players','Any Lichess or Chess.com player: openings, pre-round sheet','Opponents']]},
  pieces:'cburnett',   /* GPLv2+ (CREDITS.md); style.css draws assets/pieces/cburnett */
  data:{
    tactics:'data/tactics.json', blind:'data/blind.json', calc:'data/calc.json', endgames:'data/endgames.json',
    gtmIndex:'data/gtm/index.json', gtm:f=>'data/gtm/'+f,
  },
});
