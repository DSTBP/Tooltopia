"""Real source shapes for c01dkit and MPC deadline normalization."""

from pathlib import Path
import sys
import unittest


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
import update_ccf_external_deadlines as updater  # noqa: E402


class ExternalDeadlineTests(unittest.TestCase):
    def test_c01dkit_rounds_ranges_and_tentative(self):
        records = [{
            "publication": "IEEE S&P 2027", "timezone": "23:59:59 AoE (UTC-12)",
            "url": "https://example.com/cfp", "cycles": [
                {"name": "First deadline", "ddls": [
                    {"stage": "Abstract registration deadline", "date": "2026-06-04"},
                    {"stage": "Paper submission deadline", "date": "2026-06-11"},
                    {"stage": "Reviews released", "date": "2026-08-20"},
                    {"stage": "Author rebuttal period", "date": "2026-08-26 ~ 2026-09-04"},
                    {"stage": "Acceptance notification", "date": "2026-09-11"},
                ]},
                {"name": "Second deadline", "ddls": [
                    {"stage": "Paper submission deadline", "date": "2026-11-17"},
                ]},
            ]
        }, {
            "publication": "NDSS 2027", "cycles": [{
                "name": "Summer Cycle (Tentative)", "ddls": [
                    {"stage": "Paper submission deadline", "date": "2026-05-06"}]
            }]
        }]
        result = updater.normalize_c01dkit(records)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["acronym"], "S&P")
        events = result[0]["events"]
        self.assertEqual(events[0]["at"], "2026-06-04T23:59:59-12:00")
        self.assertEqual(events[2]["date"], "2026-08-20")
        self.assertNotIn("at", events[2])
        self.assertEqual(events[3]["endDate"], "2026-09-04")
        self.assertEqual(events[-1]["cycle"], "Round 2")

    def test_mpc_main_conference_not_poster_or_placeholder(self):
        base = {
            "name": "ACM CCS", "year": 2026,
            "tags": ["PRACT", "CNF"],
            "deadline": ["2026-01-14 23:59", "2026-04-29 23:59"],
            "abdeadline": "Jan 07, Apr 22",
            "rebut": "March 17-20, June 29 - July 01",
            "comment": "2 deadlines. Notifications - April 09, July 17.",
        }
        poster = {**base, "tags": ["PRACT", "PS"], "deadline": ["2026-07-23 23:59"]}
        predicted = {**base, "name": "ACM STOC", "tags": ["CNF", "EXPCFP"]}
        journal = {**base, "name": "ACM TOPS", "tags": ["JRN"],
                   "deadline": ["%y-12-31 23:59"]}
        result = updater.normalize_mpc([base, poster, predicted, journal])
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["acronym"], "CCS")
        events = result[0]["events"]
        self.assertEqual(len([item for item in events if item["type"] == "paper"]), 2)
        self.assertEqual(len([item for item in events if item["type"] == "notification"]), 2)
        self.assertEqual(len([item for item in events if item["type"] == "rebuttal"]), 2)
        self.assertEqual(events[0]["date"], "2026-01-07")
        self.assertEqual(events[1]["at"], "2026-01-14T23:59:00-12:00")
        self.assertEqual(events[2]["endDate"], "2026-03-20")

    def test_mpc_monthly_abstract_and_cross_year_rebuttal(self):
        records = [{
            "name": "VLDB", "year": 2027, "tags": ["CNF"],
            "deadline": ["2026-04-01 16:59", "2026-05-01 16:59"],
            "abdeadline": "25th of previous month",
        }, {
            "name": "IEEE S&P (Oakland)", "year": 2027, "tags": ["CNF"],
            "deadline": ["2026-06-11 23:59", "2026-11-17 23:59"],
            "rebut": "August 20-September 4, February 11-26",
            "comment": "Early Reject - July 27, January 18. Notification - September 11, March 5.",
        }, {
            "name": "CRYPTO", "year": 2026, "tags": ["CNF"],
            "timezone": "PT", "deadline": ["2026-02-12 23:59"],
        }]
        result = updater.normalize_mpc(records)
        vldb, sp, crypto = result
        self.assertEqual(vldb["events"][0]["date"], "2026-03-25")
        self.assertEqual(vldb["events"][2]["date"], "2026-04-25")
        self.assertEqual(sp["acronym"], "S&P")
        self.assertEqual([item for item in sp["events"] if item["type"] == "rebuttal"][1]["date"], "2027-02-11")
        self.assertEqual(len([item for item in sp["events"] if item["type"] == "first_notification"]), 2)
        self.assertTrue(crypto["events"][0]["at"].endswith("-08:00"))


if __name__ == "__main__":
    unittest.main()
