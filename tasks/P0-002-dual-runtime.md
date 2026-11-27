# P0-002 — Gemeinsamer C++-Simulationskern und zwei Hosts
Status: erledigt, geprüft am 2026-11-27. Der Debug-Client läuft unabhängig von P0-001. Grundlagen: [Architektur](../docs/architecture/overview.md), [Protokoll](../docs/architecture/protocol.md), [Charaktere](../docs/design/characters.md).

## Ziel
Technischen Architekturpfad früh verifizieren: identische Spiellogik in nativem CLI/Testhost, WASM im Browser-Worker und nativem WebSocket-Host. Kleiner durchgängiger Test statt kompletter Simulation.

## Umfang
- CMake native/WASM Presets; portable Core-/Application-Library, native CLI, nativer lokaler WebSocket-Server, Emscripten-Modul mit schmaler C-ABI.
- Zwei persistente Testcharaktere plus einfacher Ambient-Passant, Spielzeit, minimales Geld/Positionsmodell und simple deterministische Aktion. Kein komplexer NPC-Alltag.
- Hello/Welcome, Command/Result, Snapshot/Delta, Acquire/Release; Session-Registry, exklusive Steuerung, sofortige Freigabe bei Disconnect für Testbetrieb.
- JSON-Vertrag und Fixtures, Worker-WASM-Transport, WebSocket-Transport, gemeinsamer SimulationClient; ein Debug-Panel oder P0-UI ohne transportabhängige Spielregeln. Wechsel durch Konfiguration/Factory bei Verbindungsaufbau, kein Live-Migrationsversprechen.
- Native Server nur lokales Testbinding; keine öffentliche Freigabe.

## Akzeptanzkriterien
- [x] Derselbe Core kompiliert nativ und mit Emscripten. Build- und Startbefehle stehen in der [README](../README.md).
- [x] Dieselbe Command-Fixture erzeugt semantisch gleiche Antworten, Snapshots und Deltas in CLI, WASM-Worker und nativem WebSocket.
- [x] Die gebaute Debug-Oberfläche läuft über beide konfigurierbaren Transporte. Der WASM-Modus verwendet einen dedizierten Worker.
- [x] Zwei Sessions steuern verschiedene Charaktere. Konkurrierende Übernahme ergibt `CHARACTER_BUSY`. Eine abgelehnte Übernahme lässt die bisherige Steuerung bestehen.
- [x] Eine unberechtigte Aktion ergibt `NOT_CONTROLLER`. Freigabe und Disconnect erlauben neue Übernahmen mit erhaltener Position und Bargeld.
- [x] Der Ambient-Passant ist nicht übernehmbar. Beide Browseradapter synchronisieren einen simulierten Delta-Verlust per Snapshot. Asynchrone Transportfehler werden im Debug-Panel angezeigt.
- [x] Native Tests, WASM-Vertragstest und Browser-Smoketests sind ausgeführt.

## Out of scope
Öffentliche Server, Produktionsauth, vollständige Persistenz, fertiges ECS, Multithreading, MMO-Skalierung, komplexe NPC-Entscheidungen. P0-002 kann in kleinere Implementierungsaufträge geteilt werden.

## Ergebnis

Die C++-Schichten liegen unter `simulation/`. Sie trennen Welt und Spielregeln, Session- und Steuerlogik, JSON-Vertrag und Runtime-Anbindung. `protocol/` enthält die sprachneutralen Schemas und die gemeinsame Testfixture. Die zwei Debug-Panels verwenden denselben TypeScript-Client und die gleiche lesende Projektion. Der native Server lauscht auf `127.0.0.1`. Im WASM-Modus teilen sich beide Panels einen Worker und verwenden getrennte MessagePorts.

Die Testwelt beginnt um 08:00 Uhr. Ada und Ben bleiben im Speicher des laufenden Hosts erhalten und sind ohne Lease im Leerlauf. Der Ambient-Passant läuft mit der Spieluhr eine kurze deterministische Strecke. Die einzige Testaktion verschiebt den übernommenen Bewohner um einen Meter in x-Richtung und erhöht sein Bargeld um zehn Einheiten. Die x-Position der Testaktion ist auf 1.000 Meter begrenzt. Bargeld ist nur in der eigenen Steuerprojektion sichtbar. Ein Neustart des Hosts erzeugt die Testwelt neu.

### Ausgeführte Prüfungen

| Prüfung | Ergebnis |
|---|---|
| CMake-Presets `native` und `wasm` | Erfolgreich auf Windows x64 |
| `ctest --preset native` | 1 von 1 bestanden. Core, Lease-Lebenszyklus, Berechtigungen, Takt, Protokollvalidierung und Deduplikation |
| `npm ci`, Typecheck und Vite-Build | Erfolgreich. Typecheck ohne Fehler oder Warnungen |
| Vitest | 3 von 3 bestanden. Sequenzlücke, falsche Basisrevision und Fehler bei ausstehendem Request |
| Playwright Chromium | 7 Fälle zweimal ausgeführt, 14 von 14 bestanden. CLI-Parität, Delta-Verlust und gebaute Debug-Oberfläche mit laufender Uhr je Transport. Zusätzlich WASM-Ladefehler und erneuter Verbindungsversuch |

Unter Windows x64 kamen MSVC 19.44.35228 (Visual Studio Build Tools 2022), Windows SDK 10.0.26100.0, CMake 4.4.1, Ninja 1.13.2 und Emscripten 4.0.23 zum Einsatz. Die geprüften C++-Abhängigkeiten sind Boost 1.90.0 und nlohmann/json 3.12.0. Für den Client wurden Node.js 26.0.0, npm 11.12.1, TypeScript 5.9.3, Svelte 5.59.2, Vite 8.4.0, Vitest 5.1.2, Playwright 1.65.1 und Chromium 159.0.8154.6 verwendet.
