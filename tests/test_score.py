import csv
import tempfile
import unittest
from copy import deepcopy
from pathlib import Path
from pilot.score import evaluate, rate, subgroup_results, load, PASS, FAIL, BLOCKED, INCONCLUSIVE
from tests.fixtures import success, scenarios, silence, duplicate


class MeasurementTests(unittest.TestCase):
    def setUp(self):
        self.data = success()

    def scored(self):
        return evaluate(self.data)

    def test_success_both_events_all_tests(self):
        report = self.scored()
        self.assertEqual(PASS, report["gate"])
        self.assertEqual(PASS, report["T5"]["status"])
        self.assertEqual(65, report["events"][0]["counts"]["total_minutes"])
        for e in report["events"]:
            self.assertTrue(all(t["status"] == PASS for t in e["tests"].values()))

    def test_18_of_20_is_90_percent_never_111(self):
        report = evaluate(scenarios()["dropped_messages"])
        e = report["events"][0]
        self.assertEqual({"numerator": 18, "denominator": 20, "value": .9, "status": FAIL, "reason": ""}, e["tests"]["T0"])
        for t in ("T1", "T3", "T4", "T6"):
            self.assertEqual(BLOCKED, e["tests"][t]["status"])
        self.assertEqual(PASS, e["tests"]["T2"]["status"])
        self.assertEqual(FAIL, report["gate"])
        regular_reply = next(g for g in e["subgroups"] if g["group"] == "regular" and g["metric"] == "T4")
        self.assertEqual(18, regular_reply["denominator"] + regular_reply["complement_denominator"])

    def test_same_run_cannot_count_twice(self):
        self.data["E1"][1]["run_ref"] = self.data["E1"][0]["run_ref"]
        self.assertEqual(BLOCKED, self.scored()["gate"])

    def test_success_requires_run_evidence(self):
        self.data["E1"][0]["run_ref"] = ""
        self.assertEqual(BLOCKED, self.scored()["gate"])

    def test_unknown_send_stays_in_denominator(self):
        self.data["E1"][0].update(send_status="unknown", run_ref="")
        e = self.scored()["events"][0]
        self.assertEqual((59, 60), (e["tests"]["T0"]["numerator"], e["tests"]["T0"]["denominator"]))

    def test_zero_confirmations_inconclusive_not_divide_by_zero(self):
        report = evaluate(scenarios()["zero_confirmations"])
        self.assertEqual(INCONCLUSIVE, report["events"][0]["tests"]["T1"]["status"])
        self.assertIsNone(report["events"][0]["tests"]["T1"]["value"])
        self.assertEqual(INCONCLUSIVE, report["gate"])

    def test_zero_intended_never_passes(self):
        self.assertEqual(INCONCLUSIVE, rate(0, 0, "1")["status"])
        self.data["E1"] = []
        self.data["events"][0]["intended_count"] = "0"
        self.assertEqual(BLOCKED, self.scored()["gate"])

    def test_silent_attendees_do_not_inflate_t1(self):
        for r in self.data["E1"][:2]:
            silence(r, "yes")
        self.data["E1"][2]["attended"] = "no"
        e = self.scored()["events"][0]
        self.assertEqual((57, 58), (e["tests"]["T1"]["numerator"], e["tests"]["T1"]["denominator"]))
        self.assertEqual(FAIL, e["tests"]["T3"]["status"])
        self.assertEqual(28, e["roles"][0]["confirmed"])
        self.assertEqual(2, e["roles"][0]["shortfall"])

    def test_late_reply_is_not_deadline_confirmation_or_never_replied(self):
        silence(self.data["E1"][0], "yes", "yes")
        e = self.scored()["events"][0]
        self.assertEqual(59, e["counts"]["confirmed"])
        self.assertEqual(0, e["counts"]["silent_came"])
        self.assertEqual(59, e["counts"]["replied"])

    def test_conflict_blocks_then_resolved_decline_counts_for_t4(self):
        self.data["E1"][0]["reply_at_deadline"] = "conflict"
        self.assertEqual(BLOCKED, self.scored()["gate"])
        self.data["E1"][0]["reply_at_deadline"] = "no"
        e = self.scored()["events"][0]
        self.assertEqual(59, e["counts"]["confirmed"])
        self.assertEqual(60, e["counts"]["replied"])

    def test_emoji_and_voice_yes_count(self):
        self.data["E1"][0]["reply_form"] = "emoji"
        self.data["E1"][1]["reply_form"] = "voice"
        self.assertEqual(PASS, self.scored()["gate"])

    def test_duplicate_is_blocked_until_linked_and_reconciled(self):
        duplicate(self.data)
        self.assertEqual(BLOCKED, self.scored()["gate"])
        self.data = success()
        duplicate(self.data, True)
        e = self.scored()["events"][0]
        self.assertEqual(PASS, self.scored()["gate"])
        self.assertEqual(60, e["counts"]["intended"])
        self.assertEqual(1, e["counts"]["duplicates_excluded"])

    def test_duplicate_cannot_point_to_itself_or_missing_or_different_contact(self):
        for target in ("DUP-001", "missing", "R002"):
            with self.subTest(target=target):
                self.data = success()
                duplicate(self.data, True)
                self.data["E1"][-1]["duplicate_of"] = target
                self.assertEqual(BLOCKED, self.scored()["gate"])

    def test_different_slot_same_person_requires_manual_resolution(self):
        self.data["E1"][30]["contact_key"] = self.data["E1"][0]["contact_key"]
        self.assertEqual(BLOCKED, self.scored()["gate"])

    def test_missing_data_not_converted_to_no(self):
        for field in ("attended", "reply_at_deadline", "experience", "language", "send_status", "nudge_count"):
            with self.subTest(field=field):
                self.data = success()
                self.data["E1"][0][field] = ""
                self.assertEqual(BLOCKED, self.scored()["gate"])

    def test_tiny_subgroup_cannot_clear_fairness_gate(self):
        report = evaluate(scenarios()["small_subgroup"])
        self.assertEqual(INCONCLUSIVE, report["events"][0]["tests"]["T6"]["status"])
        self.assertEqual(INCONCLUSIVE, report["gate"])

    def test_subgroup_disparity_visible_despite_overall_showup_pass(self):
        report = evaluate(scenarios()["subgroup_disparity"])
        e = report["events"][0]
        self.assertEqual(PASS, e["tests"]["T1"]["status"])
        self.assertEqual(FAIL, e["tests"]["T6"]["status"])
        ms = next(g for g in e["subgroups"] if g["group"] == "MS" and g["metric"] == "T1")
        self.assertEqual((16, 20, 40, 40, 20), tuple(ms[k] for k in ("numerator", "denominator", "complement_numerator", "complement_denominator", "gap_pp")))

    def test_exact_15pp_passes_greater_than_15_fails(self):
        ms = [r for r in self.data["E1"] if r["language"] == "MS"]
        for r in ms[:3]:
            r["attended"] = "no"
        self.assertEqual(PASS, self.scored()["events"][0]["tests"]["T6"]["status"])
        ms[3]["attended"] = "no"
        self.assertEqual(FAIL, self.scored()["events"][0]["tests"]["T6"]["status"])

    def test_metric_specific_subgroup_denominator(self):
        ms = [r for r in self.data["E1"] if r["language"] == "MS"]
        for r in ms[:11]:
            r["reply_at_deadline"] = "no"
        groups = self.scored()["events"][0]["subgroups"]
        states = {g["metric"]: g["status"] for g in groups if g["group"] == "MS"}
        self.assertEqual({"T1": INCONCLUSIVE, "T4": PASS}, states)

    def test_zero_baseline_inconclusive_missing_baseline_blocked(self):
        self.data["events"][0]["baseline_minutes"] = "0"
        self.assertEqual(INCONCLUSIVE, self.scored()["events"][0]["tests"]["T2"]["status"])
        self.data["events"][0]["baseline_minutes"] = ""
        self.assertEqual(BLOCKED, self.scored()["gate"])

    def test_nudges_count_and_setup_is_reported_separately(self):
        self.data["E1"][0]["nudge_count"] = "1"
        self.assertEqual(BLOCKED, self.scored()["gate"])
        self.data["effort"].append({"entry_id": "EXTRA", "event_id": "E1", "organiser": "other", "activity": "nudge", "minutes": "21"})
        e = self.scored()["events"][0]
        self.assertEqual(61, e["counts"]["chasing_minutes"])
        self.assertEqual(FAIL, e["tests"]["T2"]["status"])

    def test_effort_incomplete_or_missing_zero_entry_blocks(self):
        self.data["effort"] = []
        self.assertEqual(BLOCKED, self.scored()["gate"])

    def test_half_time_and_70pct_boundaries(self):
        self.data["effort"][0]["minutes"] = "60"
        for r in self.data["E1"][:18]:
            silence(r)
        e = self.scored()["events"][0]
        self.assertEqual(PASS, e["tests"]["T2"]["status"])
        self.assertEqual(PASS, e["tests"]["T4"]["status"])
        self.assertEqual(PASS, rate(8, 10, "0.8")["status"])

    def test_both_lanes_not_pooled(self):
        report = evaluate(scenarios()["chasing_exceeds_half"])
        self.assertEqual(FAIL, report["T5"]["status"])
        self.data["events"][1]["lane"] = "onePA"
        self.assertEqual(BLOCKED, self.scored()["gate"])

    def test_handover_no_help_required(self):
        self.data["events"][1]["independent"] = "no"
        self.assertEqual(FAIL, self.scored()["events"][1]["tests"]["T7"]["status"])
        self.data["events"][1]["independent"] = "unknown"
        self.assertEqual(BLOCKED, self.scored()["gate"])

    def test_ground_must_be_run_by_second_organiser(self):
        self.data["events"][1]["operator"] = "primary"
        self.assertEqual(FAIL, self.scored()["gate"])

    def test_swapped_event_lanes_are_not_the_declared_sequence(self):
        self.data["events"][0]["lane"] = "ground"
        self.data["events"][1]["lane"] = "onePA"
        self.assertEqual(BLOCKED, self.scored()["gate"])

    def test_second_list_fails_handover(self):
        self.data["events"][1]["no_parallel_list"] = "no"
        self.assertEqual(FAIL, self.scored()["gate"])

    def test_approval_pending_or_after_sends_blocks(self):
        self.data["settings"]["thresholds_approved"] = "pending"
        self.assertEqual(BLOCKED, self.scored()["gate"])
        self.data["settings"]["thresholds_approved"] = "yes"
        self.data["settings"]["approved_on"] = "2026-12-09"
        self.assertEqual(BLOCKED, self.scored()["gate"])

    def test_invalid_numbers_do_not_pass(self):
        for value in ("NaN", "inf", "-1", "abc"):
            with self.subTest(value=value):
                self.data = success()
                self.data["settings"]["t1_min"] = value
                self.assertEqual(BLOCKED, self.scored()["gate"])

    def test_orphan_event_and_slot_rejected(self):
        self.data["slots"][0]["event_id"] = "E3"
        self.assertEqual(BLOCKED, self.scored()["gate"])
        self.data = success()
        self.data["E1"][0]["slot_id"] = "missing"
        self.assertEqual(BLOCKED, self.scored()["gate"])

    def test_late_replacement_only_changes_day_of_staffing(self):
        r = deepcopy(self.data["E1"][0])
        r.update(record_id="LATE-001", contact_key="SYN-100", disposition="late", marked_to_send="no",
                 send_status="not_sent", run_ref="", reply_at_deadline="none", reply_form="none")
        self.data["E1"].append(r)
        e = self.scored()["events"][0]
        self.assertEqual(60, e["counts"]["intended"])
        self.assertEqual(30, e["roles"][0]["confirmed"])
        self.assertEqual(31, e["roles"][0]["attended"])
        self.assertEqual(0, e["roles"][0]["actual_shortfall"])

    def test_shortfall_floored_at_zero_and_requirement_missing_blocks(self):
        self.data["slots"][0]["required"] = "20"
        self.assertEqual(0, self.scored()["events"][0]["roles"][0]["shortfall"])
        self.data["slots"][0]["required"] = ""
        self.assertEqual(BLOCKED, self.scored()["gate"])

    def test_input_order_does_not_change_scores(self):
        before = self.scored()
        self.data["E1"].reverse()
        self.data["effort"].reverse()
        self.assertEqual(before, self.scored())

    def test_frozen_count_detects_deleted_roster_record(self):
        self.data["E1"].pop()
        self.assertEqual(BLOCKED, self.scored()["gate"])

    def test_committed_fixture_loads(self):
        data = load(Path("examples/synthetic"))
        self.assertEqual(PASS, evaluate(data)["gate"])

    def test_csv_schema_rejects_identity_columns(self):
        from pilot.score import read_csv, ROSTER_FIELDS
        with tempfile.TemporaryDirectory() as d:
            path = Path(d)/"E1.csv"
            path.write_text(",".join(ROSTER_FIELDS + ["mobile"]) + "\n")
            with self.assertRaises(ValueError):
                read_csv(path, ROSTER_FIELDS)


if __name__ == "__main__":
    unittest.main()
