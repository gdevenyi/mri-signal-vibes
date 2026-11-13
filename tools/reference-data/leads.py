"""Write LEADS.md: the papers that probably have values but that were not read."""

import json
import os
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
        rows.append(
            f"| {cell(lead['citation'])} | {link(lead)} | {cell(lead.get('why') or lead.get('reason'))} |"
        )
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
