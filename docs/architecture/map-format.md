# Kartenformat und Renderarchitektur
Status. Die drei Datenbereiche und ihre JSON-Verträge sind IMPLEMENTIERT. Semantische Welt v2, Visualformat v1 und Themeformat v1 werden unabhängig versioniert.

## Drei Datenbereiche

| Vertrag | Daten | Verwendung |
|---|---|---|
| [Welt v2](../../content/city-v2.schema.json) | [Breakwater](../../content/breakwater.json) mit Bounds, Land, Vierteln, Straßenachsen und Breiten, Gebäudegrundrissen und Gesamthöhen, Orten und Zugängen, Graph und Spawns | C++-Hosts und Client |
| [Visualformat v1](../../content/city-visual-v1.schema.json) | [Breakwater-Sidecar](../../content/breakwater.visual.json) mit Referenzen auf Gebäude und Straßen sowie eigenen Flächen, Küstenlinien und Stegen | Client-Renderer |
| [Themeformat v1](../../content/map-theme-v1.schema.json) | [Coastal](../../content/themes/coastal.json) mit Tag-/Nachtfarbrollen, LOD-Schwellen, Abständen und Profilregeln | Client-Renderer, für mehrere Karten verwendbar |

CMake bettet nur Welt v2 in native und WASM ein. Der C++-Adapter validiert daraus die WorldDefinition. Die 61 Wegknoten, 78 Kanten und sechs Ortszugänge sind die Basis der Fußreisen. Protokoll v2 prüft weiterhin die semantische Content-Version.

## Exportvertrag

- Koordinaten sind endliche lokale Meter. x zeigt nach Osten, z nach Süden und y nach oben. Das Sidecar verwendet Ursprung und Bounds der referenzierten Welt. Polygone sind einfache Ringe mit mindestens drei eindeutigen Punkten. Der erste Punkt wird nicht wiederholt. Löcher sind in v1 nicht vorgesehen. Empfohlen ist im Nordbild Uhrzeigersinn, beide Orientierungen werden akzeptiert.
- `worldId` und `worldVersion` identifizieren die semantische Datei. `visualVersion: 1` bestimmt das Schema, die optionale `revision` nummeriert optische Datenänderungen. Die fünf Listen sind obligatorisch und dürfen leer sein.
- `buildings` referenziert `buildingId` und wählt `residential`, `commercial` oder `warehouse`. Die optionalen Felder `roof` (`flat`/`gabled`), `roofHeightM` und `windows` (`none`/`subtle`/`bands`) überschreiben Theme-Defaults. Eine explizite Dachhöhe gehört zu einem Satteldach und liegt strikt unter der Gesamthöhe. Ohne Eintrag gilt `commercial`. Für ein nicht rechteckiges Satteldach verwendet der Renderer ein Flachdach.
- `roads` referenziert `roadId` und wählt `main` oder `local`. Ohne Eintrag ergibt sich die Klasse aus `avenue`/`street` in Welt v2. Hauptstraßen haben standardmäßig Mittelmarkierungen. `markings` kennt `none` und `center`. `sidewalkWidthM` beschreibt einen inneren Rand auf jeder Seite und belegt je Seite höchstens 20 Prozent der autoritativen Straßenbreite.
- `surfaces` beschreibt `parcel`, `grass`, `plaza`, `promenade` oder `beach` mit ID und Polygon. Jeder Ring liegt vollständig in einem autoritativen Landring. Gebäude und Straßenkorridore dürfen nicht überdeckt werden. Überlappende Flächen werden in der obigen Reihenfolge geschichtet, am höchsten liegt Strand. Bei gleicher Rolle gilt dieselbe Farbe.
- `coasts` beschreibt mit `id` und `path` die echte Land-Wasser-Grenze. Jedes Liniensegment liegt auf einem Landring-Abschnitt und hat Land auf einer sowie Wasser auf der anderen Seite. Linien entlang der Weltabschlüsse sind ungültig. Die Küstenabstände im Theme bestimmen die visuelle Tiefenrampe.
- `decorations` enthält `pier` mit ID, Deckpolygon und `elevationM`. Ein Steg überquert eine angegebene physische Küstenlinie und besitzt Ecken auf beiden Seiten. Er ist rein dekorativ.
- Das Theme definiert sRGB-Farbrollen für Tag und Nacht, einen Abstand für die Renderlayer, vier LOD-Schwellen, drei aufsteigende Wasserabstände in Metern, Strichmaße für Markierungen und Profilregeln für Dächer und Fassaden.

`parseVisuals` und `parseTheme` prüfen JSON-Schema und Querverweise ohne DOM oder Three.js. Sie melden unbekannte Versionen, doppelte IDs, fehlende Referenzen, unpassende Höhen- und Breitenwerte sowie ungültige Geometrien. Die Dekorations-IDs sind über alle drei visuellen Geometrielisten und gegenüber Welt-IDs eindeutig. Beim Laden meldet das HUD einen Fehler im Sidecar oder Theme und hält Orts- und Charakterlisten verfügbar. [Validatoren](../../client/src/render/visual-data.ts)

## Generator und Build

Ein externer Exporter schreibt die Weltdatei und das Sidecar getrennt. Für reproduzierbare Exporte erzeugt er IDs stabil aus Seed und Feature-Schlüssel, beispielsweise `north-road-03`. Die ID bleibt bei Umsortierung und bei reinen Stiländerungen erhalten. Referenzen verweisen auf diese IDs. Protokollkompatible Änderungen am Sidecar erhöhen bei Bedarf dessen `revision`. Bei semantischer Änderung synchronisiert der Exporter Graph, Ortszugänge und `worldVersion` mit beiden Host-Builds. Der Browser bündelt den Sidecar und das Theme über Vite. Das C++-Build und die Protokollnachrichten verarbeiten nur Welt v2.

Das unabhängige Cove-Fixture enthält ein JSON-Beispiel mit einer kurzen Straße, einem Haus, einem Strand und einem Pier. `npm --prefix client test -- visual-data.test.ts` lädt beide Karten und prüft ungültige Exporte. [Cove-Fixture](../../client/tests/fixtures/cove.json)

Später sind metrische Chunks mit Manifest, räumlichem Index und LOD möglich. Raster-Tiles oder Vector Tiles bleiben Optionen für größere Karten.

## Renderer

`GeographyLayer` baut die statische Szene aus validierter Welt, Sidecar und Theme. `WaterLayer` sampelt die Küstendistanz einmal in einer linearen 8-bit-Textur. Der Shader liest sie in metrischen Koordinaten. Die opaken Landflächen liegen oberhalb des Wassers. An kartografischen Abschlüssen verlängert der Renderer den sichtbaren Landhintergrund und die angrenzenden Küstenlinien außerhalb der Weltgrenze.

Straßen, Flächen und Gebäude verwenden gemeinsame Materialien und Geometriegruppen. Materialfarben und Uniforms ändern sich mit der Host-Spielzeit. Detailgruppen wechseln die Sichtbarkeit beim Zoom. Statische Puffer bleiben dabei erhalten. Routenpunkte kommen aus dem Host. Ein neuer Routenpuffer entsteht nur bei einer Änderung der Punktfolge.

## Recherche und Referenzen (27.11.2026)
- GTA-V-Kacheln: https://viruxe.github.io/gtav-map-tiles/ — vorgefertigte WebP-XYZ-Zoomstufen; nützlich als späteres Streaming-Muster, kein Live-3D.
- FiveM Leaflet: https://github.com/fivedock-dev/fivem-map-nui und https://fivedock.dev/blog/gta-v-map-leaflet-fivem-nui — separates Koordinatensystem, Bounds, Marker/Route über Basiskarte.
- GTA-VI-Fan-Karte: https://github.com/fbritoferreira/gta6 — Leaflet und separate Tag-/Nacht-Tiles.
- Leonida Atlas: https://github.com/navanem/gta6-leonida-atlas — Leaflet plus optionaler Three.js-Explorer laut README; keine Behauptung über Rockstar-Engine.
- MapLibre Style Specification: https://maplibre.org/maplibre-style-spec/ und https://maplibre.org/maplibre-style-spec/layers/ — Datenquelle und Style-Layer getrennt; Fill, Line, Symbol, Extrusion und Zoomregeln. Wir übernehmen das Prinzip, nicht zwingend die Bibliothek.
- OpenStreetMap Simple 3D Buildings: https://wiki.openstreetmap.org/wiki/Simple_3D_Buildings — Footprint, Höhe, Geschosse, Dachformen als abstrakte Daten; Inspiration für eigenes lokales Schema, kein OSM-Import.
- Three.js: https://threejs.org/docs/pages/OrbitControls.html, https://threejs.org/docs/pages/InstancedMesh.html, https://threejs.org/docs/ — vorhandene orthografische Kamera und Geometrien bleiben geeignet; OrbitControls als Referenz, vorhandene MapCamera gezielt erweitern.

## Geplanter Runtime-Paketvertrag
Die aktuelle fest gebündelte Welt soll durch [World Packages](world-package.md) ersetzt werden; [World Studio](../design/world-studio.md) exportiert in dieses Format. Die bestehenden Schemafamilien bleiben Grundlage. Die obigen Implementierungsangaben beschreiben weiterhin P1-004, nicht bereits implementierte Runtime-Loader.
