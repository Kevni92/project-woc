# P0-001 — Interaktive Stadtkarte
Status: geplant. P0-002 ist bereits umgesetzt und bildet die Grundlage.
Abhängigkeiten: [P0-002](P0-002-dual-runtime.md), [Welt](../docs/design/world.md), [Architektur](../docs/architecture/overview.md).

## Ziel
Eine minimale, aber visuell stimmige interaktive Stadtkarte als Hauptansicht des Spiels. Dieselbe Karte erhält Live-Daten von WASM und WebSocket über den vorhandenen SimulationClient. Das bestehende Debug-UI bleibt als gesonderte Ansicht für Diagnose und Regressionstests verfügbar.

## Umfang
- Bestehendes Svelte/Vite/TypeScript-Projekt erweitern; Three.js und nötige Typen kompatibel versionieren, Lockfile aktualisieren. Kein zweites Frontend, kein zusätzlicher Simulationskern.
- Eine handgebaute fiktive Küsten-Teststadt (Entwurf: rund 1 km², 30–50 Gebäude, drei Viertel, mindestens sechs benannte POIs), mit Land, Wasser, Straßen, Grundrissen und Höhen. Eine versionierte, sprachneutrale statische Kartendatei unter content/ mit IDs und lokalen x/z-Meterkoordinaten; keine endgültige Weltgeografie festlegen. Datenformat klein halten und validieren. Inhalt so positionieren, dass vorhandene echte Charakterkoordinaten (Ada 0/0, Ben 10/5, Passant 4/2 und dessen kurzer Weg) sinnvoll auf der Karte liegen; ggf. enger Startbereich innerhalb der größeren Stadt. TestAction und Vertragsfixture nicht für Karteneffekte verändern.
- Three.js unter client/src/render/ mit einer Szene/Koordinatenbasis, orthografischer Kamera, geneigter Nahansicht (einfache Extrusionen) und flacher Top-down-Fernsicht ohne Extrusionen; stabiler Zoom/Pan (inkl. Mauszeiger-Zoom), Fokus/Reset, Resize, geeignete LOD-Schwellen. Kein fotorealistisches Rendering.
- Live-Marker ausschließlich aus der lesenden SimulationClient-Projektion (subscribe, view.characters, view.controlled): eigener Charakter, andere Bewohner (ggf. belegt), Ambient-Passanten; Farbe plus Form/Icon, stabile IDs, positionsgetreue Updates ohne Geometrie-Neubau. Fahrzeuge noch nicht simuliert; höchstens klar gekennzeichnete statische Fahrzeug-Demo als optionaler Darstellungsnachweis. Keine erfundenen dynamischen Daten.
- Kartenklick auf POI, Gebäude oder Marker zeigt richtige Details im HTML-Panel; Hintergrundklick löscht Auswahl. Übernahme/Freigabe über vorhandene SimulationClient-Methoden und autoritative Rückmeldung; synchronizing/disconnected/pending berücksichtigen. Bargeld nur aus eigener kontrollierter Projektion. Keine Route/Reiseaktion oder neuen Commands erfinden.
- Kartenansicht als primäre Spieloberfläche: kompakter Kopfbereich mit Verbindung, Spielzeit und kontrolliertem Charakter, große Karte, Detailpanel, Zoom-/Reset-/Fokus-Steuerung. CSS-Tokens, responsive Layout, zugängliche HTML-Steuerung. Debug-Ansicht mit beiden Sessions und vorhandenen Testfunktionen weiter erreichbar; bestehende Tests bewusst auf Debug-Ansicht routen, nicht abschwächen.
- Tag-/Nachtpalette aus vorhandenen gameMinutes ableiten (reine Präsentation; Uhr nicht im Client simulieren); optional visuelle Vorschau im Debug-Modus. Marker und Straßen auch nachts lesbar.
- Ressourcen beim Unmount freigeben (RAF, Observer, Listener, Three.js-Ressourcen); Subscribe abmelden. Kein Rendering im Core, keine Transporterkennung in Kartenlogik. Keine Änderung der autoritativen Regeln oder des Protokolls für statische Geografie nötig; dieselbe gebündelte Kartendefinition für beide Modi. Später P1 muss die Geografie für Routing im Core verfügbar machen; bis dahin keine behauptete serverseitige Validierung der statischen Orte.

## Nicht im Umfang
Echte Wegfindung/Reisen, Fahrzeuglogik, NPC-Tagespläne, Missionen, Inventar, Persistenz, Accounts, Karteneditor, externe Geodaten, Netcode-Umbau, große zusätzliche Frameworks. MockTransport nur für isolierte Tests, nicht für die reguläre Karte.

## Akzeptanzkriterien
- [ ] Bestehende native/WASM-Hosts und dieselbe Browser-Kartenansicht starten lokal; lediglich Transportkonfiguration unterscheidet die Modi.
- [ ] Land, Wasser, Straßen, Gebäude, sechs POIs und reale Charaktermarker sichtbar; IDs und Weltkoordinaten konsistent.
- [ ] Nahansicht mit Extrusionen, Fernansicht flach; Fokus bleibt erhalten, keine zweite Welt/Szene, Pan/Zoom/Reset/Resize funktionieren.
- [ ] Auswahl zeigt korrekte Details; Übernahme/Freigabe sichtbar aus Hostzustand, Passant nicht übernehmbar; Demo-Testaktion/Passantenweg aktualisiert echte Marker, kein Client-seitiges Vortäuschen.
- [ ] Vorhandene Uhr treibt Palette; kein selbstständiger Client-Tick. Disconnect/Resync führt nicht zu falscher Kontrolle oder veralteten Markern.
- [ ] Alte Debug-Ansicht und Vertrags-/Lease-/Delta-Tests bleiben funktionsfähig.
- [ ] Unit-Tests für Karten-/Zoom-/Zeitpalette und Projektionslogik; Browser-Smoketest für Karte, Auswahl, Zoom und echte Positions-/Kontrollupdates über beide Transporte. Native/WASM-Builds, Typecheck, Vite-Build und Tests tatsächlich prüfen. Ergebnisse inkl. Einschränkungen dokumentieren.
- [ ] README, Architektur, Roadmap und dieser Task aktualisiert; kleine nachvollziehbare Commits.

## Ergebnis
Ausstehend. P0-001 ist ein Präsentationsschnitt auf vorhandenem Core, keine neue RPG-Simulation. Weltgestaltung, Stil und Schwellenwerte sind vorläufige Entwürfe.
