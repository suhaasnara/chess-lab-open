#!/usr/bin/env python3
"""Build one Guess-the-move game file (site/data/gtm/gameN.json) from a PGN.

  python3 tools/build_gtm.py <pgn> <game index in the pgn, 0-based> <out.json> [--evdepth 22] [--mdepth 14]

Needs python-chess and a Stockfish binary on PATH (or /usr/games/stockfish). Spec: per winner move after theory,
MultiPV 3 at --mdepth gives pts (2 = engine's choice with the next best 0.15+ winning chances worse and not a
recapture; 1 = other; 0 = only legal move), alts (moves within 0.1 wc of the game move) and ev (the game move's eval,
mover's view, cp); evs = eval after every ply at --evdepth (White's side); theory = leading plies listed in the
demo book (max 20); id = g- + sha1(White|Black|Date)[:8]. Then add a row to site/data/gtm/index.json.
Only games Suhaas has picked go in (see the handoff); the PGN itself never enters this repo.
"""
import sys, json, math, hashlib, argparse, io
import chess, chess.pgn, chess.engine
import os, shutil
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from build_openings import norm_key, pos_id

SITE = os.path.join(HERE, '..', 'site', 'data') + os.sep
DEMO = json.load(open(SITE + 'demo-book.json'))
OPEN = json.load(open(SITE + 'openings.json'))

def wc(p):
    p = max(-15, min(15, p))
    return 2 / (1 + math.exp(-0.368208 * p)) - 1

def cp_of(score):  # PovScore -> cp from that POV, mates +-9900
    if score.is_mate():
        return 9900 if score.mate() > 0 else -9900
    return score.score()

def pawns(cp):
    return (99 if cp > 0 else -99) if abs(cp) >= 9900 else cp / 100

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('pgn'); ap.add_argument('idx', type=int); ap.add_argument('out')
    ap.add_argument('--evdepth', type=int, default=22)
    ap.add_argument('--mdepth', type=int, default=14)
    a = ap.parse_args()
    f = open(a.pgn, encoding='utf-8')
    for _ in range(a.idx + 1):
        g = chess.pgn.read_game(f)
    H = g.headers
    board = g.board()
    moves, ucis, boards = [], [], []
    for mv in g.mainline_moves():
        boards.append(board.copy())
        moves.append(board.san(mv)); ucis.append(mv.uci())
        board.push(mv)
    res = H['Result']
    winner = 'w' if res == '1-0' else 'b' if res == '0-1' else None
    # theory: leading plies listed in the demo book, max 20
    theory = 0
    for i, b in enumerate(boards[:20]):
        row = DEMO.get(pos_id(norm_key(b)))
        if row and any(u == ucis[i] for u, _ in row):
            theory += 1
        else:
            break
    # opening: deepest named position reached along the game (first 20 plies)
    opening = None
    b = chess.Board()
    for i, u in enumerate(ucis[:20]):
        b.push_uci(u)
        o = OPEN.get(pos_id(norm_key(b)))
        if o: opening = o
    eng = chess.engine.SimpleEngine.popen_uci(shutil.which('stockfish') or '/usr/games/stockfish')
    eng.configure({'Threads': 2, 'Hash': 512})
    m = {}
    me = 0 if winner == 'w' else 1
    for i in range(theory, len(moves)):
        if i % 2 != me: continue
        b = boards[i]; gm = chess.Move.from_uci(ucis[i])
        legal = list(b.legal_moves)
        if len(legal) == 1:
            m[str(i)] = {'pts': 0, 'ev': None, 'best': ucis[i], 'alts': [], 'gap': 0}
            continue
        info = eng.analyse(b, chess.engine.Limit(depth=a.mdepth), multipv=3)
        lines = [(x['pv'][0].uci(), cp_of(x['score'].pov(b.turn))) for x in info]
        evs = dict(lines)
        if ucis[i] not in evs:
            x = eng.analyse(b, chess.engine.Limit(depth=a.mdepth), root_moves=[gm])
            evs[ucis[i]] = cp_of(x['score'].pov(b.turn))
        best, bcp = lines[0]
        gap = wc(pawns(bcp)) - wc(pawns(lines[1][1])) if len(lines) > 1 else 1.0
        gev = evs[ucis[i]]
        alts = [u for u, c in lines if u != ucis[i] and wc(pawns(gev)) - wc(pawns(c)) <= 0.1]
        recap = False
        if i > 0 and b.is_capture(gm):
            prev = chess.Move.from_uci(ucis[i - 1])
            recap = boards[i - 1].is_capture(prev) and prev.to_square == gm.to_square
        pts = 2 if (best == ucis[i] and gap >= 0.15 and not recap) else 1
        m[str(i)] = {'pts': pts, 'ev': gev, 'best': best, 'alts': alts, 'gap': round(gap, 3)}
        print(i, moves[i], m[str(i)], file=sys.stderr, flush=True)
    evs_w = []
    for i in range(len(moves)):
        b = boards[i].copy(); b.push_uci(ucis[i])
        if b.is_checkmate():
            evs_w.append(9900 if b.turn == chess.BLACK else -9900); continue
        if b.is_game_over():
            evs_w.append(0); continue
        x = eng.analyse(b, chess.engine.Limit(depth=a.evdepth))
        evs_w.append(cp_of(x['score'].white()))
    eng.quit()
    gid = 'g-' + hashlib.sha1(f"{H['White']}|{H['Black']}|{H['Date']}".encode()).hexdigest()[:8]
    out = {'id': gid, 'white': H['White'], 'black': H['Black'], 'we': H.get('WhiteElo', ''), 'be': H.get('BlackElo', ''),
           'date': H['Date'], 'event': H['Event'], 'result': res, 'winner': winner, 'opening': opening,
           'theory': theory, 'moves': moves, 'evs': evs_w, 'm': m, 'maxpts': sum(v['pts'] for v in m.values())}
    json.dump(out, open(a.out, 'w'), separators=(',', ':'), ensure_ascii=False)
    print('done', gid, 'theory', theory, 'opening', opening, 'maxpts', out['maxpts'], 'plies', len(moves))

main()
