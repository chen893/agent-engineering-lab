import type { AgentTool } from "@earendil-works/pi-agent-core";
import { type Static, Type } from "typebox";

import type { ExtensionContext, ToolDefinition } from "../extensions/types.ts";
import { runProcess } from "./execute-process.ts";
import { wrapToolDefinition } from "./tool-definition-wrapper.ts";

const processToolSchema = Type.Object({
	executable: Type.String({ description: "要执行的命令或者可执行文件的路径" }),
	args: Type.Array(Type.String({ description: "传给命令的参数列表" })),
});

export type ProcessToolInput = Static<typeof processToolSchema>;
/**
 
- 工具名 run_process；参数为 executable:string 和 args:string[]，由你定义真实 schema，并将返回类型从 unknown 改为相应 AgentTool 类型。
- execute 将真实传入的 signal 转交 runProcess。
- 零退出返回成功；非零退出和取消返回 isError=true。details 保留 RunResult，文本 content 至少包含输出及退出码/取消原因。启动异常允许直接抛出，由真实 Agent 处理；不要求你再造一套异常协议。
- 不使用 any 或类型断言伪装成有效工具。TypeBox 可从现有 `repos/pi-mono/node_modules/typebox/build/index.mjs` 用相对路径导入，无需安装依赖。

在你编写的集成测试中使用真实 Agent，模拟模型先返回一个 run_process toolCall。命令运行到 READY 后由测试调用 agent.abort。核实进程已退出、工具结果为错误、Agent 最终空闲；再让同一个 Agent 完成一次正常 prompt，证明取消没有破坏后续运行。

本轮只用单次工具调用、不入队 steering/follow-up，也不运行 05 的裁剪 hook。模型响应及事件必须符合真实 StreamFn 协议。05 的消息构造函数可参考或复用，但它的 mockStream 只返回普通回答，不能直接证明工具执行链。

 */

function validateProcessInput(input: ProcessToolInput): ProcessToolInput {
	if (typeof input.executable !== "string" || !Array.isArray(input.args)) {
		throw new Error("processTool 参数验证失败，请确保executable 为字符串，args 为字符串数组");
	}
	return input;
}

export function createProcessToolDefinition(cwd: string): ToolDefinition<typeof processToolSchema> {
	return {
		name: "process",
		label: "process",
		description: "process tool",
		parameters: processToolSchema,
		async execute(_toolCallId, input: ProcessToolInput, signal?: AbortSignal, _onUpdate?, ctx?: ExtensionContext) {
			const { executable, args } = validateProcessInput(input);
			//   const { cwd = process.cwd(), signal, onSpawn, onStdout, onStderr } = options;

			const result = await runProcess(executable, args, {
				signal: signal,
				cwd,
			});

			if (result.status === "aborted") {
				throw new Error("aborted");
			}
			return result;
		},
	};
}

export const processToolSystemPromptContribution = {
	snippet: "execute process commands",
	guidelines: ["you can inspect "],
};

const processToolConfig = {
	name: "process",
	label: "process",
	shellName: "process",
	prompt: "$",
	promptSnippet: processToolSystemPromptContribution.snippet,
	promptGuidelines: processToolSystemPromptContribution.guidelines,
	tempFilePrefix: "pi-process",
};

export function createProcessTool(cwd: string): AgentTool<typeof processToolSchema> {
	const definition = createProcessToolDefinition(cwd);
	const tool = wrapToolDefinition(definition);
	Object.assign(tool, {
		promptSnippet: definition.promptGuidelines,
		promptGuidelines: definition.promptGuidelines,
	});
	return tool;
}
