#!/usr/bin/env python3
"""Privacy guard for chess-lab-open. Fails (exit 1) if anything from the private
Chess Lab kit leaks into this public repo:

- private-kit paths (input/, work/, course annotation files, player data, ...)
- private-kit course filenames, Suhaas's own PGN exports, or the names of his
  over-the-board opponents. The denylist is stored as SHA-256 hashes of
  normalized tokens, so the guard itself puts none of those names in the repo.
- binary data files that have no place here (.pgn with headers, .hce)

Run from the repo root: python3 tools/privacy_guard.py
CI runs it on every push. A hit prints file:line and a masked token.
"""
import hashlib, os, re, sys

BANNED_PATHS = [
    r'(^|/)input(/|$)', r'(^|/)work(/|$)', r'(^|/)out(/|$)',
    r'(^|/)reps/ann-', r'(^|/)calc(/|$)', r'(^|/)gtm(/|$)', r'(^|/)players(/|$)',
    r'(^|/)bands(/|$)', r'\.hce$', r'(^|/)everyone\.json$', r'(^|/)punish', r'(^|/)olm',
]
# sha256 of lowercase single tokens and two-word pairs that must never appear
HASHES = set("""
040deb56c7878b689c1a91cd0d10e60298166739a77065ecf10850cc7ba7cbcb
05534b135a1caf94f9ea6619efee043317a6f2e0cdb79b05c5e9a3e9b0108aff
0566c820fdcb15ccc970c118ddbba8960a31473c8de7328381bd0a24a2395dc8
072bac68c5bbbdb0765ff0e4ade9f416808ecd5cd704407b7105600a5517e4ff
084231e78cec248c06bec4e6f9da9e18454c6d5134a584b21854e0925d9c53cb
09913bc5150a8e61827b1eda305eddfea8baca37141df74a67ed7f3535a42c60
0b93b47fcbe8330be07a606e8ab35bf9ebc3b365c968076831885ebe3ba10c65
14c8a957e322af8291a2cd0fc1ed24130cfc073b28117d4ea02b778438a6a5a3
18df1942faa5e51a3c38cc5b3bb0cce61f16bef72ac7aec94827d294208a9d25
27de43bd5f8d3d1ddc84ad7ed955dfce06c00fc680c2987bfc9f201ce98f0940
2bf0e43fa9ecf29cf3bf83b6b91fe3f9eb7a016c35066200aa877b906b7d9c56
2df7411c9ef06577838ed640e9dfd52c0130e53e3ee7f45cfae631a13fde5a18
364dc2bd4e595c6b1c524c4eeafc0fd9c1a339829f611e12ab23fde68d0c4f48
3bc242bda85348a0487c5a9b7df03cda613482b1a56b57d458463e9b510741ad
3d7a01b1c01de03dfaf3cea419274b52da29ef657cb89d492bedd4d5b2441ee4
3dd205244940a7c4ae5e768a06206e331fd443fb62643131f48ca10a14e3807a
40d9b6e7bdf1ff746d5ab66c9e1d086e66f8a5d8c66a907c454fae944a9fca19
413091a4faab8fb5f22ae4c71e3ff59cb7b14618ee8ac87ec0df0b9a1460a4e2
419620021cc59b8ab8dc75e999828e419e6e54d3dbd9240e88566daf76709a8d
4ed01fc7608562d8fbb10f77be83e338c7c90cad9f18c62e10ae0f78386eca69
532d25a08c2b69933a099146806c4fc462f3c5003cc208ecfad1e61b48321590
533e84c0f9f13574c5b38732c985999b882a8ed54c2339899d81dfa81d3e7d56
549ced90bdfc93a129758e74d2643c2837afb1a26a73d438457c216c47dbe7e1
5a891c14fecdff31640a124077d61ce5f95a24e011822a5fa1b95e12824b1272
6365acf4c71f50adc7db3a95a83677e3731bcaf588976ffafd9bb862f4448329
6bca8557ab2bf6efb6b37b43c7f497764aba9fdb7df0f1dc0a1a067ddbaebf46
6edf783cdad3f3f310c525cce600c95ba5d9d2b74ea70ac7cf63338947d84cd3
710c5dbf62fba6dde60496216ec27dfa213c4181ef91ba61a7773fbf1fc2a4d5
74d668aa2d6e071772e65435b8b822415fb21ca2125713078d2c006828367928
7684916c0cc45f2b6f088ea141fd07ecf5a42c79e9a8c0fd7d5ce94bd0d7a6f1
7b7b9ab7c2f0cc45dcf399184b52ea7ad8062e881eb2d49f7a84b24d81e377ad
84839870c5e3591824ee2ff57b869e66f6c35a49b223a301f0b9238039c9d527
8a86f44629a2214a77113d37d52e8643730f990ef6d643b68a43cdda1747160b
8d4bc70ae623c9c53d82f556480394b1a698ef985927d2fa501af0a84440aa6b
91d53763e99f4ea3c074124c744eed6a21a022d7a5c90130c8a6a47ea7fd6f4f
abccb28769ea5f149b67bc7c1159e63cac48e0688030533ab4854da454776487
afe8728ffe12579f40083c9fb6f5f51a7d32e7db8669ba62b08e51951b6618f2
b409109f76ff65e8868567d0cb8ef41e315af72a75f4810bc2014d09adc1987c
bb58bde5be7339d74dbf331743ad3ae3ba475d99f140f2d903a4840fcd3bb0d0
bb97ef631e949a4696a5b743316a19f11b3d91c1682d656d553453a8b5255bd1
bc38e56ac4a65013d2f18e591514d341abfb2c5be6dc771e4986ec6c862d283f
be8e4379163eed89916d959032c533abf08df74a69da12e4cd775f26b91ba771
c562de0b114cd4dff6fb59bb78ca38536db06915be91a2a8e7d388520417cdeb
d21e358d22c7f89ddcbc12f66dbc18b1b2ca5371f678d3e33e80457f3f0c626c
dbbeffcbf8d07d2b60a124647258602fb91858e784f66f129c9322dcb740411e
e52884dcb7e6df2f24e561a30654f60e4c61e95fb91b776b2ca1585dfca15577
e9b50ca49bc8428f4f407e4846916061395c4487ef7a8158445968bdd8a3691d
eb1a477c9ead49e25ab6c24159c810f4fa1ae055b47c197db627de82f878c3e7
eb35adcf5c8bbbce97fa4b297238c0518138b5327ca10704f1791f749479d6ba
ee49465a8dded72415b192f76b2168a5af44075513fded2ccfdbc31c2de535e8
f9edc5ac5138112ececa4cf51b9ea1336817e9b73b7d14bb948878a4739682c9
faab8aefb9c0dee39aeeffc0e7bf10ce66ab9809ee818c646859bab09cfd7cc3
fc3617e4bb65b221a546f90ad2eb809a38822912553e72d8e257cc4fca5dd171
fc660aeb6eaa85d069a6f23dcc75d6226c2c7fa1ca7ae39e61784ae6590e487d
""".split())

TEXT_EXT = {'.js','.css','.html','.md','.json','.py','.yml','.yaml','.txt','.tsv','.svg','.sh'}
SKIP = {'.git','node_modules'}
TOKEN = re.compile(r"[a-z0-9][a-z0-9_@.\-]*")
h = lambda s: hashlib.sha256(s.encode()).hexdigest()

def check_file(path, rel):
    hits = []
    try:
        text = open(path, encoding='utf-8', errors='ignore').read()
    except OSError:
        return hits
    for ln, line in enumerate(text.lower().splitlines(), 1):
        toks = TOKEN.findall(line)
        cand = list(toks)
        cand += [t.rstrip('.-') for t in toks]                 # "name." at line ends
        cand += [t.split('.')[0] for t in toks if '.' in t]    # filenames without extension
        cand += [f'{a} {b}' for a, b in zip(toks, toks[1:])]   # two-word names
        for c in cand:
            if h(c) in HASHES:
                hits.append((rel, ln, c[0] + '*' * (len(c) - 1)))
    return hits

def main(root='.'):
    bad = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP]
        for name in filenames:
            rel = os.path.relpath(os.path.join(dirpath, name), root).replace(os.sep, '/')
            for pat in BANNED_PATHS:
                if re.search(pat, rel):
                    bad.append((rel, 0, f'banned path ({pat})'))
            if name.lower().endswith('.pgn'):
                bad.append((rel, 0, 'a .pgn file has no place in this repo'))
            ext = os.path.splitext(name)[1].lower()
            if ext in TEXT_EXT:
                bad += check_file(os.path.join(dirpath, name), rel)
    if bad:
        print('PRIVACY GUARD FAILED — private-kit content must not enter this repo:')
        for rel, ln, what in bad:
            print(f'  {rel}:{ln}  {what}')
        return 1
    print('Privacy guard: clean.')
    return 0

if __name__ == '__main__':
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else '.'))
