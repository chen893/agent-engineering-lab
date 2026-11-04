# 历史查询设计

`createHistoryTools({ cwd, sources })` 从固定会话文件建立指定分支的正文索引，返回 `search_history` 和 `read_history`。完整输入输出契约见 [README](README.md)。

## 历史视图与源码依据

主要入口是 [session-manager.ts](../../repos/pi-mono/packages/coding-agent/src/core/session-manager.ts)：

| 视图 | 入口 | 包含的信息 |
|---|---|---|
| 文件记录 | `SessionManager.open(file)`、`getEntries()` | JSONL header 以及持久化 entries；entries 可来自不同分支，含压缩记录与旧原文 |
| 指定分支 | `getBranch(leafId)` | 从 leaf 沿 parentId 回溯，反转为根到 leaf 的顺序；含该路径所有 entry 类型，不因压缩而删除旧消息 |
| 模型上下文 | `buildSessionContext()` → `buildSessionProjection()` → `buildContextEntries()` | 当前路径经过压缩和上下文投影后的消息，包含摘要、保留区间及后续消息 |

选择 `getBranch(leafId)` 是因为查询需要指定路径的历史原文。直接遍历全部文件记录会包含其他分支；使用模型上下文则可能只得到摘要，找不到被摘要替代的正文。压缩并不意味着所有压缩前消息都消失：`buildContextEntries()` 会保留从 `firstKeptEntryId` 开始的区间。

`SessionManager.open` 未传 cwdOverride 时从 header 获取 cwd，因此这里以 `session.getCwd()` 与配置 cwd 比较。`getBranch` 返回的不全是可检索正文，还需要筛选 message、user/assistant 和 text 块。

相关行为测试位于 [tree-traversal.test.ts](../../repos/pi-mono/packages/coding-agent/test/session-manager/tree-traversal.test.ts) 与 [build-context.test.ts](../../repos/pi-mono/packages/coding-agent/test/session-manager/build-context.test.ts)，后者包含压缩后保留消息区间的断言。本实验运行证据见 [verification.md](verification.md)，不以源码测试的存在代替本实验运行结果。

## 索引与范围一致性

初始化按 sources 顺序打开文件，筛选同 cwd 的来源，再读取指定分支。仅保留 user/assistant 正文，数组内容按 text 类型筛选后用换行连接；空白文本块保留。当前实现跳过提取后整体为空白的消息。

索引使用 `Map<string, Array<{ entryId, role, text }>>`，key 为来源别名。Map 允许 `__proto__` 等字符串作为普通别名。消息保留路径顺序，不跨来源去重。

搜索遍历配置来源顺序和索引消息顺序，匹配 trim 后的小写 query，最多返回五项与 120 字符预览。读取只查同一索引中的 source/entryId，返回全文；未命中返回含 `HISTORY_NOT_FOUND` 的错误工具结果。两种工具共用初始化时确定的范围，因此读取不能绕过 cwd 或分支限制。

文件固定时，初始化索引避免每次查询重新解析。代价是全部允许正文常驻内存；在线追加和文件变化不在本轮范围内。

## Agent 接入与验证

[agent-integration.test.ts](agent-integration.test.ts) 使用真实 `Agent`，将工具放入 `initialState.tools`，通过离线设施提供 model、streamFn 和 getApiKey。复用的 [离线设施](../09-mcp-tool-bridge/fixtures.ts) 记录请求快照；本测试不创建 MCP 桥接器或服务进程。

一次 `agent.prompt()` 经历三轮模型请求：

1. 返回 `search_history` 调用；首轮请求只有当前问题和工具定义，没有预装历史正文。
2. 从实际收到的搜索 toolResult 解析 source/entryId，发起 `read_history`，读取参数不使用预先知道的样例 ID。
3. 从读取 toolResult 获取全文并输出带来源的历史资料。请求快照检查两个 toolCallId 及对应结果，验证搜索仅返回预览、读取返回全文。

离线响应脚本验证 Agent/工具协议与数据闭环，不验证真实模型自主检索策略。

| 验证组 | 输入与预期 | 观察位置 |
|---|---|---|
| 搜索 | 空查询拒绝、无匹配为空、trim/大小写匹配、来源与路径顺序、最多五项、同 ID 跨来源保留 | `review.test.ts` 工具文本结果 |
| 范围与来源 | 废弃分支、其他 cwd、未知来源/ID 不可读；错误后正常查询成功；特殊来源名可用 | `review.test.ts` 错误工具结果与后续查询 |
| 原文 | 压缩前原文仍可搜；混合块只取 text；空白块保留；预览 120 字符，读取完整正文 | `review.test.ts` 搜索与读取结果 |
| 文件 | 查询前后当前格式样例文件一致 | `review.test.ts` 文件内容比较 |
| Agent 闭环 | search → 从命中定位 read → 全文进入下一轮请求 | `agent-integration.test.ts` 的 `offline.requests` |

运行命令见 README。中途取消与历史格式迁移未纳入本轮验证范围。
