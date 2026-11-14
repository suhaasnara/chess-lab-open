#!/usr/bin/env python3
"""Tests for tools/privacy_guard.py: it must catch a denylisted token wherever it hides in an exported build,
and fail closed on anything it can't check. Uses a made-up token ('zqxprivatezqx') added to the denylist at
run time, so no real name appears here. Run: python3 tests/guard_test.py"""
import hashlib, importlib.util, io, os, sys, tempfile, contextlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location('guard', os.path.join(ROOT, 'tools', 'privacy_guard.py'))
G = importlib.util.module_from_spec(spec); spec.loader.exec_module(G)
TOK = 'zqxprivatezqx'
G.HASHES.add(hashlib.sha256(TOK.encode()).hexdigest())
NAME = 'zqxnell'
for x in (NAME, NAME + 'hart'):
    G.NAME_HASHES.add(hashlib.sha256(x.encode()).hexdigest())
G.NAME_ALLOW[r'(^|/)data/gtm/'] = list(G.NAME_ALLOW.get(r'(^|/)data/gtm/', [])) + [hashlib.sha256(NAME.encode()).hexdigest()]
fails = 0

def run(files, build=True):
    with tempfile.TemporaryDirectory() as d:
        files = {'index.html': '<!doctype html><title>t</title>', **files} if build else files
        for rel, data in files.items():
            p = os.path.join(d, rel); os.makedirs(os.path.dirname(p), exist_ok=True)
            open(p, 'wb').write(data if isinstance(data, bytes) else data.encode())
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = G.main(d, build)
        return code, out.getvalue()

def check(name, files, want_fail, build=True):
    global fails
    code, out = run(files, build)
    ok = (code == 1) == want_fail
    print(('   ok - ' if ok else '   FAIL - ') + name + ('' if ok else f'\n{out}'))
    fails += not ok

print('== privacy guard: catches private text in the exported build, fails closed')
check('a clean build passes', {'js/a.js': 'const x=1;', 'assets/a.png': b'\x89PNG\x00\x01'}, False)
check('a denylisted token in a script', {'js/a.js': f'// {TOK}\n'}, True)
check('… two-word form and trailing dot', {'a.md': f'see {TOK}.'}, True)
check('… escaped in JSON (\\u0071 = q)', {'data/a.json': '{"n":"z\\u0071xprivatezqx"}'}, True)
check('… as a text run inside a binary (.wasm)', {'sf/a.wasm': b'\x00\x01' + TOK.encode() + b'\x00'}, True)
# 14 Nov 2026: single names and joined usernames (a made-up first name, 'zqxnell', and username, 'zqxnellhart')
check('a private first name alone, in a comment', {'js/a.js': f'/* ("{NAME.capitalize()}" for short) */'}, True)
check('… a joined username', {'js/a.js': f'// ("{NAME}hart")'}, True)
check('… a username with digits or separators', {'js/a.js': f'// {NAME}hart262 and {NAME}_x'}, True)
check('… in the repo scan too', {'README.md': f'thanks to {NAME}'}, True, build=False)
check('… but allowed in a published game (the allow-list is per path)', {'data/gtm/game1.json': '{"black":"%s"}' % NAME}, False)
check('… and not allowed anywhere else in data/', {'data/other.json': '{"black":"%s"}' % NAME}, True)
check('opening books keyed by ids are not name-checked', {'data/masters.json': '{"%s":[["e2e4",1]]}' % NAME}, False)
check('… but still checked against the two-word list', {'data/masters.json': '{"%s":1}' % TOK}, True)
check('a .pgn file', {'data/a.pgn': '[Event "x"]\n1. e4 *'}, True)
check('a private-kit path (players/)', {'players/x.json': '{}'}, True)
check('an unknown file type (.zip) fails closed', {'data/a.zip': b'PK\x03\x04'}, True)
check('a "text" file that is not UTF-8 fails closed', {'js/a.js': b'\xff\xfe\x00bad'}, True)
check('JSON that does not parse (with escapes) fails closed', {'data/a.json': '{"n":"\\u0041",'}, True)
with contextlib.redirect_stdout(io.StringIO()):
    code2 = G.main(os.path.join(ROOT, 'no-such-folder'), True)
print(('   ok' if code2 == 1 else '   FAIL') + ' - a missing folder fails'); fails += code2 != 1
with tempfile.TemporaryDirectory() as d:
    open(os.path.join(d, 'a.js'), 'w').write('x')
    with contextlib.redirect_stdout(io.StringIO()):
        c = G.main(d, True)
    print(('   ok' if c == 1 else '   FAIL') + ' - --build without index.html fails'); fails += c != 1
with tempfile.TemporaryDirectory() as d:
    open(os.path.join(d, 'index.html'), 'w').write('x')
    saved = set(G.HASHES); G.HASHES.clear()
    with contextlib.redirect_stdout(io.StringIO()):
        c = G.main(d, True)
    G.HASHES.update(saved)
    print(('   ok' if c == 1 else '   FAIL') + ' - an emptied denylist fails'); fails += c != 1
print('All guard tests passed.' if not fails else f'{fails} guard test(s) failed.')
sys.exit(1 if fails else 0)
