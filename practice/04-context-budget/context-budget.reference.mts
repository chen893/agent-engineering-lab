// 参考实现（AI 提供）：与 context-budget.mts 同接口，仅供对照阅读，不是本次练习的标准答案。
//
// 复杂度：整体 O(S + n)，S = 全部消息的序列化长度。
//   · 每条消息的序列化长度只算一次（合计 O(S)）。
//   · 数组成本按 “2 个括号 + 元素长度和 + 分隔逗号” 用 O(1) 递推，
//     删除单元时只做减法与计数，不重复整体序列化。
//   （对比：每次删单元都 cost(keep(...)) 是 O(单元数 · S)，2000 条量级可达秒级。）
//
// 设计要点（对应约定）：
//   1. 必保留集合 = 所有 system + 最后一条 user；用其长度和一次求出最低成本。
//   2. 其余消息切成“裁剪单元”：普通消息 1 条；带工具调用的 assistant 与其全部
//      tool 结果 1 组，用 toolCallId 判断归属，而不是只凭 role === "tool"。
//   3. 不改动入参：预算只在比较时使用，从旧到新删除单元，直到保留内容落入预算。
//   4. context 与 deletedIndexes 都从同一份“保留集合”派生，输出与删除报告天然一致；
//      失败只暴露原因与成本，不返回可直接发送给模型的上下文。

export type SystemMessage = {
  role: "system";
  content: string;
};
export type UserMessage = {
  role: "user";
  content: string | Array<{ type: "text"; text: string }>;
};
export type ToolResultMessage = {
  role: "tool";
  content: Array<{ type: "tool_result"; toolCallId: string; result?: unknown }>;
};
export type AssistantMessage = {
  role: "assistant";
  content:
    | string
    | Array<
        | { type: "text"; text: string }
        | { type: "tool_use"; toolCallId: string; args: Record<string, unknown> }
      >;
};
export type ContextMessage =
  | SystemMessage
  | UserMessage
  | AssistantMessage
  | ToolResultMessage;

export type CannotFitReason =
  | "required_messages_exceed_budget"
  | "budget_below_minimum";

export type FitContextResult =
  | {
      status: "success";
      context: ContextMessage[];
      deletedIndexes: number[];
      initialCost: number;
      finalCost: number;
    }
  | {
      status: "cannot_fit";
      reason: CannotFitReason;
      budget: number;
      initialCost: number;
      minimumCost: number;
    };

/** 本轮统一的成本口径：序列化后的字符串长度，不是真实 token 数。 */
export function cost(messages: readonly ContextMessage[]): number {
  return JSON.stringify(messages).length;
}

export function fitContext(
  messages: readonly ContextMessage[],
  budget: number,
): FitContextResult {
  const initialCost = cost(messages);

  // 每条消息的序列化长度只算一次（合计 O(S)），后续用 O(1) 递推数组成本。
  const messageLengths = messages.map(
    (message) => JSON.stringify(message).length,
  );

  // 1) 必保留集合：所有 system + 最后一条 user（保持相对顺序）。
  const requiredIndexes = collectRequiredIndexes(messages);
  const minimumCost = arrayCost(
    requiredIndexes.size,
    sumLengths(requiredIndexes, messageLengths),
  );

  // 2) 连最低成本都放不下：明确失败，且不提供可发送的上下文。
  if (minimumCost > budget) {
    return {
      status: "cannot_fit",
      reason:
        requiredIndexes.size > 0
          ? "required_messages_exceed_budget"
          : "budget_below_minimum",
      budget,
      initialCost,
      minimumCost,
    };
  }

  // 3) 从旧到新删除可删除单元，直到保留内容落入预算。
  //    每删一个单元只更新计数与长度和，成本用 arrayCost 直接读出，不再整体序列化。
  const deleted = new Set<number>();
  let keptCount = messages.length;
  let keptLength = messageLengths.reduce((sum, length) => sum + length, 0);
  for (const unit of buildRemovableUnits(messages, requiredIndexes)) {
    if (arrayCost(keptCount, keptLength) <= budget) break;
    for (const index of unit) {
      deleted.add(index);
      keptLength -= messageLengths[index];
      keptCount -= 1;
    }
  }

  // 4) 输出与删除报告从同一份保留集合派生，天然一致。
  const context = messages.filter((_, index) => !deleted.has(index));
  return {
    status: "success",
    context,
    deletedIndexes: [...deleted].sort((a, b) => a - b),
    initialCost,
    finalCost: cost(context),
  };
}

// ----------------------- 内部纯函数 -----------------------

/**
 * JSON 数组的序列化长度：
 *   空数组 = "[]" = 2；否则 = 2 个括号 + 元素长度之和 + (count − 1) 个逗号。
 * 这是数组长度的精确定义，用来避免重复序列化，不是把估算做得更“精确”。
 */
function arrayCost(count: number, elementLengthSum: number): number {
  return count === 0 ? 2 : 2 + elementLengthSum + (count - 1);
}

function sumLengths(
  indexes: Iterable<number>,
  messageLengths: readonly number[],
): number {
  let sum = 0;
  for (const index of indexes) sum += messageLengths[index];
  return sum;
}

/** 从后向前收集：所有 system + 最后一条 user。 */
function collectRequiredIndexes(
  messages: readonly ContextMessage[],
): Set<number> {
  const required = new Set<number>();
  let lastUserFound = false;
  for (let i = messages.length - 1; i >= 0; i--) {
    const role = messages[i].role;
    if (role === "system") {
      required.add(i);
    } else if (role === "user" && !lastUserFound) {
      required.add(i);
      lastUserFound = true;
    }
  }
  return required;
}

/** 把非必保留消息切成有序的裁剪单元（旧 → 新）；每个下标只被访问一次，整体 O(n)。 */
function buildRemovableUnits(
  messages: readonly ContextMessage[],
  required: ReadonlySet<number>,
): number[][] {
  const units: number[][] = [];
  for (let i = 0; i < messages.length; ) {
    if (required.has(i)) {
      i += 1;
      continue;
    }
    const unit = unitAt(messages, i, required);
    units.push(unit);
    i = unit[unit.length - 1] + 1;
  }
  return units;
}

/**
 * 以 start 为起点的裁剪单元：
 *  - 普通消息：只有它自己；
 *  - 带工具调用的 assistant：连同其全部 tool 结果，用 toolCallId 判定归属，
 *    整组一起保留或删除，不拆散调用与结果。
 */
function unitAt(
  messages: readonly ContextMessage[],
  start: number,
  required: ReadonlySet<number>,
): number[] {
  const head = messages[start];
  if (head.role !== "assistant") return [start];

  const callIds = toolUseIds(head);
  if (callIds.size === 0) return [start];

  const indexes = [start];
  for (let i = start + 1; i < messages.length; i++) {
    if (required.has(i)) break;
    const message = messages[i];
    if (message.role !== "tool") break;
    if (!toolResultIds(message).some((id) => callIds.has(id))) break;
    indexes.push(i);
  }
  return indexes;
}

function toolUseIds(message: AssistantMessage): Set<string> {
  const ids = new Set<string>();
  if (Array.isArray(message.content)) {
    for (const part of message.content) {
      if (part.type === "tool_use") ids.add(part.toolCallId);
    }
  }
  return ids;
}

function toolResultIds(message: ToolResultMessage): string[] {
  return message.content.map((part) => part.toolCallId);
}
