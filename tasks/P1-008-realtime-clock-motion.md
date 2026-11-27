# P1-008 — Echtzeituhr, Debug-Zeitfaktor und flüssige Bewegung
Status: geplant (27.11.2026), nächster Schnitt nach P1-007. Keine Umsetzung in diesem Dokumentationscommit.
Abhängigkeiten: P1-001, P1-005, bestehende Host-/Transportarchitektur; P1-007 zuerst abschließen. Vor Implementierung aktuelle Runtime-, Uhr-, Movement-, Protokoll- und Renderer-Verträge prüfen.

## Ziel/Vorgaben
- Standard 1×: eine reale Sekunde entspricht einer simulierten Sekunde, Spieltag 24 reale Stunden. Keine Bindung an lokale zivile Uhrzeit; bestehende Startuhrzeit und Tag/Nacht erhalten.
- Debug-Menü ändert die autoritative Simulationsgeschwindigkeit während des Betriebs. Vorschlag Presets Pause, 1×, 2×, 5×, 10×, 60×, optional begrenzter manueller Faktor; konkrete Grenzen vor Umsetzung definieren. Pause/Fortsetzen als Debug-Funktion. Änderung für die gemeinsame Simulation sichtbar, nicht pro Charakter; im nativen Host nur zulässige Debug-Steuerung, keine öffentliche Multiplayer-Berechtigung.
- Fußreisen mit 4 km/h bei 1× (vorläufiges bestehendes Balancing) und kontinuierliche Markeranimation entlang der tatsächlichen Route statt sichtbarer Sekundensprünge. Render-FPS beeinflusst keine Regeln.

## Umsetzungsschnitt (Entwurf)
1. Host-Uhr auf subminütliche, ganzzahlige Simulationszeit bzw. feste deterministische Ticks mit Restakkumulation umstellen. Monotone Host-Zeit; feste Schrittweite/Update-Kadenz nach Messung wählen, nicht Sekunden mit Minuten verwechseln. Zeitfaktor in beiden Hosts konsistent, manuelle Testuhr und deterministische Replay-Tests erhalten; fällige Ereignisse nicht überspringen/duplizieren, Catch-up begrenzen ohne stillen Zeitverlust im normalen Betrieb.
2. Movement-Distanzbudget aus verstrichener Simulationszeit, Rest über Schritte/Segmente erhalten. ETA, Routenfortschritt, Ankunft und Tag/Nacht auf neue Einheit anpassen. Explizite Einheiten, Protokollversion/Fixtures nur soweit erforderlich kompatibel aktualisieren; keine stillen Bedeutungsänderungen. Real-ETA als Zusatz bei aktuellem Faktor, bei Pause keine laufende reale Ankunftsschätzung.
3. Debug-Command und Projektion für aktuellen Faktor/Pause; Host validiert Werte/Debug-Berechtigung. UI meldet bestätigten Faktor, nicht optimistische fachliche Änderung.
4. Client rendert pro Frame anhand bestätigter Zeit-/Routendaten glatt entlang der Polylinie. Interpolation oder begrenzte visuelle Extrapolation, keine zweite fachliche Simulation; keine Geradenabkürzung an Kurven. Bei Pause, Faktorwechsel, Ankunft, neuer Route, Snapshot-Resync oder Verbindungsverlust Darstellung korrekt einfrieren/korrigieren, nicht frei weiterlaufen. Interaktionen bleiben hostseitig validiert.

## Akzeptanz und Tests
- Kontrollierte Uhr: 60 reale Sekunden bei 1× ergeben 60 Simulationssekunden; bei 10× 600, bei Pause 0. Wechsel 1×→10×→Pause→1× ohne Sprung/Restverlust oder Rückwärtszeit. Tageswechsel korrekt; feste Schritte/Replays reproduzierbar; keine Abhängigkeit von FPS oder Clientzahl.
- Reise über 400 m bei 4 km/h dauert 360 Simulationssekunden (bei 1× rund 6 reale Minuten); bei konstant 60× rund 6 reale Sekunden, vorbehaltlich eines autoritativen Ticks. Gleiche Distanz/Ankunft bei gleicher Simulationszeit, unabhängig vom Faktor; exakt ein EntityArrived, keine Rückteleportation bei Lease-Freigabe oder Charakterwechsel. Kurven, Routenende und Resync prüfen.
- Debugger ändert Faktor in Worker/WASM und native WebSocket; ungültige Werte ablehnen; Pause und Neustart/Default testen. Bestehende manuelle CLI/WS-Vertragsfixtures anpassen; gemeinsame native/WASM-Parität.
- Browser-E2E: mehrere Renderframes zwischen Hostupdates zeigen kontinuierlichen Fortschritt auf einer gekrümmten Route (Toleranzen statt exakter FPS), Pause friert Darstellung ein, Faktorwechsel wirkt konsistent, Ankunft kein Überschwingen. Snapshot-Verlust/Resync, Disconnect, Lease und Ambient-Bewegung regressionsprüfen. Native/WASM-Build, CTest, Typecheck/Vitest, relevante Playwright-Suites tatsächlich ausführen und dokumentieren.

## Nicht im Umfang
NPC-Routinen, neue Inhalte, Gameplay-Editoren, Fahrzeuge, komplette Event-Engine, Offline-Fortschritt, Zeitüberspringen für einzelne Spieler, öffentlicher Multiplayer und 3D-Laufzyklen von Figuren. P1-007 nicht verändern; Kartenmarker sind das Ziel. Historische P1-001-Dokumentation als implementierten Altstand erhalten; bei tatsächlicher Umsetzung README, Simulation, Protokoll, Roadmap, Entscheidungen und diesen Task aktualisieren.
