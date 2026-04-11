// IBrokerPlugin 接口定义 — 多券商 plugin 框架入口
// IStage1Extractor / IStage2Formatter 分别在 raw.ts / formatter.ts 中定义

import { IStage1Extractor } from './raw';
import { IStage2Formatter } from './formatter';

export interface IBrokerPlugin {
  readonly name: string;
  readonly displayName: string;
  readonly supportedFileTypes: string[];
  /** 检测 PDF 是否属于该券商，返回 0~1 置信度 */
  detect(filePath: string): Promise<number>;
  /** 创建 Stage1 提取器实例 */
  createExtractor(): IStage1Extractor;
  /** 创建 Stage2 格式化器实例 */
  createFormatter(config?: Record<string, unknown>): IStage2Formatter;
}
