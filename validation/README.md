# validation — 主链路验证用例库

`main-chain-suite.yaml` 是 open-design 的**「每次 release 必须工作」回归契约 / 验收标准**。
它和产品代码住在一起,由产品/QA 团队拥有,改功能时在同一个 PR 里顺手更新对应用例。

## 谁用它

- **nexu-xray agent 自主验证**:验证 open-design 时从本仓读取这份契约,逐条(`per_model` 的 × AMR 全模型)自主跑,产出结果。
- **自主验证偏差率**:agent 自主验证结果 ↔ 测试同学人工验收结论,按 case `id` 对齐,算偏差(目标逐版→0)。看板:研发页 `/daily/?view=yang` 的「Agent 自主验证 vs 人工验收」卡片。

> 设计理念:**每个产品自带自己的验证契约,工具(nexu-xray)是通用 runner**。所以契约住在产品仓,不在工具仓。

## 怎么长大(沉淀)

- 每份**人工验收文档**的 P0/P1(/P2)→ 找到匹配 case 补 `sources`,或新增 case。
- 改功能 → 同 PR 更新受影响的 case。
- 只增不忘:历史人工找到的问题都变成可回归的用例。

## case 结构

```yaml
- id: mc-exec-completes-no-error   # 稳定 kebab id(两边对齐的主键)
  chain: generate                  # generate|preview|comment|edit|chat|mark|session|home|ui|export|settings|amr|...
  scope: per_model                 # per_model = AMR 全模型各跑一遍;once = 跑一次
  severity: P0                     # P0 主链路阻断 / P1 高 / P2 中 / P3 低
  exec_dependent: true             # (可选) 依赖真实模型执行 → 应在真后端跑
  error_path: true                 # (可选) 测错误/边界路径(瞬时报错恢复、超时…)
  title: 每个 AMR 模型执行生成都不报错
  steps: [新建项目并输入 prompt, 选定该 AMR 模型, 运行生成]
  expected: 执行完成、无 connection reset / socket / opencode event stream 等后端报错
  sources: [0.10.0-nightly P0-2, P0-5/6 gpt-5.5 socket]   # 沉淀来源:验收条目 或 测试文件
```

## AMR 全模型策略

`amr_regression`:AMR(云端模型 runtime)**全模型是核心,每次 release 必须回归一遍**。
0.10.0 验收证明多数 P0 是模型后端特定的执行错误,**单后端跑结构性漏掉**。
模型清单**运行时从 `apps/daemon/src/runtimes/registry.ts` 的 BASE_AGENT_DEFS 枚举 + 每 agent `listModels` 动态发现**,不硬编码。

---

格式选 YAML(人读 + agent 读 + git diff + 可注释,比 JSON 省 token)。从 nexu-xray 工具仓的
`corpus/main-chain-suite.json` 迁移而来(2026-06-08),后续此处为单一真相。
