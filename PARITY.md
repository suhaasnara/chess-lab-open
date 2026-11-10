# Chess Lab Open and the private Chess Lab: what matches, what differs, and the plan

Chess Lab Open is the public version of Suhaas's private training site, Chess Lab. The two should feel like the
same tool. The only intended difference is the data: the private site is built around his own games, course PGNs,
calculation books and opponents, and none of that can be published. Everything that works on open data, or on the
visitor's own data, belongs in both.

This file records where the two stand (as of the `one-codebase` branch, 9 Nov 2026) and how to close the rest.

## Now the same in both

| Feature | Notes on the Open version |
| --- | --- |
| Board: arrows and circles | Right-click / right-drag, Shift red, Alt/Ctrl blue, Shift+Alt yellow; cleared by a left click or a new position. A PGN's own `[%cal]`/`[%csl]` shows where its notes show. Same `window.Shapes` module, rewritten comments. |
| Takebacks | Play (counted on the saved game), opening trainer (your move and the reply; that position isn't rated again), endgames and calculation (they already had them). In puzzles and drills Open never plays a wrong move on the board, so "try again" is already the retry, and only the first try counts. |
| Move marks and evaluation signs | `$1`–`$19`, `$146` and the rest as !, ?, !!, ??, !?, ?!, □, =, ∞, ⩲, ⩱, ±, ∓, +−, −+, N … beside the moves of imported repertoires and Guess-the-move games. |
| Dark mode | Settings → Theme. Only colour variables change (`--head`, `--on-navy`, `--blue-bg` as in the private site). Open defaults to Match device; the private site defaults to Light. Dark text colours are checked for 4.5:1 contrast in the tests. |
| Opening trainer | Rated/Training, opponent level 1000 → Elite, rating v2, line length, the PGN's own notes beside the move list (Training live, Rated at the end), take back, ← → through the line, Arrange, start lines per repertoire, Sidelines in repertoires (Realistic / Balanced / Sidelines first, the same weighting: share × games that stay in your file, recent-line damping, missed lines first), trappy opponent, minimum share, eval bar, Stockfish info after a line, Statistics with the average end-of-line eval. FEN-start PGNs. |
| Custom positions | "+ New position" (both sides' moves or a FEN, name, side; rename/edit, delete), "Save this position" from the trainer, and "Anything as White / Black" from move 1. Stored as `custom-<id>` like the private site's custom openings, in localStorage and the progress export. |
| Players | Same idea and the same sheet shape, on the visitor's data: any Lichess or Chess.com username, games fetched by the browser. What they play with each colour, an explorer board, Train vs (their moves while their games go, then the book), a printable pre-round sheet with the line to expect against your imported repertoire. |
| Watch | Same library logic (series, Resume/Continue, position, watched, Watched up to here, notes with timestamp links, bookmarks, tag edits, deep links and no embeds), on videos the visitor adds. |
| Guess the move | Scoring, notes after each move, Show the game, arrows keys, eval graph; plus your own PGNs (notes, side lines, marks, arrows), judged live by Stockfish. |
| Tactics, Calculation, Endgames, Drills, Play, Today, Progress | Already matched before this branch (on CC0 Lichess data). |
| Header | Shared code since 10 Nov 2026 (`shared/nav.js`): the same tab row, Extra drop-down and Settings link; Open's main row adds Analyze my games, which moves into Extra on phones. |
| Every tab's layout | Shared screens (stages 2–6, branch `shared-screens`): `shared/trainview.css` + `shared/trainview.js` hold the private site's layouts (list \| board \| coach card, lobby pages, three columns, Play, Watch, Settings, report pages) and small render helpers. Each site keeps its own tab logic, data and progress keys around them. |

## Still different, and why

| Private feature | Why it is not in Open |
| --- | --- |
| Built-in repertoires (from his course PGNs, with the courses' notes and arrows) | Course content is copyrighted and private. Open has presets plus import: anyone can bring their own PGN or Lichess study, notes and all. |
| Calculation exercises from his calculation books, with the books' notes | Book content. Open uses 1,092 hard CC0 Lichess puzzles in the same exercise format. |
| Annotated master games from books in Guess the move | Book annotations. Open has master games from the CC0 Lichess broadcast database (moves only), some of Suhaas's own games, and the visitor's own PGNs. |
| Players with over-the-board data, his notes and built prep lines; Events (event prep) | Opponents' names, event and US Chess data are private. Open's Players works on public online games of any username the visitor types. |
| Report card over his whole history (OTB / online / combined), "Your prep in your games", Punish drills from his OTB games | His games. Open's Analyze my games builds the same kind of report and drills from the visitor's own recent games. |
| Explain this position (asks Claude) | Needs the Claude artifact runtime; Open is a static site with no server and no keys. |
| Account sync, offline copy, Chess Lab Pocket | Private hosting. Open keeps progress in the browser with JSON export/import and works offline once loaded (everything is static). |
| Lichess server evals stored for his repertoires (eval column in the move list) | Built from his repertoires. Open's eval bar uses Stockfish in the browser instead. |
| Alpha pieces | Free for personal non-commercial use only, so Open ships cburnett (see CREDITS.md). |

## Not ported yet (no private data needed)

Done on `one-codebase` (9 Nov 2026): board and input settings (animation, coordinates, last move, move dots, sounds,
auto-next, tap/drag), the opening-trainer extras (Never play this reply, the review queue of your mistakes, Play as
the other side, captured pieces, the eval column, Show mistakes after a line), and a plain right-click colour setting
(so Firefox users get red without Shift). Still open:

1. **Players**: opening names per line in the explorer, a rating/time-window filter, and your own notes on a player.
2. **Watch on Today**: the private site's balanced daily plan (resume + one video from two other topics). Open shows
   only the video in progress.

## Plan: one source, two builds

Today the two sites are separate code that has been ported back and forth by hand. The plan to stop that:

1. **Shared modules first** (no behaviour change): move the code both sites run into one place, written against a
   small interface instead of each site's globals:
   `shared/board.js` (board, drag/tap, `Shapes`), `shared/pgn.js` (PGN parser with notes, NAGs and shapes, the
   Guess-the-move parser), `shared/engine.js` (the Stockfish worker and its watchdog), `shared/theme.css` (the
   colour variables, light and dark), `shared/trainer-core.js` (rating v2, variety weighting, takeback rules).
   Each needs a `Store` (get/put/del) and a `Book` (moves/now/oppMoves) passed in.
2. **Make the public repo the home of the shared code.** It is MIT and already clean; the private kit pulls it in
   (git subtree or a pinned copy in `site/src/shared/`), so a fix made in either place lands in both.
3. **Data adapters, not forks**: the private site keeps its own adapters (account database store, built-in
   repertoires, course annotations, OTB players); Open keeps localStorage, imports and public APIs. Features check
   for data, not for which site they're on (Players with OTB data shows OTB sections; without, only online).
4. **One test suite for the shared code**, run by both repos, plus each site's own data tests. The browser smoke
   test (Firefox + Chromium) runs on both.
5. **Privacy stays enforced at the boundary**: `tools/privacy_guard.py` runs on every change to the shared code in
   the public repo, so nothing from the private kit can come back through it.

Order of work: board + Shapes + theme (smallest, already identical), then the PGN parser, then the engine, then the
trainer core (largest, most behaviour to keep stable: drill ids and opening ratings must not change).

### Progress (branch `one-codebase`, 9 Nov 2026)

The shared code lives in **`site/shared/`** (this repo, MIT). The private kit keeps a pinned copy in its
`site/src/shared/` (a `PIN.json` with the commit and a SHA-256 per file; its CI fails if the copy is edited there).
Shared files declare one namespace each; each site keeps its own short names as thin wrappers.

| Stage | Shared file | What it holds | Status |
| --- | --- | --- | --- |
| 1 | `theme.css`, `shapes.js`, `board.js` | colour variables (light / dark / match device); arrows and circles; `Board.draw`, `Board.bind` (tap or drag, optional input mode), `makeBoard`, `endBanner` | done, both sites |
| 2 | `pgn.js` | `PGN.normKey` / `PGN.posId` (golden-value tested), NAG signs, note cleaning, arrows, `PGN.read` (games, nested variations, notes, marks, arrows) | done, both sites (repertoire import; the Guess-the-move parsers are still separate) |
| 3 | `engine.js` | `EngineKit.create(builds)`: one Stockfish worker, watchdog, queue, cache; each site passes where its builds are served from | done, both sites |
| 4 | `trainer-core.js` | rating v2 scale (difficulty, start 1800, K 40→16, short-line weight), "Sidelines in repertoires" weights, trappy factor, weighted pick | done, both sites (incl. the line-end rule, `lineDelta`) |

| 5 | `net.js` | everything that needs the internet: Lichess studies, the tablebase, import-to-Lichess review, one clear "needs internet" card (also where a page can't reach other sites) | done, both sites |
| 6 | `endgame-core.js` | tablebase grading and the defender's reply (keeps the result, keeps material, fewest saving replies, resists longest when losing) | done, both sites |
| 7 | `keys.js`, `help.js`, `puzzles.js`, `controls.js` | one keyboard layer with a `?` list (never while typing, no browser clashes), the small ? explanations, puzzle titles and themes, the rating slider and multi-select | done, both sites |
| 8 | `reader.js`, `shared.css` | the phone reader (board on top, notes below, Prev / Next at the bottom) in Openings notes, Guess the move, Calculation, Endgames (and the private Players studies); hidden on iPads and desktops | done, both sites; checked in Firefox and Chromium on iPhone sizes |
| 9 | `trainview.css`, `trainview.js` | the screens' layouts and render helpers (shared screens, stages 2–6) | done, both sites (the private site pixel-identical; Open re-laid out) |

Still to share: the opening trainer's line flow around the core, the Guess-the-move parser, and each tab's logic
(each site still has its own tab files, now thin around the shared modules and layouts).

**Rating at the end of a line (settled 9 Nov 2026):** both sites now use `TrainerCore.lineDelta`: each rated move is a
game, and your average score is compared with the average of each move's expected score (the private site's rule; Open
used to take the expected score at the average difficulty). Same on even lines; on very uneven lines Open's updates move
by a few points. Stored ratings are untouched.

Privacy: `tools/privacy_guard.py --build site` now checks the exact folder that is deployed, and fails closed.
