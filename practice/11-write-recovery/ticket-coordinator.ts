import type {
  CreateResult,
  TicketCoordinator,
  TicketService,
} from "./contracts.ts";
import type { SubmitResult, FileItem, FileData } from "./contracts.ts";
import { openJsonStore } from "./fixtures.ts";
// 用户实现：状态结构、持久化时机、结果分类及再次调用时的恢复决策。

export function createTicketCoordinator(_options: {
  service: TicketService;
  stateFile: string;
}): TicketCoordinator {
  const { service, stateFile } = _options;
  return {
    submit: async (input) => {
      const { requestKey, title } = input;

      const store = openJsonStore<FileData>(stateFile);
      const fileData = store.read() || {};
      let result: SubmitResult | undefined;

      const create = async () => {
        let createResult: CreateResult;
        try {
          createResult = await service.create(input);
        } catch (err) {
          // reject(new Error("CONNECTION_LOST"));
          const message = err instanceof Error ? err.message : String(err);
          if (message === "CONNECTION_LOST") {
            const unknownResult = {
              status: "unknown",
              requestKey,
            } as const;
            fileItem = { ...unknownResult, title };
            fileData[requestKey] = fileItem;
            store.write(fileData);
            return unknownResult;
          } else {
            throw err;
          }
        }
        let submitResult: SubmitResult;
        if (createResult.status === "created") {
          submitResult = {
            status: "created",
            requestKey: requestKey,
            ticketId: createResult.ticket.ticketId,
          } as const;
          fileItem = { ...submitResult, title };
        } else {
          submitResult = {
            status: "rejected",
            requestKey: requestKey,
            reason: createResult.reason,
          } as const;
          fileItem = { ...submitResult, title };
        }
        fileData[requestKey] = fileItem;
        store.write(fileData);
        return submitResult;
      };

      // 判断在旧记录中是否存在
      let fileItem = Object.hasOwn(fileData, requestKey)
        ? fileData[requestKey]
        : undefined;

      if (
        fileItem &&
        fileItem.requestKey === requestKey &&
        fileItem.title !== title
      ) {
        return { status: "conflict", requestKey };
      }

      // 文件记录中没存在
      if (!fileItem || fileItem?.requestKey !== requestKey) {
        // 存一个本地转态表示这个请求过。
        fileItem = {
          status: "unknown",
          requestKey: requestKey,
          title: title,
        };
        fileData[requestKey] = fileItem;
        store.write(fileData);

        return await create();
      }

      if (fileItem.status === "created") {
        return {
          status: "created",
          requestKey,
          ticketId: fileItem.ticketId,
        };
      } else if (fileItem.status === "rejected") {
        return {
          status: "rejected",
          requestKey,
          reason: fileItem.reason,
        };
      } else {
        // fileItem.status === unknwon
        // 变更fileItem状态为新的值

        const lookUpResult = await service.lookup(requestKey);
        if (lookUpResult.status === "found") {
          result = {
            status: "created",
            requestKey,
            ticketId: lookUpResult.ticket.ticketId,
          };
          fileItem = {
            ...result,
            title,
          };
          fileData[requestKey] = fileItem;
          store.write(fileData);
          return result;
        } else if (lookUpResult.status === "absent") {
          return await create();
        } else {
          // unavailable
          return {
            status: "unknown",
            requestKey,
          };
        }
      }
    },
  };
  // throw new Error("TODO: implement ticket coordinator");
  //
}
