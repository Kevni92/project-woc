# Project WOC — KI-Einstiegspunkt

Diese Datei ist der modellunabhängige Einstieg für jede neue KI-Sitzung. Repository: https://github.com/Kevni92/project-woc. Lies die Dateien im aktuellen Branch; verlasse dich nicht auf ältere Chats.

## Mission
Ein kartenbasiertes Singleplayer-Crime-RPG im Browser: die Interaktionskarte erinnert an die Kartenansicht von GTA, der textbasierte Spielfortschritt an Browser-RPGs der 2000er (World of Drugs als grobe Inspiration). Eigene Welt, eigene Assets, keine Kopie bestehender Spiele. Die Karte ist das Hauptinterface, kein 3D-Actionspiel.

## Verbindliche Vorgaben
- TypeScript, Three.js, anpassbares HTML/CSS; kein React, kein Angular.
- Zoomfähige, interaktive Karte: einfache 3D-Gebäude bei Nahsicht, flache 2D-Top-down-Übersicht bei Fernsicht; Spieler, NPCs und Fahrzeuge als Marker.
- Charakter, Inventar, Besitz, Fahrzeuge, zeitbasierte Bewegung zu Fuß/per Auto, ortsgebundene textbasierte Missionen; später attributbasierte Minispiele.
- Simulierte NPC-Tagesabläufe und 24-Stunden-Spielzeit mit visueller Tag-/Nachtanpassung.
- Zunächst lokal im Browser, Multiplayer später als Erweiterung; keine Serverpflicht im Prototyp.
- Schnelle spielbare Iterationen statt Vollkonzeption. Kein Produktionscode in reinen Konzeptaufträgen.

## Lesereihenfolge
1. [Projektübersicht und Dokumentindex](README.md)
2. [Vision](docs/design/vision.md) und [Welt](docs/design/world.md)
3. [Architektur](docs/architecture/overview.md) für technische Aufgaben.
4. [Roadmap](docs/roadmap.md) und [Entscheidungen](docs/decisions.md) für den aktuellen Stand.
5. [Arbeitsweise](docs/workflow.md) und die jeweils relevante Aufgabe in tasks/.

## Arbeitsregeln
- Unterscheide VORGABE (vom Nutzer), ENTWURF (Vorschlag), BESCHLOSSEN (explizit angenommen), ZURÜCKGESTELLT und IMPLEMENTIERT (nachweisbar). Ein Entwurf ist keine Freigabe für umfassende Implementierung.
- Prüfe bestehende Dateien, Tasks, Git-Status und relevante Schnittstellen vor Änderungen. Verändere keine fremden/ungefragten Änderungen.
- Arbeite in kleinen vertikalen Schnitten: Ziel, Umfang, Akzeptanzkriterien, Implementierung, Tests, Dokumentation. Nur den beauftragten Umfang bearbeiten; keine zusätzlichen Frameworks ohne Begründung.
- Halte Simulation unabhängig von Three.js, DOM, UI-Framework und Persistenz; Befehle validieren, Zustand kontrolliert ändern, Ereignisse erst danach veröffentlichen. Rendering darf keinen Spielzustand verändern.
- Konzepte und Aufgaben auf Deutsch, technische Bezeichner auf Englisch. Dokumentiere Annahmen, offene Fragen und tatsächliche Testergebnisse. Erfinde keine Implementierungsfortschritte.
- Aktualisiere Roadmap/Task und Entscheidungslog bei Änderungen. Bei Widersprüchen die aktuelle Nutzeranweisung und bestätigte Entscheidungen beachten; Konflikte offen benennen.
- Keine Secrets, keine fremden proprietären Karten/Assets; keine Veröffentlichung/Deployment ohne Auftrag.
