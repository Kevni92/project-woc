# Transportneutraler Simulationsvertrag
Status: VORGABE für Transportwechsel ohne UI-Umbau; konkrete Nachrichten und Encoding ENTWURF.

## API
SimulationClient bietet asynchron Connect/Disconnect, SendCommand, RequestSnapshot, Subscribe (unsubscribe), AcquireCharacter/ReleaseCharacter als fachliche Commands. Verbindungsstatus und Fehler explizit. Transport abstrahiert open, send(message), onMessage, onClose, close. WASM und WebSocket verwenden dieselben Nachrichten und dieselbe Codec-/Schema-Version. Keine synchronen direkten C++-Getters in der UI. Client-Adapter übersetzt Transportfehler in einheitliche Fehler; ViewStore hält nur lesende Projektion. Beide Hosts unterstützen mehrere logische Sessions; Session-Identität wird vom Host zugewiesen, nicht vom untrusted Payload übernommen.

## Wire-Format v1 (Entwurf)
UTF-8 JSON, eine Nachricht pro WebSocket-Textframe bzw. Worker-Nachricht. Envelope: protocolVersion, type, requestId (für Request/Result), payload; Servernachrichten zusätzlich streamSeq und worldTick wo relevant. IDs als Strings, Geld als ganzzahlige kleinste Einheit im dokumentierten sicheren JSON-Bereich. Schema und gemeinsame Fixtures in protocol/; Version/Capabilities beim Hello aushandeln. Unbekannte inkompatible Version ablehnen. Keine Pointer, C++-Typnamen, JS-Funktionen oder binären Speicherlayoutdetails. Bei Bedarf später versioniertes Binary-Encoding aushandeln.

| Richtung | Nachrichten |
|---|---|
| Client → Host | Hello, Command, SnapshotRequest, SubscriptionUpdate, Ping |
| Host → Client | Welcome, CommandResult, Snapshot, Delta, PublicEvent, Error, Pong |

Commands: AcquireCharacter, ReleaseCharacter, MoveTo, BuyItem, AcceptMission, ChooseMissionOption etc. Command enthält requestId/Command-ID, ggf. Ziel-Character-ID, fachliche Argumente. Session/Steuerrecht wird serverseitig aufgelöst. Result bedeutet accepted/rejected mit maschinenlesbarem Fehler oder Erfolg und Tick/Revision; Annahme einer Reise ist nicht deren Abschluss. Fehler z.B. CHARACTER_BUSY, NOT_CONTROLLER, NOT_ELIGIBLE, INVALID_ACTION, STALE_STATE, INSUFFICIENT_FUNDS. Vertrauliche Daten nur an berechtigte Sessions.

## Lifecycle und Synchronisierung
Hello → Welcome (Session-ID, Welt-ID, Version, Capabilities) → initialer Snapshot (sichtbare Welt, CharacterSummary, ggf. kontrollierter Character, Revision/Stream-Sequenz) → Deltas/Events. Snapshot und nachfolgende Deltas atomar an einer Sequenzgrenze schneiden. Deltas je Session mit monotoner streamSeq; nicht globale World-Ticks zur Lückenerkennung verwenden. Bei Lücke oder unbekannter Basis Snapshot neu anfordern und Zustand atomar ersetzen. Bounded Queues/Backpressure, Positionsdeltas bündeln oder Snapshot erzwingen; Ergebnisse und Kontrollübergänge nicht still verwerfen. Client rendert zwischen erhaltenen Positionen interpoliert; keine autoritative Vorhersage. Reconnect liefert neue oder serverseitig authentifiziert wiederaufgenommene Session und frischen Snapshot; keine blinde Wiederholung mutierender Commands, begrenzte Deduplikation pro Session/Command-ID.

## Steuerübernahme
AcquireCharacter ist atomar an der Simulationsgrenze: Existenz, Übernehmbarkeit, Sessionberechtigung und exklusive Lease prüfen; erster zulässiger Command gewinnt, zweiter erhält CHARACTER_BUSY. Maximal ein kontrollierter Charakter je Session und maximal eine Session je Charakter (MVP-Entwurf); Wechsel atomar, alter Charakter bei fehlgeschlagener Übernahme nicht verlieren. Freigabe, Disconnect und optional Timeout lösen Lease und Autonomie aus. Laufende Aktionen, Schulden, Verpflichtungen etc. bleiben weltpersistiert. Native und lokaler Host verwenden dieselbe Control-Registry. Der Host liefert erlaubte Aktionen und Detailprojektionen für den kontrollierten Charakter; Regeln validieren trotzdem jede Ausführung. Keine privaten Daten anderer Charaktere allein aufgrund ihrer Sichtbarkeit.

## Abnahmekriterien
Gleiche Fixture/Command-Sequenz für native CLI, WASM Worker und native WebSocket-Hosts; semantisch gleiche Ergebnisse und Snapshot-Zustände. Dasselbe Browser-UI über beide Transportadapter. Zwei Sessions konkurrieren um einen Charakter, nur eine erhält Zugriff; nicht autorisierte Aktion abgelehnt; Freigabe ermöglicht Übernahme; Reconnect/Sequenzlücke mit Snapshot. P0-002 enthält nur eine kleine vertikale Testdomäne, keine produktionsreife Online-Sicherheit.
