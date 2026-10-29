// AI 提供接口和等待设施；retry 主体由用户实现。
export type RetryOptions = {
  retries: number;
  delayMs: number;
  wait?: (ms: number) => Promise<void>;
};

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function retry<T>(
  request: () => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const retries = options.retries;
  for (let i = 0; i <= retries; i++) {
    try {
      const result = await request();
      return result;
    } catch (error) {
      if (i === retries) {
        throw error;
      }
      if (options.wait) {
        await options.wait(options.delayMs);
      } else {
        await sleep(options.delayMs);
      }
    }
  }
  throw new Error(
    "Unreachable code: retry loop exited without returning or throwing",
  );
}
