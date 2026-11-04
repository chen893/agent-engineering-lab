// AI 提供薄工具适配，恢复逻辑全部委托 coordinator。
import Type from "../../repos/pi-mono/node_modules/typebox/build/index.mjs";
import type { AgentTool } from "../../repos/pi-mono/packages/agent/src/types.ts";
import type { TicketCoordinator } from "./contracts.ts";

const schema = Type.Object({ requestKey: Type.String(), title: Type.String() });
export function createTicketTool(
  coordinator: TicketCoordinator,
): AgentTool<typeof schema> {
  return {
    name: "submit_ticket",
    label: "Submit ticket",
    description:
      "Create or recover a ticket submission. Reuse requestKey for the same business request, including after unknown results. Keep its title unchanged. Report unknown honestly.",
    parameters: schema,
    async execute(_toolCallId, input) {
      const result = await coordinator.submit(input);
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        details: result,
      };
    },
  };
}
