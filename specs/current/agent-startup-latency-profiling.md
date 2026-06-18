# Agent startup latency: profiling and session-reuse

Status: proposed · Parent: #3408 · Related: #3380, #3535 · Spec format: `spec-battle`

## Why · 为什么要做

- **用例**:接手 #3408 可靠性 / 性能线后,产品里最被用户感知到的延迟是「每次发消息后要等 ~10s 才出第一个字」。这是自己撞到 + 用户反馈的真痛点,不是前瞻补位。
- **痛点**:这 10s 在**每一条消息**上重复,不是一次性预热。它直接拉低 AMR / `claude_code` 的可用体感,是 #3408 这条线里 ROI 最高、且与失败率正交的一块。

## Sources · 事实源(必填,reviewer 照此核对)

- **Repo**:`nexu-io/open-design`。本 spec 在分支 `spec/agent-startup-latency`(PR #4504);要核对的**代码在 `origin/main`**。
- **拉取**:
  ```
  gh repo clone nexu-io/open-design && cd open-design && git checkout main
  # 看本 spec:gh pr checkout 4504
  ```
- **关键代码位置**(reviewer 直接跳过去):
  - `apps/daemon/src/run-analytics-observability.ts:284-346` — `summarizeRunTimingAnalytics`,`spawn_to_first_token_ms` / `time_to_first_token_ms` / `process_spawn_duration_ms` 在此从 `run.analyticsTelemetry` 的时间戳算出。`:50-60` 是 `RunTimingAnalytics` 字段表。
  - `apps/daemon/src/server.ts:8853`(`processSpawnStartedAt`)/ `:8868`(`processSpawnedAt`)/ `:9228-9232`(`noteFirstTokenAt` → `firstTokenAt`)。**`processSpawnedAt` → `firstTokenAt` 之间就是 `spawn_to_first_token` 这段 8-10s**,Phase 1 要在这中间加 `cli_ready` / `session_init` 两个新锚点。
  - `apps/daemon/src/server.ts:10846`(`summarizeRunTimingAnalytics(...)` 调用)/ `:10945`(`...timingAnalytics` 摊进 `run_finished`)——新字段在此上线到遥测。
  - `apps/daemon/src/runtimes/defs/claude.ts` + `apps/daemon/src/claude-stream.ts` — `claude_code` 的 session 处理,#3380 的修复(session resume)会落在这。
  - `packages/contracts/src/analytics/events.ts` — `TrackingRunTiming*` 处加三个新字段。
  - **prompt-cache 前缀稳定性(下方 Root cause 段,已在最新 main 核对)**:
    - `apps/daemon/src/server.ts:7670` — `composed` 拼装顺序:`# Instructions {instructionPrompt + cwdHint}` 在前、`# User request`(含拍平 transcript)在后。
    - `instructionPrompt` 前缀含**易失块**:`connectedExternalMcp`(server.ts:7464/7483)、`memoryBody`(:6762/7011)、`runContextPrompt`(:7343)、当前文件列表。
    - `apps/web/src/providers/daemon.ts:222-235` — `buildDaemonTranscript` 每条消息只渲染 `## role\n{m.content}`,**丢弃 `m.events`**(thinking/tool_use/tool_result);开头条件性插 `buildPriorRunContextWarning`(:87)。`MAX_TRANSCRIPT_MESSAGE_CHARS=12000`(:56)。
    - vela 侧 `loadSession:false` / 单 ACP session 在 **vela 仓库**(本仓核不到,见 Open questions)。
- **相关材料**:#3408(总线)、#3380(Claude 每条消息新建 session 而非 resume)、PR #3535(reuse ACP sessions per conversation,他人在做)、PR #4502(同线的分类 sibling)。
- **数据源**:PostHog project **OpenDesign = 420348**,`run_finished` 事件的 timing 字段。本 spec 的两张表由下列查询得出(rolling 7d,`result='success'`):
  - segment p50/p90:`quantile(...)(toFloat(properties.<seg>_ms))` group by `agent_provider_id`。
  - turn-ordinal:`row_number() OVER (PARTITION BY conversation_id ORDER BY timestamp)`,按 turn=1 vs 2+ 分桶比 `time_to_first_token_ms`。
- **访问前提**:复跑查询需 PostHog personal API key(`phx_…`);翻单条 trace 的真实错误可选用 Langfuse `us.cloud.langfuse.com`(trace_id == run.id)。

## What the telemetry already shows

启动 timing 分解(success runs, 7d, p50):

| segment | AMR | claude_code |
|---|---|---|
| queue | 2 ms | 2 ms |
| pre_spawn(prompt build + env) | ~400 ms | ~465 ms |
| process_spawn | 1 ms | 2 ms |
| **spawn → first token** | **10,378 ms** | **8,150 ms** |
| time_to_first_token(total) | 11,120 ms(p90 24.8 s) | 9,063 ms(p90 34.3 s) |

整段 ~10s 全在 `spawn_to_first_token`;queue+spawn+prompt-build 合计 ~0.5s,不值得优化。

**每条消息都重付一次完整冷启动(印证 #3380)** —— TTFT 按会话内轮次(success, 7d, p50):

| provider | turn 1 | turn 2+ |
|---|---|---|
| **claude_code** | 8,226 ms | **9,308 ms(反而更慢)** |
| amr | 12,169 ms | 10,859 ms(快 ~11%) |

若 session 被复用,后续轮该明显更快。`claude_code` **零**复用收益 → 每条消息重新冷启动 session,正是 #3380。AMR 有部分复用但基线仍 ~10s。

## Root cause（在最新 origin/main 核对）：prompt-cache 前缀不稳定

> 这套归因最初来自另一位 AI 的排查,本 spec 已逐条在最新 `origin/main` 核对真实代码(锚点见 Sources)。

为什么 cache 命中率低、续轮不提速?三个叠加的结构问题:

1. **易失系统块在稳定 transcript 前面**(`server.ts:7670`)。发给模型的 prompt = `[# Instructions:含 MCP 列表 / 个人记忆 / 当前文件列表 / run context 的易失前缀]` + `[# User request:append-only transcript]`。prompt-cache 按前缀字节匹配——只要易失块任一变化(生成个文件、连个 MCP、改条记忆),前缀漂移 → 后面本来逐字节稳定的 transcript 也整段失效。**稳定内容必须在前、易失在后,这里放反了。**
2. **每轮新 session + 历史拍平成纯文本**(`daemon.ts:222`)。`buildDaemonTranscript` 把多轮历史拍平成单个 `## role\n{可见文本}` 的 markdown blob,**丢掉 thinking/tool_use/tool_result 的原生结构**,每轮喂给全新 session。上一轮 agent 内部建立的原生结构化缓存(带签名 thinking、结构化 tool 往返)在跨轮那一刻随进程一起丢,下一轮从零重付 input token。
3. **TTL 兜底也救不了**:Anthropic 默认 cache 5 分钟 TTL,人类两轮间的思考/打字常超时。

唯一可能幸存的是那段拍平 transcript 文本(append-only),但命中需同时满足 ① daemon 冻住前面的易失系统块、② vela/opencode 网关透传 `cache_control`、③ 在 TTL 内——**目前三条都不满足**。

### 实验来源(诚实标注)
- ✅ **真实生产客户端**:上面 cache 命中/未命中 TTFT、跨轮命中率,均来自 PostHog `run_finished`(真实 Open Design 客户端遥测)。
- ✅ **最新 origin/main 代码核对**:Root cause 三条已逐条对真实代码核实。
- ❌ **已作废**:早期一次本地裸 `claude -p` 的 setup/model 拆分**不经过 daemon**,不代表真实路径,弃用;真实子段拆分待 Phase 1 埋点在 daemon 内测得。

## Goals / Non-goals

- **Goals**:(1) 把 `spawn_to_first_token` 拆成 `cli_ready_ms` / `session_init_ms` / `model_first_token_ms` 并和现有 `cache_hit_ratio` 关联,定位 10s 的真实归属;(2) 提升 prompt-cache 命中率(根因=易失前缀漂移 + 每轮新 session,见 Root cause)——先做便宜的前缀稳定(3a),再做 ACP 原生 session 复用(3b),降低续轮 TTFT。主指标=cache-miss 率 + 续轮 TTFT p50。
- **Non-goals**:provider 侧首 token 延迟(含 AMR→vela gateway 多一跳);token/context 裁剪(#3547,那条要走 #3545 gate);prompt-build / spawn 成本(已 ~0.5s)。

## Proposed design

三段式,**先观测、用数据决定再动手修**:

1. **Phase 1 — 给 `spawn_to_first_token` 加细分埋点(纯观测,先发)**:在 `processSpawnedAt`→`firstTokenAt` 之间加 `cliReadyAt`(CLI 首个 ready 信号 / 首条 ACP 消息)、`sessionInitDoneAt`(session 建立 / resume 握手完成)两个时间戳,`run_finished` 多发 `cli_ready_ms` / `session_init_ms` / `model_first_token_ms`(三者之和 ≈ `spawn_to_first_token_ms`,余量也发出以便审计)。无行为变化。
2. **Phase 2 — 实验确认**:PostHog 用新子段重跑 turn-1 vs turn-2+(预期 `session_init_ms` 跨轮持平=冷启动重付,`model_first_token_ms` 随 context 增长);本地 A/B(同会话 fresh vs resumed,只经生产 HTTP API 注数据)。**决策规则**:`session_init_ms` 占 `spawn_to_first_token_ms` > 30%(claude_code)才进 Phase 3,否则定性为 provider 侧、记录结论收手。
3. **Phase 3a — 稳定可缓存前缀(便宜、独立、无需 gate)**:把易失系统块(文件列表 / MCP 列表 / 个人记忆 / run context)从稳定 transcript **前面**挪到后面或冻结,让 append-only transcript 成为真正能命中的前缀;并确认 vela/opencode 网关透传 `cache_control`。这块不动 session 生命周期、收益立得到(降 cache-miss 率),应先做。
4. **Phase 3b — ACP 原生多轮 session 复用(大、依赖 vela)**:daemon 改成「一对话一条长存活 ACP 连接、按轮 `session/prompt`」,agent 自己维护原生多轮数组 + 工作记忆 + 缓存,host 不再每轮重发拍平历史。前提是 vela 侧先支持 `session/load` + opencode session 持久化(现版 `loadSession:false` 接不住),需跨仓协调。对齐 #3380 / #3535。验收=续轮 cache 命中率上升、`session_init_ms` 趋零、TTFT p50 下降,且不丢编辑状态。

## Alternatives considered

- **直接上 session 复用、不先加埋点**:否决——turn-ordinal 数据虽强,但"冷启动重付"和"context 增长"混淆,不拆段就可能修错地方(花在 session 复用上、结果大头其实是模型首 token)。Phase 1 是便宜的去混淆手段。
- **常驻 / 预热 agent 进程池**:更激进、可能更快,但跨 agent 复杂且有进程生命周期 / 隔离风险;session resume 是更小、与 #3380/#3535 既有方向一致的第一刀。若 Phase 2 显示 cli_ready(冷启动本身)才是大头,再回头考虑预热。
- **provider 侧首 token**:不在我们控制内(尤其 AMR 多一跳),明确排除。

## Risks & mitigations

- **observability**:`cli_ready` 的"ready 信号"每个 runtime 不同(ACP 首消息 / 纯 stdout / session ack),取错锚点会让子段失真 → Phase 1 必须为每类 runtime 定义可辩护的 ready 标记,并校验三子段之和 ≈ 总段。
- **correctness(Phase 3)**:#3380 记录了"每条消息新 session"同时丢失编辑状态;session resume 必须保对(不能为了快重新引入丢状态)→ 验收除 TTFT 外要含状态连续性测试。
- **compatibility**:新增 timing 字段是纯附加(contracts 加可选字段),老 reader 不受影响;无迁移、无回滚风险。
- **scope creep**:Phase 1 必须零行为变化,审查时盯住「只加时间戳、不改控制流」。

## Validation · 验收(behavior-level)

- Phase 1:一条 daemon 测试断言 `run_finished` 带三个新子段且 `cli_ready_ms + session_init_ms + model_first_token_ms + remainder == spawn_to_first_token_ms`(可证伪)。
- Phase 3:同会话续轮的 `session_init_ms` 显著下降(before/after PostHog 切片 + 本地 A/B)。
- **QA-gate 边界**:本线**不需要 #3545 gate**——只移除"出第一个 token 前的死时间",不改喂给模型的内容、不改输出,无质量回退面。before/after 证据就是 `spawn_to_first_token_ms` 及子段 p50/p90 + turn-ordinal 切片。

## Implementation slices

1. contracts 加 3 个可选 timing 字段 + Phase 1 埋点 + 求和测试(独立可上,纯观测)。
2. Phase 2 实验脚本 + 结论(无代码改动 / 仅分析)。
3. Phase 3 session resume(仅当 2 通过)+ 状态连续性 + TTFT 验收。

## Open questions

- 每个 runtime 的可靠「CLI ready」标记到底取哪个信号?(claude_code / ACP / 纯 stdout 各不同)——这是 Phase 1 能否成立的命门。
- `claude_code` resume 能否保住足够状态以保正确(不重蹈 #3380 的丢编辑状态)?Phase 3 要的是又快又对。
- 和 PR #3535(ACP session 复用)是否应合流,避免两条 session 复用各搞一套?
