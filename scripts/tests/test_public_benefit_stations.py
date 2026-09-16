import base64
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock


SCRIPT = Path(__file__).resolve().parents[1] / "update_public_benefit_stations.py"
SPEC = importlib.util.spec_from_file_location("public_benefit_aggregator", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class ParserTests(unittest.TestCase):
    def test_extract_array_literal_is_data_only(self):
        source = """
        export const sites: PublicSite[] = [
          { name: 'Alpha', url: 'https://api.alpha.com/', tags: ['免费模型'], },
          // comments and brackets inside strings must not terminate parsing
          { name: 'Beta ]', url: 'https://beta.example.com/' },
        ];
        globalThis.shouldNeverRun = true;
        """
        data = MODULE.extract_array_literal(source, "export const sites")
        self.assertEqual([item["name"] for item in data], ["Alpha", "Beta ]"])
        self.assertNotIn("eval(", SCRIPT.read_text(encoding="utf-8"))

    def test_parse_dengdeng_fields(self):
        source = """
        export const sites: PublicSite[] = [{
          name: 'Alpha API', domain: 'api.alpha.com', url: 'https://api.alpha.com/sign-up?aff=x',
          summary: '支持 Claude Code，注册送额度。', description: '详细介绍', usdQuotaCost: '$10',
          tags: ['推荐', '签到'], kind: 'recommended', priority: 10,
          registrationStatus: 'limited', usageNote: '需要 GitHub 账号',
        }];
        """
        records = MODULE.parse_dengdeng(source)
        self.assertEqual(len(records), 1)
        self.assertEqual(records[0]["id"], "alpha.com")
        self.assertEqual(records[0]["url"], "https://api.alpha.com/")
        self.assertEqual(records[0]["registrationStatus"], "limited")
        self.assertIn("Claude Code", records[0]["models"])

    def test_parse_ai_relay_fields(self):
        source = """
        export const RELAYS = [{
          id: 'alpha', name: 'Alpha', host: 'api.alpha.com',
          aff: 'https://api.alpha.com/register?aff=invite',
          rate: '1x 倍率', signup: '注册即得 $10 额度',
          models: ['opus 5'], notes: ['需要 GitHub'], verifiedAt: '2026-09-10',
        }];
        """
        records = MODULE.parse_ai_relay(source)
        self.assertEqual(len(records), 1)
        self.assertEqual(records[0]["url"], "https://api.alpha.com/")
        self.assertIn("1x 倍率", records[0]["benefits"])
        self.assertEqual(records[0]["updatedAt"], "2026-09-10")

    def test_parse_gongyijihe_fields(self):
        source = json.dumps({
            "meta": {"updatedAt": "2026-09-14"},
            "sites": [{
                "name": "Alpha", "url": "https://api.alpha.com/sign-up?aff=invite",
                "benefit": "注册送 20", "category": "强推", "recommended": True,
                "active": True, "notes": "每日签到",
            }],
        }, ensure_ascii=False)
        records = MODULE.parse_gongyijihe(source)
        self.assertEqual(len(records), 1)
        self.assertEqual(records[0]["id"], "alpha.com")
        self.assertEqual(records[0]["category"], "公益站")
        self.assertIn("强推", records[0]["tags"])
        self.assertEqual(records[0]["updatedAt"], "2026-09-14")

    def test_source_relative_affiliate_claim_is_removed(self):
        value = "注册送 100， 通过本页 aff 邀请入口还能获得 50。"
        self.assertEqual(MODULE.clean_text(value), "注册送 100")

    def test_parse_lujin_and_resolve_redirect(self):
        payload = [{"b": "b-ok", "n": "Alpha", "q": "注册送 10 额度", "no": "每日签到"}]
        key = bytes([75, 55, 109])
        raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        encrypted = bytes(byte ^ key[index % len(key)] for index, byte in enumerate(raw))
        source = f'var _c=[75,55,109]; var _d="{base64.b64encode(encrypted).decode()}";'
        records = MODULE.parse_lujin(source, resolver=lambda index: "https://api.alpha.com/register?aff=test")
        self.assertEqual(records[0]["id"], "alpha.com")
        self.assertEqual(records[0]["url"], "https://api.alpha.com/")
        self.assertTrue(records[0]["recommended"])

    def test_parse_baipiao_data_attributes(self):
        source = """
        <div class="ccard" data-card data-status="active" data-pinned-weight="1"
             data-summary="注册送额度，支持 GPT 和 Claude Code。" data-tags="免费API,签到">
          <a class="cname">Alpha</a>
          <span class="tag">OpenAI兼容</span>
          <p class="cusage"><span class="cusage-t">需要邮箱验证</span></p>
          <a class="centry" href="https://baipiao.org/go.html?u=https%3A%2F%2Fapi.alpha.com%2Fregister%3Faff%3Dx">注册入口</a>
        </div>
        """
        records = MODULE.parse_baipiao(source)
        self.assertEqual(len(records), 1)
        self.assertEqual(records[0]["id"], "alpha.com")
        self.assertIn("OpenAI兼容", records[0]["tags"])
        self.assertIn("GPT", records[0]["models"])
        self.assertIn("Claude Code", records[0]["models"])


class NormalizationTests(unittest.TestCase):
    def test_merge_uses_source_priority_and_unions_lists(self):
        lower = MODULE.make_record(
            "lujin",
            name="Alpha old",
            url="https://api.alpha.com/?aff=x",
            summary="旧摘要",
            tags=["签到"],
            benefits=["注册送 10"],
        )
        higher = MODULE.make_record(
            "baipiao",
            name="Alpha",
            url="https://www.alpha.com/register?utm_source=x",
            summary="新摘要",
            tags=["Claude"],
            models=["Claude"],
        )
        stations = MODULE.merge_records([lower, higher])
        self.assertEqual(len(stations), 1)
        self.assertEqual(stations[0]["name"], "Alpha")
        self.assertEqual(stations[0]["summary"], "新摘要")
        self.assertEqual(stations[0]["url"], "https://alpha.com/")
        self.assertEqual(stations[0]["sourceIds"], ["baipiao", "lujin"])
        self.assertEqual(set(stations[0]["tags"]), {"Claude", "签到"})

    def test_failed_source_reuses_previous_station(self):
        previous = {
            "stations": [{
                "id": "alpha.example",
                "name": "Alpha",
                "domain": "alpha.example",
                "url": "https://alpha.example/",
                "summary": "cached",
                "category": "API 中转",
                "tags": [], "models": [], "benefits": [], "requirements": [], "notes": [],
                "registrationStatus": "unknown", "updatedAt": "", "checkedAt": "2026-01-01T00:00:00Z",
                "healthStatus": "available",
                "sourceIds": ["baipiao", "lujin"],
            }]
        }
        recovered = MODULE.fallback_records(previous, ["baipiao"])
        self.assertEqual(len(recovered), 1)
        self.assertEqual(recovered[0]["_source"], "baipiao")

    def test_health_status_policy(self):
        for status in (200, 301, 401, 403, 405, 429):
            self.assertTrue(MODULE.health_status_is_reachable(status), status)
        for status in (404, 410, 500, 503):
            self.assertFalse(MODULE.health_status_is_reachable(status), status)

    def test_private_addresses_are_rejected(self):
        private_answer = [(2, 1, 6, '', ('127.0.0.1', 443))]
        public_answer = [(2, 1, 6, '', ('8.8.8.8', 443))]
        with mock.patch.object(MODULE.socket, 'getaddrinfo', return_value=private_answer):
            self.assertFalse(MODULE.host_resolves_publicly('https://example.com/'))
        with mock.patch.object(MODULE.socket, 'getaddrinfo', return_value=public_answer):
            self.assertTrue(MODULE.host_resolves_publicly('https://example.com/'))

    def test_health_check_keeps_protected_site_and_retries_server_errors(self):
        station = {"url": "https://alpha.com/"}
        with mock.patch.object(MODULE, 'safe_request', return_value=(403, 'https://alpha.com/')) as request:
            self.assertTrue(MODULE.check_station(station)[0])
            self.assertEqual(request.call_count, 1)
        with mock.patch.object(MODULE, 'safe_request', return_value=(503, 'https://alpha.com/')) as request:
            self.assertFalse(MODULE.check_station(station)[0])
            self.assertEqual(request.call_count, 4)
        for status in (404, 410):
            with mock.patch.object(MODULE, 'safe_request', return_value=(status, 'https://alpha.com/')) as request:
                self.assertFalse(MODULE.check_station(station)[0])
                self.assertEqual(request.call_count, 2)

    def test_all_sources_failed_does_not_overwrite_snapshot(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "stations.json"
            original = '{"generatedAt":"old","stations":[{"id":"alpha.com"}]}'
            output.write_text(original, encoding="utf-8")
            with mock.patch.object(MODULE, 'fetch_text', side_effect=MODULE.AggregationError('offline')):
                with self.assertRaises(MODULE.AggregationError):
                    MODULE.aggregate(output, skip_health_check=True, workers=1, health_timeout=3)
            self.assertEqual(output.read_text(encoding="utf-8"), original)

    def test_snapshot_validation_rejects_duplicates(self):
        station = {
            "id": "alpha.example", "name": "Alpha", "domain": "alpha.example",
            "url": "https://alpha.example/", "summary": "", "category": "公益站",
            "checkedAt": "2026-01-01T00:00:00Z", "healthStatus": "available", "sourceIds": ["baipiao"],
        }
        with self.assertRaises(MODULE.AggregationError):
            MODULE.validate_output([station, dict(station)])


if __name__ == "__main__":
    unittest.main()
