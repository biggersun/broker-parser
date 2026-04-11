/**
 * Stage 1 统一输出接口定义
 *
 * 无论使用 OCR 方案还是 pdfplumber 规则方案，
 * Stage 1 的输出都应该符合这个接口。
 *
 * Stage 2 的输入也基于这个接口。
 */

// ============================================================================
// 原始表格行数据
// ============================================================================

/**
 * 原始交易行数据
 * 保持表格原始值，不做业务逻辑处理
 */
export interface RawTransactionRow {
  /** 交易日期 (原始格式，如 DD/MM/YY 或 YYYY-MM-DD) */
  tradeDate: string;
  /** 交收日期 (原始格式) */
  settleDate?: string;
  /** 产品代码 (如 UT、ST 等) */
  product?: string;
  /** 参考号 */
  refNo: string;
  /** 交易类型 (原始值，如 Payment、Receipt 等) */
  transType?: string;
  /** 摘要/备注 (原始文本) */
  particulars: string;
  /** 借方金额 (原始值) */
  debit?: number;
  /** 贷方金额 (原始值) */
  credit?: number;
  /** 来源行号 (用于调试，可选) */
  sourceLines?: number[];
}

/**
 * 原始持仓行数据
 */
export interface RawHoldingRow {
  /** 股票/基金代码 */
  symbol: string;
  /** 名称 */
  name?: string;
  /** 资产类型 (原始值，如 Stock、Fund、Cash 等) */
  assetType?: string;
  /** 数量 */
  quantity?: number;
  /** 市场价格 */
  marketPrice?: number;
  /** 市值 */
  marketValue?: number;
  /** 货币 */
  currency?: string;
  /** 其他原始字段 */
  extras?: Record<string, unknown>;
}

/**
 * 原始账户信息
 */
export interface RawAccountInfo {
  /** 客户编号 */
  accountCode?: string;
  /** 客户名称 */
  clientName?: string;
  /** 账单日期 (原始格式) */
  statementDate?: string;
  /** 其他头部信息 */
  extras?: Record<string, unknown>;
}

// ============================================================================
// Stage 1 统一输出格式
// ============================================================================

/**
 * Stage 1 输出的原始表格数据
 *
 * 这是 OCR 和规则引擎共用的输出格式。
 * Stage 2 的输入也基于这个格式。
 */
export interface RawTableData {
  /** 账户信息 */
  accountInfo: RawAccountInfo;

  /** 原始交易记录 */
  transactions: RawTransactionRow[];

  /** 原始持仓数据 */
  holdings: RawHoldingRow[];

  /** 解析元数据 */
  metadata?: {
    /** 总页数 */
    totalPages?: number;
    /** 解析耗时 (ms) */
    parseTimeMs?: number;
    /** 解析方案 */
    extractor: 'ocr' | 'pdfplumber';
    /** 警告信息 */
    warnings?: string[];
  };
}

// ============================================================================
// Stage 1 提取器接口
// ============================================================================

/**
 * Stage 1 提取器配置基类
 */
export interface Stage1ExtractorConfig {
  /** 提取器类型 */
  type: 'ocr' | 'pdfplumber';
}

/**
 * OCR 提取器配置
 */
export interface OcrExtractorConfig extends Stage1ExtractorConfig {
  type: 'ocr';
  /** 图片 DPI */
  density: number;
  /** 图片格式 */
  format: 'jpeg' | 'png';
  /** JPEG 质量 */
  quality: number;
  /** Vision Prompt */
  visionPrompt: string;
  /** Vision 模型 */
  visionModel?: string;
}

/**
 * pdfplumber 提取器配置
 */
export interface PdfplumberExtractorConfig extends Stage1ExtractorConfig {
  type: 'pdfplumber';
  /** 列间隔阈值 (字符间隔超过此值视为不同列) */
  gapThreshold?: number;
}

/**
 * Stage 1 提取器接口
 *
 * 所有 Stage 1 实现都需要实现这个接口
 */
export interface IStage1Extractor {
  /**
   * 从 PDF 提取原始表格数据
   * @param pdfPath PDF 文件路径
   * @returns 原始表格数据
   */
  extract(pdfPath: string): Promise<RawTableData>;
}
