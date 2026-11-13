"""Check of the records that were read from the supplied PDF files.

(1) Each part of the quote (parts are joined with " || ") is in the plain text of the PDF.
(2) Each recorded value, as printed, is in the quote (or, for a rate, a rate in the quote
    gives the recorded time).
(3) The citation agrees with the PubMed record.
Usage: check5.py <data dir> <dir of pdftotext files> <dir for PubMed XML> <status file>
"""

import collections
import json
import os
import re
import sys
import time
import unicodedata
import urllib.request
import xml.etree.ElementTree as ET

data, txt, dl, out = sys.argv[1:5]
NAMES = ["relax", "human", "body", "lesion", "exvivo", "rodent"]
NUM = r"(?<![\d.])\d+(?:\.\d+)?"


def base(t):
    t = unicodedata.normalize("NFKC", t)
    return t.replace("−", "-").replace("–", "-").replace(",", "")


def squash(t):
    return re.sub(r"\s+", "", t)


def toks(t):
    return {x.rstrip(".") for x in re.findall(NUM, base(t))}


def forms(v):
    f = set()
    for x in (v, v / 1000.0, v * 100.0):
        for fmt in ("%g", "%.1f", "%.2f", "%.3f", "%.4f"):
            s = fmt % x
            if abs(float(s) - x) < 1e-9:
                f.add(s)
                f.add(s.rstrip("0").rstrip(".") if "." in s else s)
    return f


KEYS = {
    "records_tissue": ["T1_ms", "T2_ms", "T2s_ms", "PD"],
    "records_adc": ["ADC_value"],
    "records_relax": ["r1", "r2", "r2s"],
}
cache = {}
status = {}
summ = collections.Counter()
fails = []
pmids = {}
for n in NAMES:
    d = json.load(open(f"{data}/pdf_{n}.json", encoding="utf-8"))
    for kind, keys in KEYS.items():
        for i, r in enumerate(d[kind]):
            name = r["pdf"].removesuffix(".pdf")
            if name not in cache:
                with open(
                    f"{txt}/{name}.txt", encoding="utf-8", errors="replace"
                ) as fh:
                    cache[name] = squash(fh.read())
            parts = [p for p in r["quote"].split(" || ") if squash(p)]
            in_text = all(squash(p) in cache[name] for p in parts)
            q = toks(r["quote"])
            why = []
            for key in keys:
                v = r.get(key)
                if v is None:
                    continue
                ok = bool(forms(v) & q)
                if (
                    not ok
                    and kind == "records_tissue"
                    and r.get("converted_from_rate")
                    and key != "PD"
                ):
                    rates = [float(x) for x in q if float(x) > 0]
                    ok = any(
                        abs(1000.0 / x - v) / v < 0.006 or abs(1.0 / x - v) / v < 0.006
                        for x in rates
                    )
                if not ok:
                    why.append(f"{key}={v}")
            good = in_text and not why
            status[f"{n}:{kind}:{i}"] = good
            summ[(n, kind, good)] += 1
            if not good:
                fails.append(
                    (
                        n,
                        kind,
                        i,
                        r["citation"][:26],
                        (r.get("tissue") or r.get("agent"))[:28],
                        "quote not in text" if not in_text else "",
                        why,
                        r["quote"][:90],
                    )
                )
            pmids.setdefault(str(r["pmid"]), r)
for k, v in sorted(summ.items()):
    print(k, v)
for x in fails:
    print("FAIL", x)
json.dump(status, open(out, "w"), indent=0)

print("--- citations")
os.makedirs(dl, exist_ok=True)
need = [p for p in pmids if not os.path.exists(f"{dl}/{p}.xml")]
for p in need:
    req = urllib.request.Request(
        f"https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id={p}&retmode=xml",
        headers={"User-Agent": "reference-check/1.0"},
    )
    body = None
    for attempt in range(5):
        try:
            body = urllib.request.urlopen(req, timeout=60).read()
            break
        except OSError as err:
            print("retry", p, err)
            time.sleep(3 + 3 * attempt)
    if body is None:
        raise SystemExit(f"no PubMed record for {p}")
    with open(f"{dl}/{p}.xml", "wb") as fh:
        fh.write(body)
    time.sleep(0.4)


def norm(t):
    return unicodedata.normalize("NFKD", t).encode("ascii", "ignore").decode().lower()


for p, r in sorted(pmids.items()):
    root = ET.parse(f"{dl}/{p}.xml").getroot()
    art = root.find(".//Article")
    last = art.findtext(".//AuthorList/Author/LastName") or ""
    ji = art.find(".//Journal/JournalIssue")
    year = ji.findtext("PubDate/Year") or (ji.findtext("PubDate/MedlineDate") or "")[:4]
    vol = ji.findtext("Volume") or ""
    pages = art.findtext(".//Pagination/MedlinePgn") or ""
    doi = ""
    for e in root.findall(".//PubmedData/ArticleIdList/ArticleId"):
        if e.get("IdType") == "doi":
            doi = (e.text or "").lower()
    c = r["citation"]
    prob = []
    if norm(last) not in norm(c):
        prob.append(f"author {last}")
    if year not in c:
        prob.append(f"year {year}")
    if vol and f";{vol}" not in c.replace(" ", ""):
        prob.append(f"vol {vol}")
    if pages and pages.split("-")[0] not in c:
        prob.append(f"pages {pages}")
    if doi and (r["doi"] or "").lower() != doi:
        prob.append(f"doi {doi} vs {r['doi']}")
    want = r["pdf"].replace(".pdf", "").rstrip("_").lower()
    if (
        doi
        and doi.replace("/", "_", 1) not in want
        and want not in doi.replace("/", "_")
    ):
        prob.append(f"pdf name {r['pdf']}")
    if prob:
        print(p, "|", c, "|", "; ".join(prob))
print("sources", len(pmids))
