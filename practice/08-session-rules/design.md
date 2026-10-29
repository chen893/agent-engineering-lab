# 实验 08 设计与验证

模式：能力校准。以下为 AI 留出的记录入口，未提供方案。

## 接入选择与源码依据（用户填写）

说明为什么采用 extension；Tool、Skill、MCP 是否有必要参与本需求。
记录加载、命令分发、持久化、恢复、模型输入这条链路中的关键文件/符号。

## 数据与生命周期（用户填写）

说明状态归属、保存格式、更新/删除、重新打开会话及新会话隔离。

## 验证方案（用户填写）

先选择操作序列、预期结果与观察位置，再编写测试。
如何区分“内存里存在”“写入磁盘”“本次模型实际收到”？

## 协助记录

AI：需求与验收契约、离线模型和临时目录设施、空入口、基线核对。
后续使用的提示、参考实现或 AI 代写部分由实际发生情况补充。

/\*\*

- Custom entry for extensions to store extension-specific data in the session.
- Use customType to identify your extension's entries.
-
- Purpose: Persist extension state across session reloads. On reload, extensions can
- scan entries for their customType and reconstruct internal state.
-
- Does NOT participate in LLM context (ignored by buildSessionContext).
- For injecting content into context, see CustomMessageEntry.
  \*/
  export interface CustomEntry<T = unknown> extends SessionEntryBase {
  type: "custom";
  customType: string;
  data?: T;
  }

通过自定义customentry ，保存/rule 的数据

2026-10-27：用户要求 AI 接手未补测试。AI 补齐契约用例、通知与清理设施，运行并记录审查；未修改核心扩展。完整协助范围与待验证解释见 [verification.md](verification.md)。

2026-10-27 后续：AI 提供位置解析示例、key 正则及校验解释；用户完成当前修改，正式测试已通过。AI 按用户请求提供职责拆分示范但未代改核心实现。协助程度及后续校准依据见 [最新验收](verification-latest.md)。
