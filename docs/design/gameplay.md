# Gameplay-Systeme
Status: ENTWURF

## Charakter
Stabile Spieler-ID, Name, Geld (ganzzahlige kleinste Währungseinheit), Position, Inventar und Besitz. Kandidaten für Attribute: Stärke, Geschick, Intelligenz, Charisma; noch nicht balancieren. Erst Attribute hinzufügen, wenn eine Aktion sie tatsächlich benötigt.

## Inventar und Besitz
ItemDefinition (Name, Kategorie, Stapelbarkeit, Preis) getrennt von ItemStack/ItemInstance (Menge oder individuelle ID). Fahrzeuge und Immobilien sind persistente Entitäten mit Owner-ID und Standort; nicht bloß ein Inventarstack. Kauf validiert Geld, Angebot und Verfügbarkeit, aktualisiert Besitz/Geld atomar und publiziert Ereignis. Inventarplätze, Gewicht, Miete, Verbrauch zunächst nicht notwendig.

## Orte und Missionen
LocationAction definiert Bedingungen, Kosten, Dauer, Konsequenzen. MissionDefinition mit Ort, Text, Wahlmöglichkeiten, Voraussetzungen und Ergebnisregeln; MissionInstance speichert Fortschritt. Erst eine harmlose textbasierte Kuriermission: annehmen, Ziel erreichen, Entscheidung treffen, Belohnung erhalten. Erfolg kann später durch Attribute und kontrollierten Zufall beeinflusst werden. Minispiele dürfen nur Ergebnis/Befehl an Simulation liefern, nicht selbst Geld buchen.
Langfristig Crime-RPG-typische fiktive Aufträge, Reputation, Risiko, Konsequenzen und unterschiedliche Karrierepfade. Kein Detailkonzept vor spielbarer Kernschleife.

## Erste spielbare Schleife (P2)
Start in Wohnung → zu Fuß zum Händler → Gegenstand erwerben → Auftrag annehmen → zu Ziel reisen → Belohnung erhalten → speichern und laden. Fahrzeug und Immobilien folgen P3. Noch keine Multiplayer-Interaktion.
