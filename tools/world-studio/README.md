# World Studio und OSM-Importer

`woc_osm` erzeugt ein World Package v1 mit City v3 und Visual v2. Das separate World Studio verwendet denselben Importer und dieselben Validatoren.

## World Studio

Voraussetzungen sind die nativen und WASM-Builds, `npm --prefix client ci` sowie die Python-Installation unten. Aus der Repository-Wurzel:

```powershell
npm --prefix tools/world-studio ci
npm --prefix tools/world-studio run build
$env:PYTHONPATH = 'tools/world-studio'
build/osm-venv/Scripts/python.exe -m studio --data build/osm-input --workspace build/world-studio --port 8000
```

Auf Linux/macOS `build/osm-venv/bin/python` und den passenden nativen Build verwenden. Die Anwendung ist nur unter `http://127.0.0.1:8000` erreichbar. `--data` begrenzt die lesbaren Quellen; PBF und Land-GeoJSON werden relativ zu diesem Verzeichnis angegeben. `--workspace` enthält `projects/` für editierbare JSON-Projekte, `jobs/` für temporäre Importergebnisse und Berichte sowie `exports/` für validierte Laufzeitpakete. IDs sind Kleinbuchstaben, Zahlen und Bindestriche. Ein Export überschreibt keine bestehende Welt. Beim Neustart werden Jobstatus nicht fortgesetzt; Projekte und Exporte bleiben erhalten.

1. In der Karte navigieren oder `Breitengrad, Längengrad` suchen. Die Koordinatensuche benötigt kein Netzwerk. Standardmäßig ist ein leerer Offline-Hintergrund aktiv. Unter **Kartenanbieter und Geocoder** kann eine eigene zulässige MapLibre-Stil-URL und eine Geocoder-URL mit `{query}` konfiguriert werden. Der Geocoder muss ein JSON-Array mit `lat` und `lon` zurückgeben und CORS erlauben. Es gibt keine automatische Suche; Nutzungsbedingungen, Rate Limits und Attribution des gewählten Anbieters sind zu beachten. Keine geheimen Schlüssel in die lokalen Browsereinstellungen eintragen. Vor dem für die Konfiguration nötigen Neuladen das Projekt speichern.
2. **Rechteck** oder **Freihand** wählen und mit gedrückter linker Maustaste ziehen; Freihand schließt beim Loslassen. Mit **Bearbeiten** kann der Außenring verschoben und über seine Punkte geändert werden. **Auswahl löschen**, GeoJSON-Import/-Download und metrisches Rechteck um die Kartenmitte stehen daneben bereit. Anzeige und Import verwenden metrisch projizierte Fläche und Ausdehnung. Geladene GeoJSON-Innenringe bleiben erhalten und sind gestrichelt markiert; einzelne Innenringe werden in diesem Schnitt nicht im Studio bearbeitet. Beim Verschieben des gesamten Polygons verschieben sie sich mit. Ungültige Geometrie wird abgelehnt.
3. Projekt-ID, Weltkonfiguration, Quellen und Lizenzangaben eingeben und Projekt speichern. Natural und Island sowie Padding und Seed steuern denselben P1-006-Importer. Lokale Quellen werden weder heruntergeladen noch ins Spielbundle übernommen.
4. Import starten, Phase und Qualitätsbericht beobachten; ein laufender Job kann abgebrochen werden. Nach erfolgreicher Runtime-Validierung zeigen die Kartenvorschau ihre einzeln schaltbaren Layer und die Spielvorschau den bestehenden Three.js-Renderer. Der Export kopiert nur das validierte Paket; nach Projektänderungen ist ein erneuter Import nötig. Bei Größen- oder Koordinatengrenzen muss die Auswahl bzw. das Padding reduziert werden; die P1-006-Limits werden nicht angehoben.
5. Für **Im Spiel öffnen** zusätzlich den Game-Client auf `127.0.0.1:5173` starten. Das Studio liefert die exportierten Paketdateien über seine lokale `/worlds/`-Basis; es muss dabei weiterlaufen. Für den nativen WebSocket-Modus `build/native/woc_server.exe --world <Exportpfad>` starten und der Spiel-URL `&transport=ws` hinzufügen. Ein neuer Hoststart ist bei Weltwechsel nötig; ein Neubuild ist nicht nötig.

### Tests

```powershell
$env:PYTHONPATH = 'tools/world-studio'
build/osm-venv/Scripts/python.exe -m unittest discover -s tools/world-studio/tests -v
build/osm-venv/Scripts/python.exe tools/world-studio/tests/fixture.py build/studio-e2e/data/fixture-final
npm --prefix tools/world-studio run typecheck
npm --prefix tools/world-studio run build
```

Für den Browsertest in zwei weiteren Terminals den Studio-Server mit `--data build/studio-e2e/data --workspace build/studio-e2e/workspace --port 8099` und den Game-Client auf Port 5173 starten. Chromium bei Bedarf mit `npm --prefix tools/world-studio exec -- playwright install chromium` installieren. Danach aus der Repository-Wurzel:

```powershell
$env:WOC_STUDIO_TEST_DATA = '../../build/studio-e2e/data'
$env:WOC_STUDIO_TEST_EXPORTS = '../../build/studio-e2e/workspace/exports'
npm --prefix tools/world-studio run test:e2e
```

Der Test erzeugt eigene Projekt- und Welt-IDs und prüft Offline-Auswahl, Projekt, Import, Abbruch, Fehler, Vorschau, Export und beide Hosts. Für den optionalen realen Bremen-Test muss das Datenverzeichnis zusätzlich die unter **Bremer Messläufe** beschriebenen Dateien enthalten; `WOC_STUDIO_REAL_INPUT=1` aktiviert ihn. Die Ergebnisse dieses Tasks sind in [P1-007](../../tasks/P1-007-world-studio.md) dokumentiert.

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
