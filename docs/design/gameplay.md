# Gameplay-Systeme
Status: VORGABE für die datengetriebene Lebens-/Crime-RPG-Sandbox und die nachfolgend aufgeführten Featurebereiche (27.11.2026); konkretes Modell und Balancing ENTWURF. Kein Auftrag zur vollständigen Implementierung.

## Kernschleife
Aktivität/Auftrag wählen → zum Ort reisen → ausführen/entscheiden → Einkommen, Erfahrung und Konsequenzen erhalten → Bedürfnisse decken, Besitz erwerben und Beziehungen entwickeln → weitere Möglichkeiten. Legale Arbeit, Handel, Freizeit und fiktive Kriminalität sind alternative oder kombinierbare Wege, keine vorgeschriebene Karriere. Spieler und Residents verwenden dieselben autoritativen Mechaniken. Spieler bezeichnet eine temporäre Steuerrolle, keine eigene Entitätsklasse.

## Featurekatalog
| System | Funktion und Beispiele |
|---|---|
| 1. Attributes | Grundlegende Leistungsfähigkeit, z. B. Stärke, Ausdauer, Geschwindigkeit, Geschick, Wahrnehmung, Fokus, Intelligenz, Charisma. |
| 2. Skills | Tätigkeitsbezogene Erfahrung, z. B. Nahkampf, Schießen, Fahren, Kochen, Angeln, Handel, Überzeugen, Mechanik, Schleichen; Glücksspielkompetenz nur bei Spielen mit echten Entscheidungen. |
| 3. Personality | Freundlichkeit, Aggressivität, Risikobereitschaft, Disziplin, Ehrlichkeit; beeinflussen Handlungspräferenzen. |
| 4. Relationships | Gerichtete Bekanntheit, Sympathie und Vertrauen, Beziehungstypen; Zugang zu Kontakten/Aufträgen und soziale Konsequenzen. |
| 5. Needs | Gesundheit, Energie, Sättigung, Flüssigkeit, Hygiene, Stimmung; Alltag und zeitabhängige Auswirkungen ohne permanentes Mikromanagement. |
| 6. Activities | Wiederverwendbare orts-/zeitgebundene Handlungen: arbeiten, essen, trinken, schlafen, duschen, kochen, angeln, Sport, Gespräche, Handel, Reisen. |
| 7. Missions | Aufträge mit Zielen, Entscheidungen, Fortschritt und Konsequenzen; durch NPCs, Jobs oder Spiel generiert. Tutorialmissionen später. |
| 8. Jobs | Beschäftigung, Arbeitgeber, Arbeitsort, Schichten, Lohn und wiederkehrende Aufgaben/Missionen. |
| 9. Events | Zeit-, Orts-, Reise- und Interaktionsereignisse mit Entscheidungen und automatischer Auflösung bei Fristablauf. |
| 10. Economy/Trade | Bargeld, Bankkonto, Angebote, Preise, Bestände, Kauf/Verkauf, Einkommen und Ausgaben; später dynamische Wirtschaft. |
| 11. Vehicles/Racing | Besitz, Position, Zustand, Fortbewegung, Fahrzeughandel, Lieferaufträge, Rennen. |
| 12. Inventory/Ownership/Equipment | Gegenstände, Verbrauch, Kleidung, Werkzeuge, Ausrüstung, Fahrzeuge, Immobilien und Zugriffsrechte. |
| 13. Combat/Conflict | Zunächst abstrakte attribut-/fähigkeitsbasierte Konflikte, Nahkampf, Schussgenauigkeit, Flucht, Schaden und Folgen; später Minispiele. |
| 14. Appearance | Später modulare einfache 3D-Charaktere, Haare, Körperbau und sichtbare Kleidung; getrennt von Simulation. |

Details des Charaktermodells: [Charaktere](characters.md). Fortschritt: zunächst tätigkeitsbezogene Skills und langsamere Attributentwicklung, keine Pflicht zu Charakterleveln; Werte und Lernraten erst pro tatsächlich vorhandener Mechanik balancieren.

## Activities, Missions, Jobs, Events
ActivityDefinition (bzw. bestehender Begriff LocationAction für ortsgebundene Aktionen) beschreibt Voraussetzungen, Ziel/Ort, Dauer, Kosten, Inputs/Outputs, relevante Attribute/Skills, Auswirkungen, Abbruch und Ergebnisregeln. ActivityInstance besitzt Start, Fortschritt, Ende und Status. Reisen bleiben autoritative Movement-Mechanik, Activities können sie auslösen/erwarten. Nicht jede Aktion ist eine Mission.

MissionDefinition beschreibt Annahme, Ziele, Bedingungen, Entscheidungen, Belohnungen und Fehler-/Abbruchpfade; MissionInstance hält Fortschritt. Beispiele: Lieferauftrag annehmen → Ware erhalten → reisen → übergeben → Lohn/Vertrauen. Auch wiederkehrende, zeitlich begrenzte und parametrisierte Missionen; spätere Graphen. Jobs definieren Arbeitgeber, Ort, Schichten, Entlohnung, Voraussetzungen, Arbeitsaktivitäten/Missionsvorlagen; NPCs und Spieler teilen diese. Bezahlung darf nicht zugleich durch Schicht und Auftrag unbeabsichtigt doppelt entstehen.

Events haben Trigger, Beteiligte, Optionen, Voraussetzungen, Frist, Konsequenzen und Fallback-Entscheidungsregeln. Beispiele: Bekanntschaft treffen, Konflikt, kurzfristiges Jobangebot, Verkehrsvorfall. Bei kontrolliertem Charakter erhält der Client eine Entscheidung; nach Frist oder bei fehlender Kontrolle bewertet die Simulation dieselben Optionen (Persönlichkeit, Bedürfnisse, Beziehungen, Risiko, erwarteter Erfolg). Attribute/Skills beeinflussen vor allem Erfolg, können aber auch die Attraktivität einer Option ändern. Keine verdeckten zusätzlichen Spielerentscheidungen außerhalb definierter Regeln. Details: [Simulation](simulation.md).

## Einkommen und Wirtschaft
| Pfad | Konkrete Spielinhalte (Entwurf) |
|---|---|
| Arbeit | Lieferdienst/Kurier zuerst, später Türsteher, Koch, Verkäufer, Lagerarbeiter, Taxi, Mechaniker, Fischer. |
| Freizeit/Produktion | Angeln und Fische verkaufen, Kochen, Sport; Ausgaben oder Erträge je Aktivität. |
| Handel | Legale und fiktive illegale Handelswaren, unterschiedliche Angebote/Preise je Ort, Autohandel. |
| Crime | Abstrakte Spielmissionen, fiktiver Drogenhandel und Fahrzeugdiebstahl mit Risiko, Reputation und Konsequenzen; keine reale Verfahrenssimulation erforderlich. |
| Wettbewerb/Glücksspiel | Autorennen, Bar mit fiktivem Glücksspiel (nur Spielwährung); Zufallswahrscheinlichkeit bei reinen Glücksspielen nicht durch Skills verfälschen. |
| Finanzmarkt | Aktienhandel ausdrücklich weit später, nicht Voraussetzung für Kernschleife. |

Ausgaben: Nahrung, Getränke, Kleidung, Freizeit, später Miete, Fahrzeuge, Treibstoff, Reparaturen. Geld als ganzzahlige kleinste Währungseinheit; Transfers atomar und nachvollziehbar. ItemDefinition von ItemStack/ItemInstance trennen; Fahrzeug/Immobilie eigenständige persistente Entität mit Besitzer/Ort, kein Inventarstack. Shops mit Angeboten und später Beständen; Gewicht/Slots und dynamische Preise erst bei Bedarf.

## Fahrzeuge, Konflikte, Erscheinungsbild
VehicleDefinition: Preis, Höchstgeschwindigkeit, Motorleistung (PS), Beschleunigung, Handling/Lenkung, Bremsleistung, Kapazität/Kofferraum; Instanz mit Besitzer, Standort und Zustand, später Treibstoff und Verschleiß. Rennen kombinieren Fahrzeugwerte, Driving-Skill und Charakterattribute. Fahrgraph/Zugangsregeln separat vom Fußgraphen spezifizieren. Konflikte zunächst über validierte Handlungsoptionen, abstrakte Erfolgschancen, Schaden/Schutz und Folgen; Minispiele dürfen nicht selbst Geld oder Gesundheit buchen. Clothing/Appearance referenzieren modulare visuelle Assets; Darstellung unabhängig von Gameplay.

## Erste spielbare Schleife (P2)
P2.1: Bewohner mit Wohnung und Startgeld → zum Auftragsort → einfachen Lieferauftrag annehmen → zum Ziel reisen → Ware übergeben → Belohnung einmalig erhalten → speichern/laden. Funktionale Orte, Item-Inventar, einfache Actions und MissionDefinition/Instance. Shopkauf gehört zum ersten RPG-Loop, kann als P2.2 folgen.
P2.2: Händler/Angebote, Essen/Trinken, Schlaf/Hygiene als erste Bedarfsaktivitäten, einfache wiederkehrende Lieferaufträge/Jobvorlage und ein Reiseevent mit Entscheidung/Fallback. Erst ein funktionierender vertikaler Schnitt, danach Varianten. Erste Attribute/Personality nur dort anwenden, wo eine Aktion/Entscheidung sie benötigt. Fahrzeuge, Immobilienwirtschaft, komplexe Graphen, öffentliche Mehrspielerfunktionen und Aktienhandel nicht erforderlich.

## Datengetriebenes Gameplay (VORGABE)
Konkrete Charaktere, Attribute/Skills/Personality/Needs-Startwerte, Beziehungen, Orte, Items, Fahrzeuge, Jobs, Missionen, Events, Aktivitäten, Preise und Regelkombinationen stammen aus validierten World-Studio-Exporten. Engine stellt unterstützte typisierte Trigger, Bedingungen und Effekte bereit; neue Kombinationen ohne Neubuild, neue Mechaniken benötigen einmalige Engine-Erweiterung. Definition, Initialzustand und Spielstand getrennt. [Game Content](../architecture/game-content.md) · [Studio-Content und Editor-Roadmap](world-studio-content.md) · [Roadmap](../roadmap.md).
