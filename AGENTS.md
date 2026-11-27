# Project WOC — KI-Einstiegspunkt

Diese Datei ist der modellunabhängige Einstieg für jede neue KI-Sitzung. Repository: https://github.com/Kevni92/project-woc. Lies die Dateien im aktuellen Branch; verlasse dich nicht auf ältere Chats.

## Mission
Ein kartenbasiertes Singleplayer-Crime-RPG im Browser: die Interaktionskarte erinnert an die Kartenansicht von GTA, der textbasierte Spielfortschritt an Browser-RPGs der 2000er (World of Drugs als grobe Inspiration). Eigene Welt, eigene Assets, keine Kopie bestehender Spiele. Die Karte ist das Hauptinterface, kein 3D-Actionspiel.

## Verbindliche Vorgaben
- C++ als autoritativer Simulationskern, nativ und via WebAssembly aus derselben Codebasis; TypeScript, Three.js, anpassbares HTML/CSS für Client; kein React, kein Angular.
- Einheitlicher asynchroner, transportneutraler Client-Vertrag für Web Worker/WASM und WebSocket; keine direkte C++-Objektbindung aus UI oder Renderer.
- Charaktere sind weltpersistente Entitäten, unabhängig von Clients. Mehrere logische Clients pro Simulation, exklusive Steuerübernahme geeigneter Charaktere, NPC-Autonomie bei Freigabe; unterschiedlich tiefe NPC-Simulation.
- Zoomfähige, interaktive Full-Viewport-Karte mit HUD als Overlay, 360°-Rotation, dezent detaillierten Gebäuden bei Nahsicht und flacher 2D-Top-down-Übersicht bei Fernsicht; Spieler, NPCs und Fahrzeuge als Marker. Strand, visuelle Wassertiefen und organischere Straßen; semantische Geografie getrennt von Renderprofilen, generatorfähige JSON-Daten.
- Charakter, Inventar, Besitz, Fahrzeuge, zeitbasierte Bewegung zu Fuß/per Auto, ortsgebundene textbasierte Missionen; später attributbasierte Minispiele.
- Simulierte NPC-Tagesabläufe und 24-Stunden-Spielzeit mit visueller Tag-/Nachtanpassung. Ziel ab P1-008: Echtzeit 1×, manuell verstellbarer autoritativer Debug-Zeitfaktor, flüssige entlang der Hostroute animierte Marker ohne zusätzliche fachliche Clientlogik. Gameplay-Featurekatalog und Editor-Roadmap in den jeweiligen Designdokumenten.
- Zunächst lokal im Browser, aber von Beginn an logisch mehrclientfähig. Native Testanwendung früh; öffentlicher Multiplayer später, keine Serverpflicht für lokales Spiel.
- Karten als versionierte, zur Laufzeit ladbare World Packages; separater lokaler World Studio-Editor mit Rechteck-/Freihandauswahl, Geodatenimport und optionalem Ozean außerhalb der Auswahl. Keine Entwicklerwerkzeuge im Spielbundle.
- World Studio ist langfristig modularer Gameplay-Content-Editor für Gebäude/Orte, Charaktere, Missionen, Events, Items, Waffen, Fahrzeuge, Regeln und Platzierung. Konkrete Inhalte/Startwerte dynamisch aus versionierten Dateien beim Hoststart laden; keine hartcodierten Content-Definitionen im C++-Core/Client. Engine implementiert generische Mechaniken, Content kombiniert unterstützte Regeln; Spielstände getrennt. Keine umfassende Editor-Suite vor Kartengenerator.
- Schnelle spielbare Iterationen statt Vollkonzeption. Kein Produktionscode in reinen Konzeptaufträgen.

## Lesereihenfolge
1. [Projektübersicht und Dokumentindex](README.md)
2. [Vision](docs/design/vision.md) und [Welt](docs/design/world.md), [Kartenstil](docs/design/map-visuals.md) und [Kartenformat](docs/architecture/map-format.md), [World Package](docs/architecture/world-package.md), [World Studio](docs/design/world-studio.md), [Studio-Content](docs/design/world-studio-content.md), [Game Content](docs/architecture/game-content.md)
3. [Architektur](docs/architecture/overview.md), [Protokoll](docs/architecture/protocol.md) für technische Aufgaben; [Charaktere](docs/design/characters.md) für NPCs und Steuerübernahme.
4. [Roadmap](docs/roadmap.md) und [Entscheidungen](docs/decisions.md) für den aktuellen Stand.
5. [Arbeitsweise](docs/workflow.md) und die jeweils relevante Aufgabe in tasks/.

## Arbeitsregeln
- Unterscheide VORGABE (vom Nutzer), ENTWURF (Vorschlag), BESCHLOSSEN (explizit angenommen), ZURÜCKGESTELLT und IMPLEMENTIERT (nachweisbar). Ein Entwurf ist keine Freigabe für umfassende Implementierung.
- Prüfe bestehende Dateien, Tasks, Git-Status und relevante Schnittstellen vor Änderungen. Verändere keine fremden/ungefragten Änderungen.
- Arbeite in kleinen vertikalen Schnitten: Ziel, Umfang, Akzeptanzkriterien, Implementierung, Tests, Dokumentation. Nur den beauftragten Umfang bearbeiten; keine zusätzlichen Frameworks ohne Begründung.
- Halte C++-Core unabhängig von Emscripten, Netzwerk, Three.js, DOM, UI und Persistenz-I/O. Befehle server-/hostseitig validieren, Zustand kontrolliert ändern, Ereignisse erst danach veröffentlichen. Keine zweite Spiellogik in TypeScript; Rendering darf keinen Spielzustand verändern. Native/WASM-Vertragsparität testen.
- Konzepte und Aufgaben auf Deutsch, technische Bezeichner auf Englisch. Dokumentiere Annahmen, offene Fragen und tatsächliche Testergebnisse. Erfinde keine Implementierungsfortschritte.
- Aktualisiere Roadmap/Task und Entscheidungslog bei Änderungen. Bei Widersprüchen die aktuelle Nutzeranweisung und bestätigte Entscheidungen beachten; Konflikte offen benennen.
- Keine Secrets, keine fremden proprietären Karten/Assets; keine Veröffentlichung/Deployment ohne Auftrag.
