# RECONSTRUCTED — v1.5.4 (from memory, no verifiable original)
> **⚠️ Spezifische Zahlen in dieser Datei (Rate-Limits, Cadences, Free-Tier-Verhalten, Zeitfenster) sind unverifiziert und vor Gebrauch gegen aktuelle X-API-Docs zu prüfen.** Der Originaltext existiert nicht mehr — er wurde vor dem ersten Commit aus dem Working Tree gelöscht. Siehe CHANGELOG (v1.5.4) für die vollständige Verlustkette.

---

## Distribution Playbook

When a premortem identifies **distribution as the bottleneck (not build)** — use this playbook for concrete execution steps.

---

### 5. Distribution Playbook (Post-Death Sentence)

When the premortem identifies **distribution as the bottleneck (not build)**, the Commitment alone is not enough — the agent needs a concrete playbook. The DE-FENCE pattern says "do distribution, not build" but doesn't say HOW.

Use this playbook when:
- The premortem produces a Commitment like "publish a dev.to article" or "post on X"
- One of your failure modes is "Building statt Distributing" (LxI >= 12)
- The tool works but has 0 users after 3+ months

**Step 1: Platform Selection**

Choose platforms where your target audience actually hangs out. Start with 1-2, not all:

- **X/Twitter** — Dev audience, build-in-public. Low organic reach without hashtags + engagement.
- **dev.to** — Technical deep dives. Medium reach driven by tags.
- **Reddit** — Niche communities. High reach but strict community rules.
- **LinkedIn** — B2B / professional. Medium reach, algorithm rewards engagement.
- **Hacker News** — Launch announcements. High reach but very competitive.

**Step 2: Content Rotation**

For sustained social presence, rotate across 3-4 content pillars:

- **Theory/Insight** — Kahneman quotes, cognitive biases, decision-making science
- **Real-World** — Anonymous case studies, failures prevented, lessons learned
- **How-To/Tips** — Quick workflows, tool integrations, actionable advice
- **Build-in-Progress** — Metrics, learnings, updates (sparingly — 1x/month max)

**Step 3: Cadence**

- **5 posts/week** minimum (Mon-Fri). 3/week is floor for survival; 5+/week is floor for growth. Less and the algorithm ignores you.
- **2 engagement sessions/day** staggered — one for EU afternoon (14:00 UTC), one for US afternoon (18:00 UTC). Single daily session misses half your audience.
- **1 thread/week** — X algorithm favors threads 3-5x over single tweets. A 4-6 tweet thread is the X-native deep-dive format. Best day: Monday (high engagement patterns). **Free tier note:** Threads (root + self-replies) work on Free tier. Use this as your primary format when third-party interaction is unavailable. **Pitfall:** chain-reply too fast (>3 in <30s) and you may hit a "not permitted" moderation filter — space replies 60s apart or split into standalone posts.
- **1 deep-dive/month** (article, long tutorial, case study) — the asset that drives signups.
- **Quote-tweet 1 relevant post/week** — rides existing conversations for discovery. **Free tier note:** Quote-tweets to third-party posts 403. Replace with 1 additional original thread or standalone post when on Free tier.

**Step 4: Automation (X/Twitter)**

**Pre-flight check (run before every engagement session):** Verify the xurl OAuth token has write scope AND credit availability. See the xurl skill for credit cycle detection and error diagnosis.

**Step 1 — Check X API credit availability first.** Run whoami — this confirms auth but is a free endpoint. A working whoami does NOT confirm credit availability. For a reliable credit check, run a search (a paid read endpoint). If that fails with CreditsDepleted, STOP immediately — all paid operations are blocked. Report the block and recommend checking Developer Console for the reset date.

**Step 2 — Verify scope.** Run auth status, check scope. If scope is None: run a small test post. If test post succeeds but quote-tweets and third-party replies 403, the account is on Free tier. Upgrade to Basic ($100/mo) for those features.

Use `hermes cron` with prompt-based jobs to auto-post. Each job needs: (1) what to generate, (2) how to post via xurl post in terminal tool, (3) anti-repetition guard (vary angles weekly).

**Thread pattern (Monday):** Post first tweet, chain subsequent tweets with reply to ROOT_ID. 4-6 tweets, 260 chars each, 1-2 hashtags. Topics: Kahneman backstory, base rates, 5 biases, case study, comparison, walkthrough. Rotate weekly.

**Pitfall — bash multiline:** Use printf for reliability when chaining replies: xurl reply ROOT_ID "$(printf 'Tweet text here')". Literal bash newlines cause the second line to execute as a separate command.

**Engagement pattern (daily x2):** 14:00 UTC (EU) + 18:00 UTC (US). Run searches for keyword groups: project failure, cognitive bias, decision fatigue, overconfidence, software estimation. Like 3, reply to 2 with genuine value. Evening session uses different searches (premortem, analysis paralysis, lessons learned). No generic replies ever.

**Topic rotation (Tue/Thu/Fri):** Tue = Kahneman/Tversky research, base rate neglect. Thu = project failure stories. Fri = quick decision frameworks, actionable advice.

**Step 5: Engagement Loop**

Promotion without engagement is shouting into the void.

1. Run 2 engagement sessions/day at staggered times — 14:00 UTC (EU) + 18:00 UTC (US/Americas).
2. Search keyword groups for each session:
   - Session 1: project failure, cognitive bias, decision making, overconfidence, software estimation
   - Session 2: premortem, prospective hindsight, decision fatigue, analysis paralysis, project postmortem
3. Like 3 posts per session, reply to 2 with actual value. NO "Great post!" replies.
4. Skip self-promotional posts and obvious bots.

**Free Tier Fallback:** When replies and quote-tweets to third-party posts 403:
1. Likes only — Like 5-7 posts per session instead of 3
2. Original content thread — Post 1 thread per session (4-6 tweets)
3. Standalone posts — Supplement with 1-2 original posts
4. No wasted attempts — Skip reply/quote steps entirely once Free tier is confirmed
5. Track the constraint in the session report
6. Periodically retest a single reply attempt in case of tier upgrade

**Step 6: Profile Optimization**

Before any promotion push:
- Bio — what the tool does + what problem it solves + link
- Pinned tweet — the best piece of content
- Profile image/banner — recognizable, not default

These are manual (X.com settings, not API-settable for most accounts).

**Step 7: Measure & Iterate**

After 2 weeks of consistent posting: check impressions per post. If < 100, more hashtags + reply to bigger accounts. If > 500 but 0 link clicks, improve the CTA. If any post got 1000+, double down on that angle. This is a LOOP, not a one-shot.

