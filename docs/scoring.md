# Scoring contract — v1.2 proposed

This operationalises section 9 of *Who's Actually Coming.md*, implementation plan v1.1, uploaded 21 October 2026. Values below retain its proposed thresholds; the denominator, missing-data and subgroup conventions are explicit clarifications requiring approval before use. Neither the kit nor synthetic test results approve the pilot.

## Populations and time cutoffs

Use **one canonical row per volunteer per event, with one primary role/slot** for this experiment. This makes volunteer counts and staffing counts agree. If a volunteer has multiple or overlapping assignments, resolve the primary assignment before freezing; do not silently treat two sign-ups as two people. Additional assignments require an agreed protocol extension, not an extra included row. The same person in E1 and E2 is valid and counted independently in each event.

Before any sends, reconcile duplicate phone numbers in the existing private sheet, freeze the intended roster and record its independently counted `intended_count`. Every `include` row remains marked `yes`, including failed or unattempted sends. Removing a failed send from the denominator is prohibited. Record all required role slots, including slots with no volunteers. Do not reduce requirements after observing replies.

The **deadline snapshot** owns T1/T4 and deadline shortfalls. At the agreed Singapore-time deadline, transcribe the last clear reply received on or before that deadline. `yes` includes 1, ok, can, an affirmative emoji or a voice note interpreted by the organiser; `no` includes 2 or an unambiguous decline. A timestamped yes followed by a timestamped no before the deadline is `no`. Contradictory replies with uncertain order, timing or meaning are `conflict`, never an arbitrary “last row wins.” Keep a categorical correction record through the Sheet's existing version history; do not copy chat text. Human interpretation is required; the checker does not interpret messages.

`none` means the organiser checked the reply channel and found no reply **by the deadline**. Blank or `unknown` means unobserved, not silence. Freeze `reply_at_deadline` and `reply_form`; do not overwrite them with late replies or event-day attendance. `ever_replied` records whether any reply arrived from send time through event close. Thus a late yes can change `ever_replied` to yes without improving T1/T4. Attendance is an explicit yes/no for every canonical row, including declines and silent volunteers, at event close. Unknown attendance blocks evaluation. Do not equate an unticked, unreconciled sheet with confirmed absence.

`late` rows are replacement volunteers added after the frozen cohort. They contribute to actual staffing only, not T0–T4 or T6. Their deadline reply is `none`, send status `not_sent`, marked flag `no`; no new automated sending is introduced. Replacing a dropout cannot retroactively improve the original cohort's attendance rate.

## Status rules

- **PASS:** the required evidence is complete and the proposed/approved threshold is met.
- **FAIL:** a valid observation misses a threshold or the handover conditions.
- **INCONCLUSIVE:** valid inputs cannot support the comparison (e.g. zero confirmations, zero baseline effort or insufficient subgroup denominators).
- **BLOCKED:** missing, contradictory, invalid or unapproved inputs, or failed prerequisite delivery.

The checker conservatively blocks all event tests if its input validation fails. Resolve the listed row/field errors; do not impute values to obtain a score. Valid counts for unaffected events remain available. T0 failure leaves T2 and T7 assessable, but blocks interpretation of T1, T3, T4 and T6. Diagnostic numbers for these may still be shown; they are not acceptance results.

For combined evidence, a known FAIL takes precedence, then BLOCKED, then INCONCLUSIVE, then PASS. Pending/late human approvals always make the **final pilot gate BLOCKED**, with the observed outcome retained separately by the checker. All tests for both events must pass. No averaging or pooling can rescue a failing event.

## T0–T7

| Test | Exact calculation / evidence | Proposed pass rule | Edge cases |
| --- | --- | --- | --- |
| T0 Pipe | Distinct intended confirmations with successful sender-step evidence by the reply deadline / all frozen intended confirmations | 100% | 18/20 = 90%. Unknown, failed and not-sent messages remain in the denominator. One successful run reference per canonical confirmation; replaying a run is not another success. Zero intended records cannot pass. |
| T1 Show-up | Confirmed-by-deadline volunteers who attended / all confirmed-by-deadline volunteers | ≥80% | Count attendance **within the confirmed cohort**. Zero confirmations = INCONCLUSIVE. Silent/declining attendees are excluded from this numerator. |
| T2 Chasing | Sum of all organisers' chasing and nudge minutes / comparable P0 chasing minutes | ≤0.50 | Baseline 0 = INCONCLUSIVE; blank = BLOCKED. An explicit zero effort entry is required for no chasing. Setup, reply logging, reconciliation and handover remain visible in total effort. |
| T3 Silence | Number of original cohort members with `ever_replied=no` who attended | ≤1 per event | Deadline silence followed by a late reply is reported through the roster but is not “never replied.” Unknown reply monitoring or attendance blocks scoring. |
| T4 Reply rate | Successfully sent original confirmations receiving a clear yes or no by the deadline / successful original confirmations | ≥70% | At T0=100%, denominator equals intended cohort. Count each person once. Late replies and unresolved conflicts never become timely replies. Zero successful sends has no rate and cannot pass. |
| T5 Both lanes | T1–T4 separately for one onePA event and one ground event | All eight event/test results PASS | This is a cross-event test, displayed once. A missing/wrong lane blocks the pilot; do not pool the events. |
| T6 Subgroups | T1 and T4 separately for regular/first-time volunteers and each predeclared message language; compare each group with everyone else **in that event and dimension** | No adequately measured group more than 15 percentage points below its complement | See minimum-denominator rule below. This measures process differences, not volunteer reliability. |
| T7 Handover | Event 2 (ground) message step run by the second organiser independently; both events operated without primary-organiser rescue and with one canonical list | Evidence explicitly recorded as yes | Unknown = BLOCKED; help/rescue, a second roster, or primary organiser running ground event = FAIL. E1 records independent execution, not a second handover requirement. |

T0 is **successful sender execution**, the evidence specified by the plan. A successful Zap trigger alone is insufficient: verify the WhatsApp send action. Even a successful sender step is not proof of handset delivery, reading or comprehension. Do not label it a receipt-confirmed delivery rate. If the connector provides delivery receipts, note their availability in the private decision record; do not silently change the T0 evidence standard between events.

For retries, retain the original intended confirmation and its failed-run evidence in existing Zap history. Record one final successful confirmation run by the deadline; do not create another cohort row. A success after the deadline cannot fix T0 for that event. Nudges never enter the T0 numerator/denominator and their time must be logged. A duplicated successful send is an operational deviation to investigate even if coverage is 100%.

## Small subgroups

The new **proposed** minimum is 10 observations in the group **and** 10 in its complement, for each metric separately. T1 denominators are confirmed volunteers; T4 denominators are successful sends. A 20-person language group with only 9 confirmations can support a T4 comparison but cannot clear T1 fairness.

Report numerator/denominator and percentage-point gap internally. Gap = 100 × (complement rate − group rate); exactly 15 points passes, more than 15 fails. Do not compare display-rounded rates. The Python checker uses exact fractions; the spreadsheet normalises floating-point noise to 10 decimal places in percentage points, far below the resolution of a 200-person roster. A sufficiently sized failing comparison makes T6 FAIL even if other comparisons are too small. Otherwise any too-small or absent predeclared subgroup makes T6 INCONCLUSIVE, which keeps the build gate closed. Never silently drop an unfavourable or small group, pool event types or change the minimum after seeing results.

Declare the message languages before sending, using the canonical order EN, ZH, MS, TA and only those in scope (at least two for this test). TA needs a separately approved draft. A single-language pilot cannot establish the original language comparison: revise and approve scope prospectively instead of treating it as a pass. Regular and first-time groups are always required. The minimum of 10 is a pragmatic screening convention, **not** a power calculation or proof of equality. Two events support feasibility evidence, not a causal claim or population-wide fairness guarantee.

## Duplicate and missing-data rules

- Assign stable `V-001`-style keys after checking normalized mobile numbers privately. Equal numbers/sign-ups must not receive different keys. A shared household number needs human identity resolution, not automatic merging. The exported kit contains keys only.
- Retain a duplicate sign-up as `disposition=duplicate`, linked by `duplicate_of` to an included record with the same contact key and primary slot. It is excluded from all rates and staffing counts. Reconcile any activity into the canonical row first; a duplicate with its own send/reply/attendance evidence is blocked. No chained or self-referencing duplicates.
- Multiple active rows with the same contact key are blocked, including different slots. Duplicate row IDs, reused successful run references within an event, orphan slots/events and changed intended counts are blocked.
- Missing numeric cells are not zero. Counts must be nonnegative integers; minutes can be nonnegative decimals. NaN, infinity and negative values are invalid. Missing group labels cannot disappear from the comparison.
- No rows or zero intended participants do not demonstrate an intervention. Missing role requirements, dates, effort entries and completion attestations block evaluation.

Role shortfall at deadline = `MAX(0, required − confirmed original volunteers assigned to the slot)`. Actual shortfall = `MAX(0, required − attendees assigned to the slot)`, including late replacements and silent attendees. Overstaffing produces zero shortfall, never a negative shortage. Keep required, confirmed and actual counts so the floor does not hide excess capacity. A role shortfall is an operational action signal, not an invented ninth acceptance threshold.

## Interpreting the result

A T1 failure does not prove why someone missed the event, and a T4 failure does not prove the message failed to land. Investigate a smallest counterexample privately and record only the allowed reason category. Compare baseline turnout and **total** organiser effort alongside T0–T7: reducing chasing by moving the same work into logging is not automatically a benefit.

After two real, approved events pass, review the remaining measured bottleneck, time/cost, participant inclusion and evidence quality. If manual reply logging remains costly, a narrowly scoped reply write-back may be worth testing in the existing workflow. Specify a measurable improvement and a regression check against this kit before building. A pass does not require new software; a well-functioning manual process may be the right outcome. A fail/inconclusive result calls for investigation or an explicitly approved follow-up experiment, not relaxed retrospective thresholds.
