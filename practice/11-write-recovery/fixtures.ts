// AI 设施：可控外部服务及通用 JSON 存储，不包含恢复策略。
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import type { SubmitInput, Ticket, TicketService } from "./contracts.ts";

export type CreateMode = "success" | "reject" | "disconnect-before" | "disconnect-after";
export function createTicketService() {
  const tickets: Ticket[] = [];
  const trace: Array<{ method: "create" | "lookup"; requestKey: string; mode: string }> = [];
  const createModes: CreateMode[] = [];
  const lookupModes: Array<"available" | "unavailable"> = [];
  const service: TicketService = {
    async create(input: SubmitInput) {
      const mode = createModes.shift() ?? "success";
      trace.push({ method: "create", requestKey: input.requestKey, mode });
      if (mode === "reject") return { status: "rejected", reason: "TITLE_REJECTED" };
      if (mode === "disconnect-before") throw new Error("CONNECTION_LOST");
      const ticket = { ...input, ticketId: `ticket-${tickets.length + 1}` };
      tickets.push(ticket);
      if (mode === "disconnect-after") throw new Error("CONNECTION_LOST");
      return { status: "created", ticket: structuredClone(ticket) };
    },
    async lookup(requestKey: string) {
      const mode = lookupModes.shift() ?? "available";
      trace.push({ method: "lookup", requestKey, mode });
      if (mode === "unavailable") return { status: "unavailable" };
      const ticket = tickets.find((item) => item.requestKey === requestKey);
      return ticket ? { status: "found", ticket: structuredClone(ticket) } : { status: "absent" };
    },
  };
  return {
    service,
    queueCreate(...modes: CreateMode[]) { createModes.push(...modes); },
    queueLookup(...modes: Array<"available" | "unavailable">) { lookupModes.push(...modes); },
    get tickets() { return structuredClone(tickets); },
    get trace() { return structuredClone(trace); },
  };
}

// 支持 JSON 可序列化的数据。单进程、顺序调用，父目录已存在。
// 存储结构与何时读写由调用方决定；不提供恢复算法。
export function openJsonStore<State>(file: string) {
  return {
    read(): State | undefined {
      return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) as State : undefined;
    },
    write(state: State): void {
      writeFileSync(`${file}.tmp`, JSON.stringify(state), "utf8");
      renameSync(`${file}.tmp`, file);
    },
  };
}
