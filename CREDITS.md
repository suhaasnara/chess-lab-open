# Credits and licenses

Chess Lab Open's own code (everything not listed below) is MIT, © 2026 Suhaas
Narayanan — see [LICENSE](LICENSE).

## Engine

- **Stockfish 18** (`site/sf/stockfish-18-lite-single.{js,wasm}`) — the lite
  single-threaded WebAssembly build from the
  [stockfish.js](https://github.com/nmrugg/stockfish.js) npm package
  (`stockfish@18.0.8`), © the Stockfish developers (see the AUTHORS file in the
  [Stockfish repository](https://github.com/official-stockfish/Stockfish)).
  License: **GPL-3.0** — a full copy is in [`site/sf/Copying.txt`](site/sf/Copying.txt).
  Corresponding source: https://github.com/official-stockfish/Stockfish and
  https://github.com/nmrugg/stockfish.js (the wasm build). The engine runs in a
  Web Worker and is an unmodified binary from the npm package.

## Libraries

- **chess.js 0.10.3** (`site/vendor/chess.js`) — © Jeff Hlywa,
  **BSD-2-Clause** ([`site/vendor/LICENSE-chessjs.txt`](site/vendor/LICENSE-chessjs.txt)).

## Board and pieces

- **Pieces: "cburnett"** (`site/assets/pieces/cburnett/*.svg`) — by
  [Colin M.L. Burnett](https://en.wikipedia.org/wiki/User:Cburnett), as shipped
  by [Lichess (lila)](https://github.com/lichess-org/lila/blob/master/COPYING.md).
  License: **GPLv2+** (also available under BSD/GFDL per the author's original
  release on Wikimedia Commons).
- **Board: "maple"** (`site/assets/board/maple.jpg`) — from
  [Lichess (lila)](https://github.com/lichess-org/lila), © the lila authors,
  **AGPL-3.0+** (`public/images/board` in lila's COPYING.md).

(The private Chess Lab uses the "alpha" piece set by Eric Bentzen, which is
free for personal non-commercial use only — that's why this public repo ships
cburnett instead.)

## Data

- **Opening names and the offline demo book** (`site/data/openings.json`,
  `site/data/demo-book.json`) — built by `tools/build_openings.py` from
  [lichess-org/chess-openings](https://github.com/lichess-org/chess-openings),
  **CC0 1.0** (public domain).
- **Calculation exercises** (`site/data/calc.json`) — hard, long puzzles from the
  [Lichess puzzle database](https://database.lichess.org/#puzzles), **CC0 1.0**, picked by
  `tools/pick_calc.py`.
- **Puzzles** (`site/data/tactics.json`) — from the
  [Lichess puzzle database](https://database.lichess.org/#puzzles), **CC0 1.0**.
  Each puzzle links to its source game on lichess.org. Rebuild or extend the
  selection with `tools/pick_puzzles.py`.
- **Endgames** (`site/data/endgames.json`) — textbook positions set up by hand; every result,
  best move and best defence comes from the [Lichess tablebase](https://tablebase.lichess.ovh)
  (Syzygy 7-piece tables by Ronald de Man and contributors), queried by `tools/build_endgames.py`
  and, for positions off the stored lines, live from the page.
- **Opening books** (`site/data/masters.json`, `site/data/club/*.json`) — built by
  `.github/workflows/build-books.yml` with `tools/build_masters.py` from the
  [Lichess Elite Database](https://database.nikonoel.fr/) (CC0, Lichess games repackaged by
  nikonoel) and `tools/build_club.py` from the
  [Lichess open database](https://database.lichess.org/) (**CC0 1.0**): position and move
  counts only. Thank you, Lichess. Consider [donating](https://lichess.org/patron).
  Do not build them from commercial databases or TWIC: not redistributable.
- **Guess the move, master games** (`site/data/gtm/game11.json` …) — game moves from the
  [Lichess broadcast database](https://database.lichess.org/) (**CC0 1.0**), picked and built by
  `.github/workflows/gtm-masters.yml` (`tools/broadcast_games.py`, `tools/build_gtm.py`; scoring and evals by Stockfish).
  No annotations: the moves only. The other games are Suhaas's own, with his own notes.
- **The 2200+ club book** reads several months of the open database in parallel
  (`.github/workflows/build-club-months.yml`, `tools/merge_club.py`).

## Analyze my games

- **Lichess API** — games and stored server evals via the
  [Lichess API](https://lichess.org/api), CC0 game data, fetched by the visitor.
- **Chess.com API** — games via the
  [published-data API](https://www.chess.com/news/view/published-data-api),
  fetched by the visitor; no evals are provided, so Stockfish analyzes locally.
- Winning-chance model and mark thresholds follow
  [Lichess's accuracy definitions](https://lichess.org/page/accuracy).

## Fonts

- [Libre Caslon Text](https://fonts.google.com/specimen/Libre+Caslon+Text) and
  [Source Sans 3](https://fonts.google.com/specimen/Source+Sans+3), under the SIL Open Font
  License. Since 14 Nov 2026 the site serves its own copies (`site/assets/fonts/`, the Latin
  subsets from Fontsource, with `OFL.txt`); nothing is fetched from Google Fonts.
  The link-preview image `site/assets/og.jpg` is rendered with the same two fonts (embedding is allowed
  under the OFL) and the site's own board and pieces.
