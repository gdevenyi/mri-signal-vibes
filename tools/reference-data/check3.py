import collections
import html
import json
import os
import re
import sys
import unicodedata

ref, dl, out = sys.argv[1:4]
SUP = str.maketrans("⁰¹²³⁴⁵⁶⁷⁸⁹⁻", "0123456789-")


def base(t):
    t = html.unescape(html.unescape(t))
    t = t.translate(SUP)
    t = unicodedata.normalize("NFKC", t)
    return (
        t.replace("−", "-")
        .replace("–", "-")
        .replace("—", "-")
        .replace(" ", " ")
        .replace(" ", " ")
        .replace("·", ".")
        .replace("×", "x")
    )


def norm(t):
    return re.sub(r"\s+", "", base(t)).lower()


def raw(path):
    if not os.path.exists(path):
        return None
    return re.sub(
        r"<[^>]+>", " ", open(path, encoding="utf-8", errors="replace").read()
    )


NUM = r"(?<![\d.])\d+(?:\.\d+)?(?![\d.])"
cache = {}
res = []
summ = collections.Counter()
detail = collections.Counter()
for f in ["tissues2", "adc", "relaxivity"]:
    for i, r in enumerate(json.load(open(f"{ref}/{f}.json"))["records"]):
        p = str(r["pmid"])
        if p not in cache:
            a, ft = raw(f"{dl}/{p}.abstract.xml"), raw(f"{dl}/{p}.fulltext.xml")
            sp = raw(f"{dl}/{p}.supp.txt")
            if sp:
                ft = (ft or "") + " " + sp
            cache[p] = (a, ft)
        a, ft = cache[p]
        src = " ".join(x for x in (a, ft) if x)
        nsrc = norm(src)
        segs = [
            s
            for s in re.split(r"\s*(?:\.\.\.|…|\[\.\.\.\]|\|)\s*", r["quote"])
            if len(norm(s)) >= 4
        ]
        fr = sum(norm(s) in nsrc for s in segs) / max(1, len(segs))
        toks = set(re.findall(NUM, base(r["quote"]).replace(",", "")))
        stoks = set(re.findall(NUM, base(src).replace(",", "")))
        sig = [t for t in toks if len(t) >= 3]
        hit = sum(t in stoks for t in sig) / max(1, len(sig))
        if fr == 1:
            st = "verbatim"
        elif ft and sig and hit >= 0.9 and fr >= 0.5:
            st = "numbers"
        elif not ft and a is not None and r["read_from"] != "abstract":
            st = "no-fresh-fulltext"
        else:
            st = "CHECK(fr=%.2f,hit=%.2f,ft=%s)" % (fr, hit, bool(ft))
        res.append([f, i, st])
        summ[(f, st.split("(")[0])] += 1
        if st not in ("verbatim",):
            detail[(f, r["citation"][:32], r["read_from"], st)] += 1
for k, v in sorted(summ.items()):
    print(k, v)
for k, v in sorted(detail.items()):
    print(v, k)
json.dump(res, open(out, "w"))
