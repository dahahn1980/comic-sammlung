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
PPM_URL = "https://www.ppm-vertrieb.de/katalog.html%26filter%3Dletzten-wochen"
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


def fetch(url: str) -> bytes:
    request = Request(url, headers={"User-Agent": USER_AGENT})
    with urlopen(request, timeout=45) as response:
        return response.read()


def catalog_pages(first_html: bytes) -> list[bytes]:
    from bs4 import BeautifulSoup

    soup = BeautifulSoup(first_html, "html.parser")
    page_numbers = {
        int(link.get_text(strip=True))
        for link in soup.select("ul.pagination a.page-link")
        if link.get_text(strip=True).isdigit()
    }
    last_page = max(page_numbers, default=1)
    pages = [first_html]
    for page in range(2, last_page + 1):
        url = f"https://www.ppm-vertrieb.de/katalog.html%26filter%3Dletzten-wochen%26page%3D{page}"
        pages.append(fetch(url))
    return pages


def parse_catalog(pages: list[bytes], today: date, rules: dict, comics: list[dict], series: list[dict]) -> list[dict]:
    from bs4 import BeautifulSoup

    known_people = {author.casefold() for comic in comics for author in comic.get("authors", [])}
    known_series = {entry["title"].casefold() for entry in series if entry.get("title")}
    releases = []
    for html in pages:
        soup = BeautifulSoup(html, "html.parser")
        for heading in soup.select("h4.product-listing-name"):
            row = heading.find_parent("div", class_="row")
            if not row:
                continue
            link = heading.find("a", href=True)
            isbn_match = re.search(r"ISBN:\s*([0-9Xx-]{10,17})", row.get_text(" ", strip=True))
            price_node = row.select_one(".product-listing-products-price")
            price_match = re.search(r"(\d+[,.]\d{2})\s*€", price_node.get_text(" ", strip=True) if price_node else "")
            if not link or not isbn_match or not price_match:
                continue
            publisher_link = row.select_one('a[href*=":.:"]')
            publisher = normalized(publisher_link.get_text(" ", strip=True) if publisher_link else "")
            subtitle_node = row.select_one(".product-listing-name-2")
            authors = [
                normalized(author.get_text(" ", strip=True))
                for author in row.select('a[href*="/autor/"]')
                if normalized(author.get_text(" ", strip=True))
            ]
            image = row.find("img")
            isbn = isbn_match.group(1).replace("-", "")
            text = normalized(row.get_text(" ", strip=True))
            release = {
                "id": f"ppm-{isbn}",
                "isbn13": isbn,
                "title": normalized(link.get_text(" ", strip=True)),
                "subtitle": normalized(subtitle_node.get_text(" ", strip=True) if subtitle_node else ""),
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
        html = fetch(PPM_URL)
    pages = [html] if args.fixture else catalog_pages(html)
    incoming = parse_catalog(pages, today, rules, comics, series)
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
