// AI 设施：只读资料 MCP 服务端（限定协议子集），不实现用户的 Agent 适配层。
import { createInterface } from "node:readline";
import { appendFileSync, readFileSync } from "node:fs";

const [kind, tracePath, fault = "none", extra = "false"] = process.argv.slice(2);
const catalog = JSON.parse(readFileSync(new URL("./catalog.json", import.meta.url), "utf8"));
if (!(kind in catalog) || !tracePath) throw new Error("Expected docs|issues and trace path");
const trace = (event) => appendFileSync(tracePath, JSON.stringify({ pid: process.pid, server: kind, ...event }) + "\n");
const send = (id, result) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n");
const fail = (id, code, message) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }) + "\n");
const content = (text, isError = false) => ({ content: [{ type: "text", text }], isError });
const tools = [
  { name: "search", description: `Search ${kind} titles and bodies by substring; returns document IDs and titles.`,
    inputSchema: { type: "object", properties: { query: { type: "string", minLength: 1 } }, required: ["query"], additionalProperties: false } },
  { name: "get", description: `Read a ${kind} document by its ID. Unknown IDs return a tool execution error.`,
    inputSchema: { type: "object", properties: { id: { type: "string", minLength: 1 } }, required: ["id"], additionalProperties: false } },
];
if (extra === "true") tools.push({ name: "health", description: "Return this catalog's service identity.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false } });
trace({ event: "started" });
console.error(`catalog fixture ${kind} started`);
let initialized = false;
const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of lines) {
  let message;
  try { message = JSON.parse(line); } catch { fail(null, -32700, "Parse error"); continue; }
  trace({ event: "received", message });
  if (!("id" in message)) {
    if (message.method === "notifications/initialized") initialized = true;
    continue;
  }
  if (message.method === "initialize") {
    if (fault === "initialize") process.exit(17); // 明确的设施故障注入，不是 pi 缺陷。
    send(message.id, { protocolVersion: "2025-11-25", capabilities: { tools: {} }, serverInfo: { name: `${kind}-catalog`, version: "1.0.0" } });
    continue;
  }
  if (!initialized) { fail(message.id, -32002, "Not initialized"); continue; }
  if (message.method === "ping") { send(message.id, {}); continue; }
  if (message.method === "tools/list") { send(message.id, { tools }); continue; }
  if (message.method !== "tools/call") { fail(message.id, -32601, "Method not found"); continue; }
  if (fault === "call") process.exit(18);
  const { name, arguments: args = {} } = message.params ?? {};
  if (!tools.some((tool) => tool.name === name)) { fail(message.id, -32602, "Unknown tool"); continue; }
  if (name === "health") { send(message.id, content(kind)); continue; }
  const field = name === "search" ? "query" : "id";
  if (typeof args[field] !== "string" || args[field].length === 0) {
    fail(message.id, -32602, `Missing ${field}`); continue;
  }
  if (name === "search") {
    const query = args.query.toLowerCase();
    const matches = catalog[kind].filter((doc) => `${doc.title} ${doc.body}`.toLowerCase().includes(query));
    send(message.id, content(JSON.stringify(matches.map(({ id, title }) => ({ id, title })))));
  } else {
    const doc = catalog[kind].find((doc) => doc.id === args.id);
    send(message.id, doc ? content(`${doc.id}: ${doc.title}\n${doc.body}`) : content(`NOT_FOUND: ${args.id}`, true));
  }
}
