# Chess Lab Open

An open-source, bring-your-own-data chess trainer by
[Suhaas Narayanan](https://suhaasnarayanan.com/chess)
([CoachSuhaas](https://www.chess.com/member/CoachSuhaas) on Chess.com,
[suhaasn](https://lichess.org/@/suhaasn) on Lichess).
It is the public version of his private training site, Chess Lab, with none of
the private data: everything here runs on open databases and on games you fetch
yourself from your own accounts, entirely in your browser. No server, no
accounts, no uploads: progress lives in localStorage with JSON export/import.

## What it does (v0.1)

- **Openings** — train preset openings against the masters' book, or import your
  own repertoire as a PGN (Lichess study / Chessable export) and drill it. The
  opponent plays the book's replies; an *Opponent level* setting switches the
  book from masters to Lichess club games by rating band. Each opening gets a
  rating: every move you find is scored against a difficulty derived from the
  masters' share of the right move.
- **Tactics** — a CC0 puzzle library from the Lichess puzzle database, with a
  puzzle rating (Elo against each puzzle's Lichess rating, first attempt only).
- **Analyze my games** — type a Lichess or Chess.com username; your recent
  rapid + classical games are fetched from the public API in your browser.
  Lichess games reuse Lichess's stored server analysis where present; Chess.com
  has no stored evals, so its window is capped at the last 25 rapid games and
  Stockfish (WebAssembly) analyzes them in the browser. You get a lite report
  card (score, blunders, conversion from +2, saves from −2, openings) and can
  save your mistakes as drills. There's a "Try it with CoachSuhaas" demo button.
- **Drills** — replay the positions where you went wrong and find a better
  move, judged by Stockfish (within 0.1 winning chances of the best line counts).

Planned next (v0.2): play vs Stockfish at a chosen strength, blindfold mode,
and Guess-the-move on an annotated game.

## Data sources

| Part | Source | License |
| --- | --- | --- |
| Opening book, elite level (`site/data/masters.json`) | [Lichess Elite Database](https://database.nikonoel.fr/) (Lichess games, 2500+ vs 2300+), built by `tools/build_masters.py` | CC0 |
| Opening books, club levels 1000–2200+ (`site/data/club/*.json`) | [Lichess open database](https://database.lichess.org/), rated rapid + classical games by the players' average rating, built by `tools/build_club.py` | CC0 |
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
the analyze flow against a mocked API, and the data files:

```sh
cd tests && npm install && npm test
```

CI also runs `tools/privacy_guard.py`, which fails the build if anything from
the private kit (course filenames, personal PGNs, opponent names) ever shows up
in this repo. The denylist is stored as hashes, so the guard leaks nothing itself.

## Privacy

Your games are fetched by **your** browser straight from lichess.org /
api.chess.com and never leave it. Progress, imported repertoires and saved
drills live in your browser's localStorage; the Progress tab exports and
imports them as JSON.
