# CHANGELOG

## v1.5.4 — 31. Mai 2026

**Änderungen:**
- Distribution Playbook: aus SKILL.md extrahiert → `references/distribution.md` (RECONSTRUCTED-Marker)
- x-api-billing.md: neu, RECONSTRUCTED-Marker
- README: Struktur updated + Warnhinweis beide reconstructed-Dateien
- CHANGELOG: aus SKILL.md nach CHANGELOG.md extrahiert (Context-Bloat-Prävention)

**Verlust:**
Distribution-Playbook-Text wurde vor dem ersten Commit aus dem Working Tree gelöscht und aus dem Gedächtnis rekonstruiert. Recovery-Versuch (git reflog, Tags, Stash, Editor-Backups) über alle Oberflächen gescheitert. Die Rekonstruktion ist ab v1.5.4 die de-facto-Quelle.

**Offen:**
- **[v1.5.5] Re-Validierung distribution.md & x-api-billing.md.** Keine Recovery — das Original existiert nicht und ist über alle Oberflächen gesucht. Die Arbeit ist: Distribution-Taktiken + X-API-Zahlen aus aktuellen X-API-Docs / ersten Prinzipien neu herleiten. Betroffene Claims: Free-Tier-Limits, Reply-Thread-Cadences, Quote-Tweet-403-Verhalten, 14:00/18:00 UTC-Fenster, 5-post/week-Cadence, Credit-Limits, Reset-Muster. Ergebnis: Zahlen bestätigen oder korrigieren → Dateien updaten → CHANGELOG-Eintrag.

**Lektion (gelernt, geschlossen):**
> Der Verlust kam nicht von „Gedächtnis ist fehlbar", sondern von einem destruktiven Edit auf einer einzigen un-committeten Working-Tree-Kopie. Die Prävention: commit **vor** destruktiven Moves. Dieser Commit verkörpert genau das.
