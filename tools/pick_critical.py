#!/usr/bin/env python3
"""Pick the critical moments of the Guess-the-move games: site/data/gtm/critical.json.

  python3 tools/pick_critical.py            # rewrite the "auto" entries, print what was picked and why
  python3 tools/pick_critical.py --check    # only print; change nothing

critical.json is keyed by game id (g- + sha1(White|Black|Date)[:8], as build_gtm.py makes it, so it survives a rebuild
of the game files) and holds {"by": "auto" | "hand", "plies": [...]}. A ply is the 0-based index into the game's
moves, the same key as the game's "m" table, and is always one of the winner's guessed moves.
  - "hand" entries are Suhaas's own picks. This tool never changes them: mark a game by hand by writing its entry with
    "by": "hand" (an empty list means "no critical moments in this game", also kept).
  - "auto" entries are rewritten from the game files on every run.

How a moment is picked automatically, from the data build_gtm.py already stores (no engine run here):
  - "only move": m[ply].gap, how much worse the engine's second choice is than its first (winning chances, -1..1),
    is at least ONLY_GAP and the game move is the engine's choice; or
  - "punish": the opponent's last move threw away at least SLIP in winning chances (evs, White's side) and the game
    move is the engine's choice with gap >= SLIP_GAP.
  - Not: a recapture on the square the opponent just captured on, a move in theory, a forced move, or a position
    already decided (the winner at least DECIDED pawns up before the opponent's last move as well as now).
  - At most one moment per 10 of the winner's guessed moves (at least 1, at most MAX), best first, no two within
    3 of the winner's moves of each other.
A game with no move that passes is left out (unmarked) and listed at the end, for marking by hand.
"""
import json, math, os, sys
import chess

HERE = os.path.dirname(os.path.abspath(__file__))
GTM = os.path.join(HERE, '..', 'site', 'data', 'gtm')
OUT = os.path.join(GTM, 'critical.json')
ONLY_GAP, SLIP, SLIP_GAP, DECIDED, MAX = 0.2, 0.25, 0.1, 5, 5


def wc(pawns):
    p = max(-15, min(15, pawns))
    return 2 / (1 + math.exp(-0.368208 * p)) - 1


def recapture(game, i):
    """the game move at ply i takes on the square the opponent's last move captured on"""
    b = chess.Board()
    for san in game['moves'][:i - 1]:
        b.push_san(san)
    prev = b.parse_san(game['moves'][i - 1])
    took = b.is_capture(prev)
    b.push(prev)
    mv = b.parse_san(game['moves'][i])
    return took and b.is_capture(mv) and mv.to_square == prev.to_square


def candidates(game):
    ev, me = game['evs'], 1 if game['winner'] == 'w' else -1
    out = []
    for k, v in game['m'].items():
        i = int(k)
        if i < game['theory'] or v.get('pts', 1) == 0 or i < 2 or i >= len(ev):
            continue
        san = game['moves'][i]
        b = chess.Board()
        for s in game['moves'][:i]:
            b.push_san(s)
        if v.get('best') != b.parse_san(san).uci():
            continue                                   # the engine prefers another move: not a clean "find this" moment
        now, before = me * ev[i - 1] / 100, me * ev[i - 2] / 100
        if now >= DECIDED and before >= DECIDED:
            continue                                   # already won: every reasonable move wins
        if recapture(game, i):
            continue
        gap, slip = v.get('gap', 0), wc(now) - wc(before)
        why = None
        if gap >= ONLY_GAP:
            why = 'only move'
        elif slip >= SLIP and gap >= SLIP_GAP:
            why = 'punish'
        if why:
            out.append({'ply': i, 'san': san, 'why': why, 'score': gap + max(0, slip), 'gap': gap,
                        'slip': round(slip, 2), 'eval': round(now, 1)})
    return out


def pick(game):
    cands = sorted(candidates(game), key=lambda c: -c['score'])
    n = max(1, min(MAX, len(game['m']) // 10))
    chosen = []
    for c in cands:
        if len(chosen) >= n:
            break
        if any(abs(c['ply'] - x['ply']) < 6 for x in chosen):
            continue
        chosen.append(c)
    return sorted(chosen, key=lambda c: c['ply'])


def main():
    check = '--check' in sys.argv
    index = json.load(open(os.path.join(GTM, 'index.json')))
    old = json.load(open(OUT)) if os.path.exists(OUT) else {}
    out = {'_about': old.get('_about') or 'Critical moments in Guess the move, by game id: plies (0-based index into '
           'moves) where the player should slow down. "hand" entries are hand-picked and never overwritten; "auto" '
           'entries come from tools/pick_critical.py.'}
    unmarked = []
    for e in index:
        game = json.load(open(os.path.join(GTM, e['file'])))
        gid = game['id']
        if old.get(gid, {}).get('by') == 'hand':
            out[gid] = old[gid]
            print(f"{e['title']:34} hand: {old[gid]['plies']}")
            continue
        chosen = pick(game)
        if not chosen:
            unmarked.append(e['title'])
            print(f"{e['title']:34} (none)")
            continue
        out[gid] = {'by': 'auto', 'plies': [c['ply'] for c in chosen]}
        desc = ', '.join(f"{c['ply'] // 2 + 1}{'.' if c['ply'] % 2 == 0 else '...'}{c['san']} ({c['why']}, "
                         f"gap {c['gap']:.2f}, slip {c['slip']:+.2f}, {c['eval']:+.1f})" for c in chosen)
        print(f"{e['title']:34} {desc}")
    if unmarked:
        print('\nUnmarked (mark by hand):', '; '.join(unmarked))
    if not check:
        with open(OUT, 'w') as f:
            f.write('{\n' + ',\n'.join(f'  {json.dumps(k)}: {json.dumps(v, ensure_ascii=False)}' for k, v in out.items())
                    + '\n}\n')


main()
