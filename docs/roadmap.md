# Roadmap
Status 27.11.2026: P0-001, P0-002, P1-001, P1-004, P1-005, P1-006 und P1-007 sind implementiert und laut Aufgabenprotokollen getestet. Die folgenden Aufgaben sind geplant, keine Implementierungsergebnisse.

| ID | Ziel | Abnahmekriterium | Status |
|---|---|---|---|
| [P0-001](../tasks/P0-001-map-prototype.md) | Interaktive Karte | Teststadt, Zoom 2D/3D, Pan, Ortsdetails | erledigt |
| [P0-002](../tasks/P0-002-dual-runtime.md) | Dual Runtime | C++-Core nativ/WASM, gemeinsamer Vertrag, Character-Leases | erledigt |
| [P1-001](../tasks/P1-001-movement.md) | Wege/Reisen | Graph, Routenvorschau, Fußreise/Ankunft | erledigt |
| [P1-004](../tasks/P1-004-map-visual-upgrade.md) | Weltkarte 2.0 | Fullscreen-HUD, Rotation, Visualformat, Gebäude/Küste/Straßen | erledigt |
| [P1-005](../tasks/P1-005-world-package-loader.md) | Kartenpakete | Breakwater und Cove ohne Neubuild nativ/WASM/Browser | erledigt |
| [P1-006](../tasks/P1-006-osm-world-importer.md) | Geodatenimport | Offline-OSM, City-v3, Natural/Island; 1×1 und 5×5 km gemessen, dichter Ausschnitt am Byte-Limit | erledigt |
| [P1-007](../tasks/P1-007-world-studio.md) | World Studio Karteneditor | Auswahl, Import, Vorschau, validierter Export und Spielstart | erledigt |
| [P1-008](../tasks/P1-008-realtime-clock-motion.md) | Echtzeit und flüssige Bewegung | 1×-Uhr, Debug-Faktor, kontinuierliche Marker entlang Hostroute, native/WASM-Parität | als Nächstes geplant |
| [P1-002](../tasks/P1-002-character-routines.md) | Bewohner und Tagespläne | Datengetriebene Residents, Home/Job/Routine, Arbeit/Heimkehr; erster passender Inspector | geplant |
| [P1-003](../tasks/P1-003-npc-behavior.md) | NPC-Verhalten | Einfache Entscheidungen, Ambient-Population, Messung; gemeinsame Actions | geplant |
| P2.1 | Erster spielbarer Auftrag | Ort/Item/Activity, Kuriermission, Einkommen, Speichern/Laden; erste Content-Editoren | geplant |
| P2.2 | Spielbarer Alltag | Shop, Essen/Trinken/Schlaf/Hygiene, einfacher wiederkehrender Lieferjob, erstes Reiseevent mit Timeout-Fallback | geplant |
| P3 | Besitz und Charakterentwicklung | Fahrzeuge/Fahrten, Immobilien, Jobs/Handel, Beziehungen, Attribute/Skills und passende Editoren | später |
| P4 | Crime-RPG-Spielbreite | Abstrakte Konflikte, fiktiver illegaler Handel/Diebstahl, Rennen, Glücksspiel/Freizeit, Utility AI, Mission-/Event-/Dialoggraphen und Minispiele | später |
| P5 | Öffentlicher Multiplayer | Auth, Rechte, Reconnect, Sicherheit, Hosting/Skalierung | zurückgestellt |
| später | Erweiterungen | Modulare 3D-Charaktere/Kleidung, komplexe Wirtschaft; Aktienhandel weit nach dem Kernspiel | zurückgestellt |

Reihenfolge: P1-007 → P1-008 → P1-002 → P1-003 → P2.1 → P2.2. Task-IDs sind nicht chronologisch. P2.1 ist der erste echte RPG-Loop (Auftrag, Reise, Übergabe, Einkommen), P2.2 baut einen wiederholbaren Lebens-/Arbeitsloop. P2.1/P2.2 sind Planungsabschnitte, konkrete Task-Dateien erst vor Umsetzung spezifizieren. Kein vollständiges Charakter-/Wirtschaftssystem als Vorbedingung. P1-007 bleibt Karteneditor, keine Scope-Erweiterung.

[Gameplay-Featurekatalog](design/gameplay.md) · [Charaktermodell](design/characters.md) · [Weltsimulation](design/simulation.md) · [World-Studio-Roadmap](design/world-studio-content.md) · [Game Content](architecture/game-content.md). Jede Mechanik erhält ein versioniertes dynamisch ladbares Format, passende Clientprojektion und bei unterstütztem Format einen kleinen Studio-Editor; kein hartcodierter Content. Editor und Game wachsen in vertikalen Schnitten.
