#!/usr/bin/env python3
"""Aggregate, normalize, deduplicate, and verify public-benefit AI stations.

The output is consumed by the static PublicbenefitStationNavigation page. Remote
JavaScript and TypeScript are parsed as data literals and are never executed.
"""

from __future__ import annotations

import argparse
import base64
import concurrent.futures
import datetime as dt
import html
import ipaddress
import json
import os
import re
import socket
import sys
import tempfile
import threading
from pathlib import Path
from typing import Any, Callable, Iterable
from urllib.parse import parse_qs, urljoin, urlsplit, urlunsplit

import json5
import requests
import tldextract
from bs4 import BeautifulSoup


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "utils" / "PublicbenefitStationNavigation" / "assets" / "data" / "stations.json"

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36 "
    "Tooltopia-PublicBenefitStation-Aggregator/1.0"
)
MAX_SOURCE_BYTES = 4_000_000
SOURCE_TIMEOUT = 20
HEALTH_TIMEOUT = 10
MAX_REDIRECTS = 5

SOURCE_PRIORITY = {
    "baipiao": 0,
    "dengdeng": 1,
    "ai-relay": 2,
    "gongyijihe": 3,
    "lujin": 4,
}

SOURCE_URLS = {
    "lujin": "https://lujin.dpdns.org/",
    "dengdeng": "https://raw.githubusercontent.com/guoxueziliao/dengdeng-public-nav/main/src/data/sites.ts",
    "ai-relay": "https://raw.githubusercontent.com/jliushi/ai-relay/main/data.js",
    "baipiao": "https://baipiao.org/charity/",
    "gongyijihe": "https://raw.githubusercontent.com/missmihu/gongyijihe/main/data/sites.json",
}

ALLOWED_SOURCE_HOSTS = {
    "lujin.dpdns.org",
    "raw.githubusercontent.com",
    "baipiao.org",
}

_extract_domain = tldextract.TLDExtract(
    suffix_list_urls=(),
    include_psl_private_domains=True,
)
_thread_local = threading.local()


class AggregationError(RuntimeError):
    """Raised when aggregation cannot safely publish a new snapshot."""


def utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def clean_text(value: Any) -> str:
    if value is None:
        return ""
    text = re.sub(r"\s+", " ", html.unescape(str(value))).strip()
    # The canonical visit link intentionally removes affiliate parameters, so
    # source-relative promises about "this page's" affiliate link are invalid.
    text = re.sub(
        r"(?:[，,]\s*)?通过本页\s*(?:aff\s*)?邀请入口[^。！？;；]*[。！？]?",
        "",
        text,
        flags=re.IGNORECASE,
    )
    return text.strip()


def unique_text(values: Iterable[Any]) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for value in values:
        text = clean_text(value)
        key = text.casefold()
        if text and key not in seen:
            seen.add(key)
            result.append(text)
    return result


def as_text_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return unique_text(value)
    if isinstance(value, str):
        return unique_text(re.split(r"[,，;；\n]+", value))
    return unique_text([value])


def fetch_text(url: str, *, max_bytes: int = MAX_SOURCE_BYTES) -> str:
    current = url
    response = None
    for _ in range(MAX_REDIRECTS + 1):
        parsed = urlsplit(current)
        host = (parsed.hostname or "").lower()
        if parsed.scheme != "https" or host not in ALLOWED_SOURCE_HOSTS:
            raise AggregationError(f"source URL is not allowlisted: {current}")
        response = requests.get(
            current,
            headers={"User-Agent": USER_AGENT, "Accept": "text/html,application/json,text/plain,*/*"},
            timeout=SOURCE_TIMEOUT,
            stream=True,
            allow_redirects=False,
        )
        if response.status_code not in {301, 302, 303, 307, 308}:
            break
        location = response.headers.get("Location")
        response.close()
        if not location:
            raise AggregationError(f"source redirect has no location: {current}")
        current = urljoin(current, location)
    else:
        raise AggregationError(f"source redirected more than {MAX_REDIRECTS} times: {url}")
    assert response is not None
    try:
        response.raise_for_status()
    except requests.HTTPError:
        response.close()
        raise

    declared_length = response.headers.get("Content-Length")
    if declared_length and int(declared_length) > max_bytes:
        response.close()
        raise AggregationError(f"source response is too large: {url}")

    chunks: list[bytes] = []
    total = 0
    try:
        for chunk in response.iter_content(64 * 1024):
            if not chunk:
                continue
            total += len(chunk)
            if total > max_bytes:
                raise AggregationError(f"source response exceeded {max_bytes} bytes: {url}")
            chunks.append(chunk)
    finally:
        response.close()

    raw = b"".join(chunks)
    encoding = response.encoding if response.encoding and response.encoding.lower() != "iso-8859-1" else "utf-8"
    return raw.decode(encoding, errors="replace")


def extract_array_literal(source: str, marker: str) -> list[dict[str, Any]]:
    """Extract a JSON5-compatible array following marker without evaluating code."""
    marker_index = source.find(marker)
    if marker_index < 0:
        raise AggregationError(f"data marker not found: {marker}")
    assignment = source.find("=", marker_index + len(marker))
    if assignment < 0:
        raise AggregationError(f"assignment not found after: {marker}")
    start = source.find("[", assignment)
    if start < 0:
        raise AggregationError(f"array opening not found after: {marker}")

    depth = 0
    quote = ""
    escaped = False
    line_comment = False
    block_comment = False
    end = -1
    index = start
    while index < len(source):
        char = source[index]
        next_char = source[index + 1] if index + 1 < len(source) else ""

        if line_comment:
            if char in "\r\n":
                line_comment = False
            index += 1
            continue
        if block_comment:
            if char == "*" and next_char == "/":
                block_comment = False
                index += 2
            else:
                index += 1
            continue
        if quote:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == quote:
                quote = ""
            index += 1
            continue
        if char in "'\"`":
            quote = char
            index += 1
            continue
        if char == "/" and next_char == "/":
            line_comment = True
            index += 2
            continue
        if char == "/" and next_char == "*":
            block_comment = True
            index += 2
            continue
        if char == "[":
            depth += 1
        elif char == "]":
            depth -= 1
            if depth == 0:
                end = index + 1
                break
        index += 1

    if end < 0:
        raise AggregationError(f"array closing not found after: {marker}")
    data = json5.loads(source[start:end])
    if not isinstance(data, list) or not all(isinstance(item, dict) for item in data):
        raise AggregationError(f"marker did not contain an object array: {marker}")
    return data


def unwrap_redirect_url(value: str) -> str:
    value = clean_text(value)
    if not value:
        return ""
    parsed = urlsplit(value)
    if parsed.hostname and parsed.hostname.lower() in {"baipiao.org", "www.baipiao.org"}:
        nested = parse_qs(parsed.query).get("u")
        if nested:
            return clean_text(nested[0])
    return value


def canonical_url(value: str) -> str:
    value = unwrap_redirect_url(value)
    if not value:
        return ""
    parsed = urlsplit(value)
    if parsed.scheme.lower() not in {"http", "https"} or not parsed.hostname:
        return ""
    host = parsed.hostname.lower().rstrip(".")
    if host.startswith("www."):
        host = host[4:]
    try:
        port = parsed.port
    except ValueError:
        return ""
    netloc = host if port is None else f"{host}:{port}"
    return urlunsplit((parsed.scheme.lower(), netloc, "/", "", ""))


def registered_domain(value: str) -> str:
    parsed = urlsplit(value)
    host = (parsed.hostname or "").lower().rstrip(".")
    if not host:
        return ""
    try:
        ipaddress.ip_address(host)
        return host
    except ValueError:
        pass
    extracted = _extract_domain(host)
    return extracted.registered_domain or host


def infer_registration(text: str, explicit: str = "") -> str:
    explicit = clean_text(explicit).lower()
    if explicit in {"open", "limited", "closed"}:
        return explicit
    lowered = text.casefold()
    if any(token in lowered for token in ("关闭注册", "停止注册", "暂停注册", "closed")):
        return "closed"
    if any(token in lowered for token in ("限时注册", "限注", "随缘", "limited")):
        return "limited"
    if any(token in lowered for token in ("开放注册", "注册即", "注册送", "open registration")):
        return "open"
    return "unknown"


def infer_models(values: Iterable[Any]) -> list[str]:
    text = " ".join(clean_text(value) for value in values if value is not None)
    candidates: list[str] = []
    patterns = [
        (r"(?i)claude\s*code", "Claude Code"),
        (r"(?i)claude", "Claude"),
        (r"(?i)\bgpt\b", "GPT"),
        (r"(?i)codex", "Codex"),
        (r"(?i)gemini", "Gemini"),
        (r"(?i)deepseek", "DeepSeek"),
        (r"(?i)qwen", "Qwen"),
        (r"(?i)glm", "GLM"),
        (r"(?i)kimi", "Kimi"),
        (r"(?i)grok", "Grok"),
        (r"(?i)mimo", "MiMo"),
    ]
    for pattern, label in patterns:
        if re.search(pattern, text):
            candidates.append(label)
    return unique_text(candidates)


def infer_category(text: str, kind: str = "") -> str:
    lowered = text.casefold()
    if kind == "official":
        return "官方免费"
    if any(token in lowered for token in ("生图", "图像生成", "image generation")):
        return "生图"
    if any(token in lowered for token in ("api", "中转", "relay", "openai兼容")):
        return "API 中转"
    if any(token in lowered for token in ("免费模型", "free model")):
        return "免费模型"
    return "公益站"


def normalize_category(value: str, text: str) -> str:
    value = clean_text(value)
    if value in {"API 中转", "官方免费", "生图", "免费模型", "公益站"}:
        return value
    return infer_category(text)


def extract_benefits(text: str) -> list[str]:
    parts = re.split(r"[。！？;；\n]+", clean_text(text))
    return unique_text(
        part for part in parts
        if any(token in part.casefold() for token in ("免费", "额度", "签到", "倍率", "赠送", "试用", "free"))
    )[:5]


def make_record(
    source_id: str,
    *,
    name: Any,
    url: Any,
    summary: Any = "",
    category: Any = "",
    tags: Any = None,
    models: Any = None,
    benefits: Any = None,
    requirements: Any = None,
    notes: Any = None,
    registration_status: Any = "unknown",
    updated_at: Any = "",
    recommended: bool = False,
    source_order: int = 0,
) -> dict[str, Any] | None:
    normalized_url = canonical_url(clean_text(url))
    domain_id = registered_domain(normalized_url)
    if not normalized_url or not domain_id:
        return None

    normalized_tags = as_text_list(tags)
    normalized_models = unique_text([*as_text_list(models), *infer_models([summary, *normalized_tags])])
    normalized_benefits = as_text_list(benefits)
    if not normalized_benefits:
        normalized_benefits = extract_benefits(clean_text(summary))
    combined_text = " ".join(
        [clean_text(name), clean_text(summary), *normalized_tags, *normalized_models, *normalized_benefits]
    )
    return {
        "id": domain_id,
        "name": clean_text(name) or domain_id,
        "domain": (urlsplit(normalized_url).hostname or domain_id).lower(),
        "url": normalized_url,
        "summary": clean_text(summary),
        "category": normalize_category(clean_text(category), combined_text),
        "tags": normalized_tags,
        "models": normalized_models,
        "benefits": normalized_benefits,
        "requirements": as_text_list(requirements),
        "notes": as_text_list(notes),
        "registrationStatus": infer_registration(combined_text, clean_text(registration_status)),
        "updatedAt": clean_text(updated_at),
        "sourceIds": [source_id],
        "recommended": bool(recommended),
        "_source": source_id,
        "_sourceRank": SOURCE_PRIORITY[source_id],
        "_sourceOrder": source_order,
    }


def parse_dengdeng(source: str) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for index, item in enumerate(extract_array_literal(source, "export const sites")):
        highlight = item.get("highlight") if isinstance(item.get("highlight"), dict) else {}
        benefits = []
        quota = clean_text(item.get("usdQuotaCost"))
        if quota and quota not in {"未标明", "未知"}:
            benefits.append(quota)
        if highlight:
            benefits.append("：".join(filter(None, [clean_text(highlight.get("title")), clean_text(highlight.get("note"))])))
        requirements = [item.get("registrationNote"), item.get("usageNote")]
        notes = [item.get("dengdengSays"), item.get("description")]
        record = make_record(
            "dengdeng",
            name=item.get("name"),
            url=item.get("url") or f"https://{clean_text(item.get('domain'))}/",
            summary=item.get("summary") or item.get("description"),
            category=infer_category(" ".join(as_text_list(item.get("tags"))), clean_text(item.get("kind"))),
            tags=item.get("tags"),
            benefits=benefits,
            requirements=requirements,
            notes=notes,
            registration_status=item.get("registrationStatus"),
            recommended=item.get("kind") in {"recommended", "official"} or "推荐" in as_text_list(item.get("tags")),
            source_order=index,
        )
        if record:
            records.append(record)
    return records


def parse_ai_relay(source: str) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for index, item in enumerate(extract_array_literal(source, "export const RELAYS")):
        benefits = [item.get("signup"), item.get("invite"), item.get("rate")]
        summary = "；".join(unique_text([item.get("signup"), item.get("rate"), item.get("tested")]))
        record = make_record(
            "ai-relay",
            name=item.get("name"),
            url=item.get("aff") or f"https://{clean_text(item.get('host'))}/",
            summary=summary,
            category="API 中转",
            tags=["API 中转"],
            models=item.get("models"),
            benefits=benefits,
            requirements=item.get("notes"),
            notes=[item.get("tested"), *as_text_list(item.get("tips"))],
            registration_status=infer_registration(summary),
            updated_at=item.get("verifiedAt"),
            recommended=True,
            source_order=index,
        )
        if record:
            records.append(record)
    return records


def parse_gongyijihe(source: str) -> list[dict[str, Any]]:
    payload = json.loads(source)
    sites = payload.get("sites") if isinstance(payload, dict) else None
    if not isinstance(sites, list):
        raise AggregationError("gongyijihe sites array is missing")
    records: list[dict[str, Any]] = []
    for index, item in enumerate(sites):
        if not isinstance(item, dict):
            continue
        benefit = clean_text(item.get("benefit"))
        notes = as_text_list(item.get("notes"))
        if item.get("active") is False:
            notes.append("来源页面标记为暂停或失效，仍以本次连通性检测为准")
        record = make_record(
            "gongyijihe",
            name=item.get("name"),
            url=item.get("url"),
            summary="；".join(unique_text([benefit, *notes])),
            category=item.get("category") or "公益站",
            tags=[item.get("category")],
            benefits=[benefit],
            notes=notes,
            registration_status=infer_registration(" ".join([benefit, *notes])),
            updated_at=item.get("updatedAt") or payload.get("meta", {}).get("updatedAt", ""),
            recommended=bool(item.get("recommended")),
            source_order=int(item.get("order") or index),
        )
        if record:
            records.append(record)
    return records


def resolve_lujin_target(index: int) -> str:
    redirect_url = f"https://lujin.dpdns.org/go/{index}"
    response = requests.get(
        redirect_url,
        headers={"User-Agent": USER_AGENT},
        timeout=SOURCE_TIMEOUT,
        allow_redirects=False,
    )
    try:
        location = response.headers.get("Location", "")
        if response.status_code not in range(300, 400) or not location:
            raise AggregationError(f"lujin redirect {index} did not return a target")
        return urljoin(redirect_url, location)
    finally:
        response.close()


def parse_lujin(source: str, resolver: Callable[[int], str] = resolve_lujin_target) -> list[dict[str, Any]]:
    key_match = re.search(r"var\s+_c\s*=\s*\[([^\]]+)\]", source)
    data_match = re.search(r'var\s+_d\s*=\s*"([^"]+)"', source)
    if not key_match or not data_match:
        raise AggregationError("lujin embedded data was not found")
    key = bytes(int(value.strip()) for value in key_match.group(1).split(","))
    encrypted = base64.b64decode(data_match.group(1), validate=True)
    decoded = bytes(byte ^ key[index % len(key)] for index, byte in enumerate(encrypted))
    payload = json.loads(decoded.decode("utf-8"))
    if not isinstance(payload, list):
        raise AggregationError("lujin embedded data is not an array")

    badge_labels = {
        "b-ok": "推荐",
        "b-warn": "注意",
        "b-bad": "来源标记异常",
        "b-new": "新站",
        "b-mute": "情况未明",
    }
    records: list[dict[str, Any]] = []
    for index, item in enumerate(payload, start=1):
        if not isinstance(item, dict):
            continue
        try:
            target = resolver(index)
        except Exception as error:  # Keep one broken redirect from discarding the source.
            print(f"[lujin] redirect {index} skipped: {error}", file=sys.stderr)
            continue
        benefit = clean_text(item.get("q"))
        note = clean_text(item.get("no"))
        record = make_record(
            "lujin",
            name=item.get("n"),
            url=target,
            summary="；".join(unique_text([benefit, note])),
            category="API 中转",
            tags=[badge_labels.get(clean_text(item.get("b")), "公益站")],
            benefits=[benefit],
            requirements=[note],
            registration_status=infer_registration(" ".join([benefit, note])),
            recommended=item.get("b") == "b-ok",
            source_order=index - 1,
        )
        if record:
            records.append(record)
    return records


def parse_baipiao(source: str) -> list[dict[str, Any]]:
    soup = BeautifulSoup(source, "html.parser")
    cards = soup.select("div[data-card]")
    if not cards:
        raise AggregationError("baipiao data cards were not found")
    records: list[dict[str, Any]] = []
    for index, card in enumerate(cards):
        name_node = card.select_one("a.cname")
        name = clean_text(name_node.get_text(" ", strip=True) if name_node else card.get("data-name"))
        entries = card.select("a.centry[href]")
        target = ""
        for entry in entries:
            href = urljoin(SOURCE_URLS["baipiao"], clean_text(entry.get("href")))
            candidate = unwrap_redirect_url(href)
            if canonical_url(candidate):
                target = candidate
                break
        if not target:
            continue
        summary_node = card.select_one("p.csum")
        summary = clean_text(summary_node.get_text(" ", strip=True) if summary_node else card.get("data-summary"))
        tags = unique_text(
            [*as_text_list(card.get("data-tags")), *[node.get_text(" ", strip=True) for node in card.select("span.tag")]]
        )
        requirements = unique_text(
            [*as_text_list(card.get("data-usage")), *[node.get_text(" ", strip=True) for node in card.select(".cusage-t")]]
        )
        timestamp = clean_text(card.get("data-fresh-sec") or card.get("data-listed-sec"))
        updated_at = ""
        if timestamp.isdigit() and int(timestamp) > 0:
            updated_at = dt.datetime.fromtimestamp(int(timestamp), tz=dt.timezone.utc).date().isoformat()
        status = clean_text(card.get("data-status"))
        notes = [] if status in {"", "active"} else [f"来源页面状态：{status}"]
        record = make_record(
            "baipiao",
            name=name,
            url=target,
            summary=summary,
            category=infer_category(" ".join([summary, *tags])),
            tags=tags,
            models=infer_models([summary, *tags]),
            benefits=extract_benefits(summary),
            requirements=requirements,
            notes=notes,
            registration_status=infer_registration(" ".join([summary, *tags, *requirements])),
            updated_at=updated_at,
            recommended=clean_text(card.get("data-pinned-weight")) not in {"", "0"},
            source_order=index,
        )
        if record:
            records.append(record)
    return records


def merge_records(records: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    groups: dict[str, list[dict[str, Any]]] = {}
    for record in records:
        station_id = clean_text(record.get("id"))
        if station_id:
            groups.setdefault(station_id, []).append(record)

    merged: list[dict[str, Any]] = []
    list_fields = ("tags", "models", "benefits", "requirements", "notes")
    for station_id, candidates in groups.items():
        candidates.sort(key=lambda item: (int(item.get("_sourceRank", 99)), int(item.get("_sourceOrder", 9999))))

        def first_text(field: str, default: str = "") -> str:
            return next((clean_text(item.get(field)) for item in candidates if clean_text(item.get(field))), default)

        source_ids = unique_text(
            source
            for item in candidates
            for source in as_text_list(item.get("sourceIds") or item.get("_source"))
        )
        registration_status = next(
            (
                clean_text(item.get("registrationStatus"))
                for item in candidates
                if clean_text(item.get("registrationStatus")) in {"open", "limited", "closed"}
            ),
            "unknown",
        )
        updated_values = sorted(
            (clean_text(item.get("updatedAt")) for item in candidates if clean_text(item.get("updatedAt"))),
            reverse=True,
        )
        station: dict[str, Any] = {
            "id": station_id,
            "name": first_text("name", station_id),
            "domain": first_text("domain", station_id),
            "url": first_text("url"),
            "summary": first_text("summary"),
            "category": first_text("category", "公益站"),
            "registrationStatus": registration_status,
            "updatedAt": updated_values[0] if updated_values else "",
            "sourceIds": source_ids,
            "recommended": any(bool(item.get("recommended")) for item in candidates),
        }
        for field in list_fields:
            station[field] = unique_text(
                value for item in candidates for value in as_text_list(item.get(field))
            )
        merged.append(station)
    return merged


def load_previous(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {"stations": []}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        print(f"[previous] ignored invalid snapshot: {error}", file=sys.stderr)
        return {"stations": []}
    return payload if isinstance(payload, dict) and isinstance(payload.get("stations"), list) else {"stations": []}


def fallback_records(previous: dict[str, Any], failed_sources: Iterable[str]) -> list[dict[str, Any]]:
    failed = set(failed_sources)
    recovered: list[dict[str, Any]] = []
    for station in previous.get("stations", []):
        if not isinstance(station, dict):
            continue
        matching = [source for source in as_text_list(station.get("sourceIds")) if source in failed]
        if not matching:
            continue
        source_id = min(matching, key=lambda source: SOURCE_PRIORITY.get(source, 99))
        record = dict(station)
        record["_source"] = source_id
        record["_sourceRank"] = SOURCE_PRIORITY[source_id]
        record["_sourceOrder"] = 9999
        recovered.append(record)
    return recovered


def _session() -> requests.Session:
    session = getattr(_thread_local, "session", None)
    if session is None:
        session = requests.Session()
        session.headers.update({"User-Agent": USER_AGENT, "Accept": "text/html,*/*;q=0.8"})
        _thread_local.session = session
    return session


def host_resolves_publicly(url: str) -> bool:
    parsed = urlsplit(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        return False
    host = parsed.hostname
    try:
        addresses = {item[4][0] for item in socket.getaddrinfo(host, parsed.port or (443 if parsed.scheme == "https" else 80))}
    except OSError:
        return False
    if not addresses:
        return False
    try:
        return all(ipaddress.ip_address(address).is_global for address in addresses)
    except ValueError:
        return False


def safe_request(method: str, url: str, timeout: int) -> tuple[int, str]:
    current = url
    for _ in range(MAX_REDIRECTS + 1):
        if not host_resolves_publicly(current):
            raise requests.RequestException(f"non-public or unresolved target: {current}")
        response = _session().request(
            method,
            current,
            timeout=timeout,
            allow_redirects=False,
            stream=True,
            headers={"Range": "bytes=0-1023"} if method == "GET" else None,
        )
        try:
            if response.status_code in {301, 302, 303, 307, 308}:
                location = response.headers.get("Location")
                if not location:
                    return response.status_code, current
                current = urljoin(current, location)
                continue
            return response.status_code, current
        finally:
            response.close()
    raise requests.TooManyRedirects(f"more than {MAX_REDIRECTS} redirects: {url}")


def health_status_is_reachable(status: int) -> bool:
    if status in {404, 410}:
        return False
    return 200 <= status < 500


def check_station(station: dict[str, Any], timeout: int = HEALTH_TIMEOUT) -> tuple[bool, str]:
    url = clean_text(station.get("url"))
    last_error = ""
    for attempt in range(2):
        try:
            status, final_url = safe_request("HEAD", url, timeout)
            if status == 405:
                try:
                    status, final_url = safe_request("GET", url, timeout)
                except requests.RequestException:
                    return True, f"HTTP 405 {final_url}"
            elif health_status_is_reachable(status):
                return True, f"HTTP {status} {final_url}"
            else:
                status, final_url = safe_request("GET", url, timeout)
            if health_status_is_reachable(status):
                return True, f"HTTP {status} {final_url}"
            if status in {404, 410}:
                return False, f"HTTP {status}"
            last_error = f"HTTP {status}"
        except requests.RequestException as error:
            last_error = clean_text(error)
        if attempt == 0:
            continue
    return False, last_error or "unreachable"


def verify_stations(stations: list[dict[str, Any]], *, workers: int, timeout: int) -> list[dict[str, Any]]:
    reachable: list[dict[str, Any]] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, workers)) as executor:
        future_map = {
            executor.submit(check_station, station, timeout): station
            for station in stations
        }
        for future in concurrent.futures.as_completed(future_map):
            station = future_map[future]
            try:
                available, detail = future.result()
            except Exception as error:  # A worker failure must not abort unrelated checks.
                available, detail = False, clean_text(error)
            label = clean_text(station.get("name")) or clean_text(station.get("id"))
            print(f"[health] {'keep' if available else 'drop'} {label}: {detail}")
            if available:
                result = dict(station)
                result["checkedAt"] = utc_now()
                status_match = re.match(r"HTTP (\d{3})", detail)
                status_code = int(status_match.group(1)) if status_match else 0
                result["healthStatus"] = "responding" if 400 <= status_code < 500 else "available"
                reachable.append(result)
    return reachable


def completeness(station: dict[str, Any]) -> int:
    score = sum(bool(clean_text(station.get(field))) for field in ("name", "domain", "summary", "category", "updatedAt"))
    score += sum(min(len(as_text_list(station.get(field))), 5) for field in ("tags", "models", "benefits", "requirements", "notes"))
    return score


def validate_output(stations: list[dict[str, Any]]) -> None:
    if not stations:
        raise AggregationError("no reachable stations remained; refusing to overwrite the snapshot")
    ids: set[str] = set()
    required = {"id", "name", "domain", "url", "summary", "category", "checkedAt", "healthStatus", "sourceIds"}
    for station in stations:
        missing = required.difference(station)
        if missing:
            raise AggregationError(f"station is missing fields {sorted(missing)}: {station.get('id')}")
        station_id = clean_text(station.get("id"))
        if not station_id or station_id in ids:
            raise AggregationError(f"duplicate or empty station id: {station_id}")
        ids.add(station_id)
        if not canonical_url(clean_text(station.get("url"))):
            raise AggregationError(f"invalid station URL: {station.get('url')}")
        if station["healthStatus"] not in {"available", "responding"}:
            raise AggregationError(f"invalid station health status: {station_id}")


def write_snapshot(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    serialized = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False, newline="\n") as handle:
        handle.write(serialized)
        temporary = Path(handle.name)
    os.replace(temporary, path)


def aggregate(output: Path, *, skip_health_check: bool, workers: int, health_timeout: int) -> dict[str, Any]:
    previous = load_previous(output)
    parsers: dict[str, Callable[[str], list[dict[str, Any]]]] = {
        "baipiao": parse_baipiao,
        "dengdeng": parse_dengdeng,
        "ai-relay": parse_ai_relay,
        "gongyijihe": parse_gongyijihe,
        "lujin": parse_lujin,
    }
    records: list[dict[str, Any]] = []
    failed_sources: list[str] = []
    successful_sources: list[str] = []

    for source_id in SOURCE_PRIORITY:
        try:
            source = fetch_text(SOURCE_URLS[source_id])
            parsed = parsers[source_id](source)
            if not parsed:
                raise AggregationError("adapter returned zero records")
            records.extend(parsed)
            successful_sources.append(source_id)
            print(f"[source] {source_id}: {len(parsed)} records")
        except Exception as error:
            failed_sources.append(source_id)
            print(f"[source] {source_id} failed: {error}", file=sys.stderr)

    if not successful_sources:
        raise AggregationError("all five sources failed; keeping the previous snapshot")

    recovered = fallback_records(previous, failed_sources)
    if recovered:
        records.extend(recovered)
        print(f"[fallback] recovered {len(recovered)} previous records for {', '.join(failed_sources)}")

    stations = merge_records(records)
    print(f"[merge] {len(records)} source records -> {len(stations)} unique domains")
    if skip_health_check:
        checked_at = utc_now()
        stations = [{**station, "checkedAt": checked_at, "healthStatus": "available"} for station in stations]
    else:
        stations = verify_stations(stations, workers=workers, timeout=health_timeout)

    stations.sort(
        key=lambda station: (
            not bool(station.get("recommended")),
            -completeness(station),
            clean_text(station.get("name")).casefold(),
        )
    )
    for station in stations:
        for private_key in ("_source", "_sourceRank", "_sourceOrder"):
            station.pop(private_key, None)
    validate_output(stations)

    payload = {
        "generatedAt": utc_now(),
        "total": len(stations),
        "stations": stations,
    }
    write_snapshot(output, payload)
    print(f"[output] wrote {len(stations)} stations to {output}")
    return payload


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--skip-health-check", action="store_true", help="Only for local parser tests")
    parser.add_argument("--workers", type=int, default=12)
    parser.add_argument("--health-timeout", type=int, default=HEALTH_TIMEOUT)
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        aggregate(
            args.output.resolve(),
            skip_health_check=args.skip_health_check,
            workers=max(1, min(args.workers, 24)),
            health_timeout=max(3, min(args.health_timeout, 30)),
        )
    except Exception as error:
        print(f"aggregation failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
