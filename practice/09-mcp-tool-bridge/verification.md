# MCP 工具桥接验收

时间：2026-10-29T17:23:56+08:00。pi 仓库 HEAD：`36be9c612`；实现与测试的实际内容以 [SHA-256](verification.sha256) 为准，不能仅凭 HEAD 复用结论。

## 结果与命令

- 正式用例 `bridge.test.ts`：9 passed；设施用例 `fixtures.test.ts`：4 passed，共 13 passed。
- TypeScript：退出码 0，无诊断。
- [测试输出](verification-output.txt)、[类型检查输出](verification-tsc.txt)。

```sh
node repos/pi-mono/node_modules/vitest/dist/cli.js --run --root practice/09-mcp-tool-bridge --config ../../repos/pi-mono/packages/coding-agent/vitest.config.ts
node repos/pi-mono/node_modules/typescript/lib/tsc.js -p practice/09-mcp-tool-bridge/tsconfig.json --pretty false
```

## 覆盖范围

1. 类型内的重复服务名、非法服务名、空 command 在启动前拒绝（3 项）；不加入 null 等契约外输入，也不把全部配置校验视为 README 强制要求。
2. 第二服务初始化时人工注入崩溃，创建 reject，两个已启动 PID 都已退出。
3. 动态发现 5 个工具（含 health），模型请求保留 description、string 属性、required、additionalProperties 和 minLength，health 真实可调用。
4. 两个服务的同名 search/get 精准路由：检查进程协议轨迹、调用参数、工具调用 ID、错误标记与下一次模型请求中的完整正文。
5. NOT_FOUND 原文与 isError 保留，下一轮正常查询成功。
6. 调用期间人工注入进程退出，Agent 获得非空错误结果并结束 prompt（10 秒用例超时上限）。
7. dispose 并发/重复调用安全，两个 PID 都返回 ESRCH。初始化回滚和 dispose 的 PID 断言均发生在 fixture 兜底清理之前。

功能按当前 README 范围验收通过。未额外验证自动重连、HTTP/OAuth、取消竞态等范围外行为；本轮未单独注入取消信号测试。测试通过不能单独证明用户解释与迁移能力。

## 分工与观察

- 用户提交已有桥接器初版，提出配置错误、创建失败回收、注册数量、同名服务路由、资源回收、执行报错六组场景；这证明已关注接入、路由、错误和生命周期，但具体输入、预期及观察位置由 AI 细化。
- AI 完整编写正式测试，补充动态 health、schema 声明、完整文本/调用 ID 回传、业务错误恢复与调用期断连的具体断言。用户选择不编写测试，不归因为不会设计验证。
- 前轮 AI 提供 Type.Unsafe 与 AgentTool 泛型的具体代码讲解，用户接入；本轮发现裸 typebox 导入运行时无法解析，AI 仅修改该导入为已有 node_modules 的实际路径，未修改核心适配算法。
- 首次测试因依赖解析导致正式套件无法加载；这是实验依赖入口问题，不作为用户功能失败或能力薄弱证据。修正后正式与设施测试通过。
- 完整源码定位、生命周期取舍解释及约束变化下的独立实现仍待验证。没有把提交实现全部归为独立完成。

## 非阻塞审查观察

初始化 catch 抛出固定的“mcp服务启动失败”，会丢失前面收集的具体服务/原因；不影响本轮拒绝与回收契约通过，但会降低排障信息。后续可围绕此处讨论保留原始异常与清理异常的取舍，本轮未替用户修改。
