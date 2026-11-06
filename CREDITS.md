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
- **Puzzles** (`site/data/tactics.json`) — from the
  [Lichess puzzle database](https://database.lichess.org/#puzzles), **CC0 1.0**.
  Each puzzle links to its source game on lichess.org. Rebuild or extend the
  selection with `tools/pick_puzzles.py`.
- **Opening books** (`site/data/masters.json`, `site/data/club/*.json`) — built by
  `.github/workflows/build-books.yml` with `tools/build_masters.py` from the
  [Lichess Elite Database](https://database.nikonoel.fr/) (CC0, Lichess games repackaged by
  nikonoel) and `tools/build_club.py` from the
  [Lichess open database](https://database.lichess.org/) (**CC0 1.0**): position and move
  counts only. Thank you, Lichess. Consider [donating](https://lichess.org/patron).
  Do not build them from commercial databases or TWIC: not redistributable.

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
  [Source Sans 3](https://fonts.google.com/specimen/Source+Sans+3), served from
  Google Fonts under the SIL Open Font License.
