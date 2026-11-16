# Änderungen / Changelog

## 5.1 / Bridge 2.1 – English interface
- Sprachumschalter Deutsch/Englisch (⚙ → Ansicht → Sprache, Standard nach Browser) – Language switch German/English (⚙ → View → Language, default from the browser).
- Übersetzt werden alle sichtbaren Texte, Tooltips und Diagrammbeschriftungen; Aufträge an Claude und die Systemanweisung der Bridge folgen der Sprache – All visible text, tooltips and diagram labels are translated; requests to Claude and the bridge's system prompt follow the language.
- README und Dokumentation auf Englisch (`README.md`, `docs/DOCUMENTATION.md`), deutsche Fassung in `README.de.md` und `docs/DOKUMENTATION.md`.

## 5.0 – Einfache Ansicht und neues Erscheinungsbild
- Start in der einfachen Ansicht: nur Chat und Diagramm; **Erweitert** blendet Struktur, Details, Konsole, Plan, Team und Verbindungen ein.
- Einstellungsdialog (⚙ oder `Strg+,`): Ansicht, Farbschema, Akzentfarbe, KI, Automatik, Projekt, Tastatur.
- Neues Erscheinungsbild: ruhiger Rahmen, schwebende Flächen, Chat mit Sprechblasen, neues Logo.

## 4.0 / Bridge 2.0 – Planvoll vibecoden
- MCP-Werkzeuge für Claude: `atlas_orient`, `atlas_find`, `atlas_read`, `atlas_trace`, `atlas_impact`, `atlas_rules`.
- Wirkungsbereich mit betroffenen Tests; Tests nach einem Auftrag nur dort, wo nötig.
- Pipeline Idee → Spezifikation → Plan → Aufgaben → Umsetzen.
- Qualitätstor über den Stop-Hook (Tests, Build, Regeln).
- Team: parallele Agenten in Git-Worktrees mit Konflikterkennung und Zusammenführen.
- Analyse: Kosten je Auftrag/Datei, Brennpunkte aus Git, toter Code, Architekturregeln und Zyklen, Architekturkarte für `CLAUDE.md`.
- Aufträge abspielen, Commit pro Auftrag.

## 3.x – Vibecoding mit Claude Code
- Live-Ansicht der KI im Diagramm mit Kamera, Bild-im-Bild für entfernte Stellen.
- Freigaben, Kontrollpunkte, Änderungsebene auf Ebene von Bausteinen, Funktionen und Verbindungen.
- Ausführen mit Live-Trace, Haltepunkten und Zeitlupe; Tests im Atlas mit Fehlerort und Abdeckung.
- Projekt über die Bridge wechseln, Mitlesen von Claude Code im Terminal über Hooks.
- Leistung für große Projekte (Tausende Klassen).
