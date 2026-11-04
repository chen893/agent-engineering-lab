# 实现初审

## 收尾复验：2026-11-03 15:34 +08:00

按用户要求更新进展并安排下一实践。核对 integration.sha256 时仅 agent-integration.test.ts 不匹配，读取当前文件发现新增一行阅读提示注释；其余 11 个文件匹配。为绑定当前版本，重新运行本文原 vitest 与 tsc 命令：15:34:17 开始，3 files / 9 tests passed，tsc 退出码 0。当前版本见 [closing.sha256](closing.sha256)。未修改用户实现或测试逻辑。

本实验功能收尾，分项能力与帮助范围沿用 15:26 记录。用户已说明 getBranch 选型依据；没有新增证据证明已独立理解 Agent 接线、独立完成迁移或验证真实模型策略。接线阅读改为可选复盘，不作为新实践前置条件。下一实践为写操作结果不确定时的恢复，契约见 [README](../11-write-recovery/README.md)，选题及分工见其 preparation.md。

## 最新验证：2026-11-03 15:26 +08:00

用户明确要求 AI 完成接线。本轮 AI 完整实现 `agent-integration.test.ts`：真实 Agent 组装、三轮离线响应、从搜索结果派生读取参数、请求快照与工具调用 ID 断言、最终带来源输出和清理。未修改 `history-tools.ts`。AI 将设计占位与旧需求摘录整理为 design.md，补充实际源码依据、索引方案、接入与验证说明；不计为用户自行完成的源码定位或文档设计。

运行仍为下方 README 两条命令：15:26:20 开始，vitest 3 files / 9 tests passed（工具层审查 7 + Agent 集成 1 + 设施 1），退出码 0；tsc 退出码 0。版本见 [integration.sha256](integration.sha256)，包括依赖的离线设施与实际 Agent 工作树文件；pi HEAD 仍为 `36be9c612e64082a4f0d4d0a94706c38ecbc20a1`，有既存未提交修改。本轮只读核对 pi 源码与相关测试片段，未运行 pi 全仓测试。

集成证据：首轮工具已注册且无历史正文；第二轮收到调用 ID 为 history-search 的匹配结果，仅有 120 字符预览；响应回调只从该结果取得 source/entryId；第三轮收到 history-read 对应全文，最终回答包含相同来源。离线脚本验证协议与接线，不证明真实模型会自主选择正确检索策略。

用户解释证据：自行说明选择 getBranch 是因为它沿 parentId 回溯路径，而 buildSessionContext 是发送给 LLM 的压缩后信息，不能用于恢复被摘要替代的原文。该选型理由有效；AI 据源码补充精度：压缩前的保留区间仍可出现在模型上下文，不能概括为全部压缩前消息都不可见。此补充由 AI 提供，不冒充用户已独立说出。

当前提交的工具层与真实 Agent 闭环用例均通过，设计说明已整理；能力证据区分如下：核心查询与各次修复由用户完成，获得过具体反例/定位/提取方式提示；测试与最终 Agent 接线由 AI 完成。解释层已有上述选型证据，真实 Agent 独立接线与变式迁移仍未验证，不因功能通过推定独立掌握。下一步先让用户阅读集成测试，确认实际消息流；无需继续机械增加查询边界用例。

范围限制沿用历史记录：当前格式固定文件、确定性搜索与离线 Agent 闭环；损坏文件、在线更新、真实模型策略与旧格式迁移未验证。非消息 entry 的独立读取拒绝尚无专门用例，本轮通过不表述为所有类型与分支的穷尽验证。

## 前次复验：2026-11-03 15:17 +08:00

版本见 [recheck-3.sha256](recheck-3.sha256)。用户将正文提取改为按 type 过滤后再 map/join，保留混合文本中的空白块。沿用下方两条命令：vitest 8/8 passed（审查 7 + 设施 1），退出码 0；tsc 退出码 0。此次未新增用例或修改实现；此前已复现问题的现有回归用例全部通过。

结论范围为当前测试覆盖的工具层行为：公共配置、分支/cwd、压缩前原文、搜索与读取、顺序/上限、混合内容与空白保真、特殊来源名、错误后恢复和当前格式样例只读。未据此认定实验整体验收通过：真实 Agent search → read → 后续请求结果/toolCallId 闭环与设计依据仍待完成，先前列出的未覆盖范围未自动验证。

实现及全部修复由用户完成，AI 提供过反例、具体定位与提取维度提示并编写验证；本轮仅复验和记录。下一步推进既定 Agent 接线与设计说明，不因这些局部修复另设补习任务。

## 前次复验：2026-11-03 15:14 +08:00

版本见 [recheck-2.sha256](recheck-2.sha256)。沿用下方两条运行命令。用户补上 filter 回调 return；15:13 原有 7 项全部通过（审查 6 + 设施 1），tsc 通过，原有三组问题的既有用例已通过。

AI 核对同一正文提取改动时发现，按 trim 后长度过滤也会删除合法空白/空字符串 text 块，与 README「多个文本块用换行连接」和「完整原文」不一致。补充一项保真用例后于 15:14 重跑：7 passed / 1 failed，退出码 1；tsc 退出码 0。输入 text 块依次为 `"alpha"`、`" "`、`""`、`"beta"`，读取预期 `"alpha\n \n\nbeta"`，实际 `"alpha\nbeta"`。新增用例修补此前混合块测试未覆盖空白文本块的缺口，属于既有契约，不是新增需求。

下一步：按内容块类型区分正文与非正文，保留正文块内部的空白与块间换行，再重跑。本轮 AI 仅增加测试、说明过滤维度，未改核心实现。Agent 闭环与设计依据仍待完成。

## 前次复验：2026-11-03 15:11 +08:00

版本见 [recheck.sha256](recheck.sha256)。沿用下方两条运行命令：vitest 退出码 1，审查用例 1 passed / 5 failed，设施 1 passed；tsc 退出码 0。本次 AI 已移除 review.test.ts 的 leaftId 兼容及 options 类型断言，所有用例使用公共 leafId 配置。未修改用户核心实现。

用户将字段改为 leafId，索引改为 Map；公共配置初始化成功，未知来源 toString 返回 HISTORY_NOT_FOUND。合法 __proto__ 别名已不再触发初始化 .push 异常，但完整搜索/读取仍被下述问题阻塞，未记通过。

当前五个失败共享一个已定位原因：history-tools.ts:112–114 的 filter 回调使用花括号但没有 return，所有文本块都被过滤，导致索引没有可读取消息；Redis/缓存/needle 搜索均为空，混合块读取返回 HISTORY_NOT_FOUND。混合块用例随后出现 JSON 解析错误及 __proto__ 用例访问 undefined，是前述失败的后续表现，不另归因于 JSON 处理或 Map。

本次只提供具体定位与回调返回值解释，修复仍由用户承担。下一步先修复正文提取，再用相同命令复验；沿用既有契约，仅提取 text 块并以换行连接。历史初审结果保留如下，不作为当前版本通过证据；本轮不能沿用旧版分支/排序等通过结论。Agent 闭环与设计依据仍待完成。

## 首次审查

2026-11-03 14:51 +08:00。本轮审查版本见 [review.sha256](review.sha256)，pi HEAD 为 `36be9c612e64082a4f0d4d0a94706c38ecbc20a1`，工作树有既存修改；未修改 pi 或用户实现。

## 运行结果

在工作区根目录运行：

```sh
node repos/pi-mono/node_modules/vitest/dist/cli.js --run --root practice/10-history-retrieval --config ../../repos/pi-mono/packages/coding-agent/vitest.config.ts
node repos/pi-mono/node_modules/typescript/lib/tsc.js -p practice/10-history-retrieval/tsconfig.json --pretty false
```

- vitest：7 项共 3 passed / 4 failed，退出码 1。其中设施 1 passed，审查用例 2 passed / 4 failed。
- tsc：退出码 0。公共契约运行用例通过显式类型断言传入 README 的 `leafId`，因此 tsc 通过不证明公开配置类型正确。
- 首项用原始 `leafId`；其余诊断用例临时同时提供 `leafId` 和 `leaftId`，只隔离字段错误，不能算公开 API 验收通过。修正后应移除兼容字段及类型断言再验收。

## 已复现问题

1. `ToolsOptions`、校验和 getBranch 参数采用 `leaftId`，标准 `leafId` 配置在初始化时抛错。
2. 输入 `[thinking, text("alpha"), toolCall, text("beta")]`，读取返回 `"\nalpha\n\nbeta"`，应为 `"alpha\nbeta"`；连续子串搜索也受影响。范围：正文提取的 map/join。
3. `entriesMap` 使用普通对象。未配置来源 `toString` 会命中原型属性，抛出 `entries.find is not a function`，未得到 `HISTORY_NOT_FOUND`；配置合法唯一别名 `__proto__` 则初始化抛出 `.push is not a function`。契约未限制 key 排除这些名称。

## 条件性通过与未覆盖范围

临时兼容拼写后的诊断通过：分支路径排除废弃分支、cwd 隔离、压缩前正文、120 字预览和完整读取、普通未知 source/entryId 错误、错误后正常查询、当前版本样例文件前后不变；大小写/trim、无匹配、空查询拒绝、sources 顺序、跨来源同 entryId 不去重、五项上限。

未验收：真实 Agent search → read → 后续请求中的结果与 toolCallId；设计中的源码定位与三种历史视图解释；非消息/无正文 entry 等更完整验证。文件不变结论只覆盖当前版本样例，未验证历史格式迁移。`SessionManager.open` 的加载路径存在迁移重写逻辑，后续如需支持旧版本文件须针对只读契约核对，尚未复现旧版本改写。

用户列的 abort 场景作为扩展，不计本轮验收失败。当前查询循环同步执行，中途 abort 的触发时序需另行定义。空 source/entryId 的错误文本尚无明确约定，本轮不扩写为新验收条件。

## 分工与下一步

用户提交核心类型与搜索/读取实现；design.md 自行列出空查询、匹配数量/大小写、来源顺序/同 ID、cwd、不可读与多文本块等场景。源码定位与方案仍为占位加需求摘录，不把记录缺失认作理解不足。

AI 编写全部 review.test.ts，补充契约内混合内容、原型属性来源反例及分支/压缩/文件不变断言，运行测试并给出定位；未修改核心实现、提供修复代码或替用户完成 Agent 接线。用户继续集中修正上述三组问题，补齐设计依据和真实 Agent 接线，再集中验收；实现能力仅有提交与条件性运行证据，解释与迁移待验证。
