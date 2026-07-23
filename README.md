# Daniels Comicarchiv

Erster Prototyp eines persönlichen digitalen Comic-Katalogs.

## Aktueller Prototyp

- persönliche Übersicht mit Kennzahlen und zuletzt ergänzten Comics
- filterbare und sortierbare Sammlungsgalerie
- Reihenansicht und Wunschliste
- Detailseiten mit bibliografischen und privaten Sammlungsdaten
- responsive Darstellung für Smartphone, Tablet und Desktop
- lokale Coverdateien statt externer Bildverlinkung
- kuratierter PPM-Neuheiten-Katalog mit wöchentlichem Import

## Neuheiten-Automatik

Der Workflow `PPM-Neuheiten aktualisieren` läuft montags. Er übernimmt das
komplette Splitter-Programm, frankobelgische Verlage und Treffer zu bereits
vorhandenen Reihen oder Beteiligten. Marvel, DC, Manga, Manhwa, Manhua,
Light Novels und Werbemittel werden ausgeschlossen. Frühere ungesichtete
Titel bleiben im Eingang erhalten; Varianten und Neu-/Gesamtausgaben werden
gesondert gekennzeichnet. Die Regeln stehen in `data/release-rules.json`.

Die beiden echten Datensätze liegen in `data/comics.json`. Acht deutlich
markierte Demo-Karten zeigen, wie eine größere Sammlung wirkt; sie gehören
nicht zum Bestand. Cover liegen in `assets/`, die Reihenstruktur in
`data/series.json`.

Die interaktiven Schalter sind im Prototyp noch nicht dauerhaft gespeichert.
Als nächster Ausbauschritt kann eine geschützte Eingabemaske mit privater
Datenablage ergänzt werden.

Die Website wird automatisch über GitHub Pages veröffentlicht.
