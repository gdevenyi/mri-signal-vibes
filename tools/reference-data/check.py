import collections
import html
import json
import os
import re
import sys
import unicodedata

ref, dl, out = sys.argv[1:4]


def norm(t):
    t = html.unescape(html.unescape(t))
    t = unicodedata.normalize("NFKC", t)
    t = (
        t.replace("−", "-")
        .replace("–", "-")
        .replace("—", "-")
        .replace(" ", "")
        .replace("·", ".")
    )
    return re.sub(r"\s+", "", t).lower()


def text(path):
    if not os.path.exists(path):
        return None
    x = open(path, encoding="utf-8", errors="replace").read()
    return norm(re.sub(r"<[^>]+>", " ", x))


def nums(q):
    return re.findall(r"\d+(?:\.\d+)?", q)


cache = {}
res = []
for f in ["human_invivo", "human_exvivo", "mouse", "rat"]:
    for i, r in enumerate(json.load(open(f"{ref}/{f}.json"))["records"]):
        p = str(r["pmid"])
        if p not in cache:
            cache[p] = (text(f"{dl}/{p}.abstract.xml"), text(f"{dl}/{p}.fulltext.xml"))
        ab, ft = cache[p]
        segs = [
            s
            for s in re.split(r"\s*(?:\.\.\.|…|\[\.\.\.\])\s*", r["quote"])
            if len(norm(s)) >= 6
        ]

        def frac(src):
            if not src or not segs:
                return 0
            return sum(norm(s) in src for s in segs) / len(segs)

        fa, ff = frac(ab), frac(ft)
        status = (
            "verbatim-abstract" if fa == 1 else "verbatim-fulltext" if ff == 1 else None
        )
        if not status:
            # weaker: every value of the record appears in the source next to... (numbers of the record present in source)
            src = (ft or "") + (ab or "")
            vals = [r[k] for k in ["T1_ms", "T2_ms", "T2s_ms"] if r[k] is not None]
            status = "partial(%.2f/%.2f,ft=%s)" % (fa, ff, bool(ft))
        res.append((f, i, status))
        r["_verify"] = status
c = collections.Counter(
    (f, s if s.startswith("verb") else "UNVERIFIED") for f, i, s in res
)
for k, v in sorted(c.items()):
    print(k, v)
json.dump(res, open(out, "w"))
un = collections.Counter()
for f in ["human_invivo", "human_exvivo", "mouse", "rat"]:
    recs = json.load(open(f"{ref}/{f}.json"))["records"]
    for ff, i, s in res:
        if ff == f and not s.startswith("verb"):
            r = recs[i]
            un[(f, r["citation"][:45], r["read_from"], s)] += 1
for k, v in sorted(un.items()):
    print(v, k)
