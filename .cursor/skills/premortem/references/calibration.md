# Calibration — Measure Your Forecast Accuracy

## L -> Forecast Probability (Bandmittel)

| L (Likelihood) | Original Range | Forecast p |
|----------------|---------------|------------|
| 1              | <5%           | 0.025      |
| 2              | 5-20%         | 0.125      |
| 3              | 20-50%        | 0.35       |
| 4              | 50-80%        | 0.65       |
| 5              | >80%          | 0.90       |

WARNING: Bandmittel sind ordinal approximiert. L=4 kann 55% oder 75% bedeuten —
der Brier wird über Zeit zeigen, ob die Staffelung systematisch schießt,
und korrigiert damit die Annahme, auf der er selbst basiert.

## Brier Score

**Formula:** Brier = mean((p - o))
  - p = forecast probability (from table above)
  - o = outcome (1 if failure occurred, 0 if not)

**Interpretation:**
| Score | Meaning |
|-------|---------|
| 0.00  | Perfect calibration |
| 0.25  | Coin flip / constantly 0.5 |
| >0.25 | Anti-calibrated (worse than guessing) |

**Always report with n:** "Brier 0.18 over 12 resolved predictions -> better than chance."

**Systematic direction:** If predicted failures occur *more* often than p suggests -> you are *under*estimating risk. If they occur *less* often -> you are *over*estimating.

**n < 10:** "Too few data points, trend only."

## Self-Correction

If Brier drifts systematically to one side -> adjust the band means:
  - e.g. L=3: 0.35 -> 0.40
  - Note the change with date

This is the self-correcting loop: the metric that validates the skill also improves it.

---

## !pm check-log — Schema-Validierung ohne Dependency

**Problem:** log.jsonl hat kein festes Schema (Zero-Dep-Entscheidung). Der Agent schreibt über mehrere Läufe leicht abweichende Felder → !pm review parst irgendwann nicht mehr → Kalibrierung bricht *still*.

**Lösung ohne Python-Datei:** Der Kanon-Record in _dieser_ Datei (calibration.md) **ist** das Schema. !pm check-log validiert agent-native:

### Kanon-Record (verbindliches Schema)

Jede Zeile in log.jsonl MUSS diese Felder enthalten:

```json
{
  "session": "<uuid oder timestamp>",
  "plan": "<einzeilige Beschreibung>",
  "failures": [
    {
      "desc": "<Failure-Mode-Beschreibung>",
      "L": <1-5>,
      "I": <1-5>,
      "p": <0.0-1.0>
    }
  ],
  "commitment": "<Aktion bis Datum>",
  "status": "open",
  "occurred": null,
  "created": "<ISO-Datetime>"
}
```

**Erlaubte status-Werte:** open, done, missed, dropped
**Erlaubte occurred-Werte:** null, true, false
**p MUSS** dem L-Bandmittel aus der Tabelle oben entsprechen.

### Agent-native Prüfung (kein Python)

```
!pm check-log:
1. Lese log.jsonl.
2. Für jede Zeile: Prüfe ob alle Kanon-Felder existieren.
3. Prüfe status ∈ {open, done, missed, dropped}.
4. Prüfe occurred ∈ {null, true, false}.
5. Prüfe p == bandmittel(L).
6. Report: "N Zeilen geprüft, X valide, Y Abweichungen: [Liste]"
7. Bei ≤3 Abweichungen: automatisch reparieren (fehlende Felder setzen, Werte korrigieren).
8. Bei >3 Abweichungen: Abbruch mit "Schema-Drift > 3 Zeilen — manuelle Kalibrierung nötig."
```

Kein Python-Skript, kein import, kein pip. Der Agent prüft JSON gegen den Kanon nativ.
