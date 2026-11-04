# 带来源的历史会话查询

在 `history-tools.ts` 实现 `createHistoryTools(options)`，返回可注册到真实 pi Agent 的两个工具：`search_history` 和 `read_history`。新会话通过它们找回旧会话中讨论过的内容，并用来源标识核对原文。

## 输入与工具契约

`options` 包含 `cwd: string` 与 `sources: Array<{ key: string; file: string; leafId: string }>`。`key` 是调用方分配的唯一来源别名，`file` 是真实 pi JSONL 会话文件的绝对路径，`leafId` 指定允许查询的分支终点。配置在本轮有效且文件固定；目录使用规范化绝对路径。

只查询文件 header 的 cwd 与 options.cwd 相同的来源。每个来源只包含根节点到指定 leafId 的路径，且仅检索 user/assistant 消息中的文本。多个文本块用换行连接；thinking、工具调用及其他 entry 类型不作为正文。压缩前的原文仍可检索。

### search_history

参数：`{ query: string }`。query 去掉首尾空白后不能为空；按不区分大小写的连续子串匹配，每条消息算一项。顺序为 sources 配置顺序、同一来源路径顺序，最多返回 5 项。

工具文本结果为 JSON：`{ hits: [{ source, entryId, role, preview }] }`。source 为配置 key；preview 为完整正文前 120 个 JavaScript 字符，不加省略号。无匹配返回 `{ hits: [] }`。搜索结果不携带全文。

### read_history

参数：`{ source: string, entryId: string }`。返回 JSON：`{ source, entryId, role, text }`，text 为上述规则提取的完整原文。

来源不存在、属于另一 cwd、entry 不在该指定分支或不是可读取消息时，返回 Agent 错误工具结果，文本含 `HISTORY_NOT_FOUND`。不能通过猜测 entryId 绕过搜索范围。查询失败后正常查询仍可执行。

两种工具都保持源文件内容不变；来源标识必须足以从同一来源重新定位消息。历史原文是历史资料，不代表当前仍有效的决定。

## 完成标准

- 从磁盘重新读取真实 pi 会话，完成搜索和原文读取；不依赖生成样例时保留的内存对象。
- 真实 Agent 经离线模型发起 search，再根据返回的来源发起 read；下一次模型请求中能观察到对应结果和工具调用 ID。首轮请求中不预先塞入全部历史。
- 提交源码定位与设计说明、实现和可复现验证。测试代码可由 AI 编写，先由你给出输入、预期和观察位置。

边界：本轮固定文件与指定分支；不处理在线追加、损坏文件、语义排序、token 预算、向量库或自动判断决策是否过期。`preview` 是字符限制，不是 token 限制。

## 文件与运行

- `history-tools.ts`：待实现入口；具体类型、模块拆分与源码入口由你确定。
- `design.md`：记录定位依据、方案和验证选择。
- `fixtures.ts`：AI 提供真实会话样例生成与清理，包含同项目分支、压缩记录及其他项目。
- `fixtures.test.ts`：仅检查设施，不验收你的功能。

复用仓库依赖，在工作区根目录执行：

```sh
node repos/pi-mono/node_modules/vitest/dist/cli.js --run --root practice/10-history-retrieval --config ../../repos/pi-mono/packages/coding-agent/vitest.config.ts
node repos/pi-mono/node_modules/typescript/lib/tsc.js -p practice/10-history-retrieval/tsconfig.json --pretty false
```

先集中完成源码定位和方案，再集中实现。可以先阅读会话管理相关模块与测试；不需要通读仓库。
