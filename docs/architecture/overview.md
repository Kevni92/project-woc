# Technische Architektur
Status: VORGABE für gemeinsamen C++-Kern mit WASM/native Hosts, asynchronen Transportvertrag und logische Mehrclientfähigkeit. P0-002 setzt diesen Pfad mit einer kleinen Testwelt um. P1-001 ergänzt Breakwaters autoritativen Graphen und Fußreisen. Die darüber hinausgehenden Architekturdetails bleiben ENTWURF.

## Architekturziel
Eine einzige autoritative Spielsimulation in portablem C++23. Der gleiche Core und Application Layer werden für native Programme und das Emscripten-Modul als statische Bibliotheken gebaut. Der TypeScript-Client verwaltet die lesende Projektion. Stadtkarte und Debugger verwenden `SimulationClient`.

Browser: Svelte/Three.js → SimulationClient → WasmTransport → dedizierter Web Worker (postMessage) → schmale WASM-Bridge → SimulationHost → Core.
Server: Svelte/Three.js → SimulationClient → WebSocketTransport → nativer WebSocket-Host → SimulationHost → Core.
Native CLI/Testhost: nutzt denselben Core/Application Layer ohne Browser und ohne Netzwerk. Kein WebSocket-Server im WASM-Modul; Web Worker ist die lokale Prozessgrenze. Mehrere logische Sessions können denselben lokalen Host via separater Clientinstanzen/MessagePorts nutzen; separate Tabs teilen nicht automatisch einen Dedicated Worker. SharedWorker/Remote-Server später prüfen.

## Build und Abhängigkeiten

Die Ninja-Presets `native` und `wasm` verwenden getrennte Build-Verzeichnisse. `woc_cli` ist der native Testhost, `woc_server` der Boost.Asio/Beast-Adapter mit IPv4-Loopback-Binding. `woc_wasm` liefert ein Emscripten-ES-Modul für den Worker. Der Worker besitzt die Eingabepuffer, gibt sie nach dem ABI-Aufruf frei und liest den Ausgabepuffer, bevor er die nächste Operation startet. Die native und die WASM-Runtime verwenden denselben nlohmann/json-Codec. Der Client verwendet Svelte 5, Vite, TypeScript strict und CSS-Tokens. CTest, Vitest und Playwright decken die nativen, Client- und Browsertests ab. Buildbefehle und lokal geprüfte Versionen stehen in der [README](../../README.md) und in [P0-002](../../tasks/P0-002-dual-runtime.md).

## Implementierte Struktur

| Pfad | Aufgabe |
|---|---|
| `simulation/core/` | Weltzustand, Spielzeit, Wegfindung, Reiseverlauf und Bewegungsereignisse |
| `simulation/content/` | Validierung der eingebetteten Geografie und Aufbau der Weltdefinition |
| `simulation/application/` | Sessions, Character-Leases, fachliche Befehle und sitzungsbezogene Projektionen |
| `simulation/protocol/` | JSON-Codec, Version, Sequenzen, Ergebnis-Deduplikation und Zustellung |
| `simulation/hosts/native/`, `simulation/hosts/wasm/` | CLI-Frames, Loopback-WebSocket, Takt beziehungsweise C-ABI |
| `protocol/` | Sprachneutrale JSON-Schemas und gemeinsame Vertragsfixture |
| `client/src/simulation/` | Transportadapter, Worker, SimulationClient und Projektion |
| `content/` | Semantische Welt v2 mit Wegenetz, Visual-Sidecar v1 und Theme v1 samt JSON-Schemas |
| `client/src/render/` | Kartenvalidierung, Three.js-Geografie, Kamera, Palette und Projektion auf den Bildschirm |
| `client/src/ui/` | Stadtkarte mit HTML-Markern und Details sowie zwei Debug-Panels auf demselben Simulationshost |
| `tests/`, `client/tests/` | Native Tests, Client-/Kartentests, Vertragsparität und Browser-Smoke |

## Domänenkern und Ereignisse

Der Core besitzt den Weltzustand mit stabilen IDs. Worker-Eventloop und natives `io_context` serialisieren Befehle, Verbindungsereignisse und Ticks. Jeder Eingang wird bis zum Ende verarbeitet. Der Host validiert und ändert den Zustand, dann erzeugt der Protokoll-Endpunkt Resultate und Deltas aus den neuen Projektionen. Die zustandsändernden Operationen geben `MovementStarted` und `EntityArrived` nach der jeweiligen Mutation zurück. Diese Ereignisse stehen intern für spätere NPC-Logik zur Verfügung. Der native Adapter begrenzt seine ausgehende Warteschlange pro Verbindung auf 64 Nachrichten und beendet die Verbindung bei Überlauf. ECS, Scheduler und RNG bleiben Entwürfe.

## Runtime und Performance
Die Welt startet um 08:00 Uhr. Ein Tick entspricht einer Spielminute. Der native Server und der Worker planen im Normalbetrieb einen Tick pro Sekunde ohne Aufholen versäumter Ticks. Für den Vertragsvergleich geben CLI-Frames, stdin des nativen Testservers und der manuell getaktete Worker dieselbe Tickfolge vor. Diese Taktsteuerung liegt außerhalb des Spielprotokolls.

Fester oder ereignisbasierter Simulationsschritt in Spielzeit, getrennt von Render-FPS. Host injiziert Clock und RNG. Eine autoritative Mutationslane pro Welt; mehrere Netzwerksessions senden in die Queue, keine unkontrollierten Schreibzugriffe. Browser Worker zunächst single-threaded, native ebenfalls; parallele read-only Jobs erst nach Profiling. WASM kann CPU-intensive Logik beschleunigen, garantiert aber keinen Speedup. Batching über ABI/Transport, räumliche Indizes, geplante NPC-Aktivitäten und Simulationsstufen zuerst. Native/WASM sollen mit Seed und Befehlsfolge semantisch gleiche Ergebnisse liefern: stabile Iteration, definierter RNG, Integer/fixed-point für kritische Werte, kanonische Vergleichsprojektionen; Float-Rundung und undefiniertes Verhalten vermeiden. Keine bitgenaue Parität versprechen, bevor getestet.

## Zustand, Speicherung und Multiplayer
Die zwei Bewohner bleiben samt Bargeld, Position und Reiseplan im Speicher des laufenden Hosts erhalten. Freie Bewohner beenden begonnene Reisen und verbleiben anschließend am Zugang. Der Ambient-Passant pendelt über denselben Routenkern zwischen zwei Wegpunkten. Der Worker lebt pro Browserseite, der native Host pro Prozess.

WorldState enthält Bewohner auch ohne Client; Session-/Kontrollrechte sind keine Charakteridentität. Save serialisiert versionierten Zustand, Clock, RNG, Scheduler, laufende Aktionen, Weltdefinitionsversion; keine Socket-/Worker-Handles oder aktiven Client-Leases. Beim Laden ohne Session bleiben Charaktere autonom bzw. durch definierte Recovery-Regel konsistent. Browserhost schreibt über IndexedDB, nativer Host zunächst Datei/StorageAdapter; Core führt kein Dateisystem-I/O aus. Host-seitig autoritative Validierung, Sessionbindung und gezielte Projektion auch im lokalen Betrieb. Remote zusätzlich TLS, Authentifizierung, Autorisierung, Limits, Reconnect und Interest Management vor öffentlicher Freigabe. Lokales WASM ist vom Nutzer manipulierbar; keine ungeprüfte Übernahme lokaler Spielstände in kompetitive Serverwelten.

## Kartenpfad

Manifest und Karten-JSON liegen in laufzeitladbaren Paketen. Der gemeinsame C++-Loader prüft die semantischen Bytes beim nativen Start und bei der WASM-Initialisierung. `World` besitzt die unveränderliche typisierte Definition und hält damit Referenzen aus Reisen und Projektionen gültig. Der Browser prüft vor der Verbindung das vollständige Paket. Er reicht die Welt an Karte und Debugger weiter und vergleicht ihre Identität mit `Welcome` in Protokoll v3. [World Package](world-package.md)

`MapViewport` erhält Geografie, Visual-Sidecar und Theme über das geladene Paket. Es reicht die lesenden Marker, die Route, die Auswahl und die Spielminuten an den Renderer. Die orthografische Kamera bietet einen unabhängigen Azimut. Die Gebäudehöhe geht stufenlos auf null, während die Kamera ins Top-down kippt. Farbgruppen bündeln die statische Geometrie. Ein Dreiecksindex ordnet angeklickte Dach- und Wandflächen der autoritativen Gebäude-ID zu. Die Fenster werden in räumlichen Gruppen erst in der Nahansicht eingeblendet. Die Wasserfarbe nutzt eine einmal berechnete Distanztextur mit metrischen Koordinaten.

`MapView` nimmt Befehle entgegen und zeigt Steuerrechte, Reisezustand und privates Bargeld aus der autoritativen Projektion. Marker, Führungslinien und Kontextfenster teilen sich die Projektion in CSS-Pixeln. Bei einer Resynchronisierung blendet die Karte Live-Marker und Route bis zum Snapshot aus und lädt bei Bedarf eine frische Vorschau. Der Debugger wird über `?view=debug` geöffnet und greift mit Client A auf dieselbe Session zu. [Kartenformat](map-format.md) · [Kartenstil](../design/map-visuals.md)

## Geplanter Weltimport
P1-006 soll aus OSM-Daten World Packages erstellen. P1-007 stellt dafür ein separates lokales Entwicklerwerkzeug bereit. [World Studio](../design/world-studio.md)

## Langfristige Content-Engine
C++ interpretiert dynamisch geladene, versionierte Definitionen und Startinstanzen; World Studio wird später modularer Content-Editor. Generische typisierte Mechanikhandler und deklarative Bedingungen/Effekte statt hartcodierter Spielinhalte. Siehe [Game Content](game-content.md). Kartenloader/Importer/Studio bleiben zunächst im bisherigen Umfang, keine vollständige Regel-Engine vorziehen.
