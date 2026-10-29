# 07 布置时的可行性与设施检查

时间：2026-10-21，Asia/Shanghai。执行者：AI。这里没有用户审批实现的验收结论。

## pi 依据

仓库边界确认是 `repos/pi-mono`，HEAD 为 `9a3ca68bda4db67efc506ec114bffe64635e8569`。agent.ts、agent-loop.ts 有既存修改；coding-agent 的 execute-process.ts、process-tool.ts 为既存未跟踪文件。本轮未修改 pi，不把 HEAD 当作完整运行版本。

已读当前 AgentOptions、工具调用扩展类型、prepareToolCall、executePreparedToolCall 和 runWithLifecycle/finishRun：公开接口允许异步等待和阻止执行，并传入本次运行的 signal；扩展代码负责响应取消以结束自己的等待。这支持本题可行性，不等于现成实现了本题的审批身份、通知和状态管理。

工作区根目录运行：

```sh
node repos/pi-mono/node_modules/vitest/dist/cli.js --run --root repos/pi-mono/packages/agent --config vitest.config.ts test/agent-loop.test.ts -t 'validates, runs the hooks, and reports failures as error outcomes|should stop after a blocked tool call when beforeToolCall sets terminate=true'
```

21:44:57 开始，退出码 0：2 passed，36 skipped。第一个用例核对校验、钩子、阻止调用与错误结果；第二个核对循环对被阻止调用及可选终止提示的处理。第二个用例的终止选项不是本题要求采用的策略；本题拒绝后模型应看到错误结果。未跑整个框架测试集，未验证用户的等待中取消或审批集成。

## AI 设施与类型

```sh
node repos/pi-mono/node_modules/vitest/dist/cli.js --run --root practice/07-tool-approval --config ../../repos/pi-mono/packages/coding-agent/vitest.config.ts
node repos/pi-mono/node_modules/typescript/lib/tsc.js -p practice/07-tool-approval/tsconfig.json --pretty false
```

最终测试 21:48:07 开始，退出码 0：2 passed、1 todo（fixtures.test.ts 两项设施检查通过；approval.test.ts 仍为待实现占位）。检查真实临时文件读写/执行记录及模型 toolCall/aborted 协议响应，没有构建审批 Agent。临时目录已清理。

21:48 定向 tsc 退出码 0，无诊断。最初设施测试直接传普通对象给 StreamFn 时，tsc 指出缺少 TranscriptContext 品牌；AI 改用实际 normalizeContext 后通过。配置使用 ESNext/Bundler，检查本目录 TS 及导入链，不声称原 NodeNext 配置或全仓库检查通过。空入口通过类型检查不表示业务完成。

## 当前工作树 SHA-256

| 文件 | SHA-256 |
| --- | --- |
| 07/README.md | 284727dcc62b86d043ad3abac1f5f015784d167af409b7520be7296ab21c55da |
| 07/fixtures.ts | d005ba07b33672fd56f2182a24681fdffb816e2145c2b0605cc37bf0b040b26a |
| 07/fixtures.test.ts | 4379afe3761280dc5a9590b3a3f6073ceb47d1a73c3953cdaf0d0fdacdbcd74b |
| 07/approval-session.ts | 460a47a3f530537ea6e378e681d463c76fc45bab4584e9bbeb7c918ace027b60 |
| 07/approval.test.ts | 68895852cfe59b84d125ce85ce4da341b9a5a9ca0b7c30879ee40d4f32971c6f |
| 07/tsconfig.json | 749fb19c84b15a18bb0af361cfafa02d377e46d777a34883031548894bc7ee5e |
| 05/fixtures.ts | cb5e7b971511df9ffb00bbe05633ff57a329352d8b343c665843fbc161e855f4 |
| pi agent/src/agent.ts | 5536d6f0a4fdad9d3116ccb25cd7c889125541417a1625a9ba150772c0f499be |
| pi agent/src/agent-loop.ts | 5443e59603680884500b637d2621578c0cad0efcd22ab7d728048b090cbe7be4 |
| pi agent/src/types.ts | 2e116ef60fdaca4e26be5a1ace8d8b47f545d648d365de60b8c9f9d1ba629ee4 |
| pi agent/test/agent-loop.test.ts | 0bb740569480a344b406552fa9f1fcbe5f22764028e9223b3c8e26dbcc70837b |
| pi agent/vitest.config.ts | fd2d498e6160353f09f843aed1dfede67e242a51b7d6577898390a0f25bd3388 |
| pi coding-agent/vitest.config.ts | d752f026f5a52e4518e4127f4d07f074dc52d377e18849c340963698b28890c5 |
| pi vitest.base.ts | a3a10daf974de390fc88ca16161b34cc874fb9887919aeb0e52268b2bec5a95c |
