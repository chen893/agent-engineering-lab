# 选题依据与初始验证

时间：2026-10-17 17:49（Asia/Shanghai）。

命令（工作区根目录）：
```sh
node repos/pi-mono/node_modules/vitest/dist/cli.js --run --root practice/06-cancellable-process --config ../../repos/pi-mono/packages/coding-agent/vitest.config.ts
```

结果：退出码 0；1 个测试通过，4 个 todo；测试文件 1 passed、1 skipped。通过的是 AI 提供的 pi-baseline.test.ts：真实 pi shell 后端在 READY 后取消，拒绝原因为 aborted，返回后 PID 检查为 ESRCH。总耗时 847ms。

范围：只验证既有 pi shell 后端的单进程取消，不涉及用户 runProcess / 工具实现、真实 Agent 集成、进程树、静态类型检查或真实模型。用户占位未调用，不能宣称用户核心已通过。

pi HEAD：9a3ca68bda4db67efc506ec114bffe64635e8569；agent-loop.ts 有既存未提交修改，本轮未改动仓库。

执行时相关文件 SHA-256（标识按运行后未修改的文件采集）：
```text
843ba709d53ef41c7d843681c09b302eb7950ac7d97a98677c44dd058a0ffd3e  pi-baseline.test.ts
50e1ec55d8ac290c1870515d72f3356ee7429b5248ea8418f369299e8e53975d  worker.mjs
7024a3145a6ebc951a0f030164adb1dfb12d33d6e0dbbac15ef0efda49c87457  packages/agent/src/agent.ts
5443e59603680884500b637d2621578c0cad0efcd22ab7d728048b090cbe7be4  packages/agent/src/agent-loop.ts
de2b54d4f4bfbb844ce6d8077f63d715f7d8e80079dd9689b561e45b6679c81b  packages/coding-agent/src/core/tools/bash.ts
cd324f5b9a1abadd85ab5a331750d475c8bd51ec65cae091ad9b416245ec85d4  packages/coding-agent/src/utils/child-process.ts
c93b05fef8d75072adeff45cdec2abfa2e03eb2910d9755c1edb45ce237e614a  packages/coding-agent/src/utils/shell.ts
```
