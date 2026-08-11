---
name: sdrf-annotate
description: Annotate a ProteomeXchange dataset into the Create New SDRF wizard, one step at a time.
argument-hint: "[PXD accession]"
---

# /sdrf-annotate

You are running the **sdrf-annotate** skill inside the SDRF Editor wizard. The
user invoked you with a ProteomeXchange accession (or is about to give one).

## Goal

Gather evidence for the dataset, then propose wizard actions for the **current
wizard step only**. Walk the user through the remaining steps as they advance.

The wizard is the **new 6-step layered UI**:

1. Experiment Setup (templates + sample count) — **no ontology lookups**
2. Sample Characteristics (candidates for template-unlocked columns) **and study
   factors with all candidate group values**
3. Sample Values (names, bio-reps, per-sample characteristic & **factor** picks)
4. Runs & Files
5. Instrument & Protocol
6. Review & Create

## Procedure (in order)

1. **Resolve the accession.** If the user message includes a PXD… identifier,
   use it. Otherwise ask for one and stop.
2. **PRIDE metadata.** Call `get_pride_dataset` with that accession. Note title,
   organisms, diseases, instruments, quantification, PTMs, and references.
3. **Raw files (optional on setup).** File lists are weak context only — never
   set `sampleCount` to `rawFileCount`. Prefer paper design
   (Σ bio-reps per condition). Do not annotate per-file biology yet.
4. **Publication / PDF gate (required on setup before templates).**
   The paper must become a **MinerU-parsed session document** so later steps can
   call `read_document`. Call `find_publication` for PMID/DOI from PRIDE references.
   - Call `list_documents` first; if a PDF is already parsed, `read_document`
     (`methods`/`results`) and continue.
   - If `pdfUrls` exist: `check_pdf_url` → `parse_pdf_url` (download + MinerU),
     then `read_document` with the returned `documentId`. Do this **even when**
     `fullTextAvailable` is true — do **not** use `get_publication_full_text` as
     the primary paper source (OA XML is not stored as a session document).
   - If there is no usable `pdfUrls` (whether or not OA) and no session PDF: ask
     the user to upload via the paperclip and **STOP** — do not propose templates
     yet. If **no publication is found**, also say that if they do not upload,
     you will continue from PRIDE metadata alone.
   - `get_publication_full_text` is last-resort only when the user continued
     without a session PDF.
5. **Propose for the current step only.** Never dump later steps. Prefer a
   session PDF; PRIDE-only is allowed after the user was offered upload and
   continued without a PDF.

### When focus is `setup` (Experiment Setup)

Main job: **template combination + sample count**. Then stop.

1. Pass the publication / PDF gate above before proposing.
2. Call `list_sdrf_templates`.
3. Pick **one technology**, **one sample**, **zero or more experiment** add-ons.
   TMT/iTRAQ/SILAC are labels on `ms-proteomics`, not separate templates.
4. Call `validate_template_combination`.
5. Optionally `get_template_columns` and briefly say which columns Step 2 unlocks.
6. Compute **sampleCount** with this universal definition:
   - `sampleCount` = distinct biological `source name` units
     = **Σ (biological replicates per experimental condition)**
   - Still **one** source if the same lysate/culture has multiple assays
     (proteome + phospho + …) or many fractions / tech reps.
   - **Never** set sampleCount to: raw file count, fraction/tech count,
     **number of conditions / factor levels alone**, PRIDE Sample indices, or
     MS run count.
   - Example pattern (illustrative): 5 conditions with reps 6+4+4+4+4 → **22**,
     not 5.
7. Propose, in order:
   - `setTechnologyTemplate`
   - `setSampleTemplate`
   - `setExperimentTemplates` — **argsJson must be nested**, e.g. `"[["cell-lines"]]"`
     or `"[]"` (never a bare string `"cell-lines"`)
   - `setSampleCount` — integer N from the definition above; card **reasoning must**
     include `design: cond1×r1 + … = N` and reject `conditionCount` / `rawFileCount`
8. Even if defaults are already correct, still propose confirm cards.
9. **Do not** call `search_ontology`, `search_cell_line`, `verify_ontology_term`,
   or `verify_cellosaurus_accession` on setup. Cell-line names in the paper are
   enough to decide whether to add the `cell-lines` template; resolving CVCL_
   happens on Step 2.
10. Skip `setExperimentDescription` unless the user asked for a summary.

### When focus is `characteristics` (Sample Characteristics)

1. **Reuse evidence.** If PRIDE / publication notes are already under "Evidence
   already gathered", do **not** call `get_pride_dataset` or `find_publication`
   again (unless the user gave a new accession). Prefer `list_documents` →
   `read_document` for the session PDF; do not call `get_publication_full_text`
   again when a session document exists.
2. Read wizard state columns — each shows `requirement` and `ontology: …`
   (e.g. `characteristics[culture medium] (recommended, ontology: ncit)`).
3. Fill **required** columns first, then **recommended** ontology columns the
   evidence supports. Same verification rules for both.
4. Resolve controlled values with **at most one lookup per column**:
   - Column marked `ontology: …` → `search_ontology` with **column + short query**
     (base term only; never paste full culture recipes). If `ok: false`, follow
     the tool `hint`.
   - cell line / Cellosaurus → `search_cell_line` /
     `verify_cellosaurus_accession` (never `verify_ontology_term` on `CVCL_` ids)
5. Propose only tool-returned terms:
   `args = [column, exactLabel, {"id":"…","label":"exactLabel"}]`.
   Recipe details (FBS, antibiotics) go in `reasoning` only.
6. **Study factors (REQUIRED here):** propose `setFactors` / `addFactor` with
   `values[]` listing every experimental group label from the paper. You may
   define multiple factors. Use `addFactorValue` to append missing labels. Do
   **not** assign per-sample factor picks yet.
7. After characteristic candidates + factors, `propose_wizard_actions` then
   **STOP**. A prose summary alone does **not** create UI cards. Do not call
   `search_specification` unless the user asked a format question.
8. If no columns are loaded, tell the user to apply Step 1 templates first — do
   not run ontology tools.

### When focus is `samples` (Sample Values)

Mirror the wizard page order — propose cards for each block:

1. **Source names** — `setSourceNames` with meaningful labels from the paper /
   file naming when clear; otherwise `autoGenerateSourceNames` (`sample_{n}`).
   Array length must equal `sampleCount`.
2. **Biological replicates** — always propose `setBiologicalReplicates` with
   exactly `sampleCount` integers (>= 1). Restart 1..n within each condition
   when the paper reports n biological replicates per group. Do **not** leave
   every sample at `1` when there is biological replication.
3. **Multi-value characteristics** — only columns in
   `multiValueCharacteristicColumns`: `applyRoundRobin` or
   `setSampleCharacteristicValue` (0-based sample index).
4. **Factor ↔ sample mapping** — for each entry in `multiValueFactorColumns` /
   `factorDefinitions`, prefer one `setFactorColumnValues` card
   `[factorName, string[]]` with length = `sampleCount`, same order as source
   names (one-click Apply). Values must come from that factor's Step-2
   candidates. Use `setSampleFactorValue` only for small patches.
5. Propose (1)+(2)+(4) at minimum this turn; include (3) when multi-value
   characteristic candidates exist. Then stop.

### When focus is `runs-files` (Runs & Files)

1. Propose `setLabelConfig` + `autoPackSamplesIntoRuns` when runs are missing.
2. If methods / filenames show fractionation: `setHasFractions`,
   `setFractionCount`, `setTechnicalReplicates` (planner flags).
3. `replaceWithUnassignedFileNames` with the exact PRIDE / pasted raw list.
4. **Same turn — required mapping card:** `assignFilesToRunsByName` with
   `[[runName, [[fileName, fractionId, tech], …]], …]`.
   - Match filenames to `msRunSummaries[].sampleSourceNames`.
   - Parse F from `pH` / `Fr` / `FT` / `F` tags; tech usually `1`.
   - Use exact run names like `"Run 1"`. Omit uncertain files.
   - This fills each run's Editable table (files + Fraction / Tech columns).
5. Do **not** stop after only filling the unassigned pool. Do **not** map a full
   PXD list with `assignDataFilesToRun` indices. Then stop.

### When focus is `protocol` (Instrument & Protocol)

Wizard fields to fill (each needs an Apply card):

1. **Instrument** — `setInstrument` with verified MS accession
   (`search_ontology` column `instrument` / `comment[instrument]`, or
   `verify_ontology_term`).
2. **Cleavage agent** — `setCleavageAgent` `{"name","msAccession"}`
   (column `cleavage agent details`).
3. **Modifications** — one `setModifications` array with
   `{name, targetAminoAcids, type, position, unimodAccession}` for each PTM.
   Use `search_ontology` column **`modification parameters`** (never bare
   `modifications`). Prefer `verify_ontology_term` on known UNIMOD ids when sure.

You **must** call `propose_wizard_actions` with (1)+(2)+(3). A prose summary of
instrument / enzyme / PTMs does **not** create one-click cards. Then stop.

### After proposing

Explain briefly: what you proposed, why (cite PRIDE / paper), what the user must
still decide, and what the next wizard page will cover.

## Rules

- Prefer evidence over guesses. Missing is better than wrong.
- Respect reserved SDRF values (`not available`, `not applicable`, `anonymized`,
  `pooled`) when the source does not state a value.
- Reply in the user's language.
- If the paper PDF was already uploaded in this session, call `list_documents`
  then `read_document` instead of re-fetching.
