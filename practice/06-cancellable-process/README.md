# 实验 06：给真实 pi Agent 接入可取消的进程工具

模式：能力校准。任务类型：复现已有机制并完成应用层集成。真实 pi 已有此能力，本题不声称发现了 pi 的缺陷。

## 为什么选这题

05 中用户实现了数组筛选，但源码定位、接线与验证大部分由 AI 完成，不能据此判断独立集成能力。本轮待验证的是：管理外部资源生命周期，把框架的取消信号接到真实工作，处理多条结束路径，并自行验证资源确实回收。已有并发调度实验没有覆盖操作系统进程取消。

实际用途：Agent 执行命令时，用户按停止，命令也应停止，而不只是界面停止等待。需要能处理已产生的输出、进程执行失败和下一次请求。本轮使用真实子进程与真实 Agent，模型请求由用户编写模拟传输，不需 API key。

布置时由用户承担：runProcess 实现、工具 schema/类型/结果封装、Agent 接线、关键测试和源码解释。AI 初始提供：函数接口、占位、worker.mjs、对 pi 既有实现的基线测试及本说明，未提供调度/清理算法或用户实现的集成测试答案。2026-10-21 用户明确要求 AI 校正 design、补输入预期与正式测试；这部分现由 AI 完成，帮助范围见 [design.md](design.md) 和 [verification.md](verification.md)，不作为用户独立集成与验证能力的证明。

## 已确认的依据

2026-10-17 核对本地 pi HEAD：`9a3ca68bda4db67efc506ec114bffe64635e8569`。`packages/agent/src/agent-loop.ts` 有既存未提交修改；结论基于当前工作树，不冒充干净提交行为，本轮未修改 pi 源码。

源码核对入口（不必读完整项目）：

- [agent.ts](../../repos/pi-mono/packages/agent/src/agent.ts)：搜索 abort、waitForIdle、runWithLifecycle，定位运行生命周期。
- [agent-loop.ts](../../repos/pi-mono/packages/agent/src/agent-loop.ts)：搜索 executePreparedToolCall，追踪 signal 与工具异常的传播。
- [types.ts](../../repos/pi-mono/packages/agent/src/types.ts)：AgentTool、AgentToolResult、StreamFn 的真实契约。
- [bash.ts](../../repos/pi-mono/packages/coding-agent/src/core/tools/bash.ts)：createLocalShellOperations，真实进程的取消、等待与清理参照。

先由你串出调用链、选择状态和验证方法；需要时可读 bash 的实现，不要求背写或复制其结构。不要把模拟模型写成直接调用工具：必须由真实 Agent 消费 toolCall 并调用你的工具。

AI 已运行 `pi-baseline.test.ts`：原有 pi shell 后端启动 Node worker，在 READY 后取消，最终报告 aborted，且 PID 已不存在。命令、范围与版本标识见 [baseline.md](baseline.md)。这只证明题目的真实行为依据，不是用户实现验收。

## 任务一：实现进程执行器

完成 [process-runner.ts](process-runner.ts) 的 runProcess，使用 Node 自带的子进程 API。不要调用 pi 已实现的进程执行/清理函数来代替本轮核心实现。

输入：可执行文件路径、参数数组和 RunOptions。直接执行文件与参数，不拼 shell 命令；cwd 未提供时使用当前目录。契约内参数都是正常数据，回调不抛错。

必须满足：

1. 正常退出返回 status=exited、真实 exitCode、分别完整收集的 stdout/stderr；非零退出也正常返回，不作为启动异常拒绝。UTF-8 文本应保持完整，不要求两个输出流之间的全局顺序。
2. 可执行文件不存在、cwd 不存在等启动失败，Promise 拒绝并保留原始错误。
3. 调用时 signal 已取消，不产生子进程，也不调用 onSpawn；返回 status=aborted、exitCode=null、空输出。
4. 运行中取消：终止子进程，等进程退出和输出收尾后才返回 status=aborted、exitCode=null；保留已收集的输出。不能只用 Promise.race 提前返回并留下工作进程。
5. 已触发启动失败处理或进程 close 处理后，本次调用结束，之后 abort 不再影响这次调用。成功启动后，close 处理前接收到取消则按 aborted 返回；其他外部终止不在本轮输入范围内。
6. onSpawn 在成功启动时报告 PID 一次；onStdout/onStderr 随文本块报告输出，不能假设一块就是完整一行。调用结束后不再触发这些回调；清理本次注册的 abort 监听器和相关资源。同一个 signal 可以复用给后续调用。

本轮只支持当前 macOS/Linux 上的单个、不会产生后代的进程，输出量小，不主动关闭输出管道后继续运行，也不忽略终止信号。不要求进程树、Windows、超时、输出截断、重试或沙箱。真实 pi 还处理进程树和后代继承管道等情况，不能把本练习称为完整 bash 工具。

## 任务二：封装并接入真实 Agent

完成 [process-tool.ts](process-tool.ts)：

- 工具名 run_process；参数为 executable:string 和 args:string[]，由你定义真实 schema，并将返回类型从 unknown 改为相应 AgentTool 类型。
- execute 将真实传入的 signal 转交 runProcess。
- 零退出返回成功；非零退出和取消返回 isError=true。details 保留 RunResult，文本 content 至少包含输出及退出码/取消原因。启动异常允许直接抛出，由真实 Agent 处理；不要求你再造一套异常协议。
- 不使用 any 或类型断言伪装成有效工具。TypeBox 可从现有 `repos/pi-mono/node_modules/typebox/build/index.mjs` 用相对路径导入，无需安装依赖。

在你编写的集成测试中使用真实 Agent，模拟模型先返回一个 run_process toolCall。命令运行到 READY 后由测试调用 agent.abort。核实进程已退出、工具结果为错误、Agent 最终空闲；再让同一个 Agent 完成一次正常 prompt，证明取消没有破坏后续运行。

本轮只用单次工具调用、不入队 steering/follow-up，也不运行 05 的裁剪 hook。模型响应及事件必须符合真实 StreamFn 协议。05 的消息构造函数可参考或复用，但它的 mockStream 只返回普通回答，不能直接证明工具执行链。

## 验证与完成边界

[worker.mjs](worker.mjs) 提供三种真实进程输入：success（中文 stdout 与 diagnostic stderr）、fail（退出码 7）、hold（输出 READY:PID 后等待）。使用 process.execPath 执行它，不依赖 PATH 上的 node。测试负责在断言失败时清理自己启动的进程。

正式测试设施：hold 可额外接收一个测试临时文件路径，在报告 READY 后原子写入相同通知；真实 Agent 集成通过 fs.watch 同步取消时点，不修改工具接口或取消算法。其他两流收尾和 UTF-8 用例使用内联 Node 程序，仍只启动单进程。

请在 [design.md](design.md) 先写一组关键输入与预期，再集中实现，不必逐项等批准。在 [process.test.ts](process.test.ts) 替换 todo，自行组织测试，至少覆盖上述三类命令、启动失败、启动前取消、READY 后取消、结束后取消与真实 Agent 取消后再次 prompt。启动失败与正常执行可以独立单测；取消集成必须使用真实进程，不能全靠 mock 通过。

取消时以 READY/事件作为操作时点，用 PID 存活检查等证据确认进程已结束；不要用固定 sleep 推测“应该启动/应该停止了”。允许设置宽松测试超时防止挂住，超时本身不是业务验收结果。无需测试事件碰巧落在同一毫秒的顺序。

从工作区根目录运行本目录测试：

```sh
node repos/pi-mono/node_modules/vitest/dist/cli.js --run --root practice/06-cancellable-process --config ../../repos/pi-mono/packages/coding-agent/vitest.config.ts
```

完成标准：契约内行为通过，关键 todo 已替换，能够解释取消信号如何到达进程、Promise 结束与资源回收的关系、失败怎样成为 toolResult。测试数量不作为掌握程度指标。若需要 AI 写测试或提示实现，照实记录，不要求为了独立而卡住。

基线 1 passed、用户用例 todo 不等于任务完成；本轮初始未做静态类型检查，也未验证用户实现。验收时记录命令、时间、结果范围与相关文件哈希。
