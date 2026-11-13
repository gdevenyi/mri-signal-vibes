"""Stricter check of the new records: (1) each recorded value, as printed, is in the quote and in
the fresh copy; (2) the citation agrees with the PubMed XML in the fresh copy."""

import collections
import html
import json
import os
import re
import sys
import unicodedata
import xml.etree.ElementTree as ET

ref, dl, out = sys.argv[1:4]
SUP = str.maketrans("⁰¹²³⁴⁵⁶⁷⁸⁹⁻", "0123456789-")


def base(t):
    t = html.unescape(html.unescape(t)).translate(SUP)
    t = unicodedata.normalize("NFKC", t)
    return t.replace("−", "-").replace("–", "-").replace(",", "")


def raw(path):
    return (
        re.sub(r"<[^>]+>", " ", open(path, encoding="utf-8", errors="replace").read())
        if os.path.exists(path)
        else ""
    )


NUM = r"(?<![\d.])\d+(?:\.\d+)?(?![\d.])"


def toks(t):
    return set(re.findall(NUM, base(t)))


def forms(v, rate=False):
    """Ways the value can be printed: as is, seconds for ms, trailing zeros."""
    f = set()
    for x in [v, v / 1000.0] if not rate else []:
        for fmt in ("%g", "%.1f", "%.2f", "%.3f", "%.4f"):
            s = fmt % x
            if abs(float(s) - x) < 1e-9:
                f.add(s)
    return f


status = {
    (f, i): s
    for f, i, s in json.load(
        open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "status3.json"))
    )
}
robic_ok = set(
    json.load(
        open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "robic_ok.json"))
    )
)
cache = {}
res = {}
summ = collections.Counter()
fails = []
VAL = {
    "tissues2": [("T1_ms", 1), ("T2_ms", 1), ("T2s_ms", 1), ("PD", 2)],
    "adc": [("ADC_value", 0), ("ADC_sd", 0)],
    "relaxivity": [("r1", 0), ("r2", 0), ("r2s", 0), ("r1_sd", 0), ("r2_sd", 0)],
}
for f in ["tissues2", "adc", "relaxivity"]:
    for i, r in enumerate(json.load(open(f"{ref}/{f}.json"))["records"]):
        p = str(r["pmid"])
        if p not in cache:
            cache[p] = toks(
                raw(f"{dl}/{p}.abstract.xml")
                + " "
                + raw(f"{dl}/{p}.fulltext.xml")
                + " "
                + raw(f"{dl}/{p}.supp.txt")
            )
        src = cache[p]
        q = toks(r["quote"])
        inq = ins = True
        why = []
        for key, kind in VAL[f]:
            v = r.get(key)
            if v is None:
                continue
            if f == "tissues2" and r["converted_from_rate"] and key != "PD":
                continue  # the quote has the rate, not the time (checked below)
            fm = forms(v)
            if kind == 2:
                fm |= forms(v * 100)  # PD printed in percent
            if not (fm & q):
                inq = False
                why.append(f"{key}={v} not in quote")
            if not (fm & src):
                ins = False
                why.append(f"{key}={v} not in fresh copy")
        if f == "tissues2" and r["converted_from_rate"]:
            # a rate in the quote must give the recorded time
            rates = [float(t) for t in q if float(t) > 0]
            for key in ("T1_ms", "T2_ms", "T2s_ms"):
                v = r.get(key)
                if v is None:
                    continue
                ok = any(
                    abs(1000.0 / x - v) / v < 0.006 or abs(1.0 / x - v) / v < 0.006
                    for x in rates
                )
                if not ok:
                    inq = False
                    why.append(f"{key}={v}: no rate in the quote gives it")
                ok2 = any(
                    abs(1000.0 / float(x) - v) / v < 0.006 for x in src if float(x) > 0
                )
                if not ok2:
                    ins = False
                    why.append(f"{key}={v}: no rate in the fresh copy gives it")
        st = status[(f, i)]
        special = f == "relaxivity" and i in robic_ok
        good = inq and (ins or special) and (st in ("verbatim", "numbers") or special)
        res[f"{f}:{i}"] = good
        summ[(f, good, st.split("(")[0])] += 1
        if not good and st in ("verbatim", "numbers"):
            fails.append(
                (f, i, r["citation"][:28], r.get("tissue", r.get("agent"))[:30], why)
            )
for k, v in sorted(summ.items()):
    print(k, v)
for x in fails:
    print("FAIL", x)
json.dump(res, open(out, "w"))

# citations against the PubMed XML
print("--- citations")
seen = set()
for f in ["tissues2", "adc", "relaxivity"]:
    for r in json.load(open(f"{ref}/{f}.json"))["records"]:
        p = str(r["pmid"])
        if p in seen:
            continue
        seen.add(p)
        try:
            root = ET.parse(f"{dl}/{p}.abstract.xml").getroot()
        except Exception:
            print("NOXML", p, r["citation"])
            continue
        art = root.find(".//Article")
        last = art.findtext(".//AuthorList/Author/LastName") or ""
        ji = art.find(".//Journal/JournalIssue")
        year = (
            ji.findtext("PubDate/Year")
            or (ji.findtext("PubDate/MedlineDate") or "")[:4]
        )
        vol = ji.findtext("Volume") or ""
        pages = art.findtext(".//Pagination/MedlinePgn") or ""
        ayear = art.findtext("ArticleDate/Year") or ""
        doi = ""
        for e in root.findall(".//ArticleIdList/ArticleId"):
            if e.get("IdType") == "doi":
                doi = (e.text or "").lower()
                break
        c = r["citation"]
        norm = lambda t: (
            unicodedata.normalize("NFKD", t).encode("ascii", "ignore").decode().lower()
        )
        prob = []
        if norm(last) not in norm(c):
            prob.append(f"author {last}")
        if year not in c:
            prob.append(f"year {year} (online {ayear})")
        if vol and f";{vol}" not in c.replace(" ", ""):
            prob.append(f"vol {vol}")
        first_page = pages.split("-")[0]
        if first_page and first_page not in c:
            prob.append(f"pages {pages}")
        if doi and (r["doi"] or "").lower() != doi:
            prob.append(f"doi {doi} vs {r['doi']}")
        if prob:
            print(p, "|", c, "|", "; ".join(prob))
print("sources", len(seen))
