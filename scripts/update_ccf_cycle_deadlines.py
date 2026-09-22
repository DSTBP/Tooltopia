"""Refresh the CCF Cycle conference snapshot used by CCFDDL."""

from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import re
import sys
import tempfile
import threading
import time
from urllib.error import HTTPError
from urllib.parse import quote, urljoin
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
BASE_URL = "https://ccf-cycle.vercel.app"
LIST_URL = BASE_URL + "/conferences"
DEFAULT_OUTPUT = ROOT / "utils/CCFDDL/assets/data/ccf-cycle-deadlines.json"
USER_AGENTS = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 13.6; rv:128.0) Gecko/20100101 Firefox/128.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
)
EVENT_FIELDS = (
    ("abstract_deadline", "abstract"), ("deadline", "paper"),
    ("reviews_released", "review_release"), ("rebuttal_start", "rebuttal_start"),
    ("rebuttal_end", "rebuttal_end"), ("notification", "notification"),
    ("camera_ready", "camera_ready"),
)
_request_lock = threading.Lock()
_next_request_at = 0.0


class EmptyConference(ValueError):
    """A catalog entry with no year-specific conference instance."""


class PageParser(HTMLParser):
    """Read listing links, embedded RSC data and the visible change list."""

    def __init__(self) -> None:
        super().__init__()
        self.links: set[str] = set()
        self.scripts: list[str] = []
        self.changes: list[str] = []
        self._script: list[str] | None = None
        self._waiting_changes = False
        self._in_changes = False
        self._change: list[str] | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "a":
            href = dict(attrs).get("href") or ""
            if href.startswith("/conference/"):
                self.links.add(href)
        elif tag == "script":
            self._script = []
        elif tag == "ul" and self._waiting_changes:
            self._in_changes = True
            self._waiting_changes = False
        elif tag == "li" and self._in_changes:
            self._change = []

    def handle_endtag(self, tag: str) -> None:
        if tag == "script" and self._script is not None:
            self.scripts.append("".join(self._script))
            self._script = None
        elif tag == "li" and self._change is not None:
            value = " ".join("".join(self._change).split())
            if value:
                self.changes.append(value)
            self._change = None
        elif tag == "ul" and self._in_changes:
            self._in_changes = False

    def handle_data(self, data: str) -> None:
        if self._script is not None:
            self._script.append(data)
        if "与去年相比的变化" in data:
            self._waiting_changes = True
        if self._change is not None:
            self._change.append(data)


def parse_html(html: str) -> PageParser:
    parser = PageParser()
    parser.feed(html)
    return parser


def listing_paths(html: str) -> list[str]:
    paths = sorted(parse_html(html).links)
    if not paths:
        raise ValueError("CCF Cycle listing has no conference links")
    return paths


def find_conference(value: object) -> dict | None:
    if isinstance(value, dict):
        conference = value.get("conference")
        if isinstance(conference, dict) and isinstance(conference.get("instances"), list):
            return conference
        for child in value.values():
            found = find_conference(child)
            if found:
                return found
    elif isinstance(value, list):
        for child in value:
            found = find_conference(child)
            if found:
                return found
    return None


def structured_conference(scripts: list[str]) -> dict:
    prefix = "self.__next_f.push("
    for script in scripts:
        script = script.strip()
        if not script.startswith(prefix) or not script.endswith(")"):
            continue
        try:
            packet = json.loads(script[len(prefix):-1])
        except json.JSONDecodeError:
            continue
        if not isinstance(packet, list) or len(packet) < 2 or not isinstance(packet[1], str):
            continue
        # A script can contain multiple numbered React Flight frames.
        for line in packet[1].splitlines():
            if not re.match(r"^[0-9a-f]+:", line, re.I):
                continue
            try:
                frame = json.loads(line.split(":", 1)[1])
            except json.JSONDecodeError:
                continue
            conference = find_conference(frame)
            if conference:
                return conference
    raise ValueError("detail page has no structured conference data")


def iso_event(value: object) -> dict | None:
    if not isinstance(value, str):
        return None
    try:
        moment = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if moment.tzinfo is None:
        return None
    if moment.hour == moment.minute == moment.second == moment.microsecond == 0:
        return {"date": moment.date().isoformat()}
    return {"at": moment.isoformat(timespec="seconds").replace("+00:00", "Z")}


def calendar_date(value: object) -> str | None:
    parsed = iso_event(value)
    return (parsed.get("date") or parsed["at"][:10]) if parsed else None


def web_url(value: object) -> str | None:
    return value if isinstance(value, str) and value.startswith(("https://", "http://")) else None


def parse_detail(html: str, path: str) -> dict:
    page = parse_html(html)
    conference = structured_conference(page.scripts)
    instances = [item for item in conference["instances"]
                 if isinstance(item, dict) and isinstance(item.get("year"), int)]
    if not instances:
        raise EmptyConference(f"{path}: no dated conference instance")
    latest = max(instances, key=lambda item: item["year"])
    acronym = str(conference.get("title") or "").strip()
    if not acronym:
        raise ValueError(f"{path}: empty conference title")
    rounds = latest.get("rounds") or []
    events: list[dict] = []
    for index, round_data in enumerate(rounds, 1):
        if not isinstance(round_data, dict) or round_data.get("estimated"):
            continue
        cycle = f"Round {index}" if len(rounds) > 1 else ""
        for field, kind in EVENT_FIELDS:
            when = iso_event(round_data.get(field))
            if when:
                events.append({"type": kind, **({"cycle": cycle} if cycle else {}), **when})
    unique = {(event["type"], event.get("cycle", ""), event.get("at", event.get("date"))): event
              for event in events}
    record: dict = {
        "slug": path.removeprefix("/conference/"),
        "acronym": acronym,
        "year": latest["year"],
        "events": sorted(unique.values(), key=lambda item: (item.get("at", item.get("date", "")), item.get("cycle", ""), item["type"])),
        "changes": page.changes,
    }
    for field, output in (("date_start", "conferenceStart"), ("date_end", "conferenceEnd")):
        day = calendar_date(latest.get(field))
        if day:
            record[output] = day
    website = web_url(latest.get("link"))
    if website:
        record["websiteUrl"] = website
    cfp = web_url(latest.get("cfp_url")) or next(
        (url for item in rounds if isinstance(item, dict)
         if (url := web_url(item.get("cfp_url")))), None)
    if cfp:
        record["cfpUrl"] = cfp
    dblp = conference.get("dblp")
    if isinstance(dblp, str) and dblp.strip():
        record["dblpUrl"] = web_url(dblp) or f"https://dblp.org/db/{quote(dblp.strip(), safe='/')}"
    return record


def fetch_page(url: str, user_agent: str) -> str:
    global _next_request_at
    for attempt in range(2):
        with _request_lock:
            wait = _next_request_at - time.monotonic()
            if wait > 0:
                time.sleep(wait)
            _next_request_at = time.monotonic() + 0.45
        try:
            request = Request(url, headers={"User-Agent": user_agent, "Accept": "text/html"})
            with urlopen(request, timeout=15) as response:
                return response.read().decode("utf-8")
        except HTTPError as error:
            if error.code not in (429, 500, 502, 503, 504) or attempt:
                raise
            retry_after = error.headers.get("Retry-After")
            time.sleep(min(int(retry_after), 60) if retry_after and retry_after.isdigit() else 3)
        except OSError:
            if attempt:
                raise
            time.sleep(2)
    raise RuntimeError(f"request failed: {url}")


def update(output: Path, fetcher=fetch_page) -> dict:
    user_agent = USER_AGENTS[int(time.time() // 21600) % len(USER_AGENTS)]
    paths = listing_paths(fetcher(LIST_URL, user_agent))
    previous: dict[str, dict] = {}
    if output.exists():
        previous_payload = json.loads(output.read_text(encoding="utf-8"))
        previous = {"/conference/" + item["slug"]: item
                    for item in previous_payload.get("conferences", []) if item.get("slug")}
    records: list[dict] = []
    failures: list[str] = []
    live_count = 0

    def collect(path: str) -> tuple[str, dict | None, str]:
        try:
            return path, parse_detail(fetcher(urljoin(BASE_URL, path), user_agent), path), ""
        except EmptyConference:
            return path, None, "empty"
        except HTTPError as error:
            if error.code == 404:
                return path, None, "404"
            if error.code in (403, 429):
                return path, None, f"blocked HTTP {error.code}"
            return path, None, str(error)
        except (OSError, ValueError, json.JSONDecodeError) as error:
            return path, None, str(error)

    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(collect, path) for path in paths]
        for completed, future in enumerate(as_completed(futures), 1):
            path, record, error = future.result()
            if record:
                records.append(record)
                live_count += 1
            elif error == "404":
                print(f"[ccf-cycle] skipped broken detail link: {path}", file=sys.stderr)
            elif error == "empty":
                print(f"[ccf-cycle] skipped catalog entry without an edition: {path}", file=sys.stderr)
            elif error.startswith("blocked HTTP"):
                failures.append(f"{path}: {error}")
            elif path in previous:
                records.append(previous[path])
                print(f"[ccf-cycle] retained previous record for {path}: {error}", file=sys.stderr)
            else:
                failures.append(f"{path}: {error}")
            if completed % 25 == 0 or completed == len(paths):
                print(f"[ccf-cycle] processed {completed}/{len(paths)} detail links", file=sys.stderr, flush=True)
    print(f"[ccf-cycle] requests complete; {len(records)} records, {len(failures)} failures", file=sys.stderr, flush=True)
    if failures:
        raise ValueError(f"{len(failures)} detail pages failed without fallback: {'; '.join(failures[:8])}")
    if live_count == 0:
        raise ValueError("no live conference detail was refreshed")
    by_identity: dict[tuple[str, int], dict] = {}
    for record in sorted(records, key=lambda item: item["slug"]):
        identity = (re.sub(r"[^a-z0-9]", "", record["acronym"].lower()), record["year"])
        by_identity.setdefault(identity, record)
    if not by_identity:
        raise ValueError("no conference details were extracted")
    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "conferences": sorted(by_identity.values(), key=lambda item: (item["acronym"].casefold(), item["year"])),
    }
    print(f"[ccf-cycle] deduplicated {len(payload['conferences'])} editions; writing snapshot", file=sys.stderr, flush=True)
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=output.parent,
                                     delete=False, newline="\n") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
        temporary = Path(handle.name)
    os.replace(temporary, output)
    return payload


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    try:
        payload = update(args.output)
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"[ccf-cycle] update failed; previous snapshot retained: {error}", file=sys.stderr)
        return 1
    print(f"[ccf-cycle] wrote {len(payload['conferences'])} conferences to {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
