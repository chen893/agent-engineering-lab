// AI 提供接口占位，核心策略由用户实现。直接使用当前 pi 的真实接口。
import type { AgentOptions } from "../../repos/pi-mono/packages/agent/src/agent.ts";

export function createRecentTurnsTransform(
  keepUserTurns: number,
): NonNullable<AgentOptions["transformContext"]> {
  // TODO：实现 README 中的轮次裁剪策略。暂时原样返回，便于先运行真实 Agent。
  /** 
   * 
## 本轮输入契约

- 只使用上述 pi 标准消息，不包含 custom 消息；消息为正常内存数据，不含有副作用的 getter。
- 一个“用户轮次”从一条 user 开始，到下一条 user 之前结束；其中可能包含多次模型响应及多批工具调用，不等同于 pi 的单次模型 turn。
- 输入来自串行对话：工具调用与对应结果完整、连续，不跨 user 边界。最新一轮可以仅有 user，或停在完整工具批次后。没有未完成工具调用。
- system 可出现在轮次之间或批次外；全部保留并保持顺序。首条 user 之前只有 system；无 user 时不裁剪。
- 不要求支持插话、乱序工具结果、畸形历史校验、图片预算或自定义消息。



1. keepUserTurns 为有限正整数时，保留最近 N 个用户轮次以及所有 system；轮次不足时保留全部。
2. 按轮次整体移除旧 user、assistant 和 toolResult，不改写消息、顺序或任何字段，不修改输入数组和消息对象。
3. 无 user、空历史，以及非法配置（0、负数、小数、NaN、Infinity）均原样回退，不抛错或拒绝 Promise。非法配置回退是本练习选择，不是 pi 强制配置策略。
4. 不维护跨请求累计计数；每次 hook 收到的历史都应独立判断。
5. 真实 Agent 连续两次 prompt 后，每次 convertToLlm 和模拟模型只收到对应保留轮次，而 agent.state.messages 仍有完整旧历史和新增回答。

本轮不设硬 token/字符预算，也不要求“超预算时阻止请求”：transformContext 的无抛错契约不适合直接照搬 04 的 cannot_fit 分支。硬预算停止需另选请求生命周期入口、明确正常错误事件，另行设计。
*/

  void keepUserTurns;

  let userIndexes: number[] = [];
  async function TurnsTransform(messages: readonly any[]): Promise<any[]> {
    if (
      !Number.isInteger(keepUserTurns) ||
      keepUserTurns <= 0 ||
      !isFinite(keepUserTurns)
    ) {
      return messages;
    }
    userIndexes = messages
      .map((m, i) => (m.role === "user" ? i : -1))
      .filter((i) => i >= 0);
    if (userIndexes.length <= keepUserTurns) {
      return messages;
    }

    const startIndex = userIndexes[userIndexes.length - keepUserTurns];
    return messages.filter(
      (_, i) => i >= startIndex || messages[i].role === "system",
    );
  }

  return TurnsTransform;
}
