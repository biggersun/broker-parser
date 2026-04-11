/**
 * ParsePipeline — 解析管道编排器
 *
 * 编排 Stage1（提取） → Stage2（格式化） → Stage3（清理）流程，
 * 返回结构化结果和各阶段耗时元数据。
 *
 * 支持模式：
 * - raw: 只执行 Stage1，输出原始表格数据
 * - noClean: 跳过 Stage3 清理步骤
 */

import { StatementData } from '../types/statement';
import { RawTableData } from '../types/raw';

import { cleanStatementData } from './cleaning';
import { PluginRegistry } from './registry';

/** 解析选项 */
export interface ParseOptions {
  /** 指定券商名称，默认自动检测 */
  broker?: string;
  /** 只输出 Stage1 raw 数据 */
  raw?: boolean;
  /** 跳过 Stage3 清理 */
  noClean?: boolean;
  /** 输出耗时详情 */
  verbose?: boolean;
}

/** 各阶段耗时（毫秒） */
export interface ParseTimings {
  detect: number;
  stage1: number;
  stage2: number;
  clean: number;
  total: number;
}

/** 解析结果 */
export interface ParseResult {
  data: StatementData | RawTableData;
  broker: string;
  raw: boolean;
  metadata: {
    timings: ParseTimings;
    parserVersion: string;
  };
}

export class ParsePipeline {
  constructor(private readonly registry: PluginRegistry) {}

  /** 执行完整解析管道 */
  async parse(pdfPath: string, opts: ParseOptions = {}): Promise<ParseResult> {
    const overallStart = Date.now();
    const timings: ParseTimings = { detect: 0, stage1: 0, stage2: 0, clean: 0, total: 0 };

    // Step 1: 获取 plugin（指定券商或自动检测）
    let t = Date.now();
    const plugin = opts.broker
      ? this.registry.getPlugin(opts.broker)
      : await this.registry.autoDetect(pdfPath);
    timings.detect = Date.now() - t;

    // Step 2: Stage1 提取原始数据
    t = Date.now();
    const extractor = plugin.createExtractor();
    const rawData = await extractor.extract(pdfPath);
    timings.stage1 = Date.now() - t;

    // raw 模式：只输出 Stage1 数据
    if (opts.raw) {
      timings.total = Date.now() - overallStart;
      return {
        data: rawData,
        broker: plugin.name,
        raw: true,
        metadata: { timings, parserVersion: '0.1.0' },
      };
    }

    // Step 3: Stage2 格式化
    t = Date.now();
    const formatter = plugin.createFormatter();
    let statementData = await formatter.format(rawData);
    timings.stage2 = Date.now() - t;

    // Step 4: Stage3 清理（可选）
    t = Date.now();
    if (!opts.noClean) {
      const { result } = cleanStatementData(statementData);
      statementData = result;
    }
    timings.clean = Date.now() - t;

    timings.total = Date.now() - overallStart;

    return {
      data: statementData,
      broker: plugin.name,
      raw: false,
      metadata: { timings, parserVersion: '0.1.0' },
    };
  }
}
