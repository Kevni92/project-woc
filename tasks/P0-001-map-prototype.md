# P0-001 — Interaktive Stadtkarte
Status: geplant; noch keine Implementierung beauftragt.
Abhängigkeiten: keine. Grundlage: [Welt](../docs/design/world.md), [Architektur](../docs/architecture/overview.md).

## Ziel
Ein lokaler Browser-Prototyp, der das zentrale Spielgefühl überprüft: eine minimalistische Karte, die sich wie ein interaktives Stadtmodell bedienen lässt.

## Umfang
- TypeScript/Vite/Svelte/Three.js minimal einrichten, Versionen fixieren, Skripte für dev/build/typecheck/test.
- Handgebaute, datengetriebene Testwelt: Land, Wasser, Straßen, rund 30–50 einfache Gebäude, mindestens sechs benannte POIs, Spieler- und NPC-/Fahrzeug-Demo-Marker.
- Orthografische Kamera: Pan, Zoom, geneigte Nahsicht mit Gebäudeextrusion und flache Top-down-Fernsicht ohne Extrusion. Eine Weltkoordinate bleibt beim Übergang erhalten.
- Klick auf POI/Gebäude/Marker zeigt korrekte Details in HTML-Panel, Hintergrundklick hebt Auswahl auf. Marker nach Typ visuell unterscheidbar.
- Einfache CSS-Tokens und UI mit Kartenfläche, Ortsdetails, Zoom-/Reset-Steuerung. Optional manuelle Tag-/Nachtpalette zum visuellen Test, keine Uhrsimulation.
- Kleines typsicheres Modell für World/Location/Entity; unabhängige Daten und Rendering; kein umfassender GameCore nötig.

## Nicht im Umfang
Keine echte Bewegung, kein NPC-Tagesplan, keine Missionen, kein Inventar, keine Persistenz, keine Accounts, kein Karteneditor, keine externen Kartendaten.

## Akzeptanzkriterien
- [ ] Lokaler Start mit dokumentiertem Befehl; Build und Typecheck erfolgreich.
- [ ] Land/Wasser/Straßen/Gebäude/POIs und drei Markerarten erscheinen auf der Karte.
- [ ] Zoomwechsel reproduzierbar, keine doppelte Szene/Welt, POIs bleiben positionsgleich.
- [ ] Pan, Zoom, Reset und Auswahl funktionieren; Detailpanel zeigt korrekte ID/Name/Typ.
- [ ] Kartenansicht reagiert auf Größenänderungen; kein offensichtlicher Konsolenfehler.
- [ ] Unit-Test für Karten-/Zoomlogik und Browser-Smoketest für Auswahl/Zoom.
- [ ] README enthält Start-/Testbefehle; Task dokumentiert tatsächliche Ergebnisse.

## Ergebnis
Ausstehend. Testdaten, Schwellenwerte, Farben und Stadtgröße sind vorläufig und dürfen für diesen Prototyp begründet angepasst werden.
