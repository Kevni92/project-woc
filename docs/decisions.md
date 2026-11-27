# Entscheidungen und offene Fragen

| ID | Status | Inhalt |
|---|---|---|
| D001 | VORGABE | Browser-Singleplayer; Multiplayer später möglich |
| D002 | VORGABE | TypeScript + Three.js, HTML/CSS, kein React/Angular |
| D003 | VORGABE | Karte als Spielfeld, Nahsicht geometrisches 3D, Fernsicht 2D |
| D004 | VORGABE | RPG, Orte, Inventar, Besitz, Reisen, Textmissionen, NPC-Alltag, 24h-Rhythmus |
| D005 | REVIDIERT | Svelte 5 + Vite, Vitest/Playwright, IndexedDB bleiben Entwürfe; mitt nicht als autoritativer Game-Bus |
| D006 | REVIDIERT | TypeScript-Core ersetzt durch portablen C++-Core; Command/Event und ECS-inspirierter Zuschnitt bleiben Entwürfe |
| D007 | ENTWURF | Kleine fiktive Stadt, handgebaute Testdaten, lokales metrisches Wegenetz |
| D008 | ENTWURF | 24 reale Minuten pro Spieltag, pausierbar; kein Offline-Fortschritt |
| D009 | REVIDIERT | P0 um Dual-Runtime-Vertragsschnitt erweitert, P1 Simulation, P2 erster RPG-Loop |
| D010 | REVIDIERT | Native Server-Testanwendung und logische Mehrclientfähigkeit früh; öffentlicher Multiplayer, große Welt und komplexe Wirtschaft zurückgestellt |
| D011 | VORGABE | Gemeinsamer C++-Simulationskern für WASM im Browser und native Anwendung; Server via WebSocket |
| D012 | VORGABE | Einheitliche flexible Client-Schnittstelle, mehrere logische Clients pro Simulation, steuerbare persistente Charaktere |
| D013 | VORGABE | Unterschiedliche Simulationstiefen: übernehmbare Bewohner mit Alltag, Beziehungen, Besitz, Finanzen, Attributen vs. einfache Passanten |
| D014 | ENTWURF | C++23, CMake, Emscripten, Boost.Asio/Beast, JSON, dedizierter Worker, native CLI und Server |
| D015 | ENTWURF | Exklusive Character-Lease, maximal eine je Session, atomarer Wechsel und Autonomie bei Freigabe |
| D016 | ENTWURF | Ambient/Resident/Featured; semantische Tiefe getrennt von zeitlicher Auflösung |
| D017 | ENTWURF | Identischer asynchroner versionierter Nachrichtenvertrag, Snapshots/Deltas, semantische Paritätstests |
| D018 | IMPLEMENTIERT | P0-002, 2026-11-27. C++23 mit CMake und Emscripten aus derselben Codebasis. Nativer Loopback-Host mit Boost.Asio/Beast, Worker mit schmaler C-ABI und gemeinsame v1-JSON-Nachrichten mit nlohmann/json. Debug-Client in TypeScript, Svelte 5 und Vite. Umgesetzter Teilumfang von D005, D014 und D017. |
| D019 | IMPLEMENTIERT | P0-002, 2026-11-27. Eine exklusive Lease pro Session und Charakter, atomarer Wechsel und sofortige Freigabe mit Zustandskontinuität im laufenden Host. Unter den drei Testfiguren sind zwei übernehmbare Bewohner und ein Ambient-Passant. Prototypischer Teilumfang von D015 und D016. |
| D020 | IMPLEMENTIERT | P0-001, 2026-11-27. Breakwater verwendet eine gemeinsame versionierte JSON-Kartendefinition in lokalen x/z-Metern. Three.js rendert die Geografie in einer orthografischen Szene mit kontinuierlichem Übergang zwischen Top-down und geneigter Nahansicht. HTML-Marker, Steuerrechte und Tag-/Nachtpalette folgen der bestehenden SimulationClient-Projektion in beiden Transportmodi. Breakwater und die Zoomschwellen sind Prototypwerte. |

## Offene Produktfragen
1. Setting: fiktive US-Küstenstadt, europäische Stadt oder frei erfundene Geografie?
2. Kartenaufbau: von Hand erstellt, prozedural oder importierte Geodaten? Für P0 handgebauter Entwurf.
3. Reisegefühl: kontinuierlich in beschleunigter Spielzeit, kurze reale Timer oder Zeitüberspringen?
4. Spielerrolle: freies kriminelles/legales Sandbox-RPG oder stärker geführte Karriere?
5. Wie groß soll der endgültige Detailgrad bei NPC-Alltag, Wirtschaft und Beziehungen sein? Nach P2 iterieren.
6. Öffentlicher Multiplayer: Authentifizierung, gemeinsame Stadt, Zugriffspolitik und Disconnect-Fristen; nicht vor P2 finalisieren.
7. Charakterauswahl: alle geeigneten Residents frei wählbar oder account-/rollenbasierte Beschränkungen? Beobachtermodus?
8. Soll ein vom Client gesteuerter Charakter auch ohne Eingabe automatisch Routinehandlungen durchführen? Welche Verpflichtungen sind zwingend?
9. Wann darf ein Ambient-Passant zu einem übernehmbaren Bewohner werden? Wie viele dauerhafte Residents pro Stadt? Erst nach Profiling festlegen.

REVIDIERT bezeichnet ersetzte frühere Entwürfe; aktuelle Vorgaben D011–D013 haben Vorrang. Entscheidungen nicht stillschweigend als beschlossen markieren. Bei Zustimmung Datum, Kontext und Auswirkungen ergänzen. Revidierte Entscheidungen nachvollziehbar kennzeichnen.
