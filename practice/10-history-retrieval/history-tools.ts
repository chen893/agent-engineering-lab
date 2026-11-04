import {
  SessionManager,
  type SessionEntry,
} from "../../repos/pi-mono/packages/coding-agent/src/core/session-manager.ts";
import Type, {
  type TUnsafe,
} from "../../repos/pi-mono/node_modules/typebox/build/index.mjs";
import type {
  AgentTool,
  StreamFn,
} from "../../repos/pi-mono/packages/agent/src/types.ts";
type ToolsOptions = {
  cwd: string;
  sources: Array<{
    // 调用方分配的唯一来源名
    key: string;

    // jsonl 会话文件的绝对路径
    file: string;

    // 指定允许查询的分支终点
    leafId: string;
  }>;
};

const readHistorySchema = Type.Object({
  source: Type.String({ description: "会话的唯一别名" }),
  entryId: Type.String({ description: "实体id" }),
});

type ReadHistoryResult = {
  source: string;
  entryId: string;
  role: string;
  text: string;
};

type Hit = {
  source: string;
  entryId: string;
  role: string;
  preview: string;
};

function validateString(str: unknown) {
  if (typeof str !== "string" || str.trim().length === 0) {
    return false;
  }
  return true;
}

type SearchHistoryResult = {
  hits: Array<Hit>;
};
export default async function createHistoryTools(_options: ToolsOptions) {
  const { cwd, sources } = _options;
  // 1. 要不要校验参数中的 key、file、leafId 是否为空
  // 2. cwd 校验
  type Entry = { text: string; entryId: string; role: string };
  // let entriesMap: Record<string, Entry[]> = {};
  let entriesMap = new Map<string, Entry[]>();

  if (!validateString(cwd)) throw new Error("检验 cwd，需要字符串");

  for (const source of sources) {
    if (
      !validateString(source.file) ||
      !validateString(source.key) ||
      !validateString(source.leafId)
    ) {
      throw new Error("检查source参数，必须为字符串");
    }

    // 这里可能会抛出错误
    // 考虑到性能问题，这里也许可以考虑并发
    const session = await SessionManager.open(source.file);

    if (session.getCwd() !== cwd) {
      continue;
    }

    // 可能会抛出错误
    const entries = session.getBranch(source.leafId);

    let currentEntry: Entry | undefined;
    entries.forEach((entry) => {
      if (entry.type !== "message") return;
      if (
        !(entry.message.role === "assistant" || entry.message.role === "user")
      ) {
        return;
      }
      // 过滤纯文本信息
      if (typeof entry.message.content === "string") {
        entry.message.content = [
          {
            type: "text",
            text: entry.message.content,
          },
        ];
      }

      if (Array.isArray(entry.message.content)) {
        currentEntry = {
          entryId: entry.id,
          role: entry.message.role,
          text: entry.message.content
            .filter((content) => {
              return content.type === "text";
            })
            .map((item) => {
              return item.text;
            })
            .join("\n"),
        };
      }

      if (!currentEntry || currentEntry.text.trim() === "") {
        currentEntry = undefined;
        return;
      }
      let entries = entriesMap.get(source.key);

      if (!entries) {
        entries = [];
        entriesMap.set(source.key, entries);
      }
      entries.push(currentEntry);
      currentEntry = undefined;
    });
  }

  const searchHistorySchema = Type.Object({
    query: Type.String(),
  });

  function createSearchHistoryTool(): AgentTool<
    typeof searchHistorySchema,
    SearchHistoryResult
  > {
    return {
      description: "search_history",
      label: "search_history",
      name: "search_history",
      parameters: searchHistorySchema,
      async execute(toolCallId, params, signal) {
        return new Promise((resolve, reject) => {
          let aborted = false;
          const onAbort = () => {
            if (aborted) return;
            aborted = true;
            signal?.removeEventListener("abort", onAbort);
            reject(new Error("operations aborted"));
          };

          signal?.addEventListener("abort", onAbort);

          let { query } = params;
          if (query.trim().length === 0) {
            reject(new Error("query参数不能为空"));
            return;
          }
          query = query.trim();
          // try {
          (async () => {
            try {
              let sessionKeys = sources.map((item) => item.key);
              // Object.keys(sources);
              let hits: Hit[] = [];
              // let hitsSet = new Set();
              for (let key of sessionKeys) {
                const currentEntries = entriesMap.get(key);
                if (!currentEntries) continue;
                let lowQuery = query.toLowerCase();
                for (let entry of currentEntries) {
                  const lowText = entry.text.toLowerCase();
                  if (lowText.includes(lowQuery)) {
                    hits.push({
                      source: key,
                      entryId: entry.entryId,
                      role: entry.role,
                      preview:
                        entry.text.length > 120
                          ? entry.text.slice(0, 120)
                          : entry.text,
                    });
                    if (hits.length >= 5) break;
                  }
                }
                if (hits.length >= 5) break;
              }
              const resultText = JSON.stringify({
                hits,
              });

              if (aborted) return;
              resolve({
                isError: false,
                content: [{ type: "text", text: resultText }],
                details: {
                  hits,
                },
              });
            } catch (err) {
              reject(err);
            }
          })().finally(() => {
            onAbort();
          });
        });
      },
    };
  }

  function createReadHistoryTool(): AgentTool<
    typeof readHistorySchema,
    ReadHistoryResult | undefined
  > {
    return {
      description: "read_history tool",
      label: "read_history",
      name: "read_history",
      parameters: readHistorySchema,
      execute: async (toolCallId: string, params, signal) => {
        return new Promise((resolve, reject) => {
          let aborted = false;
          const onAbort = () => {
            if (aborted) return;
            aborted = true;
            signal?.removeEventListener("abort", onAbort);
            reject(new Error("operations aborted"));
          };
          signal?.addEventListener("abort", onAbort);

          (async () => {
            try {
              const { source, entryId } = params;
              if (!validateString(source) || !validateString(entryId)) {
                reject("source 和 entryId 必须为字符串");
                return;
              }
              let targetEntry;
              const entries = entriesMap.get(source);
              if (
                !entries ||
                !(targetEntry = entries.find(
                  (item) => item.entryId === entryId,
                ))
              ) {
                if (aborted) return;
                resolve({
                  isError: true,
                  content: [{ type: "text", text: "HISTORY_NOT_FOUND" }],
                  details: undefined,
                });
                return;
              }

              let readHistroyResult = {
                ...targetEntry,
                source,
              };
              if (aborted) return;
              resolve({
                isError: false,
                content: [
                  {
                    type: "text",
                    text: JSON.stringify(readHistroyResult),
                  },
                ],
                details: readHistroyResult,
              });
            } catch (err) {
              reject(err);
            }
          })().finally(() => {
            onAbort();
          });
        });
      },
    };
  }
  return [createSearchHistoryTool(), createReadHistoryTool()];
}
