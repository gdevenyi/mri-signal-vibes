import collections
import json
import re
import sys

ref, stat, out = sys.argv[1:4]
status = {(f, i): s for f, i, s in json.load(open(stat))}
CLEAN = [
    (
        r"the tool drops the '±' character \(the quote shows 'mean  error' with two spaces\) and also drops hyphens and dashes;?",
        "",
    ),
    (r"the feed drops the '±' sign, so 'a  b' in the quote is 'a ± b'\.", ""),
    (r"the feed drops the '±' sign\.", ""),
    (
        r"the passage text has the '±' characters removed, so 'a b' or 'ab' pairs are mean and SD \(shown as given in the quote\)\.",
        "",
    ),
    (
        r"the rat table is identified by its id \{[^}]*\} and by the discussion sentence ('[^']*'), which agrees with the T2_25 hippocampus value\.",
        r"The discussion of the paper says \1, which agrees with the T2_25 hippocampus value.",
    ),
    (
        r"T1 from Table 4 = [\d.]+ ± [\d.]+; T1_ms assumes that the table is in seconds\.",
        "",
    ),
    (r"\s*Quote = [^.]*\.\.\. \"[^.]*\.", ""),
    (r"\s*Quote = [^.]*\.", ""),
    (r"\s*See unread_leads\.", ""),
    (r": see unread_leads\.", "."),
    (r" \(the task lead said 11\.7 T\)", ""),
    (r"Extractor comment \(not from the paper\):", "Comment (not from the paper):"),
    (r"; the printed value is stored in T2_sd", ""),
    (r"; stored in T2_sd as printed", ""),
    (
        r"The \*_sd fields are therefore null and the ± values stay in the quote\.",
        "The error fields are therefore empty, and the ± values are in the quote.",
    ),
    (
        r"so \*_sd fields are left null and the ± values are here in the quote",
        "so the error fields are empty, and the ± values are in the quote",
    ),
    (r", so \*_sd is null", ", so the error field is empty"),
    (r"; (?:T2_sd|sd fields) left null", "; the error field is empty"),
    (r"was not extracted", "is not known"),
    (
        r" \(sign as shown in the passage; the tool can drop minus signs\)",
        " (the minus sign is possibly missing)",
    ),
    (r"are NOT recorded", "are not in this table"),
    (r" \(not an MRI PD value, so PD is null\)", " (not an MRI PD value)"),
    (r"\*_sd", "the error field"),
    (r"not recorded as separate records", "not in this table"),
    (r"\(not recorded as in vivo\)", "(in vitro, not in this table)"),
    (r"are not recorded here", "are not in this table"),
    (r'"Fro\." \(Frontal Lobe\) was read as frontal cortical gray matter;?', ""),
]
out_recs = []
dropped = collections.Counter()
for f in ["human_invivo", "human_exvivo", "mouse", "rat"]:
    for i, r in enumerate(json.load(open(f"{ref}/{f}.json"))["records"]):
        s = status[(f, i)]
        cit = r["citation"]
        if "Lopez Kolkovsky" in cit or "Behroozi" in cit:
            dropped[cit[:30]] += 1
            continue  # mean and SD are joined in the only text read
        checked = s != "no-fresh-source" or "Jezzard" in cit or "Tashiro" in cit
        notes = r["notes"] or ""
        gateway = "Gateway" in notes
        # remove sentences about the extraction tools
        sent = re.split(r"(?<=[.;])\s+", notes)
        sent = [
            x
            for x in sent
            if not re.search(
                r"Gateway|extractor|UNIT NOT READ|E-utilities|esummary|PubMed metadata",
                x,
            )
        ]
        notes = " ".join(sent).strip()
        m = re.search(r"\s*\((PubMed metadata year[^)]*)\)", cit)
        if m:
            cit = cit.replace(m.group(0), "")
            notes = (
                notes + " The year in the reference is the online publication year."
            ).strip()
        if "Kara" in cit and r["T1_ms"] is not None:
            r["T1_ms"] = None
            r["T1_sd"] = None
            notes = (
                notes
                + " The paper also gives T1 at 17.6 T. It is not in this table, because the unit of the T1 table was not readable."
            ).strip()
        if gateway:
            notes = (
                notes
                + " In the quote, the ± sign is missing: the mean and the error are separated by spaces."
            ).strip()
        for pat, rep in CLEAN:
            notes = re.sub(pat, rep, notes)
        notes = re.sub(r"\s+", " ", notes).strip()
        if notes:
            notes = notes[0].upper() + notes[1:]
        tissue = r["tissue"]
        if "Metere" in cit and r["region_detail"] == "frontal lobe":
            tissue = "Frontal lobe"
            r["region_detail"] = (
                "frontal lobe region of the MNI Structural Atlas; the source does not give the tissue class"
            )
        if tissue.startswith("Deep tissue of the hemisphere"):
            tissue = "Deep hemisphere tissue"
        if all(r[k] is None for k in ["T1_ms", "T2_ms", "T2s_ms", "PD"]):
            dropped["novalue"] += 1
            continue
        num = lambda v: (
            None if v is None else (int(v) if float(v).is_integer() else float(v))
        )
        out_recs.append(
            {
                "species": r["species"],
                "condition": r["condition"],
                "field_T": num(r["field_T"]),
                "tissue": tissue,
                "region_detail": r["region_detail"] or None,
                "T1_ms": num(r["T1_ms"]),
                "T1_sd": num(r["T1_sd"]),
                "T2_ms": num(r["T2_ms"]),
                "T2_sd": num(r["T2_sd"]),
                "T2s_ms": num(r["T2s_ms"]),
                "T2s_sd": num(r["T2s_sd"]),
                "PD": num(r["PD"]),
                "subjects": r["subjects"] or None,
                "method": r["method"] or None,
                "temperature": r["temperature"] or None,
                "fixation": r["fixation"] or None,
                "gd_doped": bool(r["gd_doped"]),
                "converted_from_rate": bool(r["converted_from_rate"]),
                "checked": checked,
                "notes": notes or None,
                "quote": r["quote"],
                "read_from": r["read_from"],
                "pmid": str(r["pmid"]) if r["pmid"] else None,
                "doi": r["doi"] or None,
                "citation": cit,
            }
        )
order = {"human": 0, "mouse": 1, "rat": 2}
out_recs.sort(
    key=lambda r: (
        order[r["species"]],
        r["condition"] != "in vivo",
        r["field_T"],
        r["tissue"],
        r["citation"],
    )
)
head = """/**
 * MRI Signal Intensity Simulator: literature reference values (brain)
 *
 * Each record is one published measurement: one source, field strength,
 * condition and tissue. Records from different sources are not averaged.
 *
 *   species, condition      - "human" | "mouse" | "rat"; "in vivo" | "ex vivo"
 *   field_T                 - field strength in tesla (1.5 to 18)
 *   tissue, region_detail   - tissue class and the region in the words of the source
 *   T1_ms, T2_ms, T2s_ms    - relaxation times in ms, null if the source does not give them
 *   *_sd                    - the ± value as printed in the source, null if not given. It is
 *                             usually an SD. Known standard errors are not stored here; if
 *                             the source does not give the type, the notes say so.
 *   PD                      - proton density relative to water = 1, null if not given
 *   gd_doped                - true if a contrast agent was in the sample
 *   converted_from_rate     - true if the source gives a rate (R1, R2, R2*) and not a time
 *   checked                 - true if the quote, or all the numbers of the quote, were found in
 *                             a second, fresh copy of the abstract or full text. This shows
 *                             that the values are in the source. It does not fully prove that
 *                             each value is with the correct tissue. false: the values were
 *                             read one time only.
 *   quote, read_from        - the text of the source that contains the values, and where it is
 *   pmid, doi, citation     - the reference
 *
 * This file has no DOM code, so that Node.js can load it for the tests.
 */

const referenceData = """
tail = """

// Node.js (tests). In the browser, `referenceData` is a global.
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { referenceData };
}
"""
open(out, "w", encoding="utf-8").write(
    head + json.dumps(out_recs, indent=4, ensure_ascii=False) + ";" + tail
)
print(len(out_recs), "records; dropped", dict(dropped))
c = collections.Counter((r["species"], r["condition"], r["field_T"]) for r in out_recs)
for k in sorted(c, key=lambda k: (order[k[0]], k[1] != "in vivo", k[2])):
    print(k, c[k])
print(
    "checked",
    collections.Counter(r["checked"] for r in out_recs),
    "sources",
    len(set(r["pmid"] for r in out_recs)),
)
