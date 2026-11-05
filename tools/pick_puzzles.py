#!/usr/bin/env python3
"""Rebuild site/data/tactics.json from the Lichess puzzle database (CC0).

Download https://database.lichess.org/lichess_db_puzzle.csv.zst (~300 MB), then:
  python3 tools/pick_puzzles.py lichess_db_puzzle.csv.zst site/data/tactics.json

Selection (the same bar the private kit used): popularity >= 85, >= 300 plays,
rating deviation <= 90, rating 1700-2900; one motif per puzzle (most specific
theme first); up to PER_CELL per motif x 200-point band, evenly over the range.
Seeded, so a rerun picks the same puzzles.
"""
import csv, io, json, random, sys

RATING_LO, RATING_HI = 1700, 2900
PER_CELL = 10
# most specific first: the first match becomes the puzzle's motif
THEMES = ['smotheredMate','backRankMate','doubleCheck','discoveredAttack','skewer','fork','pin',
          'deflection','attraction','interference','clearance','xRayAttack','zugzwang','quietMove',
          'intermezzo','sacrifice','trappedPiece','hangingPiece','promotion','underPromotion',
          'enPassant','castling','exposedKing','kingsideAttack','queensideAttack','defensiveMove',
          'equality','crushing','advantage','mateIn1','mateIn2','mateIn3','mateIn4','mateIn5','mate']

def main(src, out_path):
    rng = random.Random(2026)
    cells = {}
    opener = (lambda p: io.TextIOWrapper(__import__('zstandard').ZstdDecompressor()
              .stream_reader(open(p,'rb')), encoding='utf-8')) if src.endswith('.zst') else open
    with opener(src) as f:
        for row in csv.DictReader(f):
            try:
                rating, dev = int(row['Rating']), int(row['RatingDeviation'])
                pop, plays = int(row['Popularity']), int(row['NbPlays'])
            except (KeyError, ValueError):
                continue
            if not (RATING_LO <= rating <= RATING_HI and pop >= 85 and plays >= 300 and dev <= 90):
                continue
            themes = row['Themes'].split()
            motif = next((t for t in THEMES if t in themes), None)
            if not motif:
                continue
            band = rating // 200 * 200
            cell = cells.setdefault((motif, band), [])
            entry = {'id': row['PuzzleId'], 'fen': row['FEN'],
                     'moves': row['Moves'].split(), 'rating': rating,
                     'motif': motif, 'themes': [t for t in themes if t != motif][:4],
                     'url': 'https://lichess.org/training/' + row['PuzzleId']}
            # reservoir sample per cell, seeded
            cell.append(entry)
            if len(cell) > PER_CELL * 40:
                rng.shuffle(cell); del cell[PER_CELL * 20:]
    out = []
    for (motif, band), cell in sorted(cells.items()):
        rng.shuffle(cell)
        out.extend(cell[:PER_CELL])
    out.sort(key=lambda p: p['id'])
    json.dump(out, open(out_path, 'w'), separators=(',', ':'))
    print(f'{len(out)} puzzles -> {out_path}')

if __name__ == '__main__':
    if len(sys.argv) != 3:
        print(__doc__); sys.exit(2)
    main(sys.argv[1], sys.argv[2])
