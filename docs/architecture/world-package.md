# World Package — laufzeitladbare Karten

Status. Die Laufzeitloader aus P1-005 unterstützen mit P1-006 City v2/Visual v1 und City v3/Visual v2 in derselben Paket-v1-Hülle. [P1-005](../../tasks/P1-005-world-package-loader.md) · [P1-006](../../tasks/P1-006-osm-world-importer.md)

## Verzeichnis und Identität

Ein Paket ist ein zusammengehöriger Verzeichnisstand mit UTF-8-JSON. Die Verzeichnisnamen `breakwater` und `cove` sind die Auswahlwerte für den Browser. Breakwaters semantische Welt-ID ist weiterhin `p0-test-world`. [Breakwater](../../content/public/worlds/breakwater/manifest.json) · [Cove](../../content/public/worlds/cove/manifest.json)

| Datei | Vertrag |
|---|---|
| `manifest.json` | [World Package v1](../../content/world-package-v1.schema.json) |
| `world.json` | [City v2](../../content/city-v2.schema.json) oder [City v3](../../content/city-v3.schema.json) mit Geografie, Fußgraph, Ortszugängen, Spawns und Patrol |
| `visual.json` | [Visual v1](../../content/city-visual-v1.schema.json) zu City v2 oder [Visual v2](../../content/city-visual-v2.schema.json) zu City v3 |
| `theme.json` | [Theme v1](../../content/map-theme-v1.schema.json) mit Farben und Darstellungsregeln |
| `provenance.json` | [Provenance v1](../../content/world-provenance-v1.schema.json) mit Erstellungsmethode und Quellenangaben |

`packageVersion` versioniert das Manifest, `worldSchemaVersion` das semantische Schema. `worldRevision` bezeichnet den veröffentlichten Stand der semantischen Datei. Bei einer Änderung an `world.json` erhöht der Exporter die Revision und berechnet den Hash neu. `visualRevision` und die optionale `themeRevision` beschreiben optische Änderungen. Die Visualrevision entspricht `visual.json.revision`, bei fehlender Angabe gilt 1. Optional beschreiben `sourceCRS` und `origin` die Quelle. `origin` gibt den Ursprung in WGS84 als Längen- und Breitengrad an. Laufzeitkoordinaten sind bereits in Metern, x zeigt nach Osten, z nach Süden, y nach oben. `scaleFactor` dokumentiert die Skalierung des Exports.

Das Manifest nennt für jede Datei die genaue Länge und den SHA-256 der UTF-8-Bytes einschließlich Zeilenenden. `semanticHash` entspricht dem SHA-256 von `world.json`. Git bewahrt die Paketbytes beim Checkout. Manifest und Welt stimmen bei ID, Name, Schema-Version und Bounds überein. Das Manifest ist auf 64 KiB begrenzt, Welt und Visual auf je 8 MiB, Theme und Provenance auf je 128 KiB. Die vier Dateinamen sind pro Rolle festgelegt. Der native Loader löst Links auf und verlangt, dass die Zieldateien im Paketordner liegen. Der Browser ruft die Dateien ohne HTTP-Weiterleitung von der angegebenen statischen Basis ab.

`modules` ist eine optionale Erweiterungsstelle. Ein Modul beschreibt Rolle, Schema-Version, benötigte Engine-Fähigkeit, Pfad, Bytegröße und SHA-256. P1-005 weist jede nichtleere Modulliste mit `WORLD_PACKAGE_UNSUPPORTED_MODULE` ab. Das erste unterstützte Gameplay-Modul benötigt eine Gesamtidentität aus deterministisch sortierten Rollen und geprüften Hashes für Handshake und Spielstände. [Game Content](game-content.md)

## Start und Validierung

- Native Anwendung und CLI lesen das Manifest aus dem über `--world` gewählten Verzeichnis. Aus der Repository-Wurzel verwenden sie standardmäßig Breakwater. Sie prüfen alle Paketdateien auf Pfad, Größe, Hash und Schema. Der Content-Adapter validiert die semantische Geometrie, Ortszugänge, Spawns und den zusammenhängenden Graphen. Erst danach entstehen der Host und der Listener beziehungsweise startet die CLI ihre Eingabeschleife.
- Der Browser lädt zuerst das Manifest und dann alle vier Dateien über HTTP. Er prüft die Hashes der tatsächlichen Bytes per Web Crypto sowie die JSON-Schemas und Referenzen. Dev und Preview stellen die mitgelieferten Pakete unter `/worlds/<auswahl>/` bereit. `?world=cove` wählt Cove, `?worldBase=/karten/` oder eine HTTP(S)-URL eine andere statische Basis. Bei einer anderen Origin muss der Contentserver den Browserzugriff per CORS ermöglichen. Web Crypto benötigt localhost oder HTTPS für die Seite.
- Der WASM-Worker erhält die verifizierten Manifest- und Weltbytes. `woc_init` prüft das Manifest und die semantischen Bytes erneut mit demselben C++-Loader wie der native Host. Beide Clients einer Seite teilen denselben Worker. Erst nach erfolgreicher Initialisierung nimmt er Ports an und startet den Takt. Bei einem Init-Fehler wird der Worker beendet. Ein erneuter Verbindungsversuch erzeugt einen neuen Worker mit den ursprünglich geladenen Bytes.
- Im WebSocket-Modus laden Browser und Server dasselbe semantische Paket unabhängig. Protokoll v3 gleicht per `Welcome` Welt-ID, Welt-Schema, Weltrevision und semantischen Hash ab, bevor der Client eine Projektion annimmt. Visual und Theme dürfen lokal variieren. [Protokoll](protocol.md)

Der Simulationszustand gehört zum laufenden Host. Ein Weltwechsel erfolgt durch einen neuen Hoststart beziehungsweise einen neuen Seitenaufruf. `World` besitzt die unveränderliche `WorldDefinition` als Wert. Dadurch bleiben Orts-IDs, auf die Reisen und Projektionen per `string_view` verweisen, während der gesamten Hostlaufzeit gültig. CMake bettet nur Validierungsschemas ein. Die Weltdateien bleiben außerhalb der Binaries und des JavaScript-Bundles.

## Versionen und Geometrievalidierung

Beide City-Versionen verwenden ein metrisches Millimeterraster und Koordinaten innerhalb von ±10 km je Achse. Der beidseitige Fußgraph verlangt eindeutige Knotenpositionen, eindeutige Ortszugänge und eine zusammenhängende Komponente. Die drei Prototyp-Spawn-IDs und der Ambient-Patrol gehören zum City-Vertrag. Eine Traversierung prüft die Konnektivität in O(V+E).

City-v3-Manifeste tragen explizite `schemaVersion`-Werte in den vier Dateideskriptoren. Die Zuordnung ist Welt 3, Visual 2, Theme 1 und Provenance 1. Bei bestehenden City-v2-Manifesten leiten die Loader fehlende Angaben als 2, 1, 1 und 1 ab. Versionskonflikte werden vor dem Laden abgelehnt. Theme v1, Welcome v3, Pfad- und Hashprüfungen sowie die Byte-Limits gelten für beide Kombinationen.

City v3 verwendet Bounding-Volume-Bäume für Ringsegmente und Flächen. Der gemeinsame C++-Loader validiert die semantische Geometrie und prüft Fußkanten gegen Land, Löcher und Gebäude. Native Hosts und TypeScript prüfen zusätzlich Straßenflächen, Oberflächen und Küstengrenzen aus Visual v2. Der Worker initialisiert den C++-Host mit den verifizierten semantischen Bytes. Der Browser wartet bis zu 30 Sekunden auf die Betriebsbereitschaft des Workers, damit große gültige Pakete ihre Geometrie prüfen können. Die Frist für Protokollantworten beträgt fünf Sekunden. Beim Import werden die Python-Schemas und die tatsächlichen nativen, TS- und WASM-Loader im temporären Exportverzeichnis ausgeführt. [Kartenformat](map-format.md) · [Importanleitung](../../tools/world-studio/README.md)
