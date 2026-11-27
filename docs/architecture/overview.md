# Technische Architektur
Status: VORGABE für gemeinsamen C++-Kern mit WASM/native Hosts, asynchronen Transportvertrag und logische Mehrclientfähigkeit. Bibliotheksdetails ENTWURF.

## Architekturziel
Eine einzige autoritative Spielsimulation in portablem C++ (Vorschlag C++23, zunächst kompatibler Teilumfang). Der gleiche Core und Application Layer werden als native Bibliothek und mit Emscripten als WASM-Modul gebaut. TypeScript enthält keine zweite autoritative Spielregelimplementierung. UI, Kartenrenderer und ViewModels kennen ausschließlich SimulationClient, nicht die Transportart.

Browser: Svelte/Three.js → SimulationClient → WasmTransport → dedizierter Web Worker (postMessage) → schmale WASM-Bridge → SimulationHost → Core.
Server: Svelte/Three.js → SimulationClient → WebSocketTransport → nativer WebSocket-Host → SimulationHost → Core.
Native CLI/Testhost: nutzt denselben Core/Application Layer ohne Browser und ohne Netzwerk. Kein WebSocket-Server im WASM-Modul; Web Worker ist die lokale Prozessgrenze. Mehrere logische Sessions können denselben lokalen Host via separater Clientinstanzen/MessagePorts nutzen; separate Tabs teilen nicht automatisch einen Dedicated Worker. SharedWorker/Remote-Server später prüfen.

## Build und Abhängigkeiten
CMake mit nativen und Emscripten-Presets; getrennte Build-Verzeichnisse. Core als statische Library pro Ziel, native CLI, native Server-Executable, WASM ES-Modul mit schmaler C-ABI (Puffer/Bytes, explizite Speicherverantwortung). Emscripten JS-Glue nur im Worker. C++23 als Ziel, verfügbare Standardbibliotheksfeatures beider Toolchains prüfen. Boost.Asio/Beast nur im nativen Netzwerkadapter; JSON z.B. nlohmann/json als portabler Protokollcodec (Entwurf). Svelte 5, Vite, Three.js, TypeScript strict, CSS-Tokens, Vitest und Playwright im Client. Native CTest plus geeignetes C++-Testframework (Entwurf: Catch2). Pinning erst beim Setup; Lockfiles bzw. reproduzierbare Versionsfestlegung. Quellen: https://emscripten.org/docs/compiling/Modularized-Output.html, https://www.boost.org/latest/libs/beast/doc/html/beast/using_websocket.html.

## Vorgeschlagene Repository-Struktur (noch keine Implementierung)
- simulation/core/: Weltzustand, Entitäten, Komponenten, Clock, Scheduler, RNG, fachliche Systeme, Domain Events; keine Plattform- oder IO-Abhängigkeit.
- simulation/application/: SimulationHost, Sessions, Commands, CharacterControl, Projektionen, Snapshot-/Save-Modell; nutzt Core.
- simulation/protocol/: Nachrichten, Codec, Validierung, Versionsverhandlung.
- simulation/hosts/native/: CLI, Tick-Loop, native Persistenzadapter, WebSocket-Server (Netzwerk als Adapter).
- simulation/hosts/wasm/: C-ABI, Emscripten-Adapter; Browser-Worker treibt Tick und I/O.
- protocol/: sprachneutrale JSON-Schemas und gemeinsame Fixtures, generierte TS-Typen optional.
- client/src/simulation/: SimulationClient, Transport, WasmTransport, WebSocketTransport, read-only ViewStore; Worker-Entry.
- client/src/render/: Three.js-Karte, Kamera, Layer, Marker, Picking.
- client/src/ui/: Svelte und CSS.
- content/: gemeinsame statische Welt-/Item-/Charakterdefinitionen, Versionen.
- tests/: Vertrags-/Paritätstests, Integration, Browser-E2E; C++-Unit-Tests nahe Simulation.
Verzeichnisse erst bei Umsetzung anlegen.

## Domänenkern und Ereignisse
ECS-inspirierte, typisierte Komponenten und Systeme mit stabilen IDs. Keine große Engine erzwingen. Core besitzt den autoritativen Zustand. Commands (Absicht) werden in geordneter Queue an Tick-/Ereignisgrenzen geprüft, atomar ausgeführt und quittiert; Domain Events (Tatsache) entstehen erst nach Commit. Systemreaktionen über geplante Arbeit, keine rekursive Mutation via Listener. Der Application Layer projiziert Domain Events in erlaubte Client-Nachrichten; interne Events und öffentliche Protokoll-Events sind nicht identisch. Client-Event-Bus optional für Präsentation, kein Spielregelbus.

## Runtime und Performance
Fester oder ereignisbasierter Simulationsschritt in Spielzeit, getrennt von Render-FPS. Host injiziert Clock und RNG. Eine autoritative Mutationslane pro Welt; mehrere Netzwerksessions senden in die Queue, keine unkontrollierten Schreibzugriffe. Browser Worker zunächst single-threaded, native ebenfalls; parallele read-only Jobs erst nach Profiling. WASM kann CPU-intensive Logik beschleunigen, garantiert aber keinen Speedup. Batching über ABI/Transport, räumliche Indizes, geplante NPC-Aktivitäten und Simulationsstufen zuerst. Native/WASM sollen mit Seed und Befehlsfolge semantisch gleiche Ergebnisse liefern: stabile Iteration, definierter RNG, Integer/fixed-point für kritische Werte, kanonische Vergleichsprojektionen; Float-Rundung und undefiniertes Verhalten vermeiden. Keine bitgenaue Parität versprechen, bevor getestet.

## Zustand, Speicherung und Multiplayer
WorldState enthält Bewohner auch ohne Client; Session-/Kontrollrechte sind keine Charakteridentität. Save serialisiert versionierten Zustand, Clock, RNG, Scheduler, laufende Aktionen, Weltdefinitionsversion; keine Socket-/Worker-Handles oder aktiven Client-Leases. Beim Laden ohne Session bleiben Charaktere autonom bzw. durch definierte Recovery-Regel konsistent. Browserhost schreibt über IndexedDB, nativer Host zunächst Datei/StorageAdapter; Core führt kein Dateisystem-I/O aus. Host-seitig autoritative Validierung, Sessionbindung und gezielte Projektion auch im lokalen Betrieb. Remote zusätzlich TLS, Authentifizierung, Autorisierung, Limits, Reconnect und Interest Management vor öffentlicher Freigabe. Lokales WASM ist vom Nutzer manipulierbar; keine ungeprüfte Übernahme lokaler Spielstände in kompetitive Serverwelten.

## Migration von der ersten Architektur
Die frühere TypeScript-Simulation ist konzeptionell ersetzt, nicht parallel weiterzuführen. P0-Karte darf mit MockTransport arbeiten; P0-002 ersetzt Mock durch echte Hosts und testet beide. Siehe [Protokoll](protocol.md), [Charaktere](../design/characters.md), [Roadmap](../roadmap.md).
