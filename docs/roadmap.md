# Roadmap
Status: ENTWURF; keine Implementierung nachgewiesen.

| ID | Ziel | Abnahmekriterium | Status |
|---|---|---|---|
| P0-001 | Interaktive Karte | Teststadt, Zoom 2D/3D, Pan, Marker, Ortsdetails; MockTransport statt Spielregeln im Client | geplant |
| P0-002 | Dual-Runtime-Schnitt | C++-Core nativ und WASM, gemeinsamer Nachrichtenvertrag, zwei Sessions mit exklusiver Charakterübernahme; dasselbe UI über Worker und lokalen WebSocket | geplant |
| P1 | Lebendige Welt | Spieluhr, Tag/Nacht, Wegegraph, Bewegung, fünf persistente Bewohner und Ambient-Passanten | geplant |
| P2 | Erste RPG-Schleife | Geld/Konto, Inventar, Shop, Textmission, versioniertes Speichern/Laden | geplant |
| P3 | Besitz und Alltag | Auto/Immobilie, Jobs, Beziehungen, Attribute und tägliche Verpflichtungen vertiefen | später |
| P4 | Mehr Spieltiefe | Utility AI, Minispiele, NPC-Reaktionen, weitere Missionen und optimierte Simulationsauflösung | später |
| P5 | Öffentlicher Multiplayer | Auth, Rollen/Privatsphäre, Reconnect, Sicherheit, Skalierung, Hosting und konkrete Mehrspielerregeln | zurückgestellt |

Nächste Tasks: [P0-001](../tasks/P0-001-map-prototype.md), [P0-002](../tasks/P0-002-dual-runtime.md). Beide sind kleine Schnitte; P0-002 kann bei Architekturpriorität zuerst beginnen. P2 bleibt erster RPG-Loop. Kein Produktions-Multiplayer in P0. Nach jedem Schnitt echte Tests und Feedback, dann nächste Spezifikation.
