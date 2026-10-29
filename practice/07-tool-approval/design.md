# 实验 07：设计与验证选择

以下问题由 AI 提供，回答由用户填写。完整契约见 README，不需要重复抄写。

## 接入选择

TODO：记录实际读到的接口与关键源码位置。解释为什么选择此处、工具参数校验/execute/结果生成分别发生在审批的哪一侧。

工具参数校验在 beforeToolCall 前面， beforeToolCall 审批通过后才开始执行工具调用，得到工具调用结果。

在 agent-loop.ts 中 存在一个 beforeToolCall 函数调用，如果config.beforeToolCall 存在会传递 assistantMessage、toolCall、args、context，并通过返回结果 beforeResult?.block 决定是否返回 kind: "immediate", isError: true,
在 agent.ts 中，构造函数传入 this.beforeToolCall = runtimeOptions.beforeToolCall;
可以通过在构造函数的options 传递 beforeToolCall从而影响agent-loop 的行为

## 审批状态与身份

TODO：哪些事件改变哪些状态？分别由谁等待、谁发出决定、谁处理取消？哪些资源需要收尾？怎样区分工具调用身份与审批身份？可用文字、表格或图。
onRequest改变状态，

## 验证设计

TODO：自行选择关键输入、操作时点、预期行为与证据，覆盖 README 契约。先写预期，再写正式测试；不按测试数量评分。

## 实际协助与待确认问题

初始 AI 提供：任务契约、文件/模型设施及设施检查、空实现入口与测试占位、pi 既有测试的基线核对。审批实现、接线与正式验证尚未完成。

TODO：按实际发生补充提示、代写范围或你发现的契约/设施问题。
