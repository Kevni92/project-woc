# P0-002 — Gemeinsamer C++-Simulationskern und zwei Hosts
Status: geplant; kein Code umgesetzt. Kann unabhängig von P0-001 mit minimalem Debug-Client beginnen. Grundlagen: [Architektur](../docs/architecture/overview.md), [Protokoll](../docs/architecture/protocol.md), [Charaktere](../docs/design/characters.md).

## Ziel
Technischen Architekturpfad früh verifizieren: identische Spiellogik in nativem CLI/Testhost, WASM im Browser-Worker und nativem WebSocket-Host. Kleiner durchgängiger Test statt kompletter Simulation.

## Umfang
- CMake native/WASM Presets; portable Core-/Application-Library, native CLI, nativer lokaler WebSocket-Server, Emscripten-Modul mit schmaler C-ABI.
- Zwei persistente Testcharaktere plus einfacher Ambient-Passant, Spielzeit, minimales Geld/Positionsmodell und simple deterministische Aktion. Kein komplexer NPC-Alltag.
- Hello/Welcome, Command/Result, Snapshot/Delta, Acquire/Release; Session-Registry, exklusive Steuerung, sofortige Freigabe bei Disconnect für Testbetrieb.
- JSON-Vertrag und Fixtures, Worker-WASM-Transport, WebSocket-Transport, gemeinsamer SimulationClient; ein Debug-Panel oder P0-UI ohne transportabhängige Spielregeln. Wechsel durch Konfiguration/Factory bei Verbindungsaufbau, kein Live-Migrationsversprechen.
- Native Server nur lokales Testbinding; keine öffentliche Freigabe.

## Akzeptanzkriterien
- [ ] Derselbe Core kompiliert nativ und mit Emscripten; dokumentierte Build-/Startbefehle und Versionen.
- [ ] Dieselbe Command-Fixture erzeugt gleiche semantische Snapshot-Ergebnisse in nativer CLI und WASM; native WS liefert dieselben Antworten.
- [ ] UI läuft unverändert gegen beide Transporte, nur Konfiguration wechselt; Worker bleibt vom Main-Thread getrennt.
- [ ] Zwei Sessions steuern verschiedene Charaktere; konkurrierende Übernahme eines Charakters schlägt bei einer Session nachvollziehbar fehl.
- [ ] Nicht berechtigte Aktion wird abgelehnt, Freigabe/Disconnect ermöglicht neue Übernahme ohne Reset des Charakterzustands.
- [ ] Ambient-Passant ist nicht übernehmbar; Snapshot-Resync bei simulierter Lücke; asynchrone Fehler werden angezeigt.
- [ ] Native Tests, WASM-Vertragstest und Browser-Smoketest tatsächlich ausgeführt und Ergebnis dokumentiert.

## Out of scope
Öffentliche Server, Produktionsauth, vollständige Persistenz, fertiges ECS, Multithreading, MMO-Skalierung, komplexe NPC-Entscheidungen. P0-002 kann in kleinere Implementierungsaufträge geteilt werden.

## Ergebnis
Ausstehend.
