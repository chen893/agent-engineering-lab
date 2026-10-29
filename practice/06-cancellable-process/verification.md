# 实验 06 正式验证

验证日期：2026-10-21，Asia/Shanghai。执行者：AI，按用户“矫正解释补输入预期和正式测试”的明确要求。功能验收通过；测试设计、Agent 测试接线及解释校订由 AI 完成，不作为用户独立掌握的证明。

## 结果与命令

从工作区根目录执行：

```sh
node repos/pi-mono/node_modules/vitest/dist/cli.js --run --root practice/06-cancellable-process --config ../../repos/pi-mono/packages/coding-agent/vitest.config.ts
```

最终运行开始于 20:54:40 CST，退出码 0：

```text
Test Files  2 passed (2)
     Tests  21 passed (21)
  Duration  1.49s
```

- process.test.ts：20 项正式用户实现用例通过，原四项 todo 已替换。
- pi-baseline.test.ts：1 项既有 pi 基线通过，单独统计，不冒充用户实现证据。
- 前一轮 20 项（19 正式 + 1 基线）通过后，增加取消后两流收尾用例、将 UTF-8 握手信号改为 SIGUSR2；上述最终结果对应更新后的文件。

环境：macOS，Node v26.5.0，Vitest 4.1.11，TypeScript 7.0.2。未调用付费模型或发起模型网络请求。

## 验证范围与关键证据

runner 的 10 项用例覆盖：

- 正常退出、真实 PID 只报告一次、中文 stdout 与 diagnostic stderr 分流保留、输出回调拼接和返回结果一致。
- 非零退出 resolve exited/7；不存在的 executable 与 cwd 分别 reject，保留 Node ENOENT/path/spawnargs，成功 onSpawn 不触发。
- cwd 生效，包含空格、$HOME、*.ts 的参数保持字面值。
- 前置取消不启动：即使 executable 不存在也返回 aborted/null/空输出，未变成 ENOENT，无 PID/输出回调。
- READY 后先确认 PID 存活，再取消；返回 aborted/null 并保留 READY，之后 process.kill(pid,0) 得 ESRCH；abort 监听器归零。
- 子进程收到 SIGTERM 后向两个流写收尾信息再退出；runner 返回包含这些取消后的输出，PID 已消失，返回后不再回调。这验证等待退出/排空，不能只用 Promise 提前返回。
- 同一未取消 signal 连续执行成功；完成后 abort 不改旧结果和回调，未残留本次监听器；后续独立调用正常。
- UTF-8 前半字节与后续字节分开写入：父进程收到两流 ASCII 前缀后才通过 SIGUSR2 放行余下字节；两个流均保留完整中文。

工具的 7 项用例覆盖：退出码 0/1/2/3/7/42 的通用标错、完整 details、文本中的退出码与两流输出，以及前置取消的结构化错误。

真实 Agent 的 3 项用例覆盖：

1. 模拟模型发送 run_process toolCall，真实 Agent 执行 worker fail，生成错误 toolResult 并保留 RunResult。
2. 模拟模型发送不存在程序的调用，由 Agent 捕获启动异常，生成含 ENOENT 的通用错误 toolResult；此路径不要求 RunResult details。
3. Agent 执行 worker hold，在可选 READY 文件通知后调用 agent.abort；错误 toolResult 保留 READY、aborted/null，PID 已不存在、signal 监听器移除；模型传输收到已取消 signal 后以合法 aborted 协议结束。等待 prompt/waitForIdle 后 isStreaming=false、pendingToolCalls 为空。再由同一个 Agent 执行第二个正常 prompt，使用新 signal、真正运行 success，生成成功 toolResult 和最终回答，再次空闲。

集成未直接调用工具代替 Agent 分发，未启用 05 的裁剪 hook、steering/follow-up、真实模型请求。只复用 05 fixtures.ts 的静态 model/assistant 构造器；本轮模型传输在本测试内实现。5 秒超时只防止坏实现挂住；测试使用事件/READY 选择取消时点，断言失败时兜底终止已登记 PID、等待执行收尾、清理 watcher/临时目录。

## 定向类型检查

命令（工作区根目录，最终测试文件版本）：

```sh
node repos/pi-mono/node_modules/typescript/lib/tsc.js -p /tmp/process06-review-20261021.FKlShA/tsconfig-formal.json --pretty false
```

20:54 CST，退出码 0，无诊断。临时配置内容如下，供重新创建，不依赖临时文件长期存在：

```json
{
  "extends": "/Users/chen/Desktop/agent面经/repos/pi-mono/tsconfig.json",
  "compilerOptions": {
    "typeRoots": ["/Users/chen/Desktop/agent面经/repos/pi-mono/node_modules/@types"],
    "module": "ESNext",
    "moduleResolution": "Bundler"
  },
  "include": ["/Users/chen/Desktop/agent面经/practice/06-cancellable-process/process.test.ts"],
  "exclude": []
}
```

检查覆盖该测试的导入链，包括 runner、工具、05 fixtures 与真实 Agent 类型。沿用此前适配 Vitest 的 ESNext/Bundler 配置，没有更改仓库配置；不表示原 NodeNext 配置或全仓库静态检查通过。

## 版本绑定

pi HEAD：`9a3ca68bda4db67efc506ec114bffe64635e8569`。不是干净提交：agent.ts/agent-loop.ts 有既存修改，coding-agent 中 execute-process.ts/process-tool.ts 仍为未跟踪文件；本次未修改 pi 或实验 runner/工具实现。以下 SHA-256 绑定真实工作树文件，不仅记录 HEAD。

| 文件 | SHA-256 |
| --- | --- |
| 06/process.test.ts | 17b71379731ed25a20fc56ebc6661d3399efd5aeba7dd1252dbde65d417e4f61 |
| 06/worker.mjs | 009dafd40f92cf8fb29761401f7d5033042b9b1bbda51ae4faf31c16ca2d7c7b |
| 06/process-runner.ts | a151d26cb16eea820c6414a850fa12e82c23ed04a469e502e79a28ef6bfff03c |
| 06/process-tool.ts | 58cb485ddc471a553d4a0f1389dff72d195a1af006dc721bf8d18c336e56f15a |
| 06/design.md | 6ccbb261b91c5c368c6ac5a56cbce7da4e6811e16d79caa6eac0d56251939656 |
| 06/README.md | fe033303db5c4a4e3a4291a6e956db8ec4c82c9fa24d4e24fd2cf16c057520d9 |
| 06/pi-baseline.test.ts | 843ba709d53ef41c7d843681c09b302eb7950ac7d97a98677c44dd058a0ffd3e |
| 05/fixtures.ts | cb5e7b971511df9ffb00bbe05633ff57a329352d8b343c665843fbc161e855f4 |
| pi agent/src/agent.ts | 5536d6f0a4fdad9d3116ccb25cd7c889125541417a1625a9ba150772c0f499be |
| pi agent/src/agent-loop.ts | 5443e59603680884500b637d2621578c0cad0efcd22ab7d728048b090cbe7be4 |
| pi agent/src/types.ts | 2e116ef60fdaca4e26be5a1ace8d8b47f545d648d365de60b8c9f9d1ba629ee4 |
| pi coding-agent/vitest.config.ts | d752f026f5a52e4518e4127f4d07f074dc52d377e18849c340963698b28890c5 |
| pi vitest.base.ts | a3a10daf974de390fc88ca16161b34cc874fb9887919aeb0e52268b2bec5a95c |

## 限定与学习结论

结论限于 README 约定的当前 macOS/Linux 单进程、小输出、正常参数与不抛错回调、不忽略终止信号的输入。不扩展为进程树、Windows、超时、截断、重试或完整 bash 工具的验证。

用户实现了 runner 和工具主体，并在 AI 审查提示下修正工具名和非零退出映射；原设计回答已展示 PID 检查、重复收尾防护与结果标错方向。主要解释偏差是将本实现的取消返回当作 throw/catch、将 settled 直接当作资源回收。AI 本轮完成解释校订、输入预期、正式测试与 Agent 模拟接线，未修复或替换用户实现；本次运行未发现需要修改实现的契约内失败。

功能验收已通过。独立源码串联、验证设计和真实 Agent 接线能力仍不能仅凭这些 AI 产物判定已掌握。下一步可由用户结合测试解释“为何必须等 close / PID 检查证明什么 / 再次 prompt 为何需要新 signal”，再根据实际表现决定是否需要变式任务；无需为证明独立而重写现有测试。
