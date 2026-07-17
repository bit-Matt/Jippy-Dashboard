# RECONSTRUCTED — v1.5.4 (from memory, no verifiable original)
> **⚠️ Spezifische Zahlen in dieser Datei (Credit-Limits, Rate-Limits, Reset-Muster, Free-Tier-Verhalten) sind unverifiziert und vor Gebrauch gegen aktuelle X-API-Docs zu prüfen.** Siehe CHANGELOG (v1.5.4) für die vollständige Verlustkette.

---

# X API Billing & Credit Cycles

## Credit Allocation & Reset

X API credits operate on a monthly cycle. The reset date cannot be queried programmatically — you must check the X Developer Console (developer.x.com → Project → Subscription).

### Typical Reset Patterns
| Plan | Monthly Credits | Typical Reset |
|------|----------------|---------------|
| Free | ~1,500 posts, limited reads | 1st of month or billing anniversary |
| Basic ($100/mo) | 10,000 posts, 100K reads | Billing anniversary date |
| Pro ($5,000/mo) | 300K posts, 1M reads | Billing anniversary date |

### Credit Reset Detection (Cron Sessions)

Since the API doesn't expose the reset date, use this heuristic:

1. **Save state:** When CreditsDepleted is first hit, note the date as a memory entry.
2. **On each subsequent run:** Try ONE cheap read-only operation (`xurl /2/users/me --auth oauth2`). If it succeeds, credits have reset — proceed with engagement. If it fails with CreditsDepleted, abort silently.
3. **Expected window:** Assuming a monthly cycle starting from depletion, retry from day 25-31 after the depletion date.

## CreditsDepleted Error Pattern

**Full error:**
```json
{
  "account_id": 2056915467785113600,
  "title": "CreditsDepleted",
  "detail": "Your enrolled account [ACCOUNT_ID] does not have any credits to fulfill this request.",
  "type": "https://api.twitter.com/2/problems/credits"
}
```

**Signal:** Same error on ALL operations — reads AND writes. If `/2/users/me` fails with this, there is no partial credit available for any operation.

**Wasted-credit trap:** A single test post (`xurl post "test"`) may succeed while everything around it fails. This is the last credit being consumed. **Never run a test post without first checking a read-only endpoint.** A test post that succeeds is NOT evidence that the rest of the session will work — it may be burning the final credit.

## Distinguishing CreditsDepleted from Other 403s

| Error | Read ops work? | Write ops work? | Self-post works? | Fix |
|-------|---------------|----------------|-----------------|-----|
| CreditsDepleted | No (even `/2/users/me` fails) | No | No (but last credit may make it appear so) | Add credits in Console |
| Scope issue (missing tweet.write) | Yes | No (403 Forbidden) | Often no | Re-auth with Read+Write scope |
| Free tier (third-party block) | Yes (search works) | Self: yes; Third-party: 403 "not been mentioned" | Yes | Upgrade to Basic |
| Content moderation filter | Yes | 403 "not permitted" on specific content | Partial (depends on content) | Rephrase, shorten, split |
