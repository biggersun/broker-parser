/**
 * Stage1 PDF 提取器测试（需要本地 PDF 文件）
 *
 * 本测试需要 pdfplumber Python 环境和真实 PDF 文件，
 * CI 环境没有 PDF 文件时自动跳过。
 *
 * 本地运行：将 PDF 文件放入 tests/fixtures/local/phillip/ 目录
 */

import * as fs from 'fs';
import * as path from 'path';

import { PhillipPdfplumberExtractor } from '../src/parsers/phillip/extractor';

const LOCAL_FIXTURES = path.join(__dirname, 'fixtures/local/phillip');

// 检查是否有本地 PDF 文件
const hasPdf =
  fs.existsSync(LOCAL_FIXTURES) && fs.readdirSync(LOCAL_FIXTURES).some((f) => f.endsWith('.pdf'));

// 根据是否有 PDF 动态选择 describe 或 describe.skip
const describeFn = hasPdf ? describe : describe.skip;

describeFn('Stage1 Extractor Tests (local PDF required)', () => {
  it('should extract RawTableData from PDF', async () => {
    const pdfs = fs.readdirSync(LOCAL_FIXTURES).filter((f) => f.endsWith('.pdf'));
    expect(pdfs.length).toBeGreaterThan(0);

    for (const pdf of pdfs) {
      const extractor = new PhillipPdfplumberExtractor();
      const result = await extractor.extract(path.join(LOCAL_FIXTURES, pdf));

      // 基本结构验证
      expect(result).toBeDefined();
      expect(result.accountInfo).toBeDefined();
      expect(Array.isArray(result.transactions)).toBe(true);
      expect(Array.isArray(result.holdings)).toBe(true);

      // 至少提取到账户信息
      expect(result.accountInfo.accountCode).toBeTruthy();

      // eslint-disable-next-line no-console
      console.log(
        `[${pdf}] Extracted: ${result.transactions.length} transactions, ${result.holdings.length} holdings`
      );
    }
  }, 60000);
});

// 当没有 PDF 时输出提示
if (!hasPdf) {
  describe('Stage1 Extractor (skipped)', () => {
    it('no local PDFs found — place .pdf files in tests/fixtures/local/phillip/ to enable', () => {
      // eslint-disable-next-line no-console
      console.log('Stage1 tests skipped: no PDF files in tests/fixtures/local/phillip/');
    });
  });
}
