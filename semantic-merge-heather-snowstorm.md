# heather-snowstorm vs origin/main 语义化合并说明

生成时间：2026-05-31  
当前分支：`heather-snowstorm`  
对比基准：`origin/main...HEAD`  
merge-base：`cfde84b03`  
当前 HEAD：`3a3fbfa9e`  
本地 `origin/main`：`53fb17585`

## 一句话总结

这个分支把 Open Design 的项目工作区从“文件/预览标签页”扩展为更完整的 workspace shell：在同一套 tab strip 里新增 `+` 启动器、Side Chat、项目目录终端、Chat/Design Agent 会话模式切换，以及预览截图复制到剪贴板。后端同步补齐了 contracts、SQLite conversation mode、context-seeded conversation、terminal PTY API、`od shell` / `od chat` CLI parity，并增加相关测试和依赖。

整体 diff：70 个文件，约 `+4370 / -235`。无删除文件、无 rename。

## 提交脉络

- `8cc11e38c feat(daemon): add interactive terminal support with node-pty`
- `79c039efd feat(daemon): introduce session mode for conversations`
- `44492af1f feat(daemon): enhance conversation session mode handling`
- `3a3fbfa9e feat(workspace): integrate terminal viewer and enhance chat functionality`

## 能力总览

### 1. Workspace `+` 启动器

用户在 Design Files / workspace tab strip 右侧点击 `+`，打开一个 command-palette 风格的菜单：

- 搜索当前项目文件并在新 tab 中打开。
- 按文件 kind 过滤，显示文件类型、大小、相对修改时间。
- 标记已经打开的 tab。
- 通过 registry action 创建非文件 tab，目前包括 New Side Chat 和 New Terminal。
- 支持键盘上下选择、Enter 打开、Esc / 外部点击关闭。

关键文件：

- 新增 `apps/web/src/components/workspace/TabLauncherMenu.tsx`
- 新增 `apps/web/src/components/workspace/TabLauncherMenu.module.css`
- 新增 `apps/web/src/components/workspace/tab-launcher.ts`
- 修改 `apps/web/src/components/FileWorkspace.tsx`
- 修改 `apps/web/src/styles/workspace/drawer.css`
- 修改 `apps/web/src/i18n/*`

合并注意：

- `FileWorkspace.tsx` 引入 `tabsStateRef` / `commitTabsState()`，目的是让异步 launcher action 使用最新 tab state，避免父组件刚更新 tabs 后，launcher 用旧闭包覆盖新 tab。
- `+` 按钮放在 `.ws-tabs-bar` 外侧的 `.ws-tabs-actions`，避免被横向 overflow 裁剪。

### 2. Side Chat：继承上下文的工作区聊天 tab

新增 `chat:<conversationId>` tab 类型。用户从 workspace `+` 菜单创建 Side Chat 时，daemon 会创建一个新 conversation，并可从当前 conversation 复制历史消息作为上下文。这个新 conversation 仍然是普通 conversation，会出现在 conversation 列表里；workspace tab 只是一个新的呈现入口。

行为：

- `POST /api/projects/:id/conversations` 支持 `seedFromConversationId`。
- seed 时复制 source conversation 的 messages，但清空 `runId` / `runStatus` / `lastRunEventId`，避免复制出的 assistant message 显示永久 running。
- Side Chat 使用同一个 `ChatPane`，通过 `useConversationChat()` 走 `streamViaDaemon()`、`listMessages()`、`saveMessage()`。
- 如果 Side Chat 打开的正好是主聊天当前 active conversation，则走 `activeConversationChat` controlled state，避免同一 conversation 两套状态分叉。

关键文件：

- 新增 `apps/web/src/components/workspace/SideChatTab.tsx`
- 新增 `apps/web/src/components/workspace/SideChatTab.module.css`
- 新增 `apps/web/src/components/workspace/useConversationChat.ts`
- 修改 `apps/web/src/components/FileWorkspace.tsx`
- 修改 `apps/web/src/components/ProjectView.tsx`
- 修改 `apps/web/src/types.ts`
- 修改 `apps/daemon/src/project-routes.ts`
- 修改 `apps/daemon/src/cli.ts`
- 修改 `packages/contracts/src/api/projects.ts`

CLI parity：

- 新增 `od chat new --project <id> [--seed-from <cid>] [--title "<title>"] [--mode design|chat] [--json]`
- 扩展 `od conversation new <projectId> [--title "<title>"] [--seed-from <cid>] [--mode design|chat]`

### 3. 项目内交互终端

新增 `terminal:<terminalId>` tab 类型。daemon 使用 `node-pty` 在项目工作目录启动用户 shell；web 通过 xterm.js 显示和输入；CLI 通过 `od shell` 连接同一套 HTTP/SSE terminal API。

HTTP API：

- `GET /api/projects/:id/terminals`：列出项目 terminal sessions。
- `POST /api/projects/:id/terminals`：创建 PTY session，可传 `cols` / `rows` / `shell`。
- `GET /api/projects/:id/terminals/:tid/stream`：SSE 输出流，事件为 `data` / `exit`。
- `POST /api/projects/:id/terminals/:tid/stdin`：写入 raw stdin。
- `POST /api/projects/:id/terminals/:tid/resize`：调整 PTY 尺寸。
- `POST /api/projects/:id/terminals/:tid/kill` 和 `DELETE /api/projects/:id/terminals/:tid`：结束 session。

daemon 行为：

- PTY session 是 process-local in-memory，不持久化。
- 每个 session 有 bounded event ring buffer，支持 EventSource 断线后的 `Last-Event-ID` replay。
- session exited 后保留 TTL，再清理，避免长 daemon 泄漏。
- daemon shutdown 时先 shutdown chat runs，再 kill active terminal sessions。
- `node-pty` 动态 import，避免 native addon 缺失时 daemon 启动即崩；缺失只会让 create terminal 请求失败。
- `ensureSpawnHelperExecutable()` 修复 pnpm 解包 `node-pty` prebuild `spawn-helper` 没有可执行位导致的 `posix_spawnp failed`。

web 行为：

- `TerminalViewer.tsx` lazy import `@xterm/xterm` 和 `@xterm/addon-fit`，避免 SSR/jsdom import 时引用 `self`。
- xterm theme 从 CSS variables 读取，并监听主题变化。
- EventSource 接 `data` / `exit`；transient error 显示 reconnecting，session 不存在显示 unavailable。
- tab 关闭或组件卸载时 best-effort kill terminal，`keepalive` 防止页面卸载取消请求。
- terminal ended / unavailable 状态提供 Restart 和 Close。

CLI parity：

- 新增 `od shell --project <projectId> [--shell <path>] [--json]`
- 非 JSON 模式会 attach：SSE output 写 stdout，本地 stdin raw mode POST 到 `/stdin`，窗口 resize POST 到 `/resize`。

关键文件：

- 新增 `packages/contracts/src/api/terminals.ts`
- 新增 `apps/daemon/src/terminals.ts`
- 新增 `apps/daemon/src/terminal-routes.ts`
- 修改 `apps/daemon/src/server.ts`
- 修改 `apps/daemon/src/cli.ts`
- 新增 `apps/web/src/components/workspace/TerminalViewer.tsx`
- 新增 `apps/web/src/components/workspace/TerminalViewer.module.css`
- 新增 `apps/web/src/styles/workspace/terminal.css`
- 修改 `apps/web/src/state/projects.ts`
- 修改 `apps/web/src/types.ts`
- 修改 `apps/web/src/components/FileWorkspace.tsx`
- 修改 `apps/daemon/package.json`
- 修改 `apps/web/package.json`
- 修改 `pnpm-lock.yaml`

新增依赖：

- daemon：`node-pty@1.1.0`
- web：`@xterm/xterm@5.5.0`、`@xterm/addon-fit@0.10.0`

### 4. Chat / Design Agent 会话模式

新增 `ChatSessionMode = 'design' | 'chat'`。Design mode 保持现有 artifact-first agent 行为；Chat mode 在 system prompt 顶部插入 override，让模型表现为普通快速桌面聊天助手，不默认发 discovery form，不为了聊天答案 TodoWrite，不主动生成/编辑文件，除非用户明确要求生成、构建、设计、导出或修改。

数据流：

- contracts：`ChatRequest.sessionMode`、`Conversation.sessionMode`、`CreateProjectRequest.conversationMode`、`CreateConversationRequest.sessionMode`、`UpdateConversationRequest.sessionMode`。
- SQLite：`conversations.session_mode TEXT NOT NULL DEFAULT 'design'`。
- project create：可用 `conversationMode` 或 legacy `sessionMode` 给默认 conversation 设初始模式。
- conversation create：显式 `sessionMode` 优先；否则如果 seed from same-project conversation，则继承 source mode；否则默认 `design`。
- run create：daemon 优先使用 request `sessionMode`；否则读 conversation 的 `sessionMode`；最后 fallback `design`。
- prompt composer：daemon copy 和 contracts copy 都在 discovery prompt 之前插入 Chat mode override。

UI：

- 新增 `SessionModeToggle`，放在 Home hero 和 ChatComposer footer。
- `ProjectView` 维护 active conversation 的 mode，PATCH conversation 后同步本地 list。
- BYOK/API path 和 daemon path 都会把 mode 传到 prompt/run 层。
- Home 的自由输入在 Chat mode 下不会默认绑定 hidden scenario plugin；Design mode 保持默认 router plugin 行为。

关键文件：

- 新增 `apps/web/src/components/SessionModeToggle.tsx`
- 修改 `apps/web/src/components/HomeHero.tsx`
- 修改 `apps/web/src/components/HomeView.tsx`
- 修改 `apps/web/src/components/ChatComposer.tsx`
- 修改 `apps/web/src/components/ChatPane.tsx`
- 修改 `apps/web/src/components/ProjectView.tsx`
- 修改 `apps/web/src/App.tsx`
- 修改 `apps/web/src/components/EntryShell.tsx`
- 修改 `apps/web/src/components/PluginLoopHome.tsx`
- 修改 `apps/web/src/styles/chat.css`
- 修改 `packages/contracts/src/api/chat.ts`
- 修改 `packages/contracts/src/api/projects.ts`
- 修改 `packages/contracts/src/prompts/system.ts`
- 修改 `apps/daemon/src/db.ts`
- 修改 `apps/daemon/src/project-routes.ts`
- 修改 `apps/daemon/src/prompts/system.ts`
- 修改 `apps/daemon/src/server.ts`
- 修改 `apps/daemon/src/cli.ts`

### 5. 预览截图复制到剪贴板

FileViewer preview toolbar 新增 Screenshot button。点击后复用现有 preview snapshot capture 能力，把 data URL 转 Blob，通过 Clipboard API 写入系统剪贴板。

行为：

- 只在 preview mode 显示。
- 有 in-flight guard，防止重复点击并发截图。
- toast 状态覆盖 copying / copied / denied / preview loading / failed。
- 使用 `ClipboardItem` 的 `Promise<Blob>` 形式优先，尽量兼容 Safari 的 user gesture 限制。

关键文件：

- 修改 `apps/web/src/components/FileViewer.tsx`
- 修改 `apps/web/src/runtime/exports.ts`
- 修改 `apps/web/tests/components/FileViewer.test.tsx`

## 文件 CRUD 清单

### Create：新增文件

| 文件 | 语义 |
| --- | --- |
| `packages/contracts/src/api/terminals.ts` | terminal DTO 与 SSE event union。 |
| `apps/daemon/src/terminals.ts` | in-memory PTY session manager、node-pty 动态加载、spawn-helper chmod 修复、SSE replay、write/resize/kill/shutdown。 |
| `apps/daemon/src/terminal-routes.ts` | `/api/projects/:id/terminals` HTTP route registrar。 |
| `apps/daemon/tests/terminals.spawn-helper.test.ts` | 回归测试：prebuilt spawn-helper 丢失 `+x` 时 create terminal 自修复并成功 spawn。 |
| `apps/web/src/components/SessionModeToggle.tsx` | Chat / Design Agent mode segmented dropdown。 |
| `apps/web/src/components/workspace/SideChatTab.tsx` | workspace 中的 secondary ChatPane。 |
| `apps/web/src/components/workspace/SideChatTab.module.css` | Side Chat tab 局部样式。 |
| `apps/web/src/components/workspace/TabLauncherMenu.tsx` | `+` launcher 菜单：搜索文件、过滤、create-new actions。 |
| `apps/web/src/components/workspace/TabLauncherMenu.module.css` | launcher 菜单局部样式。 |
| `apps/web/src/components/workspace/TerminalViewer.tsx` | xterm.js terminal tab surface。 |
| `apps/web/src/components/workspace/TerminalViewer.module.css` | terminal tab 局部样式与状态 overlay。 |
| `apps/web/src/components/workspace/tab-launcher.ts` | launcher action registry：New Side Chat / New Terminal。 |
| `apps/web/src/components/workspace/useConversationChat.ts` | side chat 的 conversation-scoped send/stream/persist hook。 |
| `apps/web/src/styles/workspace/terminal.css` | 全局引入 xterm structural CSS。 |
| `apps/web/tests/components/SessionModeToggle.test.tsx` | mode toggle 行为测试。 |
| `apps/web/tests/components/TerminalViewer.test.tsx` | terminal viewer loading/localization 测试。 |

### Update：核心修改文件

| 文件 | 语义 |
| --- | --- |
| `packages/contracts/src/api/chat.ts` | 新增 `ChatSessionMode` 与 `ChatRequest.sessionMode`。 |
| `packages/contracts/src/api/projects.ts` | Conversation / project create / conversation create/update 增加 session mode 与 seed conversation 字段。 |
| `packages/contracts/src/index.ts` | 导出 terminal API contracts。 |
| `packages/contracts/src/prompts/system.ts` | contracts prompt composer 支持 Chat mode override。 |
| `packages/contracts/tests/system-prompt.test.ts` | 校验 Chat mode override 位于 discovery prompt 之前并包含官方链接。 |
| `apps/daemon/src/db.ts` | SQLite migration 添加 `conversations.session_mode`，conversation CRUD 读写/normalize mode。 |
| `apps/daemon/src/project-routes.ts` | project create 支持 `conversationMode`，conversation create 支持 `seedFromConversationId` 与 mode 继承，PATCH 支持 mode。 |
| `apps/daemon/src/server.ts` | 创建 terminal service、注册 terminal routes、daemon shutdown 时关闭 terminals、chat run prompt 传 session mode。 |
| `apps/daemon/src/prompts/system.ts` | daemon prompt composer 支持 Chat mode override，与 contracts copy 保持语义一致。 |
| `apps/daemon/src/cli.ts` | 新增 `od shell`、`od chat`；扩展 `od project create --mode`、`od conversation new --seed-from --mode`。 |
| `apps/web/src/types.ts` | 新增 `SideChatTabId` / `TerminalTabId` helpers。 |
| `apps/web/src/state/projects.ts` | create project/conversation 传 mode/seed；新增 terminal HTTP helpers。 |
| `apps/web/src/providers/daemon.ts` | `streamViaDaemon()` 传 `sessionMode`。 |
| `apps/web/src/components/ProjectView.tsx` | active conversation mode、mode patch、side chat creation、side-chat controlled state、run send 传 mode。 |
| `apps/web/src/components/FileWorkspace.tsx` | 接入 launcher、Side Chat、Terminal tab、非文件 tab labels/icons、最新 tab state ref、launcher toast。 |
| `apps/web/src/components/ChatPane.tsx` | 向 composer 传 session mode 与 mode change callback。 |
| `apps/web/src/components/ChatComposer.tsx` | footer 新增 SessionModeToggle；移除可见 pet composer entry，但保留手动 `/pet` handler wiring。 |
| `apps/web/src/components/HomeHero.tsx` | Home composer footer 新增 SessionModeToggle。 |
| `apps/web/src/components/HomeView.tsx` | Home 维护 session mode；Chat mode 下不默认绑定 fallback scenario plugin；submit 传 `conversationMode`。 |
| `apps/web/src/App.tsx` | create project 输入透传 `conversationMode`。 |
| `apps/web/src/components/EntryShell.tsx` | onboarding/home submit payload 透传 `conversationMode`。 |
| `apps/web/src/components/PluginLoopHome.tsx` | submit payload 类型补 `conversationMode`。 |
| `apps/web/src/components/FileViewer.tsx` | preview toolbar 新增 screenshot-to-clipboard button。 |
| `apps/web/src/runtime/exports.ts` | 新增 `copyImageDataUrlToClipboard()`。 |
| `apps/web/src/components/Icon.tsx` | 新增 `terminal` icon。 |
| `apps/web/src/styles/chat.css` | SessionModeToggle 样式。 |
| `apps/web/src/styles/workspace/drawer.css` | `+` 按钮、tabs actions、ws-body positioning。 |
| `apps/web/src/index.css` | import xterm global CSS wrapper。 |
| `apps/web/src/i18n/types.ts` | 新增 workspace launcher / side-chat / terminal 文案 keys。 |
| `apps/web/src/i18n/locales/*.ts` | 所有 locale 增加上述 workspace 文案。 |
| `apps/web/tests/components/FileWorkspace.test.tsx` | 覆盖 launcher 在父 tabs 更新后追加 terminal/side-chat。 |
| `apps/web/tests/components/FileViewer.test.tsx` | 更新截图按钮断言。 |
| `apps/web/tests/components/ChatComposer.context-pickers.test.tsx` | 更新 pet composer entry 不再显示的测试。 |
| `apps/daemon/package.json` | 增加 `node-pty`。 |
| `apps/web/package.json` | 增加 xterm dependencies。 |
| `pnpm-lock.yaml` | lockfile 对应依赖更新。 |

### Delete

无文件删除。

代码层面的删除/收缩：

- `ChatComposer.tsx` 移除了可见 pet composer button/popover 与相关定位逻辑。
- `/pet` 相关 handler props 仍保留，注释表明手动 `/pet` 命令仍可路由。
- `ChatComposer.context-pickers.test.tsx` 对应测试从“pet popover fixed positioning”改成“pet handlers wired 时不渲染 pet composer entry”。

## 合并顺序建议

建议在另一个 worktree 里按依赖方向语义化合并，不要按文件字母序：

1. **Contracts first**
   - `packages/contracts/src/api/chat.ts`
   - `packages/contracts/src/api/projects.ts`
   - `packages/contracts/src/api/terminals.ts`
   - `packages/contracts/src/index.ts`
   - `packages/contracts/src/prompts/system.ts`
   - `packages/contracts/tests/system-prompt.test.ts`

2. **Daemon data/API/CLI**
   - `apps/daemon/src/db.ts`
   - `apps/daemon/src/project-routes.ts`
   - `apps/daemon/src/terminals.ts`
   - `apps/daemon/src/terminal-routes.ts`
   - `apps/daemon/src/server.ts`
   - `apps/daemon/src/prompts/system.ts`
   - `apps/daemon/src/cli.ts`
   - `apps/daemon/tests/terminals.spawn-helper.test.ts`

3. **Web state/types/provider**
   - `apps/web/src/types.ts`
   - `apps/web/src/state/projects.ts`
   - `apps/web/src/providers/daemon.ts`
   - `apps/web/src/runtime/exports.ts`

4. **Web reusable UI**
   - `apps/web/src/components/SessionModeToggle.tsx`
   - `apps/web/src/components/workspace/*`
   - `apps/web/src/components/Icon.tsx`

5. **Web integration surfaces**
   - `apps/web/src/components/ProjectView.tsx`
   - `apps/web/src/components/FileWorkspace.tsx`
   - `apps/web/src/components/ChatPane.tsx`
   - `apps/web/src/components/ChatComposer.tsx`
   - `apps/web/src/components/HomeHero.tsx`
   - `apps/web/src/components/HomeView.tsx`
   - `apps/web/src/App.tsx`
   - `apps/web/src/components/EntryShell.tsx`
   - `apps/web/src/components/PluginLoopHome.tsx`
   - `apps/web/src/components/FileViewer.tsx`

6. **Styles/i18n/tests/deps**
   - `apps/web/src/styles/chat.css`
   - `apps/web/src/styles/workspace/drawer.css`
   - `apps/web/src/styles/workspace/terminal.css`
   - `apps/web/src/index.css`
   - `apps/web/src/i18n/types.ts`
   - `apps/web/src/i18n/locales/*.ts`
   - `apps/web/tests/components/*.test.tsx`
   - `apps/daemon/package.json`
   - `apps/web/package.json`
   - `pnpm-lock.yaml`

## 高冲突热点

### `apps/web/src/components/FileWorkspace.tsx`

这是最大 UI 接入点，容易和其他 workspace/browser/file-tree 分支冲突。重点保留以下语义：

- `tabsStateRef` + `commitTabsState()`，所有异步打开 tab 的路径都应基于最新 state。
- `openFile()` 同时服务真实文件 tab 和 `chat:` / `terminal:` 非文件 tab。
- `tabNames` 仍是 persisted tabs + pending sketches。
- tab label/icon 分支：
  - `terminal:<id>` 显示 terminal icon 和 “New Terminal”/带序号标签。
  - `chat:<id>` 显示 comment icon 和 conversation title 或 “Side chat”。
  - live artifact / 文件 / sketch 保持原逻辑。
- `.ws-body` render switch 增加 SideChatTab 和 TerminalViewer，应放在 live artifact / active file fallback 之前。

### `apps/web/src/components/ProjectView.tsx`

这是聊天状态、conversation list、workspace props 的汇合点。重点保留：

- `activeConversation` / `activeSessionMode`。
- `handleConversationSessionModeChange()` 和 `handleActiveConversationSessionModeChange()`。
- `handleCreateSideChat()` 调用 `createConversation(project.id, title, { seedFromConversationId })`。
- daemon 和 API/BYOK 两条发送路径都用 `runSessionMode`。
- `activeConversationChatState` 传入 FileWorkspace，让 SideChatTab 在绑定当前主 conversation 时受控。

### `apps/daemon/src/server.ts`

文件很大，容易在 route 注册和 chat run composer 附近冲突。重点保留：

- import `registerTerminalRoutes` / `createTerminalService`。
- `const terminalService = createTerminalService();`
- `registerTerminalRoutes(app, ...)` 放在 project routes 之后、import routes 之前。
- `composeDaemonSystemPrompt()` 入参和调用包含 `sessionMode`。
- `startChatRun()` 从 body/conversation resolve `runSessionMode`。
- shutdown 里 `await terminalService.shutdownActive()`。

### `apps/daemon/src/cli.ts`

CLI 文件大、dispatch 在顶部，冲突时注意：

- `SUBCOMMAND_MAP` 增加 `shell: runShell` 和 `chat: runChat`。
- `PROJECT_STRING_FLAGS` 增加 `seed-from` 与 `mode`。
- `normalizeChatSessionModeFlag()` 必须在 project/conversation/chat helpers 使用。
- `runShell()` / `attachTerminal()` 依赖 terminal endpoints。
- `runChat()` 和扩展后的 `runConversation()` 都使用同一 conversation endpoint。

### prompt composer 双份同步

`apps/daemon/src/prompts/system.ts` 和 `packages/contracts/src/prompts/system.ts` 都有 Chat mode override。另一个 worktree 合并时要保持两份语义一致，否则 daemon 模式和 BYOK/API 模式行为会漂移。

## 验证建议

最小建议：

```bash
pnpm install
pnpm guard
pnpm typecheck
pnpm --filter @open-design/contracts test
pnpm --filter @open-design/daemon test
pnpm --filter @open-design/web test
```

针对 terminal：

```bash
pnpm --filter @open-design/daemon test -- terminals.spawn-helper.test.ts
pnpm --filter @open-design/web test -- TerminalViewer.test.tsx
```

针对 UI 手工验收：

```bash
pnpm tools-dev run web --daemon-port 17456 --web-port 17573
```

手工路径：

- 打开一个项目，点击 workspace tab strip 右侧 `+`。
- 搜索文件并打开，确认不会丢失已有 tab。
- 新建 Side Chat，确认继承当前聊天上下文，且新 conversation 可在会话菜单中看到。
- 切换 Chat / Design Agent mode，发一条普通问题，确认 Chat mode 不默认进入 artifact discovery。
- 新建 Terminal，确认 shell cwd 是项目目录，可输入命令；关闭 tab 后 shell 被 kill。
- Preview mode 点击 Screenshot，确认剪贴板可粘贴图片；权限被拒时有 toast。

## 语义合并时的保留原则

- Web UI 与 CLI 必须双轨闭环：Side Chat 不能只留 UI，要保留 `od chat new` / `od conversation new --seed-from`；Terminal 不能只留 web tab，要保留 `od shell`。
- `packages/contracts` 是 web/daemon shape 的源头，先合并 contracts 再修 daemon/web。
- Terminal transport 是 SSE + POST，不是 WebSocket；不要在合并时改成另一套 transport。
- `chat` session mode 是 conversation-level 状态，不只是 composer-local state；SQLite、daemon run、BYOK prompt composer 都要接上。
- Context-seeded conversation 是 copy messages，不是引用 source conversation；复制时要清空 run pointers。
- Non-file workspace tabs 复用 persisted open tabs state；不要引入第二套 tab store。
- `node-pty` 是 native dependency；改 package manifests 后需要 `pnpm install`，lockfile 也需要一起带上。
