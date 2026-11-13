"""Build reference-data.js: brain records (build.py) + new tissue, ADC and relaxivity records."""

import collections
import json
import os
import re
import subprocess
import sys
import unicodedata

here = os.path.dirname(os.path.abspath(__file__))
ref, out = sys.argv[1:3]
import tempfile

tmp = os.path.join(tempfile.mkdtemp(), "brain_tmp.js")
subprocess.run(
    [
        sys.executable,
        "-I",
        os.path.join(here, "build.py"),
        ref,
        os.path.join(here, "status2.json"),
        tmp,
    ],
    check=True,
    stdout=subprocess.DEVNULL,
)
s = open(tmp, encoding="utf-8").read()
brain = json.loads(
    s[s.index("const referenceData = ") + 22 : s.index(";\n\n// Node.js")]
)

status = {
    (f, i): st for f, i, st in json.load(open(os.path.join(here, "status3.json")))
}
robic_ok = set(json.load(open(os.path.join(here, "robic_ok.json"))))

PROCESS = re.compile(
    r"WebFetch|by eye|\bI\b|checked by machine|PMC\d|supplementaryFiles|small model|SECONDARY|unread_leads|"
    r"which PMC gives|read in (Europe )?PMC|Quote from PMC|it is in the quote and is not|Two later papers|published erratum|the 20\d\d review|\bmy\b|the text read|E-utilities|Europe PMC|PubMed and|open J-STAGE|is recorded\.$|were not recorded|not recorded|are recorded|recorded here|recorded as printed|see the \d+ ms record"
)
REWRITE = [
    (
        r"the error field is the printed rate error changed to a time \(0\.01/R1\^2\); ",
        "",
    ),
    (r"T1_sd is the printed rate error changed to a time \(0\.01/R1\^2\); ", ""),
    (r"thus r\d_sd and r\d_sd are null", "thus the error fields are empty"),
    (r"the the error field fields are null", "the error fields are empty"),
    (r"the error field and the error field are null", "the error fields are empty"),
    (r", recorded in the _sd fields", ", shown as the ± value"),
    (r"is recorded in the error field", "is shown as the ± value"),
    (r" \(the schema has no field for the r2\* error\)", ""),
    (r", out of scope\)", ")"),
    (r"\(reference\), recorded;", "(reference), used here;"),
    (r"Later papers of this batch quote", "Later papers give"),
    (
        r"gd_doped=false is NOT confirmed",
        "it is not confirmed that the sample had no contrast agent",
    ),
    (r"thus b_values is null", "thus no b-value is given"),
    (r"Not recorded:", "Not in this table:"),
    (r", recorded as T2", ", shown here as T2"),
    (r"gd_doped is set false, but", "The record shows no contrast agent, but"),
    (r", so it is put in r1_sd only as the printed error", ""),
    (
        r"the generic name is my mapping of that chelate label, the abstract gives no generic or brand name",
        "the generic name was assigned from that chelate label, because the abstract gives no generic or brand name",
    ),
    (r", so field_T is ([\d.]+)", r", so the field here is \1 T"),
    (r"field_T", "the field"),
    (r"ADC_sd", "the error"),
    (r"\*_sd|T[12]s?_sd", "the error field"),
    (r"converted_from_rate is true", "the times were calculated from the rates"),
    (r"gd_doped is false", "no contrast agent"),
    (r"the error field and the error field are null", "the error fields are empty"),
    (r"the the error field fields are null", "the error fields are empty"),
    (r"is recorded in the error field", "is shown as the ± value"),
    (r"it is in the quote and is not recorded here", "it is in the quote"),
]


def clean_notes(notes, extra=()):
    sent = [
        x for x in re.split(r"(?<=[.;])\s+", notes or "") if x and not PROCESS.search(x)
    ]
    out = []
    for x in sent:
        for pat, rep in REWRITE:
            x = re.sub(pat, rep, x)
        out.append(x)
    sent = out
    text = " ".join(list(sent) + [e for e in extra if e]).strip()
    text = re.sub(r"\s+", " ", text).rstrip(";").strip()
    if text and text[-1] not in ".)'\"":
        text += "."
    return (text[0].upper() + text[1:]) if text else None


def num(v):
    if v is None:
        return None
    v = float(v)
    return int(v) if v.is_integer() else round(v, 4)


def category(tissue):
    l = tissue.lower()
    if "blood" in l:
        return "blood"
    if re.search(r"\bfat\b|marrow|muscle|adipose", l):
        return "body"
    if re.search(r"normal|contralateral|healthy", l):
        return "brain"
    if re.search(
        r"tumou?r|glioma|metasta|o?edema|infarct|ischemi|stroke|sclerosis|meningioma|lymphoma|astrocytoma|medulloblastoma|hyperintens|glioblastoma|lesion",
        l,
    ):
        return "lesion"
    return "brain"


def cap(t):
    return t[0].upper() + t[1:]


# Records that were read from PDF files that the user supplied. They replace all older
# records of the same paper (those were from the abstract or from a citing paper).
PDF_NAMES = ["human", "body", "lesion", "exvivo", "rodent", "relax"]
pdf = {n: json.load(open(f"{ref}/pdf_{n}.json", encoding="utf-8")) for n in PDF_NAMES}
status5 = json.load(open(os.path.join(here, "status5.json")))
pdf_pmids = {
    str(r["pmid"])
    for d in pdf.values()
    for kind in ("records_tissue", "records_adc", "records_relax")
    for r in d[kind]
}
replaced = collections.Counter()

recs = []
for r in brain:
    if r["pmid"] in pdf_pmids:
        replaced[r["citation"][:30]] += 1
        continue
    r = dict(r)
    r["category"] = category(r["tissue"])
    r["ADC"] = None
    r["ADC_sd"] = None
    recs.append(r)


def checked(f, i):
    st = status[(f, i)]
    return st in ("verbatim", "numbers")


# --- relaxation times of other tissues, lesions, CSF ---
for i, r in enumerate(json.load(open(f"{ref}/tissues2.json"))["records"]):
    if str(r["pmid"]) in pdf_pmids:
        replaced[r["citation"][:30]] += 1
        continue
    extra = []
    if str(r["pmid"]) == "40815301":
        extra.append(
            "The values are from supplementary Table S3 of the paper. The paper does not say which reference is PD = 100 %."
        )
    recs.append(
        {
            "species": r["species"],
            "condition": r["condition"],
            "field_T": num(r["field_T"]),
            "category": category(r["tissue"]),
            "tissue": cap(r["tissue"]),
            "region_detail": r["region_detail"] or None,
            "T1_ms": num(r["T1_ms"]),
            "T1_sd": num(r["T1_sd"]),
            "T2_ms": num(r["T2_ms"]),
            "T2_sd": num(r["T2_sd"]),
            "T2s_ms": num(r["T2s_ms"]),
            "T2s_sd": num(r["T2s_sd"]),
            "PD": num(r["PD"]),
            "ADC": None,
            "ADC_sd": None,
            "subjects": r["subjects"] or None,
            "method": r["method"] or None,
            "temperature": r["temperature"] or None,
            "fixation": r["fixation"] or None,
            "gd_doped": bool(r["gd_doped"]),
            "converted_from_rate": bool(r["converted_from_rate"]),
            "checked": checked("tissues2", i),
            "notes": clean_notes(r["notes"], extra),
            "quote": r["quote"],
            "read_from": r["read_from"],
            "pmid": str(r["pmid"]) if r["pmid"] else None,
            "doi": r["doi"] or None,
            "citation": r["citation"],
        }
    )

# --- ADC ---
SUP = str.maketrans("⁰¹²³⁴⁵⁶⁷⁸⁹⁻", "0123456789-")


def adc_factor(unit):
    u = (
        unicodedata.normalize("NFKC", unit.translate(SUP))
        .replace("−", "-")
        .replace(" ", "")
    )
    u = u.replace("μ", "µ").replace("^", "").replace("–", "-").replace("×", "x")
    if u == "µm2/ms":
        return 1.0  # 1 um^2/ms = 1e-3 mm^2/s
    if u in ("µm2/s", "µm2/second"):
        return 0.001  # 1 um^2/s = 1e-6 mm^2/s
    m = re.search(r"10\(?-(\d)\)?cm\(?2\)?/s", u)
    if m:
        return 10.0 ** (5 - int(m.group(1)))  # 1 cm^2 = 100 mm^2
    m = re.search(r"10\(?-(\d)\)?mm\(?2\)?/?s", u) or re.search(r"mm2/secx10-(\d)", u)
    if not m:
        raise SystemExit(f"unknown ADC unit: {unit!r}")
    return 10.0 ** (3 - int(m.group(1)))


units = collections.Counter()
for i, r in enumerate(json.load(open(f"{ref}/adc.json"))["records"]):
    if str(r["pmid"]) in pdf_pmids:
        replaced[r["citation"][:30]] += 1
        continue
    f = adc_factor(r["ADC_unit"])
    units[(r["ADC_unit"], f)] += 1
    method = "; ".join(
        x
        for x in [
            r["metric"],
            r["method"],
            ("b = " + r["b_values"]) if r["b_values"] else None,
        ]
        if x
    )
    extra = [
        f"The source prints {r['ADC_value']}"
        + (f" ± {r['ADC_sd']}" if r["ADC_sd"] is not None else "")
        + f" {r['ADC_unit']}."
    ]
    if r["field_T"] is None:
        extra.append("The text that was read does not give the field strength.")
    recs.append(
        {
            "species": r["species"],
            "condition": r["condition"],
            "field_T": num(r["field_T"]),
            "category": category(r["tissue"]),
            "tissue": cap(r["tissue"]),
            "region_detail": r["region_detail"] or None,
            "T1_ms": None,
            "T1_sd": None,
            "T2_ms": None,
            "T2_sd": None,
            "T2s_ms": None,
            "T2s_sd": None,
            "PD": None,
            "ADC": num(r["ADC_value"] * f),
            "ADC_sd": num(r["ADC_sd"] * f) if r["ADC_sd"] is not None else None,
            "subjects": r["subjects"] or None,
            "method": method or None,
            "temperature": r["temperature"] or None,
            "fixation": r["fixation"] or None,
            "gd_doped": False,
            "converted_from_rate": False,
            "checked": checked("adc", i),
            "notes": clean_notes(r["notes"], extra),
            "quote": r["quote"],
            "read_from": r["read_from"],
            "pmid": str(r["pmid"]) if r["pmid"] else None,
            "doi": r["doi"] or None,
            "citation": r["citation"],
        }
    )


# --- records from the supplied PDF files ---
def pdf_where(r):
    return f"{r['read_from']}, PDF page {r['page']}"


dropped_pdf = collections.Counter()
for n in PDF_NAMES:
    for i, r in enumerate(pdf[n]["records_tissue"]):
        extra = []
        if str(r["pmid"]) == "11283978" and r["T1_sd"] is not None:
            # Spees 2001: the error of the time was calculated from the error of the rate.
            # As for all other rates, the error is not converted.
            r = dict(r, T1_sd=None)
            extra.append(
                "The error of the rate is not converted to an error of the time."
            )
        if str(r["pmid"]) == "22505333":
            extra.append(
                "The paper does not say if a contrast agent was given before the T2 measurement."
            )
        recs.append(
            {
                "species": r["species"],
                "condition": r["condition"],
                "field_T": num(r["field_T"]),
                "category": category(r["tissue"]),
                "tissue": cap(r["tissue"]),
                "region_detail": r["region_detail"] or None,
                "T1_ms": num(r["T1_ms"]),
                "T1_sd": num(r["T1_sd"]),
                "T2_ms": num(r["T2_ms"]),
                "T2_sd": num(r["T2_sd"]),
                "T2s_ms": num(r["T2s_ms"]),
                "T2s_sd": num(r["T2s_sd"]),
                "PD": num(r["PD"]),
                "ADC": None,
                "ADC_sd": None,
                "subjects": r["subjects"] or None,
                "method": r["method"] or None,
                "temperature": r["temperature"] or None,
                "fixation": r["fixation"] or None,
                "gd_doped": bool(r["gd_doped"]),
                "converted_from_rate": bool(r["converted_from_rate"]),
                "checked": status5[f"{n}:records_tissue:{i}"],
                "notes": clean_notes(r["notes"], extra),
                "quote": r["quote"],
                "read_from": pdf_where(r),
                "pmid": str(r["pmid"]) if r["pmid"] else None,
                "doi": r["doi"] or None,
                "citation": r["citation"],
            }
        )
    for i, r in enumerate(pdf[n]["records_adc"]):
        if str(r["pmid"]) == "14972393":
            # Lehnert 2004 gives only a range over three volunteers, not a value
            dropped_pdf["Lehnert 2004: range only"] += 1
            continue
        f = adc_factor(r["ADC_unit"])
        units[(r["ADC_unit"], f)] += 1
        extra = [
            f"The source prints {r['ADC_value']}"
            + (f" ± {r['ADC_sd']}" if r["ADC_sd"] is not None else "")
            + f" {r['ADC_unit']}."
        ]
        metric = r["metric"]
        if metric == "Tr(D)":
            # The trace of the diffusion tensor is 3 times the mean diffusivity
            f = f / 3.0
            metric = "Tr(D)/3"
            extra.append(
                "The printed value is the trace Tr(D). The value here is Tr(D)/3."
            )
        method = "; ".join(
            x
            for x in [
                metric,
                r["method"],
                ("b = " + r["b_values"]) if r["b_values"] else None,
            ]
            if x
        )
        recs.append(
            {
                "species": r["species"],
                "condition": r["condition"],
                "field_T": num(r["field_T"]),
                "category": category(r["tissue"]),
                "tissue": cap(r["tissue"]),
                "region_detail": r["region_detail"] or None,
                "T1_ms": None,
                "T1_sd": None,
                "T2_ms": None,
                "T2_sd": None,
                "T2s_ms": None,
                "T2s_sd": None,
                "PD": None,
                "ADC": num(r["ADC_value"] * f),
                "ADC_sd": num(r["ADC_sd"] * f) if r["ADC_sd"] is not None else None,
                "subjects": r["subjects"] or None,
                "method": method or None,
                "temperature": r["temperature"] or None,
                "fixation": r["fixation"] or None,
                "gd_doped": bool(r.get("gd_doped", False)),
                "converted_from_rate": False,
                "checked": status5[f"{n}:records_adc:{i}"],
                "notes": clean_notes(r["notes"], extra),
                "quote": r["quote"],
                "read_from": pdf_where(r),
                "pmid": str(r["pmid"]) if r["pmid"] else None,
                "doi": r["doi"] or None,
                "citation": r["citation"],
            }
        )

order = {"human": 0, "mouse": 1, "rat": 2}
recs.sort(
    key=lambda r: (
        order[r["species"]],
        r["condition"] != "in vivo",
        r["field_T"] if r["field_T"] is not None else 99,
        r["tissue"],
        r["citation"],
    )
)

# --- relaxivity ---
relax = []
for i, r in enumerate(json.load(open(f"{ref}/relaxivity.json"))["records"]):
    secondary = "SECONDARY" in (r["notes"] or "")
    if str(r["pmid"]) in pdf_pmids or secondary:
        # Replaced by the records from the PDF of the paper, or (secondary values of
        # Rohrer 2005) by the records from the PDF of Rohrer 2005 itself
        replaced[r["citation"][:30]] += 1
        continue
    table_image = str(r["pmid"]) == "30973459" and r["read_from"] == "full-text table"
    extra = []
    if secondary and table_image:
        extra.append(
            "This value is from Rohrer et al., Invest Radiol 2005;40:715-724, as printed in Table 1 of the paper in the reference. The original paper was not read."
        )
    elif secondary:
        extra.append(
            "This value is from Rohrer et al., Invest Radiol 2005;40:715-724, as given in the text of the paper in the reference. The original paper was not read."
        )
    if table_image:
        extra.append(
            "The table is an image in the open full text. The values were read from the image two times, with the same result. The erratum to the paper (PMID 31688288) does not change this table."
        )
    ok = checked("relaxivity", i) or (i in robic_ok)
    relax.append(
        {
            "agent": cap(r["agent"]),
            "brand": r["brand"] or None,
            "field_T": num(r["field_T"]),
            "medium": r["medium"],
            "temperature": r["temperature"] or None,
            "r1": num(r["r1"]),
            "r1_sd": num(r["r1_sd"]),
            "r2": num(r["r2"]),
            "r2_sd": num(r["r2_sd"]),
            "r2s": num(r["r2s"]),
            "secondary": secondary,
            "warning": None,
            "checked": ok,
            "method": r["method"] or None,
            "notes": clean_notes(r["notes"], extra),
            "quote": r["quote"],
            "read_from": r["read_from"],
            "pmid": str(r["pmid"]) if r["pmid"] else None,
            "doi": r["doi"] or None,
            "citation": r["citation"],
        }
    )
PINTASKE_WARNING = (
    "An erratum to this paper exists (Invest Radiol 2006;41(12):859) and was not read. "
    "These are the values of the original article. Later papers give different values for some cells."
)
NOT_GADOLINIUM = ("mangafodipir", "ferucarbotran", "ferumoxide")
MEDIA = {"human blood plasma": "human plasma", "water (distilled)": "water"}
for n in PDF_NAMES:
    for i, r in enumerate(pdf[n]["records_relax"]):
        agent = r["agent"]
        notes = r["notes"] or ""
        if agent.lower().startswith(NOT_GADOLINIUM):
            dropped_pdf["not a gadolinium agent"] += 1
            continue
        if agent.startswith(("P846", "AGuIX")) or "aguix" in agent.lower():
            dropped_pdf["experimental agent, medium not stated"] += 1
            continue
        if "SECONDARY" in notes:
            # Shen 2015: a second, quality-control measurement of the same cell
            dropped_pdf["second measurement of the same cell"] += 1
            continue
        extra = []
        # Fries 2019 prints values for gadopiclenol at 1.5, 3 and 7 T that the manufacturer supplied
        secondary = str(r["pmid"]) == "31033675" and float(r["field_T"]) != 9.4
        if secondary:
            extra.append(
                "The paper did not measure this value: the manufacturer of the agent supplied it."
            )
        relax.append(
            {
                "agent": cap(agent),
                "brand": r["brand"] or None,
                "field_T": num(r["field_T"]),
                "medium": MEDIA.get(r["medium"], r["medium"]),
                "temperature": r["temperature"] or None,
                "r1": num(r["r1"]),
                "r1_sd": num(r["r1_sd"]),
                "r2": num(r["r2"]),
                "r2_sd": num(r["r2_sd"]),
                "r2s": num(r["r2s"]),
                "secondary": secondary,
                "warning": PINTASKE_WARNING if str(r["pmid"]) == "16481903" else None,
                "checked": status5[f"{n}:records_relax:{i}"],
                "method": r["method"] or None,
                "notes": clean_notes(notes, extra),
                "quote": r["quote"],
                "read_from": pdf_where(r),
                "pmid": str(r["pmid"]) if r["pmid"] else None,
                "doi": r["doi"] or None,
                "citation": r["citation"],
            }
        )
relax.sort(key=lambda r: (r["agent"], r["field_T"], r["medium"], r["citation"]))
print("replaced older records:", dict(replaced))
print("PDF records not used:", dict(dropped_pdf))

head = """/**
 * MRI Signal Intensity Simulator: literature reference values
 *
 * `referenceData`: each record is one published measurement: one source, field
 * strength, condition and tissue. Records from different sources are not averaged.
 *
 *   species, condition      - "human" | "mouse" | "rat"; "in vivo" | "ex vivo"
 *   field_T                 - field strength in tesla (1.5 to 18); null if the source text
 *                             does not give it (some ADC records)
 *   category                - "brain" (CSF and brain tissue that is not a focal lesion; this
 *                             includes tissue of patients and donors with a disease, and the
 *                             record says so), "lesion" (brain lesion or tumour), "body" (fat,
 *                             bone marrow, muscle) or "blood"
 *   tissue, region_detail   - tissue class and the region in the words of the source
 *   T1_ms, T2_ms, T2s_ms    - relaxation times in ms, null if the source does not give them
 *   PD                      - proton density relative to water = 1, null if not given
 *   ADC                     - apparent diffusion coefficient (or mean diffusivity) in
 *                             10^-3 mm^2/s, null if not given. The notes give the value and
 *                             the unit as printed in the source.
 *   *_sd                    - the +/- value as printed in the source, null if not given. It is
 *                             usually an SD. If the source does not give the type, or if it
 *                             is a standard error, the notes say so.
 *   gd_doped                - true if a contrast agent was in the sample
 *   converted_from_rate     - true if the source gives a rate (R1, R2, R2*) and not a time
 *   checked                 - true if the quote, or all the numbers of the quote, were found in
 *                             a second, fresh copy of the abstract or full text. This shows
 *                             that the values are in the source. It does not fully prove that
 *                             each value is with the correct tissue. For a record from a PDF
 *                             file of the paper ("PDF page" in read_from), true shows that a
 *                             script found the quote in the text of the PDF and the values
 *                             in the quote. false: the values were read one time only.
 *   quote, read_from        - the text of the source that contains the values, and where it is
 *   pmid, doi, citation     - the reference
 *
 * `relaxivityData`: relaxivities of gadolinium contrast agents, in 1/(mM*s).
 *
 *   agent, brand            - generic name and trade name
 *   field_T, medium, temperature
 *   r1, r2, r2s             - relaxivities (r2s is r2*), null if the source does not give them
 *   secondary               - true if the paper in the reference did not measure the value
 *                             (the notes say where the value comes from)
 *   warning                 - a text if the values need caution (for example an erratum that
 *                             was not read), or null
 *   checked, quote, read_from, pmid, doi, citation - as above
 *
 * This file has no DOM code, so that Node.js can load it for the tests.
 */

const referenceData = """
mid = """;

const relaxivityData = """
tail = """;

// Node.js (tests). In the browser, these are globals.
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { referenceData, relaxivityData };
}
"""
dump = lambda x: json.dumps(x, indent=4, ensure_ascii=False)
open(out, "w", encoding="utf-8").write(head + dump(recs) + mid + dump(relax) + tail)
print(len(recs), "records;", len(relax), "relaxivity records")
print("category", collections.Counter(r["category"] for r in recs))
print(
    "checked",
    collections.Counter(r["checked"] for r in recs),
    "relax checked",
    collections.Counter(r["checked"] for r in relax),
)
print("ADC units", dict(units))
print(
    "sources",
    len({r["pmid"] or r["doi"] for r in recs}),
    len({r["pmid"] for r in relax}),
)
for r in recs:
    if (
        r["category"] != "brain"
        and r["citation"] in {b["citation"] for b in brain}
        and r in brain
    ):
        pass
print(
    sorted(
        {(r["category"], r["tissue"][:60]) for r in recs if r["category"] == "lesion"}
    )[:60]
)
