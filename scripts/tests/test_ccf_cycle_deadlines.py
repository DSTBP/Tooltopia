"""Fixed-shape tests for CCF Cycle's server-rendered conference pages."""

import json
from pathlib import Path
import sys
import tempfile
import unittest
from urllib.error import HTTPError

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
import update_ccf_cycle_deadlines as updater  # noqa: E402


def detail(conference, changes=()):
    frame = '12:I["some chunk"]\n9:' + json.dumps(
        ["$", "$L12", None, {"conference": conference}], ensure_ascii=False
    ) + "\n"
    packet = json.dumps([1, frame], ensure_ascii=False)
    changes_html = "".join(f"<li><span>{item}</span></li>" for item in changes)
    return (f'<div>与去年相比的变化</div><ul>{changes_html}</ul>'
            f'<script>self.__next_f.push({packet})</script>')


class CCFCycleDeadlineTests(unittest.TestCase):
    def test_listing_decodes_nested_and_escaped_slugs(self):
        html = ('<a href="/conference/ieee/acm-cgo">CGO</a>'
                '<a href="/conference/s&amp;p">S&amp;P</a>'
                '<a href="/conference/aaai">AAAI</a>'
                '<a href="/conference/aaai">AAAI again</a>')
        self.assertEqual(updater.listing_paths(html), [
            "/conference/aaai", "/conference/ieee/acm-cgo", "/conference/s&p"
        ])

    def test_latest_year_estimates_and_distinct_same_day_events(self):
        conference = {
            "title": "NeurIPS", "dblp": "nips", "sub": "AI", "rank": {"ccf": "A"},
            "instances": [
                {"year": 2025, "rounds": [{"deadline": "2025-05-01T11:59:00.000Z"}]},
                {"year": 2026, "date_start": "2026-12-06T00:00:00.000Z",
                 "link": "https://neurips.cc/Conferences/2026", "rounds": [
                     {"deadline": "2026-05-07T11:59:00.000Z",
                      "reviews_released": "2026-08-17T00:00:00.000Z",
                      "rebuttal_start": "2026-08-17T00:00:00.000Z",
                      "cfp_url": "https://neurips.cc/cfp"},
                     {"deadline": "2026-06-01T00:00:00.000Z", "estimated": True}
                 ]}
            ]
        }
        record = updater.parse_detail(detail(conference, ["Venue changed", "Deadline removed"]),
                                      "/conference/neurips")
        self.assertEqual(record["year"], 2026)
        self.assertEqual(record["conferenceStart"], "2026-12-06")
        self.assertEqual(record["dblpUrl"], "https://dblp.org/db/nips")
        self.assertEqual(record["cfpUrl"], "https://neurips.cc/cfp")
        self.assertEqual(record["changes"], ["Venue changed", "Deadline removed"])
        self.assertEqual(len(record["events"]), 3)
        self.assertEqual({event["type"] for event in record["events"]},
                         {"paper", "review_release", "rebuttal_start"})
        self.assertEqual(record["events"][0]["at"], "2026-05-07T11:59:00Z")
        self.assertTrue(all(event.get("cycle") == "Round 1" for event in record["events"]))
        self.assertNotIn("sub", record)
        self.assertNotIn("rank", record)

    def test_latest_year_can_have_no_rounds(self):
        conference = {"title": "AAAI", "dblp": "aaai", "instances": [
            {"year": 2026, "rounds": [{"deadline": "2025-08-01T11:59:00Z"}]},
            {"year": 2027, "link": "https://aaai.org/", "rounds": []}
        ]}
        record = updater.parse_detail(detail(conference), "/conference/aaai")
        self.assertEqual(record["year"], 2027)
        self.assertEqual(record["events"], [])
        self.assertEqual(record["websiteUrl"], "https://aaai.org/")
        with self.assertRaises(updater.EmptyConference):
            updater.parse_detail(detail({"title": "HotSec", "instances": []}), "/conference/hotsec")

    def test_broken_link_and_failed_refresh_preserve_snapshot(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "cycle.json"
            listing = ('<a href="/conference/aaai">AAAI</a>'
                       '<a href="/conference/ieee/acm-cgo">CGO</a>')
            good = detail({"title": "AAAI", "instances": [{"year": 2027, "rounds": []}]})

            def fetcher(url, _agent):
                if url.endswith("/conferences"):
                    return listing
                if url.endswith("/aaai"):
                    return good
                raise HTTPError(url, 404, "Not Found", {}, None)

            payload = updater.update(output, fetcher)
            self.assertEqual(len(payload["conferences"]), 1)
            before = output.read_bytes()

            def failed(url, _agent):
                if url.endswith("/conferences"):
                    return listing
                if url.endswith("/aaai"):
                    raise ValueError("changed page shape")
                raise HTTPError(url, 404, "Not Found", {}, None)

            with self.assertRaisesRegex(ValueError, "no live conference detail"):
                updater.update(output, failed)
            self.assertEqual(output.read_bytes(), before)

            def limited(url, _agent):
                if url.endswith("/conferences"):
                    return listing
                if url.endswith("/aaai"):
                    raise HTTPError(url, 429, "Too Many Requests", {}, None)
                raise HTTPError(url, 404, "Not Found", {}, None)

            with self.assertRaisesRegex(ValueError, "blocked HTTP 429"):
                updater.update(output, limited)
            self.assertEqual(output.read_bytes(), before)

    def test_full_listing_finishes_and_deduplicates(self):
        paths = [f"/conference/x{index}" for index in range(309)]
        listing = "".join(f'<a href="{path}">X</a>' for path in paths)
        html = detail({"title": "X", "instances": [{"year": 2027, "rounds": []}]})

        def fetcher(url, _agent):
            return listing if url.endswith("/conferences") else html

        with tempfile.TemporaryDirectory() as directory:
            payload = updater.update(Path(directory) / "cycle.json", fetcher)
        self.assertEqual(len(payload["conferences"]), 1)

    def test_one_transient_detail_uses_previous_record(self):
        listing = ('<a href="/conference/aaai">AAAI</a>'
                   '<a href="/conference/cgo">CGO</a>')
        good = detail({"title": "AAAI", "instances": [{"year": 2027, "rounds": []}]})
        previous = {"generatedAt": "2026-01-01T00:00:00Z", "conferences": [
            {"slug": "cgo", "acronym": "CGO", "year": 2027, "events": [], "changes": []}
        ]}

        def fetcher(url, _agent):
            if url.endswith("/conferences"):
                return listing
            if url.endswith("/aaai"):
                return good
            raise OSError("temporary timeout")

        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "cycle.json"
            output.write_text(json.dumps(previous), encoding="utf-8")
            payload = updater.update(output, fetcher)
        self.assertEqual({record["acronym"] for record in payload["conferences"]}, {"AAAI", "CGO"})


if __name__ == "__main__":
    unittest.main()
