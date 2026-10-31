# Who's actually coming? — pilot measurement kit

Test one confirmation rule at two real events using the **existing Google Sheet → Zapier → WhatsApp workflow**. This repository supplies a spreadsheet, scoring contract, offline checker and synthetic tests. It does not send messages, connect accounts, create a database or store real volunteer records.

**Status:** measurement kit, not a completed pilot. The supplied thresholds are proposals. No real event outcome or operational approval is asserted here.

1. Read the [second-organiser quickstart](docs/organiser-quickstart.md) and [field/import guide](docs/organiser-guide.md).
2. Download [Pilot_Measurement_Kit.xlsx](templates/Pilot_Measurement_Kit.xlsx). Import its tabs into the existing restricted Google Sheet, with the live Zap's triggers disabled during setup and dry runs. Do not create another operational roster.
3. Complete the [human decision checklist](docs/decisions.md), then freeze the protocol before sends.
4. Run the two events and evaluate [T0–T7](docs/scoring.md). The workbook calculates the results without scripts or add-ons.

For an independent local check, export the six input tabs as the [CSV templates](templates/csv/) describe and run Python 3.10+:

```sh
python3 -m unittest discover -v
python3 -m pilot.score examples/synthetic
python3 -m pilot.score /path/outside/repository/to/deidentified-exports
```

The checker uses only Python's standard library and makes no network calls. Exit code 0 means all gates passed for the supplied data, 1 means a non-passing outcome, and 2 means a file/schema error. Synthetic PASS is a test of the kit, not evidence that the intervention works.

The [scenario results](examples/scenario-results.json) demonstrate dropped messages, conflicting replies, silence, duplicate sign-ups, small groups and disparities. [Verification](docs/verification.md) records the checks and their limits. [Source notes](docs/source-and-changes.md) trace corrections to the October specification.

Keep real names, phone numbers, chat content and event exports out of this repository, issues, PRs and CI. Keep only permitted aggregate findings after the pilot. No volunteer reliability labels.
