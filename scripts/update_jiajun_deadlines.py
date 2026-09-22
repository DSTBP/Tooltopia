"""Refresh the CCFDDL time-only snapshot from Jiajun Huang Deadlines."""

from __future__ import annotations

import argparse
from datetime import date, datetime, time, timedelta, timezone
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import re
import sys
import tempfile
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo


ROOT = Path(__file__).resolve().parents[1]
SOURCE_URL = "https://jiajunhuang1999.github.io/deadlines/"
DEFAULT_OUTPUT = ROOT / "utils/CCFDDL/assets/data/jiajun-deadlines.json"
ACRONYM_RE = re.compile(r"^(.+?)\s*['’]\s*(\d{2})$")


class DeadlineDataParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.in_data = False
        self.parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "script" and dict(attrs).get("id") == "ddl-data":
            self.in_data = True

    def handle_endtag(self, tag: str) -> None:
        if tag == "script":
            self.in_data = False

    def handle_data(self, data: str) -> None:
        if self.in_data:
            self.parts.append(data)


def read_page_data(html: str) -> list[dict]:
    parser = DeadlineDataParser()
    parser.feed(html)
    if not parser.parts:
        raise ValueError("page has no #ddl-data JSON")
    records = json.loads("".join(parser.parts))
    if not isinstance(records, list) or not records:
        raise ValueError("#ddl-data is empty or is not an array")
    return records


def calendar_date(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    try:
        return date.fromisoformat(value.strip()).isoformat()
    except ValueError:
        return None


def precise_time(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    try:
        moment = datetime.fromisoformat(value.strip())
    except ValueError:
        return None
    return moment.isoformat(timespec="seconds") if moment.tzinfo else None


def dated_clock(day: str, zone_label: str | None) -> str | None:
    """Use only clock times explicitly supplied by the source (or its AoE default)."""
    label = (zone_label or "AoE").strip()
    if label.lower() == "aoe":
        return f"{day}T23:59:59-12:00"
    match = re.fullmatch(r"(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(UTC|EST|US PDT|US EDT|PT|AoE)", label, re.I)
    if not match:
        return None
    hour, minute = int(match[1]), int(match[2] or 0)
    if match[3]:
        hour = hour % 12 + (12 if match[3].lower() == "pm" else 0)
    if hour > 23 or minute > 59:
        return None
    zone = match[4].upper()
    if zone == "PT":
        tz = ZoneInfo("America/Los_Angeles")
    else:
        offsets = {"UTC": 0, "EST": -5, "US PDT": -7, "US EDT": -4, "AOE": -12}
        tz = timezone(timedelta(hours=offsets[zone]))
    return datetime.combine(date.fromisoformat(day), time(hour, minute), tz).isoformat(timespec="seconds")


def add_event(events: list[dict], kind: str, value: object, *, cycle: str = "",
              label: str = "", zone: str = "", exact: bool = False,
              end: object = None) -> None:
    at = precise_time(value) if exact else None
    day = calendar_date(value) if not at else None
    if not at and not day:
        return
    event: dict[str, str] = {"type": kind}
    if cycle:
        event["cycle"] = cycle
    if label:
        event["label"] = label
    if at:
        event["at"] = at
    else:
        event["date"] = day
    end_day = calendar_date(end)
    if end_day and end_day != day:
        event["endDate"] = end_day
    if zone:
        event["timezone"] = zone
    events.append(event)


def milestone_type(label: str) -> str:
    lowered = label.casefold()
    if "camera ready" in lowered or "final paper" in lowered:
        return "camera_ready"
    if "notification" in lowered or "revision result" in lowered:
        return "notification"
    if "feedback" in lowered or "first decision" in lowered:
        return "review_release"
    if "rebuttal" in lowered or "author response" in lowered:
        return "rebuttal"
    if "revision due" in lowered:
        return "revision_due"
    return "milestone"


def extract_conferences(records: list[dict]) -> list[dict]:
    by_identity: dict[tuple[str, int], dict] = {}
    for record in records:
        if not isinstance(record, dict) or record.get("estimated"):
            continue
        acronym = ACRONYM_RE.fullmatch(str(record.get("acronym") or "").strip())
        if not acronym:
            raise ValueError(f"unknown conference acronym: {record.get('acronym')!r}")
        name, year = acronym[1].strip(), 2000 + int(acronym[2])
        identity = (re.sub(r"[^a-z0-9]", "", name.lower()), year)
        if not identity[0]:
            raise ValueError("empty conference acronym")
        entry = by_identity.setdefault(identity, {"acronym": name, "year": year, "events": []})
        for source_field, output_field in (("conf_start", "conferenceStart"), ("conf_end", "conferenceEnd")):
            day = calendar_date(record.get(source_field))
            if day and output_field not in entry:
                entry[output_field] = day
        events = entry["events"]
        cycle = str(record.get("cycle") or "").strip()
        zone = str(record.get("submission_timezone") or "AoE").strip()
        for field, kind in (("abstract", "abstract"), ("deadline", "paper")):
            day = calendar_date(record.get(field))
            if not day:
                continue
            explicit = precise_time(record.get("deadline_at")) if kind == "paper" else None
            at = explicit or dated_clock(day, zone)
            add_event(events, kind, at or day, cycle=cycle, zone=zone, exact=bool(at))
        add_event(events, "notification", record.get("notification"), cycle=cycle)
        for milestone in record.get("milestones") or []:
            if not isinstance(milestone, dict):
                continue
            label = str(milestone.get("label") or "").strip()
            milestone_zone = str(milestone.get("timezone") or "").strip()
            start = milestone.get("start")
            end = milestone.get("end")
            # A date range has no precise start clock, even if its end has one.
            at = dated_clock(calendar_date(start), milestone_zone) if calendar_date(start) and not end and milestone_zone and milestone_zone.lower() != "aoe" else None
            add_event(events, milestone_type(label), at or start, cycle=cycle, label=label,
                      zone=milestone_zone, exact=bool(at), end=end)
        for rolling in record.get("rolling_cycles") or []:
            if not isinstance(rolling, dict):
                continue
            rolling_cycle = str(rolling.get("label") or "").strip()
            for field, kind in (("abstract_at", "abstract"), ("deadline_at", "paper"), ("notification_at", "notification")):
                add_event(events, kind, rolling.get(field), cycle=rolling_cycle,
                          zone=zone, exact=True)

    conferences: list[dict] = []
    for entry in by_identity.values():
        unique: dict[tuple, dict] = {}
        for event in entry["events"]:
            key = (event["type"], event.get("cycle", ""),
                   event.get("label", "") if event["type"] == "milestone" else "",
                   event.get("at", event.get("date")), event.get("endDate"))
            unique.setdefault(key, event)
        entry["events"] = sorted(unique.values(), key=lambda event: (
            event.get("at", event.get("date", ""))[:10], event.get("at", ""),
            event.get("cycle", ""), event["type"]
        ))
        if entry["events"] or entry.get("conferenceStart") or entry.get("conferenceEnd"):
            conferences.append(entry)
    if not conferences:
        raise ValueError("no dated conference events were extracted")
    return sorted(conferences, key=lambda entry: (entry["acronym"].casefold(), entry["year"]))


def build_payload(html: str) -> dict:
    conferences = extract_conferences(read_page_data(html))
    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "conferences": conferences,
    }


def update(output: Path, html: str | None = None) -> dict:
    if html is None:
        request = Request(SOURCE_URL, headers={"User-Agent": "Mozilla/5.0 Tooltopia/CCFDDL"})
        with urlopen(request, timeout=20) as response:
            html = response.read().decode("utf-8")
    payload = build_payload(html)
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
        print(f"[jiajun-deadlines] update failed; previous snapshot retained: {error}", file=sys.stderr)
        return 1
    print(f"[jiajun-deadlines] wrote {len(payload['conferences'])} conferences to {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
