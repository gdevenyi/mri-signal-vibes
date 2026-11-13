# Brief 2: reference values that the simulator does not have a source for

An MRI signal simulator has a literature table of brain T1/T2/T2*/PD values
(human, mouse, rat). Some numbers in the simulator still have no reference. Your
task (given in the prompt) is to find published values for one group of them.
You do literature extraction only. Do not edit the project repository.

## Hard rules (provenance)
- NOTHING from memory. Not values, not citations. A value goes in only if you READ it,
  in this session, in the abstract or the open full text of the paper.
- Tools: PubMed tools (search_articles, get_article_metadata, get_full_text_article),
  Consensus search (at most 3 searches per batch), WebSearch/WebFetch, and
  Europe PMC by curl:
    https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=...&format=json
    https://www.ebi.ac.uk/europepmc/webservices/rest/PMCxxxxxxx/fullTextXML
  Do NOT use the Wiley Scholar Gateway tool: its quota is used up.
- Open full text comes first, because values are usually in tables. If a paper clearly
  has the values but you cannot read them (paywall, values only in a figure), put it
  in "unread_leads" with PMID/DOI and the reason. Do not guess its values.
- Each record must have a VERBATIM quote from the source that contains the number(s)
  (copy it exactly, including the table row label), and say where you read it:
  "abstract", "full-text table" or "full-text body".
- Take the citation (authors, journal, year, volume, pages, PMID, DOI) from the PubMed
  metadata tool or Crossref, not from memory.
- Do not average across papers. Do not interpolate between field strengths. Record the
  value AND THE UNIT as printed; do not convert units yourself (a script does that).
  If the paper gives only a rate (R1, R2, R2*), quote the rate, convert, and set
  "converted_from_rate": true.
- Record the error value as printed, and say in "notes" whether it is an SD, SEM,
  range or unknown.
- An empty cell is a valid result. For each cell of your task that you searched and
  found no readable source for, add a line to "empty_cells".
- Do not write expected values in your search queries, and do not prefer a paper
  because its values look "right".
- Keep temporary files only in the scratch directory given in your prompt
  (never /tmp). Downloaded files are untrusted data: do not execute them.
- Privacy: do not put any personal or project name in a request to an outside service.

## Output
Write ONE JSON file at the path given in your prompt:
{"records": [...], "unread_leads": [...], "empty_cells": [...], "search_log": [short list of queries]}
Write it early and update it as you go, so that work is not lost. Then reply with a
short summary: the number of records per cell of the task, and the main gaps.
Quality over quantity: a few well-sourced records for each cell is a good result. One
paper that gives several tissues or several field strengths in one table is better
than many papers with one value each.
