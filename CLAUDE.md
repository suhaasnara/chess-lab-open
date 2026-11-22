# Chess Lab Open (public), shown to visitors as "Think Ahead"

Since 22 Nov 2026 the site's visible name is **Think Ahead** (same as the iPhone app; not final until App Store Connect
accepts it). The repo, the URL path `/chess-lab-open/`, storage keys and the backup format keep the old name.

`~/chess-lab-open`, remote `github.com/suhaasnara/chess-lab-open` (**public**). Published by GitHub Pages at
https://suhaasnarayanan.com/chess-lab-open/. This is the open-source (MIT), bring-your-own-data version of Suhaas's
private trainer, Chess Lab. It is fully static and client-side: no accounts, no server, and progress kept in localStorage with
JSON export/import.

> **This repo is public, and so is this file if you commit it.** Keep anything private out of it, and run the privacy
> guard on it before committing.

**Explain as you go.** Suhaas wants to learn how this works, not just get it: say what you changed and why, in plain words.

Start every session with `git pull` (the Mac copy has fallen weeks behind GitHub before).

## Layout
| Path | What |
| --- | --- |
| `site/index.html`, `site/style.css` | The page |
| `site/js/*.js` | One file per tab (`openings`, `tactics`, `blind`, `calc`, `endgames`, `analyze` + `astats`, `drills`, `blundercheck`, `gameview` + `agames`, `play`, `gtm`, `players`, `watch`, `today`, `progress`, `settingspage`, `router`, `native`), plus helpers (`shared`, `config`, `book`, `pgnfile`) |
| `site/shared/*.js/.css` | **Code shared with the private kit**: board, shapes, pgn, engine, trainer-core, nav, keys, reader, varline, trainview, blind, perf, yearly, native, … |
| `site/data/` | Built data: `masters.json`, `openings.json`, `club/*.json`, `endgames.json`, `blind.json`, `calc.json`, `tactics.json`, `gtm/`, `demo-book.json`. All CC0-derived (plus the games he chose for Guess the move) |
| `site/sf/` | Stockfish 18 lite single-thread WASM (GPL-3.0) |
| `tools/*.py` | Data builders (`build_masters`, `build_club`, `build_endgames`, `pick_blind`, `pick_calc`, `pick_puzzles`, `build_gtm`, …) and `privacy_guard.py` |
| `tests/` | jsdom suite (`run.js`, `harness.js`, `native.js` for the app layer), `guard_test.py`; `tests/browser/` Playwright scripts (`smoke`, `keys`, `reader`, `engine`, `blind`, `audit`, `phonefix`) |
| `.github/workflows/` | `ci.yml` (tests + privacy guard), `browsers.yml` (Firefox, Chromium, WebKit on push) the `build-*` data workflows, `books-to-branch`, `gtm-masters`, `tag-tactics-openings` |
| `PARITY.md` | What matches the private site, what differs and why, and "Not ported yet". **Read this first** |
| `CREDITS.md`, `LICENSE` | Licences: page code MIT; Stockfish GPL-3.0; cburnett pieces GPLv2+; maple board AGPLv3+ |

## Run / test
- Serve the site: `cd site && python3 -m http.server 8000`
- Unit tests: `cd tests && npm install && npm test` (Node 22)
- Browser tests: `cd tests/browser && npm install && npx playwright install firefox chromium webkit`, then `node smoke.js firefox`, `node keys.js firefox`, `node reader.js chromium`, …
  - Firefox must pass: a friend had trouble in Firefox.
  - Screenshots go to `tests/browser/out/`; look at them.
- Privacy guard (also runs in CI): `python3 tools/privacy_guard.py`. Its denylist is stored as hashes. Run it before every push.
- Data tools: Python 3.12 with `chess==1.11.2` and `zstandard==0.23.0`. Lichess downloads are large, so prefer the GitHub workflows over running them on the Mac.

## Rules
- **Nothing private, ever.** No course or book PGNs or text, no built-in repertoires, no calculation books, no annotated master games from books, no opponents, friends or events, none of his PGNs, and no private comments.
  - When in doubt, leave it out.
  - The one exception is his own games for Guess the move, which he picks himself.
- **Going live = merging to `main`** (Pages deploys it). It needs Suhaas's explicit yes. Work on branches and open PRs.
- **Shared code is edited here**, in `site/shared/`. After merging, the private kit pulls it with its `tools/shared/pull.py` and checks it with `tools/shared/check.py` (pinned in the kit's `site/src/shared/PIN.json`; on 16 Nov the pin was `8eb0c44`, behind Open's `main`). Never edit the kit's copy.
- **Shared code has three users now**: this site, the private kit (via the pin) and the public app `suhaasnara/chess-lab-open-app` (via `shared/native.js`). A change here must not break the other two; say which ones it touches.
- **Pieces: cburnett** only. The alpha set is licensed for personal non-commercial use only. Board: Lichess maple. Keep the look of suhaasnarayanan.com/chess.
- **Never change how ids are made or rename progress keys.** Visitors' progress is keyed by them. Example: Blunder check ids are `'k' + sha1(fen|uci)[:8]`.
- Evals are always shown from White's side. Per-player stats (Win% drops, costly moves) are from that player's side and labelled.
- Never mix performance ratings across rating pools (OTB, Lichess, Chess.com, FIDE, US Chess).
- Visitors never have to log in anywhere (no Lichess OAuth). Data is fetched from public APIs by the visitor's own browser.
- One keymap everywhere, checked against `shared/keys.js`: ← → moves, N next, F flip, B take back, H hint, Y retry the miss, D redo, P peek, G give up, M main view, ? help. Keys never fire while typing and never take over browser shortcuts.
- Features that need the internet say so plainly when offline.
- Accuracy first. Before anything counts as done: unit tests, the Browsers workflow on all three engines, and screenshots he'd be happy to see.
- After a change:
  - update the `PARITY.md` row
  - add an entry at the top of the Notion page "Chess Lab Open — Changelog"
  - add the kit's HANDOFF "Version N" if shared code changed

## Key decisions (don't undo)
- **One codebase, PARITY's direction** (8 Nov 2026): shared modules live in this public repo and the private kit pulls a pinned copy, so private code never has to be scrubbed to go public.
- **Full feature parity with the private site** except the data (his ask, Nov 2026).
- **Chess Lab packs were retired** (13 Nov 2026). Friends upload their own PGNs or usernames instead. Blunder check comes from Analyze my games. Analyzed games are kept and open at the move. A browser that had a pack keeps its data (`Store.migrate`).
- **Analyze my games never calls the engine's first choice a mistake.** Every drill is re-searched before it is saved (`verifyDrill`).
- Opening books are built from CC0 Lichess data, so no live API calls and no accounts.

## Status / open items (16 Nov 2026)
- `main` is `7e94d11` (PR #10 `app-native`: `shared/native.js` + `js/native.js`, inert on the website, used only by the public app `suhaasnara/chess-lab-open-app`, "Think Ahead: Chess", Stage 0 design). The Mac copy is up to date with it.
- This CLAUDE.md is not committed yet (untracked on the Mac). Committing it publishes it: his call.
- Not ported yet (PARITY): Tactics' Chessable-style flow, and the pinned board on every board page.
- Leftovers:
  - Today's small puzzle slice
  - `/` search in Openings
  - the dead board on empty Drills / Blunder check
  - "9 games" in Leaving the book
  - Tactics has no Solution button
  - "Use Hint (H)" / "← →" still appear in prose on phones
- Ideas, not asked for: "Your prep in your games", making Open easier to reach from suhaasnarayanan.com (keep the URL), asking a new visitor their rough rating.
- Housekeeping, ask first: many old workflow branches on GitHub (`books/*`, `endgames/*`, `blind-data/*`, `calc/*`) and the merged feature branches can be deleted.
