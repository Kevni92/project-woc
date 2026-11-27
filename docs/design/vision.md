# Vision
Status: VORGABE für das Grundprinzip; konkrete Ausgestaltung ENTWURF.

Die Karte ist das Spielbrett. Der Spieler lebt in einer modernen, fiktiven Stadt und entwickelt seinen Charakter durch zeitgebundene Handlungen, Entscheidungen und Besitz. Die Welt existiert auch unabhängig vom Spieler.

## Säulen
- Interaktive, minimalistische 3D-/2D-Karte mit fließendem Zoom statt frei begehbarer 3D-Welt.
- Text-RPG mit sichtbaren Konsequenzen auf der Karte.
- Persistente, übernehmbare Charaktere besitzen Identität, Alltag, Beziehungen und Besitz. Ein Client übernimmt zeitweise einen Charakter; die Welt läuft unabhängig davon weiter. Einfache Passanten werden mit geringerer Tiefe simuliert.
- Besitz und Fortschritt: Inventar, Fahrzeuge, Immobilien, Geld und Attribute.
- Lokaler Einzelspieler zuerst, aber mehrere logische Clients pro Simulation sind von Beginn an vorgesehen. Später gemeinsame Welten mit nativer serverseitiger Autorität.

## Kernschleife (Entwurf)
Ort entdecken → Ziel auswählen → reisen → verfügbare Aktion prüfen → Textentscheidung treffen → Konsequenz (Geld, Gegenstand, Ruf, Zeit) erhalten → neue Möglichkeiten entdecken.

## Nicht-Ziele für den Prototyp
Keine photorealistische Welt, kein Echtzeitkampf, keine Innenräume in 3D, keine Onlinepflicht (lokaler WASM-Host), keine komplexe Wirtschaft oder generative NPC-Dialoge. Keine vollständige Nachbildung eines existierenden Spiels.
