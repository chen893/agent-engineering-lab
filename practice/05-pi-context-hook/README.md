# 实验 05：给真实 pi Agent 接入请求历史裁剪

模式：能力校准。AI 提供真实类型接口、模拟模型、测试与运行入口；用户实现策略并解释状态变化。这里运行实际 pi Agent，不再手写一个 mini-agent。

## 为什么做这项

04 已验证独立裁剪函数，尚未验证它作为框架 hook 时的调用顺序、状态归属和多轮行为。本轮换成简单明确的“最近 N 个用户轮次”策略，主要学习真实接口与集成，不重复字符成本计算。此策略是练习需求，不是 pi 默认策略，也不是 session compaction。

## 源码依据与先读范围

2026-10-17 核对 HEAD：`9a3ca68bda4db67efc506ec114bffe64635e8569`。工作树 [packages/agent/src/agent-loop.ts](../../repos/pi-mono/packages/agent/src/agent-loop.ts) 有既存未提交修改，本轮未改它；以下基于当前工作树，不宣称是干净提交行为。

按顺序只读这些位置（显示的路径相对 repos/pi-mono，链接可直接点击跳转）：

1. [packages/agent/src/types.ts](../../repos/pi-mono/packages/agent/src/types.ts) 的 AgentLoopConfig.transformContext / convertToLlm 注释（约 195–244 行）：两者约定不能抛错，transform 在 convert 前。
2. [packages/agent/src/agent-loop.ts](../../repos/pi-mono/packages/agent/src/agent-loop.ts) 的 streamAssistantResponse（约 435–463 行）：局部 messages 如何进入模型请求，与 context.messages 的关系。
3. [packages/agent/src/agent.ts](../../repos/pi-mono/packages/agent/src/agent.ts) 的 AgentOptions、构造函数及配置传递（约 114、231、493 行）。
4. [packages/ai/src/types.ts](../../repos/pi-mono/packages/ai/src/types.ts) 的 Message（约 538–644 行）：system、user、assistant、toolResult，工具调用块为 toolCall。

先在 [prediction.md](prediction.md) 回答三个问题，再集中实现；不必等助手逐项批准。

## 本轮输入契约

- 只使用上述 pi 标准消息，不包含 custom 消息；消息为正常内存数据，不含有副作用的 getter。
- 一个“用户轮次”从一条 user 开始，到下一条 user 之前结束；其中可能包含多次模型响应及多批工具调用，不等同于 pi 的单次模型 turn。
- 输入来自串行对话：工具调用与对应结果完整、连续，不跨 user 边界。最新一轮可以仅有 user，或停在完整工具批次后。没有未完成工具调用。
- system 可出现在轮次之间或批次外；全部保留并保持顺序。首条 user 之前只有 system；无 user 时不裁剪。
- 不要求支持插话、乱序工具结果、畸形历史校验、图片预算或自定义消息。

## 要实现什么

只实现 [context-hook.ts](context-hook.ts) 中的 `createRecentTurnsTransform(keepUserTurns)`，返回与真实 `AgentOptions.transformContext` 相同类型的异步函数。

1. keepUserTurns 为有限正整数时，保留最近 N 个用户轮次以及所有 system；轮次不足时保留全部。
2. 按轮次整体移除旧 user、assistant 和 toolResult，不改写消息、顺序或任何字段，不修改输入数组和消息对象。
3. 无 user、空历史，以及非法配置（0、负数、小数、NaN、Infinity）均原样回退，不抛错或拒绝 Promise。非法配置回退是本练习选择，不是 pi 强制配置策略。
4. 不维护跨请求累计计数；每次 hook 收到的历史都应独立判断。
5. 真实 Agent 连续两次 prompt 后，每次 convertToLlm 和模拟模型只收到对应保留轮次，而 agent.state.messages 仍有完整旧历史和新增回答。

本轮不设硬 token/字符预算，也不要求“超预算时阻止请求”：transformContext 的无抛错契约不适合直接照搬 04 的 cannot_fit 分支。硬预算停止需另选请求生命周期入口、明确正常错误事件，另行设计。

## 文件与运行

- [context-hook.ts](context-hook.ts)：用户实现；当前为原样返回的占位。
- [fixtures.ts](fixtures.ts)：AI 提供真实消息及模拟传输。无网络、API key 或付费模型调用。
- [context-hook.test.ts](context-hook.test.ts)：AI 编写单元与真实 Agent 集成验收。
- [prediction.md](prediction.md)：实现前预测与疑问。

在工作区根目录运行（复用已存在的 pi 依赖与 Vitest 配置，无新 package）：

```sh
node repos/pi-mono/node_modules/vitest/dist/cli.js --run --root practice/05-pi-context-hook --config ../../repos/pi-mono/packages/agent/vitest.config.ts
```

如只核对环境，追加 `-t '真实 pi 接线基线'`。不要运行整个仓库测试套件。

完成标准：本文件 5 项测试通过；能指着源码解释 hook 返回新数组为何不裁剪 state，以及 hook 原地修改输入为何有风险。测试通过不等于完成静态类型检查或掌握完整 compaction。

测试的多轮集成使用两次 prompt；工具历史完整性通过真实消息夹具验证。本轮不覆盖真实工具执行后再次调用 hook 的集成轨迹，不能宣称已验证。

## 后续安排（只定方向，完成本轮后再固定需求）

- **下一阶段：session 历史与 compaction。** 当前已读到 [packages/coding-agent/src/core/agent-session.ts](../../repos/pi-mono/packages/coding-agent/src/core/agent-session.ts) 的 `_compactBeforeNextAssistantResponse`（约 777 行）与 `_installAgentRequestProjection`（约 788 行）。它们从 session projection 构造请求，不能把本轮 hook 当作 coding-agent 的完整压缩方案。下一阶段追踪 `buildSessionProjection` 与压缩记录，使用合成会话验证“历史保存、请求重建、重启恢复”，再选一个真实小改动。暂未完整阅读这条链，不预设修改点或验收答案。
- **再下一阶段：运行中控制。** 从 [packages/agent/src/agent.ts](../../repos/pi-mono/packages/agent/src/agent.ts) 的 `steer`、`followUp`、`abort` 入口出发，用可控 Promise 验证运行期间新消息与取消的状态变化。完成源码核对后选择一项需求，不把三项一起堆成大实验。
- 每阶段产出应包含真实调用链、一个实现或改动、相应验证证据。根据本轮暴露的卡点调整顺序，不机械按编号推进。
