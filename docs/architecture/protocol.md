# Transportneutraler Simulationsvertrag
Status: VORGABE für Transportwechsel ohne UI-Umbau. Der hier beschriebene v1-Teilumfang ist in P0-002 IMPLEMENTIERT.

## Client und Transport

`SimulationClient` bietet `connect`, `disconnect`, `sendCommand`, `requestSnapshot`, `subscribe`, `acquireCharacter` und `releaseCharacter`. Aufrufe mit Ergebnis sind asynchron. Abonnenten erhalten Verbindungsstatus, Fehler und eine lesende Projektion. Beide Browseradapter implementieren `open`, `send` und `close` mit Empfangs- und Abbruchcallbacks. Die Adapter transportieren dieselben JSON-Zeichenketten. Jeder WebSocket und jeder MessagePort hat eine eigene Host-Verbindung. Erst `Hello` erzeugt eine logische Session. Die Host-Zuordnung gilt für die Lebensdauer dieser Verbindung.

## Wire-Format v1

UTF-8-JSON. Eine Nachricht pro WebSocket-Textnachricht beziehungsweise Worker-Nachricht. Die Schemas für [Anfragen](../../protocol/client-v1.schema.json) und [Antworten](../../protocol/server-v1.schema.json) definieren die Felder und Typen. Die [Vertragsfixture](../../protocol/fixtures/dual-runtime.json) enthält eine vollständige Befehlsfolge für zwei parallele Verbindungen und eine neue Session nach Disconnect.

| Richtung | Nachrichten |
|---|---|
| Client → Host | `Hello`, `Command`, `SnapshotRequest` |
| Host → Client | `Welcome`, `CommandResult`, `Snapshot`, `Delta`, `Error` |

Jede Anfrage enthält `protocolVersion: 1`, `type`, `requestId` und `payload`. IDs bestehen aus 1–64 ASCII-Zeichen aus `A–Z`, `a–z`, `0–9`, `_` und `-`. Die zulässigen Request-Felder sind abschließend. Der Host weist inkompatible Versionen mit `UNSUPPORTED_VERSION` zurück. Das v1-Protokoll akzeptiert Eingaben bis 4.096 Bytes. Der WebSocket-Adapter beendet die Verbindung bei zu großen oder binären Nachrichten. Der Worker liefert bei zu großen Nachrichten `INVALID_MESSAGE`.

`Hello` und `SnapshotRequest` haben einen leeren Payload. `Welcome` liefert `sessionId`, `worldId` und die v1-Fähigkeiten `CharacterControl`, `TestAction` und `SnapshotDelta`. Auf `Welcome` folgt unmittelbar ein initialer `Snapshot` ohne `requestId`. Ein explizit angeforderter Snapshot erhält die Request-ID. `Error` enthält einen maschinenlesbaren Code und bei lesbarer ID die Request-ID. Fachliche Ablehnungen erscheinen in `CommandResult` mit `accepted: false` und `code`.

## Commands und Steuerübernahme

`Command` erwartet `action` und `characterId`. In P0-002 gibt es `AcquireCharacter`, `ReleaseCharacter` und `TestAction`. Jedes `CommandResult` enthält `accepted` und die Weltrevision zum ursprünglichen Ergebnis. Der Host speichert die letzten 64 Command-Ergebnisse pro Session. Derselbe Command mit derselben Request-ID liefert das gespeicherte Resultat ohne erneute Mutation. Andere Argumente unter einer noch gespeicherten ID ergeben `REQUEST_ID_REUSED`.

Der Host prüft die Existenz des Charakters, seine Übernehmbarkeit und die exklusive Lease. Jede Session kann einen Charakter steuern. Bei einem erfolgreichen Wechsel wird die alte Lease atomar freigegeben. Ein abgelehnter Wechsel lässt die bisherige Lease bestehen. `ReleaseCharacter` und `TestAction` setzen eine eigene Lease voraus. `ReleaseCharacter` und Disconnect lösen die Lease sofort. Die Figur und ihr veränderter Zustand bleiben im laufenden Host erhalten. Der Ambient-Passant ist grundsätzlich nicht übernehmbar.

## Projektion und Synchronisierung

Jede Host-Nachricht hat eine pro Verbindung fortlaufende `streamSeq` und den aktuellen `worldTick`. Snapshot und Delta enthalten die Weltrevision, absolute Spielminuten und die private Projektion `controlled` mit ID und Bargeld oder `null`. Geld wird als Ganzzahl in kleinster Währungseinheit übertragen. Öffentliche Charakterübersichten enthalten ID, Name, Position in lokalen Metern sowie Übernehmbarkeit und Belegung. JSON-Zähler und Geld liegen im sicheren Ganzzahlbereich.

Snapshots ersetzen die Projektion vollständig. Deltas enthalten `baseRevision` und nur geänderte öffentliche Charakterübersichten. Die private Projektion wird mit jedem Delta vollständig ersetzt. Der Client wendet Deltas nur bei lückenloser `streamSeq` und passender Basis an. Bei Abweichungen behält er den letzten konsistenten Stand, fordert einmal pro laufender Wiederherstellung einen Snapshot an und ersetzt den Stand atomar. Neue Verbindungen erhalten eine neue Session und einen frischen Snapshot. Ausstehende Anfragen schlagen bei Disconnect fehl. Mutierende Commands werden beim Reconnect nicht automatisch erneut gesendet.

## Spätere Erweiterungen

`SubscriptionUpdate`, `Ping`/`Pong`, `PublicEvent`, Spielbefehle wie `MoveTo` und Berechtigungen nach Accounts bleiben Entwürfe. Version, Stream-Sequenz, Weltrevision und Tick haben getrennte Aufgaben. Ein Tick ist keine Grundlage für die Lückenerkennung. Der aktuelle Umfang und die ausgeführten Tests stehen in [P0-002](../../tasks/P0-002-dual-runtime.md).
