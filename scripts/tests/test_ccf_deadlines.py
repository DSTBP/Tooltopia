import importlib.util
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "update_ccf_deadlines.py"
spec = importlib.util.spec_from_file_location("update_ccf_deadlines", SCRIPT)
updater = importlib.util.module_from_spec(spec)
spec.loader.exec_module(updater)


class DeadlineSnapshotTests(unittest.TestCase):
    def test_normalizes_and_deduplicates_real_response_shape(self):
        source = {"results": [{
            "short_name": "NeurIPS", "year": 2026, "name": "NeurIPS 2026",
            "url": "https://neurips.cc/", "tags": ["machine-learning"],
            "deadlines": [{"type": "review_release", "label": "Reviews released",
                           "deadline_at": "2026-07-23T11:59:59Z", "timezone": "AoE"}],
        }, {
            "short_name": "NeurIPS", "year": 2026, "tags": ["computer-vision"],
            "deadlines": [{"type": "notification", "label": "Notification",
                           "deadline_at": "2026-09-01T11:59:59Z", "timezone": "AoE"}],
        }]}
        result = updater.normalize(source)
        self.assertEqual(result["count"], 1)
        self.assertEqual(len(result["results"][0]["deadlines"]), 2)
        self.assertEqual(result["results"][0]["tags"], ["machine-learning", "computer-vision"])

    def test_invalid_response_cannot_replace_snapshot(self):
        for payload in ({"results": []}, {"results": [{
            "short_name": "ICLR", "year": 2027,
            "deadlines": [{"deadline_at": "not-a-date"}],
        }]}):
            with self.assertRaises(ValueError):
                updater.normalize(payload)


if __name__ == "__main__":
    unittest.main()
