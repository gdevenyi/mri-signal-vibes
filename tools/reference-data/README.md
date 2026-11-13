# Generator of `reference-data.js`

`reference-data.js` (in the top directory) is a generated file. Do not edit it by hand.
The files here make it from the records of the literature search.

## Make the data file again

```sh
python3 -I tools/reference-data/build_all.py tools/reference-data/data reference-data.js
```

The result must be identical to the file in the repository (`git diff` shows no change).
The CI run does this check. The scripts use only the Python standard library.

To add or correct a record, change the JSON file in `data/`, run the command and commit
the two files together.

## Files

| File | Content |
|---|---|
| `data/human_invivo.json`, `human_exvivo.json`, `mouse.json`, `rat.json` | Brain T1, T2, T2\* and PD records (first search) |
| `data/tissues2.json` | Fat, bone marrow, muscle, blood, brain lesions, CSF and 1.5 T brain records |
| `data/adc.json` | ADC records, with the value and the unit as printed in the source |
| `data/relaxivity.json` | Contrast agent relaxivity records |
| `data/BRIEF.md`, `data/BRIEF2.md` | The rules that the literature searches used |
| `build.py` | Makes the brain records (cleans the notes, sets `checked`) |
| `build_all.py` | Calls `build.py`, adds the other records, converts the ADC units, writes the file |
| `status2.json`, `status3.json`, `robic_ok.json` | Results of the second-copy checks (the input for `checked`) |
| `fetch*.py`, `check*.py` | The scripts that downloaded fresh copies of the sources and compared the quotes with them |
| `leads.py`, `LEADS.md` | The papers that probably have values but that were not read |

Each JSON file in `data/` has four lists: `records`, `unread_leads` (papers that were
not read, with the reason), `empty_cells` (combinations with no source) and
`search_log` (the search queries).

## The second-copy check

The check scripts are here as a record of the method. They need a directory of
downloaded abstracts and full texts, which is not in the repository (the full texts
are copyrighted). To do the check again, run a fetch script first:

```sh
python3 -I tools/reference-data/fetch3.py tools/reference-data/data <download-directory>
python3 -I tools/reference-data/check3.py tools/reference-data/data <download-directory> <status-file>
```

`fetch.py`, `check.py` and `check2.py` are for the four brain files; `fetch3.py`,
`check3.py` and `check4.py` are for the three newer files. `check4.py` is a stricter
check of the values and of the citations. Two things were checked by eye and not by
script: the relaxivity table of Robic 2019 (an image; `robic_ok.json` lists the
records whose values agree with a second reading), and the records that `build.py`
names directly.

## List of unread papers

```sh
python3 -I tools/reference-data/leads.py
```

This writes `LEADS.md` from the `unread_leads` lists.
