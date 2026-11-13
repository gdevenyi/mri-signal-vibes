# Brief: MRI relaxation reference values (literature extraction)

Goal: collect published T1, T2, T2* and proton density (PD) values of BRAIN tissue,
for a reference table in an MRI signal simulator. Field range 1.5 T to 18 T inclusive.
Other organs are out of scope.

## Hard rules (provenance)
- NOTHING from memory. Not values, not citations. A value goes in only if you READ it,
  in this session, in the abstract or full text of the paper (PubMed tools:
  search_articles, get_article_metadata, get_full_text_article; also Consensus /
  WebSearch to find papers, then confirm in PubMed/PMC or the publisher page).
- Each record must have a VERBATIM quote from the source that contains the number(s),
  and say where you read it: "abstract", "full-text table", or "full-text body".
- Take the citation (authors, title, journal, year, PMID, DOI) from the PubMed
  metadata tool, not from memory.
- Do not average across papers. Do not interpolate between field strengths.
  Do not convert R1/R2 to T1/T2 unless the paper gives only rates; if you convert,
  set "converted_from_rate": true and quote the rate.
- If a paper clearly has values but you cannot read them (paywall, values only in a
  figure), list it under "unread_leads" with PMID and why. Do not guess its values.
- An empty cell is a valid result. Say which cells you searched and found nothing for.
- Values are usually in full-text tables: prefer papers with PMC full text.
- Consensus tool: at most 3 searches per batch.

## Record (one per source x field x condition x tissue/region)
{
  "species": "human" | "mouse" | "rat",
  "condition": "in vivo" | "ex vivo",
  "field_T": number,                 // e.g. 1.5, 3, 4.7, 7, 9.4, 11.7, 14.1, 16.4, 17.6
  "tissue": string,                  // e.g. "White matter", "Cortical gray matter", "Hippocampus", "CSF"
  "region_detail": string | null,    // e.g. "frontal WM", "splenium"
  "T1_ms": number | null, "T1_sd": number | null,
  "T2_ms": number | null, "T2_sd": number | null,
  "T2s_ms": number | null, "T2s_sd": number | null,
  "PD": number | null,               // relative to water/CSF = 1, only if the paper gives it
  "subjects": string | null,         // n, strain, age, sex if given
  "method": string | null,           // e.g. "IR", "Look-Locker", "VFA", "MP2RAGE", "CPMG multi-echo", "multi-echo GRE"
  "temperature": string | null,      // important for ex vivo
  "fixation": string | null,         // ex vivo: fixative, time, PBS wash, and ANY gadolinium/contrast doping
  "gd_doped": boolean,               // true if a contrast agent was in the sample/animal
  "converted_from_rate": boolean,
  "quote": string,                   // verbatim text or table row that contains the numbers
  "read_from": "abstract" | "full-text table" | "full-text body",
  "pmid": string | null, "doi": string | null,
  "citation": string,                // "First author et al. Journal Year;Vol:Pages" from metadata
  "notes": string | null
}

## Output
Write ONE JSON file at the path given in your task: {"records": [...], "unread_leads": [...],
"empty_cells": [...], "search_log": [short list of queries]}. Write it early and update it as
you go, so that work is not lost. Then reply with a short summary: number of records per
species/condition/field, and the main gaps. Healthy/control adult tissue is the priority;
record neonate/aged/disease-model controls only if labelled as such in "subjects".
Quality over quantity: 15 to 40 well-sourced records is a good result.
