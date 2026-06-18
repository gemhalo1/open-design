# AMR latency: session reuse + prompt-cache efficiency

Design doc (human/reviewer-facing). Implementation runbooks per slice are written separately at build time.

Status: proposed · Parent: #3408 · Sibling: agent-startup-latency-profiling.md (#4504) · Spec format: spec-battle

## Why · Why this matters

- **Use case**: While taking over the performance thread for #3408, strict profiling found the real major contributor to AMR first token latency of ~11s per turn, and both the root cause and implementation target are now clear.
- **Pain**: ① Latency — AMR follow-up TTFT p50 ~11s, so users wait ~11s after every message; ② Cost/stability — AMR repays 100-153k input tokens every turn, directly burning AMR Cloud balance, and `insufficient_balance` is AMR's largest failure bucket (7,053/week, #4455 is addressing it). **This performance optimization is also a stability optimization**.

## Sources · Verified facts (checked item by item in this session)

- **Repo / checkout**: `nexu-io/open-design` (main) + local vela repo `~/Documents/vela` (HEAD `fe8266e`).
  - `gh repo clone nexu-io/open-design && git checkout main`; vela is already local.
- **vela side (root cause, verified)**: `~/Documents/vela/apps/cli/internal/agent/acp_runtime.go`
  - `:248` `"loadSession": false` — vela reports that loading/resuming sessions is unsupported.
  - In `newSession`, `if runtime.sessionID != "" { return ... "only one ACP session is supported" }` — only one session per process.
  - `handleRequest` switch only handles `initialize / session/new / session/set_model / session/prompt` — **no `session/load`**, default→"Method not found".
- **open-design daemon side (verified)**:
  - `apps/daemon/src/server.ts:7670` — `composed` = `# Instructions{volatile system block}` + `# User request{flattened transcript}`; `prompts/system.ts:632` BASE_SYSTEM_PROMPT comes first, while `:637` memoryBody and other volatile blocks come later.
  - `apps/web/src/providers/daemon.ts:222` — `buildDaemonTranscript` flattens history into a content-only markdown blob every turn, dropping thinking/tool_use/tool_result.
  - `apps/daemon/src/runtimes/defs/amr.ts` (`acp-json-rpc`, no `resumesSessionViaCli`) → `server.ts:7578` `agentSupportsSessionResume=false` → `skipTranscript:false` → **AMR resends flattened history every turn**. (Contrast with claude.ts `resumesSessionViaCli:true` → already resumes.)
  - `apps/daemon/src/runtimes/mcp.ts:13-22` — MCP injected by the daemon: AMR(mature-acp)+1 live-artifacts; claude uses user external MCP.
- **Data sources**: PostHog project **OpenDesign=420348** (`run_finished`, requires `phx_` key); Langfuse `us.cloud.langfuse.com` (trace_id==run.id). Queries are in the Reproduction section.
- **Access prerequisites**: PostHog personal key to rerun; vela changes require the local vela repo (already available).

## Measured data baseline (real production client + local daemon)

- AMR TTFT: turn-1 p50 ~11.7s, turn-2+ p50 ~10.9-11.1s (about ~90% of runs); hit vs miss 10.9s vs 13.3s.
- **Uncached input per turn (main contributor)**: AMR turn-1 ~100.7k, turn-2+ ~153.2k (claude 91k/126k). First-turn total input ~281k (claude ~629k) — Open Design front-loads system + tools + DS + skill + discovery.
- Cache efficiency: AMR ~73% (hit reads 392k / still repays 143k); claude ~93%.
- Real local daemon claude (minimal turn) breakdown: setup 1.67s + model first byte 3.14s (claude self-reports `[API:timing] first byte 3140ms`).
- Ruled out: bun install is not in user TTFT (shipped opencode is self-contained, measured); process cold start is not the main contributor.

## Goals / Non-goals

- **Goals**: Cut the 100-153k uncached input AMR repays every turn down to "only the new content for this turn", reducing TTFT + token cost.
- **Non-goals**: claude (already resumes); provider-side first-token floor (~3s, network hops + model itself); opencode direct 31s anomaly (separate investigation).

## Root cause

AMR repays 100-153k uncached tokens every turn because it feeds "history the model already processed in the previous turn, byte-for-byte identical" again and recomputes it. Root causes:
1. **vela does not support session reuse** (`loadSession:false` + single session + no `session/load`) → every turn starts from `session/new`;
2. **daemon flattens history into a new user message every turn** (`buildDaemonTranscript`) → prefixes and the previous turn's native structure do not line up;
3. **volatile system blocks** (MCP/memory/runContext) are interleaved inside the system prefix → they truncate the cacheable prefix early (for explicit-cache models).

### Why a high reported cache rate does NOT contradict this (within-turn vs cross-turn)

A counter-intuitive fact to pre-empt: AMR's per-turn cache rate can look healthy (~80%) while the cross-turn re-pay above is exactly the problem. They are not in tension — they measure different things:

- vela reports `cachedReadTokens` by **summing `cache.read` across every `step-finish` part within one turn** (`opencode_client.go:140`), and since vela opens a fresh session per turn, `exportSessionUsage` only covers that one turn → the number is a **per-turn aggregate**.
- One turn is an **agentic loop** = many model calls (plan → tool → observe → tool → … → answer). Calls 2..N reuse the same growing-but-stable within-turn prefix → high hit rate. That is real and already good.
- But the **first call of each turn** must re-pay the ~153k flattened history from scratch (cross-turn miss: structure destroyed + new session + TTL likely expired). It is one call out of many, so it barely moves the per-turn average — yet it is the entire cross-turn cost and it sits exactly on the TTFT path.

**Consequence**: a high per-turn cache rate ≠ fast TTFT, because TTFT is set by the turn's first call (the cross-turn miss). Measurement must therefore target the **first model call of turn-2+**, not the per-turn aggregate, or the win will be invisible in the averaged metric. (This also corrects the older "AMR reports no token usage" assumption — vela #277/#288 fixed that ~2026-06-10.)

## Proposed design

Explicit order: measure first, run the cheap gateway/cache experiment second, and only then decide whether ACP session reuse is still justified.

### Step 0 — instrument and measure
- Add production dashboards for `uncached_input_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`, cache efficiency, TTFT, and turn ordinal. Use `uncached_input_tokens` for the main before/after metric; raw `input_tokens` is not sufficient when cache fields are present.
- Confirm whether AMR follow-up latency is dominated by uncached follow-up input after separating turn-1 vs turn-2+ and hit vs miss cohorts.

### Step 1 — cheap gateway 1h-TTL + stable-prefix experiment
- Change Vela Link's explicit-cache path from default ephemeral to **1h TTL** where the upstream provider supports it, and make the cacheable prefix byte-stable. Vela Link currently emits only `{type: ephemeral}` at `prompt_cache.go:340-342`; 1h on the AMR lead path is unverified.
- Automatic-cache models (**DeepSeek, OpenAI**) do not need explicit `cache_control`; AMR's lead model `deepseek-v4-flash` needs a stable prefix and no unnecessary resend. Explicit-cache models (Claude / Gemini through Vertex) need cache breakpoints + volatile system blocks moved after the stable breakpoint.
- Layered breakpoints: `[common core]breakpoint[project stable]breakpoint[volatile]breakpoint[user]`. Cross-user reuse of the common core is a hypothesis to validate, not an assumed production fact.

### Step 2 — ACP session reuse only if uncached follow-up remains dominant
- If Step 1 shows turn-2+ `uncached_input_tokens` still dominates TTFT/cost, implement session reuse: ① change vela `initialize` to `loadSession=true`; ② add `case "session/load"` in `handleRequest`; ③ persist the opencode session (the current session id only lives in memory).
- Daemon coordination should reuse the existing centralized resume detection (`server.ts:7578-7595`) instead of duplicating an ACP-specific path. The behavior is "one long-lived ACP connection per conversation, `session/prompt` per turn", with flattened-history resend removed only after state-continuity gates pass.
- Effect to verify: turn-2+ uncached input drops from 153k → only new content for the current turn.

### Cache model classification (for implementers)
| Model | Cache | Read discount | TTL | Needs cache_control |
|---|---|---|---|---|
| Claude(Vertex/direct) | Explicit | 0.1× | 5m/1h(write 1.25×/2×) | Yes |
| DeepSeek(AMR lead) | Automatic | 0.5× | Automatic | No |
| OpenAI | Automatic | ~0.5× | Short/uncontrollable | No |
| Gemini | Explicit ctx cache | ~0.25–0.75× | Configurable | Yes |

### Cache scope + TTL (design constraints)
- **Scope = upstream account/project level, not global and not cross-organization**. AMR uses server-side credentials, so a shared-cache cohort is architecturally plausible. claude_code is BYOK and uses each user's own account → no cross-user sharing.
- **Cross-user shared cache — verified by provider docs (the mechanism is real, but it does NOT cover AMR's lead model):**
  | Provider | Cross-user shared cache? | Evidence |
  |---|---|---|
  | Anthropic (Claude, incl. Vertex) | ✅ **Documented** | Cache is scoped per **workspace/org, NOT per-API-key and NOT per-end-user**; two end-users on the same key with an identical prefix hit the same cache. Vertex/Bedrock = org-level isolation. |
  | OpenAI | ✅ **Documented** | Org-scoped; "within the same org, the first user pays full price and subsequent users with an identical prefix get −50%" — exactly the cross-user warming model. |
  | Gemini (Vertex explicit ctx cache) | ✅ Plausible | project/org-scoped cached-content resource, reused across requests in the project. |
  | **DeepSeek (AMR lead model)** | ⚠️ **Unverified, wording leans isolated** | The KV-cache doc only defines prefix-match mechanics and **does not document an account isolation boundary**; other material says "each user's cache is isolated and logically invisible to others" → per-account vs per-conversation undefined. |
- **Two preconditions for the turn-1 cross-user benefit** (both must hold, hence "hypothesis" not "fact"): (1) AMR must route all users through the **same upstream key/workspace** — `account.go` selects from a server-side catalog by key weight, so multi-key routing dilutes the hit rate even on Anthropic; (2) the provider must be org-scoped — **AMR's dominant lead model is DeepSeek, whose cross-user sharing is exactly the unverified case**. So the turn-1 benefit is documented-real for Claude/OpenAI/Gemini but **unproven on AMR's main DeepSeek path**.
- **turn-1 immunity to TTL** remains a hypothesis: it only holds if (1)+(2) above hold and concurrency keeps the shared prefix warm.
- **turn-2+ single-session history is exposed to TTL** (human time between turns is often >5min) → use **1h extended TTL** + keep one process alive per conversation.
- Sources: Anthropic prompt-caching docs (workspace/org isolation), OpenAI prompt-caching guide (org-scoped, −50% for later users), DeepSeek KV-cache docs (no account-isolation boundary documented).

### Session invalidation & lifecycle

ACP session reuse must mirror the daemon's existing resume keying (`server.ts:7604-7615`) and invalidate on model, cwd, project, MCP/tool-contract, prompt-hash, or memory change. Cancellation must clean up the ACP session, and stale-process eviction must close any long-lived per-conversation process; vela is one-session-per-process at `acp_runtime.go:258-260`, so one long-lived process per conversation otherwise risks leaked sessions and cross-conversation state.

## Expected benefit (quantified + confidence)

| Turn | Current uncached | Method | After cut | TTFT |
|---|---|---|---|---|
| turn-1 | ~100k | Stable prefix + hypothesized common-prefix reuse if shared cache cohort is verified (explicit models add cache_control) | Only first message remains | Estimate ~6-7s |
| turn-2+(~90%) | ~153k | session reuse (vela) | Only new content for this turn remains | **~11s → estimate ~6-7s** |

- **Latency**: AMR follow-up turns ~11s → estimate ~6-7s (about −40%), covering ~90% of runs.
- **Cost/stability**: Process ~100-150k fewer tokens per turn → burn less balance → **mitigate insufficient_balance (#4455 largest failure)**.
- **Confidence**: "current 11s / uncached 100-153k" is production-measured (hard data); "after cut 6-7s" is an estimate based on "model first byte shrinks with uncached volume", **exact value must be verified after implementation**; floor ~3s (network+model, measured) cannot be moved.
- **Scope note**: AMR volume is ~4.4k successful runs/week (< claude 73k), so absolute run reach is smaller, but AMR is the paid hosted layer, per-user experience + cost are sensitive, and it links to stability.

## Risks & mitigations

- **Cross-repo vela**: session/load + persistence are vela changes; user owns vela, non-blocking; requires vela tests + open-design daemon integration.
- **Correctness**: session reuse must not repeat #3380 and lose edit state; model/cwd/agent/cancel changes need session invalidation and fallback.
- **Slow conversations vs TTL**: 1h extended TTL + keepalive mitigates; very slow conversations may still miss (acceptable).
- **Instrumentation status (updated)**: vela now forwards usage on the ACP `session/prompt` result (vela #277 `c424931` + #288 `d176c010`, landed ~2026-06-10), so `cachedReadTokens` flows through to `token_count_source=provider_usage` (`acp_runtime.go:607-613` → daemon `acp.ts:154`). `cache_creation` is still likely empty (Vertex may not report write). **Caveat that changes interpretation — see "within-turn vs cross-turn" below**: the reported cache read is a per-turn aggregate, so a healthy AMR cache rate does NOT imply cross-turn reuse.
- **observability**: Add `cache_efficiency` / follow-up uncached_tokens dashboards to prevent regression.

## Prior art

Claude CLI resume already provides the desired host shape for native continuation. #3380 documents the lost edit-state failure mode from broken session continuity, and #3535 is the ACP session-reuse track. The daemon already centralizes resume detection at `server.ts:7578-7595`, so ACP work should plug into that path rather than adding a parallel resume detector.

## Validation · Acceptance (behavior-level)

- before/after: AMR follow-up `time_to_first_token_ms` p50 drops; `uncached_input_tokens` drops significantly from ~153k; `cache_read_input_tokens/(cache_read_input_tokens+uncached_input_tokens)` efficiency rises (target approaches claude's ~93%).
- One falsifiable check: send two consecutive turns in the same `conversationId`, assert second-turn `uncached_input_tokens` << first-turn `uncached_input_tokens` (history is no longer repaid after session reuse). **Measure the first model call of turn-2+, not the per-turn aggregate** — the per-turn cache rate is within-turn-loop-dominated and hides the cross-turn miss (see "within-turn vs cross-turn").
- Pure telemetry changes do not need #3545 QA gate. Prefix reordering and session reuse do need state-continuity / quality gates because they change model input: order is part of the input, and the daemon assembles that order at `server.ts:7670-7684`.
- Session lifecycle acceptance: changing model / cwd / project / MCP+tool contract / prompt hash / memory forces a new ACP session; cancel closes the session; stale-process eviction removes long-lived conversation processes; a new conversation cannot observe prior conversation state.

## Regression guard

- Prompt-stack byte-level golden test: cacheable common prefix stays byte-for-byte identical when only volatile inputs change (reuse the section fingerprint from `prompt-telemetry.ts`).
- Enforce STABLE/VOLATILE classification: new prompt sections without classification fail tests, forcing authors to declare placement (self-protecting as features evolve).
- Production cache efficiency + follow-up uncached dashboards + alerting.

## Feasibility review (codex GPT-5.5, ground-checked against vela + provider docs) — corrections and reprioritization

This feasibility was checked premise by premise by codex, with material corrections; **treat this as authoritative**:

1. **Caching is actually already implemented in the Vela Link gateway** (`services/link/internal/bifrostengine/prompt_cache.go`): after converting the OpenAI-compatible body to Bifrost, the gateway **injects cache control into system/developer content** (`:173/340`), strips directives unsupported by clients (`:107`), and uses **a limited number of cache breakpoints** (`markChatContentCacheable(content, remaining)`). → **No need to pass cache_control through ACP**; however, it **only injects `{type: ephemeral}` and no TTL** → default 5min, **1h is not wired**.
2. **Provider table correction**: DeepSeek read discount is **0.5×** — **vela's own billing says deepseek-v3.2 reads at 0.5×** (`services/api/src/billing.ts:178-180`); **AMR actual model preference = DeepSeek/GLM/Gemini**, not Claude/OpenAI (`runtimes/defs/amr.ts:8`). Anthropic numbers are verified. OpenAI/Gemini vary by model/config.
3. **session reuse = architecture change, not a config switch** (single largest risk): opencode `serve` natively supports multi-turn (`/session/{id}/prompt_async`), while "single session/no load" is a vela ACP choice; **but vela creates/deletes an opencode temp home every turn** (`opencode_process.go:336/376`) → session is destroyed with it, and **whether a fresh serve process can reload a persisted session is unverified**. Required work: stop temp deletion + persist + prove opencode reload + one process per conversation in the daemon.
4. **Cross-user shared cache — mechanism verified per provider, but not on AMR's lead model**: provider docs confirm the mechanism is real and org/workspace-scoped (Anthropic: per-workspace/org, not per-key/per-user; OpenAI: org-scoped, −50% for later users; Gemini: project-scoped). It does **not** clearly apply to **DeepSeek (AMR's dominant lead model)**, whose docs define prefix-match mechanics but **no account-isolation boundary**. Vela Link selects upstream credentials from a **server-side catalog, key-weighted, not per user** (`account.go`), so even on the org-scoped providers the turn-1 benefit additionally requires all users to land on the **same key/workspace**. Net: documented-real for Claude/OpenAI/Gemini, unproven on the main DeepSeek path — see the provider table under "Cache scope + TTL".
5. **1h TTL is not wired**: Anthropic supports `ttl:"1h"`, but Vertex/Bedrock automatic caching does not support it and only accepts explicit breakpoints; Vela Link currently defaults to ephemeral without TTL (`prompt_cache.go:340`) → 1h for Vertex-Claude on this path is unverified.

**Therefore, reorder into Step 0/1/2 (after correcting difficulty/feasibility):**
- **Step 0 (measure first)**: Add uncached/cache-field dashboards and confirm the dominant cohort before changing behavior.
- **Step 1 (small, more feasible, first)**: Change Vela Link ephemeral to **1h TTL** where supported + ensure the cacheable prefix is stable. Helps explicit-cache models only (Claude/Gemini); DeepSeek automatic-cache TTL cannot be set — partial benefit.
- **Step 2 (large, conditional project)**: session reuse (stop temp deletion + persist + verify opencode reload + one daemon connection per conversation) **only if uncached follow-up remains dominant after Step 1**. This captures the large turn-2+ 153k item, but needs a project.

> Therefore, this optimization is **not low-hanging fruit; it is a vela cross-repo project that needs to be planned**. Step 1 is comparatively small, but its benefit is limited by "AMR's lead models are automatic-cache models (DeepSeek/GLM)".

## Open questions

- After vela session/load, what should the opencode session persistence granularity be (per conversation? invalidation conditions?).
- Does AMR route all users through the same upstream key/workspace, and is the DeepSeek lead model's cache shared per-account? (Provider mechanism is documented for Claude/OpenAI/Gemini; DeepSeek isolation boundary is undocumented — this is the gating unknown for the turn-1 cross-user benefit.)
- Is the opencode direct p50 31s anomaly the same root cause (separate issue).

## Reproduction · Reproduce

PostHog OpenDesign=420348, `POST /api/projects/420348/query/`. HogQL: use `toFloat()` for numbers, `isNull()` for null, `quantile(0.9)` for P90, and `row_number() OVER (PARTITION BY conversation_id ORDER BY timestamp)` for turn ordinal.
- Input composition (turn-1 vs turn-2+): `avg(toFloat(properties.uncached_input_tokens))` / `cache_read_input_tokens` / `cache_creation_input_tokens`, bucketed by `if(turn=1,...)`.
- Hit vs miss TTFT: group by `if(toFloat(properties.cache_read_input_tokens)>0,'HIT','MISS')`.
- vela verification: `git -C ~/Documents/vela grep -n 'loadSession\|session/load' apps/cli`.
