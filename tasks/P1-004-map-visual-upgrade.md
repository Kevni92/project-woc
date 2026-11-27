# P1-004 — Fullscreen-Karte, Visual-Format und kartografische Detailstufe
Status: geplant, nächster Task auf Wunsch des Nutzers vor P1-002. Abhängigkeiten P0-001, P0-002, P1-001 (erledigt).
Verbindliche Referenzen: [Art Direction](../docs/design/map-visuals.md), [Kartenformat](../docs/architecture/map-format.md). Nutzeraufnahmen wurden analysiert; visuelle Kriterien stehen textlich in der Dokumentation, keine fremden Assets nötig.

## Ziel
Breakwater als großflächige interaktive, rotierbare Stadtkarte mit schwebendem HUD und dezent detaillierten Gebäuden, Strand, tiefengestaffeltem Wasser und weicheren Straßen. Externe Generatoren sollen künftig Daten exportieren können, ohne Three.js kennen zu müssen. Bestehender C++-Graph und Reisen bleiben intakt.

## Reihenfolge in kleinen Commits (ein Task, drei prüfbare Schnitte)
A. Full-viewport HUD + freie Rotation: MapView/MapViewport/CSS/MapCamera/MapRenderer umbauen; Kontextpopover, einklappbare Listen, mobile Bottom Sheet, Reise-/Charakteraktionen, Kompass und Tasten. Bestehende Karte zunächst als Regressionstest. Rotation 360°, 2D/3D, Zoomanker, Auswahl und Marker.
B. Visual-Datenvertrag: versionierter Sidecar, Theme, JSON-Schemas, Loader und semantische Validierung, Dokumentation für externe Generatoren und zweites kleines Testfixture. Bestehende Welt v2 nicht duplizieren oder semantisch ändern. Visual-Schema separat versionieren.
C. Renderdetails: helle Tagespalette und Nachtpalette; mindestens drei Gebäudeprofile, Flach-/Satteldächer und Nahsicht-Fenster, dezente Parzellen/Grünflächen, Strand, mindestens ein Steg, räumlich stabile Wasserfarbrampe, kurvige Straßenübergänge/Rundungen und differenzierte Straßenklassen. Modular und ressourcenschonend. Details gemäß Art Direction. Keine Balkone oder komplexen Landmarken.

## Akzeptanz
- [ ] Canvas füllt Browser-Viewport ohne permanente Sidebar, Header reserviert keine Kartenfläche, kein Seiten-Scroll; Overlay HUD bleibt benutzbar bei 1440×960 und 375×812. Marker-Kontextfenster positioniert sich passend und kollidiert nicht mit Rand/HUD; Listen und WebGL-Fallback bleiben erreichbar.
- [ ] 360° Yaw in beide Richtungen mit stabilem Pivot, Norden zurücksetzen, Zoom/Pan/Fokus/2D/3D/Resize/Klick und Touch-/Tastaturbedienung; keine verlorenen Marker oder falsches Raycasting bei 90/180/270/360°. Teste Cursoranker, Kompass und Popup-Projektion.
- [ ] Schema-Validierung und Referenzen für Visual-Daten/Theme; externe JSON-Fixture ohne Three.js importierbar; ungültige Version/ID/Geometrie liefert kontrollierten Fehler. Keine kopierten autoritativen Footprints/Positionen. Semantische Daten und Protokoll v2 bleiben kompatibel.
- [ ] Nah: mindestens drei Gebäudeprofile und erkennbare Dachvariation, dezente Fenster nur bei geeignetem LOD. Fern: flache Footprints und lesbare Karte ohne Fassadenartefakte. Gebäudepicking mit richtiger ID in beiden Ansichten. Keine Balkone.
- [ ] Strand, Pier und mindestens drei räumlich gebundene Wasserfarbstufen mit weichen Übergängen, keine künstlichen Küsten am Kartenrand, Nachtpalette lesbar. Straßengeometrie mit runden/sauberen Joins, konsistenter Kreuzungsfläche und Klassenunterschied; Route liegt weiterhin auf autoritativem Weg. Keine Abkürzungen über Land/Wasser/Gebäude.
- [ ] Reisevorschau, MoveTo, Ankunft, Übernahme/Freigabe, Disconnect/Resync, Debugger und Client A bleiben in beiden Modi funktional. Nur Host-Zeit und Host-Zustand treiben dynamische Projektion. Keine neuen autoritativen Spielregeln.
- [ ] Unit-Tests für Kamera-Yaw/Zoom/Picking-Anker, LOD, Visual-Schema/Referenzen und Geometriehelpers; Browser-E2E für Fullscreen, Rotieren, Popup, Reisen und bestehende Regressionen über WASM und WS. Native/WASM-Builds, CTest, Typecheck, Vitest, Vite und Playwright tatsächlich ausführen. Semantische Fixture-Parität erhalten.
- [ ] Eigene reproduzierbare Screenshots (Tag/Nacht, Nah/Fern, 90° Rotation und mobile HUD) lokal prüfen; vor/nachher Drawcalls/Triangles und Bundlegröße dokumentieren, keine unnötigen Ressourcen bei Rotation/Zoom/Tick. Keine willkürliche absolute FPS-Anforderung ohne Hardwarebaseline. Testresultate, Entscheidungen, README, Roadmap und tatsächliche Architektur aktualisieren.

## Nicht im Umfang
Neue Stadt, Änderung des semantischen Wegenetzes, prozeduraler Kartengenerator selbst, MapLibre/Leaflet-Integration, Tile-Streaming, OSM-Import, Gebäudeinnenräume, Balkone, fotorealistische Effekte, echte Bathymetrie, Fog of War, neue Missionen/NPC-Features, öffentliche Multiplayerfunktionen. Bei tatsächlichem Bedarf an semantischer Content-Änderung separat begründen und nicht still mit Renderer vermischen.

## Ergebnis
Ausstehend. Farben, Renderingprofile, Eingabebelegung und konkrete Sidecar-Felder sind dokumentierte Entwürfe; Implementierung darf begründet anpassen. Nutzer wünscht Fullscreen, 360° und dargestellte Detailmerkmale verbindlich.
