// AI 提供的空入口；扩展类型、注册及核心逻辑由用户完成。
export function createOutputExtension(options: { artifactDir: string }) {
  void options;
  throw new Error("TODO: implement output extension");
}

export default function outputExtension() {
  throw new Error("TODO: register extension with project artifact directory");
}
