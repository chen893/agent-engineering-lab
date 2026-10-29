// AI 提供的入口占位；由用户选择并导入真实 ExtensionAPI 类型。
// 命令注册、数据类型、存储与恢复、模型上下文接入均由用户完成。

import type {} from "../../repos/pi-mono/packages/coding-agent/src/index.ts";

import type {
  ExtensionAPI,
  SessionEntry,
} from "@earendil-works/pi-coding-agent";

function isStringRecord(value: unknown): value is Record<string, string> {
  if (typeof value !== "object" || value === null) return false;
  if (Array.isArray(value)) return false; // 数组也是 object，必须排除
  return Object.keys(value).every(
    (k) => typeof (value as Record<string, unknown>)[k] === "string",
  );
}

const getRulesList = (entries: SessionEntry[]) => {
  let rules: Record<string, string> = {};

  let ruleKeySet = new Set();
  let removeKeySet = new Set();

  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (
      entry.type === "custom" &&
      (entry.customType === "set_rule" || entry.customType === "remove_rule")
    ) {
      const data = entry.data;
      if (!isStringRecord(data)) {
        // 数据格式错误
        return {};
      }
      const entryKey = Object.keys(data)[0];
      const entryValue = data[entryKey];

      // 不能是被移除的值或者是被后面覆盖的值
      if (
        entry.customType === "set_rule" &&
        !removeKeySet.has(entryKey) &&
        !ruleKeySet.has(entryKey)
      ) {
        ruleKeySet.add(entryKey);
        rules[entryKey] = entryValue;
      } else if (entry.customType === "remove_rule") {
        removeKeySet.add(entryKey);
      }
    }

    if (ruleKeySet.size === 10) {
      break;
    }
  }
  return rules;
};

export default function rulesExtension(pi: ExtensionAPI) {
  pi.registerCommand("rules", {
    description: "save a rule",
    handler: async (_args, ctx) => {
      // rule list
      // rule set key value
      // rule get key
      // rule remove key
      // set projectname pi  -v1
      // const [command, key] = _args.split(" ");

      // let command = _args.split(" ");
      const args = _args.trim();
      const commandEnd = args.indexOf(" ");
      const command = commandEnd === -1 ? args : args.slice(0, commandEnd);

      const rest = commandEnd === -1 ? "" : args.slice(commandEnd).trim();

      const keyEnd = rest.indexOf(" ");
      const key = keyEnd === -1 ? rest : rest.slice(0, keyEnd);
      const value = keyEnd === -1 ? "" : rest.slice(keyEnd).trim();

      console.log(_args + "\n", command.trim(), key, value);
      console.log("\n\n");

      if (!["list", "get", "set", "remove"].includes(command)) {
        ctx.ui.notify(
          `[${command}]不存在，仅可以使用 list、set、get、remove`,
          "error",
        );
        return;
      }

      if (command !== "list") {
        if (!/^[a-z][a-z0-9-]{0,31}$/.test(key)) {
          ctx.ui.notify(
            "子命令不存在 key 必须以小写字母开头，只能包含小写字母、数字和连字符，总长度 1-32",
            "error",
          );
          return;
        }
      }

      if (command === "set" || command === "remove") {
        if (command === "remove") {
          const rules = getRulesList(ctx.sessionManager.getEntries());
          const rulesKeys = Object.keys(rules);
          if (!rulesKeys.includes(key)) {
            ctx.ui.notify("未找到" + key);
            return;
          }
        }
        if (value === "" && command === "set") {
          ctx.ui.notify("值不能为空");
          return;
        }
        command === "set"
          ? pi.appendEntry("set_rule", { [key]: value })
          : pi.appendEntry("remove_rule", { [key]: "" });
        ctx.ui.notify(
          command === "set" ? `${key}: ${value} 保存成功` : `${key} 移除成功`,
        );
      } else if (command === "list" || command === "get") {
        const rules = getRulesList(ctx.sessionManager.getEntries());
        if (command === "list") {
          const rulesKeys = Object.keys(rules);

          if (rulesKeys.length === 0) {
            ctx.ui.notify("数据为空", "warning");
          } else {
            ctx.ui.notify(
              rulesKeys.map((key) => `${key}: ${rules[key]}`).join("\n"),
            );
          }
        } else if (command === "get") {
          if (!rules[key]) {
            ctx.ui.notify(`不存在 ${key} 的值，请检查`, "warning");
          } else {
            ctx.ui.notify(`${key}: ${rules[key]}`);
          }
        }
      }
    },
  });

  pi.on("before_agent_start", (event, ctx) => {
    const rules = getRulesList(ctx.sessionManager.getEntries());
    const rulesKeys = Object.keys(rules);
    const sessionRules = `${rulesKeys.length === 0 ? "none" : rulesKeys.map((key) => key + ":" + rules[key]).join("\n")}`;
    const promptSession = event.systemPromptOptions.sections;
    if (rulesKeys.length > 0) {
      promptSession["session_rules"] = sessionRules;
    }
    return {
      systemPrompt: event.systemPrompt,
      systemPromptOptions: {
        ...event.systemPromptOptions,
        sessions: promptSession,
      },
    };
  });
}
