# Chess Lab Open

An open-source, bring-your-own-data chess trainer by
[Suhaas Narayanan](https://suhaasnarayanan.com/chess)
([CoachSuhaas](https://www.chess.com/member/CoachSuhaas) on Chess.com,
[suhaasn](https://lichess.org/@/suhaasn) on Lichess).
It is the public version of his private training site, Chess Lab, with none of
the private data: everything here runs on open databases and on games you fetch
yourself from your own accounts, entirely in your browser. No server, no
accounts, no uploads: progress lives in localStorage with JSON export/import.

## What it does

- **Today** — a short daily session built from your own progress: up to three
  drills from your games (new first, then misses, then reviews at 3 / 7 / 21 days),
  five puzzles near your puzzle rating and one opening line (your lowest-rated
  opening). It ticks off as you go, with a streak counter.
- **Openings** — train preset openings, or import your own repertoire as a PGN
  (paste it, choose a .pgn file, or paste the link to a public Lichess study), and drill it. The opponent plays real replies
  from books built from Lichess games: an **Opponent level** slider runs from
  Lichess 1000 up to Elite 2500+, and the book card shows your level's moves next
  to the elite book's. Each opening gets a rating: every move you find is scored
  against a difficulty from the elite share of the right move. No account needed.
  Your PGN's own **notes, move marks (!, ?, ⩲ …) and arrows** show beside the moves (as you play in
  Training; when the line ends in Rated). **Take back** (B) your move and the reply (that position isn't rated
  again); step through the line with ← →; **Arrange** the list; **Start lines here** for a repertoire;
  **Sidelines in repertoires** (Realistic / Balanced / Sidelines first) decides how often your prepared sidelines
  come up; the ⚙ holds the trainer settings (line length, the opponent's minimum share, trappy lines, eval bar,
  Stockfish info after a line, depth, and **Opponent level only for this opening**: that opening keeps its own level
  and the slider moves it); after a line with a miss, **Retry the miss** (Y) plays it again from your first miss (on a
  phone it is in the bar on the board, next to Next line and Redo); **Statistics** lists every opening you've trained with its average
  end-of-line eval.
  **No PGN? No problem:** *Anything as White* and *Anything as Black* (top of the list) start from move 1 and
  the opponent plays real replies from the book at your level, with your moves judged as in the presets.
  **+ New position** opens a setup board (play both sides' moves, or paste a FEN; undo, reset, flip), a name and
  your side: it is saved in this browser (and in the progress export) and trains like a preset; rename or delete it
  any time. **Save this position** in the trainer turns the moves on the board into a new position of your own.
- **Tactics** — 11,260 CC0 puzzles from the Lichess puzzle database (rated 1200–2900,
  33 motifs, filter by motif and rating), with a puzzle rating (Elo against each puzzle's Lichess rating, first attempt only).
- **Blind tactics** (Extra) — after listudy's blind tactics, with a rating range: the board shows the position 2 to
  16 plies before a Lichess puzzle, the hidden moves are listed under it, and you solve without the board moving (type
  the move, SAN or squares, or tap its two squares). 3,990 puzzles rated 1000–2899, 210 per 100 points, with plenty of
  3+ move solutions from 1800 up, so a high rating range makes the tactic hard and not just the visualization. **Peek**
  (P) shows the real position for 2 s (the puzzle then counts as assisted), **Give up** (G) plays everything on the
  board. Its own Blind rating (first try only) and reviews of misses; no engine needed.
- **Calculation** — see the whole line before you play it: on 1,092 hard, long
  Lichess puzzles (rated 2200–2800, 4 to 13 moves for you) you enter your moves and
  the replies you expect, against a clock, then submit. Scored by how far your line follows the solution; a
  different first move counts if Stockfish rates it as good.
- **Endgames** — 39 textbook endings (basic mates, king and pawn, Lucena, Philidor,
  Vančura, Saavedra, queen against pawn and rook, minor pieces, rook against pawns) played against perfect defence. Every move
  is graded by the Lichess tablebase (best, still winning, or the result thrown away), from stored
  lines first and the live tablebase API after; Stockfish only when neither answers. Spaced review.
- **Analyze my games** — type a Lichess or Chess.com username (your recent
  rapid + classical games are fetched from the public API in your browser), or
  bring your own PGN files: several at once (Lichess studies stop at 64 chapters),
  dropped on the page or as a Lichess study link, each with its rating system
  (US Chess, FIDE, Lichess, Chess.com). Lichess games reuse Lichess's stored server
  analysis where present; the rest is analyzed by Stockfish (WebAssembly) in your
  browser, **Standard** (depth 11) or **Deep** (depth 16, more accurate, slower), with
  a time estimate measured on your device. You get a report card with filters
  (colour, time control, period, opponent rating, rating system, file): results by
  colour, time control and opponent rating with your opponents' average and median,
  your performance rating (US Chess's formula for US Chess ratings, FIDE's method
  otherwise, the 400-point rule) and your score against expectation, charts, your
  openings, when you leave the book, move quality by colour and phase, accuracy
  over time, conversion from +2 and saves from −2. Save the costliest positions as
  drills; each save is a set you can remove again. There's a "Try it with
  CoachSuhaas" demo button.
- **Drills** — two kinds: **Your mistakes** (find the move you should have played)
  and **Punish the mistake** (your opponent erred and you let it go; find the move
  that makes them pay). Judged by Stockfish (within 0.1 winning chances of the
  best line counts). **Play it out** continues any drill against Stockfish: convert
  the advantage, or hold the position.
- **Play** — games against Stockfish from 1400 to full strength, with a blindfold
  mode (counted peeks) and takebacks (T; counted on the saved game).
- **Guess the move** — play through games from the winner's side and guess each
  move (2 points for key moves): master games from the Lichess broadcasts and some of Suhaas's tournament games,
  checked clean at depth 20+. A Moves panel marks your guesses, and an eval graph appears after
  the game. **Add your own games**: paste or upload a PGN with your notes (comments, side lines, move marks and
  arrows are kept); Stockfish judges other moves live.
- **Players** — type an opponent's Lichess or Chess.com username: their last 200 public games are fetched by your
  browser and kept on this device. See what they play with each colour, browse their moves on a board, **Train vs**
  them in the opening trainer (the opponent plays their moves while their games go, then the book), and print a
  **pre-round sheet** (their first moves, the line to expect against your imported repertoire, recent games).
- **Watch** — your own chess video library: paste YouTube links; each video keeps your position, watched state,
  notes (timestamps become links) and bookmarks, grouped by series, with Resume / Continue. No embeds: every video
  opens on YouTube at your saved place.
- **On every board** — right-click a square for a circle, right-drag for an arrow (Shift red, Alt or Ctrl blue,
  Shift+Alt yellow; a left click clears them), as on Lichess. Firefox always opens its own menu on
  Shift+right-click, so Settings → *Arrow colour (plain right-click)* lets you make red the no-modifier colour.
- **Dark mode** — Settings → Theme: Match device (default), Light or Dark.
- **Progress** — totals and per-opening ratings, with JSON export/import.
- **Chess Lab packs** — a friend with the private Chess Lab kit can analyse your games much deeper than a browser can
  (every game, Stockfish at depth 22) and send you one file: Progress → *Load a Chess Lab pack* merges its drills into
  Drills and Today (your results kept), shows its report card on Progress, and fills **Blunder check** (Extra): positions
  from your games where your move was a blunder: first find what your opponent threatens, then your move. The pack holds
  only your own games' data and stays in this browser like everything else.
- **On a phone** — Openings notes, Guess the move, Calculation and Endgame solutions open in a **reader**: the board on
  top, the notes below with the current move at the top, Prev / Next at the bottom within thumb reach, and the screen
  kept awake. iPads and desktops keep the side-by-side layout.
- **Keyboard** — press **?** on any tab for its keys (← → through moves, H hint, B take back, N next, F flip …).
  Keys never fire while you type in a box and never take over browser shortcuts.
- **Needs internet** — Lichess studies, the live tablebase and Review on Lichess say so plainly when you are offline,
  instead of failing quietly.

## Data sources

| Part | Source | License |
| --- | --- | --- |
| Opening book, elite level (`site/data/masters.json`) | [Lichess Elite Database](https://database.nikonoel.fr/) (Lichess games, 2500+ vs 2300+), built by `tools/build_masters.py` | CC0 |
| Opening books, club levels 1000–2200+ (`site/data/club/*.json`) | [Lichess open database](https://database.lichess.org/), rated rapid + classical games by the players' average rating, built by `tools/build_club.py` | CC0 |
| Endgame positions and their graded trees (`site/data/endgames.json`) | Positions set up by hand (`tools/endgame_positions.json`); results and best moves from the [Lichess tablebase API](https://tablebase.lichess.ovh) (Syzygy tables), built by `tools/build_endgames.py` (workflow *Build endgame set*) | facts from a free public API |
| Blind tactics (`site/data/blind.json`) | [Lichess puzzle database](https://database.lichess.org/#puzzles) and each puzzle's own game from the Lichess game export API (the 16 moves before it), picked by `tools/pick_blind.py` (workflow *Build blind set*) | CC0 |
| Calculation exercises (`site/data/calc.json`) | [Lichess puzzle database](https://database.lichess.org/#puzzles), picked by `tools/pick_calc.py` (workflow *Build calculation set*) | CC0 |
| Opening names + offline demo book | [lichess-org/chess-openings](https://github.com/lichess-org/chess-openings) | CC0 |
| Puzzles | [Lichess puzzle database](https://database.lichess.org/#puzzles) (rebuild with `tools/pick_puzzles.py`) | CC0 |
| Engine | [Stockfish](https://stockfishchess.org/) 18 lite single-thread WebAssembly, via [stockfish.js](https://github.com/nmrugg/stockfish.js) | GPL-3.0 (`site/sf/Copying.txt`) |
| Move logic | [chess.js](https://github.com/jhlywa/chess.js) 0.10.3 | BSD-2-Clause |
| Pieces | Lichess "cburnett" set by Colin M.L. Burnett | GPLv2+ |
| Board | Lichess "maple" | AGPLv3+ |

Full notices in [CREDITS.md](CREDITS.md). The page code is MIT ([LICENSE](LICENSE)).

All books ship with the site: no accounts, no live API calls. Rebuild them with the
**Build opening books** workflow (Actions tab → Run workflow); it downloads the CC0 sources,
builds every book and uploads them as an artifact to check and commit.

## Run it locally

It's a static site — any file server works:

```sh
cd site && python3 -m http.server 8000
# open http://localhost:8000
```

## Tests

Headless tests (jsdom) cover the board, the trainer, the PGN import, tactics,
the analyze flow against a mocked API, Players and Watch, arrows, takebacks, the dark theme and the data files:

```sh
cd tests && npm install && npm test
```

A real-browser smoke test (Playwright) opens every tab in **Firefox and Chromium**, plays a move on every board
with the mouse (clicks and a drag), checks that Stockfish answers, draws arrows, takes moves back, fails on any
console or page error, and screenshots every tab in light and dark at desktop and phone width. CI runs it on every
push (workflow *Browsers*; screenshots are the run's artifacts). Locally:

```sh
cd tests/browser && npm install && npx playwright install firefox chromium && node smoke.js firefox
node reader.js chromium    # the phone reader on iPhone 15 / SE sizes, and no reader on iPads
node keys.js firefox       # the arrow keys through side lines (← → ↓ ↑), pressed for real
```

The code both Chess Lab sites run lives in `site/shared/` (see PARITY.md); the private kit pulls a pinned copy.

CI also runs `tools/privacy_guard.py`, which fails the build if anything from
the private kit (course filenames, personal PGNs, opponent names) ever shows up
in this repo. The denylist is stored as hashes, so the guard leaks nothing itself.

## Privacy

Your games (and the opponents you scout in Players) are fetched by **your** browser straight from lichess.org /
api.chess.com and never leave it. Progress, imported repertoires, your own Guess-the-move games, players and
your video library live in your browser's localStorage; the Progress tab exports and imports them as JSON.
The page contacts YouTube only when you press *Get title* in Watch.
