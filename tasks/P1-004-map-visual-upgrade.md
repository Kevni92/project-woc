# P1-004 — Fullscreen-Karte, Visual-Format und kartografische Detailstufe
Status. Erledigt am 27.11.2026. Abhängigkeiten P0-001, P0-002, P1-001 (erledigt).
Verbindliche Referenzen: [Art Direction](../docs/design/map-visuals.md), [Kartenformat](../docs/architecture/map-format.md). Nutzeraufnahmen wurden analysiert; visuelle Kriterien stehen textlich in der Dokumentation, keine fremden Assets nötig.

## Ziel
Breakwater als großflächige interaktive, rotierbare Stadtkarte mit schwebendem HUD und dezent detaillierten Gebäuden, Strand, tiefengestaffeltem Wasser und weicheren Straßen. Externe Generatoren sollen künftig Daten exportieren können, ohne Three.js kennen zu müssen. Bestehender C++-Graph und Reisen bleiben intakt.

## Reihenfolge in kleinen Commits (ein Task, drei prüfbare Schnitte)
A. Full-viewport HUD + freie Rotation: MapView/MapViewport/CSS/MapCamera/MapRenderer umbauen; Kontextpopover, einklappbare Listen, mobile Bottom Sheet, Reise-/Charakteraktionen, Kompass und Tasten. Bestehende Karte zunächst als Regressionstest. Rotation 360°, 2D/3D, Zoomanker, Auswahl und Marker.
B. Visual-Datenvertrag: versionierter Sidecar, Theme, JSON-Schemas, Loader und semantische Validierung, Dokumentation für externe Generatoren und zweites kleines Testfixture. Bestehende Welt v2 nicht duplizieren oder semantisch ändern. Visual-Schema separat versionieren.
C. Renderdetails: helle Tagespalette und Nachtpalette; mindestens drei Gebäudeprofile, Flach-/Satteldächer und Nahsicht-Fenster, dezente Parzellen/Grünflächen, Strand, mindestens ein Steg, räumlich stabile Wasserfarbrampe, kurvige Straßenübergänge/Rundungen und differenzierte Straßenklassen. Modular und ressourcenschonend. Details gemäß Art Direction. Keine Balkone oder komplexen Landmarken.

## Akzeptanz
- [x] Canvas füllt Browser-Viewport ohne permanente Sidebar, Header reserviert keine Kartenfläche, kein Seiten-Scroll; Overlay HUD bleibt benutzbar bei 1440×960 und 375×812. Marker-Kontextfenster positioniert sich passend und kollidiert nicht mit Rand/HUD; Listen und WebGL-Fallback bleiben erreichbar.
- [x] 360° Yaw in beide Richtungen mit stabilem Pivot, Norden zurücksetzen, Zoom/Pan/Fokus/2D/3D/Resize/Klick und Touch-/Tastaturbedienung; keine verlorenen Marker oder falsches Raycasting bei 90/180/270/360°. Teste Cursoranker, Kompass und Popup-Projektion.
- [x] Schema-Validierung und Referenzen für Visual-Daten/Theme; externe JSON-Fixture ohne Three.js importierbar; ungültige Version/ID/Geometrie liefert kontrollierten Fehler. Keine kopierten autoritativen Footprints/Positionen. Semantische Daten und Protokoll v2 bleiben kompatibel.
- [x] Nah: mindestens drei Gebäudeprofile und erkennbare Dachvariation, dezente Fenster nur bei geeignetem LOD. Fern: flache Footprints und lesbare Karte ohne Fassadenartefakte. Gebäudepicking mit richtiger ID in beiden Ansichten. Keine Balkone.
- [x] Strand, Pier und mindestens drei räumlich gebundene Wasserfarbstufen mit weichen Übergängen, keine künstlichen Küsten am Kartenrand, Nachtpalette lesbar. Straßengeometrie mit runden/sauberen Joins, konsistenter Kreuzungsfläche und Klassenunterschied; Route liegt weiterhin auf autoritativem Weg. Keine Abkürzungen über Land/Wasser/Gebäude.
- [x] Reisevorschau, MoveTo, Ankunft, Übernahme/Freigabe, Disconnect/Resync, Debugger und Client A bleiben in beiden Modi funktional. Nur Host-Zeit und Host-Zustand treiben dynamische Projektion. Keine neuen autoritativen Spielregeln.
- [x] Unit-Tests für Kamera-Yaw/Zoom/Picking-Anker, LOD, Visual-Schema/Referenzen und Geometriehelpers; Browser-E2E für Fullscreen, Rotieren, Popup, Reisen und bestehende Regressionen über WASM und WS. Native/WASM-Builds, CTest, Typecheck, Vitest, Vite und Playwright tatsächlich ausführen. Semantische Fixture-Parität erhalten.
- [x] Eigene reproduzierbare Screenshots (Tag/Nacht, Nah/Fern, 90° Rotation und mobile HUD) lokal prüfen; vor/nachher Drawcalls/Triangles und Bundlegröße dokumentieren, keine unnötigen Ressourcen bei Rotation/Zoom/Tick. Keine willkürliche absolute FPS-Anforderung ohne Hardwarebaseline. Testresultate, Entscheidungen, README, Roadmap und tatsächliche Architektur aktualisieren.

## Nicht im Umfang
Neue Stadt, Änderung des semantischen Wegenetzes, prozeduraler Kartengenerator selbst, MapLibre/Leaflet-Integration, Tile-Streaming, OSM-Import, Gebäudeinnenräume, Balkone, fotorealistische Effekte, echte Bathymetrie, Fog of War, neue Missionen/NPC-Features, öffentliche Multiplayerfunktionen. Bei tatsächlichem Bedarf an semantischer Content-Änderung separat begründen und nicht still mit Renderer vermischen.

## Ergebnis

1. Fullscreen-Karte mit Kompass, freiem Azimut, einklappbaren Listen, markerbezogenem Kontext und mobiler Auswahl. Bei engem Platz minimiert der Kontext die Überdeckung benachbarter Marker.
2. Visual-Sidecar und Coastal-Theme mit separaten JSON-Schemas, Referenz- und Geometrieprüfung. Das Cove-Fixture validiert den Export einer anderen Welt. [Formatvertrag](../docs/architecture/map-format.md)
3. Drei Gebäudeprofile mit LOD, Sand und Landnutzung, zwei dekorative Stege, Wasserfarbrampe in Weltkoordinaten und gerundete Straßenkorridore. Fassaden sind räumlich gruppiert. Nicht rechteckige Gebäude erhalten ein Flachdach. An den Kartenabschlüssen wird die Küste für die Ansicht optisch fortgesetzt. [Kartenstil](../docs/design/map-visuals.md)

`content/breakwater.json`, C++-Simulation und Protokoll v2 sind bytegleich zur Basis. Die Spielzeit und alle dynamischen Projektionen kommen aus dem jeweils verbundenen Host.

### Verifikation

- `cmake --preset native`, `cmake --build --preset native` und `ctest --preset native` erfolgreich. CTest 1/1.
- `cmake --preset wasm` und `cmake --build --preset wasm` erfolgreich.
- Typecheck ohne Warnungen, Vitest 24/24 und Vite-Produktionsbuild erfolgreich. Vite meldet weiterhin einen JS-Chunk oberhalb von 500 kB.
- Playwright Chromium 12/12. Live-Reisen und Charaktersteuerung über beide Transporte, Vertragsfixture gegen die native CLI, Wiederherstellung nach Delta-Verlust, Debugger, Vollrotation, Gebäudepicking, WebGL-Fallback und Touch-Pinch.
- Sieben Browser-Screenshots lokal visuell geprüft. Desktop 1440 × 960 in der 2D-Übersicht, am Civic-Avenue-Knoten, am Strand mit 90° Azimut sowie an den Stegen bei 08:00 und 21:00. Mobil 375 × 812 mit kontrolliertem Charakter, privatem Bargeld und Reisevorschau. Reproduktion mit `npm --prefix client run test:e2e -- map-visual.spec.ts`. Die PNGs liegen in `client/test-results/`.

### Render-Messung

`renderer.info` direkt nach `render()` mit Chromium Headless, 1440 × 960 Browser-Viewport und DPR 1, ohne aktive Route oder Auswahl. Basis ist `56b70bf`. Jeweils Startübersicht und Startbereichsfokus mit 76 m vertikaler Spanne. Canvasgröße und Standardausrichtung folgen dem jeweiligen Stand. Geometrien und Texturen sind die bis zum jeweiligen Frame belegten Ressourcen.

| Ansicht | Draw Calls vorher → nachher | Dreiecke vorher → nachher | Geometrien vorher → nachher | Texturen vorher → nachher |
|---|---:|---:|---:|---:|
| 2D-Übersicht | 100 → 16 | 2.607 → 2.662 | 100 → 16 | 0 → 1 |
| 3D-Fokus | 35 → 22 | 2.612 → 4.487 | 117 → 26 | 0 → 1 |

Die Wassertextur belegt 256 KiB Texeldaten. Die zusätzlichen Nahsicht-Dreiecke enthalten Dächer, Wände, Fassaden und Straßenbereiche. Die Geometriegruppen reduzieren die Zahl der Draw Calls. Rotieren, Zoomen und Zeitwechsel verwenden dieselben statischen Puffer und Texturen.

Minifizierter Vite-Output in kB. Klammern geben die gzip-Größe an.

| Bundle | Basis | P1-004 |
|---|---:|---:|
| JS-Einstieg und Kartenchunk | 837,64 (227,05) | 836,66 (229,78) |
| Karten-CSS | 9,89 (2,90) | 11,19 (3,16) |
| WASM | 204,77 (78,24) | 204,77 (78,24) |
