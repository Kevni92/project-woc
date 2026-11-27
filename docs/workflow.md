# Konzept- und Implementierungsworkflow
Status: ENTWURF; Nutzer will zügige, KI-gestützte Iteration.

## Konzept
Ein Themenchat bearbeitet nur einen Bereich. Bestehende Vorgaben und Entscheidungen lesen. Kleine, prüfbare Vorschläge statt Komplettdesign. Relevante Datei ergänzen, keine parallelen widersprüchlichen Spezifikationen. Neue Ideen als ENTWURF kennzeichnen, erst explizite Freigabe als BESCHLOSSEN. Offene Fragen in decisions.md, nicht in jedem Dokument duplizieren.
Konzeptdatei enthält Zweck, Status, Spielerperspektive, Regeln/Daten, Grenzen, Abnahmekriterien, offene Fragen soweit relevant. Umfang nach Bedarf.

## Task-Format
Datei tasks/<ID>-<slug>.md: ID, Status (geplant / bereit / in Arbeit / blockiert / erledigt), Ziel, relevante Konzeptlinks, Abhängigkeiten, In-Scope, Out-of-Scope, Akzeptanzkriterien, Testplan, Ergebnis (geänderte Dateien, Tests, offene Punkte). Ein Task ist klein genug für einen isolierten KI-Implementierungsauftrag. Entwurfsannahmen bei Implementierung ausdrücklich benennen.

## Umsetzung
1. AGENTS.md und relevante Konzepte/Task lesen; Ist-Zustand prüfen.
2. Nur angeforderten Task umsetzen; bei Konzeptauftrag keinen Produktionscode.
3. Automatisierte Tests für Spiellogik sowie Build/Typprüfung; Browser-Smoketest bei UI.
4. Akzeptanzkriterien überprüfen, reale Ergebnisse und Abweichungen im Task notieren.
5. Roadmap aktualisieren; Änderungen in nachvollziehbarem Commit dokumentieren. Bei bereits bestehender Arbeit keine destruktiven Git-Befehle.
Keine ungetesteten Behauptungen, keine erfundenen Ergebnisse. Nicht ungefragt eine neue Projektphase starten.

## Einstieg für neue KI
„Arbeite im Repository Kevni92/project-woc. Lies zuerst AGENTS.md und die dort verlinkten aktuellen Dokumente. Mein Auftrag ist: [konkretes Thema oder Task-ID]. Ändere nur die dafür nötigen Dateien. Trenne Entwurf von beschlossenen Anforderungen und dokumentiere dein Ergebnis.“
