# Commitment Mechanism — Aus Analyse wird Handlung

> Ein Premortem ohne Commitment ist Unterhaltung. Die Analyse war der einfache Teil. Jetzt kommt der Teil, der tatsächlich verhindert, dass der Plan stirbt.

---

## Das Prinzip

Am Ende JEDES Full Premortems steht EINE konkrete Handlung mit Datum. Nicht "ich sollte mal...", nicht "vielleicht...", nicht "in Zukunft...". Sondern: Wer macht was bis wann?

---

## Commitment-Format

```
[Spezifische Aktion] durch [Person] bis [Datum]
```

### RICHTIG ✅

- "Integration-Tests für den Payment-Flow schreiben, merge bis Donnerstag 18:00"
- "Timeline mit Tech-Lead reviewen, Entscheidung ob 2 oder 4 Wochen bis Freitag Mittag"
- "Preis bei 10 Test-Usern mit $47 validieren, Ergebnisse bis nächsten Dienstag"
- "Dry-run der Migration auf Staging, 3x erfolgreich bevor Production"

### FALSCH ❌

- "Tests schreiben" (kein Datum, kein Scope)
- "Mehr testen" (was heißt mehr?)
- "Timeline überdenken" (keine Aktion, kein Outcome)
- "Mit Team besprechen" (kein Datum, kein Entscheidungskriterium)

---

## Commitment-Typen

| Typ | Beispiel | Wann |
|-----|----------|------|
| **Verify** | Annahme X mit Daten validieren | Wenn ein Failure auf ungeprüfter Annahme basiert |
| **Build** | Etwas bauen, das den Failure verhindert | Wenn der Failure technisch verhinderbar ist |
| **Decide** | Go/No-Go-Entscheidung mit Kriterien | Wenn der Failure eine strategische Frage ist |
| **De-risk** | Risiko reduzieren (z.B. Dry-run, Staging-Test) | Wenn der Failure nicht eliminierbar, aber reduzierbar ist |

---

## Der Commitment-Flow

1. **Top-Failure identifizieren** (höchstes L×I aus der Matrix)
2. **Commitment-Typ wählen** (Verify / Build / Decide / De-risk)
3. **Commitment ausformulieren** (Aktion + Person + Datum)
4. **Commitment im Output zeigen**

---

## Output-Format

```
## Commitment
→ [Commitment-Typ]: [Aktion] bis [Datum]

Warum: [1 Satz — welcher Failure Mode wird dadurch adressiert]
```

Beispiel:

```
## Commitment
→ VERIFY: Payment-Flow mit 10 Test-Usern à $47 validieren bis Freitag 18:00

Warum: Failure Mode #1 (Preisakzeptanz) basiert auf Annahme, dass $47 zu billig wirkt. 
Diese Annahme ist unvalidiert. Bevor wir den Preis ändern, testen wir.
```

---

## Commitment-Eskalation

Wenn ein Failure Mode L×I ≥ 15 (🔴):

1. **Nicht fortfahren** ohne Commitment
2. **Commitment MUSS verifizierbar sein** (nicht "besprechen")
3. **Commitment MUSS ein Datum haben** < 1 Woche

Wenn der User das Commitment ablehnt:
- Dokumentieren: "User lehnt Mitigation für 🔴-Risiko ab. Entscheidung bewusst getroffen."
- Nicht diskutieren. Der Premortem berät, entscheidet nicht.

---

## Follow-up: Was passiert nach dem Commitment?

Ein Commitment ist kein Vertrag — es ist ein **Trigger für die nächste Session**.

| Status | Bedeutung | Nächster Schritt |
|--------|-----------|------------------|
| ✅ Erledigt | Commitment umgesetzt | Failure Mode ist mitigiert. Weiter mit nächstem 🔴/🟠. |
| ⏳ Verfallen | Datum überschritten, nichts passiert | Commitment ist ungültig. Neu bewerten: Ist der Failure Mode noch real? |
| 🔄 Verschoben | Neues Datum gesetzt | Akzeptabel — aber max 1x verschieben. Beim 2. Mal = ❌ Verfallen. |
| ❌ Abgelehnt | User lehnt Mitigation ab | Dokumentieren. Kein Diskutieren. Der Preis wird später gezahlt. |

**Wenn ein Commitment verfällt:** Der Failure Mode wird NICHT automatisch gestrichen. Er bleibt auf der Risikoliste. Der Premortem-Frame war: "Stell dir vor, es ist 6 Monate später und gescheitert." Ein verfallenes Commitment ist Teil dieser Geschichte.

**Empfehlung:** Füge das Commitment als Task/Todo im aktuellen Project Management Tool hinzu. Wenn du in Claude Code arbeitest: `//todo "Integration-Tests schreiben"` als Reminder.

---

## Drei-Fristen-Protokoll (Commit-or-Crash)

In git ist der Commit reversibel (amend / reset / revert). Die echte Irreversibilität liegt **vor** dem Commit:

| Frist | Window | Was passiert wenns reißt | Commitments-Typ |
|-------|--------|--------------------------|-----------------|
| **Frist 1: Working Tree** | BEVOR die nächste Änderung den Original-Text überschreibt | Das Original ist unwiederbringlich verloren. Rekonstruktion nur aus Gedächtnis (~90%) möglich. | **SICHERN:** Tag, Vorgänger-Commit, Reflog, Editor-Buffer. Wenn nur im Buffer: sofort rauskopieren. |
| **Frist 2: Commit** | Nach dem Re-Run des Premortems auf dem *gefixten* Zustand (Repair-Bias-Protokoll) | Ein gefundener Fix depletiert das Vigilanz-Budget. Der Commit enthält ungeprüfte Artefakte. | **PRÜFEN:** !pm full auf dem aktuellen Working-Tree-Zustand. Alle Dateien scannen, nicht nur die gefixte. |
| **Frist 3: Push** | Vor dem Remote-Push | Der Commit ist public. Revert möglich, aber History ist sichtbar. | **FINALISIEREN:** README-Sync, Changelog, letzter Scan. |

### Protokoll bei verlorenem Original

Wenn das Original (z.B. Playbook-Text, Extraktion) nicht mehr recoverbar ist — und Recovery-Versuch über alle Oberflächen (reflog, Tags, Stash, Editor-Backups) gescheitert:

1. **Marker flaggt Zahlen, nicht die Datei.** Kein generisches "approximation"-Label — das lässt die Tacticals intakt. Schreibe:

   ```
   # RECONSTRUCTED — vX.Y.Z (from memory, no verifiable original)
   > ⚠️ Spezifische Zahlen (Rate-Limits, Cadences, Free-Tier-Verhalten,
     Credit-Limits) sind unverifiziert und vor Gebrauch gegen aktuelle
     [Quelle]-Docs zu prüfen.
   ```

   Das Gefährliche an rekonstruierten Playbooks sind die *konkreten* Claims — genau danach handelt jemand.

2. **Changelog-Eintrag** mit:
   - "reconstructed from memory, not verbatim"
   - Recovery-Versuch-Dokumentation (welche Oberflächen durchsucht, alle gescheitert)
   - Lektion in einem Satz: "Der Verlust kam nicht von Gedächtnis, sondern von einem destruktiven Edit auf einer einzigen un-committeten Working-Tree-Kopie. Prävention: commit vor destruktiven Moves."

3. **Issue reframen.** Nicht "Original aus git history extrahieren" — das ist Recovery, und der Versuch ist schon gescheitert. Sondern: **Re-Validierung gegen externe Quellen.** Die Arbeit ist, die Zahlen aus aktuellen API-Docs / ersten Prinzipien neu herzuleiten, nicht aus Erinnerung an eine verlorene Datei.

4. **README-Warnhinweis** muss ALLE betroffenen Dateien in EINEM Banner abdecken (nicht nur die zuletzt gefixte). Nicht:
   ```
   > ⚠️ distribution.md ist RECONSTRUCTED.
   ```
   Sondern:
   ```
   > ⚠️ distribution.md und x-api-billing.md sind RECONSTRUCTED (vX.Y.Z).
   ```

5. **Trotzdem committen** — der rekonstruierte Zustand ist besser als kein Zustand, aber die Transparenz muss in den Commit, nicht in ein "oops"-Commit danach.

6. **Repair-Bias-Protokoll auslösen:** Der Fix auf einer Datei (z.B. distribution.md-Marker) hat denselben Defekt in einer anderen Datei (x-api-billing.md) verdeckt. Nach jedem RECONSTRUCTED-Fix: Scan auf *allen* un-committeten Dateien, ob derselbe Marker-Typ fehlt.

### Commit-Granularität: Move vs. Behavior

Ein Commit-Problem ist nicht die Anzahl Dateien, sondern die **logischen Domänen** die gemischt werden:

- **Move-Commits** (atomar): Löschen + Neuanlegen + Pointer = ein Commit. Dangling-Zustände sind nicht erlaubt (einen gelöschten Pointer auf eine noch nicht existierende Datei).
- **Behavior-Commits** (Verhalten): Neue Subsysteme, Scoring-Refinements, Base-Rates-Updates. Können mehrere Dateien in derselben logischen Domäne sein.
- **Verboten:** Move + Behavior im selben Commit. Du kannst nicht revertieren, ohne die Struktur mitzunehmen.

Faustregel: "Lösche ich eine Datei und lege eine neue an die ihre Stelle tritt?" → Move-Commit.
"Ändere ich Algorithmen, Scores, Metriken oder Logik?" → Behavior-Commit.
