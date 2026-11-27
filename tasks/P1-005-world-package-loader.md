# P1-005 — Laufzeitladbare World Packages
Status: geplant, nächster Schnitt vor Studio/Importer. Grundlagen: [World Package](../docs/architecture/world-package.md), [World Studio](../docs/design/world-studio.md).
## Ziel
Eine zweite, kleine gültige Stadt (z.B. Cove erweitert mit Graph/Spawns) und Breakwater ohne Neubuild zwischen Starts auswählen; native CLI/Server und WASM verwenden gleiche semantische Bytes, Browser passend Visual/Theme. Kein GIS nötig.
## Umfang
Manifest/Schemas, Paketloader/Validierung/Hashes, Breakwater-Migration ohne semantische Veränderung, statische Content-Basis, native --world und CLI, explizite Endpoint-Definition/Lebensdauer, WASM-Init-ABI vor Tick/Ports, TS WorldContext statt globaler Breakwater-Imports, Welcome-Kompatibilität mit Hash, ggf. v3. Debugger, Route, Marker, Kamera und beide Transporte erhalten. Test-Assets klein; keine großen Exporte pushen.
## Abnahme
- [ ] Zwei unterschiedliche Pakete mit unterschiedlichen Geometrien, Orten und Spawns in demselben gebauten Binary/WASM zwischen Starts laden; keine Recompile.
- [ ] Native/WASM/WS Parität je Paket, beide Clients teilen eine Welt, bestehende Breakwater-Fixture weiterhin semantisch gleich.
- [ ] Hash/Version/ID-Mismatch, korrupte/fehlende Datei, ungültiger Pfad und fehlerhaftes Init kontrolliert abweisen, keine Session/Ticks bei Fehler, Retry.
- [ ] Client rendert genau geladene Welt, Routen/POIs aus ihr, keine hartcodierten Ortslisten; HUD/Debugger/Reise/Resync-Regressionen.
- [ ] Builds/CTest/Vitest/Playwright tatsächlich ausführen, README/Architektur/Task/Roadmap aktualisieren, nachvollziehbare Commits.
Out of scope: OSM, Studio, ZIP/Streaming, NPC-Umbau, Live-Weltwechsel. Ergebnis ausstehend.
