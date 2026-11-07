#!/usr/bin/env python3
"""Sum raw club-book counts from several months (tools/build_club.py --raw) and prune them into one book.

Usage: python3 tools/merge_club.py OUT.json RAW1.json RAW2.json ...
Same format and rules as build_club.py's normal output. Sources: the CC0 Lichess open database only.
"""
import json, sys
from build_club import prune


def main():
    out, raws = sys.argv[1], sys.argv[2:]
    tree = {}
    for f in raws:
        for k, ent in json.load(open(f)).items():
            t = tree.setdefault(k, {})
            for u, r in ent.items():
                row = t.setdefault(u, [0, 0, 0, 0])
                for i in range(4): row[i] += r[i]
    book = prune(tree)
    json.dump(book, open(out, 'w'), separators=(',', ':'))
    print(f'{len(raws)} raw files -> {len(tree)} positions -> {len(book)} in the book -> {out}')


if __name__ == '__main__':
    main()
