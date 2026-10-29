# 第一次源码对照：继续还是结束

仓库：`https://github.com/badlogic/pi-mono.git`

已核对提交：`9a3ca68bda4db67efc506ec114bffe64635e8569`。

模式：能力校准。AI 已定位并阅读下面的控制流，用户尚未提交阅读结论；未运行 pi。

## 阅读范围

文件：`../../repos/pi-mono/packages/agent/src/agent-loop.ts`。

1. 看 `runLoop` 到内层 while（当前工作树约 177–198 行），认识两层循环及其条件。
2. 重点读 `Stream assistant response` 到函数结束（当前工作树约 260–352 行），从模型响应到外层循环退出。工作树排版已变化，优先用函数和注释定位，初始提交的行号不直接代表当前工作树。
3. 暂不展开流式响应、工具执行、事件通知的内部实现，也不通读整个文件。

本轮可把 `streamAssistantResponse` 当作取得一次模型响应的函数，把 `executeToolCalls` 当作返回工具结果批次的函数。这里工具调用从 `message.content` 的 `toolCall` 块中筛选，和练习中的单个 `call` 字段不同。

`currentContext.messages` 是当前上下文中的消息；`newMessages` 记录本次运行新增的消息。`emit` 发出生命周期事件，暂不追踪订阅者。

## 一个完整阅读任务

判断下面三种情况下，是否会再次请求模型，并写出支持结论的变量变化、条件和行号。

共同假设：模型正常响应（非 error、aborted、length）；不配置 prepareNextTurn、prepareRequest、finishTurn；没有 steering 消息。工具正常执行，返回批次的 terminate 为 false。

| 场景 | 是否再次请求模型 | 关键变量、条件及行号 |
| --- | --- | --- |
| 模型返回一个工具调用，没有 follow-up 消息 | 待填写 | 待填写 |
| 模型只返回文字，没有 follow-up 消息 | 待填写 | 待填写 |
| 模型只返回文字；getFollowUpMessages 首次返回一条用户消息，随后返回空数组 | 待填写 | 待填写 |

最后用自己的话说明：你的实验中“没有 call 就结束”的判断，迁移到这段真实代码后需要补充什么条件？

完成标准：三条路径都能指出代码证据，尤其区分退出内层循环和结束整个运行；无需本轮修改 pi 或安装依赖。

## 用户阅读结果

用户已解释：内层由工具调用或 pendingMessages 驱动，退出后还需检查 follow-up 或显式继续，因此退出内层不等于整个 Agent 结束。该结构理解与当前代码一致。

待校准：pendingMessages 的“优先”指进入下一次模型请求前注入，并非跳过本轮工具调用；它也可能接收 follow-up 消息，并不只代表运行中输入。finishTurn 在内层每轮末尾调用，外层读取已保存的继续决定；返回 end 时直接退出，follow-up 检查在外层显式继续分支之前。

以上为用户解释与 AI 源码核对，不是运行或迁移验证。三种具体场景尚未逐条提交轨迹。

组合场景复盘：用户正确指出 finishTurn 返回 end 时直接退出 agent-loop，不再请求模型。AI 补充：该 return 位于 getFollowUpMessages 调用之前，因此本次运行不会读取 follow-up 队列；这不意味着队列已被清空。用户已解释关键终止分支，尚未进行运行验证。
