# Weltsimulation
Status. Fußreisen sind in P1-001 IMPLEMENTIERT. Die weiteren Simulationsregeln sind ENTWURF.

## Zeit
Eine zentrale C++-GameClock speichert absolute Spielminuten, aus denen Tag und Uhrzeit folgen. Entwurfswert: 1 reale Sekunde = 1 Spielminute (24 reale Minuten pro Spieltag); konfigurierbar. Pause/Fortsetzen sowie Zeitfaktor für Debugging. Lokal kein Fortschritt bei geschlossenem Browser in P0–P2; Tab-Hintergrund bewusst pausieren statt unkontrollierte Catch-up-Sprünge. Native Simulation besitzt eigene Host-Zeitsteuerung; ein Client-Disconnect stoppt nicht automatisch die Welt. Zeitregeln später überprüfen.
Ein fester Simulationstakt unabhängig von Render-FPS; Ereignisse mit gleicher Fälligkeit werden in stabiler Reihenfolge verarbeitet. Gesäte Zufallszahlen für reproduzierbare Tests.

## Bewegung
P1-001 berechnet Fußreisen zu bekannten Orten im Core per Dijkstra. Ausgangspunkt ist ein Graphknoten oder ein Abstand in Millimetern entlang einer Kante in ihrer definierten Richtung. Bei Kantenstarts berücksichtigt die Suche beide Richtungen ab der aktuellen Position. Bei gleichem Suchabstand gilt die lexikografische Knoten-ID. Ausgehende Kanten werden nach ID geprüft. Der erste gleich teure Pfad bleibt bestehen.

Die Länge einer Kante ist die Summe ihrer auf Millimeter gerundeten Liniensegmente. Vorschau und Reise verwenden dieselben Längen. Bei 4 km/h ist der Fortschritt nach `n` Spielminuten `floor(n × 200000 / 3)` mm, begrenzt auf die Zieldistanz. Der Rest wirkt über alle Ticks und Kanten weiter. Die ETA ist `ceil(Distanz_mm × 3 / 200000)` Spielminuten ab Abfahrt. Am ersten Tick mit ausreichendem Budget wechselt die Figur exakt an den Zielzugang und löst einmal `EntityArrived` aus. Die Karte setzt Marker pro autoritativem Tick auf die gemeldete Position und zeichnet die Route mit allen Host-Stützpunkten. [P1-001](../../tasks/P1-001-movement.md)

Der Passant verwendet dieselbe Bewegung zwischen zwei Graphknoten. Begonnene Reisen laufen nach Freigabe, Wechsel oder Disconnect weiter. Freie Bewohner warten nach der Ankunft am Ziel. Umleitung, Abbruch, Fahrzeuge und deren Geschwindigkeiten bleiben Entwürfe.

## NPCs
Ein voll simulierter Charakter besitzt ID, Name, Wohnort, optional Arbeitsort, Position, Tagesplan, aktuelle Aktivität, Beziehungen, Finanzen, Besitz und Attribute. Start mit 5–10 persistenten Bewohnern. Einfache Passanten erhalten nur minimale Bewegungs-/Aktivitätsdaten; siehe [Charaktere und Simulationstiefe](characters.md). Beispiel: 07:30 zur Arbeit, 08:00–16:00 arbeiten, 17:00 Laden/Café, ab 20:00 zuhause. Reisezeiten berücksichtigen; bei Verspätung nächste Aktivität konsistent wählen. Keine Teleportation zwischen Orten.
Zustände: Idle, Traveling, PerformingActivity, Sleeping. Entscheidungslogik zunächst feste Zeitpläne und Regeln. Daten für Beziehungen, Bedürfnisse, Finanzen und Attribute schrittweise ergänzen; spätere Utility AI nutzt diese zur Auswahl von Aktivitäten. Bei Steuerübernahme entscheidet der Client über freiwillige Aktionen; Weltzeit, laufende Verpflichtungen und Konsequenzen bleiben bestehen. NPCs sollen auf Ereignisse reagieren können (Ort geschlossen, Angebot geändert), ohne für jeden NPC pro Frame KI auszuführen.
Relevante persistente NPCs außerhalb sichtbarer Karte bleiben simuliert, gegebenenfalls mit gröberen geplanten Ereignissen. Kamera, Clientzahl und Sichtbarkeit dürfen die semantische Simulation nicht verändern. Fällige Ereignisse und räumliche Indizes statt Vollsimulation jeder Figur pro Frame. Native und WASM verwenden dieselben Regeln.

## Testkriterien
Gleicher Startzustand, Seed und Befehlsverlauf erzeugen gleiche Ergebnisse; NPC erreicht Arbeitsort, reist heim; Tageswechsel korrekt; Ankunft einmalig; Render-FPS verändert Zeit/Position nicht. P0-002 enthält eine Spieluhr und einen deterministischen Ambient-Weg zum Debuggen. P0-001 zeigt die tatsächlichen Charakterpositionen und leitet die Farbpalette aus der Host-Uhr ab. P1 erweitert die Welt um Wegesystem und Tagesabläufe.
