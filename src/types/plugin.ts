// IBrokerPlugin 接口定义 — 多券商 plugin 框架入口
// A3 步骤会填充完整实现

export interface IBrokerPlugin {
  readonly name: string;
  readonly displayName: string;
  readonly supportedFileTypes: string[];
  detect(filePath: string): Promise<number>;
}

export interface IStage1Extractor {
  extract(pdfPath: string): Promise<unknown>;
}

export interface IStage2Formatter {
  format(rawData: unknown): Promise<unknown>;
}
