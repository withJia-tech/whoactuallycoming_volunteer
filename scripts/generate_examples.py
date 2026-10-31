"""Regenerate blank CSV templates and synthetic examples/report; standard library only."""
import csv
import json
from pathlib import Path
from pilot.score import DEFAULTS, ROSTER_FIELDS, EVENT_FIELDS, SLOT_FIELDS, EFFORT_FIELDS, evaluate
from tests.fixtures import success, scenarios


def write_csv(path, fields, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fields, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def write_dataset(directory, data):
    for name, fields, rows in [("Settings", ["setting", "value"], [{"setting": k, "value": v} for k, v in data["settings"].items()]),
                               ("Events", EVENT_FIELDS, data["events"]), ("Slots", SLOT_FIELDS, data["slots"]),
                               ("Effort", EFFORT_FIELDS, data["effort"]), ("E1", ROSTER_FIELDS, data["E1"]), ("E2", ROSTER_FIELDS, data["E2"])]:
        write_csv(directory/f"{name}.csv", fields, rows)


def main():
    root = Path(__file__).resolve().parents[1]
    write_dataset(root/"examples/synthetic", success())
    empty_events = [{k: "" for k in EVENT_FIELDS} for _ in range(2)]
    for e, eid, lane in zip(empty_events, ["E1", "E2"], ["onePA", "ground"]):
        e.update(event_id=eid, lane=lane, roster_frozen="no", records_complete="no", effort_complete="no", independent="unknown", no_parallel_list="unknown")
    blank = {"settings": DEFAULTS, "events": empty_events, "slots": [], "effort": [], "E1": [], "E2": []}
    write_dataset(root/"templates/csv", blank)
    output = {name: evaluate(data) for name, data in scenarios().items()}
    (root/"examples/scenario-results.json").write_text(json.dumps(output, indent=2, ensure_ascii=False, allow_nan=False)+"\n")
    (root/"examples/scenarios.json").write_text(json.dumps(scenarios(), indent=2, ensure_ascii=False)+"\n")
    print(f"Generated {len(output)} synthetic scenarios and six CSV input templates")


if __name__ == "__main__":
    main()
