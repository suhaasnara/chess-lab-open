#!/usr/bin/env python3
"""Add the Lichess opening family to the puzzles already in site/data/tactics.json (the set and ids stay as they are,
so progress keyed by puzzle id is untouched). Reads the Lichess puzzle database (CC0):
  python3 tools/tag_openings.py lichess_db_puzzle.csv.zst site/data/tactics.json
Writes "op": the first OpeningTags entry (the family, e.g. Sicilian_Defense) on each puzzle that has one, and prints
the coverage (how many puzzles have a family, and the biggest families)."""
import csv, io, json, sys
from collections import Counter

def main(src, path):
    lib = json.load(open(path)); want = {p['id'] for p in lib}; fam = {}
    opener = (lambda p: io.TextIOWrapper(__import__('zstandard').ZstdDecompressor()
              .stream_reader(open(p, 'rb')), encoding='utf-8')) if src.endswith('.zst') else open
    with opener(src) as f:
        for row in csv.DictReader(f):
            pid = row.get('PuzzleId')
            if pid in want:
                tags = (row.get('OpeningTags') or '').split()
                if tags: fam[pid] = tags[0]
    for p in lib:
        p.pop('op', None)
        if p['id'] in fam: p['op'] = fam[p['id']]
    json.dump(lib, open(path, 'w'), separators=(',', ':'))
    c = Counter(fam.values())
    print(f'{len(fam)} of {len(lib)} puzzles have an opening family ({100*len(fam)//max(1,len(lib))}%), {len(c)} families')
    for k, n in c.most_common(40): print(f'  {n:5d}  {k}')

if __name__ == '__main__':
    if len(sys.argv) != 3: print(__doc__); sys.exit(2)
    main(sys.argv[1], sys.argv[2])
