# 实现前预测

由用户填写，可简短回答；AI 未提供答案。

1. 一条 user 之后发生两次模型请求和一批工具调用，按本轮定义算几个用户轮次？为什么不能直接 slice(-N)？
2. transformContext 返回较短的新数组后，模型请求与 agent.state.messages 各会看到什么？依据哪段源码？
3. 如果 hook 对收到的 messages 调用 splice，完整历史会有什么风险？

## 实现中卡点与使用的帮助

待填写。
