#!/usr/bin/env python3
"""Build site/data/endgames.json for the Endgames tab from tools/endgame_positions.json and the
Lichess tablebase API (https://tablebase.lichess.ovh, Syzygy tables, up to 7 pieces).

  python3 tools/build_endgames.py tools/endgame_positions.json site/data/endgames.json [--budget 120]

For every position: the tablebase result (checked against the position's goal; a mismatch is reported
and the position is left out), and a tree the page can use with no network:
  user nodes  key -> {"b": best moves, "w": other winning moves, "d": drawing moves}  (UCI, space-joined;
                     any other legal move throws the result away)
  reply nodes key -> "uci"   the tablebase's best defence (longest resistance) after a user move; in drawn exercises,
                     the reply that keeps the most material among those with the same result (keep_material)
The main line (best move, best reply, ...) is built first and in full, then other good user moves
breadth-first until the budget of user nodes per position is used. key = placement, side, castling,
en-passant square only when an en-passant capture is legal (python-chess fen(en_passant='legal')).
"""
import json, sys, time, urllib.parse, urllib.request, collections
import chess

API = 'https://tablebase.lichess.ovh/standard?fen='
CACHE, LAST = {}, [0.0]

def tb(fen):
    if fen in CACHE:
        return CACHE[fen]
    for attempt in range(8):
        wait = 0.12 - (time.time() - LAST[0])
        if wait > 0:
            time.sleep(wait)
        LAST[0] = time.time()
        try:
            req = urllib.request.Request(API + urllib.parse.quote(fen), headers={'User-Agent': 'chess-lab-open endgame builder (github.com/suhaasnara/chess-lab-open)'})
            with urllib.request.urlopen(req, timeout=30) as r:
                d = json.load(r)
            CACHE[fen] = d
            return d
        except urllib.error.HTTPError as e:
            time.sleep(61 if e.code == 429 else 3 * (attempt + 1))
        except Exception:
            time.sleep(3 * (attempt + 1))
    raise RuntimeError('tablebase did not answer for ' + fen)

def key(b):
    return ' '.join(b.fen(en_passant='legal').split()[:4])

def res(cat):
    """A move's category is from the opponent's side after the move; returns W/D/L for the mover."""
    return {'loss': 'W', 'win': 'L', 'maybe-loss': 'W', 'maybe-win': 'L'}.get(cat, 'D')

def metric(m):
    return (abs(m['dtm']) if m.get('dtm') is not None else 10000 + abs(m.get('dtz') or 0))

PREFER = []

def user_node(b, goal):
    d = tb(b.fen())
    ms = d.get('moves') or []
    W = [m for m in ms if res(m['category']) == 'W']
    D = [m for m in ms if res(m['category']) == 'D']
    if goal == 'win' and W:
        best = min(metric(m) for m in W)
        bset = [m['uci'] for m in W if metric(m) == best]
        node = {'b': ' '.join(bset), 'w': ' '.join(m['uci'] for m in W if m['uci'] not in bset), 'd': ' '.join(m['uci'] for m in D)}
        good = [m['uci'] for m in sorted(W, key=metric)]
    else:
        node = {'b': '', 'w': ' '.join(m['uci'] for m in W), 'd': ' '.join(m['uci'] for m in D)}
        good = [m['uci'] for m in D]
    good.sort(key=lambda u: (u not in PREFER, PREFER.index(u) if u in PREFER else 0))   # the textbook moves first (stored line, then expansion)
    if goal == 'win' and W:
        good = [u for u in good if u in bset] + [u for u in good if u not in bset]
    return {k: v for k, v in node.items() if v}, good

def finished(b, prev, mv, goal, end, depth):
    """True when the exercise is over after the user's move mv (prev = board before it)."""
    if b.is_game_over(claim_draw=False):
        return True
    if goal == 'win' and end == 'convert' and (prev.is_capture(mv) or mv.promotion):
        return True
    if end.startswith('hold:') and depth >= int(end.split(':')[1]):
        return True
    return False

VAL = {chess.PAWN: 1, chess.KNIGHT: 3, chess.BISHOP: 3, chess.ROOK: 5, chess.QUEEN: 9, chess.KING: 0}
GOAL = ['']

def keep_material(b, cands):
    """In a drawn exercise every reply of the stronger side draws, and the tablebase lists first one that often just
    gives material back (Qxa2+ Kxa2, or the king walking away from its pawn). Among the replies with the same result,
    play the one that keeps the most material after the defender's best immediate capture, so the user has to hold
    against a side still trying. Ties keep the tablebase's order."""
    me = b.turn
    def score(u):
        nb = b.copy(); nb.push(chess.Move.from_uci(u))
        mat = sum(VAL[pc.piece_type] * (1 if pc.color == me else -1) for pc in nb.piece_map().values())
        loss = max([VAL[nb.piece_at(m.to_square).piece_type] for m in nb.legal_moves
                    if nb.is_capture(m) and nb.piece_at(m.to_square)] or [0])
        return mat - loss
    best = max(score(u) for u in cands)
    return next(u for u in cands if score(u) == best)

def build(p, budget):
    goal, end = p['goal'], p['end']
    GOAL[0] = goal
    PREFER[:] = p.get('prefer', [])
    root = chess.Board(p['fen'])
    d = tb(root.fen())
    cat = d.get('category')
    want = {'win': ('win',), 'draw': ('draw', 'blessed-loss', 'cursed-win')}[goal]
    info = {'cat': cat, 'dtz': d.get('dtz'), 'dtm': d.get('dtm')}
    if cat not in want:
        return None, info
    nodes, line = {}, []
    used = [0]

    def expand(b, depth, follow_best):
        """Add the user node at b; returns the good moves (best first)."""
        k = key(b)
        if k in nodes:
            return None
        node, good = user_node(b, goal)
        nodes[k] = node
        used[0] += 1
        return good

    def reply(b):
        k = key(b)
        if k in nodes:
            return nodes[k] if isinstance(nodes[k], str) else None
        ms = tb(b.fen()).get('moves') or []
        if not ms:
            return None
        u = ms[0]['uci']
        if GOAL[0] == 'draw':
            u = keep_material(b, [m['uci'] for m in ms if m['category'] == ms[0]['category']])
        nodes[k] = u
        return u

    # main line, in full
    b, depth = root.copy(), 0
    while depth < 120:
        good = expand(b, depth, True)
        if not good:
            break
        mv = chess.Move.from_uci(good[0])
        prev = b.copy(); b.push(mv); depth += 1; line.append(mv.uci())
        if finished(b, prev, mv, goal, end, depth):
            break
        r = reply(b)
        if not r:
            break
        b.push(chess.Move.from_uci(r)); line.append(r)
        if b.is_game_over(claim_draw=False):
            break
    # other good moves, breadth first
    q = collections.deque([(root.copy(), 0)])
    seen = set()
    while q and used[0] < budget:
        b, depth = q.popleft()
        k = key(b)
        if k in seen:
            continue
        seen.add(k)
        if k not in nodes:
            expand(b, depth, False)
        node = nodes.get(k)
        if not isinstance(node, dict):
            continue
        good = (node.get('b', '') + ' ' + node.get('w', '')).split() if goal == 'win' else node.get('d', '').split()
        for u in good[:4]:
            if used[0] >= budget:
                break
            mv = chess.Move.from_uci(u)
            nb = b.copy(); nb.push(mv)
            if finished(nb, b, mv, goal, end, depth + 1):
                continue
            r = reply(nb)
            if not r:
                continue
            nb.push(chess.Move.from_uci(r))
            if nb.is_game_over(claim_draw=False):
                continue
            if key(nb) not in nodes:
                expand(nb, depth + 1, False)
            q.append((nb, depth + 1))
    return {'line': line, 'nodes': nodes}, info

def main(src, out, budget, minutes=100):
    spec = json.load(open(src))
    outp, bad = [], []
    # keep positions already built (a rerun after a time-out continues where it stopped)
    try:
        prev = {q['id']: q for q in json.load(open(out))['positions']}
    except Exception:
        prev = {}
    stop = time.time() + minutes * 60
    def save():
        json.dump({'source': 'Lichess tablebase (Syzygy), tablebase.lichess.ovh', 'groups': spec['groups'], 'positions': outp},
                  open(out, 'w'), separators=(',', ':'), ensure_ascii=False)
    for p in spec['positions']:
        old = prev.get(p['id'])
        if old and all(old.get(k) == p.get(k) for k in ('fen', 'goal', 'end', 'prefer')):
            q = dict(old); q.update({k: p[k] for k in ('title', 'text', 'group')}); outp.append(q); continue
        if time.time() > stop:
            print(f"TIME: {p['id']} not built (rerun to continue)", flush=True); continue
        t0 = time.time()
        tree, info = build(p, budget)
        if tree is None:
            bad.append((p['id'], p['goal'], info))
            print(f"MISMATCH {p['id']}: goal {p['goal']}, tablebase says {info}", flush=True)
            continue
        q = dict(p); q['tb'] = info; q.update(tree)
        outp.append(q); save()
        print(f"{p['id']}: {info['cat']} dtz {info['dtz']} dtm {info['dtm']}; line {len(tree['line'])} plies, "
              f"{len(tree['nodes'])} nodes, {time.time() - t0:.0f}s", flush=True)
    save()
    print(f'{len(outp)} positions -> {out}; {len(bad)} left out')

if __name__ == '__main__':
    a = sys.argv[1:]
    budget, minutes = 120, 100
    if '--budget' in a:
        i = a.index('--budget'); budget = int(a[i + 1]); del a[i:i + 2]
    if '--minutes' in a:
        i = a.index('--minutes'); minutes = float(a[i + 1]); del a[i:i + 2]
    if len(a) != 2:
        print(__doc__); sys.exit(2)
    main(a[0], a[1], budget, minutes)
