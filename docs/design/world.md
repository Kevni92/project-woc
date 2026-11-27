# Welt und Karte
Status: ENTWURF, soweit nicht aus der Vision vorgegeben.

## Maßstab und Inhalt
Zunächst eine fiktive, von US-Küstenstädten inspirierte Teststadt. Keine komplette GTA-Karte. Vorschlag: ein zusammenhängendes Gebiet von ungefähr 1 × 1 km mit drei kleinen Vierteln (Wohnen, Gewerbe, Hafen), etwa 30–50 Gebäude und 6–8 interaktive Orte. Zahlen sind veränderliche Testdaten.
Land/Wasserflächen, Straßen und Gebäude werden aus selbst erstellten Daten geladen; zunächst keine OSM-Abhängigkeit und kein Welteditor. Später importierbare Kartenformate/Editor prüfen.

## Datenmodell
- World: stabile ID, Bounds, Seed, Regionen.
- District: Polygon, Name, Tags.
- Road graph: Knoten, Kanten, Länge, erlaubte Reisearten.
- Building: Grundriss, Höhe, District-ID.
- Location: ID, Gebäude-ID optional, Zugangspunkt am Wegenetz, Typ, Öffnungszeiten, Aktionen. Mehrere Orte je Gebäude möglich.
- Entity: stabile ID, Position auf dem Graphen oder am Ort, Referenz auf eigene Zustandsdaten. Übernehmbare Charaktere sind persistente Bewohner; Passanten können vereinfachte Entitäten sein. Spieler-Marker bezeichnet den aktuell vom jeweiligen Client kontrollierten Charakter.
Koordinaten in lokalen Metern (x/z, y = Höhe in Three.js); C++-Simulation kennt keine Three.js-Vektoren. Geometrie und Wegegraph teilen dasselbe Koordinatensystem; der Renderer interpretiert nur Daten.

## Ansichten
| Zoom | Darstellung |
|---|---|
| Fern | Orthogonale Top-down-Karte: Land, Wasser, Hauptstraßen, wichtige POIs |
| Mittel | Geneigte orthografische Kamera, Gebäudeumrisse und einfache Extrusionen |
| Nah | 3D-Quader/Prismen, Nebenstraßen, einzelne Marker und anklickbare Gebäude |
Kamerawechsel kontinuierlich oder über interpolierten Winkel mit Hysterese, ohne Positionssprung; in Fernsicht keine Gebäudeextrusionen anzeigen. Pan, Zoom zum Mauszeiger, Reset/Fokus auf Spieler. Kartenmarker mit Symbol und Farbe unterscheiden; Labels priorisieren und nicht alles gleichzeitig anzeigen. Auswahl per Raycasting/Marker-Hit-Test, Details im HTML-Panel. Eine einzige Welt, keine duplizierten Zustände zwischen Kartenmodi.

## Beispielorte
Wohnung, Laden, Café, Werkstatt, Autohaus, Hafenlager, öffentlicher Treffpunkt. Ort-Details nennen Name, Typ, Öffnungsstatus, Entfernung/Reisezeit, mögliche Aktionen. Standortabhängige Aktionen nur bei tatsächlicher Ankunft.

## Tag/Nacht
Zeitabhängige Farbpalette (Terrain, Gebäude, Straßen), nachts ausgewählte beleuchtete Gebäude/POIs. Keine aufwendige Beleuchtungspflicht, Lesbarkeit der Marker immer erhalten.

## Nächste Weltentscheidungen
Fiktive Stadt vs. reale Geografie, Stil (US-Küste vs. andere Region), Größe und Dichte, freie Bewegung vs. Klickziel auf Wegenetz. Für P0 reicht eine handgebaute Testkarte; finale Geografie nicht blockierend.
