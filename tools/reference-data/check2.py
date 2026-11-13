import collections
import html
import json
import os
import re
import sys
import unicodedata

ref, dl, stat, out = sys.argv[1:5]


def clean(t):
    t = html.unescape(html.unescape(t))
    t = unicodedata.normalize("NFKC", t)
    return (
        t.replace("−", "-")
        .replace("–", "-")
        .replace(" ", " ")
        .replace("·", ".")
        .replace(",", "")
    )


def text(path):
    if not os.path.exists(path):
        return None
    return clean(
        re.sub(r"<[^>]+>", " ", open(path, encoding="utf-8", errors="replace").read())
    )


status = {(f, i): s for f, i, s in json.load(open(stat))}
cache = {}
summary = collections.Counter()
detail = []
final = {}
for f in ["human_invivo", "human_exvivo", "mouse", "rat"]:
    recs = json.load(open(f"{ref}/{f}.json"))["records"]
    for i, r in enumerate(recs):
        s = status[(f, i)]
        if s.startswith("verb"):
            final[(f, i)] = s
            summary[(f, s)] += 1
            continue
        p = str(r["pmid"])
        if p not in cache:
            cache[p] = text(f"{dl}/{p}.fulltext.xml")
        ft = cache[p]
        if not ft:
            final[(f, i)] = "no-fresh-source"
            summary[(f, "no-fresh-source")] += 1
            continue
        toks = set(re.findall(r"(?<![\d.])\d+(?:\.\d+)?(?![\d.])", clean(r["quote"])))
        ftoks = set(re.findall(r"(?<![\d.])\d+(?:\.\d+)?(?![\d.])", ft))
        sig = [t for t in toks if len(t) >= 3]
        hit = sum(t in ftoks for t in sig) / max(1, len(sig))
        # value tokens: the tokens in the quote that carry the record values
        need = []
        for k in ["T1_ms", "T2_ms", "T2s_ms"]:
            v = r[k]
            if v is None or r["converted_from_rate"]:
                continue
            forms = {
                ("%g" % v),
                ("%g" % (v / 1000)),
                ("%.1f" % v),
                ("%.2f" % v),
                ("%.2f" % (v / 1000)),
                ("%.3f" % (v / 1000)),
            }
            need.append(any(x in ftoks for x in forms))
        ok = hit >= 0.9 and all(need)
        st = "numbers-in-fulltext" if ok else "CHECK(hit=%.2f,need=%s)" % (hit, need)
        final[(f, i)] = st
        summary[(f, st if ok or st == "no-fresh-source" else "CHECK")] += 1
        if not ok:
            detail.append(
                (
                    f,
                    i,
                    r["citation"][:30],
                    r["tissue"],
                    st,
                    sorted(t for t in sig if t not in ftoks)[:8],
                )
            )
for k, v in sorted(summary.items()):
    print(k, v)
for d in detail:
    print(d)
json.dump([[f, i, s] for (f, i), s in final.items()], open(out, "w"))
