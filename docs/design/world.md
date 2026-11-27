# Welt und Karte
Status. Breakwater ist als Teststadt mit autoritativem Fußwegenetz und kartografischer 2D-/3D-Darstellung IMPLEMENTIERT. Die weitere Ausgestaltung bleibt ENTWURF.

## Maßstab und Inhalt
Zunächst eine fiktive, von US-Küstenstädten inspirierte Teststadt. Keine komplette GTA-Karte. Vorschlag: ein zusammenhängendes Gebiet von ungefähr 1 × 1 km mit drei kleinen Vierteln (Wohnen, Gewerbe, Hafen), etwa 30–50 Gebäude und 6–8 interaktive Orte. Zahlen sind veränderliche Testdaten.
Land/Wasserflächen, Straßen und Gebäude werden aus selbst erstellten Daten geladen; zunächst keine OSM-Abhängigkeit und kein Welteditor. Später importierbare Kartenformate/Editor prüfen.

Breakwater hat drei Viertel, 40 Gebäude und sechs Orte. Der Startbereich bei x=0 m und z=0 m ist über einen kurzen Fußweg an die Civic Avenue angebunden. Die Wasserfläche umgibt die Landpolygone, und die Straßen folgen Linienzügen mit metrischen Breiten. Cove ist eine zweite, kleinere Testwelt mit zwei Orten und eigenen Startpositionen. [Breakwater](../../content/public/worlds/breakwater/manifest.json) · [Cove](../../content/public/worlds/cove/manifest.json)

Breakwaters City-v2-Datei enthält 61 Knoten und 78 beidseitig begehbare Kanten. Die Kreuzungen sind als gemeinsame Knoten modelliert. Leicht versetzte Straßenverläufe an Kreuzungen wurden verbunden. Die Gartenstraße macht auf Höhe von `dock-04` einen kleinen Bogen. Reisen enden an eigenen Zugängen, bei Gebäuden an der Fußseite außerhalb des Grundrisses. Der Content-Adapter prüft die Anschlussfähigkeit, Kantenlängen und begehbare Geometrie. Host und Client gleichen die Identität der geladenen Geografie ab.

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
| Fern | Orthogonale Top-down-Karte mit flachen Gebäudegrundrissen, Küstenflächen, Straßenklassen und Ortsmarkern |
| Mittel | Geneigte orthografische Kamera mit wachsenden Volumen und Dachformen |
| Nah | Fassadenfenster, Straßenmarkierungen, Stegstützen und anklickbare Gebäude |

Neigung und Gebäudehöhe gehen beim Zoomen stufenlos ineinander über. Der Azimut ist frei drehbar. Pan, Mauszeiger-Zoom und Fokus verwenden dieselbe Kamera für alle Stufen. Die Auswahl erfolgt per Raycasting oder über HTML-Marker und öffnet ein Kontextfenster. [Kartenstil](map-visuals.md)

## Beispielorte
Wohnung, Laden, Café, Werkstatt, Autohaus, Hafenlager, öffentlicher Treffpunkt. Ort-Details nennen Name, Typ, Öffnungsstatus, Entfernung/Reisezeit, mögliche Aktionen. Standortabhängige Aktionen nur bei tatsächlicher Ankunft.

## Tag/Nacht
Zeitabhängige Farbpalette (Terrain, Gebäude, Straßen), nachts ausgewählte beleuchtete Gebäude/POIs. Keine aufwendige Beleuchtungspflicht, Lesbarkeit der Marker immer erhalten.

Das Theme blendet zwischen Nacht- und Tagfarben von 05:00 bis 07:00 und von 18:00 bis 20:00 Spielzeit. Die Spielminuten kommen vom laufenden Host.

## Nächste Weltentscheidungen
Fiktive Stadt vs. reale Geografie, Stil (US-Küste vs. andere Region), Größe und Dichte, freie Bewegung vs. Klickziel auf Wegenetz. Für P0 reicht eine handgebaute Testkarte; finale Geografie nicht blockierend.

## Darstellung und Geografie
Das Visual-Sidecar ergänzt die Karte um Strand, Landnutzung, Stege und Stilzuordnungen. Das Theme beschreibt Farben und Detailgrenzen. Echte Geografieänderungen benötigen eine gemeinsame Content-Migration mit dem autoritativen Wegenetz. [Kartenformat](../architecture/map-format.md)
