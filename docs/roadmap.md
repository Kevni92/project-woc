# Roadmap
Status: P0-001 und P0-002 sind implementiert und getestet.

| ID | Ziel | Abnahmekriterium | Status |
|---|---|---|---|
| P0-001 | Interaktive Karte | Teststadt, Zoom 2D/3D, Pan, echte Marker/Spielzeit aus SimulationClient über beide bestehenden Transporte, Ortsdetails | erledigt |
| P0-002 | Dual-Runtime-Schnitt | C++-Core nativ und WASM, gemeinsamer Nachrichtenvertrag, zwei Sessions mit exklusiver Charakterübernahme; dasselbe UI über Worker und lokalen WebSocket | erledigt |
| P1 | Lebendige Welt | Spieluhr, Tag/Nacht, Wegegraph, Bewegung, fünf persistente Bewohner und Ambient-Passanten | geplant |
| P2 | Erste RPG-Schleife | Geld/Konto, Inventar, Shop, Textmission, versioniertes Speichern/Laden | geplant |
| P3 | Besitz und Alltag | Auto/Immobilie, Jobs, Beziehungen, Attribute und tägliche Verpflichtungen vertiefen | später |
| P4 | Mehr Spieltiefe | Utility AI, Minispiele, NPC-Reaktionen, weitere Missionen und optimierte Simulationsauflösung | später |
| P5 | Öffentlicher Multiplayer | Auth, Rollen/Privatsphäre, Reconnect, Sicherheit, Skalierung, Hosting und konkrete Mehrspielerregeln | zurückgestellt |

Die Ergebnisse der Stadtkarte stehen in [P0-001](../tasks/P0-001-map-prototype.md), die des Dual-Runtime-Schnitts in [P0-002](../tasks/P0-002-dual-runtime.md). P1 erweitert die Welt um Reisen und Tagesabläufe. P2 ist der erste RPG-Loop, öffentlicher Multiplayer ist P5 vorbehalten.
