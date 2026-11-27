# P1-006 — Reproduzierbarer OSM-Importer
Status. Implementiert und abgenommen am 27.11.2026 gemäß D031. Abhängigkeit P1-005 ist erfüllt.
[World Studio](../docs/design/world-studio.md) · [World Package](../docs/architecture/world-package.md) · [Kartenformat](../docs/architecture/map-format.md)

## Ziel und Abgrenzung
Ein lokaler, offline reproduzierbarer Python-CLI-Importer erzeugt aus OSM-Rohdaten und einer frei geformten Auswahl ein direkt spielbares World Package. Native CLI/Server und Browser/WASM laden denselben Export ohne Rebuild pro Welt. P1-006 umfasst die dazu notwendigen Format-, Loader- und Renderer-Erweiterungen, aber keine Studio-Oberfläche (P1-007), Downloadadapter, öffentliche Dienste, Geländehöhen, Fahrzeuge, NPC-/Gameplay-Module, Streaming oder ZIP. Breakwater und Cove bleiben unverändert ladbar.

## 1. Eingabe und reproduzierbare Pipeline
- Eigenständiges Python-Modul unter `tools/world-studio/` mit CLI und wiederverwendbarer Importfunktion für P1-007. PyOsmium, Shapely, PyProj; Versionen und Windows-Installation dokumentieren. Kein Netzwerk im Importlauf.
- Lokaler OSM-PBF mit vollständigen Referenzen für die AOI plus geeignete Landpolygonquelle; synthetische Offline-Fixture. WGS84-GeoJSON (Polygon, lon/lat, konkav und mit Löchern zulässig), World-ID/Name, Revision, Seed, Modus, Padding und optional gewünschter Startpunkt als Konfiguration. Ungültige AOI, fehlende Quelle, nicht unterstützte Projektion und leere spielbare Welt als verständliche Fehler. Keine stillen Reparaturen der Nutzerauswahl.
- Ein gemeinsames lokales metrisches CRS (UTM bei geeigneter Lage, sonst lokale Azimuthal Equidistant); Ursprung AOI-Zentrum, x Ost, z Süd, y oben, Maßstab 1:1. Antimeridian/Polregionen und Exporte außerhalb der aktuellen ±10-km-Grenze ablehnen. WorldBounds = rechteckige Bounding Box plus konfigurierbares Padding (Island standardmäßig 500 m). Clipping im metrischen CRS an der tatsächlichen AOI, nicht an der Download-BBox. Millimeterraster am Ende; nach Quantisierung erneut validieren.
- Phasen: Decode, Projektieren/Normalisieren, Clip, Graph/Orte/Spawns, Visuals, Validierung, Export. Wiederverwendbare strukturierte Diagnosen und Fortschrittsphasen; keine HTTP-Job-API in diesem Task.

## 2. Kartenvertrag und Rendering
- City v3 ergänzt eine explizite AOI und Randmodus (Natural/Island); Polygongeometrien mit Außenringen und Innenringen sowie Multipolygonen. Visual v2 für entsprechende komplexe Flächen und konsistente Küstenregeln. Konkrete JSON-Feldnamen und Schema-Diskriminierung vor Implementierung festlegen und im Kartenformat dokumentieren. Keine verlustreiche Vereinfachung auf City v2, keine gefüllten Löcher. Alte City-v2/Visual-v1-Pakete unverändert unterstützen; Theme v1 wiederverwenden.
- World Package v1 beibehaltbar als Hülle: zulässige Schema-Versionen und Dateideskriptoren explizit erweitern, passende Kombinationen City v2/Visual v1 und City v3/Visual v2 prüfen; unbekannte Versionen ablehnen. Prüfsummen, Byte-Limits und Lebensdauer aus P1-005 erhalten. Welcome v3 enthält bereits Schema-Version und semantischen Hash; keine neue Protokollversion allein wegen neuer Geometrie.
- Natural: reale Land-/Wassergeografie innerhalb der AOI, neutraler nicht spielbarer Außenbereich ohne erfundene Küste. Island: (natürliches Land minus Binnengewässer) ∩ AOI, außerhalb Ozean. Synthetische Küsten an Land-AOI-Grenzen, nicht an WorldBounds; echte Gewässer und Löcher bleiben erhalten. Keine künstliche Bathymetrie. Optional künstlicher Strand nur an geeigneten Abschnitten; standardmäßig aus. Renderer unterscheidet physische Küsten von kartografischen Abschlüssen; Triangulierung respektiert Innenringe.
- Schema- und fachliche Validierung in C++/WASM und TypeScript entsprechend erweitern. Räumliche Indizes für relevante geometrische Prüfungen statt ungebremster Paarvergleiche. Größenlimits von derzeit 8 MiB je Welt/Visual zunächst beibehalten; Änderung nur mit gemessenen Daten, explizit begründetem Limit und konsistenten Grenztests über alle Loader. Kein stilles Abschneiden.

## 3. Geodaten und Visuals
- OSM Nodes/Ways/Relations mit Quellen-IDs; Multipolygone/Innenringe korrekt auflösen, ungültige Quellgeometrien kontrolliert normalisieren und Reparaturen/Ausschlüsse zählen. Land, Binnenwasser, Straßen, Fußwege, Gebäude, Parks/Grün, natürliche Strände und ausgewählte POIs. Keine naive Polygonisierung unvollständiger Coastline-Linien. Unklare Landgrundlage ist Fehler statt erfundener Geografie.
- Gebäude vollständig innerhalb der AOI behalten; angeschnittene Gebäude verwerfen und zählen. Keine überlappenden Building/Building-Part-Duplikate; komplexe Parts ohne eindeutige Zuordnung melden und konservativ behandeln. Straßenachsen/Flächen exakt clippen. Straßenbreiten/-klassen aus validen Tags oder dokumentierten Defaults. Gebäudehöhe: valide height, dann building:levels, sonst reproduzierbare Schätzung nach Nutzungsprofil und Seed. Dachprofile aus unterstützten Tags, sonst Theme-Defaults; komplexe nicht unterstützte Dächer flach. Keine echten Bewohner importieren.
- Visualflächen mit Land schneiden und Gebäude-/Straßenkorridore abziehen. Physische Küsten aus resultierender Land-Wasser-Grenze ableiten. Generiertes Viertel als solches benennen, falls Verwaltungsgeometrie fehlt. Geeignete sichtbare generische Namen für unbenannte Spielorte. Keine falschen Tatsachen über reale Orte.

## 4. Autoritatives Fußwegenetz und Spielbarkeit
- Graph aus OSM-Topologie, Verbindungen an tatsächlichen kompatiblen gemeinsamen Nodes; keine Verbindung durch bloße geometrische Kreuzung. Beidseitige Fußkanten, konservative Allowlist und Zugangstags (insbesondere foot/access/private, Autobahnen). Abgeschnittene Wege erhalten stabile Randknoten. Knotenpositionen eindeutig nach Quantisierung; unabhängige Niveaus nicht zusammenführen. MVP: Brücken/Tunnel/abweichende Layer ohne eindeutig unterstützte Höhen-/Zugangssemantik nicht routbar exportieren und zählen; Darstellung möglich. Keine Route durch Gebäude, über offenes Wasser oder außerhalb der AOI.
- Kantenlängen in mm nach der bestehenden Core-Regel aus quantisierten Pfaden berechnen. Zusammenhängende Hauptkomponente beibehalten, bei gültigem explizitem Start die zugehörige Komponente; sonst größte nach eindeutiger, stabiler Regel (Knotenanzahl, bei Gleichstand IDs). Übrige Wege nur visuell, Komponenten und ausgeschlossene Kanten berichten.
- Geeignete OSM-POIs mit validem, eindeutigem Zugang im spielbaren Graph; kurze Zugänge nur nach Geometrie-/Zugangsprüfung, kein blindes Snapping. Nicht erreichbare POIs ausschließen und zählen. Wenn nötig klar gekennzeichnete generierte Testreiseziele an erreichbaren Knoten statt erfundener realer POIs. Mindestens zwei verschiedene erreichbare Reiseziele, gültiger Start, drei bestehende Prototyp-Spawns und zwei unterschiedliche Patrol-Knoten; Fehler, falls nicht möglich. Keine neue Charakterarchitektur.
- Stabile IDs aus OSM-Typ/ID und deterministischer Fragmentkennung, nicht Arrayreihenfolge; künstliche Elemente und Quellmapping ebenfalls stabil. Keine unkontrollierten Rundungsduplikate oder künstlichen Brücken zur Verbindung getrennter Komponenten.

## 5. Export und Provenance
- Manifest, world.json, visual.json, theme.json, provenance.json gemäß Paketvertrag; IDs, Schema-Version, Revisionen, Dateigrößen und SHA-256 konsistent. Identische Eingaben/Config/Seed/Generatorversion liefern byteidentische World-/Visual-Dateien und Hashes; stabil sortieren, feste Serialisierung, keine Laufzeitstempel darin. Provenance dokumentiert CRS/Ursprung/AOI/Modus, Quellen, Datum/Hash/Lizenz, Generatorversion/Seed, Schätzungen und Warnungen. Keine absoluten lokalen Pfade im Paket.
- Qualitätsbericht: Counts pro Feature, ungültige/reparierte Geometrien, Randgebäude, Höhenschätzungen, ausgeschlossene Wege/POIs, Komponenten, Spawns und Warnungen; große Detailreports separat außerhalb der Runtime-Byte-Limits. OSM-Attribution © OpenStreetMap contributors und https://www.openstreetmap.org/copyright sichtbar im Spiel; ODbL und Zusatzquellen dokumentieren. Große Rohdaten, Cache und reale Exporte nicht ins Repository pushen.
- Export temporär schreiben, mit Python und tatsächlichen Runtime-Validatoren prüfen, dann im gleichen Dateisystem finalisieren; bestehendes Paket nicht still überschreiben. Dokumentierte CLI/Validatorbefehle für lokale Ausführung und Integration in P1-007. Keine neue Welt fest in CMake/Vite einbinden.

## 6. Abnahme und Messung
- [x] Kleine synthetische Offline-Fixture mit konkaver AOI/Innenloch, Multipolygon, Binnenwasser, Randgebäude, angeschnittenem Weg, getrennten Komponenten, geometrischer Kreuzung ohne gemeinsamen Node, Brücke/Tunnel, privatem Weg, fehlender Höhe und unzugänglichem POI; Natural/Island prüfen, deterministische Ausgabe und keine ungültigen Verbindungen. Negative Tests für fehlende Quellen, unvollständige Referenzen, ungültige AOI, Quantisierungskollisionen, unspielbare Welt, Schema/Hash/Größenfehler und Export ohne Überschreiben.
- [x] Reale, vom Entwickler gewählte Stadtregion ca. 1 × 1 km vollständig spielbar exportieren; Quelle/Datum/Config dokumentieren. Danach 5 × 5 km derselben oder geeigneter Region messen. Keine Erfolgsgarantie für den Skalierungstest; bei Limit oder Fehler konkrete Ursache, Messwerte und nächste Maßnahme dokumentieren, nicht Daten still verwerfen.
- [x] Beide Modi aus Fixture bzw. realer Region mit denselben gebauten CLI-/Server-/WASM-Binaries laden; mindestens eine echte Reise mit Vorschau, Ankunft und Charaktersteuerung je Runtime, Vertragsparität je Paket. Browserdarstellung: AOI, Löcher, Natural-Rand, Inselküste, Gebäude, Straßen, Gewässer, OSM-Attribution und Kamera/Zoom prüfen; Handshake bei abweichender Weltidentität ablehnen.
- [x] Messwerte je realem Import: AOI-Fläche, Feature-/Graphzahlen, Phasendauer, Spitzen-RAM, Dateigrößen, native/WASM-/Browser-Ladezeit, Routingdauer und Rendering-FPS mit Hardware, Viewport und Testbedingungen. Keine erfundenen Zielwerte.
- [x] Python-Tests, native und WASM-Builds, CTest, Typecheck, Vite, Vitest, Playwright einschließlich unveränderter Breakwater-/Cove-Regressionen ausführen. Tatsächliche Ergebnisse, bekannte Einschränkungen und Befehle in README, Task, Architektur und Roadmap dokumentieren. Nachvollziehbare Commits pushen.

## Umsetzung

`tools/world-studio/woc_osm` enthält die Offline-CLI und die Importfunktion für P1-007. Der Export und die Phasendiagnosen verwenden ein lokales PBF und WGS84-Landpolygone. Das Fixture und die Bremer Eingabekonfigurationen lassen sich mit den Skripten reproduzieren. [Installation und Befehle](../tools/world-studio/README.md)

PyOsmium setzt Flächen aus OSM-Ways und -Relationen zusammen. Der Importer normalisiert die Geometrie, erhält Mehrfachflächen und Löcher, clippt an der metrischen AOI und prüft das Millimeterraster. Die Rohdaten bleiben getrennt vom Paket. Beim Runden an schrägen Grenzen teilt die Landfläche ihre Schnittpunkte mit der AOI. Kommt ein anderer gekappter Flächenpunkt beim Runden außerhalb zu liegen, wird die Fläche mit 2 mm Innenabstand erneut geschnitten. Diese Fälle stehen in der Diagnose.

Fußkanten werden an gemeinsamen OSM-Knoten verbunden. Unbestätigte Pfadzugänge, gesperrte Knoten und Wege, Brücken sowie Tunnel können sichtbar sein. Der begehbare Graph enthält nur die gewählte Komponente. OSM-POIs dieses Schnitts benötigen einen eindeutigen öffentlichen Zugang direkt an einem Knoten. Wo nötig ergänzen generierte Testreiseziele die Auswahl. Die Bremer Läufe zeigen, dass viele OSM-POIs für diesen Zugangsfilter keine verwendbare Verknüpfung haben.

City v3, Visual v2 und die passenden Dateideskriptoren werden nativ, in WASM und im Browser geladen. Die vorhandenen Pakete für Breakwater und Cove behalten ihre Dateien und Hashes. Die Karte trianguliert Innenringe, maskiert in Natural den Außenbereich und zeichnet in Island die zusätzliche Küste an der Land-AOI-Grenze. Das Wasser verwendet eine grafische Distanzrampe. Für OSM-Pakete zeigt die Karte den Copyright-Link. [Format und Loader](../docs/architecture/world-package.md)

## Messungen vom 27.11.2026

Für alle Bremer Läufe wurden die UTM-Zone 32N, Natural, Padding 0 m, Revision 1 und Seed `bremen-2026` verwendet. Die Innenstadt-Ausschnitte haben den Mittelpunkt 8,8072° E / 53,0785° N. Der nördliche Ausschnitt hat 8,8185° E / 53,1115° N. Das Vorbereitungsskript enthält die exakten Rechtecke in Metern.

- Geofabrik Bremen PBF mit Replikationszeit `2026-11-26T21:21:01Z`, SHA-256 `0d45fc16a72318a682a0c72bbb543828ccfb7d60476f85325d1b4f4db0a03b23`. [Geofabrik Bremen](https://download.geofabrik.de/europe/germany/bremen.html)
- Split-Landpolygone EPSG:4326 mit Datenstand `2026-11-25T22:00:00Z`. ZIP-SHA-256 `ef43669f2a0392abf0960ee65890ab590041ac054bde027bb7419e45a19918a6`. Der extrahierte GeoJSON-Eingang hat SHA-256 `5288ed1424357db028336e7bd15578314470ba940c2e1e163949e97279d5cd91`. Beide OSM-Quellen stehen unter ODbL. [Landquelle](https://osmdata.openstreetmap.de/data/land-polygons.html) · [OpenStreetMap-Lizenz](https://www.openstreetmap.org/copyright)

Windows x64 mit Intel Core i7-8750H, 15,9 GiB RAM und NVIDIA GeForce GTX 1060. Die Importzeiten sind Einzelmessungen mit Python 3.11, PyOsmium 4.3.0, Shapely 2.1.2 und PyProj 3.7.2. Spitzen-RAM ist der Peak Working Set des Python-Prozesses einschließlich der GIS-Bibliotheken. Git enthält die Generatoren, Konfigurationen und Messmethoden. Rohdaten und Exporte liegen lokal unter `build/`.

| Messwert | Innenstadt 1 × 1 km | Innenstadt 5 × 5 km | Nördlicher Ausschnitt 5 × 5 km |
|---|---:|---:|---:|
| AOI-Fläche | 1.000.000 m² | 25.000.000 m² | 25.000.000 m² |
| Gebäude / Straßenfragmente | 749 / 1.319 | 34.107 / 12.312 | 18.820 / 6.243 |
| Viertel / Gewässerquellen / Visualflächen | 8 / 7 / 48 | 47 / 53 / 1.543 | 30 / 372 / 1.091 |
| Fußknoten / Fußkanten / Orte | 734 / 868 / 2 | 7.496 / 9.357 / 2 | 4.654 / 5.753 / 2 |
| Komponenten vor Auswahl | 66 | 384 | 195 |
| Decode | 35,82 s | 42,75 s | 53,43 s |
| Projektieren und normalisieren | 0,52 s | 11,51 s | 16,50 s |
| Clip | 1,18 s | 27,75 s | 17,45 s |
| Graph, Orte und Spawns | 0,50 s | 6,38 s | 3,51 s |
| Visuals | 0,29 s | 6,33 s | 11,67 s |
| Validierung | 4,80 s | 0,81 s bis zur Größenprüfung | 43,74 s |
| Finalisieren | unter 0,01 s | — | unter 0,01 s |
| Import gesamt | 43,12 s | 95,53 s | 146,30 s |
| Spitzen-RAM | 161,82 MiB | 374,22 MiB | 304,37 MiB |
| `world.json` | 700.075 B | 12.738.026 B | 8.139.343 B |
| `visual.json` | 530.062 B | 8.050.574 B | 4.816.009 B |
| `theme.json` / `provenance.json` / Manifest | 1.872 / 2.217 / 1.003 B | 1.872 / 2.244 / — B | 1.872 / 2.239 / 1.023 B |
| Fertiges Paket | 1.235.229 B | — | 12.960.486 B |
| Nativer CLI-Start inkl. Prüfung | 1.129,77 ms | — | 8.980,55 ms |
| TS-Loader lokal in Node | 519,03 ms | — | 7.937,78 ms |
| WASM-Modul / `woc_init` lokal in Node | 9,96 / 290,10 ms | — | 5,85 / 3.251,06 ms |

Der dichte 5-km-Ausschnitt überschreitet das Limit von 8.388.608 B pro Weltdatei um 4.349.418 B. Der Importer meldete `WORLD_PACKAGE_SIZE_LIMIT` und veröffentlichte kein Paket. Deshalb gibt es für diesen Ausschnitt keine Lade-, Routing- oder FPS-Messung. Die Limits bleiben gültig. Für einen rechenintensiven Vergleich mit vollständigen Laufzeitdaten wurde der weniger dichte nördliche Ausschnitt verwendet. Vor einem Import der dichten Auswahl wäre ein gemessenes Format- oder Größenlimit-Follow-up erforderlich.

### Browser und Routing

Playwright Chromium 159.0.8154.6, headless mit ANGLE/SwiftShader, 1.440 × 960 CSS-Pixel bei DPR 1 und einem Playwright-Worker. Ladezeiten beginnen mit der Navigation zur Produktionsseite. Das Paket wird über lokale Playwright-Dateiantworten geliefert. Die zweite Ladezeit endet bei sichtbarer Karte und verbundenem Echtzeit-WASM. Die FPS zählen tatsächliche WebGL-Zeichenframes während drei Sekunden fortlaufender Kameradrehung in Übersicht und Nahsicht. Die Routenzeiten messen 20 Vorschau-Roundtrips je Transport nach zwei Aufwärmaufrufen ab Ada. Die gemessenen FPS beziehen sich auf den Software-Renderer.

| Messwert | Innenstadt 1 × 1 km | Nördlicher Ausschnitt 5 × 5 km |
|---|---:|---:|
| Erster Kartenframe / Karte und Verbindung | 2,79 / 3,20 s | 11,10 / 15,25 s |
| FPS Übersicht / Nahsicht | 13,81 / 11,39 | 5,92 / 7,22 |
| Routenvorschau WASM, Median / p95 | 0,60 / 0,90 ms | 2,30 / 4,20 ms |
| Routenvorschau WebSocket, Median / p95 | 0,60 / 0,90 ms | 2,00 / 2,30 ms |
| Strecke und simulierte Gehzeit | 781,28 m / 12 Spielmin. | 6.186,86 m / 93 Spielmin. |

Beim 5-km-Paket können sich in der Übersicht Beschriftungen verschachtelter Verwaltungsgebiete überlagern. Der erste Browserlauf traf außerdem die bisherige Frist von fünf Sekunden für den Worker-Start. Mit einer separaten Frist von 30 Sekunden für WASM-Initialisierung waren sowohl Echtzeitstart als auch die Protokollprüfung erfolgreich.

## Prüfbefehle

Getestet werden die CMake- und Emscripten-Presets aus der Projekt-README sowie `ctest --preset native`. Im Client folgen `npm --prefix client run typecheck`, `npm --prefix client test` und `npm --prefix client run build`. Für die Offline- und Browser-Prüfung wird die synthetische Welt in beide Modi exportiert. Die Browser-Suite nutzt alle lokalen Beispielpakete aus `WOC_OSM_WORLDS` und vergleicht Übernahme, Vorschau, Reise und Ankunft zwischen CLI, Worker und WebSocket. Die Qualitätsberichte und Screenshots liegen unter `build/osm-input/` und `client/test-results/`. [Befehle und Fixture](../tools/world-studio/README.md)

Native und WASM-Builds, CTest, Svelte-Typecheck und Vite-Build waren erfolgreich. Vier Python-Tests und 32 Vitest-Tests bestanden. Die vollständige Playwright-Suite lieferte zunächst 30 bestandene Tests. Der verbleibende Browser-Smoke für das nördliche Paket bestand im Wiederholungslauf mit an die gemessene Ladezeit angepasster UI-Assertion. Dort bestanden auch beide Browser-Messungen erneut. Damit sind alle 31 Playwright-Fälle einschließlich Breakwater und Cove verifiziert. Vite meldete einen Karten-Chunk oberhalb von 500 kB.

Zwei Exporte derselben synthetischen Eingaben und zwei Exporte desselben 1-km-Bremen-Eingangs lieferten jeweils fünf byteidentische Paketdateien. Der semantische SHA-256 des 1-km-Ausschnitts lautet `9ab3fa4320d912da645f85b0ae3844ab81f95410fb4c39612f2d412cefa7fa32`.
