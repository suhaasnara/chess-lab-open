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
  Stockfish info after a line, depth); **Statistics** lists every opening you've trained with its average
  end-of-line eval.
- **Tactics** — 11,260 CC0 puzzles from the Lichess puzzle database (rated 1200–2900,
  33 motifs, filter by motif and rating), with a puzzle rating (Elo against each puzzle's Lichess rating, first attempt only).
- **Calculation** — see the whole line before you play it: on 1,092 hard, long
  Lichess puzzles (rated 2200–2800, 4 to 13 moves for you) you enter your moves and
  the replies you expect, against a clock, then submit. Scored by how far your line follows the solution; a
  different first move counts if Stockfish rates it as good.
- **Endgames** — 39 textbook endings (basic mates, king and pawn, Lucena, Philidor,
  Vančura, Saavedra, queen against pawn and rook, minor pieces, rook against pawns) played against perfect defence. Every move
  is graded by the Lichess tablebase (best, still winning, or the result thrown away), from stored
  lines first and the live tablebase API after; Stockfish only when neither answers. Spaced review.
- **Analyze my games** — type a Lichess or Chess.com username; your recent
  rapid + classical games are fetched from the public API in your browser.
  Lichess games reuse Lichess's stored server analysis where present; Chess.com
  has no stored evals, so its window is capped at the last 25 rapid games and
  Stockfish (WebAssembly) analyzes them in the browser. You get a report card
  (score, blunders, conversion from +2, saves from −2, how often you punished
  your opponents' mistakes, openings) and can save drills. There's a
  "Try it with CoachSuhaas" demo button.
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
  Shift+Alt yellow; a left click clears them), as on Lichess. (Firefox always opens its own menu on
  Shift+right-click and doesn't let a page block it, so red shapes are awkward there; the other colours work.)
- **Dark mode** — Settings → Theme: Match device (default), Light or Dark.
- **Progress** — totals and per-opening ratings, with JSON export/import.

## Data sources

| Part | Source | License |
| --- | --- | --- |
| Opening book, elite level (`site/data/masters.json`) | [Lichess Elite Database](https://database.nikonoel.fr/) (Lichess games, 2500+ vs 2300+), built by `tools/build_masters.py` | CC0 |
| Opening books, club levels 1000–2200+ (`site/data/club/*.json`) | [Lichess open database](https://database.lichess.org/), rated rapid + classical games by the players' average rating, built by `tools/build_club.py` | CC0 |
| Endgame positions and their graded trees (`site/data/endgames.json`) | Positions set up by hand (`tools/endgame_positions.json`); results and best moves from the [Lichess tablebase API](https://tablebase.lichess.ovh) (Syzygy tables), built by `tools/build_endgames.py` (workflow *Build endgame set*) | facts from a free public API |
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
```

CI also runs `tools/privacy_guard.py`, which fails the build if anything from
the private kit (course filenames, personal PGNs, opponent names) ever shows up
in this repo. The denylist is stored as hashes, so the guard leaks nothing itself.

## Privacy

Your games (and the opponents you scout in Players) are fetched by **your** browser straight from lichess.org /
api.chess.com and never leave it. Progress, imported repertoires, your own Guess-the-move games, players and
your video library live in your browser's localStorage; the Progress tab exports and imports them as JSON.
The page contacts YouTube only when you press *Get title* in Watch.
