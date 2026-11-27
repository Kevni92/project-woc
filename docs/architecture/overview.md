# Technische Architektur
Status: ENTWURF für Bibliotheken und Zuschnitt; TypeScript/Three.js/HTML/CSS sind VORGABE.

## Stack
TypeScript strict, Vite SPA, Svelte 5 (kein SvelteKit für P0), Three.js direkt im Canvas, CSS Custom Properties, mitt als typisierte Publish/Subscribe-Bibliothek, Vitest, Playwright. IndexedDB für versionierte lokale Spielstände ab P2, keine Backendpflicht. Keine konkreten Versionspins vor Setup; kompatible stabile Versionen mit Lockfile fixieren. Quellen: https://svelte.dev/docs/svelte/overview, https://svelte.dev/docs/svelte/typescript, https://threejs.org/docs/pages/OrthographicCamera.html, https://github.com/developit/mitt.

## Vorgeschlagener Quellbaum (noch nicht implementiert)
- src/game/core/: Game, GameState, Clock, CommandDispatcher, EventBus, Scheduler, RNG
- src/game/world/: Kartenmodell, Orte, Wegegraph, Routing
- src/game/systems/: Movement, NPC, Inventory, Economy, Missions, Ownership
- src/game/content/: statische Definitionen und Testwelt
- src/render/: Three.js-Karte, Kamera, Layer, Marker, Picking
- src/ui/: Svelte-Komponenten, Panels, lesende ViewModels, Styles
- src/adapters/: LocalGameGateway, SaveRepository und Browser-Adapter
- tests/: unit, integration, e2e
Nur Verzeichnisse anlegen, wenn sie für einen Task benötigt werden.

## Domänenmodell
Einfache Entity-ID + typisierte Daten/Komponenten und Systeme (ECS-inspiriert, kein vollwertiges ECS-Framework). Entitäten sind Daten, Systeme enthalten Regeln. Ein GameState als autoritative Quelle. Datenstrukturen serialisierbar; Definitionen unveränderlich, Instanzzustand getrennt. Keine DOM-/Three.js-/Svelte-Imports in game/. Keine Vererbungshierarchien für alle Spielobjekte.
Game besitzt Tick/Command-Queue, Systeme werden in dokumentierter Reihenfolge aufgerufen. Zeit und RNG injizieren; kein Date.now/Math.random in Regeln. Systeme greifen über definierte Zustandsoperationen zu; UI erhält read-only Snapshots/ViewModels, keine mutierbaren Referenzen.

## Ereignisse und Befehle
Command = Absicht (MoveTo, BuyItem, AcceptMission); validieren und als Result akzeptieren/ablehnen. Event = bereits eingetretene Tatsache (MovementStarted, EntityArrived, LocationClosed, ItemPurchased, MissionCompleted, DayChanged).
Ein Command mutiert Zustand nur im Simulationskern; Events werden anschließend aus einer geordneten Queue veröffentlicht. mitt ist der Verteilmechanismus, nicht die Simulationslogik. Reaktionen anderer Systeme werden als geplante Arbeit/Befehle in kontrollierter Reihenfolge ausgeführt, keine rekursiven Änderungen über Listener. Payloads: IDs, Spielzeit, fachliche Daten; keine Objekt-/Mesh-Referenzen. Abmeldbare Listener, kein globaler Singleton.
Beispiel: EntityArrived → MissionSystem prüft Ziel → erzeugt Missionsfortschritt → MissionUpdated → UI aktualisiert Textpanel. Renderer liest Positionen pro Frame; keine Event-Flut pro Pixel. Event-Log optional für Debugging, kein vollständiges Event Sourcing.

## Datenfluss
UI/Map input → GameGateway → CommandDispatcher → Systems/GameState → DomainEvents → ViewModels/Renderer.
Tick und Renderloop getrennt. Renderloop interpoliert, darf Spielzustand nicht ändern. OrthographicCamera und extrudierte Polygone; Instancing erst bei Messbedarf. CSS-Design-Tokens für Palette, Schrift, Abstände; UI außerhalb Canvas für Zugänglichkeit.

## Persistenz und Multiplayer-Vorbereitung
SaveRepository: load/save/delete; SchemaVersion, Weltdefinitionsversion, Clock, RNG, Entities, laufende Aktionen und Scheduler-Zustand. Fehler explizit behandeln. Save/Load reproduzierbar; Migrationen sobald Format sich ändert.
GameGateway zunächst lokal; später ServerGateway mit Commands, Snapshots/Deltas und serverautoritativer Validierung. Keine Client-Autorität im Multiplayer. Eigene Game-Module ohne Browserabhängigkeiten ermöglichen spätere Node-Ausführung. Kein Netcode, Accounts, Synchronisationsprotokoll oder Anti-Cheat im MVP; Multiplayer-Modell bleibt offene Produktentscheidung.
