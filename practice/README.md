# 实践目录

当前任务与接续入口统一见 [当前学习状态](../learning-state.md)，本文件只保留实践目录索引。

[07-tool-approval](07-tool-approval/README.md)：设计异步审批状态并接入真实 pi Agent，验证审批前零副作用和过期决定隔离。

[06-cancellable-process](06-cancellable-process/README.md)：实现真实子进程取消与资源回收，自行封装工具并接入真实 pi Agent。

[05-pi-context-hook](05-pi-context-hook/README.md)：使用真实 pi Agent 验证请求裁剪与完整状态隔离。

[04-context-budget](04-context-budget/README.md)：连续工具批次契约下的上下文预算裁剪。

[03-concurrency](03-concurrency/README.md)：并发上限调度与失败隔离。

[02-retry](02-retry/README.md) 已完成限定范围的重试校准，5 项验收通过；不再按编号自动开启后续练习。根据能力目标选择独立实验或真实仓库任务，两者都可采用。

[01-agent-loop](01-agent-loop/README.md) 已完成限定范围的循环、错误处理与 follow-up；19 项验收通过。完整异步工具异常未验证，范围限制保留，不继续追加取消等任务。复盘见该目录的 retrospective.md 与 evidence/。

较大实验可使用以下结构，小实验按需要简化：

- `README.md`：需求和验收标准。
- `prediction.md`：运行前的预测与设计决策。
- `src/`：自己实现的代码。
- `tests/`：验证关键行为的测试。
- `evidence/`：运行轨迹、命令和结果。

默认采用能力校准模式。可查文档，按需求助；在每日记录中如实区分独立完成、提示下完成和 AI 生成的部分。
