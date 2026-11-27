# Kartenformat und Renderarchitektur
Status. Die drei Datenbereiche und ihre JSON-Verträge sind implementiert. City v2/Visual v1 und City v3/Visual v2 teilen sich Theme v1.

## Drei Datenbereiche

| Vertrag | Daten | Verwendung |
|---|---|---|
| [Welt v2](../../content/city-v2.schema.json) | [Breakwater](../../content/public/worlds/breakwater/world.json) mit Bounds, Land, Vierteln, Straßenachsen und Breiten, Gebäudegrundrissen und Gesamthöhen, Orten und Zugängen, Graph und Spawns | C++-Hosts und Client |
| [Visualformat v1](../../content/city-visual-v1.schema.json) | [Breakwater-Sidecar](../../content/public/worlds/breakwater/visual.json) mit Referenzen auf Gebäude und Straßen sowie eigenen Flächen, Küstenlinien und Stegen | Client-Renderer |
| [City v3](../../content/city-v3.schema.json) | AOI, Randmodus, komplexe Polygone und autoritativer Fußgraph | C++-Hosts und Client |
| [Visual v2](../../content/city-visual-v2.schema.json) | Gekappte Straßenflächen, komplexe Flächen mit Löchern und typisierte Küstengrenzen | Client-Renderer |
| [Themeformat v1](../../content/map-theme-v1.schema.json) | [Coastal](../../content/public/worlds/breakwater/theme.json) mit Tag-/Nachtfarbrollen, LOD-Schwellen, Abständen und Profilregeln | Client-Renderer, für mehrere Karten verwendbar |

Native und WASM laden die semantische Geografie zur Laufzeit und bauen daraus die `WorldDefinition`. Die 61 Wegknoten, 78 Kanten und sechs Ortszugänge in Breakwater sind die Basis der Fußreisen. Protokoll v3 prüft die Identität der Welt anhand von ID, Revision und semantischem SHA-256. [World Package](world-package.md)

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

## Generator und Paket

Ein externer Exporter schreibt die Weltdatei und das Sidecar getrennt. Für reproduzierbare Exporte erzeugt er IDs stabil aus Seed und Feature-Schlüssel, beispielsweise `north-road-03`. Die ID bleibt bei Umsortierung und bei reinen Stiländerungen erhalten. Referenzen verweisen auf diese IDs. Der Exporter aktualisiert bei Änderungen die entsprechenden Revisionen und Datei-Hashes im Manifest. Bei einer semantischen Änderung prüft er zudem Graph und Ortszugänge. Browser und Hosts laden das neue Paket bei ihrem nächsten Start.

Cove enthält eine kurze Straße, ein Haus, einen Strand, einen Pier und zwei Reiseziele. `npm --prefix client test -- visual-data.test.ts world-package.test.ts` prüft beide Kartendatensätze und ungültige Exporte. [Cove-Paket](../../content/public/worlds/cove/manifest.json)

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

## GIS-Exportvertrag für City v3 und Visual v2

City `version: 3` ergänzt `aoi` und `boundaryMode: "natural" | "island"`. `bounds` umschließt die AOI als Rechteck mit optionalem Padding. `aoi`, `land`, `districts[].outline`, `buildings[].footprint` und jeder Eintrag in `greens` verwenden `{ "polygons": [{ "outer": Ring, "holes": [Ring, …] }, …] }`. Ein Ring enthält offene `[x,z]`-Punktfolgen auf dem Millimeterraster. `aoi` hat genau ein Polygon. Die Polygoninnenflächen dürfen sich innerhalb einer Mehrfachfläche nicht überlappen. `waterLabel` ist bei fehlender Beschriftung optional.

Visual `visualVersion: 2` verlangt City `worldVersion: 3`. `surfaces[].polygon` verwendet dieselbe Flächenform. `roads[].polygon` enthält die an der AOI gekappte Straßenfläche. Jede semantische Straßenachse hat genau eine solche Fläche. `coasts[].kind` unterscheidet `shore` (Land-Wasser-Grenze in der AOI), `island` (synthetische physische Küste am AOI-Rand) und `cut` (kartografischer AOI-Abschluss in Natural). Nur physische Küsten beeinflussen die Farbrampe. Natural begrenzt die Wasserfläche auf die AOI. Island zeichnet Ozean bis über den Kartenausschnitt, mit standardmäßig 500 m Padding. Visual v2 verwendet eine leere `decorations`-Liste. Theme v1 und die Kombination City v2/Visual v1 bleiben gültig. [P1-006](../../tasks/P1-006-osm-world-importer.md)
