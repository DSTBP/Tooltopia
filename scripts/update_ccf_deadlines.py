"""Refresh the Papers with Code JSON fallback for CCFDDL."""

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen


# The .com URL now redirects to an HTML page; the API is still served by .co.
SOURCE_URL = "https://paperswithcode.co/api/v1/conferences/deadlines"
OUTPUT = Path(__file__).resolve().parents[1] / "utils/CCFDDL/assets/data/ai-deadlines.json"


def conference_key(name, year):
    acronym = re.sub(r"[^a-z0-9]", "", re.sub(r"\s+\d{4}$", "", name).lower())
    aliases = {"atc": "sigopsatc", "usenixatc": "sigopsatc", "cgo": "ieeeacmcgo"}
    return aliases.get(acronym, acronym), year


def normalize(payload):
    results = payload.get("results") if isinstance(payload, dict) else None
    if not isinstance(results, list) or not results:
        raise ValueError("Conference response has no results")

    conferences = []
    by_key = {}
    for record in results:
        name = str(record.get("short_name") or "").strip()
        year = record.get("year")
        if not name or not isinstance(year, int):
            raise ValueError("Conference is missing short_name or year")

        deadlines = []
        for event in record.get("deadlines") or []:
            timestamp = event.get("deadline_at")
            if not timestamp:
                continue
            parsed = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
            if parsed.tzinfo is None:
                raise ValueError(f"Deadline lacks timezone: {name} {year}")
            deadlines.append({
                "type": str(event.get("type") or "").strip(),
                "label": str(event.get("label") or "").strip(),
                "deadline_at": timestamp,
                "timezone": str(event.get("timezone") or "UTC").strip(),
            })

        normalized = {
            "short_name": name,
            "year": year,
            "name": record.get("name"),
            "url": record.get("url"),
            "start_date": record.get("start_date"),
            "end_date": record.get("end_date"),
            "venue": record.get("venue"),
            "location": record.get("location"),
            "tags": record.get("tags") or [],
            "deadlines": deadlines,
            "updated_at": record.get("updated_at"),
        }
        identity = conference_key(name, year)
        if identity not in by_key:
            by_key[identity] = normalized
            conferences.append(normalized)
            continue

        existing = by_key[identity]
        for field in ("name", "url", "start_date", "end_date", "venue", "location"):
            if not existing[field]:
                existing[field] = normalized[field]
        existing["tags"] = list(dict.fromkeys([*existing["tags"], *normalized["tags"]]))
        event_keys = {(event["type"], event["label"], event["deadline_at"])
                      for event in existing["deadlines"]}
        for event in deadlines:
            event_key = event["type"], event["label"], event["deadline_at"]
            if event_key not in event_keys:
                existing["deadlines"].append(event)
                event_keys.add(event_key)

    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "count": len(conferences),
        "results": conferences,
    }


def main():
    request = Request(SOURCE_URL, headers={"User-Agent": "Tooltopia-CCFDDL/1.0"})
    with urlopen(request, timeout=20) as response:
        payload = json.load(response)
    snapshot = normalize(payload)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    temporary = OUTPUT.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(OUTPUT)
    print(f"Updated {OUTPUT} with {snapshot['count']} conferences")


if __name__ == "__main__":
    main()
