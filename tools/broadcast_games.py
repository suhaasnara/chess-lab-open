#!/usr/bin/env python3
"""List or extract master games from the Lichess broadcast database (https://database.lichess.org/, CC0).

  python3 tools/broadcast_games.py list OUT.tsv [--min-elo 2700]       < broadcast.pgn
  python3 tools/broadcast_games.py pick OUT.pgn SELECT.json             < broadcast.pgn

list: decisive standard games where both players are rated >= --min-elo, one row each (White, Black, ratings, result,
      Event, Round, Date, plies, opening), for choosing Guess-the-move games.
pick: the games named in SELECT.json ([{"white": "...", "black": "...", "date": "YYYY.MM.DD"}], substring match on names)
      into OUT.pgn, in SELECT order, for tools/build_gtm.py. The PGN stays on the runner; never commit it.
"""
import io, json, re, sys
import chess.pgn

HDR = re.compile(r'^\[(\w+) "(.*)"\]')


def games(stream):
    hdr, lines = {}, []
    for line in stream:
        if line.startswith('[Event ') and lines:
            yield hdr, ''.join(lines); hdr, lines = {}, []
        m = HDR.match(line)
        if m: hdr[m.group(1)] = m.group(2)
        lines.append(line)
    if lines:
        yield hdr, ''.join(lines)


def elo(h, k):
    try: return int(h.get(k, '0'))
    except ValueError: return 0


def main():
    mode, out = sys.argv[1], sys.argv[2]
    stream = io.TextIOWrapper(sys.stdin.buffer, encoding='utf-8', errors='ignore')
    if mode == 'list':
        lo = int(sys.argv[sys.argv.index('--min-elo') + 1]) if '--min-elo' in sys.argv else 2700
        rows = []
        for h, txt in games(stream):
            if h.get('Result') not in ('1-0', '0-1') or h.get('Variant', 'Standard') != 'Standard' or 'FEN' in h: continue
            if min(elo(h, 'WhiteElo'), elo(h, 'BlackElo')) < lo: continue
            tc = h.get('TimeControl', '')
            if re.search(r'rapid|blitz|bullet|armageddon|960|freestyle', h.get('Event', '') + ' ' + h.get('Round', ''), re.I): continue
            m = re.match(r'\s*(\d+)\s*(min)?', tc)   # classical only: base time of an hour or more (seconds, or "90mins")
            if m and '/' not in tc and int(m.group(1)) * (60 if m.group(2) else 1) < 3600: continue
            plies = len(re.findall(r'\b\d+\.', re.sub(r'\{[^}]*\}', '', txt.split('\n\n', 1)[-1]))) * 2
            rows.append('\t'.join([h.get('White', ''), h.get('Black', ''), h.get('WhiteElo', ''), h.get('BlackElo', ''), h['Result'],
                                   h.get('Event', ''), h.get('Round', ''), h.get('Date', ''), str(plies), h.get('Opening', ''), tc]))
        open(out, 'w').write('White\tBlack\tWElo\tBElo\tResult\tEvent\tRound\tDate\tPlies~\tOpening\tTC\n' + '\n'.join(rows) + '\n')
        print(f'{len(rows)} games -> {out}')
    else:
        sel = json.load(open(sys.argv[3])); found = [None] * len(sel)
        for h, txt in games(stream):
            for i, s in enumerate(sel):
                if found[i] is None and s['white'].lower() in h.get('White', '').lower() and s['black'].lower() in h.get('Black', '').lower() \
                        and s.get('date', h.get('Date')) == h.get('Date') and h.get('Result') in ('1-0', '0-1'):
                    g = chess.pgn.read_game(io.StringIO(txt))   # strips clocks/evals comments when re-exported below
                    exp = chess.pgn.StringExporter(headers=True, variations=False, comments=False)
                    found[i] = g.accept(exp)
        miss = [s for s, f in zip(sel, found) if f is None]
        open(out, 'w').write('\n\n'.join(f for f in found if f) + '\n')
        print(f'{len(sel) - len(miss)} of {len(sel)} games -> {out}; missing: {miss}')


if __name__ == '__main__':
    main()
