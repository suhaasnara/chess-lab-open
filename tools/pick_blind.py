#!/usr/bin/env python3
"""Build site/data/blind.json, the Blind tactics set, from the Lichess puzzle database and the puzzles' own games
(both CC0): https://database.lichess.org/#puzzles and https://lichess.org/api/games/export/_ids

  python3 tools/pick_blind.py lichess_db_puzzle.csv.zst site/data/blind.json [--report report.json]
  python3 tools/pick_blind.py --selftest

Blind tactics shows the board HIDDEN plies before the puzzle position and lists those moves; you solve without the
board moving. So every puzzle needs the 16 plies before its position, which the puzzle CSV doesn't have: they come from
the source game (Lichess export by ids, 300 per request, moves as SAN, no tags or clocks).

Selection (seeded, so a rerun picks the same set):
  - 19 bands of 100 points, 1000-1099 ... 2800-2899, TARGET puzzles each (about 4,000 in all);
  - well-tested puzzles (rating deviation, plays and popularity limits, a little looser in the thin top bands);
  - from 1800 up, LONG_SHARE of each band has 3+ moves for the solver (where the database has them);
  - the puzzle position at least HIDDEN plies into its game (the game has the 16 moves to hide).
A puzzle whose game can't be fetched, doesn't replay to the puzzle FEN, or whose solution isn't legal is dropped;
the counts per band are printed (and written to --report).

Entry: {id: 'bt-'+Lichess id, rating, fen: the position HIDDEN plies before the puzzle position, hidden: [HIDDEN SAN
plies; the last is the puzzle CSV's first move (the opponent's)], sol: [the rest of the CSV's moves, UCI: yours, the
reply, ...], themes, motif}. The page shows the board after the first HIDDEN-N plies and lists the last N.
"""
import csv, io, json, random, sys, time, urllib.request, urllib.error

HIDDEN = 16
BANDS = list(range(1000, 2900, 100))
TARGET = 210
SPARE = 1.35                     # candidates per band, for drops
LONG_SHARE, LONG_FROM = 0.45, 1800
BATCH = 300
NOT_MOTIF = {'long', 'veryLong', 'short', 'oneMove', 'middlegame', 'endgame', 'advantage', 'crushing', 'mate',
             'master', 'masterVsMaster', 'superGM', 'opening'}


def quality(rating, dev, plays, pop):
    if rating >= 2600:
        return dev <= 110 and plays >= 60 and pop >= 60
    if rating >= 2300:
        return dev <= 90 and plays >= 150 and pop >= 70
    return dev <= 80 and plays >= 300 and pop >= 80


def ply_hint(url):
    """GameUrl 'https://lichess.org/abcdEFGH/black#48' -> ('abcdEFGH', 48)"""
    try:
        base, _, ply = url.partition('#')
        gid = base.rstrip('/').split('lichess.org/')[1].split('/')[0][:8]
        return gid, int(ply or 0)
    except Exception:
        return None, 0


def pick(rows, rng):
    """rows: dicts from the puzzle CSV. Returns {band: [candidate]} (each band shuffled, long ones first where needed)."""
    cells = {}
    for row in rows:
        try:
            rating, dev = int(row['Rating']), int(row['RatingDeviation'])
            pop, plays = int(row['Popularity']), int(row['NbPlays'])
        except (KeyError, ValueError):
            continue
        band = rating // 100 * 100
        if band not in BANDS or not quality(rating, dev, plays, pop):
            continue
        gid, ply = ply_hint(row.get('GameUrl', ''))
        if not gid or ply < HIDDEN + 1:
            continue
        moves = row['Moves'].split()
        if len(moves) < 2:
            continue
        n = len(moves) // 2
        themes = row['Themes'].split()
        key = (band, n >= 3)
        cell = cells.setdefault(key, [])
        cell.append({'pid': row['PuzzleId'], 'gid': gid, 'fen': row['FEN'], 'moves': moves, 'rating': rating,
                     'themes': themes[:6],
                     'motif': next((t for t in themes if t not in NOT_MOTIF), themes[0] if themes else '')})
        if len(cell) > 4000:                    # keep memory small: a random sample per cell is all we need
            rng.shuffle(cell); del cell[2000:]
    out = {}
    for band in BANDS:
        want = int(TARGET * SPARE)
        long_, short = cells.get((band, True), []), cells.get((band, False), [])
        rng.shuffle(long_); rng.shuffle(short)
        nl = int(want * LONG_SHARE) if band >= LONG_FROM else int(want * len(long_) / max(1, len(long_) + len(short)))
        nl = min(nl, len(long_))
        take = long_[:nl] + short[:want - nl]
        if len(take) < want:
            take += long_[nl:nl + want - len(take)]
        out[band] = take
    return out


def fetch_games(ids, log=print):
    """{game id: {'moves': [SAN], 'initialFen': fen or None}} from the Lichess export API, BATCH ids a request."""
    games, ids = {}, sorted(set(ids))
    for i in range(0, len(ids), BATCH):
        part = ids[i:i + BATCH]
        url = 'https://lichess.org/api/games/export/_ids?moves=true&tags=false&clocks=false&evals=false&opening=false&literate=false'
        for attempt in range(6):
            req = urllib.request.Request(url, data=','.join(part).encode(), method='POST',
                                         headers={'Accept': 'application/x-ndjson', 'Content-Type': 'text/plain',
                                                  'User-Agent': 'chess-lab-open/pick_blind (github.com/suhaasnara/chess-lab-open)'})
            try:
                with urllib.request.urlopen(req, timeout=120) as r:
                    body = r.read().decode()
                    if i == 0:
                        log(f'  first answer: HTTP {r.status}, {len(body)} bytes: {body[:200]!r}')
                    for line in body.splitlines():
                        if line.strip():
                            g = json.loads(line)
                            games[g['id']] = {'moves': (g.get('moves') or '').split(), 'initialFen': g.get('initialFen')}
                break
            except urllib.error.HTTPError as e:
                wait = 65 if e.code == 429 else 10 * (attempt + 1)
                log(f'  batch {i // BATCH + 1}: HTTP {e.code}, waiting {wait} s')
                time.sleep(wait)
            except Exception as e:
                log(f'  batch {i // BATCH + 1}: {e}, retrying')
                time.sleep(10 * (attempt + 1))
        log(f'  fetched {min(i + BATCH, len(ids))}/{len(ids)} game ids, {len(games)} games so far')
        time.sleep(1.5)
    return games


def same_pos(board, fen):
    """board (python-chess) is the puzzle FEN's position: pieces, side, castling, en passant (when a capture is legal),
    and the move number (a position can repeat in a game)."""
    import chess
    want = chess.Board(fen)
    return (board.board_fen() == want.board_fen() and board.turn == want.turn
            and board.castling_rights == want.castling_rights and board.ep_square == want.ep_square
            and board.fullmove_number == want.fullmove_number)


def build(c, game):
    """One candidate + its game -> the blind entry, or (None, reason)."""
    import chess
    if not game or not game['moves']:
        return None, 'no game'
    b = chess.Board(game['initialFen']) if game.get('initialFen') else chess.Board()
    boards, sans = [b.copy()], []
    for san in game['moves']:
        try:
            mv = b.parse_san(san)
        except ValueError:
            return None, 'game does not replay'
        sans.append(b.san(mv)); b.push(mv); boards.append(b.copy())
    at = next((i for i, x in enumerate(boards) if same_pos(x, c['fen'])), None)
    if at is None:
        return None, 'puzzle FEN not in the game'
    if at + 1 < HIDDEN:
        return None, 'too early in the game'
    pb = boards[at].copy()
    first = chess.Move.from_uci(c['moves'][0])
    if first not in pb.legal_moves:
        return None, 'first move illegal'
    if at < len(sans) and sans[at] != pb.san(first):
        return None, 'first move is not the game move'
    hidden = sans[at - HIDDEN + 1:at] + [pb.san(first)]
    start = boards[at - HIDDEN + 1]
    pb.push(first)
    for u in c['moves'][1:]:
        mv = chess.Move.from_uci(u)
        if mv not in pb.legal_moves:
            return None, 'solution illegal'
        pb.push(mv)
    return {'id': 'bt-' + c['pid'], 'rating': c['rating'], 'fen': start.fen(en_passant='fen'), 'hidden': hidden,
            'sol': c['moves'][1:], 'themes': c['themes'], 'motif': c['motif']}, None


def check(e):
    """The stored entry replays: fen + hidden = the puzzle position, and the solution is legal."""
    import chess
    b = chess.Board(e['fen'])
    for s in e['hidden']:
        b.push_san(s)
    for u in e['sol']:
        mv = chess.Move.from_uci(u)
        assert mv in b.legal_moves, (e['id'], u)
        b.push(mv)
    return True


def finish(cands, games, log=print):
    out, report = [], {'bands': {}, 'dropped': {}}
    for band in BANDS:
        ok = []
        for c in cands.get(band, []):
            e, why = build(c, games.get(c['gid']))
            if e:
                ok.append(e)
            else:
                report['dropped'][why] = report['dropped'].get(why, 0) + 1
        long_ = [e for e in ok if len(e['sol']) >= 5]
        short = [e for e in ok if len(e['sol']) < 5]
        nl = min(len(long_), int(TARGET * LONG_SHARE) if band >= LONG_FROM else int(TARGET * len(long_) / max(1, len(ok))))
        keep = long_[:nl] + short[:TARGET - nl]
        if len(keep) < TARGET:
            keep += long_[nl:nl + TARGET - len(keep)]
        for e in keep:
            check(e)
        n_you = lambda e: (len(e['sol']) + 1) // 2
        report['bands'][f'{band}-{band + 99}'] = {'kept': len(keep), 'candidates': len(cands.get(band, [])),
                                                 'built': len(ok), '3+': sum(n_you(e) >= 3 for e in keep),
                                                 '2': sum(n_you(e) == 2 for e in keep), '1': sum(n_you(e) == 1 for e in keep)}
        out.extend(keep)
    out.sort(key=lambda e: (e['rating'], e['id']))
    report['total'] = len(out)
    for k, v in report['bands'].items():
        log(f'  {k}: {v["kept"]} kept ({v["3+"]} with 3+ of your moves, {v["2"]} with 2, {v["1"]} with 1) of {v["built"]} built from {v["candidates"]} candidates')
    log(f'  dropped: {report["dropped"]}')
    log(f'  total: {len(out)}')
    return out, report


def main(src, out_path, report_path=None):
    rng = random.Random(2026)
    opener = (lambda p: io.TextIOWrapper(__import__('zstandard').ZstdDecompressor()
              .stream_reader(open(p, 'rb')), encoding='utf-8')) if src.endswith('.zst') else open
    with opener(src) as f:
        cands = pick(csv.DictReader(f), rng)
    allc = [c for v in cands.values() for c in v]
    print(f'candidates: {len(allc)} in {len(cands)} bands, {len(set(c["gid"] for c in allc))} games; e.g. {[(c["pid"], c["gid"]) for c in allc[:3]]}')
    games = fetch_games([c['gid'] for v in cands.values() for c in v])
    out, report = finish(cands, games)
    json.dump(out, open(out_path, 'w'), separators=(',', ':'))
    if report_path:
        json.dump(report, open(report_path, 'w'), indent=1)
    print(f'{len(out)} puzzles -> {out_path}')


def selftest():
    """Offline: a made-up game and puzzle rows through pick, build, finish and check."""
    import chess
    sans = 'e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d4 exd4 cxd4 Bb4+ Bd2 Bxd2+ Nbxd2 d5 exd5 Nxd5 Qb3 Na5 Qa4+ c6 Bxd5 Qxd5 O-O Be6'.split()
    b = chess.Board()
    for s in sans[:21]:
        b.push_san(s)
    fen = b.fen()                                  # before 21...c6 (the opponent's move in the CSV)
    rows = [{'PuzzleId': f'p{i:04d}', 'FEN': fen, 'Moves': 'c7c6 e1g1 d8e7 a4a5', 'Rating': str(1800 + i % 50),
             'RatingDeviation': '75', 'Popularity': '90', 'NbPlays': '1000', 'Themes': 'fork middlegame long',
             'GameUrl': 'https://lichess.org/abcdEFGH/black#21'} for i in range(10)]
    rows.append(dict(rows[0], PuzzleId='bad1', Moves='b7b5 a4b5'))          # first move not the game move
    rows.append(dict(rows[0], PuzzleId='bad2', GameUrl='https://lichess.org/zzzzZZZZ#21'))   # game missing
    cands = pick(rows, random.Random(1))
    games = {'abcdEFGH': {'moves': sans, 'initialFen': None}}
    out, rep = finish(cands, games, log=lambda *a: None)
    assert len(out) == 10, (len(out), rep)
    e = out[0]
    assert e['hidden'][-1] == 'c6' and len(e['hidden']) == HIDDEN and e['sol'] == ['e1g1', 'd8e7', 'a4a5'], e
    bb = chess.Board(e['fen'])
    for s in e['hidden']:
        bb.push_san(s)
    b.push_san('c6')
    assert bb.fen() == b.fen()
    assert rep['dropped'] == {'first move is not the game move': 1, 'no game': 1}, rep['dropped']
    print('pick_blind selftest: ok')


if __name__ == '__main__':
    if sys.argv[1:] == ['--selftest']:
        selftest(); sys.exit(0)
    if len(sys.argv) not in (3, 5):
        print(__doc__); sys.exit(2)
    main(sys.argv[1], sys.argv[2], sys.argv[4] if len(sys.argv) == 5 else None)
