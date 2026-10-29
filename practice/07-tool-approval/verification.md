# 2026-10-23 场景三健壮性复核

时间：16:39（Asia/Shanghai）。AI 阅读当前测试与实现，定向运行场景三；未修改实现或测试，未运行全量或 tsc。

```sh
node repos/pi-mono/node_modules/vitest/dist/cli.js --run --root practice/07-tool-approval --config ../../repos/pi-mono/packages/coding-agent/vitest.config.ts approval.test.ts -t '场景三' --reporter=verbose --silent=false
```

结果：1 passed / 3 skipped；用例 8ms，总计 568ms。输出 executions 为 [{ toolCallId: 'call_1', name: 'read_note' }]。通知后 pending 非空，取消及 waitForIdle 后 pending 为空、执行数仍为 1。当前有进入审批再取消的运行证据。

局限：10 秒定时器内的 decide/expect 尚未运行，测试已结束；实现仅调用 onRequest(pending)，不等待其返回 Promise，测试主体也未等待延迟操作。故不认定迟到审批验证通过。写入 prompt 未保存或显式等待；缺少真实文件保持原样及 call_2 取消错误 toolResult 的检查，也没有失败路径收尾和 fixture.dispose。建议取消后在测试主体提交旧决定，或明确等待延迟决定完成并在主体断言；用 try/finally 确保失败后仍取消、等待、清理计时器及临时目录。未将静态缺口当作实现行为失败。

协助：用户已在前述指导下完成工具名、两次 prompt、通知同步及 getter 实时读取的修正。AI 提供本次覆盖范围与异步断言缺口审查；测试设计和实现仍由用户继续完成。

SHA-256：

```text
d6dcb2af192c238b2ec19c85a2be34e6becb96455980ea2b7ac8b6c8346d53b7  practice/07-tool-approval/approval.test.ts
7378f367be979fe309919a9c56a753bdcdf0bb2e14850dc2933abfcf1efd18b0  practice/07-tool-approval/approval-session.ts
d005ba07b33672fd56f2182a24681fdffb816e2145c2b0605cc37bf0b040b26a  practice/07-tool-approval/fixtures.ts
```

# 2026-10-23 场景三调试指导

时间：16:10（Asia/Shanghai）。用户设计目标：先读取一次，模拟 10 秒后审批，在等待期间取消。AI 定向复现、解释日志配置与异步时序，未修改测试或实现；本次没有运行全量测试或 tsc。

```sh
node repos/pi-mono/node_modules/vitest/dist/cli.js --run --root practice/07-tool-approval --config ../../repos/pi-mono/packages/coding-agent/vitest.config.ts approval.test.ts -t '场景三' --reporter=verbose
```

结果：1 failed / 3 skipped，场景三约 3014ms；executions.length 期望 1、实际 0。当前脚本首项为不存在的 read_node；fixture 每次 prompt 只发起一个工具调用，因此没有进入第二项 write_note 或 onRequest。仅修正工具名也不足以验证审批取消，需第二次 prompt。写入 prompt 不能先 await 到结束再取消；onRequest 可用于同步进入审批，计时器仅模拟用户延迟。解构 pending 得到当时快照，应在断言处读取 session.pending。配置 silent: "passed-only" 隐藏通过用例日志，可用 --silent=false 调试。场景二仍仅检查通知和 pending，未完成收尾。

SHA-256（本次运行文件）：

```text
29980ca1b9225c134161e4987660b1635a6c4b3b894b9b122d2641edaf8b9dc4  practice/07-tool-approval/approval.test.ts
7378f367be979fe309919a9c56a753bdcdf0bb2e14850dc2933abfcf1efd18b0  practice/07-tool-approval/approval-session.ts
d005ba07b33672fd56f2182a24681fdffb816e2145c2b0605cc37bf0b040b26a  practice/07-tool-approval/fixtures.ts
```

# 2026-10-22 实现审查

时间：20:48（Asia/Shanghai）。模式：能力校准；AI 阅读实现与相关源码、运行用户现有测试并提供问题定位，未修改实现或代写测试。

## 验证

```sh
node repos/pi-mono/node_modules/vitest/dist/cli.js --run --root practice/07-tool-approval --config ../../repos/pi-mono/packages/coding-agent/vitest.config.ts approval.test.ts
node repos/pi-mono/node_modules/typescript/lib/tsc.js -p practice/07-tool-approval/tsconfig.json --pretty false
```

正式测试：2 failed / 1 todo。读取用例 executions 期望 1，实际 0；写入用例等待通知 30000ms 超时。定向 tsc 退出 0。未新增测试；取消、拒绝、旧请求隔离的判断来自静态审查，不冒充运行验证。

## 结论与下一步

beforeToolCall 接入点与拒绝时返回 block/reason 的方向正确；design.md 已解释校验、hook、execute 顺序。当前不满足验收：Agent 未注册 fixture.tools；写入判断使用 write 而设施为 write_note；读取测试为 read_node 而设施为 read_note。pending 返回初始值快照；通知只有 requestId；路径错误地取自 args（设施路径为 fixture.notePath）。等待阶段没有 abort 监听，初始 aborted 分支也未停止后续注册；clear 重复清理 rejectMap、遗漏 resolveMap，并重置唯一 ID。Map 未声明类型，参数使用断言、测试使用 any，缺少真实类型约束。

测试尚未完成 approve 决策及收尾，也缺少真实文件、toolResult、取消/拒绝/隔离等契约证据及 fixture 清理；审批超时不在本轮要求内。下一步由用户集中修正接线、请求可见性与取消清理，补齐自主验证设计和测试，再统一复核。此次不认定独立完成集成。

## 版本范围

pi HEAD：9a3ca68bda4db67efc506ec114bffe64635e8569；agent.ts、agent-loop.ts 存在既存工作树修改，另有两个 coding-agent 工具文件未跟踪。本次依据当前文件，非干净 HEAD。

SHA-256：

```text
62202e33a2408a35f04d724cf2a9f8a5f8e3fa0db13401c58df7697efe2fc791  practice/07-tool-approval/approval-session.ts
3445bc4e2eb3372bd42f4edd23bbd392234f342ba018992912285d6a85defd70  practice/07-tool-approval/approval.test.ts
264cbdd8faf7c338caec51adf5f7db365175c6b634de526790ad4b364b56e280  practice/07-tool-approval/design.md
d005ba07b33672fd56f2182a24681fdffb816e2145c2b0605cc37bf0b040b26a  practice/07-tool-approval/fixtures.ts
3abf2fe730653a62621a5e83b37a203effa62ce76d58e486b72e052b22249647  practice/07-tool-approval/README.md
749fb19c84b15a18bb0af361cfafa02d377e46d777a34883031548894bc7ee5e  practice/07-tool-approval/tsconfig.json
5536d6f0a4fdad9d3116ccb25cd7c889125541417a1625a9ba150772c0f499be  repos/pi-mono/packages/agent/src/agent.ts
5443e59603680884500b637d2621578c0cad0efcd22ab7d728048b090cbe7be4  repos/pi-mono/packages/agent/src/agent-loop.ts
2e116ef60fdaca4e26be5a1ace8d8b47f545d648d365de60b8c9f9d1ba629ee4  repos/pi-mono/packages/agent/src/types.ts
```

## 后续复核 2026-10-22T22:32:38+08:00

重跑上述正式测试和 tsc 命令：1 failed / 1 passed / 1 todo；tsc 退出 0。读取测试仍写 read_node，executions 为 0；写入测试仅证明收到通知且 pending 非空，未提交决定或等待 prompt 收尾，不代表批准执行通过。

静态发现：注册仍使用 aborted，移除使用 abort；clear 重复清 rejectMap，未删除 resolveMap 中的完成函数，因此重复决定返回 true，旧完成函数还会清空新请求 pending。通知仍只有 ID；Map 类型、参数断言和只读约束未完成。用户已将审批完成函数放入 Map 并通过闭包调用 clear，方向正确；AI 未修改实现或新增测试。

```text
69f84dfa1d2b95a4a4e048ace322c33035ff61f7066f59a899608ad4c72164d2  practice/07-tool-approval/approval-session.ts
3445bc4e2eb3372bd42f4edd23bbd392234f342ba018992912285d6a85defd70  practice/07-tool-approval/approval.test.ts
```
