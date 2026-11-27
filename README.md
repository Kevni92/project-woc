# Project WOC

Kartenbasiertes Browser-Crime-RPG mit eigenständig simulierter Welt. Inspiration: GTA-Kartenansicht und klassische Browser-RPGs wie World of Drugs. Eigenständige IP.

**Stand.** Breakwater ist die interaktive Stadtkarte aus P0-001. Karte und Simulations-Debugger verwenden denselben C++-Kern über den WebAssembly-Worker oder den nativen Loopback-WebSocket-Host.

## Lokal bauen und starten

Benötigt werden CMake ab 3.25, Ninja, ein C++23-Compiler, das Emscripten SDK 4.0.23 und Node.js 22 ab 22.12, 24 oder 26+. CMake lädt nlohmann/json 3.12.0 und für den nativen Build Boost 1.90.0 aus den festgelegten Release-Archiven. `npm ci` installiert die Versionen aus dem Client-Lockfile.

**Windows, nativer Build** im x64 Native Tools Command Prompt für Visual Studio 2022 mit C++-Build-Tools und Windows SDK. Befehle aus der Repository-Wurzel ausführen.

```cmd
cmake --preset native
cmake --build --preset native
ctest --preset native
```

**Windows, WASM-Build** in einer Eingabeaufforderung. Die ersten drei Befehle sind einmalig. `set EM_LLVM_ROOT=` entfernt im aktuellen Fenster eine eventuell geerbte LLVM-Überschreibung, damit Emscripten seinen eigenen Compiler verwendet.

```cmd
git clone --depth 1 --branch 4.0.23 https://github.com/emscripten-core/emsdk.git "%USERPROFILE%\Tools\woc-emsdk"
"%USERPROFILE%\Tools\woc-emsdk\emsdk.bat" install 4.0.23
"%USERPROFILE%\Tools\woc-emsdk\emsdk.bat" activate 4.0.23
set EM_LLVM_ROOT=
call "%USERPROFILE%\Tools\woc-emsdk\emsdk_env.bat"
cmake --preset wasm
cmake --build --preset wasm
```

Auf Linux und macOS die Skripte `./emsdk install 4.0.23`, `./emsdk activate 4.0.23` und `source ./emsdk_env.sh` aus dem SDK verwenden. Danach gelten dieselben CMake-Presets aus der Repository-Wurzel. Der WASM-Build legt den generierten Modulcode und die Binärdatei unter `client/src/generated/` ab.

**Browser-Client** nach dem WASM-Build aus der Repository-Wurzel starten.

```text
npm --prefix client ci
npm --prefix client run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

- **WASM** über [127.0.0.1:5173](http://127.0.0.1:5173/). Stadtkarte und Debugger teilen sich den dedizierten Worker.
- **WebSocket** über [127.0.0.1:5173/?transport=ws](http://127.0.0.1:5173/?transport=ws). In einem zweiten Terminal aus der Repository-Wurzel `build\native\woc_server.exe` (Windows) oder `./build/native/woc_server` (Linux/macOS) starten. Standardadresse ist `ws://127.0.0.1:8765`. Für einen anderen Port `woc_server --port PORT` verwenden und die WebSocket-Adresse als URL-kodierten Parameter `ws` übergeben.

Die Karte verbindet beim ersten Öffnen automatisch. Ziehen und Pfeiltasten verschieben den Ausschnitt. Mausrad, Zwei-Finger-Geste oder Plus/Minus zoomen. Die Fokustaste zentriert den eigenen Charakter oder den Startbereich. Die Übersichtstaste oder Pos1 setzt den Ausschnitt zurück. Orte und Charaktere lassen sich auf der Karte oder in der Seitenleiste auswählen. Ein Klick auf ein Gebäude zeigt Viertel und Höhe. Die Karte benötigt WebGL 2. [Three.js-Dokumentation](https://threejs.org/docs/pages/WebGLRenderer.html)

**Debugger** öffnet `?view=debug` mit derselben Transportkonfiguration. Client A teilt seine Session mit der Stadtkarte. Bei direktem Debugger-Aufruf startet jede Session über **Verbinden**. Mit **Testaktion** ändern sich Position und eigenes Bargeld auf dem Host. **Zur Stadtkarte** zeigt die neue Position. **Snapshot anfordern** lädt die Projektion neu.

## Vertragstests und Browser-Smoke

Nach beiden CMake-Builds und `npm ci` die folgenden Befehle aus der Repository-Wurzel ausführen. Playwright startet Vite auf den Ports 4173 und 4174 sowie bei Bedarf einen nativen Loopback-Host mit dynamisch zugewiesenem Port.

```text
npm --prefix client run typecheck
npm --prefix client test
npm --prefix client run build
npm --prefix client exec -- playwright install chromium
npm --prefix client run test:e2e
```

Die native CLI liest je Zeile einen Testframe mit `op` (`open`, `send`, `close` oder `tick`), bei Bedarf `connection` und für `send` das Protokollobjekt `message`. Sie gibt pro Zeile ein JSON-Array der zugestellten Nachrichten aus. Die gemeinsame Fixture steht in [P0-002](tasks/P0-002-dual-runtime.md). Die Prüfungen der Stadtkarte sind in [P0-001](tasks/P0-001-map-prototype.md) dokumentiert.

## Dokumentation
| Datei | Zweck |
|---|---|
| [AGENTS.md](AGENTS.md) | Zentrale KI-Anweisung für jeden neuen Chat |
| [Vision](docs/design/vision.md) | Spielprinzip, Grenzen und Kernschleife |
| [Welt](docs/design/world.md) | Geografie, Orte, Kartenansichten |
| [Simulation](docs/design/simulation.md) | Zeit, NPCs und Bewegung |
| [Gameplay](docs/design/gameplay.md) | Charakter, Besitz, Inventar, Missionen |
| [Charaktere](docs/design/characters.md) | Identität, Steuerübernahme, Simulationstiefe |
| [Protokoll](docs/architecture/protocol.md) | Transportneutraler Nachrichtenaustausch |
| [Architektur](docs/architecture/overview.md) | Technischer Aufbau und Ereignismodell |
| [Roadmap](docs/roadmap.md) | Kleine spielbare Meilensteine |
| [Entscheidungen](docs/decisions.md) | Vorgaben, Entwürfe und offene Fragen |
| [Arbeitsweise](docs/workflow.md) | Konzept- und KI-Implementierungsprozess |
| [P0-001](tasks/P0-001-map-prototype.md) | Interaktive Karte |
| [P0-002](tasks/P0-002-dual-runtime.md) | Native/WASM-Simulation mit identischem Protokoll |
| [P1-001](tasks/P1-001-movement.md) | Autoritatives Wegenetz und Fußreisen (nächster Task) |
| [P1-002](tasks/P1-002-character-routines.md) | Bewohner und Tagespläne (Entwurf) |
| [P1-003](tasks/P1-003-npc-behavior.md) | NPC-Entscheidungen und Ambient-Population (Entwurf) |

Starte eine KI-Sitzung mit dem Repository-Link und der Anweisung, AGENTS.md zu lesen.
