"""Refresh the Papers with Code supplement used by CCFDDL."""

import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen


SOURCE_URL = "https://paperswithcode.co/api/v1/conferences/deadlines"
OUTPUT = Path(__file__).resolve().parents[1] / "utils/CCFDDL/assets/data/ai-deadlines.json"


def normalize(payload):
    results = payload.get("results")
    if not isinstance(results, list) or not results:
        raise ValueError("Conference response has no results")

    conferences = []
    seen = set()
    for record in results:
        name = str(record.get("short_name") or "").strip()
        year = record.get("year")
        if not name or not isinstance(year, int):
            raise ValueError("Conference is missing short_name or year")
        key = (name.casefold(), year)
        if key in seen:
            raise ValueError(f"Duplicate conference: {name} {year}")
        seen.add(key)

        deadlines = []
        for event in record.get("deadlines") or []:
            timestamp = event.get("deadline_at")
            if not timestamp:
                continue
            datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
            deadlines.append({
                "type": str(event.get("type") or "").strip(),
                "label": str(event.get("label") or "").strip(),
                "deadline_at": timestamp,
                "timezone": str(event.get("timezone") or "UTC").strip(),
            })

        conferences.append({
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
        })

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
