#!/usr/bin/env python3
"""Importiert PPM-Neuheiten, kuratiert sie und erhält frühere Sichtungsstände."""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import date, datetime
from pathlib import Path
from urllib.parse import urljoin
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
PPM_URL = "https://www.ppm-vertrieb.de/index.php?filter=letzten-wochen&site=print_katalog"
USER_AGENT = "Daniel-Hahn-Comicarchiv/1.0 (+private curated catalogue)"


def normalized(value: str | None) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def iso_week(value: date) -> str:
    year, week, _ = value.isocalendar()
    return f"{year}-KW{week:02d}"


def contains_any(text: str, terms: list[str]) -> bool:
    folded = text.casefold()
    return any(term.casefold() in folded for term in terms)


def classify(item: dict, rules: dict, known_people: set[str], known_series: set[str]) -> tuple[bool, str]:
    publisher = item["publisher"]
    text = " ".join([item["title"], item.get("subtitle", ""), publisher, *item.get("authors", [])])
    if publisher in rules["excludedPublishers"] or contains_any(text, rules["excludedTerms"]):
        return False, "excluded"
    if publisher in rules["alwaysIncludePublishers"]:
        return True, "splitter"
    if publisher in rules["francoBelgianPublishers"]:
        return True, "franco-belgisch"
    if {name.casefold() for name in item.get("authors", [])} & known_people:
        return True, "sammlungsbezug"
    title = item["title"].casefold()
    if any(series in title for series in known_series if len(series) > 3):
        return True, "sammlungsbezug"
    return False, "outside-scope"


def parse_catalog(html: bytes, today: date, rules: dict, comics: list[dict], series: list[dict]) -> list[dict]:
    from bs4 import BeautifulSoup
    from bs4.element import NavigableString

    soup = BeautifulSoup(html, "html.parser")
    known_people = {author.casefold() for comic in comics for author in comic.get("authors", [])}
    known_series = {entry["title"].casefold() for entry in series if entry.get("title")}
    recognized_publishers = set(
        rules["alwaysIncludePublishers"] + rules["francoBelgianPublishers"] + rules["excludedPublishers"]
    )
    all_links = soup.find_all("a", href=True)
    products = [
        link for link in all_links
        if re.search(r"::(\d+)\.html", link["href"]) and normalized(link.get_text(" ", strip=True))
    ]
    link_positions = {id(link): index for index, link in enumerate(all_links)}
    releases = []
    for index, link in enumerate(products):
        next_link = products[index + 1] if index + 1 < len(products) else None
        strings = []
        for element in link.next_elements:
            if element is next_link:
                break
            if isinstance(element, NavigableString):
                strings.append(str(element))
        text = normalized(" ".join(strings))
        isbn_match = re.search(r"ISBN:\s*([0-9Xx-]{10,17})", text)
        price_match = re.search(r"(\d+[,.]\d{2})\s*€", text)
        if not isbn_match or not price_match:
            continue
        title = normalized(link.get_text(" ", strip=True))
        current_position = link_positions[id(link)]
        previous_position = link_positions[id(products[index - 1])] if index else 0
        preceding = [
            normalized(anchor.get_text(" ", strip=True))
            for anchor in all_links[previous_position + 1:current_position]
            if normalized(anchor.get_text(" ", strip=True))
        ]
        publisher = next((name for name in preceding if name in recognized_publishers), "")
        if not publisher:
            publisher = preceding[0] if preceding else ""
        authors = [name for name in preceding if name not in {publisher, title} and len(name) > 2][-4:]
        image = link.find_previous("img")
        isbn = isbn_match.group(1).replace("-", "")
        release = {
            "id": f"ppm-{isbn}",
            "isbn13": isbn,
            "title": title,
            "subtitle": "",
            "publisher": publisher,
            "authors": authors,
            "price": float(price_match.group(1).replace(",", ".")),
            "releaseDate": today.isoformat(),
            "calendarWeek": iso_week(today),
            "firstSeenAt": today.isoformat(),
            "cover": urljoin(PPM_URL, image.get("src", "")) if image else "",
            "sourceUrl": urljoin(PPM_URL, link["href"]),
        }
        include, scope = classify(release, rules, known_people, known_series)
        if not include:
            continue
        release["scope"] = scope
        release["editionType"] = (
            "variant" if contains_any(text, rules["variantTerms"])
            else "new-edition" if contains_any(text, rules["editionTerms"])
            else "regular"
        )
        releases.append(release)
    return releases


def merge(existing: list[dict], incoming: list[dict]) -> list[dict]:
    by_id = {item["id"]: item for item in existing}
    for item in incoming:
        old = by_id.get(item["id"], {})
        item["firstSeenAt"] = old.get("firstSeenAt", item["firstSeenAt"])
        item["calendarWeek"] = old.get("calendarWeek", item["calendarWeek"])
        by_id[item["id"]] = {**old, **item}
    return sorted(by_id.values(), key=lambda item: (item.get("firstSeenAt", ""), item["title"]), reverse=True)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--fixture", type=Path, help="Lokale HTML-Datei statt Live-Abruf")
    parser.add_argument("--date", help="Importdatum YYYY-MM-DD")
    parser.add_argument("--check", action="store_true", help="Nur validieren, nicht schreiben")
    args = parser.parse_args()
    today = datetime.strptime(args.date, "%Y-%m-%d").date() if args.date else date.today()
    rules = json.loads((ROOT / "data/release-rules.json").read_text())
    comics = json.loads((ROOT / "data/comics.json").read_text())
    series = json.loads((ROOT / "data/series.json").read_text())
    output = ROOT / "data/new-releases.json"
    existing = json.loads(output.read_text())
    if args.fixture:
        html = args.fixture.read_bytes()
    else:
        request = Request(PPM_URL, headers={"User-Agent": USER_AGENT})
        with urlopen(request, timeout=45) as response:
            html = response.read()
    incoming = parse_catalog(html, today, rules, comics, series)
    if not incoming:
        print("Fehler: Der PPM-Abruf ergab keine passenden Titel.", file=sys.stderr)
        return 2
    merged = merge(existing, incoming)
    print(f"{len(incoming)} passende PPM-Titel; {len(merged)} Titel im dauerhaften Eingang.")
    if not args.check:
        output.write_text(json.dumps(merged, ensure_ascii=False, indent=2) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
