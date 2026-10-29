# 09 MCP 接入实践：设施基线

记录时间：2026-10-27 21:46 +0800。

## 命令和结果

```sh
node --check practice/09-mcp-tool-bridge/catalog-server.mjs
node repos/pi-mono/node_modules/vitest/dist/cli.js --run --root practice/09-mcp-tool-bridge --config ../../repos/pi-mono/packages/coding-agent/vitest.config.ts
node repos/pi-mono/node_modules/typescript/lib/tsc.js -p practice/09-mcp-tool-bridge/tsconfig.json --pretty false
```

最终命令均退出 0。设施自检 **4 passed**，用户正式验收 **1 todo**，tsc 无诊断。见 [运行输出](baseline-output.txt)、[类型检查输出](baseline-tsc.txt)、[文件哈希](baseline.sha256)。

已验证范围：真实 stdio MCP 初始化与发现；两个服务同名工具的独立业务数据；新工具变体；查询/读取/业务错误；显式初始化/调用退出故障；正常关闭的进程存活检查；离线 Agent 模型响应与请求捕获。设施不会自动连接服务或替用户注册工具。

未验证：用户适配器仍是抛 TODO 的占位，未构造 Agent/MCP 完整桥接，不宣称新业务通过。初次自检发现 AI 服务端括号语法错误，已修复；故障用例补核对真实收到的协议消息，避免把服务脚本自身启动失败误当成指定阶段断连通过。

## 版本与范围

pi HEAD `36be9c612e64082a4f0d4d0a94706c38ecbc20a1`。已有 agent.ts、agent-loop.ts 修改和四个未跟踪扩展/配置/工具文件保留，本轮未改 pi 源码或依赖。关键源码的工作树哈希已绑定，不能只以 HEAD 代表状态。

已核对本地 pi-mcp 的 client、stdio transport、工具结果转换接口，以及 AgentTool/Agent 配置；官方协议依据与链接见 README。测试只覆盖文本工具的受限协议子集。

## 协助边界与资料搬迁

旧 rules 继承候选按用户要求移至 `tmp/09-inherited-rules/`，原代码与证据保留，原相对源码路径仍可解析；历史基线的工作目录路径保持原样，不事后改造旧证据。

AI 提供新需求、目录资料与受限服务端、离线模型/故障/轨迹设施、自检、函数占位和设计入口；用户负责连接管理、通用 MCP 工具适配、名称路由、真实 Agent 接线和验证选择。新增正式测试代码可由 AI 编写，待用户先选序列后补齐。
