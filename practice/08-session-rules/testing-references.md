# 实验 08：测试参考阅读

本文由 AI 整理，供你独立编写 `rules.test.ts` 时参考；不提供完整测试实现或替代你的验证方案。验收契约仍以 [README.md](README.md) 为准。

参考于 2026-10-27 核对的本地 pi 源码，HEAD：`36be9c612e64082a4f0d4d0a94706c38ecbc20a1`。这里只做了源码阅读，没有运行这些参考测试，也没有验收当前扩展实现。后续源码变动时优先按用例名称定位。

## 建议阅读顺序

### 1. 加载真实扩展文件

文件：[resource-loader.test.ts](../../repos/pi-mono/packages/coding-agent/test/resource-loader.test.ts)，约第 43 行。

搜索用例：`should not treat a project manifest as the owner of a project extension`

重点观察：

- 如何准备独立的 `cwd`、`agentDir` 和临时扩展文件。
- 如何创建 `DefaultResourceLoader`、等待 `reload()`，再检查扩展加载结果。
- `beforeEach` / `afterEach` 如何隔离和清理测试目录。

对应你的工作：先确认真实 `rules-extension.ts` 已被加载。这个用例本身没有完成 AgentSession 接入或命令验证，不能只做到这里就认定扩展生效。

### 2. 通过 Session 分发命令，并证明没有调用模型

文件：[agent-session-prompt.test.ts](../../repos/pi-mono/packages/coding-agent/test/suite/agent-session-prompt.test.ts)，约第 319 行。

搜索用例：`dispatches extension commands without consuming a provider response`

重点观察：

- 如何通过 `session.prompt("/testcmd hello world")` 进入命令分发链路。
- 为什么预先排入模型回复，再检查回复仍未被消耗。
- 如何用可观察结果证明 handler 确实执行过。

对应你的工作：验证 `/rules` 命令的反馈，以及命令没有触发模型请求。你已有的设施提供 `requests`，可以思考怎样用它证明这一点。

注意：该用例通过 `extensionFactories` 注入扩展，不能直接照搬为本实验的加载方式。本实验要求加载真实扩展文件，不允许手动调用 command handler 代替集成。

### 3. 检查模型本次实际收到的 System Prompt

文件：[agent-session-prompt.test.ts](../../repos/pi-mono/packages/coding-agent/test/suite/agent-session-prompt.test.ts)，约第 569 行。

搜索用例：`keeps the same system prompt for every request of the run`

重点观察：

- 如何在模型边界捕获真实请求上下文。
- 如何从请求中检查有效 system prompt，而不是只检查扩展内部变量。
- 多次请求之间如何比较提示词，确认预期内容保持一致。

对应你的工作：`rules-extension.ts` 使用了 `before_agent_start`，因此要检查约定是否真正进入模型输入。你的设施已提供解析好的 `requests[i].systemPrompt`，无需重复实现参考文件里的上下文提取逻辑。

只借鉴输入捕获和断言思路；其中的工具调用、custom message 不是本实验要求。

补充参考：[system-prompt-updates.test.ts](../../repos/pi-mono/packages/coding-agent/test/system-prompt-updates.test.ts)，搜索 `a forced prompt is sent as the leading prompt for the run and never recorded`。可用于理解“本次有效提示词”与“会话历史中记录的系统消息”的区别，不必照搬其复杂场景。

### 4. 从真实会话文件重新打开

文件：[tree-traversal.test.ts](../../repos/pi-mono/packages/coding-agent/test/session-manager/tree-traversal.test.ts)，约第 515 行。

搜索用例：`preserves tool and summary usage across a file-backed reload`

重点观察：

- 如何创建有文件支持的 SessionManager。
- 如何取得 `getSessionFile()` 返回的文件路径。
- 如何用新的 `SessionManager.open()` 读取同一个文件，再检查恢复结果。
- 如何通过 `finally` 清理临时目录。

这里只参考文件往返模式，不需要引入该用例中的 usage、分支或摘要功能。

你的完整恢复验证还需要：销毁旧 AgentSession，使用新 SessionManager 和新扩展实例，检查列表通知及下一次模型请求。仅断言 `getEntries()` 有数据，不能证明扩展恢复闭环成立。用于持久化的会话须先完成一次普通 prompt，详见 README 的前置条件。

## 本实验已有设施的参考

[fixtures.test.ts](fixtures.test.ts) 展示了：

- `createFixture()` 与 `queueReplies()` 的使用。
- 通过 `requests` 检查模型实际输入。
- 在 `finally` 中结束 Agent、等待空闲，再调用 `fixture.dispose()`。

它只验证设施本身，没有加载扩展或接入 AgentSession。正式测试需要你完成这一层组装；清理 fixture 前也要先结束自己创建的 Session。

## 阅读后由你决定的部分

将你的验证序列与预期写进 [design.md](design.md)，再集中编写测试：

- 用哪些操作和可观察结果区分“命令执行了”“状态保存了”“模型收到约定了”？
- 如何让更新、删除和连续请求的断言发现旧值残留或重复累积？
- 如何证明恢复依赖会话文件，而不是复用了旧实例的内存？
- 如何证明新会话为空，同时原会话仍保留约定？

断言依据 README 的业务契约，不应把当前实现的输出直接当作正确预期。参考阅读属于 AI 提供的定位帮助，测试设计与实现的完成程度仍按你实际承担的工作记录。
