#!/usr/bin/env python3
"""Build site/data/calc.json — hard, long exercises for the Calculation tab — from the
Lichess puzzle database (CC0): https://database.lichess.org/lichess_db_puzzle.csv.zst

  python3 tools/pick_calc.py lichess_db_puzzle.csv.zst site/data/calc.json

Selection: the solver has at least MIN_MOVES moves (so 7+ plies to see), rating >= MIN_RATING,
well-tested puzzles only (rating deviation <= 80, >= 500 plays, popularity >= 80).
Up to PER_CELL per (100-point band x solver-move count), seeded, so a rerun picks the same set.
Same entry format as tactics.json.
"""
import csv, io, json, random, sys

MIN_RATING, MIN_MOVES = 2200, 4
PER_CELL = 60
SKIP = {'mateIn1', 'mateIn2', 'oneMove', 'short'}
NOT_MOTIF = {'long', 'veryLong', 'middlegame', 'endgame', 'advantage', 'crushing', 'mate', 'master',
             'masterVsMaster', 'superGM', 'opening'}

def main(src, out_path):
    rng = random.Random(2026)
    cells, seen = {}, 0
    opener = (lambda p: io.TextIOWrapper(__import__('zstandard').ZstdDecompressor()
              .stream_reader(open(p, 'rb')), encoding='utf-8')) if src.endswith('.zst') else open
    with opener(src) as f:
        for row in csv.DictReader(f):
            seen += 1
            try:
                rating, dev = int(row['Rating']), int(row['RatingDeviation'])
                pop, plays = int(row['Popularity']), int(row['NbPlays'])
            except (KeyError, ValueError):
                continue
            moves = row['Moves'].split()
            n = len(moves) // 2                      # the first move is the opponent's setup move
            if rating < MIN_RATING or n < MIN_MOVES or dev > 80 or plays < 500 or pop < 80:
                continue
            themes = row['Themes'].split()
            if SKIP & set(themes):
                continue
            cell = cells.setdefault((rating // 100 * 100, min(n, 7)), [])
            cell.append({'id': row['PuzzleId'], 'fen': row['FEN'], 'moves': moves, 'rating': rating,
                         'motif': next((t for t in themes if t not in NOT_MOTIF), themes[0] if themes else ''),
                         'themes': themes[:5], 'url': 'https://lichess.org/training/' + row['PuzzleId']})
            if len(cell) > PER_CELL * 30:
                rng.shuffle(cell); del cell[PER_CELL * 10:]
    out = []
    for key in sorted(cells):
        cell = cells[key]; rng.shuffle(cell); out.extend(cell[:PER_CELL])
    out.sort(key=lambda p: (p['rating'], p['id']))
    json.dump(out, open(out_path, 'w'), separators=(',', ':'))
    print(f'{seen} puzzles read -> {len(out)} exercises -> {out_path}')

if __name__ == '__main__':
    if len(sys.argv) != 3:
        print(__doc__); sys.exit(2)
    main(sys.argv[1], sys.argv[2])
