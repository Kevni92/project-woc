# OSM-Importer

`woc_osm` erzeugt ein World Package v1 mit City v3 und Visual v2. Dieselbe Funktion steht dem geplanten World Studio zur Verfügung.

## Installation

Builds für CLI und WASM sowie `npm --prefix client ci` wie in der Projekt-README ausführen. Getestet unter Windows x64 mit Python 3.11, PyOsmium 4.3.0, Shapely 2.1.2 und PyProj 3.7.2. Die Wheels enthalten GEOS und PROJ. Die übrigen Python-Abhängigkeiten stehen in `requirements.txt`. Unter Linux/macOS liegt das Python-Programm einer venv unter `bin/python`. [Projekt-README](../../README.md)

```powershell
python -m venv build/osm-venv
build/osm-venv/Scripts/python.exe -m pip install --only-binary=:all: -r tools/world-studio/requirements.txt
$env:PYTHONPATH = 'tools/world-studio'
```

## Eingabe und CLI

- `.osm.pbf` mit vollständigen Way-/Node- und Multipolygonreferenzen für die Auswahl einschließlich eines Datenpuffers. Ein geeigneter lokaler Geofabrik-Extrakt ist ein möglicher Eingang. [Geofabrik-Downloads](https://download.geofabrik.de/)
- WGS84-GeoJSON mit Landpolygonen für die Umgebung. Unterstützt sind `Polygon`, `MultiPolygon`, ein einzelnes `Feature` und `FeatureCollection`. Für die Küste eignen sich die aufbereiteten WGS84-Landpolygone von osmdata.openstreetmap.de. Bei großen Shapefiles nur geografisch relevante vollständige Features nach GeoJSON übertragen. [Landpolygone](https://osmdata.openstreetmap.de/data/land-polygons.html)
- Die Auswahl ist ein geschlossenes WGS84-GeoJSON-`Polygon` oder ein `Feature` mit diesem Geometrietyp. Ein konkaver Außenring und Innenringe sind zulässig. Koordinaten stehen in der Reihenfolge Längengrad, Breitengrad.
- Die JSON-Konfiguration enthält `worldId`, `name`, `revision`, `seed`, `mode` (`natural` oder `island`) und `landSource` mit `provider`, `url`, `license`, `attribution` und `dataDate`. Optional sind `start` als `[lon, lat]`, `paddingM`, `osmProvider`, `osmUrl` und `osmDataDate`. Ohne Paddingwert verwendet Natural 0 m und Island 500 m. Die PBF-Replikationszeit steht im Provenance-Eintrag, wenn der Header sie liefert.

```powershell
New-Item -ItemType Directory -Force build/osm-worlds
build/osm-venv/Scripts/python.exe -m woc_osm --pbf build/osm-input/region.osm.pbf `
  --land build/osm-input/land.geojson --aoi build/osm-input/aoi.json `
  --config build/osm-input/config.json --output build/osm-worlds/meine-welt `
  --report build/osm-input/meine-welt-report.json
```

Das Netzwerk ist während des Imports entbehrlich. `--native` und `--node` wählen bei Bedarf andere lokale Programmdateien. Die CLI meldet Phasen über stderr und schreibt den JSON-Bericht per `--report` oder nach stdout. Die Laufzeiten enthalten Geometrie- und Runtime-Validierung. Der Speicherwert erfasst den Importprozess. Er umfasst auf Windows den Peak Working Set und auf anderen Systemen periodische RSS-Stichproben. Die fünf Paketdateien werden erst nach erfolgreicher Prüfung zusammen veröffentlicht. Das Zielverzeichnis muss neu sein.

Die Python-Funktion `import_world(pbf, land_source, aoi_geojson, config, output, native, node='node', progress=None, report=None)` nimmt lokale `Path`-Objekte und dekodierte JSON-Dokumente entgegen. Sie gibt das Manifest zurück, ruft `progress` mit den Phasennamen auf und befüllt das optionale Berichtsobjekt auch bei einem Fehler. Ungültige Eingaben oder abgelehnte Pakete melden `ImportFailure`.

## Geometrie und Zugang

Der Ursprung ist der WGS84-Schwerpunkt der Auswahl. UTM wird innerhalb einer geeigneten Zone verwendet. An Zonengrenzen oder außerhalb der UTM-Breiten innerhalb des unterstützten Bereichs kommt eine lokale Azimutal-Äquidistanzprojektion zum Einsatz. Der Export rundet auf 1 mm. Wenn ein gekappter Flächenpunkt beim Runden über einen schrägen Rand gerät, erhält die Fläche bei Bedarf bis zu 2 mm Innenabstand vor dem erneuten Runden. Bei Landgrenzen teilen sich AOI und Land die gerundeten Schnittpunkte. Beide Verfahren werden als Counts gemeldet.

Straßenbreiten stammen aus einem gültigen metrischen `width` oder aus Klassenvorgaben zwischen 2 und 14 m. `height` hat Vorrang vor `building:levels` mit 3 m pro Geschoss. Sonst hängt die geschätzte Höhe deterministisch von ID, Gebäudenutzung und Seed ab. Mehrdeutige Gebäudeteile werden verworfen. Die Höhen- und Geometrieschätzungen stehen im Qualitätsbericht.

Begehbare Wege brauchen eine unterstützte `highway`-Klasse und öffentlichen Fußzugang. Für `path` ist eine explizite Fußerlaubnis nötig. Nicht unterstützte Ebenen, Brücken und Tunnel können sichtbar bleiben. Der Graph verwendet gemeinsame OSM-Knoten, kappungsbedingte Randknoten und an der Geometrie geprüfte Fußkanten. POIs benötigen für diesen Schnitt einen eindeutigen öffentlichen Zugang direkt an einem Knoten der gewählten Komponente. Ein expliziter Start wird bis 35 m auf einen erreichbaren Knoten mit freier Verbindung abgebildet. Die IDs verknüpfen exportierte Features mit ihren OSM-Nodes, -Ways oder -Relationen. Die Quellen der in die Landmaske eingerechneten Binnengewässer stehen im Bericht unter `waterSources`.

## Paket prüfen und spielen

```powershell
build/native/woc_cli.exe --world build/osm-worlds/meine-welt
node client/tools/validate-world.mjs build/osm-worlds/meine-welt
npm.cmd --prefix client run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Vite liefert einen Paketordner unterhalb des Repositorys im Dev-Modus über `/@fs/` aus. Unter Windows setzt sich `worldBase` etwa aus `/@fs/C:/Users/.../project-woc/build/osm-worlds/` zusammen. Öffne die Dev-Seite mit `?world=meine-welt&worldBase=<URL-kodierte Basis>`. Für WebSocket starte `build/native/woc_server.exe --world build/osm-worlds/meine-welt` und ergänze `&transport=ws`. Ein statischer Contentserver ist ebenfalls möglich. [Paketloader](../../docs/architecture/world-package.md)

## Bremer Messläufe wiederholen

`examples/bremen.py` bereitet die drei gemessenen AOIs, Konfigurationen und das Land-GeoJSON aus dem lokalen WGS84-Shapefile vor. Die Quellen, Datenstände und Ergebnisse stehen im Task. [Messungen](../../tasks/P1-006-osm-world-importer.md#messungen-vom-27112026)

```powershell
build/osm-venv/Scripts/python.exe -m pip install --only-binary=:all: pyshp==2.3.1
build/osm-venv/Scripts/python.exe tools/world-studio/examples/bremen.py `
  build/osm-input/land-polygons-split-4326/land_polygons.shp build/osm-input
foreach ($slug in @('bremen-1km', 'bremen-5km', 'bremen-nord-5km')) {
  build/osm-venv/Scripts/python.exe -m woc_osm --pbf build/osm-input/bremen.osm.pbf `
    --land build/osm-input/bremen-land.geojson --aoi "build/osm-input/$slug-aoi.json" `
    --config "build/osm-input/$slug-config.json" --output "build/osm-worlds/$slug" `
    --report "build/osm-input/$slug-report.json"
}
$env:WOC_OSM_WORLDS = 'build/osm-worlds'
npm.cmd --prefix client run test:e2e -- osm.spec.ts --workers=1
```

Die Browserprüfung legt Screenshots und Messdaten unter `client/test-results/` ab. Sie prüft vorhandene lokale Pakete unter `WOC_OSM_WORLDS`. Rohdaten, Cache und reale Exporte bleiben unter `build/`. Bei Weitergabe gelten die Lizenzbedingungen der jeweiligen Quelle. [OSM-Lizenz und Attribution](https://www.openstreetmap.org/copyright)
