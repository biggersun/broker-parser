/**
 * Stage 2 统一接口定义
 *
 * Stage 2 负责将 RawTableData 转换为 StatementData。
 * 可以使用 LLM 方案或规则引擎方案。
 */

import { StatementData } from './statement';
import { RawTableData } from './raw';

// ============================================================================
// Stage 2 格式化器接口
// ============================================================================

/**
 * Stage 2 格式化器配置基类
 */
export interface Stage2FormatterConfig {
  /** 格式化器类型 */
  type: 'llm' | 'rule';
}

/**
 * LLM 格式化器配置
 */
export interface LlmFormatterConfig extends Stage2FormatterConfig {
  type: 'llm';
  /** DeepSeek Prompt */
  deepseekPrompt: string;
  /** 模型名称 */
  model?: string;
}

/**
 * 规则格式化器配置
 */
export interface RuleFormatterConfig extends Stage2FormatterConfig {
  type: 'rule';
  /** 是否启用跨行合并 */
  enableMerge?: boolean;
}

/**
 * Stage 2 格式化器接口
 *
 * 所有 Stage 2 实现都需要实现这个接口
 */
export interface IStage2Formatter {
  /**
   * 将原始表格数据格式化为结构化数据
   * @param rawData Stage 1 输出的原始数据
   * @returns 结构化的 StatementData
   */
  format(rawData: RawTableData): Promise<StatementData>;
}
