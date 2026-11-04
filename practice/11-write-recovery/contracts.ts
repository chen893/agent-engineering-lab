// AI 提供外部接口；本地持久化状态结构由实现者设计。
export type SubmitInput = { requestKey: string; title: string };
export type Ticket = SubmitInput & { ticketId: string };
export type CreateResult =
  | { status: "created"; ticket: Ticket }
  | { status: "rejected"; reason: string };
export type LookupResult =
  | { status: "found"; ticket: Ticket }
  | { status: "absent" }
  | { status: "unavailable" };
export interface TicketService {
  create(input: SubmitInput): Promise<CreateResult>;
  lookup(requestKey: string): Promise<LookupResult>;
}
export type SubmitResult =
  | { status: "created"; requestKey: string; ticketId: string }
  | { status: "rejected"; requestKey: string; reason: string }
  | { status: "unknown"; requestKey: string }
  | { status: "conflict"; requestKey: string };
export interface TicketCoordinator {
  submit(input: SubmitInput): Promise<SubmitResult>;
}

export type FileItem =
  | { requestKey: string; title: string; status: "created"; ticketId: string }
  | { requestKey: string; title: string; status: "rejected"; reason: string }
  | { requestKey: string; title: string; status: "unknown" };

export type FileData = Record<string, FileItem>;
