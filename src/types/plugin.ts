// IBrokerPlugin 接口定义 — 多券商 plugin 框架入口
// IStage1Extractor / IStage2Formatter 分别在 raw.ts / formatter.ts 中定义

export interface IBrokerPlugin {
  readonly name: string;
  readonly displayName: string;
  readonly supportedFileTypes: string[];
  detect(filePath: string): Promise<number>;
}
