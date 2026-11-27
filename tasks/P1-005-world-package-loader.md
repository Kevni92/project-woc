# P1-005 — Laufzeitladbare World Packages
Status. Erledigt am 27.11.2026. [World Package](../docs/architecture/world-package.md) · [World Studio](../docs/design/world-studio.md)
## Ziel
Eine zweite, kleine gültige Stadt (z.B. Cove erweitert mit Graph/Spawns) und Breakwater ohne Neubuild zwischen Starts auswählen; native CLI/Server und WASM verwenden gleiche semantische Bytes, Browser passend Visual/Theme. Kein GIS nötig.
## Umfang
Manifest/Schemas, Paketloader/Validierung/Hashes, Breakwater-Migration ohne semantische Veränderung, statische Content-Basis, native --world und CLI, explizite Endpoint-Definition/Lebensdauer, WASM-Init-ABI vor Tick/Ports, TS WorldContext statt globaler Breakwater-Imports, Welcome-Kompatibilität mit Hash, ggf. v3. Debugger, Route, Marker, Kamera und beide Transporte erhalten. Test-Assets klein; keine großen Exporte pushen.
## Erweiterbarkeit (ohne Gameplay-Implementierung)
[Game Content](../docs/architecture/game-content.md) beachten: Manifest/Loader nicht auf genau eine Karten-Dateiliste ohne versionierbare Erweiterungsstelle festlegen; Modulrollen, Version/Hash und benötigte Fähigkeiten dokumentieren. Karten ohne spätere Module bleiben gültig; unbekannte erforderliche Rollen nicht still ignorieren. Keine Gameplay-Schemas, neue Registry, Charakter-Umbau oder Regelinterpreter jetzt implementieren; feste Test-Spawns sind bewusst vorläufig. Keine neue Protokollversion allein für die spätere Erweiterungsstelle.
## Abnahme
- [x] Zwei Pakete im selben nativen Binary und WASM-Modul laden. Cove hat andere Geometrie, Ziele und Startpositionen.
- [x] CLI-, WASM- und WebSocket-Transkripte stimmen pro Welt überein. Beide Clients teilen die gewählte Welt. Die Breakwater-Fixture prüft weiterhin dieselben Reisen, Positionen und Leases.
- [x] Prüfsummenfehler, fehlende Dateien, Traversal, Versionen, Welt-ID und fehlerhaftes WASM-Init kontrolliert abweisen. Der Worker startet Uhr und Ports nach erfolgreicher Prüfung, und erneutes Verbinden startet nach einem Fehler einen neuen Worker.
- [x] Browser und Debugger beziehen Orte aus dem Paket. HUD, Reisevorschau, Ankunft, Mehrclientbetrieb und Resynchronisierung sind geprüft.
- [x] Builds und Regressionen ausgeführt. README, Architektur, Task, Roadmap und Entscheidungslog aktualisiert.

## Ergebnis

Breakwater liefert die bisherigen semantischen Bytes unter dem neuen Pfad. Das spielbare Cove hat vier Wegknoten, drei Kanten und zwei Reiseziele. Die Protokollversion 3 prüft die Paketidentität im Handshake. Das Verzeichnis bestimmt der native Startparameter oder die URL des Browsers. [Paketvertrag](../docs/architecture/world-package.md) · [Startanleitung](../README.md#welt-auswählen)

### Verifikation

- Native CMake-Konfiguration und Build, CTest 1/1, Emscripten-Konfiguration und WASM-Build.
- Typecheck ohne Fehler oder Warnungen, 31 Vitest-Tests und Vite-Build erfolgreich. Das WASM-Modul umfasst mit der gemeinsamen Schema- und Hashprüfung 675,59 kB, gzip 211,74 kB.
- 20 Playwright-Tests mit der Produktionsvorschau und dem Dev-Vertragsharness. Geprüft wurden unter anderem beide Paketstarts, Cove-Ankunft, native Startfehler, HTTP-Wiederholung, unabhängige WASM-Prüfung und die Ablehnung desselben Weltstands mit abweichendem semantischem Hash.

Abgrenzung. OSM, Studio, ZIP und Streaming, NPC-Umbau, Live-Weltwechsel sowie Gameplay-Module gehören zu späteren Schnitten.
