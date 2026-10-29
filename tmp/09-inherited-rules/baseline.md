# 09 布置基线

时间：2026-10-27T21:32:42+08:00。

## 范围与结果

```sh
node repos/pi-mono/node_modules/vitest/dist/cli.js --run --root practice/09-inherited-rules --config ../../repos/pi-mono/packages/coding-agent/vitest.config.ts
node repos/pi-mono/node_modules/typescript/lib/tsc.js -p practice/09-inherited-rules/tsconfig.json --pretty false
```

两条命令退出码均为 0。旧兼容性测试 13 passed、设施 1 passed、新功能 1 todo；定向 tsc 无诊断。输出见 [baseline-output.txt](baseline-output.txt) 和 [baseline-tsc.txt](baseline-tsc.txt)。这仅证明复制后的起点可运行，不代表项目继承、屏蔽或 reset 已实现。

文件版本见 [baseline.sha256](baseline.sha256)。pi HEAD `36be9c612e64082a4f0d4d0a94706c38ecbc20a1`；已有 agent.ts/agent-loop.ts 修改，未跟踪 .pi/extensions/hello.ts、.pi/tsconfig.json、execute-process.ts、process-tool.ts 保留。此次未改 pi 源码、依赖或 08 文件。

## 依据与协助边界

已读当前 session-manager 的 appendCustomEntry/getEntries、runner 的 emitBeforeAgentStart、system-prompt 的 sections 类型，并以现有加载/恢复回归核对可运行性。新业务是训练场景，非已复现的 pi 缺陷。

AI 创建 README、design 占位、复制 08 核心实现和测试设施/回归、创建新增集成测试 todo；未提供新状态类型、合并/恢复算法、具体职责划分或新增测试序列。用户独立承担范围与实际帮助以后按发生情况更新。

测试已有两项设施限制：复制单个入口不能支持新增相对导入辅助文件，拆分时可改加载设施；旧通知断言包含关键词匹配，若阻碍文案自定，应按契约修改，不要求实现迁就测试。旧 13 项是回归证据，不是要求照抄所有排版。
