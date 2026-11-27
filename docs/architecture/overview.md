# Technische Architektur
Status: VORGABE für gemeinsamen C++-Kern mit WASM/native Hosts, asynchronen Transportvertrag und logische Mehrclientfähigkeit. P0-002 setzt diesen Pfad mit einer kleinen Testwelt um. Die darüber hinausgehenden Architekturdetails bleiben ENTWURF.

## Architekturziel
Eine einzige autoritative Spielsimulation in portablem C++23. Der gleiche Core und Application Layer werden für native Programme und das Emscripten-Modul als statische Bibliotheken gebaut. Der TypeScript-Client verwaltet die lesende Projektion. UI und ViewModels verwenden `SimulationClient`. Die geplante Karte verwendet dieselbe Schnittstelle.

Browser: Svelte/Three.js → SimulationClient → WasmTransport → dedizierter Web Worker (postMessage) → schmale WASM-Bridge → SimulationHost → Core.
Server: Svelte/Three.js → SimulationClient → WebSocketTransport → nativer WebSocket-Host → SimulationHost → Core.
Native CLI/Testhost: nutzt denselben Core/Application Layer ohne Browser und ohne Netzwerk. Kein WebSocket-Server im WASM-Modul; Web Worker ist die lokale Prozessgrenze. Mehrere logische Sessions können denselben lokalen Host via separater Clientinstanzen/MessagePorts nutzen; separate Tabs teilen nicht automatisch einen Dedicated Worker. SharedWorker/Remote-Server später prüfen.

## Build und Abhängigkeiten

Die Ninja-Presets `native` und `wasm` verwenden getrennte Build-Verzeichnisse. `woc_cli` ist der native Testhost, `woc_server` der Boost.Asio/Beast-Adapter mit IPv4-Loopback-Binding. `woc_wasm` liefert ein Emscripten-ES-Modul für den Worker. Der Worker besitzt die Eingabepuffer, gibt sie nach dem ABI-Aufruf frei und liest den Ausgabepuffer, bevor er die nächste Operation startet. Die native und die WASM-Runtime verwenden denselben nlohmann/json-Codec. Der Client verwendet Svelte 5, Vite, TypeScript strict und CSS-Tokens. CTest, Vitest und Playwright decken die nativen, Client- und Browsertests ab. Buildbefehle und lokal geprüfte Versionen stehen in der [README](../../README.md) und in [P0-002](../../tasks/P0-002-dual-runtime.md).

## Implementierte Struktur

| Pfad | Aufgabe |
|---|---|
| `simulation/core/` | Weltzustand, Spielzeit, Ambient-Weg und deterministische Testaktion |
| `simulation/application/` | Sessions, Character-Leases, fachliche Befehle und sitzungsbezogene Projektionen |
| `simulation/protocol/` | JSON-Codec, Version, Sequenzen, Ergebnis-Deduplikation und Zustellung |
| `simulation/hosts/native/`, `simulation/hosts/wasm/` | CLI-Frames, Loopback-WebSocket, Takt beziehungsweise C-ABI |
| `protocol/` | Sprachneutrale JSON-Schemas und gemeinsame Vertragsfixture |
| `client/src/simulation/` | Transportadapter, Worker, SimulationClient und Projektion |
| `client/src/ui/` | Zwei Debug-Panels auf demselben Simulationshost |
| `tests/`, `client/tests/` | Native Tests, Client-Tests, Vertragsparität und Browser-Smoke |

## Domänenkern und Ereignisse

In P0-002 besitzt der Core den Weltzustand mit stabilen IDs. Worker-Eventloop und natives `io_context` serialisieren Befehle, Verbindungsereignisse und Ticks. Jeder Eingang wird bis zum Ende verarbeitet. Der Host validiert und ändert den Zustand, dann erzeugt der Protokoll-Endpunkt Resultate und Deltas aus den neuen Projektionen. Der native Adapter begrenzt seine ausgehende Warteschlange pro Verbindung auf 64 Nachrichten und beendet die Verbindung bei Überlauf. ECS-Komponenten, fachliche Domain Events, Scheduler und RNG bleiben Entwürfe.

## Runtime und Performance
P0-002 startet um 08:00 Uhr. Ein Tick entspricht einer Spielminute. Der native Server und der Worker planen im Normalbetrieb einen Tick pro Sekunde ohne Aufholen versäumter Ticks. Für den Vertragsvergleich bleibt die Uhr in beiden Transporten stehen. Die CLI verarbeitet Ticks nur bei expliziten `tick`-Frames.

Fester oder ereignisbasierter Simulationsschritt in Spielzeit, getrennt von Render-FPS. Host injiziert Clock und RNG. Eine autoritative Mutationslane pro Welt; mehrere Netzwerksessions senden in die Queue, keine unkontrollierten Schreibzugriffe. Browser Worker zunächst single-threaded, native ebenfalls; parallele read-only Jobs erst nach Profiling. WASM kann CPU-intensive Logik beschleunigen, garantiert aber keinen Speedup. Batching über ABI/Transport, räumliche Indizes, geplante NPC-Aktivitäten und Simulationsstufen zuerst. Native/WASM sollen mit Seed und Befehlsfolge semantisch gleiche Ergebnisse liefern: stabile Iteration, definierter RNG, Integer/fixed-point für kritische Werte, kanonische Vergleichsprojektionen; Float-Rundung und undefiniertes Verhalten vermeiden. Keine bitgenaue Parität versprechen, bevor getestet.

## Zustand, Speicherung und Multiplayer
In P0-002 bleiben die zwei Bewohner samt Geld und Position im Speicher des laufenden Hosts erhalten. Freie Bewohner sind im Leerlauf. Der Ambient-Passant folgt einem kurzen deterministischen Weg. Der Worker lebt pro Browserseite, der native Host pro Prozess.

WorldState enthält Bewohner auch ohne Client; Session-/Kontrollrechte sind keine Charakteridentität. Save serialisiert versionierten Zustand, Clock, RNG, Scheduler, laufende Aktionen, Weltdefinitionsversion; keine Socket-/Worker-Handles oder aktiven Client-Leases. Beim Laden ohne Session bleiben Charaktere autonom bzw. durch definierte Recovery-Regel konsistent. Browserhost schreibt über IndexedDB, nativer Host zunächst Datei/StorageAdapter; Core führt kein Dateisystem-I/O aus. Host-seitig autoritative Validierung, Sessionbindung und gezielte Projektion auch im lokalen Betrieb. Remote zusätzlich TLS, Authentifizierung, Autorisierung, Limits, Reconnect und Interest Management vor öffentlicher Freigabe. Lokales WASM ist vom Nutzer manipulierbar; keine ungeprüfte Übernahme lokaler Spielstände in kompetitive Serverwelten.

## Migration von der ersten Architektur
P0-002 liefert echte Hosts für den im Karten-Task vorgesehenen Client-Vertrag. P0-001 kann für statische Kartentests weiterhin einen MockTransport mit Fixtures einsetzen. Siehe [Protokoll](protocol.md), [Charaktere](../design/characters.md), [Roadmap](../roadmap.md).
