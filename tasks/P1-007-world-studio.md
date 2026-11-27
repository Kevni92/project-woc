# P1-007 — Lokales World Studio

Status: erledigt, 27.11.2026. Ziel ist ein getrenntes lokales Kartenwerkzeug; Gameplay-Editoren und ein öffentlicher Dienst bleiben außerhalb dieses Schnitts.

## Umsetzung

- Svelte 5, TypeScript, Vite, MapLibre GL JS und Terra Draw unter `tools/world-studio/`; eigener Build und kein Studio-Code im Spielbundle. Die Offline-Basiskarte benötigt keine Tiles. Ein eigener zulässiger Kartenstil und ein Geocoder lassen sich konfigurieren; Koordinaten funktionieren ohne Geocoder.
- Rechteck und Freihand mit linker Maustaste, Außenring editieren/verschieben/löschen, GeoJSON speichern/laden und ein metrisches Rechteck um die Kartenmitte erzeugen. Fläche und Ausdehnung werden mit derselben Projektion wie beim Import vermessen. Geladene Innenringe bleiben erhalten und sichtbar, sind aber nicht einzeln im Editor veränderbar.
- Versioniertes Draft-Projekt mit eigenständigem `map`-Abschnitt; Konfiguration für Welt-ID, Name, Revision, Seed, Natural/Island, Padding und lokale PBF-/Landquellen samt Provenance. Projekte sind keine Runtime-Pakete.
- FastAPI bindet über den Studio-Starter an `127.0.0.1`, prüft Host und Origin und akzeptiert nur relative Quelldateien unter dem konfigurierten Datenverzeichnis. Projekte, Jobdaten und Exporte liegen in getrennten Workspace-Verzeichnissen. Ein eigener Prozess führt den bestehenden P1-006-Importer mit Phasen, Bericht und Abbruch aus. Kein zweiter GIS-Pfad und keine erhöhten Paketlimits.
- Die Kartenvorschau zeigt schaltbare Gebäude, Straßen, Wasser, Grünflächen, Fußgraph und Spawns. Die Spielvorschau verwendet den vorhandenen Paketloader und Three.js-Renderer. Erst ein erfolgreicher Job kann ohne Überschreiben als Paket exportiert und über die lokale Paketbasis im Spiel geöffnet werden.

## Tatsächliche Prüfung

- `npm run typecheck` und `npm run build` im Studio: bestanden; Vite meldet für das Studio-Bundle einen Größenhinweis. Der MapLibre-Worker wird lokal mitgebaut.
- `python -m unittest discover -s tools/world-studio/tests -v`: 9 Tests bestanden, darunter bestehende Importer-Regressionen, Natural-/Island-Job, metrisches 5×5-km-Rechteck, Fehler, Cancel, Pfad-/Origin-Prüfungen und Export ohne Überschreiben.
- Studio-Playwright mit synthetischer Offline-Fixture: gezogene Rechteck- und Freihandauswahl, Außenringbearbeitung, erhaltene und verschobene Innenringe, Löschen, Projekt-/GeoJSON-Roundtrip, Jobfortschritt, Cancel, Fehler, Layer, Three.js-Vorschau und Export geprüft. Export im WASM-Spiel und nativen WebSocket-Host mit Charakterübernahme sowie in der CLI geladen. Der Kartenanbieter und Geocoder wurden mit lokalen Testantworten geprüft.
- Studio-Playwright mit lokalen Bremer PBF-/Landquellen und 1×1-km-AOI: Import, Qualitätsbericht, Spielvorschau, Export sowie Laden in WASM-Spiel, nativer CLI und WebSocket-Host mit Charakterübernahme bestanden. Die Ausgangsdaten und Lizenzen entsprechen den [P1-006-Messläufen](P1-006-osm-world-importer.md). Kein Download durch das Studio.
- Native und WASM-Build-Presets sowie `ctest --preset native`: bestanden. Client-Typecheck, 32 Unit-Tests und Client-Build: bestanden. Bestehende Client-Playwright-Suite mit Offline- und Bremer Paketen: 31 Tests bestanden, einschließlich beider Transporte und bestehender Gameplay-Regressionsfälle.

## Grenzen

Kein Tile- oder Geodaten-Download, keine implizite Freigabe fremder Provider und keine individuellen Innenring-Werkzeuge. Jobstatus werden nach einem Studio-Neustart nicht wieder aufgenommen; gespeicherte Projekte und Exporte bleiben erhalten. Die Spielschaltfläche erwartet den separat gestarteten Client auf Port 5173 und den laufenden lokalen Studio-Server. Die bekannten ±10-km-Koordinatengrenzen und 8-MiB-Limits pro Welt-/Visualdatei gelten unverändert. Dichte große Ausschnitte können außerdem langsam laden oder rendern; Paket- und Rendereroptimierung folgen getrennt. [Bedienung und Testbefehle](../tools/world-studio/README.md#world-studio) · [Studio-Content](../docs/design/world-studio-content.md) · [Game Content](../docs/architecture/game-content.md)
