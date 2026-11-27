# World Studio — langfristige Content-Authoring-Suite
Status: VORGABE für spätere Editierbarkeit/Platzierung von Gebäudefunktionen, Charakteren, Missionen, Events, Items/Waffen, Fahrzeugen und deren Eigenschaften/Funktionalitäten. UI-Module und Bedienkonzept ENTWURF. P1-007 bleibt ausschließlich Kartengenerator.
Siehe [World Studio](world-studio.md), [Game Content](../architecture/game-content.md).

## Produktkonzept
Eine lokale projektbasierte Anwendung mit Kartenansicht, Objektbaum/Katalog, typabhängigem Inspector, später Graph-Editor. Gemeinsamer Projektzustand, Auswahl nach stabiler ID, Referenzpicker, Undo/Redo, Speichern und Validieren. Draft-Projekt (editierbar, auch vorübergehend unvollständig) getrennt vom unveränderlichen validierten Runtime-Export. Kein Spielstand-Editor und keine Manipulation eines aktiven Servers. Export enthält nur benötigte Runtime-Daten; Editor-Layout, Undo-Historie, GIS-Cache bleiben lokal. Reimport von Geografie erhält stabile Source-IDs/Zuordnung, zeigt verwaiste Referenzen zur expliziten Auflösung, löscht Gameplay nicht still.

## Module (langfristig)
| Modul | Funktionen |
|---|---|
| Geografie | OSM-Import, Auswahl, Randmodus, Vorschau, Export (P1-007) |
| Gebäude/Orte | Gebäude auswählen, mehrere funktionale Einheiten (Wohnung, Laden, Büro), Zugang, Öffnungszeiten, Besitzinitialisierung und verfügbare Actions zuordnen |
| Charaktere | Name/ID, Tier, Startposition, Wohn-/Arbeitsort, Geld/Konto, Beziehungen, Inventar/Auto, Attribute, Routinen |
| Item-/Waffenkatalog | Fiktive Spielgegenstände, Typ, Beschreibung, Preis, Attribute, abstrakte Spielwirkungen und erlaubte Aktionen, Stapelbarkeit; Instanzen/Shopangebot platzieren |
| Fahrzeugkatalog | Typ, Preis, Geschwindigkeit, Kapazität, abstrakte Fahrzeugwerte; konkrete Fahrzeuge samt Position/Besitz platzieren |
| Jobs/Wirtschaft | Jobtypen, Arbeitgeber/Ort, Schichten/Lohn, Shopangebote und Preise |
| Missionen/Dialoge | Visueller Zustandsgraph, Text, Voraussetzungen, Auswahl, Ziele, Belohnungen, Testpfad |
| Events | Trigger, Bedingungen, Effekte, Zeitplan, Zielgruppe, Wiederholung |
| Regeln | Konfigurierbare Attribute, Zeit-/Balancingparameter, Katalog unterstützter Mechanikprimitive |
| Qualität | Querverweise, fehlende Assets/Orte, Erreichbarkeit, Warnungen/Fehler, Preview und Export |
Editor zeigt nur Engine-unterstützte Feldtypen/Aktionen, aus versioniertem Capability-/Schema-Katalog. Neue Funktionalität kombinierbar aus vorhandenen Primitiven; völlig neue Mechanik benötigt Engine-Schnitt. Keine freie Codeausführung aus Content. Keine UI implementieren, deren Export der Host noch nicht interpretieren kann.

## Beispiel: Café
Gebäude auf der Karte auswählen → funktionalen Ort Café mit bestehendem Zugang anlegen → Öffnungszeiten und Job Schicht A setzen → Shopangebote aus Item-Katalog wählen → Charakter als Mitarbeiter zuweisen → Mission mit Ort und Eventtrigger verbinden. Export referenziert dieselben IDs, ohne Gebäudegeometrie zu kopieren. Simulation lädt Definitionen und Startinstanzen, prüft Aktionen, UI zeigt zugelassene Interaktionen.
## Reihenfolge
Kartengenerator zuerst vollständig nutzbar machen. In dessen Code lediglich getrennte Projekt-/Exportmodelle, gemeinsame Auswahl und modulare UI-Struktur vorsehen, keine leeren Editor-Tabs erzwingen. Erste echte Content-Module mit P1-002/P2 gemeinsam mit der jeweiligen Spielmechanik erstellen. Kein monolithisches CMS/visueller Programmiereditor als Voraussetzung.
