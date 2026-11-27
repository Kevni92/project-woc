# Project WOC

Kartenbasiertes Browser-Crime-RPG mit eigenständig simulierter Welt. Inspiration: GTA-Kartenansicht und klassische Browser-RPGs wie World of Drugs. Eigenständige IP.

**Stand:** Konzeptphase; noch kein ausführbares Spiel. Erster Meilenstein: P0 interaktive Stadtkarte; danach P0-002 vertikaler C++/WASM/native Kommunikationsprototyp.

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

Starte eine KI-Sitzung mit dem Repository-Link und der Anweisung, AGENTS.md zu lesen. Keine Frameworks oder Packages sind bisher installiert.
