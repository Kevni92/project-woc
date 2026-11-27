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
| D008 | REVIDIERT | 24 reale Minuten pro Spieltag durch Echtzeitvorgabe D032 ersetzt; kein Offline-Fortschritt bleibt separater Entwurf |
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
| D021 | ENTWURF | P1 in Bewegung, Charakterroutinen und NPC-Verhalten aufteilen. Erste Reisen nur zu Fuß zu bekannten Orten; 4 km/h, vorhandener Takt, keine Umleitung während Reise. Host validiert gemeinsame Kartendaten und Routing. |
| D022 | IMPLEMENTIERT | P1-001, 2026-11-27. Breakwater-Content v2 mit explizitem Fußwegenetz und separaten Ortszugängen. Gemeinsames C++-Routing per Dijkstra bei 4 km/h im vorhandenen Takt. Reisen überdauern Steuerungswechsel und Disconnect im laufenden Host. Protokoll v2 prüft die Content-Kompatibilität und ersetzt die positions- und geldändernde Testaktion durch echte Reisebefehle mit äquivalenten Vertragsregressionen. |
| D023 | VORGABE | 27.11.2026: Full-Viewport-Karte mit überlagerter UI, 360°-Rotation, dezente Dächer/Fenster ohne Balkone, Strand/Stege/Wassertiefenfarbverläufe und organischere Straßen. Semantische Weltplatzierung getrennt von Renderdetails, generatorfähiges Format. |
| D024 | ENTWURF | Separate Visual-JSON und Theme auf Basis bestehender Content-Version 2; keine semantische Änderung für P1-004. OrthographicCamera mit unabhängiger Yaw, kartografische Palette, vereinfachte Gebäudeprofile, Depth-Textur/Farbrampe. P1-004 vor P1-002. |
| D025 | IMPLEMENTIERT | P1-004, 2026-11-27. Breakwater nutzt Welt v2, Visual-Sidecar v1 und Coastal-Theme v1. Ein orthografischer Kamerapfad steuert unabhängigen Azimut und Zoomneigung. Der Renderer bündelt Geometrie nach Farbrollen, verankert die Wasserfarbrampe in der Welt und hält den Host als Quelle für Wege, Spielzeit und Charaktere. Die Weltdatei und der Protokollvertrag bleiben kompatibel. |
| D026 | VORGABE | Separates lokales World Studio, echte Geodaten, Rechteck-/Freihandauswahl, optional Ozean außerhalb, Export von zur Laufzeit ladbaren Karten für native/WASM/Client. |
| D027 | ENTWURF | Manifest-Paket mit bestehenden City/Visual/Theme-Schemas, Revision/Hash, Runtime-Init; MapLibre/Terra Draw + Python-GIS-Importer. P1-005 → P1-006 → P1-007 vor NPC-Routinen. |
| D028 | VORGABE | World Studio langfristig modularer Gameplay-Editor für Gebäude/Orte, Charaktere, Missionen, Events, Items/Waffen, Fahrzeuge, Eigenschaften und Funktionalitäten. Konkrete Inhalte dynamisch bei Host-/Clientstart laden, nicht einkompilieren. Kartengenerator zuerst. |
| D029 | ENTWURF | Versionierte Gameplay-Module, getrennte Definition/Initialzustand/Save, typisierte deklarative Trigger/Bedingungen/Effekte, generische Engine-Handler, erweiterbarer Paketmanifest-Vertrag. Keine freie Scripting-Engine oder vollständige Editor-Suite im Karten-MVP. |
| D030 | IMPLEMENTIERT | P1-005, 2026-11-27. Hosts laden World Package v1 mit City v2 und geprüften SHA-256-Dateihashes. `World` besitzt die unveränderliche Definition. WASM bindet Ports und Uhr nach dem Init. Der Browser lädt Darstellungsdaten über HTTP und prüft `Welcome` v3 gegen Welt-ID, Schema, Revision und semantischen Hash. Die Selektoren sind `breakwater` und `cove`. |
| D031 | IMPLEMENTIERT | Beschluss vom 27.11.2026. P1-006 liefert den reproduzierbaren Offline-Importer mit metrischer AOI, Natural/Island, City v3, Visual v2, konservativem Fußgraph, Test-Spawns, Provenance und OSM-Attribution. Paket v1 trägt beide Versionskombinationen. Das ursprüngliche 8-MiB-Limit je Welt- und Visualdatei gilt nach den Bremer Messläufen weiter. [Abnahme und Messungen](../tasks/P1-006-osm-world-importer.md) |
| D032 | VORGABE | 27.11.2026: Echtzeit 1× als Standard, Simulationsgeschwindigkeit im Debug-Menü manuell verstellbar, Bewegung flüssig statt Sekundensprüngen. P1-008 geplant; alter Prototyp bis dahin unverändert. |
| D033 | VORGABE | 27.11.2026: Lebens-/Crime-RPG-Sandbox mit Attributen, Skills, Persönlichkeit, Beziehungen, Bedürfnissen, Activities, Missionen, Jobs, Events, Wirtschaft, Fahrzeugen, Besitz, Konflikten und später Appearance; datengetriebene World-Studio-Editoren. Bei ausbleibender Spielerantwort Event automatisch anhand Charakterdaten entscheiden. |
| D034 | ENTWURF | Erstes Gameplay-Modell und Wertebereiche in Charakter-/Gameplay-Konzept; P1-008 vor NPC-Routinen, P2.1 Kurier-Kernloop, P2.2 Alltag/Shop/Jobvorlage/Reiseevent; Engine und Studio in vertikalen Schnitten. Kein finales Balancing. Aktienhandel weit später. |
| D035 | IMPLEMENTIERT | P1-007, 27.11.2026. Separates lokales Svelte-5-/MapLibre-/Terra-Draw-Studio mit FastAPI-Loopback-Backend und dem unveränderten P1-006-Importer als abbrechbarem Prozess. Versionierte Draft-Projekte, Jobdaten und validierte Exporte sind getrennt; der bestehende Paketloader und Three.js-Renderer dienen der Vorschau. Keine neue Paketversion, kein öffentlicher Dienst und keine Gameplay-Editoren. [Abnahme](../tasks/P1-007-world-studio.md) |

## Offene Produktfragen
1. Setting: fiktive US-Küstenstadt, europäische Stadt oder frei erfundene Geografie?
2. Kartenaufbau: von Hand erstellt, prozedural oder importierte Geodaten? Für P0 handgebauter Entwurf.
3. Reisegefühl: Echtzeitstandard entschieden (D032); konkrete Abbruch-/Umleitungsregeln, Wartekomfort, Debug-Stufen und Hintergrund-/Offline-Verhalten bleiben offen.
4. Spielerrolle: freies kriminelles/legales Sandbox-RPG oder stärker geführte Karriere?
5. Wie groß soll der endgültige Detailgrad bei NPC-Alltag, Wirtschaft und Beziehungen sein? Nach P2 iterieren.
6. Öffentlicher Multiplayer: Authentifizierung, gemeinsame Stadt, Zugriffspolitik und Disconnect-Fristen; nicht vor P2 finalisieren.
7. Charakterauswahl: alle geeigneten Residents frei wählbar oder account-/rollenbasierte Beschränkungen? Beobachtermodus?
8. Event-Fallback bei ausbleibender Eingabe entschieden (D033); darüber hinaus automatische Routinehandlungen, Fristen, Verpflichtungen und Unterbrechungsregeln noch offen.
9. Wann darf ein Ambient-Passant zu einem übernehmbaren Bewohner werden? Wie viele dauerhafte Residents pro Stadt? Erst nach Profiling festlegen.

REVIDIERT bezeichnet ersetzte frühere Entwürfe; aktuelle Vorgaben D011–D013 haben Vorrang. Entscheidungen nicht stillschweigend als beschlossen markieren. Bei Zustimmung Datum, Kontext und Auswirkungen ergänzen. Revidierte Entscheidungen nachvollziehbar kennzeichnen.
