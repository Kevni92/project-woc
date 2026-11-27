# Charaktere, Steuerübernahme und Simulationsqualität
Status: VORGABE für grundsätzlich übernehmbare tief simulierte Charaktere und abgestufte Simulation; konkrete Stufen/Regeln ENTWURF.

## Charakter statt Spielerfigur
Die Welt besitzt Bewohner unabhängig von Clients. Jeder tief simulierte Charakter hat eine stabile Character-ID. Client ist eine temporäre Steuerinstanz, kein Eigentümer des Charakters. Ein Charakter kann von KI gesteuert, durch einen Client gesteuert oder vorübergehend inaktiv sein. Ein Wechsel erschafft keinen neuen Charakter, setzt kein Geld zurück und kopiert keinen Besitz. Charaktere können auch ohne verbundenen Client leben, arbeiten, reisen und Beziehungen pflegen.

## Simulationstiefe (fachliches Datenmodell, getrennt von Berechnungsfrequenz)
| Stufe | Daten und Verhalten | Übernahme |
|---|---|---|
| Ambient | einfache ID/Position, Bewegungsziel, visueller Typ, kurze Aktivität; ggf. anonym aggregiert/ausgeblendet | nein, sofern nicht zu vollständigem Charakter entwickelt |
| Resident | persistente Identität, Wohnung oder Wohnstatus, optional Job, Beziehungen, Tagesplan, Geld/Konto, Besitz/Auto, Inventar, Attribute, Bedürfnisse; regel-/zielgesteuerte Entscheidungen | ja, sofern berechtigt und frei |
| Featured | Resident mit zusätzlichen Erinnerungen, Motivationen, detaillierteren sozialen Entscheidungen und Missionsbezug | ja, gleiche Steuerlogik |
Stufen sind keine festen Vererbungsklassen; Fähigkeiten und Daten über Komponenten. Featured zunächst nur spätere Erweiterung. Nicht jeder Resident besitzt tatsächlich Haus/Auto/Job; fehlender Besitz ist gültiger Zustand. Vollständige Lebenshistorie ambient Passanten nicht voraussetzen. Promotion optional später, nur durch explizite persistente Initialisierung (Identität, gültige Beziehungen, Finanzen, Besitz, Herkunft); kein spontanes Erfinden nach Übernahme. Ein bereits vollwertiger Charakter darf nicht durch LOD seine Daten verlieren.

## Charakterdaten
Identity: Name, ID, optionale biografische Daten; Home: Wohnort/Immobilie; Employment: Arbeitgeber, Arbeitsort, Schicht, Lohn; Schedule: geplante Aktivitäten und Verpflichtungen; Social: gerichtete Relationship-Edges zu Character-IDs (Typ, Stärke, Historie später); Finance: Bargeld, Konto, Buchungen; Ownership: Immobilien/Fahrzeuge und Zugriff; Inventory: Gegenstände; Attributes: körperliche/mentale/soziale Werte; Needs: Energie, Hunger etc.; Activity: aktueller Ort, Ziel, Reise, Aktion, Deadline. Geld/Ownership werden durch zentrale Systeme konsistent verwaltet. Ein Konto ist eigener Datensatz, keine Kopie des Bargelds.

## Verhalten
Tagesplan erzeugt Ziele (Arbeit, Einkaufen, Heimkehr, soziale Treffen); Entscheidungsregeln berücksichtigen Bedürfnisse, Geld, Attribute, Beziehungen, verfügbare Wege und Öffnungszeiten. Erst feste Pläne und einfache Prioritäten; später Utility AI und Erinnerungen. Keine LLM-Aufrufe pro NPC. Die KI nutzt dieselben fachlichen Actions/Validierungen wie Clients. Bezahlung, Abwesenheit, Tagesablauf und Konsequenzen bleiben auch unter Spielersteuerung wirksam. Bei Übernahme werden nicht verbindliche KI-Pläne unterbrochen; begonnene Aktionen folgen denselben Abbruchregeln wie Spieleraktionen. Bei Freigabe plant KI vom realen aktuellen Zustand aus neu, keine Rückteleportation.

## Simulationsauflösung (orthogonal zur Stufe)
Aktiv: Reise-/Aktionsfortschritt in kurzen Schritten, häufigere Entscheidungsprüfung bei relevanten Ereignissen. Hintergrund: fällige Termine und geplante Aktionen, analytischer Fortschritt zwischen Ereignissen, seltener Entscheidungscheck. Ambient: vereinfachte Wege/Population, begrenzte individuelle Zustände. Auflösung hängt von fachlicher Relevanz (Kontrolle, Mission, Interaktion, laufendes Ereignis) ab, nicht direkt von Kamera/Zoom; Ausgabe/Rendering getrennt. Kein Verlust dauerhafter Daten, keine freie Erzeugung von Geld oder Teleportation bei Wechsel. Bei Promotion/Auflösungswechsel auf exakten aktuellen Spielzeitpunkt synchronisieren. Start mit wenigen Residents und einfachen Passanten; messen vor Optimierung.

## Client-Kontrolle
Session fragt Liste verfügbarer Charaktere an, wählt einen, sendet AcquireCharacter. Host vergibt exklusives Steuerrecht; Details/Aktionen werden zugänglich entsprechend Rollen und fachlichen Bedingungen. Andere Sessions können gleichzeitig andere Charaktere übernehmen. Ein Client kann ohne Charakter beobachten (Entwurf); kein unbeschränktes Recht auf private Daten. Übernahme ist keine Besitztransaktion. Freigabe/Verbindungsabbruch → KI übernimmt vom aktuellen Zustand; genaue Disconnect-Frist und Reservierung später festlegen. In P0-002 sofortige Freigabe bei Disconnect als Testregel. Kontrolle begrenzt freiwillige Entscheidungen, nicht Weltzeit, externe Ereignisse oder physische Constraints.

## Erste Abnahme
Zwei Bewohner mit unterschiedlichen Daten; zwei Clients können getrennte Bewohner steuern, nicht denselben. Nach Freigabe bleibt Position/Geld/Besitz erhalten, Tagesplan läuft weiter. Eine Hintergrundfigur arbeitet bzw. reist zeitlich konsistent; Ambient-Passant bleibt einfach und nicht übernehmbar. Erweiterung von Beziehungen und Utility AI nach dem ersten RPG-Loop.

## Charaktermodell (Gameplay-Erstentwurf, 27.11.2026)
Grundwerte und Fähigkeiten zunächst 0–100 als Balancing-Entwurf, nicht als feste Engine-Limits. Attributdefinitionen und konkrete Startwerte im Content; neue Werte erst mit nutzender Mechanik. Attribute entwickeln sich langsam, Skills durch Anwendung; temporäre Bedürfnisse/Verletzungen beeinflussen effektive Werte, nicht notwendigerweise die Basiswerte.
| Attribute | Beispielnutzung |
|---|---|
| Strength | Nahkampf, körperliche Arbeit |
| Endurance | Ermüdung, Sport |
| Speed | Bewegung/Flucht; konkrete Grundgeschwindigkeit und Limits separat |
| Dexterity | Feinmotorik, Präzision |
| Perception | Gefahrenerkennung, Autofahren, Angeln |
| Focus | Aufmerksamkeit, Schussgenauigkeit |
| Intelligence | Lernen, Problemlösung |
| Charisma | Kommunikation, Verhandlung |

Skills: Melee (Strength/Dexterity), Marksmanship (Focus/Dexterity), Driving (Perception/Dexterity), Cooking (Dexterity/Intelligence), Fishing (Perception/Focus), Trading (Intelligence/Charisma), Persuasion (Charisma/Intelligence), Mechanics (Dexterity/Intelligence), Stealth (Dexterity/Perception). Gambling nur bei kompetenzabhängigen Entscheidungen; bei reinem Zufall keine Skill-Manipulation der Gewinnchance. Gewichtung und Lernregeln datengetrieben, keine exakten Formeln beschlossen.

Personality: Friendliness, Aggression, RiskTolerance, Discipline, Honesty (Entwurf 0–100). Eigenschaften bestimmen Präferenzen, nicht automatisch Erfolg. Beziehungen pro gerichteter Character-ID-Kante: Familiarity 0–100, Affinity −100 bis +100, Trust 0–100, optionale Relationstags (Freund, Familie, Kollege, Arbeitgeber, Geschäftspartner, Rivale). A→B kann von B→A abweichen; unbekannt von bekannter neutraler Beziehung unterscheiden. Gemeinsame Aktivitäten/Verhalten verändern Beziehungen; Vertrauen kann Angebote freischalten.
Needs/Status: Health, Energy, Satiety, Hydration, Hygiene, Mood (Entwurf 0–100, hoch = gut). Verbrauch in Simulationszeit; Essen, Trinken, Schlaf, Duschen und Freizeit regenerieren passende Werte. Gesundheit als Zustand, nicht zwingend als zeitlich sinkendes Bedürfnis behandeln. Keine allumfassende Simulation im ersten Resident-Schnitt.
Appearance: später modulare einfache 3D-Modelle, Haare, Gesicht, Körper und Kleidung aus Asset-Referenzen; visuell getrennt von Attribut-/Ausrüstungswirkungen.
[Gameplay](gameplay.md) · [Simulation](simulation.md).
