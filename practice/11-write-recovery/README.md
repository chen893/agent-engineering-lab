# 练习 11：可恢复的工单提交 (Write Recovery)

## 1. 背景与目标

在调用外部服务创建工单时，可能会遇到“工单其实已经创建成功，但网络断开导致响应丢失”的情况。如果盲目重试，会导致重复创建工单。

本练习要求实现一个带本地状态持久化的协调器 `ticket-coordinator.ts`，并将其封装为 Agent 工具 `submit_ticket`（位于 `ticket-tool.ts`）。

**核心目标**：通过本地状态记录（`stateFile`）配合外部服务的查询接口（`lookup`），实现**安全的重试与恢复**——已创建的找回原结果，明确未创建的才重新创建，无法确认时如实返回 `unknown`，绝不重复建单。

---

## 2. 核心概念与前置假设

### 输入参数

- **`requestKey`**：业务请求的唯一幂等键。无论是重试工具调用，还是重启协调器/Agent，同一笔业务请求的 `requestKey` 始终不变。
- **`title`**：工单标题。**同一个 `requestKey` 只能绑定一个 `title`**（按字符串精确匹配）。
- **`toolCallId`**：单次 Agent 工具调用的 ID。同一笔业务请求（相同 `requestKey`）在不同轮次重试时，`toolCallId` 会发生变化。

### 环境与边界假设（你不需要操心的事）

- **参数合法**：所有输入均为非空合法字符串，`stateFile` 的父目录保证已存在且为绝对路径。
- **无并发冲突**：单进程顺序执行。不会出现并发调用 `submit`，也不会在前一个协调器还没执行完时就用同一个 `stateFile` 创建新实例。
- **无半途崩溃**：本地文件读写绝对可靠（可使用现成的 `openJsonStore<State>(stateFile)`）。只需保证 `submit` 返回后重启实例能恢复状态即可，无需考虑代码执行到一半进程突然 Crash 或磁盘损坏的情况。
- **独占访问**：所有请求均通过本协调器发出，外部服务中的工单不会被其他客户端修改或删除。

---

## 3. 外部服务契约 (`service`)

接口定义见 `contracts.ts`，测试桩见 `fixtures.ts`。

> **注意**：`service.create` **本身不具备幂等性**，重复调用会产生多个工单！`service.lookup` 是只读查询，不会产生副作用。

| 方法                     | 返回结果 / 抛出异常              | 业务含义                                                                           |
| ------------------------ | -------------------------------- | ---------------------------------------------------------------------------------- |
| **`create(input)`**      | `{ status: 'created', ticket }`  | **创建成功**：返回包含 `ticketId` 的工单。                                         |
|                          | `{ status: 'rejected', reason }` | **明确拒绝**：本次未创建工单，且该请求进入终态（后续不应再重试）。                 |
|                          | 抛出 `'CONNECTION_LOST'` 异常    | **结果未知**：网络断开。工单**可能已创建，也可能没创建**（无法从异常信息中区分）。 |
| **`lookup(requestKey)`** | `{ status: 'found', ticket }`    | **查到工单**：说明之前的请求实际上创建成功了。                                     |
|                          | `{ status: 'absent' }`           | **确认不存在**：说明之前的请求确实没创建成功（也不会有延迟到达的幽灵请求）。       |
|                          | `{ status: 'unavailable' }`      | **查询不可用**：当前服务故障，依然无法确认工单是否已创建。                         |

---

## 4. `coordinator.submit` 核心逻辑（状态机）

请实现 `createTicketCoordinator({ service, stateFile })`，暴露 `submit({ requestKey, title }): Promise<SubmitResult>` 方法（返回值均需携带 `requestKey`）。

你可以将每个 `requestKey` 在本地 `stateFile` 中的状态设计为以下几种，并按此规则流转：

### 规则一：标题一致性校验（最高优先级）

- 如果 `requestKey` 在本地已有记录（无论处于什么状态），但本次传入的 `title` 与首次记录的 `title` **不一致**：
- 直接返回 `{ status: 'conflict', requestKey }`。
- **严禁**调用外部服务，**严禁**修改或覆盖本地原有记录。

### 规则二：按本地状态执行决策

| 本地记录状态          | 本次 `submit` 的执行动作 | 外部服务返回 / 异常    | 更新本地状态为             | 本次 `submit` 返回值                                |
| --------------------- | ------------------------ | ---------------------- | -------------------------- | --------------------------------------------------- |
| **无记录 (首次提交)** | 调用 `service.create`    | `created` (含 ticket)  | **已创建** (保存 ticketId) | `created` + `ticketId`                              |
|                       |                          | `rejected` (含 reason) | **已拒绝** (保存 reason)   | `rejected` + `reason`                               |
|                       |                          | 抛出 `CONNECTION_LOST` | 本地记录状态 | 执行动作 | 查询结果 | 后续行为 |
| --- | --- | --- | --- |
| unknown | 调用 lookup | found | 保存 created 与 ticketId，返回 created，不再 create |
| unknown | 调用 lookup | unavailable | 保持 unknown，返回 unknown |
| unknown | 调用 lookup | absent | 调用一次 create，按首次提交的规则处理 |

### 规则三：实现红线

1. **单次上限**：每次调用 `submit` 最多只能触发一次 `service.create`；不要在 `submit` 内部写自动等待、轮询（polling）或后台自动重试。
2. **跨实例持久化**：销毁当前协调器后，使用相同的 `stateFile` 和 `service` 实例化新协调器时，上述所有状态记忆必须依然生效。不同 `requestKey` 之间互不干扰。
3. **禁止作弊**：只能通过 `service.create` 和 `service.lookup` 与外部服务交互，严禁在业务代码里直接读取测试桩（fixtures）内部的 `tickets` 或 `trace` 数组。

---

## 5. Agent 工具接入 (`ticket-tool.ts`)

使用 `createTicketTool(coordinator)` 将协调器包装为真实 pi Agent 的 `submit_ticket` 工具：

- **返回格式**：将 `SubmitResult` 序列化为 JSON 文本返回给大模型。
- **错误处理**：所有的业务状态（包括 `rejected`、`unknown`、`conflict`）都属于正常的工具返回结果，通过 JSON 里的 `status` 字段表达，**不要通过抛出异常（throw Error）来传递业务状态**。

---

## 6. 工作流与测试验收要求

### 开发步骤建议

1. **先写设计 (`design.md`)**：在写代码前，先在 `design.md` 中明确你的本地持久化数据结构（State Schema）以及核心测试用例设计。
2. **集中实现**：完成 `ticket-coordinator.ts` 和 `ticket-tool.ts`。
3. **补齐测试**：现有的 `fixtures.test.ts` 仅用于验证测试桩本身；`coordinator.test.ts` 里的 `todo` 只是占位符。请根据设计方案补齐完整的单元测试与 Agent 集成测试。

### 必测场景清单

**1. 协调器单元测试 (`coordinator.test.ts`)**
验证时需同时断言：**函数返回值**、**`service` 的调用轨迹 (create/lookup 次数与顺序)**、**最终生成的工单总数**，以及**重启实例后的持久化效果**。需覆盖：

- 首次提交直接成功 (`created`)
- 首次提交被明确拒绝 (`rejected`)
- 终态请求的重复提交（验证缓存命中，不调外部服务）
- 同一 `requestKey` 传入不同 `title`（验证返回 `conflict` 且不污染原状态）
- 断连发生在工单创建**前**（下次重试 `lookup` 返回 `absent` $\rightarrow$ 重新 `create` 成功）
- 断连发生在工单创建**后**（下次重试 `lookup` 返回 `found` $\rightarrow$ 直接找回原工单）
- 断连后遇到查询服务不可用（`lookup` 返回 `unavailable` $\rightarrow$ 仍返回 `unknown` $\rightarrow$ 再次重试恢复）
- 销毁协调器并基于同一 `stateFile` 重新创建实例后的状态恢复。

**2. Agent 端到端集成测试**

- **参考实现**：离线模型（Mock LLM）设施可复用 `../09-mcp-tool-bridge/fixtures.ts`，Agent 接入方式参考 `../10-history-retrieval/agent-integration.test.ts`（大模型响应可脚本化，但工具必须由真实的 Agent 框架调度执行）。
- **必测黄金链路**：

1. 第一轮：模型发起工具调用，`service.create` 在**创建工单后发生断连**，工具向模型返回 `unknown`。
2. 第二轮：模型收到 `unknown` 后，生成一个新的 `toolCallId`，但携带**相同的 `requestKey` 和 `title`** 再次调用工具。
3. 结果验证：模型在第二轮拿到原工单的 `created` 结果；检查外部服务，确保自始至终**只生成了 1 个工单**。

---

## 7. 运行与类型检查

请在工作区根目录下执行以下命令进行验证：

```sh
# 运行单元测试与集成测试
node repos/pi-mono/node_modules/vitest/dist/cli.js --run --root practice/11-write-recovery --config ../../repos/pi-mono/packages/coding-agent/vitest.config.ts

# 运行 TypeScript 类型检查
node repos/pi-mono/node_modules/typescript/lib/tsc.js -p practice/11-write-recovery/tsconfig.json --pretty false

```

---
