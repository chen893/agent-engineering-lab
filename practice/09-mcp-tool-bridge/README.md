# 实验 09：将外部 MCP 工具接入 pi Agent Core

## 1. 任务背景与目标

在实际应用中，排障助手往往需要查询多个外部数据源（如项目文档库 `docs` 和工单系统 `issues`）。Agent 宿主不应硬编码每个系统的查询逻辑，而是通过 **MCP（Model Context Protocol）** 动态接入外部服务。

**本实验目标**：使用底层的 `pi Agent Core` 和仓库现有的 `McpClient`，在 `mcp-agent.ts` 中实现一个**通用 MCP 工具桥接器**，完成从“启动子进程服务 → 发现远端工具 → 注入 Agent → 路由调用与错误处理 → 生命周期销毁”的完整闭环。

> **注意**：请基于底层的 Agent Core 自行实现适配逻辑，**不要**直接调用 `coding-agent` 包中已封装好的现成 MCP 集成，也不要修改 `pi` 源码

---

## 2. 接口契约 (`mcp-agent.ts`)

请实现 `createMcpAgent(options)` 函数，并将入口参数中的 `unknown` 替换为准确的 TypeScript 类型（禁用 `any` / `as any`）。

### 输入参数 `options`

- `servers`：MCP 服务器配置数组，每项包含 `{ name, command, args }`。
- `name` 唯一；本实验中服务名与远端工具名仅含小写字母、数字和下划线，拼接后长度不超过 64 字符。

- `model`、`streamFn`、`getApiKey`：模型运行配置，直接透传给 Agent（测试时使用 fixture 提供的离线配置，无需真实 API Key）。

### 返回值

- `agent`：组装完成的真实 `pi` Agent 实例（外部通过 `await agent.prompt(...)` 驱动）。
- `dispose(): Promise<void>`：资源清理函数，负责关闭当前实例持有的所有 MCP 客户端与子进程。需保证幂等性（重复调用安全）。

---

## 3. 四大核心要求

### ① 连接与动态发现

- **复用底层能力**：使用仓库现有的 `McpClient` 与 `StdioTransport` 启动独立子进程、完成握手初始化并拉取工具列表（无需手写 JSON-RPC、分帧或杀进程逻辑）。
- **就绪保证**：`createMcpAgent` resolve 时，所有服务器的工具必须已完成发现并注册到 Agent，不可返回未初始化完毕的半成品。
- **完全动态化**：严禁在代码中硬编码 `search` / `get` 的 Schema 或业务数据。工具定义必须动态取自服务端——当服务端新增工具（如 `health`）时，无需修改代码即可自动接入。

### ② 命名空间路由与 Schema 桥接

由于 `docs` 和 `issues` 服务都提供同名的 `search` 和 `get` 工具，需做命名空间隔离：

- **命名规则**：注册到 Agent 的工具名统一格式化为 `mcp__<server>__<tool>`（如 `mcp__docs__search`、`mcp__issues__search`）。
- **精准路由**：当模型发起工具调用时，需解析出对应的服务名与原工具名，将参数转发给正确的 MCP 服务进程。
- **Schema 转换**：保留远端工具的 `description`、参数 `schema` 和 `required` 约束。仅需支持简单的 Object Schema（`string` 属性、`required`、`additionalProperties`）和纯文本返回结果。可借助 TypeBox 机制将运行时 JSON Schema 桥接为 `pi` 所需的类型定义（严禁使用 `as any` 绕过类型检查）。

### ③ 调用链路与错误处理

调用链必须完整走通：`模型响应 → 真实 Agent → 适配工具 → MCP 子进程 → Agent 工具结果 → 下一次模型请求`。

- **正常结果**：完整保留服务端返回的文本，工具调用 ID 由真实 Agent 链路自动关联。
- **业务错误 (`isError: true`)**：当服务端返回业务错误（如查询不存在的 ID 返回 `NOT_FOUND` 且 `isError: true`）时，必须将其转换为 Agent 的错误工具结果，并保留原始错误文本。单次业务错误不得影响后续工具调用。
- **进程崩溃/断连**：若服务子进程在调用期间异常退出，本次调用须明确报错失败，Agent 不能无限挂起，也不能伪装成空成功结果（无需实现自动重连或重试；可直接抛出客户端异常交由 Agent 运行时捕获为错误结果）。
- **取消信号**：将运行时提供的 `AbortSignal` 透传给 MCP 客户端接口即可（本轮不额外考核取消竞态）。

### ④ 资源生命周期管理

- **正常销毁**：调用 `dispose()` 后，所有已启动的 MCP 子进程必须彻底退出，不得残留后台进程。
- **部分启动失败回滚（原子性）**：若 `createMcpAgent` 初始化期间某个服务启动失败（如第 2 个服务崩溃），函数应 reject 抛出异常，同时**必须清理已成功启动的前序服务进程**，防止资源泄漏。

---

## 4. 测试设施与 Mock 环境说明

实验已为你准备好受限的 MCP 测试服务端（`catalog-server.mjs`）和离线测试夹具（`createFixture`），你无需编写服务端或模拟模型流。

### 外部服务行为 (`catalog-server.mjs`)

| 服务名       | `search(query)` 行为                                       | `get(id)` 行为                                                                         |
| ------------ | ---------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| **`docs`**   | 按标题/正文子串搜索，返回匹配列表（无匹配返回空数组 `[]`） | 支持获取 `build-guide`、`cache-guide` 正文；不存在时返回 `NOT_FOUND` (`isError: true`) |
| **`issues`** | 同上（数据源与 docs 独立）                                 | 支持获取 `ISSUE-17`、`ISSUE-23` 正文；不存在时返回 `NOT_FOUND` (`isError: true`)       |

### 测试夹具 API (`await createFixture(options?)`)

- **基础配置**：提供 `servers`、`model`、`streamFn`、`getApiKey` 直接传给你的 `createMcpAgent`。
- **`queueResponses(...callbacks)` / `queueReplies(n)**`：编排离线模型的返回响应（可使用 `pi-ai`的`fauxAssistantMessage`/`fauxToolCall` 构造工具调用）。
- **`requests`**：记录每次发送给模型的请求快照（含 `context`），用于断言工具声明是否正确注入、工具结果是否正确回传。
- **`readTrace("docs" | "issues")`**：读取服务端进程的真实 `PID` 及收到的协议消息（用于验证是否真正触发了远端调用并杀死了进程）。
- **`dispose()`**：测试环境的兜底清理。**注意：测试中必须先断言你自己的 `dispose()` 或异常回滚已经杀死了子进程，最后才能调用 `fixture.dispose()`。**

### 故障注入选项 (`createFixture(options)`)

- `docsExtraTool: true`：让 `docs` 服务额外暴露一个无参的 `health` 工具，用于测试动态发现能力。
- `issuesFault: "initialize"`：让 `issues` 服务在收到 `initialize` 时直接崩溃退出，用于测试创建失败时的资源回滚。
- `issuesFault: "call"`：让 `issues` 服务在正常初始化后、收到 `tools/call` 时崩溃退出，用于测试调用期断连处理。

---

## 5. 实施步骤与常用命令

### 第一步：阅读源码接口（按需查阅，无需通读全仓）

- **MCP 客户端与错误类型**：`repos/pi-mono/packages/mcp/src/index.ts`、`client.ts`
- **Stdio 进程传输与关闭**：`repos/pi-mono/packages/mcp/src/transports/stdio.ts`
- **Agent 与 Tool 定义**：`repos/pi-mono/packages/agent/src/types.ts`、`agent.ts`
- **离线消息构造器**：`repos/pi-mono/packages/ai/src/providers/faux.ts`

### 第二步：先写设计，再写代码

1. 先查阅上述接口，在 `design.md` 中用简短的篇幅写出你的**适配方案**和**测试验证序列**。
2. 完成 `mcp-agent.ts` 的编码实现。
3. 编写测试用例（可参考或扩展 `fixtures.test.ts`）。如果你希望让 AI 帮你生成测试代码，请先向 AI 说明每个测试的**输入操作、预期结果和断言观察点**。

### 第三步：运行测试与类型检查

测试用例需覆盖以下 6 个核心场景：**① 工具动态发现与同名路由、② 正常查询闭环、③ 服务端业务错误 (`isError: true`)、④ 调用期进程异常退出、⑤ 初始化失败时的进程清理回滚、⑥ 正常 `dispose` 进程销毁**。

在工作区根目录下执行以下命令进行验收：

```sh
# 1. 运行 Vitest 单元测试
node repos/pi-mono/node_modules/vitest/dist/cli.js --run --root practice/09-mcp-tool-bridge --config ../../repos/pi-mono/packages/coding-agent/vitest.config.ts

# 2. 运行 TypeScript 类型检查
node repos/pi-mono/node_modules/typescript/lib/tsc.js -p practice/09-mcp-tool-bridge/tsconfig.json --pretty false

```
