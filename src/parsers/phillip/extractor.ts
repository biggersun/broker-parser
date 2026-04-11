/**
 * Phillip pdfplumber Stage 1 提取器
 *
 * 纯 PDF 表格提取，不做业务逻辑处理。
 * 输出统一的 RawTableData 格式，供 Stage 2 处理。
 *
 * 职责：
 * 1. 调用 pdfplumber 提取字符坐标
 * 2. 按行/列分组
 * 3. 提取原始字段值
 * 4. 不做分类、不做字段合并
 */

import { spawn } from 'child_process';
import * as path from 'path';

import {
  RawTableData,
  RawTransactionRow,
  RawHoldingRow,
  RawAccountInfo,
  IStage1Extractor,
  PdfplumberExtractorConfig,
} from '../../types/raw';

// ============================================================================
// 类型定义
// ============================================================================

/** 字符信息（从 pdfplumber 提取） */
interface CharInfo {
  text: string;
  x0: number;
  x1: number;
  top: number;
  bottom: number;
}

/** pdfplumber 原始输出 */
interface PdfplumberOutput {
  totalPages: number;
  pages: Array<{
    pageNum: number;
    chars: CharInfo[];
    text: string;
  }>;
}

// ============================================================================
// 常量定义
// ============================================================================

/** 默认配置 */
const DEFAULT_CONFIG: Omit<PdfplumberExtractorConfig, 'type'> = {
  gapThreshold: 5,
};

/** 区域标记关键词 */
const SECTION_MARKERS = {
  // 交易记录区域 (包含双渲染版本)
  transactionStart: [
    '交易記錄',
    'Transaction Details',
    '交交易易記記錄錄',
    'TTrraannssaaccttiioonn',
  ],
  transactionEnd: ['轉下結餘', '承下結餘', 'Balance C/F', '戶口資料', 'Account Details'],
  // Account Details 区域 (现金余额) - 包含双渲染版本
  accountDetailsStart: [
    '戶口資料',
    'Account Details',
    '戶戶口口資資料料',
    'AAccccoouunntt DDeettaaiillss',
  ],
  accountDetailsEnd: [
    '股票投資組合',
    'Securities Portfolio',
    '股股票票投投資資組組合合',
    'SSeeccuurriittiieess PPoorrttffoolliioo',
    '詳情請參閱',
    'Please see important',
  ],
  // Securities Portfolio 区域 (股票/基金持仓) - 包含双渲染版本
  holdingsStart: [
    '股票投資組合',
    'Securities Portfolio',
    '股股票票投投資資組組合合',
    'SSeeccuurriittiieess PPoorrttffoolliioo',
    '持倉',
  ],
  holdingsEnd: ['E. & O. E.', 'Please see important', '詳情請參閱'],
  // 股息及公告区域 - 出现时应终止持仓区域解析（包含双渲染版本）
  dividendStart: [
    '股息及公告',
    'Dividend',
    'Announcements',
    '股股息息及及公公告告',
    'DDiivviiddeenndd',
  ],
};

/** 交易类型关键词 (用于识别，不做分类) */
const TRANS_TYPE_KEYWORDS: Record<string, string[]> = {
  Payment: ['Payment', '支付'],
  Receipt: ['Receipt', '收入'],
  Withdraw: ['Withdraw', '提貨'],
  Deposit: ['Deposit', '存入'],
  Buy: ['Buy', '買入', 'Bought'],
  Sell: ['Sell', '賣出', 'Sold'],
};

// ============================================================================
// 提取器实现
// ============================================================================

/**
 * Phillip pdfplumber Stage 1 提取器
 */
export class PhillipPdfplumberExtractor implements IStage1Extractor {
  private config: PdfplumberExtractorConfig;

  constructor(config?: Partial<Omit<PdfplumberExtractorConfig, 'type'>>) {
    this.config = {
      type: 'pdfplumber',
      ...DEFAULT_CONFIG,
      ...config,
    };
  }

  /**
   * 从 PDF 提取原始表格数据
   */
  async extract(pdfPath: string): Promise<RawTableData> {
    const startTime = Date.now();
    const warnings: string[] = [];

    // 1. 调用 pdfplumber 提取字符数据
    const pdfData = await this.callPdfplumber(pdfPath);

    // 2. 提取账户信息
    const accountInfo = this.extractAccountInfo(pdfData);

    // 3. 提取交易记录
    const transactions = this.extractTransactions(pdfData, warnings);

    // 4. 提取持仓数据 (Account Details + Securities Portfolio)
    const holdings = this.extractHoldings(pdfData, warnings);

    return {
      accountInfo,
      transactions,
      holdings,
      metadata: {
        totalPages: pdfData.totalPages,
        parseTimeMs: Date.now() - startTime,
        extractor: 'pdfplumber',
        warnings,
      },
    };
  }

  /**
   * 调用 pdfplumber Python 脚本
   */
  private async callPdfplumber(pdfPath: string): Promise<PdfplumberOutput> {
    return new Promise((resolve, reject) => {
      // extract.py 发布时会和本文件在同一个 dist/parsers/phillip/ 目录
      // 开发时在 src/parsers/phillip/extract.py
      const pythonScript = path.join(__dirname, 'extract.py');
      const pythonBin = 'python3'; // 直接用 PATH 中的 python3

      const proc = spawn(pythonBin, [pythonScript, pdfPath, '--json'], {
        env: {
          ...process.env,
        },
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Python script failed: ${stderr}`));
          return;
        }

        try {
          const result = JSON.parse(stdout) as PdfplumberOutput;
          resolve(result);
        } catch (e) {
          reject(new Error(`Failed to parse Python output: ${String(e)}`));
        }
      });
    });
  }

  /**
   * 提取账户信息
   *
   * 辉立日结单格式示例:
   * 客戶名稱 Name : SUN XIAOXU 客戶編號 A/C No : M596241
   * 日期 Issue Date : 05/11/25
   */
  private extractAccountInfo(pdfData: PdfplumberOutput): RawAccountInfo {
    // 从第一页提取头部信息
    if (pdfData.pages.length === 0) {
      return {};
    }

    const firstPageText = pdfData.pages[0].text;

    // 提取账户编号 (格式: A/C No : M596241)
    const accountMatch = firstPageText.match(/A\/C\s*No\s*[:：]\s*([A-Z]\d+)/i);
    const accountCode = accountMatch ? accountMatch[1] : undefined;

    // 提取客户名称 (格式: Name : SUN XIAOXU 客戶編號)
    // 名称在 "Name :" 和 "客戶編號" 之间
    const nameMatch = firstPageText.match(/Name\s*[:：]\s*([A-Z\s]+?)\s*客戶編號/i);
    const clientName = nameMatch ? nameMatch[1].trim() : undefined;

    // 提取账单日期 (格式: Issue Date : 05/11/25)
    const dateMatch = firstPageText.match(/Issue\s*Date\s*[:：]\s*(\d{2}\/\d{2}\/\d{2,4})/i);
    const statementDate = dateMatch ? dateMatch[1] : undefined;

    return {
      accountCode,
      clientName,
      statementDate,
    };
  }

  /**
   * 提取交易记录
   *
   * 跨页状态传递：inTransactionSection 和 lastTransaction 在页面间保持，
   * 确保多页结单中 Page 2+ 即使没有区域标记也能继续提取交易。
   */
  private extractTransactions(pdfData: PdfplumberOutput, warnings: string[]): RawTransactionRow[] {
    const allTransactions: RawTransactionRow[] = [];

    // 跨页状态维护
    let inTransactionSection = false;
    let lastTransaction: RawTransactionRow | null = null;

    for (const page of pdfData.pages) {
      const result = this.extractPageTransactionsWithState(
        page.chars,
        warnings,
        inTransactionSection,
        lastTransaction
      );
      allTransactions.push(...result.transactions);
      inTransactionSection = result.inTransactionSection;
      lastTransaction = result.lastTransaction;
    }

    // 跨页续行合并
    return this.mergeCrossPageContinuations(allTransactions);
  }

  /**
   * 合并跨页续行
   * 识别规则：tradeDate 为空字符串 = 续行
   */
  private mergeCrossPageContinuations(transactions: RawTransactionRow[]): RawTransactionRow[] {
    const result: RawTransactionRow[] = [];
    for (const tx of transactions) {
      if (!tx.tradeDate && result.length > 0) {
        // 续行，合并到前一条记录
        const lastTx = result[result.length - 1];
        lastTx.particulars += ' ' + tx.particulars;
        if (lastTx.sourceLines && tx.sourceLines) {
          lastTx.sourceLines.push(...tx.sourceLines);
        }
      } else {
        result.push(tx);
      }
    }
    return result;
  }

  /**
   * 从单页提取交易记录（支持跨页状态）
   *
   * 与原 extractPageTransactions 的区别：
   * - 接收上一页的状态（是否在交易区域、最后一条交易）
   * - 返回当前页处理后的状态，供下一页继续使用
   * - 确保多页结单中 Page 2+ 没有区域标记时也能正确提取交易
   *
   * @param chars - 页面字符数据
   * @param _warnings - 警告信息数组
   * @param initialInSection - 初始是否在交易区域
   * @param initialLastTx - 初始最后一条交易（用于续行合并）
   * @returns 交易数据和更新后的状态
   */
  private extractPageTransactionsWithState(
    chars: CharInfo[],
    _warnings: string[],
    initialInSection: boolean,
    initialLastTx: RawTransactionRow | null
  ): {
    transactions: RawTransactionRow[];
    inTransactionSection: boolean;
    lastTransaction: RawTransactionRow | null;
  } {
    const transactions: RawTransactionRow[] = [];

    // 按 Y 坐标分组
    const lineGroups = this.groupCharsByY(chars);

    // 使用跨页传入的状态
    let inTransactionSection = initialInSection;
    const sortedYs = Object.keys(lineGroups)
      .map(Number)
      .sort((a, b) => a - b);

    // 临时存储续行数据（使用跨页传入的最后一条交易）
    let lastTransaction: RawTransactionRow | null = initialLastTx;

    for (let i = 0; i < sortedYs.length; i++) {
      const y = sortedYs[i];
      const lineChars = lineGroups[y];
      const lineText = this.getLineText(lineChars);

      // 检测区域边界
      if (this.matchesAny(lineText, SECTION_MARKERS.transactionStart)) {
        inTransactionSection = true;
        continue;
      }
      if (this.matchesAny(lineText, SECTION_MARKERS.transactionEnd)) {
        inTransactionSection = false;
        continue;
      }

      if (!inTransactionSection) continue;

      // 跳过表头和分隔行
      if (this.isHeaderOrSeparator(lineText)) continue;

      // 检查是否是续行 (没有日期格式的行可能是上一条记录的续行)
      const dateMatch = lineText.match(/(\d{2}\/\d{2}\/\d{2})/);
      if (!dateMatch) {
        if (lastTransaction) {
          // 页内续行：合并到当前页前一条记录
          const continuationText = this.extractContinuationText(lineChars);
          if (continuationText) {
            lastTransaction.particulars += ' ' + continuationText;
            if (lastTransaction.sourceLines) {
              lastTransaction.sourceLines.push(y);
            }
          }
        } else {
          // 跨页续行：创建占位记录，等待后续合并
          const continuationText = this.extractContinuationText(lineChars);
          if (continuationText) {
            transactions.push({
              tradeDate: '', // 空日期标记续行
              refNo: '',
              particulars: continuationText,
              sourceLines: [y],
            });
          }
        }
        continue;
      }

      // 尝试解析交易行
      const transaction = this.parseTransactionLine(lineChars, y);
      if (transaction) {
        transactions.push(transaction);
        lastTransaction = transaction;
      }
    }

    return { transactions, inTransactionSection, lastTransaction };
  }

  /**
   * 解析单行交易记录
   * 只提取原始字段值，不做业务分类
   */
  private parseTransactionLine(chars: CharInfo[], yPosition: number): RawTransactionRow | null {
    // 智能提取字段
    const fields = this.extractFieldsWithSmartBoundaries(chars);

    // 验证必要字段
    if (!fields.tradeDate || !fields.refNo) {
      return null;
    }

    return {
      tradeDate: fields.tradeDate,
      settleDate: fields.settleDate,
      product: fields.product,
      refNo: fields.refNo,
      transType: fields.transType,
      particulars: fields.particulars,
      debit: fields.debit,
      credit: fields.credit,
      sourceLines: [yPosition],
    };
  }

  /**
   * 智能提取字段 - 基于列位置
   *
   * 辉立日结单列边界参考:
   * - tradeDate:   x = 30-65
   * - settleDate:  x = 65-110
   * - product:     x = 100-145 (可选，如 UT)
   * - refNo:       x = 130-180
   * - type:        x = 170-230
   * - particulars: x = 195-490
   * - debit:       x = 480-530
   * - credit:      x = 530-580
   */
  private extractFieldsWithSmartBoundaries(chars: CharInfo[]): {
    tradeDate: string;
    settleDate?: string;
    product?: string;
    refNo: string;
    transType?: string;
    particulars: string;
    debit?: number;
    credit?: number;
  } {
    // 按 X 坐标排序
    const sortedChars = [...chars].sort((a, b) => a.x0 - b.x0);

    // 按间隔分组
    const groups = this.groupCharsByGap(sortedChars);

    // 识别各字段
    let tradeDate = '';
    let settleDate = '';
    let product = '';
    let refNo = '';
    let transType = '';
    const particularsArr: string[] = [];
    let debitStr = '';
    let creditStr = '';

    for (const group of groups) {
      const text = group.text.trim(); // 去除前后空格
      const x0 = group.x0;
      const x1 = group.x1;
      const midX = (x0 + x1) / 2;

      // 1. 日期识别 (格式 DD/MM/YY)
      if (/^\d{2}\/\d{2}\/\d{2}$/.test(text)) {
        if (x0 < 65 && !tradeDate) {
          tradeDate = text;
        } else if (x0 >= 65 && x0 < 110 && !settleDate) {
          settleDate = text;
        } else if (!tradeDate) {
          tradeDate = text;
        } else if (!settleDate) {
          settleDate = text;
        }
        continue;
      }

      // 2. 产品代码 (2-6字母，在 x < 145 区域，如 UT, Equity)
      if (/^[A-Z]{2,6}$/i.test(text) && x0 >= 100 && x0 < 145) {
        product = text;
        continue;
      }

      // 3. 参考号 (8位数字，在 x = 130-180 区域)
      if (/^\d{8}$/.test(text) && x0 >= 130 && x0 < 180) {
        refNo = text;
        continue;
      }

      // 4. 交易类型 (在 x = 170-230 区域)
      if (x0 >= 170 && x0 < 230) {
        const typeMatch = Object.entries(TRANS_TYPE_KEYWORDS).find(([, keywords]) =>
          keywords.some((kw) => text === kw || text.startsWith(kw))
        );
        if (typeMatch) {
          transType = typeMatch[0];
          // 检查是否有摘要粘连
          for (const kw of typeMatch[1]) {
            if (text.startsWith(kw) && text.length > kw.length) {
              particularsArr.push(text.substring(kw.length));
              break;
            }
          }
          continue;
        }
      }

      // 5. 金额 (在右侧 x >= 478，考虑浮点数误差)
      if (x0 >= 478) {
        const cleanNum = text.replace(/,/g, '');
        if (/^[\d.]+$/.test(cleanNum)) {
          if (midX < 530) {
            debitStr = text;
          } else {
            creditStr = text;
          }
          continue;
        }
      }

      // 6. 摘要 (中间区域 x = 195-490)
      if (x0 >= 195 && x1 < 490) {
        particularsArr.push(text);
      }
    }

    // 合并摘要数组
    const particulars = particularsArr.join(' ').trim();

    return {
      tradeDate,
      settleDate: settleDate || undefined,
      product: product || undefined,
      refNo,
      transType: transType || undefined,
      particulars,
      debit: this.parseAmount(debitStr),
      credit: this.parseAmount(creditStr),
    };
  }

  /**
   * 提取续行中的摘要内容
   */
  private extractContinuationText(chars: CharInfo[]): string {
    const sortedChars = [...chars].sort((a, b) => a.x0 - b.x0);
    const groups = this.groupCharsByGap(sortedChars);

    const texts: string[] = [];
    for (const group of groups) {
      // 续行摘要通常在 x > 100 的区域
      if (group.x0 >= 100 && group.x1 < 490) {
        texts.push(group.text);
      }
    }

    return texts.join(' ').trim();
  }

  // ============================================================================
  // 工具方法
  // ============================================================================

  /**
   * 按 Y 坐标分组字符
   */
  private groupCharsByY(chars: CharInfo[]): Record<number, CharInfo[]> {
    const groups: Record<number, CharInfo[]> = {};
    for (const c of chars) {
      const y = Math.round(c.top);
      if (!groups[y]) groups[y] = [];
      groups[y].push(c);
    }
    return groups;
  }

  /**
   * 按间隔分组字符
   */
  private groupCharsByGap(chars: CharInfo[]): Array<{ text: string; x0: number; x1: number }> {
    if (chars.length === 0) return [];

    const gapThreshold = this.config.gapThreshold ?? 5;
    const groups: Array<{ text: string; x0: number; x1: number }> = [];
    let currentGroup: CharInfo[] = [chars[0]];

    for (let i = 1; i < chars.length; i++) {
      const gap = chars[i].x0 - chars[i - 1].x1;
      if (gap > gapThreshold) {
        groups.push({
          text: currentGroup.map((c) => c.text).join(''),
          x0: currentGroup[0].x0,
          x1: currentGroup[currentGroup.length - 1].x1,
        });
        currentGroup = [chars[i]];
      } else {
        currentGroup.push(chars[i]);
      }
    }

    if (currentGroup.length > 0) {
      groups.push({
        text: currentGroup.map((c) => c.text).join(''),
        x0: currentGroup[0].x0,
        x1: currentGroup[currentGroup.length - 1].x1,
      });
    }

    return groups;
  }

  /**
   * 获取一行的文本
   */
  private getLineText(chars: CharInfo[]): string {
    return chars
      .sort((a, b) => a.x0 - b.x0)
      .map((c) => c.text)
      .join('');
  }

  /**
   * 检查是否匹配任意关键词
   */
  private matchesAny(text: string, keywords: string[]): boolean {
    return keywords.some((kw) => text.includes(kw));
  }

  /**
   * 检查是否是表头或分隔行
   */
  private isHeaderOrSeparator(text: string): boolean {
    const headerKeywords = ['Date', 'RefNo', '日期', '參考', 'Product', '產品'];
    const separators = ['|', '─', '═'];

    if (headerKeywords.some((kw) => text.includes(kw))) return true;
    if (text.trim().length < 3) return true;
    if (
      separators.some(
        (s) => text.includes(s) && text.replace(new RegExp(`[${s}\\s]`, 'g'), '').length < 5
      )
    ) {
      return true;
    }
    if (text.includes('Normal 普通戶口') || text.includes('Currency :')) return true;
    if (text.includes('承上結餘') || text.includes('Balance B/F')) return true;

    // PDF 页眉/页脚检测（跨页状态传递时需要过滤这些行）
    if (this.isPageHeaderOrFooter(text)) return true;

    return false;
  }

  /**
   * 检查是否是 PDF 页眉或页脚行
   *
   * 多页结单中每页都会重复出现的页面级标题和页脚，
   * 与交易表格的表头行不同。跨页提取交易时需要跳过这些行。
   *
   * 注意：getLineText 将字符直接拼接，可能没有空格（如 "A/CNo:" 而非 "A/C No :"），
   * 因此匹配模式需要兼容无空格情况。
   */
  private isPageHeaderOrFooter(text: string): boolean {
    const pageHeaderFooterPatterns = [
      // 页脚：网站链接
      'poems.com.hk',
      'Website',
      '網址',
      // 页头：双渲染标题（每个字符重复一次）
      '綜綜合合',
      'CCoommbbiinneedd',
      'DDaaiillyy',
      '存存款款',
      'EEaassyyppaayy',
      // 页头：账户信息行（兼容有无空格）
      'A/CNo',
      'A/C No',
      '客戶編號',
      'A/ECode',
      'A/E Code',
      '經紀',
      '帳戶類別',
      // 页头：页码（兼容有无空格）
      'Page:',
      'Page :',
    ];
    return pageHeaderFooterPatterns.some((p) => text.includes(p));
  }

  /**
   * 解析金额
   */
  private parseAmount(str: string): number | undefined {
    if (!str) return undefined;
    const clean = str.replace(/,/g, '').trim();
    const num = parseFloat(clean);
    return isNaN(num) ? undefined : num;
  }

  // ============================================================================
  // Holdings 提取方法
  // ============================================================================

  /**
   * 提取持仓数据
   *
   * 包含两部分：
   * 1. Account Details - 现金余额
   * 2. Securities Portfolio - 股票/基金持仓
   *
   * 注意：Securities Portfolio 支持跨页提取，状态在页面之间传递
   *
   * @param pdfData - pdfplumber 输出数据
   * @param warnings - 警告信息数组
   * @returns 持仓数据数组
   */
  private extractHoldings(pdfData: PdfplumberOutput, warnings: string[]): RawHoldingRow[] {
    const allHoldings: RawHoldingRow[] = [];

    // 跨页状态维护
    let inPortfolioSection = false;
    let currentCurrency = 'HKD';
    let lastHolding: RawHoldingRow | null = null;

    for (const page of pdfData.pages) {
      // 提取 Account Details（现金余额）- 每页独立处理
      const cashHoldings = this.extractAccountDetailsHoldings(page.chars, warnings);
      allHoldings.push(...cashHoldings);

      // 提取 Securities Portfolio（股票/基金持仓）- 跨页状态传递
      const {
        holdings: portfolioHoldings,
        inPortfolioSection: newState,
        currentCurrency: newCurrency,
        lastHolding: newLastHolding,
      } = this.extractPortfolioHoldingsWithState(
        page.chars,
        warnings,
        inPortfolioSection,
        currentCurrency,
        lastHolding
      );

      allHoldings.push(...portfolioHoldings);
      inPortfolioSection = newState;
      currentCurrency = newCurrency;
      lastHolding = newLastHolding;
    }

    return allHoldings;
  }

  /**
   * 从 Account Details 区域提取现金余额
   *
   * 辉立日结单 Account Details 格式示例：
   * | Currency | Balance C/F | Unsettled T+1 | ... | Available Balance |
   * | HKD      | 63,832.41   | 0.00          | ... | 63,832.41         |
   * | USD      | -0.30       | 0.00          | ... | -0.30             |
   * | HKD(Base)| 63,830.07   | ...           | ... | 63,830.07         |  <- 跳过
   *
   * @param chars - 页面字符数据
   * @param warnings - 警告信息数组
   * @returns 现金余额数组
   */
  private extractAccountDetailsHoldings(chars: CharInfo[], _warnings: string[]): RawHoldingRow[] {
    const holdings: RawHoldingRow[] = [];
    const lineGroups = this.groupCharsByY(chars);
    const sortedYs = Object.keys(lineGroups)
      .map(Number)
      .sort((a, b) => a - b);

    let inAccountDetailsSection = false;

    for (const y of sortedYs) {
      const lineChars = lineGroups[y];
      const lineText = this.getLineText(lineChars);

      // 检测区域起始边界
      if (this.matchesAny(lineText, SECTION_MARKERS.accountDetailsStart)) {
        inAccountDetailsSection = true;
        continue;
      }

      // 检测区域结束边界
      if (this.matchesAny(lineText, SECTION_MARKERS.accountDetailsEnd)) {
        inAccountDetailsSection = false;
        continue;
      }

      if (!inAccountDetailsSection) continue;

      // 跳过表头行
      if (this.isAccountDetailsHeader(lineText)) continue;

      // 跳过 HKD(Base) 汇总行
      if (lineText.includes('HKD(Base)') || lineText.includes('Base')) continue;

      // 解析现金余额行
      const cashHolding = this.parseCashBalanceLine(lineChars);
      if (cashHolding) {
        holdings.push(cashHolding);
      }
    }

    return holdings;
  }

  /**
   * 检查是否是 Account Details 表头行
   */
  private isAccountDetailsHeader(text: string): boolean {
    const headerKeywords = [
      'Currency',
      '貨幣',
      'Balance C/F',
      '轉下結餘',
      'Unsettled Balance',
      '未交收結餘',
      'Normal 普通戶口',
      'Accrued Interest',
      '累計利息',
      'Available Balance',
      '可用結餘',
    ];
    return headerKeywords.some((kw) => text.includes(kw));
  }

  /**
   * 解析现金余额行
   *
   * 行格式: Currency Balance_C/F Unsettled_T+1 ... Available_Balance Ref_ExRate DR_Int_Rate
   * 示例:   HKD      63,832.41    0.00          ... 63,832.41         1.0000      列表1(Sch1)
   *
   * @param chars - 行字符数据
   * @returns 现金余额持仓或 null
   */
  private parseCashBalanceLine(chars: CharInfo[]): RawHoldingRow | null {
    const sortedChars = [...chars].sort((a, b) => a.x0 - b.x0);
    const groups = this.groupCharsByGap(sortedChars);

    if (groups.length < 2) return null;

    // 第一个组应该是货币代码
    const currencyGroup = groups[0];
    const currency = currencyGroup.text.trim();

    // 验证是否是有效货币代码 (3 字母)
    if (!/^[A-Z]{3}$/.test(currency)) return null;

    // 第二个组应该是 Balance C/F (转下结余)
    // 根据辉立日结单布局，Balance C/F 通常在 x = 120-180 区域
    const balanceGroup = groups.find((g) => g.x0 >= 100 && g.x0 < 200);
    if (!balanceGroup) return null;

    const balance = this.parseAmount(balanceGroup.text);
    if (balance === undefined) return null;

    // 跳过余额为 0 的记录
    if (balance === 0) return null;

    return {
      symbol: currency,
      name: 'Cash Balance',
      assetType: 'Cash',
      quantity: balance,
      marketPrice: 1,
      marketValue: balance,
      currency: currency,
    };
  }

  /**
   * 从 Securities Portfolio 区域提取股票/基金持仓（支持跨页状态）
   *
   * - 接收上一页的状态（是否在 Portfolio 区域、当前货币、最后一条持仓）
   * - 返回当前页处理后的状态，供下一页继续使用
   * - 不再依赖结束标记（如 E. & O. E.）来判断区域结束
   *
   * @param chars - 页面字符数据
   * @param warnings - 警告信息数组
   * @param initialInSection - 初始是否在 Portfolio 区域
   * @param initialCurrency - 初始货币
   * @param initialLastHolding - 初始最后一条持仓（用于续行合并）
   * @returns 持仓数据和更新后的状态
   */
  private extractPortfolioHoldingsWithState(
    chars: CharInfo[],
    _warnings: string[],
    initialInSection: boolean,
    initialCurrency: string,
    initialLastHolding: RawHoldingRow | null
  ): {
    holdings: RawHoldingRow[];
    inPortfolioSection: boolean;
    currentCurrency: string;
    lastHolding: RawHoldingRow | null;
  } {
    const holdings: RawHoldingRow[] = [];
    const lineGroups = this.groupCharsByY(chars);
    const sortedYs = Object.keys(lineGroups)
      .map(Number)
      .sort((a, b) => a - b);

    let inPortfolioSection = initialInSection;
    let currentCurrency = initialCurrency;
    let lastHolding = initialLastHolding;

    for (let i = 0; i < sortedYs.length; i++) {
      const y = sortedYs[i];
      const lineChars = lineGroups[y];
      const lineText = this.getLineText(lineChars);

      // 检测区域起始边界（优先级高于结束边界）
      if (this.matchesAny(lineText, SECTION_MARKERS.holdingsStart)) {
        inPortfolioSection = true;
        continue;
      }

      // 检测交易记录区域开始 - 这才是真正的持仓区域结束
      if (this.matchesAny(lineText, SECTION_MARKERS.transactionStart)) {
        inPortfolioSection = false;
        continue;
      }

      // 检测股息及公告区域开始 - 终止持仓区域解析
      // 股息公告行格式与持仓行类似（Equity XHKG 003750 ...），
      // 如不终止会导致股息记录被误解析为持仓数据
      if (this.matchesAny(lineText, SECTION_MARKERS.dividendStart)) {
        inPortfolioSection = false;
        continue;
      }

      // 注意：不再使用 holdingsEnd 标记来判断区域结束
      // 因为 E. & O. E. 等页脚标记会在每页底部出现，导致跨页持仓丢失
      // 只有遇到交易记录区域或股息公告区域才真正结束持仓区域

      if (!inPortfolioSection) continue;

      // 检测货币切换头部 (Currency : HKD 或 Currency : USD)
      const currencyMatch = lineText.match(/Currency\s*:\s*([A-Z]{3})/i);
      if (currencyMatch) {
        currentCurrency = currencyMatch[1].toUpperCase();
        continue;
      }

      // 跳过表头、Sub-Total、Total 等行
      if (this.isPortfolioHeaderOrFooter(lineText)) continue;

      // 跳过页脚标记（但不终止区域）
      if (this.matchesAny(lineText, SECTION_MARKERS.holdingsEnd)) continue;

      // 检测续行（中文名称行，如 "股票 美图集团"）
      if (this.isPortfolioContinuationLine(lineText, lineChars)) {
        if (lastHolding) {
          const chineseName = this.extractChineseNameFromLine(lineChars);
          if (chineseName) {
            lastHolding.name = lastHolding.name
              ? `${lastHolding.name} ${chineseName}`
              : chineseName;
          }
        }
        continue;
      }

      // 解析持仓数据行
      const holding = this.parsePortfolioLine(lineChars, currentCurrency);
      if (holding) {
        holdings.push(holding);
        lastHolding = holding;
      }
    }

    return { holdings, inPortfolioSection, currentCurrency, lastHolding };
  }

  /**
   * 检查是否是 Portfolio 表头或汇总行
   */
  private isPortfolioHeaderOrFooter(text: string): boolean {
    const keywords = [
      'Product',
      'Market',
      'InstrumentCd',
      'DisplayName',
      '產品',
      '市場',
      '產品代號',
      '代號名稱',
      'Sub-Total',
      'Total :',
      'Total:',
      'Exchange Rate',
      '匯率',
      'Qty B/F',
      'Qty C/F',
      'ClsPrice',
      'Market Value',
      'MgnRatio',
      'Margin Value',
    ];
    return keywords.some((kw) => text.includes(kw));
  }

  /**
   * 检查是否是续行（中文名称行）
   *
   * 续行特征：
   * 1. 以 "股票" 或 "基金" 开头
   * 2. 右侧没有数值金额
   */
  private isPortfolioContinuationLine(text: string, chars: CharInfo[]): boolean {
    // 续行以 "股票" 或 "基金" 开头
    if (text.startsWith('股票') || text.startsWith('基金')) {
      // 检查行中是否有数值（在右侧 x > 340 区域）
      const rightChars = chars.filter((c) => c.x0 > 340);
      if (rightChars.length === 0) {
        return true;
      }
      // 如果右侧只有非数字字符，也是续行
      const rightText = rightChars.map((c) => c.text).join('');
      if (!/[\d.]/.test(rightText)) {
        return true;
      }
    }
    return false;
  }

  /**
   * 从续行中提取中文名称
   */
  private extractChineseNameFromLine(chars: CharInfo[]): string {
    const sortedChars = [...chars].sort((a, b) => a.x0 - b.x0);
    const groups = this.groupCharsByGap(sortedChars);

    // 跳过第一个组（"股票" 或 "基金"），返回后面的内容
    const nameGroups = groups.filter((g) => g.x0 >= 160 && g.x0 < 300);
    return nameGroups
      .map((g) => g.text)
      .join(' ')
      .trim();
  }

  /**
   * 解析单行持仓数据
   *
   * 列边界（基于 pdfplumber 坐标分析）：
   * - Product (Equity/UT): x0 < 60
   * - Market (XHKG/OTCU/XNGS): x0 = 80-115
   * - InstrumentCd: x0 = 115-165
   * - DisplayName: x0 = 160-270
   * - Qty B/F: x0 = 260-295
   * - LastBoughtOn (可选日期): x0 = 295-340
   * - Qty C/F: x0 = 340-385
   * - ClsPrice: x0 = 385-435
   * - Market Value: x0 = 435-485
   * - MgnRatio: x0 = 490-520
   * - Margin Value: x0 = 530-570
   *
   * @param chars - 行字符数据
   * @param currency - 当前货币
   * @returns 持仓数据或 null
   */
  private parsePortfolioLine(chars: CharInfo[], currency: string): RawHoldingRow | null {
    const sortedChars = [...chars].sort((a, b) => a.x0 - b.x0);
    const groups = this.groupCharsByGap(sortedChars);

    if (groups.length < 5) return null;

    // 提取字段
    let product = ''; // Equity/UT
    let market = ''; // XHKG/OTCU/XNGS
    let instrumentCd = ''; // 000100/UT.480010/PDD
    let displayName = ''; // MINIMAX GROUP INC.
    let qtyCF: number | undefined;
    let clsPrice: number | undefined;
    let marketValue: number | undefined;

    for (const group of groups) {
      const text = group.text.trim(); // 去除前后空格
      const x0 = group.x0;

      // Product 列 (x0 < 60)
      if (x0 < 60 && (text === 'Equity' || text === 'UT')) {
        product = text;
        continue;
      }

      // Market 列 (x0 = 80-115)
      if (x0 >= 80 && x0 < 120 && /^[A-Z]{4}$/.test(text)) {
        market = text;
        continue;
      }

      // 名称列和代码列在 160-175 区间存在重叠。
      // 若前面已经识别到 InstrumentCd，则此处优先把后续文本视为名称，
      // 避免 CATL 这类全大写简称再次被误判成代码。
      if (instrumentCd && x0 >= 160 && x0 < 275 && !/^\d/.test(text)) {
        displayName = text;
        continue;
      }

      // InstrumentCd 列 (x0 = 115-170)
      if (x0 >= 115 && x0 < 175) {
        // 股票代码: 000100, 基金代码: UT.480010, 美股代码: PDD
        if (/^\d{6}$/.test(text) || /^UT\.\d+$/.test(text) || /^[A-Z]{2,5}$/.test(text)) {
          instrumentCd = text;
          continue;
        }
      }

      // DisplayName 列 (x0 = 160-270)
      if (x0 >= 160 && x0 < 275 && !/^\d/.test(text)) {
        displayName = text;
        continue;
      }

      // Qty C/F 列 (x0 = 340-390) - 使用右侧较宽的范围
      if (x0 >= 330 && x0 < 395) {
        const qty = this.parseAmount(text);
        if (qty !== undefined && !qtyCF) {
          qtyCF = qty;
          continue;
        }
      }

      // ClsPrice 列 (x0 = 385-445)
      if (x0 >= 385 && x0 < 450) {
        const price = this.parseAmount(text);
        if (price !== undefined && !clsPrice) {
          clsPrice = price;
          continue;
        }
      }

      // Market Value 列 (x0 = 435-490)
      if (x0 >= 435 && x0 < 500) {
        const value = this.parseAmount(text);
        if (value !== undefined && !marketValue) {
          marketValue = value;
          continue;
        }
      }
    }

    // 验证必要字段
    if (!instrumentCd) return null;

    // 确定资产类型
    let assetType: 'Stock' | 'Fund' = 'Stock';
    if (product === 'UT' || instrumentCd.startsWith('UT.')) {
      assetType = 'Fund';
    }

    return {
      symbol: instrumentCd,
      name: displayName || undefined,
      assetType,
      quantity: qtyCF,
      marketPrice: clsPrice,
      marketValue: marketValue,
      currency: currency,
      extras: {
        product: product || undefined,
        market: market || undefined,
      },
    };
  }
}
