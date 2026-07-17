# L/I Scoring — Likelihood × Impact Matrix

> Qualitative "könnte passieren" reicht nicht. Jeder Failure Mode braucht ein quantitatives L × I Score. Sonst werden seltene Katastrophen und häufige Kleinigkeiten gleich behandelt.

---

## Scoring-Anker

### Likelihood (L) — Wie wahrscheinlich ist dieser Failure?

| Score | Label | Heuristik | Beispiel |
|-------|-------|-----------|----------|
| 1 | Rare | <5% Chance | Externer API-Ausfall am selben Tag wie dein Launch |
| 2 | Unlikely | 5-20% Chance | Spezifische Race Condition in einer selten genutzten Code-Path |
| 3 | Possible | 20-50% Chance | Migration bricht bei Edge-Case-Daten (15% der User) |
| 4 | Likely | 50-80% Chance | Timeline unterschätzt (Base Rate: 70% der Projekte) |
| 5 | Near-Certain | >80% Chance | Keine Tests → Bugs in Production |

**Entscheidungshilfe:** Wenn du "könnte passieren" denkst → mindestens 3. Wenn du "passiert safe" denkst → 5.

### Impact (I) — Wenn es passiert, wie schlimm?

| Score | Label | Konsequenz |
|-------|-------|-----------|
| 1 | Negligible | Kosmetischer Bug. Niemand beschwert sich. |
| 2 | Minor | Etwas Nacharbeit. Kein User-Impact. Behebbar in <1 Tag. |
| 3 | Moderate | User sehen es. Verzögerung um Tage. Reputations-Dämpfer. |
| 4 | Major | Signifikanter Datenverlust/Revenue-Verlust. Behebung braucht >1 Woche. |
| 5 | Catastrophic | Projekt-Tod. Unwiederbringlicher Datenverlust. Rechtliche Konsequenzen. |

---

## Decision Rules — ordinale Heuristik, KEIN cardinales Mass

WARNING: LxI ist Sortier-Heuristik, nicht objektiver Score. Ordinal x ordinal ist
mathematisch nicht vergleichbar (Cox, "What's Wrong with Risk Matrices?", 2008).
Deshalb wird PRIMAR pro Dimension gescreent, das Produkt nur als Tiebreak-Sortierung:

1. **I=5 -> ROT immer** — aber die AKTION hangt von L ab:
   - I=5 & L>=3 -> **Pravention:** Eintrittspfad mitigieren. Hoch + wahrscheinlich = Plan andern.
   - I=5 & L<=2 -> **"insurable tail":** Eintritt kaum senkbar -> Schadensbegrenzung bauen
     (Rollback / Backup / Kill-Switch / Circuit-Breaker)
     ODER strukturelle Verwundbarkeit bewusst akzeptieren UND dokumentieren.
   Verbotener Default: I=5 ignorieren, weil L niedrig ist.

2. **L=5 -> mindestens ORANGE**, egal welches I.

3. **Sonst nach LxI sortieren** — als grobe Triage-Reihenfolge.

### LxI Matrix (Nur Triage-Reihenfolge, NICHT als objektiver Score behandeln)

```
          IMPACT ->
          1    2    3    4    5
L  1     1    2    3    4    5
I  2     2    4    6    8   10
K  3     3    6    9   12   15
E  4     4    8   12   16   20
L  5     5   10   15   20   25
↓
```

### Triage-Bander (keine harten Grenzen)

| LxI | Triage | Aktion |
|-----|--------|--------|
| 1-4 | Grun | Akzeptieren. Keine aktive Mitigation notig. |
| 5-8 | Gelb | Monitoring. Early Warning Signs definieren. |
| 9-12 | Orange | Mitigation erforderlich. Konkrete Aktion vor Deadline. |
| 15-25 | Rot | Mitigation dringend — ABER siehe Decision Rules oben: I=5 und L=5 haben Vorrang. |

---

## Output-Format

```
## Risk Matrix
| # | Failure | L | I | L×I | Zone | Mitigation |
|---|--------|---|---|-----|------|------------|
| 1 | Auth migration takes 3x estimate | 4 | 4 | 16 | 🔴 | Write migration script + dry-run first |
| 2 | Session tokens invalidated | 3 | 3 | 9 | 🟠 | Dual-write tokens during migration |
| 3 | DB rollback fails | 2 | 5 | 10 | 🟠 | Test rollback on staging 3x |
| 4 | Old API clients can't auth | 2 | 3 | 6 | 🟡 | Deprecation notice + grace period |
```

---

## Regeln

1. **Jeder Failure Mode kriegt L UND I.** Keine Ausnahmen.
2. **I=5 prafen — Prevention oder Insurable Tail?** (Siehe Decision Rules oben.)
3. **Kalibriere L mit Base Rates:** Wenn die Base Rate 70% sagt -> L = 4, nicht 2.
4. **Kalibriere I mit worst case, nicht best case:** "Konnte schlimm sein" -> 4, nicht 2.
5. **Zwei ROT = STOP.** Bei zwei roten Eintragen: Plan grundlegend uberdenken.

### Tie-Break: Zwei Failure Modes mit gleichem L×I? (Nur relevant wenn beide nicht I=5 oder L=5 haben)

| Situation | Tie-Break |
|-----------|-----------|
| Gleiches L×I, unterschiedliches L | **Höheres L gewinnt** — der wahrscheinlichere Failure wird zuerst behandelt |
| Gleiches L×I, gleiches L | **Höheres I gewinnt** — der gefährlichere hat Vorrang |
| Alles gleich | **Reversibilität:** Der schwerer umkehrbare zuerst |

**Beispiel:**

| Failure | L | I | L×I | Tie-Break |
|---------|---|---|-----|-----------|
| Projekt braucht 3x länger | 4 | 3 | 12 | 🔸 Höhere L (4 > 3) → #1 |
| Datenverlust bei Migration | 3 | 4 | 12 | #2 |

→ Zuerst das Timeline-Risiko adressieren (es passiert wahrscheinlicher), dann Datenverlust absichern.
