# Brief 3: extraction of reference values from supplied PDF files

An MRI signal simulator has literature tables of (1) tissue relaxation times T1, T2,
T2* and proton density PD, (2) ADC values, and (3) relaxivities of gadolinium contrast
agents. The user supplied PDF files of papers that were not readable before. Your task
(in the prompt) is one batch of these PDFs. You do extraction only. Do not edit the
project repository and do not copy the PDFs anywhere else.

## Where the files are
- PDFs: papers/<name>.pdf (read with the Read
  tool and its `pages` parameter; this shows the real page, including tables)
- Plain text (pdftotext -layout) of each PDF:
  <text directory>/<name>.txt
  Use the text to find the tables and to copy quotes. ALWAYS confirm table values on the
  PDF page itself (Read tool), because the text layout can put a number in the wrong
  column, and old papers have OCR errors.

## Hard rules
- NOTHING from memory. A value goes in only if you read it in the PDF in this session.
- Scope of tissue records: human, mouse and rat only (no other species, no phantoms);
  field strength 1.4 T to 18 T; normal brain tissue and CSF, brain lesions (give the
  EXACT pathology in the words of the paper), fat, bone marrow, skeletal muscle and
  blood (human only for the last four; give oxygenation, haematocrit and temperature
  for blood). Other organs (liver, kidney, cartilage, ...) are out of scope.
- One record per paper x field x condition x tissue/region. If a table has many
  regions, record all regions of gray matter, white matter and CSF (up to about 25
  rows per paper; if there are more, take the main ones and say in "notes" what you
  left out). Use the group that is healthy/control/adult when the paper has several
  groups, and say which group in "subjects".
- Each record must have a VERBATIM quote that contains its number(s): copy the table
  row (label and numbers) or the sentence exactly as in the plain text file, so that a
  script can find it there. If the plain text is wrong (OCR), quote the plain text as
  it is and give the correct reading in "notes".
- Record the value and the unit as printed. The only permitted changes: seconds to ms;
  percent PD to a fraction; a rate (R1, R2, R2*) to a time, with
  "converted_from_rate": true and the rate in the quote. Do NOT convert ADC units and
  do NOT convert relaxivity units.
- Record the error value as printed and say in "notes" what it is (SD, SEM, range,
  CI, unknown).
- Values that are only in a figure: do not estimate them. Put the paper in
  "not_usable" with the reason.
- Citation and PMID: take them from PubMed (PubMed tools, or
  https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=<DOI>[doi]
  and efetch) or Crossref. The DOI is in the PDF file name (first "_" is "/").
- Privacy: do not put personal or project names in requests to outside services.
- Temporary files only in the scratch directory given in your prompt (never /tmp).

## Record formats
Tissue record ("records_tissue"):
{"species":"human"|"mouse"|"rat","condition":"in vivo"|"ex vivo","field_T":number,
 "tissue":string,"region_detail":string|null,
 "T1_ms":number|null,"T1_sd":number|null,"T2_ms":number|null,"T2_sd":number|null,
 "T2s_ms":number|null,"T2s_sd":number|null,"PD":number|null,
 "subjects":string|null,"method":string|null,"temperature":string|null,
 "fixation":string|null,"gd_doped":boolean,"converted_from_rate":boolean,
 "quote":string,"page":number,"read_from":"full-text table"|"full-text body",
 "pdf":"<file name>","pmid":string|null,"doi":string,"citation":"First author et al. Journal Year;Vol:Pages",
 "notes":string|null}
 ("tissue" is a short class name such as "White matter", "Cortical gray matter",
  "Caudate", "CSF", "Subcutaneous fat", "Skeletal muscle", "Blood (venous)", or the
  pathology; "region_detail" is the region in the words of the paper. For ex vivo:
  "fixation" must say fixed/unfixed, the fixative and time, any PBS wash and any
  contrast agent; "temperature" is the scan temperature. In situ post-mortem scans
  are "ex vivo" with fixation "unfixed, in situ".)

ADC record ("records_adc"): the same identification fields, and
 "ADC_value":number,"ADC_sd":number|null,"ADC_unit":string (as printed),
 "metric":"ADC"|"MD"|... as printed,"b_values":string|null
 in place of the T1/T2/T2*/PD fields.

Relaxivity record ("records_relax"):
{"agent":generic name,"brand":string|null,"field_T":number,"medium":string,
 "temperature":string|null,"r1":number|null,"r1_sd":number|null,"r2":number|null,
 "r2_sd":number|null,"r2s":number|null,"unit":string (as printed),"method":string|null,
 "quote":string,"page":number,"read_from":...,"pdf":...,"pmid":...,"doi":...,"citation":...,"notes":...}

## Output
ONE JSON file at the path in your prompt:
{"records_tissue":[...],"records_adc":[...],"records_relax":[...],
 "not_usable":[{"pdf":...,"reason":...}], "papers_done":[file names]}
Write the file early and update it after each paper, so that work is not lost.
Each PDF of your batch must be in "papers_done", and must have records or a
"not_usable" entry. Then reply with a short summary: records per paper, and problems.
