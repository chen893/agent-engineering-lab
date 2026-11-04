# 准备记录

2026-10-29。模式：能力校准。依据问题池 Q012/Q014 与已有 compaction 解释证据，新增目标为真实历史读取与来源一致性，不把查询筛选本身作为主要能力目标。

核对 pi HEAD：`36be9c612e64082a4f0d4d0a94706c38ecbc20a1`。工作树已有 agent.ts、agent-loop.ts 等改动，本轮未修改 pi。阅读了 session-manager.ts 的持久化、打开与分支读取片段，以及 tree-traversal/build-context 相关测试；它们区分物理 entries、指定祖先路径与压缩上下文。未运行 pi 旧测试，不宣称全仓验证通过。

相关文件 SHA-256：

- session-manager.ts：`450d82c529933214e088b8422f00061815e617f352f6c834689787a314064bff`
- tree-traversal.test.ts：`7fd41878726b4c646a4063bf03710f6f0824dec69266a340661f65e2a0778610`
- build-context.test.ts：`e4f1c5ef931609100a5350129151d147f7d58bea4df0d9e1676fe60d06aed6c0`

AI 创建 README、入口占位、设计记录占位、样例生成与设施自检。核心类型、读取/检索实现和 Agent 接线均未提供。用户可检查设施源码；其中的 API 使用属于已提供参考，不计为用户独立发现。

设施运行使用 README 两条命令。初次 tsc 因 vitest 裸导入无法解析失败，AI 改为复用仓库实际依赖路径；这是设施问题。最终 2026-10-29 18:05:49 +08:00：设施自检 1/1 passed，tsc 退出码 0。范围仅为样例落盘与脚手架类型检查，未绑定独立版本快照；设施通过不等于功能通过。正式功能验收待用户实现后进行。
