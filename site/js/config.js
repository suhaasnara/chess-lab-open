/* Chess Lab Open — this site's config (shared/site.js): its tabs, its pieces and where its data is served from.
   The private Chess Lab has its own (same shape); the shared code reads whichever site it is running on. */
'use strict';
Site.define({
  id:'open', name:'Chess Lab Open',
  tabs:{
    main:[['today','Today'],['openings','Openings'],['drills','Drills'],['tactics','Tactics'],['analyze','Analyze my games','Report card and drills from your own games'],['progress','Progress']],
    extra:[['guess','Guess the move','Master games and your own, move by move'],['calc','Calculation','Long puzzles, timed, with a free board'],
      ['endgames','Endgames','Textbook endings against perfect defence'],['watch','Watch','Your video library: place, notes, bookmarks'],
      ['play','Play','Games against Stockfish, blindfold'],['players','Players','Any Lichess or Chess.com player: openings, pre-round sheet'],
      ['blundercheck','Blunder check','Your blunders from a Chess Lab pack: spot the threat, then your move']]},
  pieces:'cburnett',   /* GPLv2+ (CREDITS.md); style.css draws assets/pieces/cburnett */
  data:{
    tactics:'data/tactics.json', calc:'data/calc.json', endgames:'data/endgames.json',
    gtmIndex:'data/gtm/index.json', gtm:f=>'data/gtm/'+f,
  },
});
