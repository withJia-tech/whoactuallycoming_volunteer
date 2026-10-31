"""Score frozen, de-identified CSV exports. See docs/scoring.md for the contract."""
import argparse
import csv
import json
import math
import re
from datetime import date
from fractions import Fraction
from pathlib import Path

PASS, FAIL, BLOCKED, INCONCLUSIVE = "PASS", "FAIL", "BLOCKED", "INCONCLUSIVE"
ROSTER_FIELDS = "record_id contact_key slot_id language experience disposition duplicate_of marked_to_send send_status run_ref reply_at_deadline reply_form ever_replied attended nudge_count reason_category".split()
EVENT_FIELDS = "event_id lane event_date send_date deadline_date deadline_time intended_count roster_frozen records_complete effort_complete baseline_yes baseline_attended baseline_chased baseline_minutes operator independent no_parallel_list".split()
SLOT_FIELDS = "event_id slot_id role start_time required confirmed shortfall attended actual_shortfall".split()
EFFORT_FIELDS = "entry_id event_id organiser activity minutes".split()
SETTINGS_FIELDS = ["setting", "value"]
DEFAULTS = {
    "t0_min": "1", "t1_min": "0.8", "t2_max_ratio": "0.5",
    "t3_max": "1", "t4_min": "0.7", "t6_max_gap": "0.15",
    "subgroup_min": "10", "languages": "EN|ZH|MS",
    "thresholds_approved": "pending", "operations_approved": "pending",
    "approved_by": "", "approved_on": "", "protocol_version": "1.2-proposed",
}
REASONS = {"", "soft_yes", "forgot", "time_place", "clash", "travel", "personal", "unknown", "silent_but_came"}
ACTIVITIES = {"chasing", "nudge", "reply_logging", "reconciliation", "setup", "handover"}


def result(status, numerator=None, denominator=None, reason=""):
    return {"status": status, "numerator": numerator, "denominator": denominator,
            "value": numerator / denominator if denominator else None, "reason": reason}


def combine(states):
    """A known failure remains visible even when other evidence is incomplete."""
    states = list(states)
    for state in (FAIL, BLOCKED, INCONCLUSIVE):
        if state in states:
            return state
    return PASS if states else INCONCLUSIVE


def number(value):
    try:
        n = float(value)
        return n if math.isfinite(n) and n >= 0 else None
    except (TypeError, ValueError):
        return None


def integer(value):
    n = number(value)
    return n if n is not None and n.is_integer() else None


def valid_date(value):
    try:
        return date.fromisoformat(value) if len(value) == 10 else None
    except (TypeError, ValueError):
        return None


def settings_errors(settings):
    errors = []
    if set(settings) != set(DEFAULTS):
        errors.append("Settings keys must match the supplied template")
    for key in ("t0_min", "t1_min", "t2_max_ratio", "t4_min", "t6_max_gap"):
        value = number(settings.get(key))
        if value is None or value > 1:
            errors.append(f"Invalid setting: {key}")
    for key in ("t3_max", "subgroup_min"):
        if integer(settings.get(key)) is None:
            errors.append(f"Invalid setting: {key}")
    if number(settings.get("subgroup_min")) == 0:
        errors.append("subgroup_min must be positive")
    if number(settings.get("t0_min")) != 1:
        errors.append("T0 must remain 100% for downstream interpretation")
    langs = settings.get("languages", "").split("|")
    if len(langs) < 2 or len(set(langs)) != len(langs) or any(x not in {"EN", "ZH", "MS", "TA"} for x in langs):
        errors.append("Predeclare at least two distinct message languages from EN|ZH|MS|TA")
    elif langs != [lang for lang in ["EN", "ZH", "MS", "TA"] if lang in langs]:
        errors.append("Use canonical language order EN|ZH|MS|TA")
    if not settings.get("protocol_version"):
        errors.append("Missing protocol_version")
    for key in ("thresholds_approved", "operations_approved"):
        if settings.get(key) not in {"pending", "yes", "no"}:
            errors.append(f"Invalid setting: {key}")
    return errors


def validate_event(event, rows, slots, effort, settings):
    """Return structural/data errors; never include person identifiers in diagnostics."""
    errors = []
    for k in ("event_date", "send_date", "deadline_date"):
        if not valid_date(event.get(k, "")):
            errors.append(f"Missing/invalid {k}")
    if not errors and event["deadline_date"] > event["event_date"]:
        errors.append("Deadline follows event date")
    if valid_date(event.get("send_date", "")) and valid_date(event.get("deadline_date", "")) and event["send_date"] > event["deadline_date"]:
        errors.append("Send date follows deadline")
    time = event.get("deadline_time", "")
    if len(time) != 5 or time[2:3] != ":" or not time.replace(":", "").isdigit() or not (time[:2] <= "23" and time[3:] <= "59"):
        errors.append("Invalid deadline_time; use 24-hour HH:MM Singapore time")
    for k in ("intended_count", "baseline_yes", "baseline_attended", "baseline_chased"):
        if integer(event.get(k)) is None:
            errors.append(f"Missing/invalid {k}")
    if number(event.get("baseline_minutes")) is None:
        errors.append("Missing/invalid baseline_minutes")
    for k in ("baseline_attended", "baseline_chased"):
        if number(event.get(k)) is not None and number(event.get("baseline_yes")) is not None and float(event[k]) > float(event["baseline_yes"]):
            errors.append(f"{k} exceeds baseline_yes")
    for k in ("roster_frozen", "records_complete", "effort_complete"):
        if event.get(k) != "yes":
            errors.append(f"{k} must be explicitly yes at final evaluation")
    if event.get("operator") not in {"primary", "second"}:
        errors.append("Missing/invalid operator")
    if event.get("independent") not in {"yes", "no", "unknown"}:
        errors.append("Missing/invalid independence evidence")
    if event.get("no_parallel_list") not in {"yes", "no", "unknown"}:
        errors.append("Missing/invalid canonical-list check")
    languages = settings["languages"].split("|")
    ids = [r.get("record_id") for r in rows]
    if not rows or any(not x for x in ids) or len(ids) != len(set(ids)):
        errors.append("Roster is empty or record IDs are missing/duplicated")
    slot_ids = [s.get("slot_id") for s in slots]
    if not slots or any(not x for x in slot_ids) or len(slot_ids) != len(set(slot_ids)):
        errors.append("Role slots are empty or IDs are missing/duplicated")
    for s in slots:
        if integer(s.get("required")) is None or not s.get("role") or not s.get("start_time"):
            errors.append("Missing/invalid role requirement")
    active = [r for r in rows if r.get("disposition") in {"include", "late"}]
    contacts = [r.get("contact_key") for r in active]
    if len(contacts) != len(set(contacts)):
        errors.append("Duplicate active contact: resolve primary assignment before scoring")
    runs = [r.get("run_ref") for r in rows if r.get("send_status") == "success"]
    if len(runs) != len(set(runs)):
        errors.append("A successful run reference was reused across records")
    by_id = {r.get("record_id"): r for r in rows}
    for index, r in enumerate(rows, 2):
        bad = []
        # No names/numbers are required. Equal private numbers must map to equal keys.
        if not re.fullmatch(r"(?:V|SYN)-[0-9]+", r.get("contact_key", "")):
            bad.append("contact_key must be a V- or SYN- pseudonym")
        if r.get("slot_id") not in slot_ids:
            bad.append("unknown slot")
        for k, allowed in {
            "language": set(languages), "experience": {"regular", "first"},
            "disposition": {"include", "duplicate", "late"},
            "marked_to_send": {"yes", "no"},
            "send_status": {"success", "failed", "unknown", "not_sent"},
            "reply_at_deadline": {"yes", "no", "none", "conflict", "unknown"},
            "reply_form": {"text", "emoji", "voice", "none", "unknown"},
            "ever_replied": {"yes", "no", "unknown"},
            "attended": {"yes", "no", "unknown"},
            "reason_category": REASONS,
        }.items():
            if r.get(k) not in allowed:
                bad.append(f"missing/invalid {k}")
        if integer(r.get("nudge_count")) is None or number(r.get("nudge_count")) > 1:
            bad.append("nudge_count must be 0 or 1")
        disposition = r.get("disposition")
        if disposition == "duplicate":
            target = by_id.get(r.get("duplicate_of"), {})
            if target.get("disposition") != "include" or any(target.get(k) != r.get(k) for k in ("contact_key", "slot_id")):
                bad.append("duplicate must reference an included record with same contact and slot")
            if any(r.get(k) != v for k, v in {"marked_to_send": "no", "send_status": "not_sent", "reply_at_deadline": "none", "ever_replied": "no", "attended": "no", "nudge_count": "0"}.items()):
                bad.append("duplicate has activity: reconcile evidence into canonical row")
        else:
            if r.get("duplicate_of"):
                bad.append("unexpected duplicate_of")
            if r.get("attended") == "unknown":
                bad.append("attendance unobserved")
            if disposition == "include":
                if r.get("marked_to_send") != "yes":
                    bad.append("included roster must remain marked to send")
                if r.get("reply_at_deadline") in {"conflict", "unknown"} or r.get("ever_replied") == "unknown":
                    bad.append("reply evidence unresolved")
                if r.get("reply_at_deadline") in {"yes", "no"} and (r.get("ever_replied") != "yes" or r.get("reply_form") not in {"text", "emoji", "voice"}):
                    bad.append("reply evidence inconsistent")
                if r.get("reply_at_deadline") == "none" and r.get("reply_form") != "none":
                    bad.append("deadline silence must have reply_form none")
            if disposition == "late" and any(r.get(k) != v for k, v in {"marked_to_send": "no", "send_status": "not_sent", "reply_at_deadline": "none", "reply_form": "none", "nudge_count": "0"}.items()):
                bad.append("late replacement must not enter the frozen confirmation cohort")
        if r.get("send_status") == "success" and not r.get("run_ref"):
            bad.append("successful send needs run evidence")
        if r.get("send_status") == "not_sent" and r.get("run_ref"):
            bad.append("unsent row has a run reference")
        if bad:
            errors.append(f"Roster row {index}: " + "; ".join(bad))
    intended = sum(r.get("disposition") == "include" for r in rows)
    if number(event.get("intended_count")) != intended:
        errors.append("Frozen intended_count does not reconcile to included roster")
    eids = [x.get("entry_id") for x in effort]
    if not effort or any(not x for x in eids) or len(eids) != len(set(eids)):
        errors.append("Effort entries missing or IDs duplicated; log explicit zero minutes")
    for x in effort:
        if x.get("activity") not in ACTIVITIES or number(x.get("minutes")) is None or x.get("organiser") not in {"primary", "second", "other"}:
            errors.append("Missing/invalid effort activity, organiser or minutes")
    if any(number(r.get("nudge_count")) for r in rows) and not any(x.get("activity") == "nudge" and number(x.get("minutes")) and number(x.get("minutes")) > 0 for x in effort):
        errors.append("Nudges recorded without positive nudge minutes")
    return errors


def rate(n, d, threshold):
    return result(INCONCLUSIVE if d == 0 else PASS if Fraction(n, d) >= Fraction(threshold) else FAIL,
                  n, d, "Zero denominator" if d == 0 else "")


def subgroup_results(rows, settings):
    detail = []
    for dimension, groups in (("experience", ["regular", "first"]), ("language", settings["languages"].split("|"))):
        for group in groups:
            for metric in ("T1", "T4"):
                eligible = [r for r in rows if (r["reply_at_deadline"] == "yes" if metric == "T1" else r["send_status"] == "success")]
                a = [r for r in eligible if r[dimension] == group]
                b = [r for r in eligible if r[dimension] != group]
                success = lambda r: r["attended"] == "yes" if metric == "T1" else r["reply_at_deadline"] in {"yes", "no"}
                an, bn = sum(map(success, a)), sum(map(success, b))
                gap = Fraction(bn, len(b)) - Fraction(an, len(a)) if a and b else None
                enough = min(len(a), len(b)) >= int(float(settings["subgroup_min"]))
                state = INCONCLUSIVE if not enough else FAIL if gap > Fraction(settings["t6_max_gap"]) else PASS
                detail.append({"dimension": dimension, "group": group, "metric": metric,
                               "numerator": an, "denominator": len(a), "complement_numerator": bn,
                               "complement_denominator": len(b), "gap_pp": float(gap * 100) if gap is not None else None,
                               "status": state})
    return detail


def score_event(event, rows, slots, effort, settings):
    errors = validate_event(event, rows, slots, effort, settings)
    if errors:
        return {"event_id": event["event_id"], "errors": errors,
                "tests": {f"T{i}": result(BLOCKED, reason="Resolve data errors") for i in (0, 1, 2, 3, 4, 6, 7)},
                "subgroups": [], "roles": []}
    cohort = [r for r in rows if r["disposition"] == "include"]
    sent = [r for r in cohort if r["send_status"] == "success"]
    confirmed = [r for r in cohort if r["reply_at_deadline"] == "yes"]
    attended_confirmed = sum(r["attended"] == "yes" for r in confirmed)
    replied = sum(r["reply_at_deadline"] in {"yes", "no"} for r in sent)
    silent_came = sum(r["ever_replied"] == "no" and r["attended"] == "yes" for r in cohort)
    chasing = sum(float(e["minutes"]) for e in effort if e["activity"] in {"chasing", "nudge"})
    baseline = float(event["baseline_minutes"])
    tests = {"T0": rate(len(sent), len(cohort), settings["t0_min"]),
             "T1": rate(attended_confirmed, len(confirmed), settings["t1_min"]),
             "T2": result(INCONCLUSIVE if baseline == 0 else PASS if Fraction(str(chasing)) <= Fraction(settings["t2_max_ratio"]) * Fraction(str(baseline)) else FAIL, chasing, baseline, "Zero baseline" if baseline == 0 else ""),
             "T3": result(PASS if silent_came <= int(float(settings["t3_max"])) else FAIL, silent_came),
             "T4": rate(replied, len(sent), settings["t4_min"])}
    groups = subgroup_results(cohort, settings)
    tests["T6"] = result(combine(g["status"] for g in groups), reason="Group versus its complement; see counts")
    independent = event["independent"]
    tests["T7"] = result(BLOCKED if independent == "unknown" or event["no_parallel_list"] == "unknown" else
                          FAIL if independent == "no" or event["no_parallel_list"] == "no" or (event["lane"] == "ground" and event["operator"] != "second") else PASS,
                          reason="Ground event requires second organiser; both events require independent operation and one list")
    if tests["T0"]["status"] != PASS:
        for k in ("T1", "T3", "T4", "T6"):
            tests[k]["status"] = BLOCKED
            tests[k]["reason"] = "T0 did not pass; diagnostic counts only"
        for g in groups:
            g["status"] = BLOCKED
    role_results = []
    for s in slots:
        c = sum(r["slot_id"] == s["slot_id"] for r in confirmed)
        a = sum(r["slot_id"] == s["slot_id"] and r["attended"] == "yes" and r["disposition"] in {"include", "late"} for r in rows)
        need = int(float(s["required"]))
        role_results.append({"slot_id": s["slot_id"], "required": need, "confirmed": c,
                             "shortfall": max(0, need-c), "attended": a, "actual_shortfall": max(0, need-a)})
    return {"event_id": event["event_id"], "errors": [], "tests": tests, "subgroups": groups, "roles": role_results,
            "counts": {"intended": len(cohort), "successful_sends": len(sent), "confirmed": len(confirmed),
                       "attended_confirmed": attended_confirmed, "attended_original": sum(r["attended"] == "yes" for r in cohort),
                       "silent_came": silent_came, "replied": replied, "chasing_minutes": chasing,
                       "total_minutes": sum(float(e["minutes"]) for e in effort),
                       "duplicates_excluded": sum(r["disposition"] == "duplicate" for r in rows),
                       "late_replacements": sum(r["disposition"] == "late" for r in rows)}}


def evaluate(data):
    settings = data["settings"]
    errors = settings_errors(settings)
    events = data["events"]
    if len(events) != 2 or {(e.get("event_id"), e.get("lane")) for e in events} != {("E1", "onePA"), ("E2", "ground")}:
        errors.append("Require exactly E1 onePA and E2 ground, in the declared pilot sequence")
    if any(x.get("event_id") not in {"E1", "E2"} for x in data["slots"] + data["effort"]):
        errors.append("Orphan slot/effort event reference")
    if errors:
        return {"protocol_version": settings.get("protocol_version"), "gate": BLOCKED, "errors": errors, "events": [], "T5": result(BLOCKED)}
    scored = [score_event(e, data[e["event_id"]], [s for s in data["slots"] if s["event_id"] == e["event_id"]],
                          [x for x in data["effort"] if x["event_id"] == e["event_id"]], settings) for e in events]
    t5 = result(combine(e["tests"][k]["status"] for e in scored for k in ("T1", "T2", "T3", "T4")), reason="Both lanes; never pool the events")
    observed = combine([t5["status"]] + [t["status"] for e in scored for t in e["tests"].values()])
    approval_errors = []
    if any(settings[k] != "yes" for k in ("thresholds_approved", "operations_approved")) or not settings["approved_by"] or not valid_date(settings["approved_on"]):
        approval_errors.append("Human approvals are pending or incomplete")
    elif any(not valid_date(e["send_date"]) or settings["approved_on"] >= e["send_date"] for e in events):
        approval_errors.append("Approvals must be recorded on a date before either event's sends")
    return {"protocol_version": settings["protocol_version"], "gate": BLOCKED if approval_errors else observed,
            "observed_outcome": observed, "errors": approval_errors, "T5": t5, "events": scored,
            "interpretation": "Synthetic results do not establish real-world pilot success. A pass permits review of one next change, never automatic software approval."}


def read_csv(path, fields):
    with path.open(encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        if reader.fieldnames != fields:
            raise ValueError(f"{path.name}: headers do not match the template; do not export identity columns")
        rows = []
        for row in reader:
            if None in row or any(v is None for v in row.values()):
                raise ValueError(f"{path.name}: malformed row")
            if any(v.strip() for v in row.values()):
                rows.append({k: v.strip() for k, v in row.items()})
        return rows


def load(directory):
    settings_rows = read_csv(directory / "Settings.csv", SETTINGS_FIELDS)
    if len({r["setting"] for r in settings_rows}) != len(settings_rows):
        raise ValueError("Duplicate setting keys")
    return {"settings": {r["setting"]: r["value"] for r in settings_rows},
            "events": read_csv(directory / "Events.csv", EVENT_FIELDS),
            "slots": read_csv(directory / "Slots.csv", SLOT_FIELDS),
            "effort": read_csv(directory / "Effort.csv", EFFORT_FIELDS),
            **{event: read_csv(directory / f"{event}.csv", ROSTER_FIELDS) for event in ("E1", "E2")}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    args = parser.parse_args()
    try:
        report = evaluate(load(args.directory))
    except (ValueError, OSError) as exc:
        print(json.dumps({"gate": BLOCKED, "errors": [str(exc)]}, indent=2))
        return 2
    print(json.dumps(report, indent=2, ensure_ascii=False, allow_nan=False))
    return 0 if report["gate"] == PASS else 1


if __name__ == "__main__":
    raise SystemExit(main())
