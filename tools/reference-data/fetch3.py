import json
import os
import sys
import time
import urllib.parse
import urllib.request

ref, dl = sys.argv[1], sys.argv[2]
pmids = set()
for f in ["tissues2", "adc", "relaxivity"]:
    for r in json.load(open(f"{ref}/{f}.json"))["records"]:
        if r["pmid"]:
            pmids.add(str(r["pmid"]))


def get(url):
    err = None
    for i in range(4):
        try:
            req = urllib.request.Request(
                url, headers={"User-Agent": "reference-check/1.0"}
            )
            return urllib.request.urlopen(req, timeout=60).read()
        except Exception as e:
            err = e
            time.sleep(2 + 3 * i)
    print("FAIL", url, err)
    return None


for p in sorted(pmids):
    a = f"{dl}/{p}.abstract.xml"
    if not os.path.exists(a):
        b = get(
            f"https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id={p}&retmode=xml"
        )
        if b:
            open(a, "wb").write(b)
        time.sleep(0.4)
    m = f"{dl}/{p}.epmc.json"
    if not os.path.exists(m):
        b = get(
            "https://www.ebi.ac.uk/europepmc/webservices/rest/search?query="
            + urllib.parse.quote(f"EXT_ID:{p} AND SRC:MED")
            + "&resultType=lite&format=json"
        )
        if b:
            open(m, "wb").write(b)
    try:
        res = json.load(open(m))["resultList"]["result"]
        pmc = res[0].get("pmcid") if res else None
    except Exception:
        pmc = None
    ft = f"{dl}/{p}.fulltext.xml"
    if pmc and not os.path.exists(ft):
        # NCBI copy of the full text (a different server from the one the extraction used most)
        b = get(
            f"https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pmc&id={pmc[3:]}&retmode=xml"
        )
        if b and len(b) > 20000:
            open(ft, "wb").write(b)
        else:
            b = get(
                f"https://www.ebi.ac.uk/europepmc/webservices/rest/{pmc}/fullTextXML"
            )
            if b:
                open(ft, "wb").write(b)
        time.sleep(0.4)
    print(p, pmc, os.path.exists(ft), os.path.getsize(ft) if os.path.exists(ft) else 0)
