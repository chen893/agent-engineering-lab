// AI 提供函数入口；选用真实 pi 类型后替换 unknown。
// 用户负责：连接与工具发现、通用工具适配、Agent 接线和资源释放。
// AI 未提供连接流程、名称路由表、schema 适配或错误映射实现。

import { McpClient } from "../../repos/pi-mono/packages/mcp/src/client.ts";
import { StdioTransport } from "../../repos/pi-mono/packages/mcp/src/transports/stdio.ts";
import { Agent } from "../../repos/pi-mono/packages/agent/src/agent.ts";
import type { Model } from "../../repos/pi-mono/packages/ai/src/types.ts";
import type {
  AgentTool,
  StreamFn,
} from "../../repos/pi-mono/packages/agent/src/types.ts";
import { toLlmContent } from "../../repos/pi-mono/packages/mcp/src/protocol/content.ts";
import Type, { type TUnsafe } from "../../repos/pi-mono/node_modules/typebox/build/index.mjs";
type McpArguments = Record<string, unknown>;
type McpParameters = TUnsafe<McpArguments>;

type Tools = AgentTool<McpParameters, Record<string, never>>[];

type McpAgentOptions = {
  servers: Array<{ name: string; command: string; args: string[] }>;
  name: string;
  model: Model<string>;
  streamFn: StreamFn;

  getApiKey?: (
    provider: string,
  ) => Promise<string | undefined> | string | undefined;
};
type McpServers = Record<
  string,
  {
    transport: StdioTransport;
    mcpClient: McpClient;
  }
>;

const validateString = (str: unknown) => {
  if (typeof str !== "string") return false;
  if (str.trim().length === 0) return false;
  return true;
};

function validateOptions(_options: McpAgentOptions) {
  const { servers } = _options;
  const validName = /^[a-z0-9_]+$/;
  let serverNameSet = new Set();
  // 校验 servers 参数
  for (let server of servers) {
    if (serverNameSet.has(server.name)) {
      throw new Error("请检查参数配置，当前存在同名服务");
    }
    if (!validName.test(server.name)) {
      throw new Error(`非法服务名称 ${server.name}`);
    }
    serverNameSet.add(server.name);
    if (
      !validateString(server.command) ||
      !validateString(server.name) ||
      server.args.some((item) => !validateString(item))
    ) {
      throw new Error(
        "请检查参数配置 servers: Array<{ name: string; command: string; args: string[] }>",
      );
    }
  }
  serverNameSet.clear();
}

let connectServer = async (
  server: {
    name: string;
    command: string;
    args: string[];
  },
  mcpServers: McpServers,
  tools: Tools,
) => {
  const transport = new StdioTransport(server);
  const mcpClient = new McpClient({ name: server.name, version: "1.0.0" });
  mcpServers[server.name] = {
    transport,
    mcpClient,
  };
  await mcpClient.connect(transport);

  function isRecordOrUndefined(
    param: unknown,
  ): param is Record<string, unknown> | undefined {
    if (param === undefined) return true;
    return typeof param === "object" && param !== null && !Array.isArray(param);
  }
  const currentTools = await mcpClient.listTools();
  for (let tool of currentTools) {
    tools.push({
      label: `mcp__${server.name}__${tool.name}`,
      name: `mcp__${server.name}__${tool.name}`,

      description: tool.description || `mcp__${server.name}__${tool.name}`,
      parameters: Type.Unsafe<McpArguments>(tool.inputSchema),
      execute: async (toolCallId, params, signal) => {
        if (!isRecordOrUndefined(params))
          return {
            isError: true,
            content: [{ type: "text", text: "参数错误" }],
            details: {},
          };
        try {
          const result = await mcpClient.callTool(tool.name, params, {
            signal: signal,
          });

          return {
            content: toLlmContent(result),
            isError: result.isError,
            // details: JSON.parse(result?.structuredContent || '{}'),
            details: {},
          };
        } catch (err) {
          throw new Error(`Mcp 工具${server.name}/${tool.name} 调用失败`, {
            cause: err,
          });
        }
      },
    });
  }
};
export async function createMcpAgent(_options: McpAgentOptions) {
  // 校验参数

  const { servers } = _options;

  validateOptions(_options);
  // 检查每个值存在并且为字符串不为空

  let mcpServers: McpServers = {};
  let tools: Tools = [];

  let disposePromise: Promise<void> | undefined;

  function dispose(): Promise<void> {
    if (disposePromise) return disposePromise;

    disposePromise = Promise.resolve().then(async () => {
      const clients = Object.values(mcpServers).map(
        ({ mcpClient }) => mcpClient,
      );

      const results = await Promise.allSettled(
        clients.map((client) => client.close()),
      );

      const errors = results
        .filter((result) => result.status === "rejected")
        .map((result) => result.reason);

      if (errors.length > 0) {
        throw new AggregateError(errors, "部分 MCP Client 关闭失败");
      }
    });

    return disposePromise;
  }
  let promiseAll = [];

  for (let server of servers) {
    promiseAll.push(connectServer(server, mcpServers, tools));
  }

  try {
    const results = await Promise.allSettled(promiseAll);
    const failures = results.flatMap((result, index) =>
      result.status === "rejected"
        ? [
            {
              server: servers[index].name,
              reason: result.reason,
            },
          ]
        : [],
    );
    if (failures.length > 0) {
      await dispose();

      throw new AggregateError(
        failures.map(({ reason }) => reason),
        `MCP 服务启动失败： ${failures.map((f) => f.server).join(",")}`,
      );
    }
  } catch (err) {
    await dispose();
    throw new Error("mcp服务启动失败");
  }
  const agent = new Agent({
    initialState: {
      tools: tools,
      model: _options.model,
    },
    streamFn: _options.streamFn,
    getApiKey: _options.getApiKey,
  });

  return {
    agent,
    dispose,
  };
}
