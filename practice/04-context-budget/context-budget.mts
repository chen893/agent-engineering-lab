// 保留用户的反向扫描与切分点结构；AI 仅修正精确成本和失败返回。


type SystemMessage = {
  role: "system";
  content: string;
};
type UserMessage = {
  role: "user";
  content: string | Array<{ type: "text"; text: string }>;
};
type ToolResultMessage = {
  role: "tool";
  content: Array<{
    type: "tool_result";
    toolCallId: string;
    result?: unknown;
  }>;
};

type AssistantMessage = {
  role: "assistant";
  content:
    | string
    | Array<
        | { type: "text"; text: string }
        | {
            type: "tool_use";
            toolCallId: string;
            args: Record<string, unknown>;
          }
      >;
};

export type ContextMessage =
  | SystemMessage
  | UserMessage
  | AssistantMessage
  | ToolResultMessage;

export type FitContextResult =
  | {
      status: "success";
      context: ContextMessage[];
      deletedIndexes: number[];
      initialCost: number;
      finalCost: number; // 裁剪后实际成本，不是剩余额度
    }
  | {
      status: "cannot_fit";
      reason: "required_messages_exceed_budget" | "budget_below_minimum";
      budget: number;
      initialCost: number;
      minimumCost: number;
    };
// 本轮统一使用的成本函数；这是字符串长度，不是真实 token 数。
export function cost(messages: readonly ContextMessage[]): number {
  return JSON.stringify(messages).length;
}

export function fitContext(
  messages: readonly ContextMessage[],
  budget: number,
): FitContextResult {
  const savedIndexs = new Set<number>();
  let totalCost = 0;
  let isUserSaved = false;
  const initialCost = cost(messages);
  const deletedIndexes: number[] = [];
  // 只缓存消息本体长度，括号与逗号在数组层单独计算。
  const messageCosts = messages.map((message) => JSON.stringify(message).length);
  for (let i = messages.length - 1; i >= 0; i--) {
    const role = messages[i].role;
    if (role === "system") {
      savedIndexs.add(i);
      totalCost += messageCosts[i];
    } else if (role === "user") {
      if (!isUserSaved) {
        savedIndexs.add(i);
        totalCost += messageCosts[i];
        isUserSaved = true;
      }
    }
  }
  // 空数组也是 2 个字符；非空数组有 n - 1 个逗号。
  totalCost += 2 + Math.max(0, savedIndexs.size - 1);

  if (budget < totalCost) {
    return {
      status: "cannot_fit",
      reason: savedIndexs.size > 0
        ? "required_messages_exceed_budget"
        : "budget_below_minimum",
      budget,
      initialCost,
      minimumCost: totalCost,
    };
  }

  const newBudget = budget - totalCost;
  totalCost = 0;
  let keptCount = savedIndexs.size;
  // 保留原来的反向扫描，寻找分割点。
  let cutPoint = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (savedIndexs.has(i)) continue;
    // 给已有元素的数组加一条消息，需要多一个逗号；首次添加不需要。
    const messageCost = messageCosts[i] + (keptCount > 0 ? 1 : 0);
    if (totalCost + messageCost > newBudget) {
      cutPoint = i;
      break;
    }
    totalCost += messageCost;
    keptCount++;
  }

  if (cutPoint === messages.length - 1) {
    const result: ContextMessage[] = [];
    for (let i = 0; i < messages.length; i++) {
      if (savedIndexs.has(i)) result.push(messages[i]);
      else deletedIndexes.push(i);
    }
    return {
      status: "success",
      context: result,
      deletedIndexes,
      initialCost,
      finalCost: cost(result),
    };
  }

  // 连续批次契约下，切分点右侧紧邻的 tool 都属于被截断的批次。
  let finishIndex = cutPoint + 1;
  while (
    finishIndex < messages.length &&
    messages[finishIndex].role === "tool"
  ) {
    finishIndex++;
  }
  const result: ContextMessage[] = [];
  for (let i = 0; i < messages.length; i++) {
    if (savedIndexs.has(i) || i >= finishIndex) result.push(messages[i]);
  }

  return {
    status: "success",
    context: result,
    deletedIndexes: messages
      .map((_, index) => index)
      .filter((index) => !savedIndexs.has(index) && index < finishIndex),
    initialCost,
    finalCost: cost(result),
  };
}
