# 08 审查与验证

时间：2026-10-27 19:35 +0800。模式：能力校准，未完整通过。

## 结果与范围

用户初版：真实文件加载、Agent/AgentSession 组装、session.prompt 命令分发、模型请求快照检查已实现。原测试 1 passed / 1 failed，末尾 includes() 布尔值与路径字符串比较；使用的 projectName 不符合 README 的小写 key 契约。本轮改用合法 key。

AI 补齐正式集成测试后：13 项中 **8 passed / 5 failed**；另有设施测试 **1 passed**；定向 TypeScript 检查退出码 0。完整输出见 [verification-output.txt](verification-output.txt)。

通过范围：命令增改查删和不存在键反馈、不调用模型、value 内部空格保留、模型当前区块更新/删除/重新添加、多轮不累积、十条各 200 字、真实 JSONL 落盘后新 SessionManager + 新加载扩展恢复、独立新会话隔离、再打开原文件。检查临时 AGENTS.md 未修改、原项目指令与 pi 基础提示保留；失败路径统一释放会话与设施。关闭额外 skills/templates/themes 加载，避免用户级技能参与测试。

未通过的四类实现问题（五个用例）：

1. `rules-extension.ts:89`：`/rules set` 缺 key 时读取 undefined.length，扩展错误监听收到异常，未通知用法。
2. `rules-extension.ts:92`：`/rules set language` 和尾部纯空白 value 均直接保存空字符串，覆盖已有值。
3. `rules-extension.ts:87`：合法命令 `/rules set set 唯一约定值` 中 indexOf(key) 找到的是子命令位置，结果存成 `set 唯一约定值`。
4. `rules-extension.ts:124`：初始无约定、删除最后一条后仍输出 `<session_rules>none</session_rules>`，违反空状态不加区块。

源码观察（不额外算作失败用例）：当前 runner 的 emitBeforeAgentStart 传入可变 systemPromptOptions，读取返回值的 message/systemPrompt；本实现生效依赖对 event.systemPromptOptions.sections 的原位修改。返回对象中的 systemPromptOptions.sessions 不是此处消费的接入字段，不能将生效归因于它。当前源码与 baseline 版本不同，以上结论以本次核对为准。

未验收：非法 key、超容量、分支、compaction、损坏数据与迁移均不在本轮范围；额外 get 命令不作为完成条件。

## 命令与版本

在工作区根执行：

```sh
node repos/pi-mono/node_modules/vitest/dist/cli.js --run --root practice/08-session-rules --config ../../repos/pi-mono/packages/coding-agent/vitest.config.ts fixtures.test.ts rules.test.ts
node repos/pi-mono/node_modules/typescript/lib/tsc.js -p practice/08-session-rules/tsconfig.json --pretty false
```

Vitest 退出码 1；tsc 退出码 0。pi HEAD：`36be9c612e64082a4f0d4d0a94706c38ecbc20a1`，已有 agent.ts、agent-loop.ts 未提交修改及未跟踪扩展/工具文件，本轮未修改 pi 或 rules-extension.ts。相关文件版本见 [verification.sha256](verification.sha256)，不单独以 HEAD 绑定结果。

## 协助与下一步

用户本轮明确不再补测试；AI 修正原断言，整理测试公共接线、捕获通知/扩展错误、补齐验证方案和用例、运行并审查。核心扩展实现保持原样。集成初版与核心实现有用户提交证据；完整验证设计与恢复测试实现属于 AI 协助，不记为用户独立完成。design.md 仅记录 CustomEntry 存储依据，尚不能证明完整接入链路及生命周期解释。

下一步：用户集中修复四类问题，再运行已有测试即可，无需继续补测试。随后简短解释存储、恢复、注入路径以及 options 的真实生效方式；不要求重写整篇设计文档。
