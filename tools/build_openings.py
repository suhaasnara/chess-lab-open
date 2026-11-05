#!/usr/bin/env python3
"""Build site/data/openings.json and site/data/demo-book.json from the
lichess-org/chess-openings dataset (CC0, https://github.com/lichess-org/chess-openings).

openings.json: posId -> [eco, name]  (opening names shown in the trainer header)
demo-book.json: posId -> [[uci, san], ...] (named opening lines as a fallback
"demo book" for offline previews; it has no game counts — the live site uses the
Lichess opening explorer API, and tools/build_masters.py can build a real book).

posId is the same 53-bit FNV id of 'board side castling ep' the page uses,
with the en passant square kept only when the capture is legal.

Usage: python3 tools/build_openings.py <chess-openings dir with a..e.tsv> <site/data dir>
"""
import csv, io, json, sys, chess, chess.pgn

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
    # base36, matching Number.toString(36)
    if n == 0:
        return '0'
    digits = '0123456789abcdefghijklmnopqrstuvwxyz'
    out = []
    while n:
        n, r = divmod(n, 36)
        out.append(digits[r])
    return ''.join(reversed(out))

def main(src, out):
    names, book = {}, {}
    rows = 0
    for letter in 'abcde':
        with open(f'{src}/{letter}.tsv', newline='') as f:
            for row in csv.DictReader(f, delimiter='\t'):
                rows += 1
                game = chess.pgn.read_game(io.StringIO(row['pgn']))
                board = game.board()
                for mv in game.mainline_moves():
                    k = pos_id(norm_key(board))
                    uci, san = mv.uci(), board.san(mv)
                    ent = book.setdefault(k, [])
                    if not any(e[0] == uci for e in ent):
                        ent.append([uci, san])
                    board.push(mv)
                names[pos_id(norm_key(board))] = [row['eco'], row['name']]
    json.dump(names, open(f'{out}/openings.json', 'w'), separators=(',', ':'))
    json.dump(book, open(f'{out}/demo-book.json', 'w'), separators=(',', ':'))
    print(f'{rows} named lines -> {len(names)} named positions, demo book {len(book)} positions')

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
