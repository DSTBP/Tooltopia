"""Fixed-shape tests for the embedded Jiajun Huang deadline data."""

import json
from pathlib import Path
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
import update_jiajun_deadlines as updater  # noqa: E402


def page(records):
    return '<html><script type="application/json" id="ddl-data">' + json.dumps(records) + '</script></html>'


def record(acronym, **changes):
    data = {
        "acronym": acronym, "cycle": None, "abstract": None,
        "deadline": None, "deadline_at": None,
        "submission_timezone": None, "notification": None,
        "milestones": None, "conf_start": None, "conf_end": None,
        "estimated": None, "rolling_cycles": None,
        "fullname": "must not be exported", "category": "must not be exported",
        "location": "must not be exported", "website": "https://example.com/"
    }
    data.update(changes)
    return data


class JiajunDeadlineTests(unittest.TestCase):
    def test_rounds_timezones_and_time_only_fields(self):
        records = [
            record("ICS '27", cycle="Round 1", deadline="2026-09-01",
                   notification="2026-10-01", conf_start="2027-06-01", conf_end="2027-06-04",
                   milestones=[{"label": "Rebuttal period", "start": "2026-09-10", "end": "2026-09-12"}]),
            record("ICS '27", cycle="Round 2", deadline="2026-11-01",
                   deadline_at="2026-11-01T17:00:00-08:00", submission_timezone="5pm PT"),
            record("NSDI '27", cycle="Fall", deadline="2026-09-17",
                   deadline_at="2026-09-17T23:59:00-04:00", submission_timezone="11:59pm US EDT"),
            record("NSDI '27", cycle="Spring", deadline="2026-04-23",
                   deadline_at="2026-04-23T23:59:00-04:00", submission_timezone="11:59pm US EDT"),
            record("SIGCOMM '27", deadline="tbd", conf_start="2027-08-08", conf_end="2027-08-12"),
            record("PREDICTED '27", deadline="2026-08-01", estimated=True),
        ]
        conferences = updater.build_payload(page(records))["conferences"]
        self.assertEqual(len(conferences), 3)
        ics = next(item for item in conferences if item["acronym"] == "ICS")
        self.assertEqual(ics["conferenceStart"], "2027-06-01")
        papers = [event for event in ics["events"] if event["type"] == "paper"]
        self.assertEqual({event["cycle"] for event in papers}, {"Round 1", "Round 2"})
        self.assertEqual(next(event for event in papers if event["cycle"] == "Round 1")["at"],
                         "2026-09-01T23:59:59-12:00")
        self.assertEqual(next(event for event in papers if event["cycle"] == "Round 2")["at"],
                         "2026-11-01T17:00:00-08:00")
        self.assertEqual(next(event for event in ics["events"] if event["type"] == "notification")["date"],
                         "2026-10-01")
        self.assertEqual(next(event for event in ics["events"] if event["type"] == "rebuttal")["endDate"],
                         "2026-09-12")
        nsdi = next(item for item in conferences if item["acronym"] == "NSDI")
        self.assertEqual(len(nsdi["events"]), 2)
        self.assertEqual(next(item for item in conferences if item["acronym"] == "SIGCOMM")["events"], [])
        self.assertNotIn("must not be exported", json.dumps(conferences))
        self.assertNotIn("website", json.dumps(conferences))

    def test_vldb_monthly_cycles_are_one_conference(self):
        cycles = [{"label": f"Month {number} cycle",
                   "abstract_at": f"2026-{number:02d}-01T17:00:00-07:00",
                   "deadline_at": f"2026-{number:02d}-02T17:00:00-07:00",
                   "notification_at": f"2026-{number:02d}-15T17:00:00-07:00"}
                  for number in range(1, 13)]
        conferences = updater.build_payload(page([record("VLDB '27", rolling_cycles=cycles)]))["conferences"]
        self.assertEqual(len(conferences), 1)
        self.assertEqual(len(conferences[0]["events"]), 36)
        self.assertEqual(len({event["cycle"] for event in conferences[0]["events"]}), 12)

    def test_failure_does_not_overwrite_previous_snapshot(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "jiajun-deadlines.json"
            output.write_text('{"previous":true}\n', encoding="utf-8")
            with self.assertRaises(ValueError):
                updater.update(output, "<html>no deadline data</html>")
            self.assertEqual(output.read_text(encoding="utf-8"), '{"previous":true}\n')

    def test_clock_labels(self):
        self.assertEqual(updater.dated_clock("2026-01-01", "23:59 UTC"), "2026-01-01T23:59:00+00:00")
        self.assertEqual(updater.dated_clock("2026-01-01", "5:59pm EST"), "2026-01-01T17:59:00-05:00")
        self.assertEqual(updater.dated_clock("2026-07-01", "5pm PT"), "2026-07-01T17:00:00-07:00")
        self.assertEqual(updater.dated_clock("2026-01-01", "5pm PT"), "2026-01-01T17:00:00-08:00")


if __name__ == "__main__":
    unittest.main()
