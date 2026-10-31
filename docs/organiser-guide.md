# Second-organiser guide

This is a two-event experiment, not a new volunteer service. Work in the existing restricted Google Sheet. The supplied workbook adds measurements; the existing Zapier → WhatsApp setup remains operated by the organiser. No script in this repository sends anything.

## Before the first event

1. Read and complete [decisions.md](decisions.md) with the responsible owner. Choose E1 onePA and E2 ground. Record P0 yeses, attendees, people chased and chasing minutes using the same definition for both event comparisons; explain event-size/complexity differences in the restricted decision record. Ask 3–5 recent no-shows what got in the way, record categories only, and continue only if at least half cite soft yes, forgetting or time/place confusion.
2. Download `templates/Pilot_Measurement_Kit.xlsx`. In Google Sheets, import its sheets into the **existing restricted workbook**. Do not import into or overwrite live Zap trigger ranges. Coordinate with the account owner to pause the existing trigger during import/dry run; reconnect it only after field mappings have been checked. The kit itself has no Zap connection.
3. Use E1 and E2 as the canonical event tabs, extending the existing event roster in place. Keep the current first-name/mobile fields privately if needed by the existing Zap. The measurement columns need only pseudonymous `contact_key` values. Do not maintain a second identity roster or another Notes/chat list. Export only the named measurement columns for local checking.
4. Check mobile numbers **before assigning keys**: remove spaces, hyphens and brackets; confirm country code (do not guess for ambiguous/international numbers), compare normalized numbers within the event and manually resolve shared phones. Keep one primary slot per person. Link duplicate intake rows to the canonical included row. The scorer detects equal keys, not two different keys accidentally assigned to the same phone.
5. Fill every required slot in Slots, including empty roles. Populate the original roster; set `marked_to_send=yes`. Independently count it into Events `intended_count`. Freeze this before the first send using the Sheet's existing version history (name the version `E1 before sends` / `E2 before sends`). Record requirements and the approved Settings in that version. This is a reference within the canonical sheet, not a parallel operational list.
6. Complete all pending decisions. Set approvals to yes only when their evidence exists. Use an approval date **before** either event's send date. Freeze the same thresholds for both events. If same-day approval is necessary, the date-only kit deliberately blocks: schedule earlier approval or approve a timestamp-based protocol revision before the pilot.
7. Have native speakers check the [message drafts](messages.md). Check the actual sender, reply inbox owner, task allowance and any sender/template approvals. Run controlled private test messages to the primary and second organisers through the **existing** workflow. Keep those test rows outside the pilot cohort. The second organiser should execute the instructions independently; record help honestly. Do not let synthetic fixtures reach live send triggers.

## Run each event

1. Send one private confirmation per frozen person with role, date/time, venue and reply deadline. For the normal event use the approved T−2/evening schedule; for a short-notice event send once roles are set with a 12-hour reply window. Resolve conflicts between T−2 and the weekday 7–9 pm preference in advance. Record actual send/deadline dates and time in Events, using ISO dates and Singapore time.
2. Reconcile every marked row against the successful **WhatsApp sender step** in Zap history. Record success/failed/unknown/not_sent and the run reference. A missing run is not success. Inspect failures immediately; log retries without adding another included row. Preserve the frozen denominator.
3. Read replies manually. At deadline record last clear yes/no, reply form, or explicit none; use conflict/unknown when evidence cannot be resolved. Do not turn uncertainty into silence. Name a Sheet version `E1 deadline` / `E2 deadline`. Review Slots: required minus confirmed is the role shortfall. Reopen silent/declined slots using the existing manual process. Enter replacement people as `late`; do not edit the original cohort away.
4. If needed, give at most one nudge per person, record `nudge_count`, and log all organisers' nudge/chasing minutes in Effort. Also log reply logging, reconciliation, setup and handover separately. No activity: enter an explicit zero-minute row. A second organiser's work counts just as much as the primary organiser's.
5. At the event, check everyone in, including silent volunteers and those who declined. Use the existing printed desk list if required; reconcile it to the canonical sheet and securely dispose of it afterwards. Mark yes/no explicitly after reconciliation, not from unexplained blank ticks. Update `ever_replied` through event close without changing deadline replies. Record no-show reasons only as categories, never personal details.
6. At T+1, reconcile the original and late cohorts, run evidence, slots and all effort entries. Set `roster_frozen`, `records_complete` and `effort_complete` to yes only after checking. Record operator, whether help/rescue was needed, and whether there is only one canonical list. For E2 the operator must be `second`.

## Evaluate and hand over

Open Scorecard. Resolve CHECK rows in the input tabs. Read the numerator/denominator diagnostics, not just the status. A shortfall before final attendance reconciliation is provisional; verify duplicates and deadline replies before acting. Read Subgroups counts even if overall turnout looks good. Small groups remain inconclusive.

T5 is shown once across both events; all other tests are evaluated for each event. Do not change settings to turn results green. Record the approved protocol version, counts, failures, effort totals and final decision, even if the pilot fails. Use [scoring.md](scoring.md) to interpret what the result does and does not establish.

For an independent check, export these exact ranges as UTF-8 CSV (headers at row 1), without calculated check columns:

| CSV | Exported columns | Input capacity |
| --- | --- | --- |
| Settings.csv | A:B, rows 1–14 only | Fixed keys |
| Events.csv | A:Q, rows 1–3 only | E1 and E2 |
| E1.csv / E2.csv | A:P | 200 input rows per event |
| Slots.csv | A:I | 30 role slots; computed F:I may be blank or exported, checker recalculates them |
| Effort.csv | A:E | 100 effort entries |

Use the blank CSV headers in `templates/csv` as the exact schema. Exclude other columns, notes and identity data. Preserve leading zeroes and identifiers as text. Do not sort just one column; sort full records. Do not rename tabs, move headers, edit formula columns, insert rows or exceed workbook capacities. The offline checker supports larger CSVs, but the spreadsheet needs its ranges extended and verified first. Appended record IDs beyond capacity block the scorecard.

Someone with Python 3.10+ can run `python3 -m pilot.score /private/path/to/exports` from this repository. It prints aggregate results and row-number errors, with no identities. It runs offline. Do not upload real exports to GitHub or ChatGPT for checking. Compare its T0–T7 results with Scorecard; resolve any discrepancy before the decision. Full file validation by the checker is stronger than spreadsheet entry dropdowns.

Google Sheets import is compatible by design (basic formulas, no macros). Before using real data, verify a synthetic dry run: 20 intended, 18 successful sender steps gives T0 90% and FAIL; no confirmations gives T1 INCONCLUSIVE; unknown attendance gives BLOCKED. This installation-specific import check is still required; native Google Sheets execution was not available during kit creation.

After the pilot, retain approved aggregate results only and delete per-person rows within one month as in the original plan. Include exports, printed lists, key mappings, version-history retention and copies in the owner's deletion review. Check provider retention rather than assuming row deletion erases Zap/WhatsApp logs. Restrict small-subgroup counts to named organisers; do not publish potentially identifying cells. Remove departed organisers' access from Sheets, Zapier and the sender separately.
