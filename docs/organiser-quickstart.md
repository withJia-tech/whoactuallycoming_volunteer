# Run the two-event pilot

Use the existing restricted Google Sheet and existing Zapier → WhatsApp workflow. The kit calculates results; it does not send messages. Read the [detailed guide](organiser-guide.md) for field definitions and imports.

**Before sends**

- Complete [human decisions](decisions.md): event dates, baseline, thresholds, subgroup minimum/scope, second organiser, account/privacy owners, sender and translations. All remain pending until confirmed.
- Import the template tabs into the existing sheet with live triggers paused. Keep one canonical event roster, not a second list. Never connect synthetic records to live sends.
- Resolve duplicate mobile numbers privately, assign stable pseudonyms and one primary slot/person. Enter every role requirement. Freeze the intended count and protocol in Sheet version history.
- Check the private message on both organisers' phones. The second organiser runs the dry run independently.

**At each event**

- Send the approved private confirmation through the existing workflow. Reconcile each intended row against the WhatsApp sender step in Zap history. Failed sends stay in the denominator.
- Freeze clear yes/no replies at the deadline. `none` means checked silence; unresolved replies are `conflict` or `unknown`. Read role shortfalls and refill manually. Add replacement volunteers as `late`.
- Record all organisers' chasing/nudge minutes and other effort. On site, record attendance for everyone, including silent volunteers. Keep late replies separate from deadline confirmations.
- At T+1, reconcile inputs and mark completion. The second organiser must run the ground event without help. Confirm that no parallel roster exists.

**Evaluate**

- Resolve input CHECKs. Read Scorecard and Subgroups; use the offline checker for an independent calculation if available.
- Missing/conflicting evidence is BLOCKED; zero denominators and small subgroups are INCONCLUSIVE. Both prevent a pass. Never adjust thresholds after seeing results.
- Record both events' results and the next decision. A pass supports reviewing one evidenced bottleneck; it does not require an application.
- Retain permitted aggregate results; delete per-person records, copies and mappings within one month under the approved retention process.
