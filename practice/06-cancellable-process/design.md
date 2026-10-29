# 设计解释与验证预期

模式：能力校准。用户先提交了五项解释；2026-10-21 用户明确要求 AI 校正解释、补输入预期和正式测试，以下是 AI 校订后的说明，不能作为用户独立完成源码解释或验证设计的证据。原回答的具体理解与偏差见 [20:36 审查](review-2026-10-21.md)。完整输入契约仍以 [README](README.md) 为准。

## 1. 从 agent.abort 到子进程停止

以下是 AI 核对过的当前工作树位置，不将这些阅读归到用户名下：

1. [agent.ts 的 runWithLifecycle](../../repos/pi-mono/packages/agent/src/agent.ts:579) 为每次运行创建一个 AbortController；将它的 signal 传给 runAgentLoop。下一次 prompt 会创建新的 controller，不复用上次已取消的 signal。
2. [agent.abort](../../repos/pi-mono/packages/agent/src/agent.ts:391) 调用本次运行的 controller.abort()。它发出取消通知，不直接操作子进程，也不代表清理已经结束。
3. [executePreparedToolCall](../../repos/pi-mono/packages/agent/src/agent-loop.ts:967) 将收到的 signal 传给工具 execute；[process-tool.ts](process-tool.ts:44) 再将原 signal 传给 runProcess。
4. 监听器注册在 [runner](process-runner.ts:68)。onAbort 标记 aborted=true，并调用 child.kill() 请求终止。本实现没有在此处 resolve，也没有因取消 throw。
5. [close 回调](process-runner.ts:119) 等进程和标准输出流关闭后执行，移除 abort 监听器、刷新解码器并返回 `{status:'aborted', exitCode:null, stdout, stderr}`。本轮单进程、不会忽略终止信号的契约下，等 close 再做 PID 检查，验证返回时已完成回收。
6. 工具将 aborted 封装为 `isError:true`，保留 content/details。因此 Agent 的 executePreparedToolCall 走 try 内的正常返回分支，以 result.isError 标记错误。启动失败的 reject 才会进入 catch，转成框架通用错误结果。

工具批次结束与整个 Agent 运行结束是两层循环。当前无 finishTurn 干预时，工具批次结束后还会进入下一次模型流调用，并携带已取消的 signal。测试模拟的 StreamFn 必须据此发出合法 error 事件和 stopReason='aborted'；框架不会替任意 mock 自动改写结果。runLoop 收到该消息后发出 turn_end/agent_end。

agent_end 也不等同于生命周期已空闲：[finishRun](../../repos/pi-mono/packages/agent/src/agent.ts:634) 在事件监听器处理结束后清理运行状态，waitForIdle 才会完成。测试等待本次 prompt 与 waitForIdle，再检查 isStreaming=false、pendingToolCalls 为空，以及后续 prompt 能成功。

## 2. 状态分别表示什么

- AbortController 是发出取消的对象；其 `.signal` 是接收通知的 AbortSignal，二者不是同一类型。
- aborted：本次 runner 已接收并处理取消请求。它决定最终返回 aborted，而不是证明进程此刻已停止。
- settled：本次调用已进入终结处理，阻止后续事件再次改变结果或重复处理。本实现先将它设为 true，再进行 cleanup/输出尾部处理，因此不能把这个布尔值当作独立的“全部资源已回收”证据。
- stdout/stderr 及各自的 StringDecoder：分别保存输出并处理跨 Buffer 的 UTF-8 字符，不要求两个流之间的全局先后顺序。

child.kill 只是发出信号；Promise 返回之前必须等 close。测试再验证 PID 查询得到 ESRCH，防止出现“Promise 已结束，但工作进程仍活着”。

## 3. 结束路径与清理

| 路径 | runner 的结果 | 收尾 |
| --- | --- | --- |
| 调用前已取消 | resolve aborted/null/空输出 | 不 spawn、不调用输出或 PID 回调、不注册监听器 |
| 启动失败，例如 executable/cwd 不存在 | reject 原始 Node 错误 | error 分支置 settled、移除监听器；随后 close 不重复处理 |
| 正常或非零退出 | resolve exited/真实 exitCode/输出 | close 分支置 settled、移除监听器、刷新解码器并 resolve |
| 运行中取消 | resolve aborted/null/已收集输出 | onAbort 请求 kill，仍等 close 完成上述收尾 |

结束后 abort 不应重新处理旧调用。测试检查本次监听器已移除、输出回调与结果不再变化，并用同一未取消 signal 连续执行两次。已经取消的 signal 不会被重置；Agent 的再次运行使用新的 controller。

## 4. 工具怎样映射结果

标准 AgentToolResult 的核心字段是 content、details 和可选 isError，退出码保存在 `details.exitCode`，不是额外的标准顶层字段。

| runner 结果 | 工具结果 |
| --- | --- |
| exited，exitCode=0 | isError=false；details 保留 RunResult；文本包含退出码与 stdout/stderr |
| exited，任意非零 exitCode | isError=true；details 与输出仍保留，不能只枚举示例的 1/2/7 |
| aborted | isError=true；details 保留 aborted/null 与已有输出；文本说明取消 |
| 启动失败 reject | 工具不吞异常，交给 Agent catch 转成通用错误 toolResult |

最后一种情况不要求 Agent 的通用错误 details 是 RunResult，因为 runner 根本没有成功返回 RunResult。取消主动返回结构化错误，则能够保留本题需要的 details。

## 5. 选择的输入、同步时点与预期

下列为 AI 补充的验证选择，落实在 [process.test.ts](process.test.ts)。子进程均用 process.execPath，不依赖 PATH。无模型网络请求，不直接调用 pi 的现成执行器代替 runProcess。

| 场景与输入 | 操作时点 | 预期与关键证据 |
| --- | --- | --- |
| worker success | 等执行完成 | exited/0；stdout 为 `你好\n`、stderr 为 `diagnostic\n`；onSpawn 一次；回调拼接与返回值一致；PID 已消失 |
| worker fail | 等执行完成 | runner resolve exited/7，不 reject；stderr 保留；工具和 Agent 标为错误 |
| 自定义 cwd，参数含空格、$HOME、*.ts | 等执行完成 | cwd 生效，参数保持字面值，无 shell 展开 |
| 不存在的 executable；不存在的 cwd | 等 reject | 保留 ENOENT、path、spawnargs；无成功 onSpawn；abort 监听器清除，之后 abort 不产生旧回调 |
| signal 预先 abort，再传不存在的 executable | 调用前取消 | 不尝试启动（否则会 ENOENT）；直接 aborted/null/空输出；无回调和监听器 |
| worker hold | 累积 stdout 到完整 READY:PID 后 | 先检查 PID 存活，再 abort；等待结果后检查 ESRCH、aborted/null、保留 READY；监听器清除且不再输出 |
| 收到 SIGTERM 会写收尾 stdout/stderr 再退出的单进程 | 完整 READY 后 abort | 返回 aborted/null，同时保留取消之后的两流收尾输出；返回时 PID 已消失，之后不再回调 |
| 同一未取消 signal 执行两次 success | 两次均结束后再 abort | 两次均正常退出；每次监听器归零；结束后 abort 不改旧结果、不再触发回调；另一次正常调用仍可运行 |
| UTF-8 字节分段写入 stdout/stderr | 子进程先写 ASCII 前缀和“你”的第一个字节；父进程收到两个前缀后发 SIGUSR2，才继续写剩余字节 | 两个输出流都保留完整中文，无替换字符；不靠固定 sleep 猜测输出时机 |
| 工具退出码 0、1、2、3、7、42 | 等 execute 返回 | 只有 0 为成功；details 的退出码和两个流的输出正确，文本包含退出码和输出 |
| 工具前置取消 | execute 之前 abort | 正常返回错误结果而非 throw，details 保留完整 RunResult |
| 真实 Agent 执行不存在的程序 | 模拟模型发出 run_process toolCall | 工具异常由真实 Agent 转成 isError=true 的 toolResult，文本保留 ENOENT，最终空闲 |
| 真实 Agent 执行 worker hold | worker 报告 READY 后调用 agent.abort | 返回错误 toolResult，保留 READY 和 aborted details；PID 已消失；发出 agent_end，waitForIdle 完成 |
| 同一个 Agent 随后再 prompt 执行 success | 第一轮完成和空闲后 | 使用新 signal；再次真实执行工具，生成成功 toolResult 和最终回答，Agent 再次空闲 |

### Agent 测试如何观察 READY

真实工具没有输出订阅接口，所以 AI 给 worker hold 添加一个可选的测试通知文件参数：打印 READY 后，在测试临时目录内原子写入/改名为 READY 文件。测试先订阅目录 fs.watch，再 prompt，读到完整 READY 才取消；最终仍断言工具 details.stdout 保留同一个 READY。通知文件只提供同步时点，不替代工具执行或取消。

测试记录自己启动的 PID。断言失败时兜底 SIGKILL、等待已登记的执行 Promise 收尾、关闭 watcher 并删除临时目录。5 秒超时只让错误实现失败退出，不将“等了足够久”作为资源回收证据。

## 运行证据与协助范围

正式命令、结果、时间、相关文件哈希见 [verification.md](verification.md)。既有 pi 基线与用户实现用例分开统计。

用户已编写 runner 与工具主体，并在 AI 提示下修正工具名及非零退出映射；用户原回答已展示 PID 检查、重复收尾防护与结果标错方向。本轮源码解释校订、输入预期、模型模拟接线、正式测试与运行均由 AI 按用户明确要求完成，不记为用户独立掌握这些部分。后续可通过解释测试中的关键断言或变式集成任务补充能力证据，不要求背写代码。
