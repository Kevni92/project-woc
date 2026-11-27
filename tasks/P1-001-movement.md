# P1-001 — Wegenetz und zeitbasierte Bewegung
Status. Erledigt und geprüft am 2026-11-27. Die Bewegungswerte dienen dem Prototyp.
Abhängigkeiten: [P0-001](P0-001-map-prototype.md), [P0-002](P0-002-dual-runtime.md).
Grundlagen: [Welt](../docs/design/world.md), [Simulation](../docs/design/simulation.md), [Protokoll](../docs/architecture/protocol.md).

## Ziel
Ein kontrollierter Bewohner kann einen der sechs Orte von Breakwater auswählen, eine vom Host berechnete Route und Reisezeit sehen, zu Fuß losgehen und sichtbar am Ziel ankommen. Die Stadtgeografie wird erstmals autoritativ im C++-Host verwendet. Die Bewegung ist wiederverwendbar für spätere NPC-Tagespläne und Fahrzeuge.

## Geografie und Routing
- Bestehendes content/breakwater.json als gemeinsame Quelle erweitern (Schema/Version kontrolliert anpassen) oder eine referenzierte, gemeinsam versionierte Graphdatei ergänzen. Keine von Hand duplizierten Straßenkoordinaten im C++- und TS-Code. Statische Geografie beim Build reproduzierbar in native und WASM-Runtime einbinden; WASM hat FILESYSTEM=0, also kein Laufzeit-Dateizugriff im Core. Content-Laden/Validieren außerhalb des reinen Domänenkerns. Beide Hosts nutzen identische Daten; Welt-ID und Content-Version in Welcome/Client-Kompatibilitätsprüfung berücksichtigen.
- Explizite Knoten/Kanten mit stabilen IDs, Linienverlauf, metrischer Länge, zulässiger Reiseart; zunächst nur Fußwege. Die 13 vorhandenen Straßenlinien sind visuelle Geometrie, nicht automatisch ein korrekter Graph: Kreuzungen entlang der Segmente und leicht versetzte Endpunkte prüfen, absichtliche Verbindungen explizit festlegen. Keine implizite Verbindung durch bloße Nähe und keine Wege durch Wasser/Gebäude. Validieren: eindeutige IDs, gültige Referenzen, positive Längen, Anschluss aller sechs Ortszugänge, Startpositionen und Zusammenhang. Die sechs POI-Positionen bleiben sichtbare Marker; Zugangspunkte und kurze begehbare Zuwege separat definieren, wenn nötig. Startpositionen/Passantenroute konsistent ins Netz integrieren. Kleine begründete Anpassungen der Testdaten zulässig, keine neue Stadt.
- Deterministisches Dijkstra oder A* im C++-Core mit stabiler Tie-Break-Regel. Route ab aktueller Position auf einer Kante oder am Zugang; kein Teleportieren zum nächsten Knoten. Definiere eindeutiges Modell für Position auf Kante und Fortschritt. Erzeuge Route mit IDs/Geometrie, Distanz und ETA; Route und Laufzeit aus derselben Längenberechnung.
- Entwurfswert Gehen 4 km/h; vorhandener Takt 1 reale Sekunde = 1 Spielminute bleibt. Nutze Integer-/Fixed-Point-Fortschritt mit Rest bzw. stabile Rundung; kein Runden jeder Kante auf volle Minuten, kein Abhängigkeit von Render-FPS. Ankunft am Ziel bei erstem Tick mit ausreichendem Fortschritt. Zeige Restzeit als Tick-genaue ETA, dokumentiere Rundung. Ankunft genau einmal, danach Idle/AtLocation. Weltzeit läuft weiter.

## Befehle, Zustände und Ereignisse
- Hostseitige RoutePreview (read-only Request/Result oder klar getrennte Query) und MoveTo mit Character-ID und Location-ID. Vorschau gilt für bestimmte Ausgangsposition/Revision; MoveTo validiert Lease, Ziel, aktuelle Position und Erreichbarkeit erneut, berechnet autoritative Route. Keine vom Client vorgegebenen Reisezeiten oder Koordinaten akzeptieren.
- Status Idle/Traveling/AtLocation mit aktivem Reiseplan (Ziel, Pfad, Start, Fortschritt, ETA). Initial an einem Zugang oder auf Graph. MVP: neues MoveTo während Reise ablehnen (ALREADY_TRAVELING); Abbruch/Umleitung folgen später. Freigabe/Disconnect löscht weder Reise noch Charakterzustand; Reise endet weiterhin, bis P1-002 NPC neue Ziele plant. Übernahme unterwegs zeigt laufende Reise, ändert sie nicht. Ambient darf nicht gesteuert werden.
- Kleine interne fachliche Ereignisse MovementStarted/EntityArrived nach Zustandsänderung, eindeutig je Reise. Kein umfassender Eventbus oder Scheduler-Umbau in diesem Slice; P1-002 nutzt den Ereignisanschluss. Shared MovementSystem kann später auch NPC-Absichten verarbeiten.
- Update gemeinsam: C++-Host/Codec, JSON-Schemas, TypeScript-Types/SimulationClient/ViewStore, Fixtures, Capability/Version und Fehlercodes. Protokollversion bewusst beurteilen; Breaking Changes versionieren und veralteten Client verständlich ablehnen. Route/ETA für kontrollierte Figur, öffentliche Markerposition und optional öffentlicher Aktivitätsstatus; kein Zugriff auf private Routen anderer Sessions. Snapshot und Delta inkl. Resync müssen Reisezustand korrekt wiederherstellen; Sequenzen/Lease/Deduplikation erhalten.
- Alte TestAction ist Debug-Artefakt und darf reguläre Graphpositionen nicht korrumpieren. Entweder explizit isolierte Testwelt für alte TestAction-Fixtures oder TestAction durch reale Reiseaktionen ersetzen und bisherige Lease-/Deduplikations-/Paritäts-/Datenschutzprüfungen äquivalent erhalten. Entscheidung dokumentieren; kein Entfernen von Regressionen ohne Ersatz.

## UI
- Kontrollierten Charakter wählen, Ort anklicken, Gehroute und Distanz/ETA anzeigen, Reise mit „Zu Fuß gehen“ bestätigen. Laufende Route, verbleibende Spielzeit und Ziel im Detailpanel, Ankunft sichtbar.
- Route als dezente Linie in derselben Three.js-Szene in beiden Zoommodi; Positionen ausschließlich aus Hostprojektion, optische Interpolation ohne autoritative Bewegung oder eigene Wegfindung. Kein Durchlaufen von Häusern durch geradlinige Interpolation über Kurven; an Pfadsegmentschnitt oder Snap ausrichten.
- Bei Resync/Disconnect/Revisionswechsel veraltete Vorschau verwerfen; Route/Status aus frischem Hostzustand ableiten. Beide Transporte, Debugansicht und bestehende Kartengesten erhalten.

## Abnahmekriterien
- [x] Alle sechs Orte sind vom Startbereich über valide Wege erreichbar, jede Route nutzt tatsächliche Kanten/Zuwege. Fehlerhafte oder unerreichbare Ziele werden abgelehnt.
- [x] Zwei Sessions können unabhängig reisen. Eine fremde Figur lässt sich nicht bewegen. Eine doppelte Request-ID startet keine weitere Reise.
- [x] Reisezeit und Zwischenpositionen entsprechen Distanz und Spieluhr. Die Figur erreicht den exakten Zugang und löst genau eine Ankunft aus. Tageswechsel während einer Reise sind möglich.
- [x] Freigabe, Übernahme während einer Reise, Disconnect und verlorene Deltas erhalten den Reisezustand. Bargeld bleibt bei Bewegung unverändert.
- [x] Vorschau, Reise, Route und Ankunft sind in beiden Kartenmodi über WASM und WebSocket sichtbar. CLI, WASM und WebSocket liefern bei identischen Ticks und Befehlen semantisch gleiche Ergebnisse.
- [x] Native Tests prüfen Graphvalidierung, Kreuzungen, kürzesten Weg, Tie-Break, Start gleich Ziel, unerreichbare Ziele, Kantenfortschritt, mehrere Kanten pro Tick, Ankunft, Rechte und Lease-Wechsel. Client- und Playwright-Tests prüfen Vertrag, Projektion, Resync und echte Reisen über beide Transporte. Die Kartengesten bleiben abgedeckt.
- [x] Native und WASM-Builds, Typecheck, Vite-Build und Tests wurden ausgeführt. README, Architektur, Task, Roadmap und Entscheidungslog sind aktualisiert.

## Nicht im Umfang
Autos, freie Klickziele außerhalb bekannter Orte, NPC-Arbeit/Tagespläne, Utility AI, komplexer Scheduler, Verkehr, Wirtschaft, Inventar, Persistenz, Karteneditor, neue Stadt, Netcode-Umbau. Die vorhandene Uhr und Tag-/Nachtpalette bleiben bestehen.

## Ergebnis
`content/breakwater.json` enthält 61 Knoten, 78 Fußwegkanten, sechs Zugänge und die Startpositionen. Die sichtbaren Ortsmarker behalten ihre Koordinaten. Leicht versetzte Straßenlinien schließen an den Kreuzungen an. Die Gartenstraße führt um `dock-04`. Ben startet bei (10 m, 4 m) auf einer Kante. Der Passant pendelt zwischen zwei Wegpunkten an der Civic Avenue. Beide Hosts laden die beim Build eingebettete Content-Version 2.

`simulation/core/` berechnet und verfolgt die Reise für Bewohner und Passant. Der Host gibt intern `MovementStarted` und `EntityArrived` zurück. Protokoll v2 überträgt nur die Route der eigenen Figur. Die frühere `TestAction` wurde durch echte Reisen ersetzt. Die ursprünglichen Prüfungen für Lease, Deduplikation, Datenschutz, Disconnect und Parität verwenden jetzt `MoveTo`.

Die ETA wird für die gesamte Strecke auf den ersten ausreichenden Tick aufgerundet. Ein Ziel mit Distanz null liefert eine Vorschau mit null Spielminuten. `MoveTo` ergibt dann `ALREADY_AT_LOCATION`. Marker übernehmen die Hostposition im Sekundentakt. Während einer Resynchronisierung wartet die Karte auf die neue Projektion. Nach einem Hostneustart startet Breakwater wieder im Ausgangszustand.

### Ausgeführte Prüfungen

| Prüfung | Ergebnis |
|---|---|
| CMake `native` und `wasm` | Konfiguration und Build erfolgreich auf Windows x64 mit MSVC und Emscripten 4.0.23 |
| `ctest --preset native` | 1 von 1 Testprogramm bestanden. Graph, Reisezeit, Tageswechsel, Ereignisse, Rechte und Protokoll |
| `npm ci` und Typecheck | Erfolgreich. Typecheck mit 0 Fehlern und 0 Warnungen |
| Vitest | 14 von 14 bestanden |
| Vite-Build | Erfolgreich. Hinweis zur Größe des Karten-Bundles |
| Playwright Chromium | 10 von 10 bestanden. CLI-Parität mit festen Ticks, Snapshot-Recovery nach verlorenem Reisestart-Delta, Route in 2D und 3D, laufende Reise und Ankunft über beide Transporte. Debugger-, Startfehler- und Kartengesten-Regressionen |

Die Vertragsfixture vergleicht Reisen zweier Sessions, darunter Übernahme im Transit und Ankunft ohne Lease. [Fixture](../protocol/fixtures/dual-runtime.json)
