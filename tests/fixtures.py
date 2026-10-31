"""Entirely invented people and future example dates; not pilot observations."""
from copy import deepcopy
from pilot.score import DEFAULTS


def success():
    data = {"settings": {**DEFAULTS, "thresholds_approved": "yes", "operations_approved": "yes",
                         "approved_by": "SYNTHETIC-ONLY", "approved_on": "2026-12-01"},
            "events": [], "slots": [], "effort": []}
    for event, lane, day, sender in [("E1", "onePA", "10", "primary"), ("E2", "ground", "17", "second")]:
        data["events"].append(dict(zip(
            "event_id lane event_date send_date deadline_date deadline_time intended_count roster_frozen records_complete effort_complete baseline_yes baseline_attended baseline_chased baseline_minutes operator independent no_parallel_list".split(),
            [event, lane, f"2026-12-{day}", f"2026-12-{int(day)-2:02}", f"2026-12-{int(day)-1:02}", "19:00", "60", "yes", "yes", "yes", "60", "42", "30", "120", sender, "yes", "yes"])))
        data[event] = []
        for i in range(60):
            data[event].append({"record_id": f"R{i+1:03}", "contact_key": f"SYN-{i+1:03}",
                                "slot_id": "SETUP" if i < 30 else "PACK", "language": ["EN", "ZH", "MS"][i % 3],
                                "experience": "regular" if i % 2 == 0 else "first", "disposition": "include",
                                "duplicate_of": "", "marked_to_send": "yes", "send_status": "success",
                                "run_ref": f"SYN-{event}-RUN-{i+1:03}", "reply_at_deadline": "yes",
                                "reply_form": "text", "ever_replied": "yes", "attended": "yes",
                                "nudge_count": "0", "reason_category": ""})
        data["slots"] += [{"event_id": event, "slot_id": slot, "role": role, "start_time": time,
                           "required": "30", "confirmed": "", "shortfall": "", "attended": "", "actual_shortfall": ""}
                          for slot, role, time in [("SETUP", "Setup", "09:00"), ("PACK", "Packing", "12:00")]]
        data["effort"] += [{"entry_id": f"{event}-TIME-{j}", "event_id": event, "organiser": sender,
                            "activity": activity, "minutes": minutes}
                           for j, (activity, minutes) in enumerate([("chasing", "40"), ("reply_logging", "15"), ("reconciliation", "10")])]
    return data


def silence(row, attended="no", ever="no"):
    row.update(reply_at_deadline="none", reply_form="none", ever_replied=ever, attended=attended)


def duplicate(data, resolved=False):
    row = deepcopy(data["E1"][0])
    row["record_id"] = "DUP-001"
    if resolved:
        row.update(disposition="duplicate", duplicate_of="R001", marked_to_send="no", send_status="not_sent",
                   run_ref="", reply_at_deadline="none", reply_form="none", ever_replied="no", attended="no")
    else:
        row["run_ref"] = "SYN-DUP-RUN"
    data["E1"].append(row)


def scenarios():
    cases = {"all_pass": success()}
    def case(name):
        cases[name] = success()
        return cases[name]
    d = case("dropped_messages")
    d["E1"] = d["E1"][:20]
    d["events"][0]["intended_count"] = "20"
    for r in d["E1"][:2]:
        r.update(send_status="failed", run_ref="")
        silence(r)
    d = case("conflicting_reply")
    d["E1"][0]["reply_at_deadline"] = "conflict"
    d = case("silent_attendees")
    for r in d["E1"][:2]:
        silence(r, "yes")
    duplicate(case("duplicate_unresolved"))
    duplicate(case("duplicate_resolved"), resolved=True)
    d = case("subgroup_disparity")
    for r in [r for r in d["E1"] if r["language"] == "MS"][:4]:
        r["attended"] = "no"
    d = case("small_subgroup")
    for r in d["E1"][3:]:
        if r["language"] == "MS":
            r["language"] = "EN"
    d = case("zero_confirmations")
    for r in d["E1"]:
        r.update(reply_at_deadline="no", attended="no")
    d = case("missing_attendance")
    d["E1"][0]["attended"] = ""
    d = case("chasing_exceeds_half")
    d["effort"][0]["minutes"] = "61"
    d = case("reply_rate_below_70")
    for r in d["E1"][:19]:
        silence(r)
    d = case("confirmed_showup_below_80")
    for r in d["E1"][:13]:
        r["attended"] = "no"
    d = case("handover_needed_help")
    d["events"][1]["independent"] = "no"
    d = case("pending_approvals")
    d["settings"]["operations_approved"] = "pending"
    return cases
