# 2026-10-23 布置基线

时间：17:35—17:41，Asia/Shanghai。用户核心实现未开始；以下仅代表任务可行性与 AI 设施就绪。

pi HEAD：`9a3ca68bda4db67efc506ec114bffe64635e8569`。原有 agent.ts、agent-loop.ts 修改和两个未跟踪工具文件保留；本轮未改 pi 跟踪源码/依赖。运行版本的工作树哈希见 [baseline.sha256](baseline.sha256)。

已核对本地 extensions/sdk 文档以及 resource-loader、extensions loader/runner/types、agent-session、session-manager：支持文件加载扩展、命令分发、自定义会话数据和调整模型系统提示。自定义数据存储不会自动变成模型输入；首次 user/assistant 消息前会话不落盘，已在契约说明。任务是功能设计，不是缺陷修复。

## 环境与原有测试

首次在 pi 根目录运行：

```sh
node node_modules/vitest/dist/cli.js --run --config packages/coding-agent/vitest.config.ts packages/coding-agent/test/extensions-discovery.test.ts packages/coding-agent/test/session-manager/save-entry.test.ts
```

结果：27 failed / 5 passed。扩展加载错误指向缺失 `packages/ai/src/providers/data/amazon-bedrock.json`；生成数据目录不存在。

AI 在 `repos/pi-mono/packages/ai` 执行：

```sh
node scripts/generate-models.ts --strict --data-only
```

退出 0。官方脚本联网获取公开模型目录并生成 gitignore 中的 `src/providers/data/`；未调用真实模型、未改 provider 类型源码。之后 pi git status 与开始一致。

补齐后在 `repos/pi-mono/packages/coding-agent` 运行：

```sh
node ../../node_modules/vitest/dist/cli.js --run test/extensions-discovery.test.ts test/session-manager/save-entry.test.ts test/suite/regressions/6162-extension-active-tools-next-turn.test.ts
```

17:36:42：3 files / 35 tests passed，总计 3.17s。覆盖原有扩展发现/加载、自定义会话 entry 和模型请求系统提示变化；不代表本实验功能通过。

## AI 设施

工作区根目录：

```sh
node repos/pi-mono/node_modules/vitest/dist/cli.js --run --root practice/08-session-rules --config ../../repos/pi-mono/packages/coding-agent/vitest.config.ts fixtures.test.ts rules.test.ts
node repos/pi-mono/node_modules/typescript/lib/tsc.js -p practice/08-session-rules/tsconfig.json --pretty false
```

17:40:49：1 passed / 1 todo，总计 5.08s。通过项验证真实 Agent 经设施 ModelRuntime 调用离线 provider、捕获本次有效系统提示并清理目录。正式 rules.test.ts 仍为 todo。

tsc 退出 0。初次缺少仓库已有 highlight.js 声明，已在本实验 tsconfig 显式 include 原声明文件；未禁用严格检查或伪造声明。

AI 仅提供需求、设施和空入口，未实现用户的命令注册、数据格式、恢复、上下文接入或正式测试。
