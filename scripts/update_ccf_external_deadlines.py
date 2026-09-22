"""Refresh the c01dkit or MPC conference deadline snapshot for CCFDDL."""

from __future__ import annotations

import argparse
from datetime import date, datetime, time, timedelta, timezone
import json
from pathlib import Path
import re
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "utils/CCFDDL/assets/data"
SOURCES = {
    "c01dkit": (
        "https://raw.githubusercontent.com/c01dkit/sec-papers-collection/main/src/assets/data/submission-timeline.json",
        DATA_DIR / "c01dkit-deadlines.json",
    ),
    "mpc": (
        "https://raw.githubusercontent.com/mpc-deadlines/mpc-deadlines.github.io/main/_data/conferences.yml",
        DATA_DIR / "mpc-deadlines.json",
    ),
}
DAY = r"\d{4}-\d{2}-\d{2}"
MONTHS = {name.lower(): index for index, name in enumerate(
    ("January", "February", "March", "April", "May", "June", "July", "August",
     "September", "October", "November", "December"), 1)}
MONTHS.update({name[:3]: index for name, index in list(MONTHS.items())})


def acronym(name: str) -> str:
    special = {
        "The Web Conference": "WWW",
        "ACM SIGMOD+PODS (PODS)": "PODS",
        "ACM SIGMOD+PODS (SIGMOD)": "SIGMOD",
    }
    if name in special:
        return special[name]
    return re.sub(r"\s*\(Oakland\)$", "", re.sub(r"^(?:ACM|IEEE)\s+", "", name)).strip()


def event(kind: str, cycle: str, label: str, *, at: str = "", day: str = "",
          end: str = "", zone: str = "") -> dict:
    result = {"type": kind, "cycle": cycle, "label": label}
    if at:
        result.update(at=at, timezone=zone)
    else:
        result["date"] = day
        if end:
            result["endDate"] = end
    return result


def unique_events(events: list[dict]) -> list[dict]:
    result = []
    seen = set()
    for item in events:
        identity = (item["type"], item["cycle"], item.get("at", item.get("date")),
                    item.get("endDate", ""))
        if identity not in seen:
            seen.add(identity)
            result.append(item)
    return result


def c01dkit_type(stage: str) -> str:
    text = stage.lower()
    if "abstract" in text:
        return "abstract"
    if "registration" in text:
        return "registration"
    if "paper submission" in text or "paper submissions" in text:
        return "paper"
    if "artifact" in text:
        return "supplementary"
    if "reviews released" in text or "reviews" in text:
        return "review_release"
    if "beginning" in text and "rebuttal" in text:
        return "rebuttal_start"
    if "end of" in text and "rebuttal" in text:
        return "rebuttal_end"
    if "rebuttal period" in text:
        return "rebuttal"
    if "rebuttal" in text:
        return "rebuttal_end"
    if "early" in text and ("reject" in text or "notification" in text):
        return "first_notification"
    if "notification" in text or "decision" in text:
        return "notification"
    if "camera" in text or "final papers" in text:
        return "camera_ready"
    if "revision" in text:
        return "revision_due"
    return "milestone"


def normalize_c01dkit(records: object) -> list[dict]:
    if not isinstance(records, list) or not records:
        raise ValueError("c01dkit data is empty")
    output = []
    for record in records:
        match = re.fullmatch(r"(.+?)\s+(\d{4})", str(record.get("publication", "")).strip())
        if not match:
            continue
        name, year = acronym(match[1]), int(match[2])
        events = []
        for index, cycle in enumerate(record.get("cycles") or [], 1):
            if "tentative" in str(cycle.get("name", "")).lower():
                continue
            cycle_name = f"Round {index}" if len(record["cycles"]) > 1 else ""
            for deadline in cycle.get("ddls") or []:
                stage = str(deadline.get("stage") or "").strip()
                value = str(deadline.get("date") or "").strip()
                kind = c01dkit_type(stage)
                span = re.fullmatch(rf"({DAY})\s*~\s*({DAY})", value)
                if span:
                    start, end = span.groups()
                    if date.fromisoformat(end) >= date.fromisoformat(start):
                        events.append(event(kind, cycle_name, stage, day=start, end=end))
                    continue
                if not re.fullmatch(DAY, value):
                    continue
                date.fromisoformat(value)
                # The publication timezone specifies closing time for submissions,
                # not when reviews or notifications are actually released.
                exact = kind in {"abstract", "registration", "paper", "supplementary"}
                aoe = "AoE" in str(record.get("timezone") or "")
                if exact and aoe:
                    events.append(event(kind, cycle_name, stage,
                                        at=f"{value}T23:59:59-12:00", zone="AoE"))
                else:
                    events.append(event(kind, cycle_name, stage, day=value))
        events = unique_events(events)
        if events:
            output.append({
                "acronym": name, "year": year,
                "name": name, "websiteUrl": str(record.get("url") or ""),
                "conferenceDate": str(record.get("date") or "TBA"),
                "place": str(record.get("place") or "TBA"),
                "tags": [], "events": events,
            })
    if not output:
        raise ValueError("c01dkit has no usable conference times")
    return output


def mpc_timestamp(value: str, zone: str) -> str | None:
    try:
        local = datetime.strptime(value, "%Y-%m-%d %H:%M")
    except ValueError:
        return None  # Includes %y-12-31 placeholders, not actual CFP dates.
    if zone == "PT":
        tz = ZoneInfo("America/Los_Angeles")
    elif zone == "EDT":
        tz = timezone(timedelta(hours=-4))
    else:
        tz = timezone(timedelta(hours=-12))
    return local.replace(tzinfo=tz).isoformat(timespec="seconds")


def month_day(value: str, reference: date, *, before: bool) -> date | None:
    match = re.fullmatch(r"([A-Za-z]+)\s+(\d{1,2})\.?", value.strip())
    if not match:
        return None
    month = MONTHS.get(match[1].lower()) or MONTHS.get(match[1][:3].lower())
    if not month:
        return None
    candidates = []
    for year in (reference.year - 1, reference.year, reference.year + 1):
        try:
            candidate = date(year, month, int(match[2]))
        except ValueError:
            continue
        gap = (reference - candidate).days if before else (candidate - reference).days
        if 0 <= gap <= 180:
            candidates.append((gap, candidate))
    return min(candidates)[1] if candidates else None


def mpc_rebuttal(value: str, deadline: date) -> tuple[str, str] | None:
    match = re.fullmatch(
        r"([A-Za-z]+)\s+(\d{1,2})\s*-\s*(?:([A-Za-z]+)\s+)?(\d{1,2})\.?",
        value.strip(), re.I)
    if not match:
        return None
    start = month_day(f"{match[1]} {match[2]}", deadline, before=False)
    if not start:
        return None
    end_month = match[3] or match[1]
    end = month_day(f"{end_month} {match[4]}", start, before=False)
    if not end or (end - start).days > 45:
        return None
    return start.isoformat(), end.isoformat()


def mpc_notifications(comment: str, deadlines: list[tuple[date, str]]) -> list[dict]:
    labels = list(re.finditer(
        r"early[- ]reject(?: notification)?|first round notification|final notification|notifications?",
        comment, re.I))
    events = []
    for index, label in enumerate(labels):
        segment = comment[label.end():labels[index + 1].start() if index + 1 < len(labels) else None]
        segment = segment.split(". ", 1)[0]
        dates = []
        for month, day, year in re.findall(r"([A-Za-z]+)\s+(\d{1,2})(?:,\s*(\d{4}))?", segment):
            if (month.lower() not in MONTHS and month[:3].lower() not in MONTHS):
                continue
            dates.append((f"{month} {day}", year))
        if len(dates) != len(deadlines):
            continue  # A single date for multiple CFP tracks has no clear round.
        kind = "first_notification" if re.search(r"early|first round", label.group(), re.I) else "notification"
        for round_index, ((submission_day, _), (value, year)) in enumerate(zip(deadlines, dates)):
            if year:
                month = MONTHS.get(value.split()[0].lower()) or MONTHS.get(value[:3].lower())
                try:
                    notified = date(int(year), month, int(value.split()[1]))
                except (TypeError, ValueError):
                    continue
            else:
                notified = month_day(value, submission_day, before=False)
            if not notified or not 0 <= (notified - submission_day).days <= 180:
                continue
            cycle = f"Round {round_index + 1}" if len(deadlines) > 1 else ""
            events.append(event(kind, cycle, label.group().capitalize(), day=notified.isoformat()))
    return events


def normalize_mpc(records: object) -> list[dict]:
    if not isinstance(records, list) or not records:
        raise ValueError("MPC data is empty")
    output = []
    by_key = {}
    for record in records:
        tags = record.get("tags") or []
        if not isinstance(tags, list) or not ({"CNF", "WK"} & set(tags)):
            continue  # Posters, journals and awards are not the main conference CFP.
        if {"EXP", "EXPCFP"} & set(tags):
            continue  # The source says these deadlines are based on a prior year.
        name, year = str(record.get("name") or "").strip(), record.get("year")
        if not name or not isinstance(year, int):
            continue
        zone = str(record.get("timezone") or "AoE").strip()
        deadlines = []
        for value in record.get("deadline") or []:
            timestamp = mpc_timestamp(str(value), zone)
            if timestamp:
                deadlines.append((date.fromisoformat(str(value)[:10]), timestamp))
        if not deadlines:
            continue
        events = []
        abstracts = [item.strip() for item in str(record.get("abdeadline") or "").split(",")]
        if str(record.get("abdeadline")) == "25th of previous month":
            abstracts = []
            for submission_day, _ in deadlines:
                prior_month = submission_day.replace(day=1) - timedelta(days=1)
                abstracts.append(date(prior_month.year, prior_month.month, 25).isoformat())
        rebuttals = [item.strip() for item in str(record.get("rebut") or "").split(",")]
        for index, (submission_day, timestamp) in enumerate(deadlines):
            cycle = f"Round {index + 1}" if len(deadlines) > 1 else ""
            if len(abstracts) == len(deadlines):
                abstract = abstracts[index]
                abstract_day = (date.fromisoformat(abstract) if re.fullmatch(DAY, abstract)
                                else month_day(abstract, submission_day, before=True))
                if abstract_day:
                    events.append(event("abstract", cycle, "Abstract deadline",
                                        day=abstract_day.isoformat()))
            events.append(event("paper", cycle, "Paper submission deadline", at=timestamp,
                                zone=zone))
            if len(rebuttals) == len(deadlines):
                span = mpc_rebuttal(rebuttals[index], submission_day)
                if span:
                    events.append(event("rebuttal", cycle, "Rebuttal period",
                                        day=span[0], end=span[1]))
        events.extend(mpc_notifications(str(record.get("comment") or ""), deadlines))
        conference_date = str(record.get("date") or "TBA").strip()
        if conference_date != "TBA" and not re.search(r"\b\d{4}\b", conference_date):
            conference_date = f"{conference_date}, {year}"
        normalized = {
            "acronym": acronym(name), "year": year,
            "name": str(record.get("description") or name),
            "websiteUrl": str(record.get("link") or ""),
            "conferenceDate": conference_date,
            "place": str(record.get("place") or "TBA"),
            "tags": tags, "events": unique_events(events),
        }
        identity = (normalized["acronym"].lower(), year)
        if identity in by_key:
            existing = by_key[identity]
            existing["events"] = unique_events(existing["events"] + normalized["events"])
        else:
            by_key[identity] = normalized
            output.append(normalized)
    if not output:
        raise ValueError("MPC has no usable conference times")
    return output


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", choices=SOURCES)
    args = parser.parse_args()
    url, output = SOURCES[args.source]
    request = Request(url, headers={"User-Agent": "Tooltopia-CCFDDL/1.0"})
    with urlopen(request, timeout=25) as response:
        raw = response.read(2_000_001)
    if len(raw) > 2_000_000:
        raise ValueError("Source response is too large")
    if args.source == "mpc":
        import yaml
        records = normalize_mpc(yaml.safe_load(raw))
    else:
        records = normalize_c01dkit(json.loads(raw))
    snapshot = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "count": len(records), "conferences": records,
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(output)
    print(f"Updated {output} with {len(records)} conferences")


if __name__ == "__main__":
    main()
