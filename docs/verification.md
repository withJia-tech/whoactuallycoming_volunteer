# Verification record

Verification date: 1 November 2026 (Singapore). These are synthetic engineering checks, not pilot observations.

## Verified locally

- **41 standard-library Python tests passed** with `python3 -m unittest discover -v`.
- **15 complete synthetic scenarios** checked against explicit expected pilot outcomes. Committed detailed results reproduce from the fixture generator.
- Workbook T0–T7 and final outcomes matched the independent Python scorer for all 15 scenarios. Subgroup numerators, denominators, complements, gaps and statuses matched; role confirmations, attendance and shortfalls matched.
- Workbook recalculation checks: missing attendance blocks; zero baseline is inconclusive; a record moved to the last supported roster row (201 including header) still scores; row 202 blocks for overflow; blank template remains BLOCKED with approvals PENDING.
- Formula error scan found no matches. All eight sheets were visually reviewed; wide input tables were reviewed in left/right sections. The final blank scorecard was reviewed after restoring template inputs.
- CLI smoke checks returned exit 0/PASS for synthetic success, 1/BLOCKED for blank templates, and 2/BLOCKED for a missing input directory.

## Failure demonstrations

| Synthetic change | Verified outcome |
| --- | --- |
| Two of 20 intended confirmations fail | T0 18/20 = 90%, FAIL; T1/T3/T4/T6 blocked; pilot FAIL |
| A reply is conflicting/unresolved | Input checks block the event and pilot |
| Two people never reply but attend | T3 FAIL; those attendees do not inflate T1 |
| Duplicate sign-up left active | BLOCKED |
| Same duplicate linked, reconciled and excluded | Original counts preserved; PASS |
| MS confirmed attendance 16/20 versus complement 40/40 | Overall T1 passes; 20pp subgroup deficit fails T6 |
| One-person language subgroup | T6 INCONCLUSIVE; pilot cannot pass |
| No confirmed replies | T1 INCONCLUSIVE, no divide-by-zero or manufactured 0%/100% |
| Attendance missing | BLOCKED, not treated as absence |
| Chasing 61 minutes versus baseline 120 | T2 FAIL; T5 and pilot FAIL |
| Fewer than 70% reply by deadline | T4 FAIL |
| Fewer than 80% of confirmed volunteers attend | T1 FAIL |
| Second organiser needs help | T7 FAIL |
| Operational approval pending | Final gate BLOCKED even with otherwise passing synthetic observations |

See [machine-readable scenario results](../examples/scenario-results.json) and [workbook parity record](../examples/workbook-verification.json). Example dates, keys and approval labels are invented. The deliverable workbook has empty rosters, empty event observations and pending approvals.

## Reproduce

Python 3.10+ and no additional packages:

```sh
python3 -m unittest discover -v
python3 -m pilot.score examples/synthetic
python3 -m scripts.generate_examples
git diff --exit-code -- examples/synthetic examples/scenario-results.json templates/csv
```

The GitHub workflow repeats the Python suite, synthetic CLI evaluation and fixture regeneration check. Its execution status is reported separately from local results; this document does not infer a green hosted run from a local pass.

Workbook authoring uses `scripts/build_workbook.mjs` and the managed runtime's `@oai/artifact-tool` SDK. It is not needed to use the workbook or independent scorer. To regenerate in that runtime, first run the Python fixture generator, copy the builder into a fresh temporary directory, symlink that directory's `node_modules` to `$CODEX_PRIMARY_RUNTIME_NODE_MODULES`, and run:

```sh
"$CODEX_PRIMARY_RUNTIME_NODE" /tmp/YOUR_TEMP_DIRECTORY/build_workbook.mjs \
  /absolute/path/to/repository /absolute/path/to/output
```

The builder recalculates all scenario changes, asserts parity, restores blank inputs, scans formulas, renders QA views and exports the workbook. Temporary `examples/scenarios.json` is generated and git-ignored; the committed fixture definitions are the source.

## Not verified

- Native Google Sheets import/recalculation in the organisers' actual account. The workbook uses common spreadsheet formulas and includes an installation dry-run procedure, but a local engine check is not a native Google Sheets run.
- Actual Zap sender behaviour, incoming replies, task allowance, template approvals or provider delivery receipts.
- Real duplicate phone-number reconciliation, attendance, baseline quality, effort completeness, independent handover or privacy approval.
- Whether either real-world event has taken place. No real volunteer data or event results were supplied.

Spreadsheet input checks are not an access-control boundary. The offline checker enforces exact CSV headers and stricter identifier syntax; organisers must protect formula cells and audit named Sheet versions. Human attestations and written approval evidence remain necessary. An all-green synthetic fixture just proves that a sufficiently complete passing input can pass this scoring contract.
