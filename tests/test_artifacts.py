"""Check committed fixtures/templates stay aligned with the executable contract."""
import json
import unittest
from pathlib import Path
from pilot.score import evaluate, load
from tests.fixtures import scenarios


class ArtifactTests(unittest.TestCase):
    def test_explicit_scenario_outcomes(self):
        expected = {
            "all_pass": "PASS", "dropped_messages": "FAIL", "conflicting_reply": "BLOCKED",
            "silent_attendees": "FAIL", "duplicate_unresolved": "BLOCKED", "duplicate_resolved": "PASS",
            "subgroup_disparity": "FAIL", "small_subgroup": "INCONCLUSIVE", "zero_confirmations": "INCONCLUSIVE",
            "missing_attendance": "BLOCKED", "chasing_exceeds_half": "FAIL", "reply_rate_below_70": "FAIL",
            "confirmed_showup_below_80": "FAIL", "handover_needed_help": "FAIL", "pending_approvals": "BLOCKED",
        }
        for name, data in scenarios().items():
            with self.subTest(scenario=name):
                self.assertEqual(expected[name], evaluate(data)["gate"])

    def test_committed_results_reproduce(self):
        saved = json.loads(Path("examples/scenario-results.json").read_text())
        self.assertEqual(saved, {name: evaluate(data) for name, data in scenarios().items()})

    def test_blank_template_never_claims_approval(self):
        blank = load(Path("templates/csv"))
        self.assertEqual("pending", blank["settings"]["thresholds_approved"])
        self.assertEqual("pending", blank["settings"]["operations_approved"])
        self.assertEqual("BLOCKED", evaluate(blank)["gate"])
        self.assertEqual([], blank["E1"])
        self.assertEqual([], blank["E2"])

    def test_synthetic_only_contact_keys(self):
        for event in ("E1", "E2"):
            self.assertTrue(all(r["contact_key"].startswith("SYN-") for r in load(Path("examples/synthetic"))[event]))
