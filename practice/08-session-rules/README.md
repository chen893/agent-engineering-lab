# 实验 08：可随会话恢复的项目约定扩展

> **模式**：能力校准 ｜ **类型**：`pi coding-agent` 扩展设计与集成 ｜ **预计耗时**：4–8 小时（1–2 个主线时段）
> **关联问题池**：Q005（扩展能力的分层选择）、Q012（存储与装入上下文的区别）

---

## 1. 实验背景与考核目标

### 业务场景

在一次开发会话中，用户希望通过斜杠命令临时设定一些会话级约定（例如“包管理器用 pnpm”、“回复用中文”）。这些约定需要满足：

1. **自动生效**：后续每轮请求大模型时，自动注入到系统提示词（System Prompt）中。
2. **会话持久化**：关闭并重新打开**同一会话**时，约定依然有效。
3. **会话隔离**：新建其他会话时从空约定开始；且全程**不修改**项目共享的 [AGENTS.md](../../AGENTS.md)。

### 考核重点（独立承担边界）

在先前的实验中，实验 05 的接线由 AI 提供，实验 07 侧重于 Agent Core 内部审批。**本次实验要求你独立跑通完整的扩展接入闭环：**

- 自主定位 `coding-agent` 的扩展加载与执行链路。
- 独立完成：类型定义、命令注册、状态设计、会话持久化与恢复、上下文注入。
- 独立编写端到端测试：使用真实的扩展加载机制及 `ResourceLoader` / `AgentSession` 完成组装与验证（不可仅测试内存 `Map` 或手动直接调用 command handler，也不可修改 pi 源码）。

> **说明**：AI 仅提供基础测试设施（见第 3 节）。如果在后续实现或测试编写中请求了 AI 代写，需如实记录协助范围（该部分将不计入独立完成度）。遇到具体的接入卡点可随时提问。

---

## 2. 功能规格说明（用户可见契约）

### 2.1 命令交互与参数校验

当 Agent 空闲时，用户输入以下 `/rules` 命令。**所有命令均由扩展直接处理，不调用大模型**，并通过 `ctx.ui.notify` 返回通知反馈（具体提示文案自定）：

| 命令示例                               | 预期行为                                                       |
| -------------------------------------- | -------------------------------------------------------------- |
| `/rules set package-manager 使用 pnpm` | 保存键 `package-manager` 及其对应文本；若键已存在则覆盖旧值    |
| `/rules set language 回复使用中文`     | 保存另一条约定                                                 |
| `/rules list`                          | 展示当前全部键值对；若当前无任何约定，需明确提示“为空”         |
| `/rules remove language`               | 删除指定键；若该键不存在，需明确提示“未找到”，且保持原状态不变 |

**输入解析与校验规则：**

- **Key 格式**：必须符合正则 `[a-z][a-z0-9-]{0,31}`（区分不同键，仅验收符合此格式的 Key）。
- **Value 格式**：取 `set [key]` 后方的整段单行文本，去除首尾空白并保留内部空格（无需处理引号解析或 Shell 转义）。
- **异常处理**：遇到空 Value、缺少必要参数或未知子命令时，通过通知提示用法或错误，**不修改状态，不调用模型**。
- **容量限制与豁免**：支持最多 10 条、每条最多 200 字的合法约定。_（注：超出容量限制的处理、语义去重或规则冲突消解均不在验收范围内。）_

### 2.2 模型输入（System Prompt 注入）

每次用户发送普通 Prompt 触发模型请求时，需将当前有效约定注入到**本次请求的有效 System Prompt**（即测试设施中的 `requests[i].systemPrompt`）中，同时保留 pi 原有的系统指令。请设计一个明确的“约定区块”来承载键值对（具体排版格式自定），并满足：

1. **去重不累积**：每个有效键在区块中仅出现一次；连续发送多轮 Prompt 时，不得重复追加约定区块。
2. **实时同步**：更新键后，区块内仅包含新值；删除键后，区块内不再包含该键。
3. **空状态干净**：当前没有任何约定时，不添加约定区块。

> **验收边界说明**：pi 的会话历史（Transcript）本身可能会保留过往的系统提示变更记录。验收更新/删除时，**只检查当前请求的 `requests[i].systemPrompt` 是否正确**，不要求抹除历史聊天记录，也不验证模型是否从历史上下文中看到了旧内容。此外，不能仅凭 `/rules list` 的输出代替对真实模型请求参数的检查。

### 2.3 持久化与会话隔离

- **存储机制**：必须使用 pi 会话内置的存储机制保存数据。**禁止**额外维护全局 JSON 文件、禁止修改 [AGENTS.md](../../AGENTS.md)、禁止依赖模块级全局变量保存状态。
- **跨实例恢复**：销毁旧的 `AgentSession` 后，使用**全新的 `SessionManager` 和全新的扩展实例**从同一个 JSONL 会话文件恢复，此时执行 `/rules list` 及发起下一次模型请求，约定数据均须完整恢复。
- **多会话隔离**：新建另一个会话时约定为空；重新切回原会话时，原约定依然保留。

> **持久化前置条件与豁免**：
>
> - **前置动作**：pi 目前在产生首条 `user/assistant` 消息前不会创建落盘会话文件（本轮无需修改 pi 这一机制）。因此，**所有用于测试持久化的会话，必须先完成一次普通 Prompt 对话，再执行 `/rules` 命令**。
> - **豁免范围**：同一个会话内的命令修改与普通 Prompt 按顺序串行执行，不要求支持并发；仅验收线性会话的“新建”与“重新打开”，**不验收**分支切换、fork、compaction、损坏文件修复、旧格式迁移或跨进程同时写入。
> - **非目标功能**：本实验不验证 MCP 协议、完整 Skill 加载机制或通用长期记忆；无需连接付费模型、开发 TUI/网页组件、搭建向量库或注册模型 Tool。

---

## 3. 工作区文件与测试设施

所有测试均在隔离的临时目录中运行，不会读取你的个人 pi 配置。

### 3.1 目录文件清单

| 文件名               | 角色说明                                                                                                  |
| -------------------- | --------------------------------------------------------------------------------------------------------- |
| [design.md](design.md) | **【你来编写】** 实现前的设计文档，记录接入选择、源码依据、状态设计与测试用例预期 |
| [rules-extension.ts](rules-extension.ts) | **【你来编写】** 扩展主入口（目前为空），需使用真实的 `ExtensionAPI` 类型并作为默认导出（default export） |
| [rules.test.ts](rules.test.ts) | **【你来编写】** 端到端集成测试文件（目前为占位）；测试方案由你设计，可按需请 AI 协助编写代码 |
| [fixtures.ts](fixtures.ts) | **【AI 已提供】** 离线测试设施，提供临时环境、Mock 模型及通知捕获工具 |
| [fixtures.test.ts](fixtures.test.ts) | **【AI 已提供】** 仅用于自检 [fixtures.ts](fixtures.ts) 设施本身是否正常（通过此测试不代表实验通过） |
| [baseline.md](baseline.md) | **【AI 已提供】** 记录源码版本、环境准备与基线测试结果 |

### 3.2 测试设施 API（[fixtures.ts](fixtures.ts)）

调用 `await createFixture()` 将初始化一套隔离环境（包含独立的临时 `cwd`、`agentDir`、`sessionDir` 以及离线的 `model` 与 `modelRuntime`），并提供以下核心工具：

- **`queueReplies(n = 1)`**：为接下来的 `n` 次普通模型请求排入固定回复（注意：`/rules` 命令不应消耗预设回复）。
- **`requests`**：记录每次实际模型请求的快照（包含解析后的 `systemPrompt` 和 `context`）。_注意：切勿仅因 Mock 返回了固定文本就认定接线成功，必须校验 `requests` 中的实际证据。_
- **`createTestUiContext({ notify })`**：复用 pi 测试设施以捕获 `ctx.ui.notify` 通知（注：仅提供上下文，仍需你自行完成扩展与会话的绑定）。
- **`dispose()`**：清理模拟 Provider 和临时目录。**必须在结束并销毁你创建的 Session 之后再调用**；在进行跨会话恢复测试时，需在恢复验证全部结束后再执行清理（注意：测试失败路径也必须确保关闭 Session 并调用 `dispose()`）。

---

## 4. 开展步骤与验收指南

### 第一步：源码调研与方案设计（写入 [design.md](design.md)）

1. **阅读文档**：先查阅本地 [extensions.md](../../repos/pi-mono/packages/coding-agent/docs/extensions.md) 和 [sdk.md](../../repos/pi-mono/packages/coding-agent/docs/sdk.md) 的相关章节。
2. **按需查源码**：带着问题检索以下源码（无需通读全文）：

- [resource-loader.ts](../../repos/pi-mono/packages/coding-agent/src/core/resource-loader.ts)
- [extensions/](../../repos/pi-mono/packages/coding-agent/src/core/extensions/)
- [agent-session.ts](../../repos/pi-mono/packages/coding-agent/src/core/agent-session.ts)
- [session-manager.ts](../../repos/pi-mono/packages/coding-agent/src/core/session-manager.ts)

3. **输出 [design.md](design.md)**：

- 简述架构选择：为什么该需求适合用 Extension 实现？如果仅放一个 Skill 或仅注册一个 Tool 能否满足全部行为？你选择了哪些公开接口，各自职责是什么？
- 设计测试序列：设计一组能明确区分“已保存”、“已从文件恢复”、“模型本次实际收到”的验证序列，并标出预期结果。

### 第二步：集中实现与集成测试

完成 [rules-extension.ts](rules-extension.ts) 与 [rules.test.ts](rules.test.ts)（中间无需每改几行就等待审查，可集中完成后一并提交）。

**测试必须覆盖的 4 大核心场景**（测试数量不限，禁止吞掉断言错误）：

1. **命令反馈**：增、删、改、查及非法输入的 UI 通知符合预期。
2. **模型请求快照**：`requests[i].systemPrompt` 准确反映当前有效约定，无重复累积。
3. **真实文件恢复**：销毁会话后，用新 `SessionManager` + 新扩展实例读取同一 JSONL 文件，列表与模型请求均恢复正常。
4. **新会话隔离**：新建会话状态为空，不影响原会话。

### 第三步：运行验证与提交

在工作区根目录下依次运行以下三条命令，确保全部通过：

```sh
# 1. 检查基础测试设施
node repos/pi-mono/node_modules/vitest/dist/cli.js --run --root practice/08-session-rules --config ../../repos/pi-mono/packages/coding-agent/vitest.config.ts fixtures.test.ts

# 2. 运行你的端到端集成测试
node repos/pi-mono/node_modules/vitest/dist/cli.js --run --root practice/08-session-rules --config ../../repos/pi-mono/packages/coding-agent/vitest.config.ts rules.test.ts

# 3. 运行 TypeScript 类型检查
node repos/pi-mono/node_modules/typescript/lib/tsc.js -p practice/08-session-rules/tsconfig.json --pretty false

```

**最终提交物**：代码实现（[rules-extension.ts](rules-extension.ts)、[rules.test.ts](rules.test.ts)）、设计文档（[design.md](design.md)）以及最终运行证据（需记录执行的命令、运行时间、测试覆盖范围、相关文件哈希，以及过程中若有 AI 协助的具体范围）。
