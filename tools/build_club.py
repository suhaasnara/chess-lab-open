#!/usr/bin/env python3
"""Build a static club opening book for one rating band from the Lichess open database (CC0).

Streams PGN from stdin (e.g. `curl -s URL | zstd -dc | python3 tools/build_club.py ...`),
keeps rated Rapid and Classical games whose players' AVERAGE rating falls in [lo, hi)
(the Lichess opening explorer buckets games the same way), and stops after --games kept games.

Usage:
  python3 tools/build_club.py OUT.json --lo 1400 --hi 1600 [--games 150000] [--ply 18] [--raw]

--raw writes the unpruned counts instead ({posId: {uci: [games, white, draws, black]}}, positions seen in at least
2 games), so several months read in parallel can be summed by tools/merge_club.py before the usual pruning.

Format (the same as masters.json, which the page reads):
  { posId: [[uci, games, white, draws, black], ...] }  positions with >= 20 games, moves >= 0.5 % share.

Source: https://database.lichess.org/ (standard rated games, CC0). Do not feed it anything else.
"""
import argparse, io, json, re, sys
import chess, chess.pgn
from build_masters import norm_key, pos_id, MIN_GAMES, MIN_SHARE

HDR = re.compile(r'^\[(\w+) "(.*)"\]')
SPEEDS = ('Rated Rapid game', 'Rated Classical game')


def games_from(stream):
    """Yield (headers, movetext) for each game, reading the raw PGN line by line (fast)."""
    hdr, moves = {}, []
    for line in stream:
        if line.startswith('['):
            if moves:
                yield hdr, ' '.join(moves); hdr, moves = {}, []
            m = HDR.match(line)
            if m: hdr[m.group(1)] = m.group(2)
        elif line.strip():
            moves.append(line.strip())
        elif moves:
            yield hdr, ' '.join(moves); hdr, moves = {}, []
    if moves:
        yield hdr, ' '.join(moves)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('out'); ap.add_argument('--lo', type=int, required=True); ap.add_argument('--hi', type=int, required=True)
    ap.add_argument('--games', type=int, default=150000); ap.add_argument('--ply', type=int, default=18)
    ap.add_argument('--raw', action='store_true', help='write unpruned counts for tools/merge_club.py')
    a = ap.parse_args()
    stream = io.TextIOWrapper(sys.stdin.buffer, encoding='utf-8', errors='ignore')
    tree, kept, seen = {}, 0, 0
    for h, mt in games_from(stream):
        seen += 1
        if h.get('Event') not in SPEEDS: continue
        res = h.get('Result')
        if res not in ('1-0', '0-1', '1/2-1/2'): continue
        try: avg = (int(h['WhiteElo']) + int(h['BlackElo'])) / 2
        except (KeyError, ValueError): continue
        if not (a.lo <= avg < a.hi): continue
        if h.get('Variant', 'Standard') != 'Standard' or 'FEN' in h: continue
        g = chess.pgn.read_game(io.StringIO(mt))
        if g is None: continue
        w, d, b = int(res == '1-0'), int(res == '1/2-1/2'), int(res == '0-1')
        board = chess.Board()
        for ply, mv in enumerate(g.mainline_moves()):
            if ply >= a.ply: break
            row = tree.setdefault(pos_id(norm_key(board)), {}).setdefault(mv.uci(), [0, 0, 0, 0])
            row[0] += 1; row[1] += w; row[2] += d; row[3] += b
            board.push(mv)
        kept += 1
        if kept % 20000 == 0: print(f'  {kept} kept of {seen} read, {len(tree)} positions', file=sys.stderr, flush=True)
        if kept >= a.games: break
    if a.raw:
        raw = {k: ent for k, ent in tree.items() if sum(r[0] for r in ent.values()) >= 2}
        json.dump(raw, open(a.out, 'w'), separators=(',', ':'))
        print(f'band {a.lo}-{a.hi} (raw): {kept} games kept of {seen} read -> {len(raw)} positions -> {a.out}')
        return
    out = prune(tree)
    json.dump(out, open(a.out, 'w'), separators=(',', ':'))
    print(f'band {a.lo}-{a.hi}: {kept} games kept of {seen} read -> {len(out)} positions -> {a.out}')


def prune(tree):
    """The book's rules: positions with >= MIN_GAMES games, moves with >= MIN_SHARE of them, most played first."""
    out = {}
    for k, ent in tree.items():
        total = sum(r[0] for r in ent.values())
        if total < MIN_GAMES: continue
        rows = sorted(([u, *r] for u, r in ent.items() if r[0] / total >= MIN_SHARE), key=lambda r: -r[1])
        if rows: out[k] = rows
    return out


if __name__ == '__main__':
    main()
