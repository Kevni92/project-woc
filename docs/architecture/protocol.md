# Transportneutraler Simulationsvertrag

Status. Protokoll v2 ist mit P1-001 implementiert. Worker und WebSocket verwenden denselben Vertrag.

## Client und Transport

`SimulationClient` bietet `connect`, `disconnect`, `sendCommand`, `requestSnapshot`, `subscribe`, `acquireCharacter`, `releaseCharacter`, `previewRoute` und `moveTo`. Aufrufe mit Ergebnis sind asynchron. Abonnenten erhalten Verbindungsstatus, Fehler und eine lesende Projektion. Beide Browseradapter implementieren `open`, `send` und `close` mit Empfangs- und Abbruchcallbacks und transportieren dieselben JSON-Zeichenketten. Jeder WebSocket und jeder MessagePort hat eine eigene Host-Verbindung. Erst `Hello` erzeugt eine logische Session für die Lebensdauer der Verbindung.

## Wire-Format v2

UTF-8-JSON mit einer Nachricht pro WebSocket-Textnachricht beziehungsweise Worker-Nachricht. Die Schemas definieren die Felder und Typen. Die gemeinsame Fixture enthält parallele Verbindungen, Befehle, Ticks und eine neue Session nach Disconnect. [Anfragen](../../protocol/client-v2.schema.json) · [Antworten](../../protocol/server-v2.schema.json) · [Vertragsfixture](../../protocol/fixtures/dual-runtime.json)

| Richtung | Nachrichten |
|---|---|
| Client → Host | `Hello`, `Command`, `RoutePreview`, `SnapshotRequest` |
| Host → Client | `Welcome`, `CommandResult`, `RoutePreviewResult`, `Snapshot`, `Delta`, `Error` |

Jede Anfrage enthält `protocolVersion: 2`, `type`, `requestId` und `payload`. IDs bestehen aus 1–64 ASCII-Zeichen aus `A–Z`, `a–z`, `0–9`, `_` und `-`. Die zulässigen Request-Felder sind abschließend. Der WebSocket-Adapter beendet die Verbindung bei binären Nachrichten oder Eingaben über 4.096 Bytes. Der Worker liefert bei zu großen Nachrichten `INVALID_MESSAGE`.

`Hello` und `SnapshotRequest` haben einen leeren Payload. `Welcome` liefert `sessionId`, `worldId`, `contentVersion` und die Fähigkeiten `CharacterControl`, `FootTravel` und `SnapshotDelta`. Der Browser prüft Welt-ID und Content-Version gegen seine Kartendatei und erwartet `FootTravel`. Auf `Welcome` folgt unmittelbar der initiale `Snapshot` ohne `requestId`. Ein explizit angeforderter Snapshot erhält die Request-ID.

Der Host weist inkompatible Versionen mit `UNSUPPORTED_VERSION` zurück. Bei einer v1-Anfrage verwendet er dafür das v1-Fehlerformat. v2 erfordert neue Projektionsfelder, erlaubt gebrochene Meterkoordinaten und ersetzt den Debugbefehl `TestAction` durch `MoveTo`. Die bisherigen v1-Schemas dokumentieren den Stand von P0-002.

## Steuerübernahme und Reisen

`Command` erwartet `action` und `characterId`. `MoveTo` benötigt zusätzlich `locationId`. Der Host prüft bei `AcquireCharacter` die Existenz, Übernehmbarkeit und exklusive Lease. Jede Session kann einen Charakter steuern. Ein erfolgreicher Wechsel gibt die alte Lease atomar frei. Ein abgelehnter Wechsel lässt sie bestehen. `ReleaseCharacter` und Disconnect lösen die Lease sofort. Position, Bargeld und eine laufende Reise bleiben im Host erhalten. Der Ambient-Passant ist grundsätzlich nicht übernehmbar.

Die lesende Anfrage `RoutePreview` akzeptiert `characterId` und `locationId` und setzt wie `MoveTo` die eigene Lease voraus. `RoutePreviewResult` enthält bei Erfolg die IDs, `positionRevision` und `route`. Die Route enthält geordnete `edgeIds`, x/z-`points` in Metern, `distanceMm` und `durationTicks`. Bei identischem Ausgangs- und Zielpunkt liefert die Vorschau einen Punkt und die Dauer null. `MoveTo` prüft Position, Rechte und Ziel erneut und berechnet die Route aus dem aktuellen Zustand.

Fachliche Ablehnungen erscheinen im jeweiligen Resultat mit `accepted: false` und `code`. Reiseziele können mit `LOCATION_NOT_FOUND`, `UNREACHABLE`, `ALREADY_TRAVELING` oder, bei `MoveTo` mit Distanz null, `ALREADY_AT_LOCATION` abgelehnt werden. `Error` enthält Protokollfehler und bei lesbarer ID die Request-ID. Jedes `CommandResult` enthält die Weltrevision zum ursprünglichen Ergebnis. Der Host speichert die letzten 64 Command-Ergebnisse pro Session. Dieselbe Request-ID mit denselben Argumenten liefert das gespeicherte Resultat ohne erneute Mutation. Andere Argumente unter einer noch gespeicherten ID ergeben `REQUEST_ID_REUSED`.

## Projektion und Synchronisierung

Jede Host-Nachricht hat eine pro Verbindung fortlaufende `streamSeq` und den aktuellen `worldTick`. Snapshot und Delta enthalten die Weltrevision, absolute Spielminuten und öffentliche Charakterübersichten. Eine Übersicht enthält ID, Name, Position in lokalen Metern, Übernehmbarkeit, Belegung und Status (`Idle`, `Traveling` oder `AtLocation`). Die private Projektion `controlled` enthält ID, Bargeld, `positionRevision`, den aktuellen Zugang als `locationId` und den aktiven Reiseplan als `travel`. Zugang und Reiseplan können `null` sein. Der Reiseplan enthält Ziel-ID, Starttick, Fortschritt in Millimetern, Restticks und dieselbe Routenstruktur wie die Vorschau. Geld wird als Ganzzahl in kleinster Währungseinheit übertragen. JSON-Zähler und Geld liegen im sicheren Ganzzahlbereich.

Snapshots ersetzen die Projektion vollständig. Deltas enthalten `baseRevision` und nur geänderte öffentliche Charakterübersichten. Die private Projektion wird mit jedem Delta vollständig ersetzt. Der Client wendet Deltas nur bei lückenloser `streamSeq` und passender Basis an. Bei Abweichungen behält er den letzten konsistenten Stand, fordert einmal pro laufender Wiederherstellung einen Snapshot an und ersetzt den Stand atomar. Die Routenvorschau gilt für dieselbe Session, denselben Snapshot, Ort, kontrollierten Charakter und dieselbe `positionRevision`. Ticks anderer Figuren machen eine Vorschau für eine stehende Figur nicht ungültig. Neue Verbindungen erhalten eine neue Session und einen frischen Snapshot. Ausstehende Anfragen schlagen bei Disconnect fehl. Ein Reconnect wiederholt keine mutierenden Commands.

## Spätere Erweiterungen

`SubscriptionUpdate`, `Ping`/`Pong`, `PublicEvent` und Berechtigungen nach Accounts bleiben Entwürfe. Version, Stream-Sequenz, Weltrevision, Positionsrevision und Tick haben getrennte Aufgaben. Die Lückenerkennung verwendet Stream-Sequenz und Basisrevision. [P1-001](../../tasks/P1-001-movement.md)
