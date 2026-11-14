#!/usr/bin/env python3
"""Privacy guard for chess-lab-open. Fails (exit 1) if anything from the private
Chess Lab kit leaks into this public repo:

- private-kit paths (input/, work/, course annotation files, player data, ...)
- private-kit course filenames, Suhaas's own PGN exports, or the names of his
  over-the-board opponents. The denylist is stored as SHA-256 hashes of
  normalized tokens, so the guard itself puts none of those names in the repo.
- binary data files that have no place here (.pgn with headers, .hce)

Run from the repo root: python3 tools/privacy_guard.py [.]
  python3 tools/privacy_guard.py --build site    the exported build: the exact folder that is deployed
CI runs it on every push (the repo), and the deploy job runs --build on the folder it uploads, after the
version stamp, so what reaches GitHub Pages is what was checked. A hit prints file:line and a masked token.

Fails closed: a file it can't read, text that isn't valid UTF-8, a file type it doesn't know (only the
binary types in BINARY_EXT are allowed, and their embedded text runs are scanned too), JSON it can't parse,
or a scan that finds no files all fail the check instead of passing it. Escaped JSON strings (\u0041...)
are decoded and scanned as well.
"""
import hashlib, json, os, re, sys

BANNED_PATHS = [
    r'(^|/)input(/|$)', r'(^|/)work(/|$)', r'(^|/)out(/|$)',
    # gtm/bNN.json is the private kit's shard naming (book-derived games); the open
    # repo's own published game lives at site/data/gtm/ and is allowed.
    r'(^|/)reps/ann-', r'(^|/)calc(/|$)', r'(^|/)gtm/b\d', r'(^|/)players(/|$)',
    r'(^|/)bands(/|$)', r'\.hce$', r'(^|/)everyone\.json$', r'(^|/)punish', r'(^|/)olm',
]
# sha256 of lowercase single tokens and two-word pairs that must never appear.
# Entries removed by the owner's explicit choice: the opponents in the Guess-the-move
# games he picked to publish (site/data/gtm/; game 1 on 5 Nov 2026, game 10 on 6 Nov 2026).
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
be8e4379163eed89916d959032c533abf08df74a69da12e4cd775f26b91ba771
c562de0b114cd4dff6fb59bb78ca38536db06915be91a2a8e7d388520417cdeb
d21e358d22c7f89ddcbc12f66dbc18b1b2ca5371f678d3e33e80457f3f0c626c
dbbeffcbf8d07d2b60a124647258602fb91858e784f66f129c9322dcb740411e
e52884dcb7e6df2f24e561a30654f60e4c61e95fb91b776b2ca1585dfca15577
eb1a477c9ead49e25ab6c24159c810f4fa1ae055b47c197db627de82f878c3e7
eb35adcf5c8bbbce97fa4b297238c0518138b5327ca10704f1791f749479d6ba
ee49465a8dded72415b192f76b2168a5af44075513fded2ccfdbc31c2de535e8
f9edc5ac5138112ececa4cf51b9ea1336817e9b73b7d14bb948878a4739682c9
faab8aefb9c0dee39aeeffc0e7bf10ce66ab9809ee818c646859bab09cfd7cc3
fc3617e4bb65b221a546f90ad2eb809a38822912553e72d8e257cc4fca5dd171
fc660aeb6eaa85d069a6f23dcc75d6226c2c7fa1ca7ae39e61784ae6590e487d
""".split())

# Names of private people (14 Nov 2026): the list above only matched a full two-word name side by side, so a first
# name, a surname or a joined username in a comment went through. NAME_HASHES holds sha256 of single lowercase tokens:
# first names, surnames, nicknames, usernames and the joined forms a username is made of (firstlast, f.last, ...), for
# the people the private kit tracks and for friends who use this site. Built in the private kit
# (tools/privacy/name_hashes.py); only hashes are here. Checked against every token, its parts between . _ - @, and
# the token without trailing digits.
NAME_HASHES = set("""
01230617c44321c5d78a75184b8d5c7e71f10af2a9ff9ef3eda0ef7c2f1b19a5
04002e410e56b583cb8f6a6a91c689dca8ff9f11b850eaa3c65f34f5ed9f039f
0427f05491f48127aa5235e755d27f5d10afb4aeebaad22059aa1b15831809ef
04ad298c5ebe1e6c80efb3e6acfa5979d842acb4d143e920df925ab267ae99be
0527ccce83760bad4e6ca2c02495bc6e558d1e634f4fed447b3c571c0b760763
055fced1da904bfc3734cd3731aebc9de2453590342a877396ccc48f786dc73e
072bac68c5bbbdb0765ff0e4ade9f416808ecd5cd704407b7105600a5517e4ff
09137e7610ffee880e4e2bdf615407d4729934a23c1d835acce091ec92ab4d56
094ee8bb5b889642db6b0359a16f068f937822207338e93ffeb34982e52033a1
09913bc5150a8e61827b1eda305eddfea8baca37141df74a67ed7f3535a42c60
0aa0a0476cee726666e900822fbcabedca28e1ae74c99271c617d2111aea7c4c
0f673c1e1cc195d4236a9e80c42b6803fdecba59a29e5803661d0b556608e199
0f8e251c8a34325c142610dc4b1a7ace9269fab853ac58e473962cc0419dbef2
11ab109e4178c8a51d7591028adca778c79c9ee5f63cf985c793c641c0f9b70c
12e91a60b336debc3826273ecac5ad2612df6df18d36e884f59561816e034012
13340323cac7a274460ab7e1e3f9b3b827d2ac839393a8058d3e46579e0a054a
14f69b842128e247e8e502b95aa514ac0c9ad33add99a7d4a7ddf1a938e5c866
170b6911d586842addc1c852a423e2f7342eb6696027233d7c5a8c2a4048ac64
1c3067d006117166a308055a9606e830ec2f48b18909099c1f1997d3fde38561
1cd3fea1ed3458b3451e055e964c83837f5e743c515b0dbd087bd31836c33107
1d11f504fee2d78b90ca73f8a4d137ba6fa1a17921918751342ccb01fa6063d9
1db4640a250ef03878c397a7595de50d14fdb279bcb3cb182909ecfb7dc31a11
1ddb0ea08c8f6d0ec0a4adf76cf8e2174e60701e25b6176b86698eda73ec5753
1e77e44d5da503a50bbacc18b9297a36f3ed025952b0ccd62c4662dc3d473020
1e88b405fb15276be6d19efb809bbfc3a3651333f9e9d0ab11df1f9011d1152b
1f48b72461e2799f0513bf577b2489b5e2d22b1d1119e808541071fc0f260c4f
2062a48a80dbd0503f74e689e470fca9a8175427f6b2fd815b25c9b5df36cd40
206f66d0ef2e2c9a71e8905e7b600c1c0c94756a2f9cc5593cd2932c1e6733ba
20d0494eccb0d50aa952a54b08bdc2013b2fef48994f1afe19cf67a04e0d4279
238cf974f865819f0386d01dd4e0309d32131adc42d2872718042d75859d74fd
23ddda4810068cc44360dffd31b6c5a9ad13fb9e6a69c9354a5d1b07f1b9843f
25dde1e9ef311ecf602f9cccc398d8c67e4b8dcf7c83f2d388a20ece4b911e95
276fdba59aaf0c28fbbf83bb66dea807aeb1c0611c6bb8b35ebde930241879a6
27de43bd5f8d3d1ddc84ad7ed955dfce06c00fc680c2987bfc9f201ce98f0940
2a82f98ab26cac5dd5ef0cd7db23cb5901ad97d2ba1328ee634be3066f2340a0
2b0e14ddc0e2c0fab7aace975ff4261de1576ab95680f0d54618896782961114
2d0153aa7cbbcfebe7adf72a9e8fb45b0ba2ad7b0bb7d6c15debaae91620bd27
2d8b294a3b1efa0188006576c459a6ba686129742f8c11b3646f7d6c2e7b5342
2df7411c9ef06577838ed640e9dfd52c0130e53e3ee7f45cfae631a13fde5a18
303c4906dbf29f5a88a717080607d3cd40d2864bde34ca1b1e40f8a103d2eb4d
304c5fa0cde8a28cb2b0ff60900da18b409b49ae9e1fae2b544222799d1c4f59
307a5e68dd79f04967b2e7948e7796632901e8930e690674dcb7de582ba236aa
30b968b802b956c68bb1e9b7fb388c0717520af9ed18b8f6fcdabe092d8dbafc
31611159e7e6ff7843ea4627745e89225fc866621cfcfdbd40871af4413747cc
3193adbad43ea4dcd7862b8da867f7f4cee643f3091ac99265875043e7f9001f
32449697f71b1871b12809bf6d8ccef95adcc3d427c5d0b144cbb8a5a636c559
33e044ef9944afbec412cce0c2dba1c4b9443490b777d0ccda83f9d6920448a0
3431abe04fb534bbac0233f14890a3024fbfe531079f3d5f7b2614706ed6b952
35b7a0c607f76ded7ee19d332cf5b8373f1a1b90702f283aa579e5cf7c02684d
364dc2bd4e595c6b1c524c4eeafc0fd9c1a339829f611e12ab23fde68d0c4f48
387ea6c32f46ad485dac8eaa539102c05cc167402519965981524554ac403eeb
3b7232aa4ab58c54f363db92fbaece67f77f56f790aa78e26813b100dcf7d2f1
3bf39bf3fe465c0600105b3451f274fa9f05b3c706f022608c0fb28285fe5cbf
3c6abee5feda03a70bc3dc95201d86cb666079c6c6fdbc38ec87491d3d77c724
3d4ad4afc5c0351f7952147966b4534bb5a002e7e548b2fdf8a3b9c0cf5c3261
3d669568ed08d309508efc8c203ad923abfbfbe75d6ffd3bf67bdbcd4103b715
3e5194d64afe08daedc3d0b1328197275b2f127dca2b4de8879738726aea7db6
4228f82e5377a8320bb7612177eda029e6f2e2930b293b28b694c3025f310aaf
43a4e2d75048369acacd61b3cd5fa7a13eedaec3a1aa63e6827b9ba8efe3a5b0
44161a4d6c9e6c19894aa7e8b9f7341ae1f3418df3d0d53e2c4deb3f8dec5610
449e7c4ff29002ee7d7481d9fb9fddfb2ae374501f96d8675b8d18feee414f19
465789010a042d9e513d70c2ab4120cf6acb1e0f9a4545786945e27e58289e1e
4b90255249c3dfe036cf624f9171cf6f92f7db0f08f377b929ff7068ff910956
4bc11c12fd7abff5f823fe0f9681a7882afb7e5cdbf09f2b2df4aa8c03688666
4d8aaa64f68587b18e27604cd3d3b67aaa66342ef33df2ae755b5524e84cb3d5
532d25a08c2b69933a099146806c4fc462f3c5003cc208ecfad1e61b48321590
54a181f25b30387a262fa941db61a8bfc27395dd52ee9768f3e04c28afa4e7fa
55fd9444eafd4613f730ab50420d644ae38747b6eb8e3f5eaaa7cfd109a04427
574063426e82f4ec06cde80fd2b333d84e44cd1a8028781205485ea6fb262654
57e066036324032d0314e1a487f2ed457986abef6d424962d30ed7c460fa55ad
5a891c14fecdff31640a124077d61ce5f95a24e011822a5fa1b95e12824b1272
5acbffbf9ed1b6ccd936b12097e4577106f16803fc7670329f738b762da94a5a
5b3be4b71b7055ca0cd3b282d806b7826b0c5d2afa3c5a55e67372630b0e46cc
5d5bea5a7e5f4875de6e815b1a690ead7c8e5a54d5b9ee9fb0d507acdfda61b5
5e3702971c5acbc91d116c9648f26f648e759a361437eea58f85576ffcc4971d
603c3b9a3a9fae74667fa467a8deb8340c60e4783d3ec2cd1101100b4b095180
621b350ef75c300c4e460eeee7e90ed0a4b0f99a063c1b400e6d7c7139892405
628f3a4a0af63058624f62fbe9190756f3e8fe40528d68fc8ebf1888f1b8a615
6325dd46644b1d765ceb12b44b359d3e3ff18b4c09a1d6e00f79917a0dd89e79
647bb3b2918e96aac48a6aac63aecbd3fee8395f547801aade0a476f75e05148
66520bf33a7c5df89455b329a6de0f82bed95eb715fe7bfa23196ac051027663
672ac1254adaafb43351fe7c87df0ce6cd489995439dbdde61b57b6d8693f33e
6884072582219113b8bbe3f1ad73c0ea7cfeec3e3efab8f5deffe545bd0e58b8
69bb171168f31476937f6b99495c24497197f5ae637bd09e744644362e52b289
6b510294d795257c6f51be92a6174f6cb5e3385b3cd503f2bb8815fe9612dc8c
6c06786ff56a7dfcc99822f3f9a2e2cb6fc3a798773ad99f0cff04fb91f26c4e
6edf783cdad3f3f310c525cce600c95ba5d9d2b74ea70ac7cf63338947d84cd3
6f42ca978a7ca29733994878fa8f52784b0b75180e1adba3cc86d4933f122d6d
70234e377b7063bb6ed55bd553cb4c4a94a94913ee488bd6dd093bd68178fdeb
7076f25402362dc38f99184d95ca2f02b218d828e1633cbfe85e7a2e52cc6d50
710a051536e5c391e07bdf677f384825df1c0ac3d32d5d1edf595d12f4aa37af
710c5dbf62fba6dde60496216ec27dfa213c4181ef91ba61a7773fbf1fc2a4d5
73897f55e8a929ac52a455d77ca9aa82fdc57c69c38519246833a916a6d27587
7429e147081b2f966765cabc9d2e712ba87f9d9c608a6fb408920baccb12221c
742d766e11d30d91fb07bf76a377246349213770e96169c3485fc10f1cffdb4c
753cfd5a15f3bc330d84dac00e7f5e1e750862d7084e382cd42b0d2cd8d9a4bf
77e049ab38737d78f5ec8729074a3810f3034b35fe3cfc446020a5c60c046f13
781ed1efe7bb5227d58b55f8f16540b8e8b7770678b25129d04a1e73698e0e5b
7a39c2c856dff82d5cfe4fae9d49da1862d1c9b9e5a54118c45e5048440282fd
8049a9fbbdf0e167121458509d070b71f5c503bdb8f134fa36c085543b015533
84691453fd3cc690c21398e74b86e1ce208fa30d50669bd42fa9d561e4931653
84839870c5e3591824ee2ff57b869e66f6c35a49b223a301f0b9238039c9d527
84d895893f1f6a817b2f0d26c5bd999ee3ebc411987ef65125d315d48a4ac568
851ae1c524ab183386714bd5ecad6199f589df8626cb5b6ae4291bdcfa8e4bf6
88f281c777fe796609feaf10f3094bcc7c341ea741284285bd84814ed176fc06
891e01a95973334c3701d79cabd2980abfac01814c753da85cedff9c90edbdeb
8a40a2dc57d62328e47cd6cbc782ffd486fcfdb302ec9d96f31fff2a6feb261c
8ae25d928a6fb2e3f056616c925d5f344a228e1503be0334c9432cc09515be32
8b2a1ac5645f513476ea40796913e91fd0df252a2210631798c379652138c621
8b83f5357126871108f5bedf46ba7cb8dd6fb7b0df1707cea211b47309050f8f
8bef117d47b9e4de9c9d4eebb848d9651b5d4d9bf81f64999cb3d00db55dcfe1
8f47657b62eff2ea6314535cf454cb02a9e82be91e1ed5b59ca3d440844a01d3
8ffc09b55f67a73d37500aeb0502d81892d3a700aa3ad871f757672765a36562
91d53763e99f4ea3c074124c744eed6a21a022d7a5c90130c8a6a47ea7fd6f4f
9218abf09def08c41158dc26eec2cf3228ef5d26fdca6d507e7c38334df0561b
92386708e9a157ed7294fa5c5ae6719609fa93c3b72b737c0a53632fe9dd00f0
935bf717c79ad716f94f5d829afabd1ee82d4d0af361caddd814f262c90ae861
9458c2ec71214e839e61e0ddad311a811c9471f64e70bbd47249fc97086963dd
946c7458395ef426b621b746b2be2359c435a944d34b539a0215f6c50afe32a1
960f984285701c6d8dba5dc71c35c55c0397ff276b06423146dde88741ddf1af
977852e9f6fdbdb59668feb827e8bf1265bec647129f36a8840a82a55373be75
97ac3bc6e6d00120629b70d51bbb88ba3796fb01daccf88ef790dfa2a81d7bf8
983347fd10628cb803d0687a9833b5d45d2ad36987a6cbc4b7c19bd72eaa62a9
9894fa42f733a727d6b23f9599350b47723f4c5eb3241af3883675365ac886d8
9a5e0d089f99d6ad5da5fc520920285c32a80e6d86caccffb6e1355fd36e13a1
9b0c849bf2777930b9b7a7c0b0c63022068b3a9953f48c5cabc0ae6bb9eadd33
9b7063a7463703b398c1a9a1a66cfbc500761fdcf7f228d0df811c067df99c74
9c54bc4a8c3edefa6dd38d57cc5a02c95475920eb5a2a37be886ed4aea6d65c7
9c963af4d06e0a90092f3954f2bda362abfca201fabda2a783cf33575682db32
9f1c4c6887ed1075f37be6d3863b7647e705263d2f47a8f434bd2610e26d3aa2
9f78759ec63e95807602b43746ed1ec1421ae4f5d5dfe639331f4ea1a72cd616
9fc6470d11461310deddcd38fa762271b226ac6f1e8dbbe9ed027cf3cfc21988
a424d11786ccffa2ba6ae22b7d7c361bdffd69dbdecd4822d6424c864cdf8610
a49974fe074040334cac1a7fb0e922aca407b817e86fe7917576ed710620361a
ac593e5d47065e10778417af861b4f55399a9053d342de3048230afa1b14b762
acd43ee06ea2daf5b2bf7d4b4fb2d170910936b0266119109736c9a58204f9dd
ad10c8b458f3e8151066530b9c3bd303b05ce2eb68dc0f168b7b73337922b78d
ad1a967091b370d85d8ad36c6f17d3bf2784de50578bb0bc7bc14a1bb86ecf04
ae50ad81a2d4006e372c0bd3220f24c377345455d0e980c3f0d94f0e5faf2561
b0685aa701080240ce4bfe9748fe3e5b4df9d81ea30bde3c4b7f4b0c4118a9c5
b298e5fbd3decee46bb0e5f30ad0b756d2fb08d1b42e7fa12c14af37a33e81a6
b368e7f6b8b9808a6155ee074fee36af0e7f42d00f94d41f1927d481c5838b89
b6754acc76eb3e8649381c04825b48738befebe2c079ba3244a37680fe5455dd
b711dedc3105bc27569cf8b9cea8cb6023c0f4f29706f54a514a756cf17e2f51
b73a22d39300c5eb7bd83afd2285310d9bf06718c23b3a6fbf12f5295a07c732
b8746e3fc5eb4f3db7a73acbcb68c250d73d998ac6a12933365aff9bcb53028d
b8a15e94b08a4a7c84cf68b726d049b3a4882eb7a217a6ab11f356a5375b858a
ba22fa51d1d7546ede8aa4991670a80d8b4effdd6bf019b236a2151bb4b28e2b
bb50eaca585afd7e54dae7758ba0c02e6f6581734230c3a99b42079b2c586e88
bbac731b5463ed2f5c44b4b39ac134818f3ea0a68101ef1b54be273fc73ab2da
bc117e784c0b39cff32886c0343e0356a049837dee5d796f880d4d3df348c2eb
bcfa7011569dae4c8b3090350863a22794d136eae549edbf71dc2091fcfe7485
bd3dae5fb91f88a4f0978222dfd58f59a124257cb081486387cbae9df11fb879
bdf28d7d66deda8eaef657c3f7cccde6666f14c3a555644ee2c2a62e510f3d50
be5dadd1b7a5ce99f01ea0b987b0c3c369474348b75f1c0a7e97d89f163df186
bf8eef8435a6cc49fde1fcfb0d828f1c8cf53267bb9882d8f901cf2f02778924
bfb274e451de637db62da8b66270881a6bf396b70147cfa03dab080e7f7b566d
c159965f2b9649e5dc6e70d007a2f0f6f03c9da3b1e8da6c7583e87f9f297f9c
c1f776ff81279e3e6e7d59bf94777188e33f3f23002fac12208e15ce376b3b71
c21a2dd112b6352e9c95842c16033824918c73fa061b6d2f5bda5b7fa84fab00
c2b7594320713dac8a72819aaf8103f871de4be84b97bd59cb2fa0ccf514a461
c61dea626a2d69ac50472de3d4fcd7da169e8ba22fc5c767ad3f3a9230c7363b
c96bb62f33376f24d2e934ef3a02467004dfe707bc30dadb86256e992cf10622
c9a42ade28f5bc4a09a21d0c49341aceb779b3a4b9991deac7c9da150c4bdbe6
cad9f93ea4626b1aa0f51febaa2f28eb052d1a0318d5001e2420fb1d10c36a48
cbb2d6d7bcd1be7cd4210ef9ed4d5a5202fa28d5ffeaf82c3239505c969efe11
cbee80b284e7f63f876a38b1cb383debb95ee532425e7b2be24081ae4442096a
ceebe4612a1cd8058d45ae56fe55b8276375c8f1c46fe082175112b9c973706e
cf28f72a3c4c6d3768b7da8ac7ef3e6ce9d718255b4ed947835b7a337badd30f
d13371ee285a284846d39de896a5cf17d6cfc16366754d25bfaa22a645b195ca
d21e358d22c7f89ddcbc12f66dbc18b1b2ca5371f678d3e33e80457f3f0c626c
d2641888ed6426afd3d3649066cf3614ec2eb63d3ec90ba2e3a54ba2dffa61ca
d35f94de0052cf73ff566a1a1688a93ab508057c5bc20aebbabbfa9ab08f81eb
d631bd153d2afc05645bb7d0941436ceed7f9929077c245d847d8cb5fd3b4f0e
d743a5673d828050ae4af7f4d93e0d6e16206ccfec6d67c5c5be99da3aea4e1e
d7e4cfe8eb31cf7a69bc631791349ab05efd28144d71bf5947e798d0585919d9
d7f8303ddd44fa7f489d3e956ea1cf4268fe4fbdb638218b7c5d50a0c17c18f3
d88ae781b0ca490a07545e1bf6fc4cb049015a33961f0e18b72f9f59844ed3a8
d9235e9be35118455a447acfc3e375d668092dbf8f66a7c6915b00f550fb38b0
d96ef50000366039769de1ac60b613740f795146c2d785cb4672e48fd2724399
da5e455b649b8a5398fdc66ba8298b7c8ac805c30fa1db858ccbe7712283e7b3
da733bd0d390a16e44fbaa11ada383c81f8cb2e79521e7e8b7a35a378eb897cc
da740362e622520be37fcdbdc44cac94873d24fbbcc69578f2834e7d1eb073d7
da9eb3ac6f9f119fe5add79fad9ccdc3027ca3bbe26758da6406cc90dfb25519
db99dbc0bdf211292373850cc428759ba5cc80d6cd60781bcc22583aeeb85daf
dc254d79cc9e415ece8b9c1d3c4f68f47f23aebade58b9a949caa4bff1453ca3
dd2dc8f7d10bb9a3eee66c56c8243ffdf5c84dff1d373c3474ff0ad9e44e6986
df256730fcc47fa6db8774c5df87ad384e9d2b71142f202d445920add46cbc96
e43b06e516177e2c1e426ec800faef2bb0e497d37692808d53155cf717d3db1a
e455682ad4cbdacc7f18d4d0f200abe42c912d24a6c899aedf1b5f30f63323c8
e52884dcb7e6df2f24e561a30654f60e4c61e95fb91b776b2ca1585dfca15577
e86a628274770758748c088d3d2c6d1896a672e919d938e2b412d977b19d1aed
e8957531940698907e1780ee002e8574bd0661ab4e24c80edc3ed47344dc2890
eab87f07f56e92762a269d458ae2b8eb60f4052b1dc5982ec0295a6b6f5dab14
eb703f79de3d42b7e68baeb999ff22fbe82dd9c33d073b16fe774bffcb33a952
ec636c14bfd3b91d93ae1d2aabf293b9c99126597c6a9c19f3875fc7fa64d859
eefbac12f88f6d1b46e7d8ad66fed6ed81d94b5176e23aa6478b659f45f1b33f
f04d0731e651179cfdcd38b011f60875a1ae8d668113a9454d37c2590625ed42
f065c991ac36517d5ce65ace8754b90afd952ddacbb306f018f7eadf3f935872
f27585c0348b460b2ddb8f4c1b2e00ac27adeacbec068dc9990bf94218c4b5a9
f2a43405c7dee14618389ae0b2cd6405370208580620613bf7355db2b701176c
f355c4a1fddcb0dac3ce62d7da6b3d77aeffc15f3c91c991916dcc6a24d8f08e
f3fe5a51a2be8c6dc715028858fcba82ee021be7687e4f95b45086b8ffb1a23f
f4f078d4bf707447283d143a1ba25cf220b55a9dfbf2777b98d425c7d2b85e85
f521c807cafa6aa2734215c0b17a8795e30af0a2c7280953103f4a1d7e828d05
f5678e8223cb43823c80ce7d87018239560a2b124a71fcb2b42b0e3fd96ffddb
f5fa5498b7f042b495ad984c2f06bf1476025f5b03251f2eda467a19fed1f656
f5ffabc0e5d9986f7a0204101039031728bbb83b6d1f4f59718fcb920ad010fb
f8312dc98b362e3dda6045ccf0da463a2d8b7dcfec1e83707e88be8693549a8c
fa15b36089ed2c0835f08ad59d8469f4cf670ba7941ddd0e88284679aeb5052a
fa3fc30b748ba0b93cedc5c467ed8a5daeef7fafb11f81ddf84e6dd815324629
faab8aefb9c0dee39aeeffc0e7bf10ce66ab9809ee818c646859bab09cfd7cc3
fc51faad8db3c20edb316633958a93877f75496308e33f3ac0876bf4577ae313
fd2c43b0d656f726e775918ff8defa011148e6ede6f291bac1facee12f0de838
ff18afab3be0d49341bccf328d74c29dc6d88f03bd454d4a099614a9d4287362
""".split())
# Where one of those tokens is public text and may stay: an opening or a chess word that happens to be someone's name,
# a public figure, and the opponents in the games the owner chose to publish (site/data/gtm/). Path pattern -> hashes.
NAME_ALLOW = {
    # the opponents in the Guess-the-move games the owner chose to publish (game 1 on 5 Nov 2026, game 10 on 6 Nov 2026)
    r'(^|/)data/gtm/': [
        'c159965f2b9649e5dc6e70d007a2f0f6f03c9da3b1e8da6c7583e87f9f297f9c',
        '2df7411c9ef06577838ed640e9dfd52c0130e53e3ee7f45cfae631a13fde5a18',
        '04ad298c5ebe1e6c80efb3e6acfa5979d842acb4d143e920df925ab267ae99be',
        'df256730fcc47fa6db8774c5df87ad384e9d2b71142f202d445920add46cbc96',
    ],
    # openings named after players, and an ordinary chess word
    r'(^|/)data/(openings|tactics)\.json$|(^|/)js/tactics\.js$': [
        'b8746e3fc5eb4f3db7a73acbcb68c250d73d998ac6a12933365aff9bcb53028d',
        'a424d11786ccffa2ba6ae22b7d7c361bdffd69dbdecd4822d6424c864cdf8610',
        '23ddda4810068cc44360dffd31b6c5a9ad13fb9e6a69c9354a5d1b07f1b9843f',
        '4d8aaa64f68587b18e27604cd3d3b67aaa66342ef33df2ae755b5524e84cb3d5',
    ],
    # an ordinary chess word in the endgame texts
    r'(^|/)data/endgames\.json$|(^|/)tools/endgame_positions\.json$': [
        '4d8aaa64f68587b18e27604cd3d3b67aaa66342ef33df2ae755b5524e84cb3d5',
    ],
    # a public YouTube channel among the starter videos
    r'(^|/)js/watch\.js$': [
        'bd3dae5fb91f88a4f0978222dfd58f59a124257cb081486387cbae9df11fb879',
    ],
}
# Opening books and puzzle sets keyed by position ids: random base-36 strings, no prose and no names. Their ids are not
# name-checked (a 3-letter id would sooner or later equal a nickname); the two-word denylist above still applies.
NAME_SKIP = [r'(^|/)data/(masters|demo-book)\.json$', r'(^|/)data/club/']

TEXT_EXT = {'.js','.css','.html','.md','.json','.py','.yml','.yaml','.txt','.tsv','.svg','.sh','.csv','.xml','.webmanifest',''}
# binary files that may be published (images, fonts, the Stockfish WebAssembly): their printable text runs are scanned
BINARY_EXT = {'.wasm','.jpg','.jpeg','.png','.webp','.gif','.ico','.woff','.woff2'}
SKIP = {'.git','node_modules'}
SKIP_REPO_ONLY = {'__pycache__'}   # local Python caches (never committed); the --build scan skips nothing
TOKEN = re.compile(r"[a-z0-9][a-z0-9_@.\-]*")
h = lambda s: hashlib.sha256(s.encode()).hexdigest()

def name_allowed(rel):
    """hashes of name tokens that may appear in this file; None = the file is not name-checked"""
    if any(re.search(p, rel) for p in NAME_SKIP):
        return None
    ok = set()
    for pat, hs in NAME_ALLOW.items():
        if re.search(pat, rel):
            ok |= set(hs)
    return ok

def scan_text(text, rel, names=True):
    hits = []
    allow = name_allowed(rel) if names else None   # binary files' text runs are random letters: the two-word list only
    for ln, line in enumerate(text.lower().splitlines(), 1):
        toks = TOKEN.findall(line)
        cand = list(toks)
        cand += [t.rstrip('.-') for t in toks]                 # "name." at line ends
        cand += [t.split('.')[0] for t in toks if '.' in t]    # filenames without extension
        cand += [f'{a} {b}' for a, b in zip(toks, toks[1:])]   # two-word names
        for c in cand:
            if h(c) in HASHES:
                hits.append((rel, ln, c[0] + '*' * (len(c) - 1)))
        if allow is None:
            continue
        names = set()
        for t in toks:
            names.update((t, t.rstrip('.-'), t.rstrip('0123456789'), t.rstrip('0123456789').rstrip('._-')))
            names.update(x for x in re.split(r'[._@\-]+', t) if x)
            names.update(x.rstrip('0123456789') for x in re.split(r'[._@\-]+', t) if x)
        for c in names:
            if len(c) >= 3 and h(c) in NAME_HASHES and h(c) not in allow:
                hits.append((rel, ln, 'a private name: ' + c[0] + '*' * (len(c) - 1) + ' [' + h(c)[:12] + ']'))
    return hits

def json_strings(o):
    """every string (keys too) in a parsed JSON value, so \\u-escaped text is scanned decoded"""
    if isinstance(o, str):
        yield o
    elif isinstance(o, dict):
        for k, v in o.items():
            yield k
            yield from json_strings(v)
    elif isinstance(o, list):
        for v in o:
            yield from json_strings(v)

def check_file(path, rel, ext):
    """-> (hits, problem). problem = why the file couldn't be checked (the guard then fails)."""
    try:
        raw = open(path, 'rb').read()
    except OSError as e:
        return [], f'unreadable ({e.__class__.__name__})'
    if ext in BINARY_EXT:
        runs = b'\n'.join(re.findall(rb'[\x20-\x7e]{4,}', raw)).decode('ascii')
        return scan_text(runs, rel, names=False), None
    try:
        text = raw.decode('utf-8')
    except UnicodeDecodeError:
        return [], 'not valid UTF-8 text (unknown binary?)'
    hits = scan_text(text, rel)
    if ext == '.json' and '\\u' in text:
        try:
            decoded = '\n'.join(json_strings(json.loads(text)))
        except ValueError:
            return hits, 'JSON that does not parse'
        hits += [(r, 0, m + ' (decoded JSON)') for r, _, m in scan_text(decoded, rel)]
    return hits, None

def main(root='.', build=False):
    if not os.path.isdir(root):
        print(f'PRIVACY GUARD FAILED — {root} is not a folder'); return 1
    if build and not os.path.isfile(os.path.join(root, 'index.html')):
        print(f'PRIVACY GUARD FAILED — {root} has no index.html; is this the exported build?'); return 1
    if len(HASHES) < 40 or len(NAME_HASHES) < 100:
        print('PRIVACY GUARD FAILED — the denylist looks truncated'); return 1
    bad, scanned = [], 0
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP and (build or d not in SKIP_REPO_ONLY)]
        for name in filenames:
            rel = os.path.relpath(os.path.join(dirpath, name), root).replace(os.sep, '/')
            for pat in BANNED_PATHS:
                if re.search(pat, rel):
                    bad.append((rel, 0, f'banned path ({pat})'))
            if name.lower().endswith('.pgn'):
                bad.append((rel, 0, 'a .pgn file has no place in this repo'))
            ext = os.path.splitext(name)[1].lower()
            if name.startswith('.') and '.' not in name[1:]:
                ext = ''                                         # .gitignore, .nojekyll: text
            if ext not in TEXT_EXT and ext not in BINARY_EXT:
                bad.append((rel, 0, f'unknown file type {ext!r}: not scanned, so not allowed (add it to TEXT_EXT/BINARY_EXT on purpose)'))
                continue
            hits, problem = check_file(os.path.join(dirpath, name), rel, ext)
            bad += hits
            if problem:
                bad.append((rel, 0, problem))
            scanned += 1
    if scanned == 0:
        print(f'PRIVACY GUARD FAILED — no files scanned in {root}'); return 1
    if bad:
        print('PRIVACY GUARD FAILED — private-kit content must not enter this repo:')
        for rel, ln, what in bad:
            print(f'  {rel}:{ln}  {what}')
        return 1
    print(f'Privacy guard: clean ({scanned} files{", exported build" if build else ""}).')
    return 0

if __name__ == '__main__':
    args = sys.argv[1:]
    build = '--build' in args
    args = [a for a in args if a != '--build']
    try:
        sys.exit(main(args[0] if args else ('site' if build else '.'), build))
    except Exception as e:                                       # fail closed: a crash is a failure, never a pass
        print(f'PRIVACY GUARD FAILED — error while scanning: {e!r}')
        sys.exit(1)
