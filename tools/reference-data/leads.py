"""Write LEADS.md: the papers that probably have values but that were not read."""

import json
import os
import re
import sys

here = os.path.dirname(os.path.abspath(__file__))
data = os.path.join(here, "data")
out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(here, "LEADS.md")

GROUPS = [
    ("human_invivo", "Human brain, in vivo (T1, T2, T2*, PD)"),
    ("human_exvivo", "Human brain, ex vivo (T1, T2, T2*, PD)"),
    ("mouse", "Mouse brain (T1, T2, T2*, PD)"),
    ("rat", "Rat brain (T1, T2, T2*, PD)"),
    ("tissues2", "Human fat, muscle, blood, brain lesions, CSF (T1, T2, T2*, PD)"),
    ("adc", "ADC (human, mouse, rat)"),
    ("relaxivity", "Contrast agent relaxivity"),
]


def key_of(text):
    return re.sub(r"[^a-z0-9]", "", str(text or "").lower())


# Papers that were read later from PDF files: `pdf_done` have records now, and
# `pdf_reason` gives the reason for those that have no usable value.
pdf_done = set()
pdf_reason = {}
for name in ["human", "body", "lesion", "exvivo", "rodent", "relax"]:
    with open(os.path.join(data, f"pdf_{name}.json"), encoding="utf-8") as fh:
        d = json.load(fh)
    for kind in ("records_tissue", "records_adc", "records_relax"):
        for r in d[kind]:
            pdf_done.add(key_of(r["doi"]))
            pdf_done.add(str(r["pmid"]))
    for entry in d["not_usable"]:
        doi_key = key_of(entry["pdf"].replace(".pdf", ""))
        if doi_key not in pdf_done:
            pdf_reason[doi_key] = entry["reason"]
pdf_done.discard("")
# The erratum to Robic 2019 was read: it does not change the relaxivity table
pdf_done.add("31688288")
pdf_reason.pop(key_of("10.1097/RLI.0000000000000632"), None)
# PMIDs of the PDFs with no usable value whose lead has no DOI
PDF_PMID = {
    "1742132": "10.3109_02841859109177614",
    "39250425": "10.1002_mrm.30264",
    "24607447": "10.1016_j.neuroimage.2014.02.026_",
    "29890327": "10.1016_j.neuroimage.2018.06.007_",
}
for pmid, pdf_name in PDF_PMID.items():
    reason = pdf_reason.get(key_of(pdf_name))
    if reason:
        pdf_reason[pmid] = reason

# Leads that came from the PDF reading
EXTRA_LEADS = [
    {
        "citation": "Erratum to Pintaske et al. Invest Radiol 2006;41:213-221 (Invest Radiol 2006;41(12):859)",
        "why": "The records of Pintaske 2006 have the values of the original article. PubMed lists an erratum, "
        "which was not in the supplied files. Later papers give different values for some cells "
        "(for example r1 at 3 T), probably from the erratum.",
    },
    {
        "citation": "Behroozi M et al. Magn Reson Med 2018;79(2):1090-1100, supporting tables",
        "doi": "10.1002/mrm.26722",
        "why": "The regional T1 and T2 of the rat are in Supporting Table S2, which is not in the PDF of the article.",
    },
]


def link(lead):
    doi, pmid = lead.get("doi"), lead.get("pmid")
    parts = []
    if doi:
        parts.append(f"[DOI](https://doi.org/{doi})")
    if pmid:
        parts.append(f"[PubMed](https://pubmed.ncbi.nlm.nih.gov/{pmid}/)")
    return " ".join(parts) or "-"


def cell(text):
    return " ".join(str(text or "").split()).replace("|", "\\|")


lines = [
    "# Papers that were not read",
    "",
    "These papers probably have values for the reference tables, but the values were not",
    "available to read: the paper is behind a paywall, the publisher blocks automated",
    "access, or the values are only in a figure or an image. No value from these papers",
    "is in `reference-data.js`.",
    "",
    "This file is made by `leads.py` from the `unread_leads` lists in `data/*.json`.",
    "Papers that were read later from a PDF file are not in the list, unless the PDF has",
    "no usable value (then the reason is here).",
    "The notes are the notes of the literature search, as written at that time.",
    "",
]
seen = set()
total = 0
for name, title in GROUPS:
    leads = json.load(open(os.path.join(data, f"{name}.json"), encoding="utf-8"))[
        "unread_leads"
    ]
    rows = []
    for lead in leads:
        key = str(lead.get("pmid") or lead.get("doi") or lead["citation"])
        if key in seen:
            continue
        seen.add(key)
        doi_key = key_of(lead.get("doi"))
        if (doi_key and doi_key in pdf_done) or str(lead.get("pmid")) in pdf_done:
            continue  # the paper has records now
        reason_key = doi_key if doi_key in pdf_reason else str(lead.get("pmid"))
        if reason_key in pdf_reason:
            why = (
                "The PDF was read, but it has no usable value. "
                + pdf_reason[reason_key]
            )
            lead = dict(lead, why=why, reason=None)
        rows.append(
            f"| {cell(lead['citation'])} | {link(lead)} | {cell(lead.get('why') or lead.get('reason'))} |"
        )
    if name == "relaxivity":
        rows += [
            f"| {cell(x['citation'])} | {link(x)} | {cell(x['why'])} |"
            for x in EXTRA_LEADS
        ]
    lines += [
        f"## {title}",
        "",
        "| Paper | Link | Why it was not read, and what it has |",
        "|---|---|---|",
        *rows,
        "",
    ]
    total += len(rows)
with open(out, "w", encoding="utf-8") as f:
    f.write("\n".join(lines))
print(total, "papers")
