# Project WOC

Kartenbasiertes Browser-Crime-RPG mit eigenständig simulierter Welt. Inspiration: GTA-Kartenansicht und klassische Browser-RPGs wie World of Drugs. Eigenständige IP.

**Stand.** Breakwater und Cove sind als laufzeitladbare Kartenpakete verfügbar. Der lokale OSM-Importer erzeugt City-v3-Pakete aus einem PBF, Landpolygonen und einer frei geformten Auswahl. World Studio stellt dafür eine eigenständige lokale Kartenoberfläche bereit. Karte und Debugger verwenden denselben autoritativen C++-Kern über den WebAssembly-Worker oder den nativen Loopback-WebSocket-Host. [Import und Messungen](tasks/P1-006-osm-world-importer.md) · [World Studio](tools/world-studio/README.md)

## Lokal bauen und starten

Benötigt werden CMake ab 3.25, Ninja, ein C++23-Compiler, das Emscripten SDK 4.0.23 und Node.js 22 ab 22.12, 24 oder 26+. CMake lädt nlohmann/json 3.12.0, json-schema-validator 2.4.1, PicoSHA2 1.0.1 und für den nativen Build Boost 1.90.0. `npm ci` installiert die Versionen aus dem Client-Lockfile.

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

### Welt auswählen

Breakwater ist der Standard. Öffne für Cove im WASM-Modus [127.0.0.1:5173/?world=cove](http://127.0.0.1:5173/?world=cove). Im WebSocket-Modus starte den Server mit `--world content/public/worlds/cove` und öffne [127.0.0.1:5173/?world=cove&transport=ws](http://127.0.0.1:5173/?world=cove&transport=ws). Die CLI akzeptiert dieselbe Option.

Die integrierten Paketdateien liegen unter `content/public/worlds/`. Vite stellt sie im Dev-Modus direkt bereit und kopiert sie beim Build als statische Dateien nach `client/dist/worlds/`. Zusätzliche Pakete lassen sich in der bereitgestellten Basis ergänzen oder über `?world=<ordner>&worldBase=/karten/` von einer anderen statischen Basis laden. Ein Weltwechsel benötigt einen neuen Seitenaufruf und im nativen Modus einen neuen Hoststart. [Paketformat](docs/architecture/world-package.md)

### OSM-Welt offline importieren

Nach den nativen und WASM-Builds und `npm --prefix client ci` diese Befehle in PowerShell aus der Repository-Wurzel ausführen. Die synthetische Quelle und beide Weltpakete entstehen unter `build/`.

```powershell
python -m venv build/osm-venv
build/osm-venv/Scripts/python.exe -m pip install --only-binary=:all: -r tools/world-studio/requirements.txt
$env:PYTHONPATH = 'tools/world-studio'
build/osm-venv/Scripts/python.exe tools/world-studio/tests/fixture.py build/osm-input/fixture --worlds build/osm-worlds
build/osm-venv/Scripts/python.exe -m unittest discover -s tools/world-studio/tests -v
$env:WOC_OSM_WORLDS = 'build/osm-worlds'
npm.cmd --prefix client run test:e2e -- --workers=1
```

Der Importer prüft das Paket vor dem Export mit denselben Loadern wie CLI, Browser und WASM. Die Testwelt lädt im nativen Host mit `--world build/osm-worlds/osm-fixture`. Für eigene PBF- und Landquellen, Browserstart und Bremer Messläufe siehe die [Importanleitung](tools/world-studio/README.md).

### World Studio starten

Nach den nativen und WASM-Builds sowie der oben beschriebenen Python-Installation:

```powershell
npm --prefix tools/world-studio ci
npm --prefix tools/world-studio run build
$env:PYTHONPATH = 'tools/world-studio'
build/osm-venv/Scripts/python.exe -m studio --data build/osm-input --workspace build/world-studio
```

Das Studio öffnet sich unter [127.0.0.1:8000](http://127.0.0.1:8000). Eingabedateien liegen unter dem gewählten Datenverzeichnis; Projekte, Jobdaten und Exporte liegen getrennt im Workspace. Die Basiskarte ist zunächst offline und ohne Kacheln; ein zulässiger Kartenstil und ein Geocoder können im Studio konfiguriert werden. Für die Spielschaltfläche muss der Client zusätzlich auf Port 5173 laufen. [Bedienung und Tests](tools/world-studio/README.md#world-studio)

### Karte bedienen

Die Karte verbindet beim ersten Öffnen automatisch. Linkes Ziehen und die Pfeiltasten verschieben den Ausschnitt. Mausrad, Zwei-Finger-Geste oder Plus/Minus zoomen. Rechtes Ziehen, Umschalt + linkes Ziehen, Q/E und die Drehtasten rotieren die Karte. N und der Kompass richten sie nach Norden aus. Die Fokustaste zentriert den eigenen Charakter oder den Startbereich. Die Übersichtstaste oder Pos1 setzt den Ausschnitt und die Nordausrichtung zurück.

Wähle Orte oder Charaktere über ihre Marker oder die einklappbaren Listen im Kartenmenü. Der Auswahlbereich folgt dem Marker auf großen Fenstern und erscheint am unteren Rand auf schmalen Fenstern. Ein Gebäudeklick zeigt Viertel und Höhe. Escape schließt die Auswahl oder die geöffnete Liste. Ohne WebGL 2 bleiben Listen und Reiseaktionen erreichbar.

Wähle Ada oder Ben und klicke auf **Übernehmen**. Wähle anschließend einen Ort. Die Karte zeigt die Gehroute, Entfernung und Dauer in Spielminuten. **Zu Fuß gehen** startet die Reise. Ziel und verbleibende Zeit stehen in den Kartendetails. Im aktuellen Prototyp entspricht eine Spielminute ungefähr einer realen Sekunde; Umstellung auf Echtzeit 1× und flüssige Bewegung ist in [P1-008](tasks/P1-008-realtime-clock-motion.md) geplant. Eine begonnene Reise läuft im Host auch bei Freigabe, Charakterwechsel oder Disconnect weiter.

**Debugger** öffnet `?view=debug` mit derselben Transportkonfiguration. Client A teilt seine Session mit der Stadtkarte. Bei direktem Debugger-Aufruf startet jede Session über **Verbinden**. Die Schaltfläche **Zu Fuß zu …** startet eine echte Reise. **Zur Stadtkarte** zeigt die laufende Route oder die Ankunft. **Snapshot anfordern** lädt die Projektion neu.

## Vertragstests und Browser-Smoke

Nach beiden CMake-Builds und `npm ci` die folgenden Befehle aus der Repository-Wurzel ausführen. Playwright startet Vite auf den Ports 4173 und 4174 sowie bei Bedarf einen nativen Loopback-Host mit dynamisch zugewiesenem Port.

```text
npm --prefix client run typecheck
npm --prefix client test
npm --prefix client run build
npm --prefix client exec -- playwright install chromium
npm --prefix client run test:e2e
```

Die native CLI liest je Zeile einen Testframe mit `op` (`open`, `send`, `close` oder `tick`), bei Bedarf `connection` und für `send` das Protokollobjekt `message`. Sie gibt pro Zeile ein JSON-Array der zugestellten Nachrichten aus. Die Paritätsprüfung vergleicht pro Paket dieselben Befehle und Ticks über CLI, Worker und WebSocket. Mit `--manual-clock-stdin` liest der native Server pro Tick eine Zeile `tick` von stdin. [P1-005](tasks/P1-005-world-package-loader.md)

`npm --prefix client run test:e2e -- map-visual.spec.ts` erzeugt eigene Kartenaufnahmen mit der Host-Spielzeit 08:00 und 21:00 unter `client/test-results/`. Der Test deckt die Übersicht, die Nahsicht, einen 90°-Küstenblick, einen mobilen Kontext und die Zwei-Finger-Zoomgeste ab.

## Dokumentation
| Datei | Zweck |
|---|---|
| [AGENTS.md](AGENTS.md) | Zentrale KI-Anweisung für jeden neuen Chat |
| [Vision](docs/design/vision.md) | Spielprinzip, Grenzen und Kernschleife |
| [Welt](docs/design/world.md) | Geografie, Orte, Kartenansichten |
| [Kartenstil](docs/design/map-visuals.md) | Fullscreen-HUD, Kamera und kartografischer Detailgrad |
| [Kartenformat](docs/architecture/map-format.md) | JSON-Verträge für semantische Geografie, Visual-Sidecar und Theme |
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
| [P1-001](tasks/P1-001-movement.md) | Autoritatives Wegenetz und Fußreisen |
| [P1-004](tasks/P1-004-map-visual-upgrade.md) | Fullscreen-Karte, Visualformat und kartografische Details |
| [P1-002](tasks/P1-002-character-routines.md) | Bewohner und Tagespläne (Entwurf) |
| [P1-003](tasks/P1-003-npc-behavior.md) | NPC-Entscheidungen und Ambient-Population (Entwurf) |
| [World Package](docs/architecture/world-package.md) | Laufzeitladbare Kartenpakete |
| [World Studio](docs/design/world-studio.md) | Offline-Importer und lokaler Geodateneditor |
| [Studio-Content](docs/design/world-studio-content.md) | Langfristige modulare Gameplay-Editoren |
| [Game Content](docs/architecture/game-content.md) | Datengetriebene Definitionen, Initialzustand und Regelinterpreter |
| [P1-005](tasks/P1-005-world-package-loader.md) | Paketloader für native Anwendung, WASM und Browser |
| [P1-006](tasks/P1-006-osm-world-importer.md) | OSM-Importer |
| [P1-007](tasks/P1-007-world-studio.md) | Visueller Karteneditor |
| [P1-008](tasks/P1-008-realtime-clock-motion.md) | Geplant: Echtzeit, Debug-Zeitfaktor, flüssige Bewegung |

Starte eine KI-Sitzung mit dem Repository-Link und der Anweisung, AGENTS.md zu lesen.
