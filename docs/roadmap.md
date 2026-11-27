# Roadmap
Status. P0-001, P0-002, P1-001 und P1-004 sind implementiert und getestet.

| ID | Ziel | Abnahmekriterium | Status |
|---|---|---|---|
| P0-001 | Interaktive Karte | Teststadt, Zoom 2D/3D, Pan, echte Marker/Spielzeit aus SimulationClient über beide bestehenden Transporte, Ortsdetails | erledigt |
| P0-002 | Dual-Runtime-Schnitt | C++-Core nativ und WASM, gemeinsamer Nachrichtenvertrag, zwei Sessions mit exklusiver Charakterübernahme; dasselbe UI über Worker und lokalen WebSocket | erledigt |
| [P1-001](../tasks/P1-001-movement.md) | Wege und Reisen | Autoritativer Graph, Routenvorschau, Fußreise und Ankunft über beide Transporte | erledigt |
| [P1-004](../tasks/P1-004-map-visual-upgrade.md) | Weltkarte 2.0 | Fullscreen-HUD, 360°-Kamera, getrenntes Visual-Format, Gebäude/Küste/Straßen | erledigt |
| [P1-005](../tasks/P1-005-world-package-loader.md) | Kartenpakete | Native/WASM/Client laden beliebige validierte Pakete zur Laufzeit | geplant |
| [P1-006](../tasks/P1-006-osm-world-importer.md) | Geodatenimport | OSM → spielbares Paket, exakte AOI und Inselmodus | geplant |
| [P1-007](../tasks/P1-007-world-studio.md) | World Studio | Lokaler Karteneditor mit Rechteck/Freihand und Export | geplant |
| [P1-002](../tasks/P1-002-character-routines.md) | Bewohner und Tagespläne | Fünf Residents, Scheduler, Arbeit und Heimkehr | geplant |
| [P1-003](../tasks/P1-003-npc-behavior.md) | NPC-Verhalten | Einfache Entscheidungen, Ambient-Population, Messungen | geplant |
| P2 | Erste RPG-Schleife | Geld/Konto, Inventar, Shop, Textmission, versioniertes Speichern/Laden | geplant |
| P3 | Besitz und Alltag | Auto/Immobilie, Jobs, Beziehungen, Attribute und tägliche Verpflichtungen vertiefen | später |
| P4 | Mehr Spieltiefe | Utility AI, Minispiele, NPC-Reaktionen, weitere Missionen und optimierte Simulationsauflösung | später |
| P5 | Öffentlicher Multiplayer | Auth, Rollen/Privatsphäre, Reconnect, Sicherheit, Skalierung, Hosting und konkrete Mehrspielerregeln | zurückgestellt |

Die Ergebnisse stehen in den jeweiligen Tasks. Auf Nutzerwunsch folgen P1-005, P1-006 und P1-007 vor P1-002/P1-003. P1-005 ist der nächste umsetzbare Schnitt; nachfolgende Tasks vor Umsetzung konkretisieren. P2 ist der erste RPG-Loop, öffentlicher Multiplayer ist P5 vorbehalten. [P0-001](../tasks/P0-001-map-prototype.md) · [P0-002](../tasks/P0-002-dual-runtime.md) · [P1-001](../tasks/P1-001-movement.md) · [P1-004](../tasks/P1-004-map-visual-upgrade.md)
