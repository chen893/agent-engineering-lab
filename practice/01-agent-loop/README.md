# 01 · 最小 Agent Loop

来源：[实践入口第 1 项](../../面经资料/牛客-Agent-首批20篇/实践入口.md)，关联 Q001、Q003、Q004。

模式：能力校准，AI 提供脚手架，用户完成核心逻辑。以完整功能集中尝试和验收，不再逐分支等待反馈。

第一轮（循环与 follow-up）已收尾，收获、复习和下一轮验收见 [本轮复盘](retrospective.md)。下文保留已有行为契约。

## 当前任务

完成 `src/agent-loop.ts` 中的 `runAgent`，让模拟模型请求工具、取得工具结果，然后给出最终回答。已有的 `executeToolCall` 是用户实现，可以继续使用和修改。

先阅读 `src/types.ts` 的消息协议和本页要求，再集中实现；不需要先阅读全部测试。遇到具体卡点时，可带着未完成代码求助。

## 文件如何连接

```text
main.ts → runAgent（你实现）→ model（注入的模拟模型）
                         → executeToolCall（你的已有实现）
tests/loop.test.ts → 调用 runAgent 并观察输入与输出
```

- `types.ts`：AI 提供输入、消息与返回结果类型，非 pi 的真实协议。
- `mock-model.ts`：AI 提供模拟模型，只根据收到的消息生成响应。
- `main.ts`：AI 提供运行入口，打印最终状态与完整消息轨迹。
- `agent-loop.ts`：用户已有工具执行函数；AI 增加导出和 `runAgent` 空接口，没有提供循环答案。
- `tests/scaffold.test.ts`：AI 验证模拟模型和现有工具能连接。
- `tests/loop.test.ts`：AI 提供的本轮验收，不表示用户已能独立设计这些测试。

## 行为约定和集中验收

`runAgent` 接收 `{ messages, model, maxSteps }`，返回 `{ status, messages, steps }`。

- 初始历史由调用方传入，支持 system、user、assistant 和 tool 消息。保留全部传入历史与顺序，不原地修改调用方数组。
- 每次模型请求计一步；若该步返回工具调用，则该工具的执行及结果回传也属于这一步。`steps` 等于实际模型请求次数。
- 历史保留用户消息、模型响应与工具结果的真实顺序；下一次模型请求能看到此前调用及对应结果。
- 模型返回普通 assistant 消息：`{ role, content, call? }`。有调用时，即使同时有文字，也必须执行工具。本轮最多一个调用，不使用 `kind`。`call` 缺省或为 `null` 时保存回答，再检查可选 follow-up 回调；没有后续消息才以 `completed` 结束。
- 未知工具也要保留错误结果和调用 ID，并允许模型根据错误结果生成最终回答。
- 耗尽步数仍未得到最终回答时返回 `max_steps`。最后允许的一步仍要处理完工具调用；不能再发起下一次模型请求。
- `maxSteps: 0` 时不请求模型，保留全部初始历史，返回 `max_steps` 和 `steps: 0`。
- 在最后允许的一步得到回答且没有后续消息，仍应返回 `completed`；若取到了待处理 follow-up，则受总预算限制返回 `max_steps`。

本轮约定 `maxSteps` 为非负整数、工具参数为有效数字；先不加入非法参数、工具异常、取消、并发和真实模型。它们仍是完整实验的后续验收内容。

## 运行

在本机现有 Node.js 下无需安装依赖。Node 直接运行 TypeScript，不做静态类型检查。

```sh
cd practice/01-agent-loop
npm run check:scaffold
npm start -- normal
npm start -- unknown
npm start -- endless
npm start -- direct
npm test
```

`normal` 应两次模型请求后回答“计算结果：5”；`unknown` 应回传错误后得到最终回答；`endless` 应在三步后结束；`direct` 应一步结束。

用户已实现核心循环及 follow-up 迁移，最近集中验收为 7 项全部通过。不要修改验收断言来绕过功能要求。

Follow-up 使用可选的 `getFollowUpMessage?: () => string`：空字符串表示暂无消息，非空字符串作为用户消息追加并继续循环；整个运行共享 maxSteps，不重置计数。当前实现可能在最后一步取出并保留尚未被模型处理的后续消息，随后返回 max_steps；尚未提供恢复功能。

完成整体尝试后，把运行输出保存到 `evidence/`，说明一处预测与实际的差异，或一个实现取舍。再集中复盘，不要求每完成一个分支就提交。

## 后续完整实验

本轮通过后再处理非法参数、工具异常，保存正常与失败轨迹；随后选择多工具调用等变式，或对照 pi 的实际源码。当前测试通过不代表整个模块已掌握。

本轮模拟模型只返回正常响应，因此无工具调用就视为完成；真实接口还需区分请求失败、截断或取消等情况。完整传递当前历史是本轮约定，不代表生产系统永不裁剪上下文。
