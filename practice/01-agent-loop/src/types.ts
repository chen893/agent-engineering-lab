// AI 提供的练习协议，不代表 pi 或任何模型提供商的真实接口。
// 本轮仅处理数字参数；运行时参数校验留到下一轮。
export type ToolCall = {
  id: string;
  name: string;
  arguments: { a: number; b: number };
};

// 保留用户已有的返回结构，暂不引入更复杂的类型设计。
export type ToolResult = {
  toolCallId: string;
  result?: unknown;
  isError?: boolean;
  errorMessage?: string;
};

export type ModelReply = {
  role: "assistant";
  content: string;
  // 本轮每次最多一个调用；缺省或 null 均表示没有工具调用。
  call?: ToolCall | null;
};

export type Message =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | ModelReply
  | { role: "tool"; output: ToolResult };

export type Model = (messages: readonly Message[]) => Promise<ModelReply>;

export type RunOptions = {
  messages: readonly Message[];
  model: Model;
  maxSteps: number;
  getFollowUpMessage?: () => string;
};

export type RunResult = {
  status: "completed" | "max_steps";
  messages: Message[];
  steps: number;
};
