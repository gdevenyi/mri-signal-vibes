import glob
import json
import os
import sys
import time
import urllib.request

dl = sys.argv[1]


def get(url):
    for i in range(4):
        try:
            req = urllib.request.Request(
                url, headers={"User-Agent": "reference-check/1.0"}
            )
            return urllib.request.urlopen(req, timeout=90).read()
        except Exception as e:
            err = e
            time.sleep(3 + 4 * i)
    print("FAIL", url[:90], err)
    return None


n = 0
for m in sorted(glob.glob(f"{dl}/*.epmc.json")):
    p = os.path.basename(m).split(".")[0]
    try:
        res = json.load(open(m))["resultList"]["result"]
        pmc = res[0].get("pmcid") if res else None
    except Exception:
        pmc = None
    ft = f"{dl}/{p}.fulltext.xml"
    if pmc and not os.path.exists(ft):
        b = get(
            f"https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pmc&id={pmc[3:]}&retmode=xml"
        )
        time.sleep(0.5)
        if b and len(b) > 5000 and b.count(b"<p") > 10:
            open(ft, "wb").write(b)
            n += 1
        else:
            print("no body", p, pmc, len(b or b""))
print("added", n)
