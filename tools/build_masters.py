#!/usr/bin/env python3
"""Build a static masters book (site/data/masters.json) from CC0 games.

The live site works without this file (it queries the Lichess opening explorer
in the visitor's browser); a static book makes it fully offline and faster.

Clean sources (both CC0 / public domain):
  - the Lichess Elite Database (strong Lichess games, repackaged from the CC0
    Lichess game dumps): https://database.nikonoel.fr/
  - Lichess broadcast games (OTB events relayed on Lichess, CC0):
    https://database.lichess.org/#broadcast

Do NOT build it from a commercial games database or from TWIC: their terms do
not allow redistributing a derived book in a public repo.

Usage:
  python3 tools/build_masters.py out.json game files: *.pgn or *.pgn.zst
  python3 tools/build_masters.py site/data/masters.json elite/*.pgn

Format (the same the page reads): { posId: [[uci, games, white, draws, black], ...] }
posId = 53-bit FNV of 'board side castling ep' (ep only when the capture is legal),
positions seen in >= MIN_GAMES games through ply MAX_PLY, moves with >= 0.5% share.
"""
import io, json, sys
import chess, chess.pgn

MAX_PLY = 30
MIN_GAMES = 20
MIN_SHARE = 0.005

def norm_key(board):
    parts = board.fen().split(' ')
    if parts[3] != '-':
        if not any(board.is_en_passant(m) for m in board.legal_moves):
            parts[3] = '-'
    return ' '.join(parts[:4])

def pos_id(k):
    h1, h2 = 0x811c9dc5, (0x01000193 ^ 0x9e3779b9) & 0xffffffff
    for ch in k.encode():
        h1 = ((h1 ^ ch) * 0x01000193) & 0xffffffff
        h2 = ((h2 ^ ch) * 0x01000193) & 0xffffffff
    n = (h1 & 0x1fffff) * 4294967296 + h2
    digits = '0123456789abcdefghijklmnopqrstuvwxyz'
    out = ''
    while n:
        n, r = divmod(n, 36)
        out = digits[r] + out
    return out or '0'

def open_pgn(path):
    if path.endswith('.zst'):
        import zstandard
        return io.TextIOWrapper(zstandard.ZstdDecompressor().stream_reader(open(path, 'rb')),
                                encoding='utf-8', errors='ignore')
    return open(path, encoding='utf-8', errors='ignore')

def main(out_path, paths):
    tree = {}   # posId -> {uci: [games, w, d, b]}
    games = 0
    for path in paths:
        with open_pgn(path) as f:
            while True:
                game = chess.pgn.read_game(f)
                if game is None:
                    break
                res = game.headers.get('Result', '*')
                if res not in ('1-0', '0-1', '1/2-1/2'):
                    continue
                w = 1 if res == '1-0' else 0
                d = 1 if res == '1/2-1/2' else 0
                b = 1 if res == '0-1' else 0
                board = game.board()
                if board.fen() != chess.STARTING_FEN:
                    continue
                games += 1
                for ply, mv in enumerate(game.mainline_moves()):
                    if ply >= MAX_PLY:
                        break
                    k = pos_id(norm_key(board))
                    ent = tree.setdefault(k, {})
                    row = ent.setdefault(mv.uci(), [0, 0, 0, 0])
                    row[0] += 1; row[1] += w; row[2] += d; row[3] += b
                    board.push(mv)
                if games % 20000 == 0:
                    print(f'  {games} games, {len(tree)} positions', file=sys.stderr)
    out = {}
    for k, ent in tree.items():
        total = sum(r[0] for r in ent.values())
        if total < MIN_GAMES:
            continue
        rows = [[u, r[0], r[1], r[2], r[3]] for u, r in ent.items()
                if r[0] / total >= MIN_SHARE]
        rows.sort(key=lambda r: -r[1])
        if rows:
            out[k] = rows
    json.dump(out, open(out_path, 'w'), separators=(',', ':'))
    print(f'{games} games -> {len(out)} positions -> {out_path}')

if __name__ == '__main__':
    if len(sys.argv) < 3:
        print(__doc__); sys.exit(2)
    main(sys.argv[1], sys.argv[2:])
