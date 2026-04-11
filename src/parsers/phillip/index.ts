/**
 * PhillipPlugin — 辉立证券 PDF 解析插件
 *
 * 封装 Stage1 提取器和 Stage2 格式化器，实现 IBrokerPlugin 接口。
 * detect() 通过 pdfplumber 快速读取首页文本判断是否为辉立结单。
 */

import { spawn } from 'child_process';

import { IStage2Formatter } from '../../types/formatter';
import { IBrokerPlugin } from '../../types/plugin';
import { IStage1Extractor } from '../../types/raw';

import { PhillipPdfplumberExtractor } from './extractor';
import { PhillipRuleFormatter } from './formatter';

export class PhillipPlugin implements IBrokerPlugin {
  readonly name = 'phillip';
  readonly displayName = 'Phillip Securities';
  readonly supportedFileTypes = ['pdf'];

  /**
   * 检测 PDF 是否为辉立证券结单
   * 使用 pdfplumber 快速提取首页文本，搜索辉立特征关键词
   * @returns 0.9 = 匹配，0 = 不匹配
   */
  detect(filePath: string): Promise<number> {
    return new Promise((resolve) => {
      // 内联 Python 脚本：提取首页文本
      const script = [
        'import pdfplumber,sys',
        'try:',
        '  with pdfplumber.open(sys.argv[1]) as pdf:',
        "    print(pdf.pages[0].extract_text() or '')",
        'except:',
        "  print('')",
      ].join('\n');

      const proc = spawn('python3', ['-c', script, filePath]);
      let output = '';

      proc.stdout.on('data', (chunk: Buffer) => {
        output += chunk.toString();
      });

      proc.on('close', () => {
        const text = output.toUpperCase();
        const found = text.includes('PHILLIP SECURITIES') || text.includes('辉立');
        resolve(found ? 0.9 : 0);
      });

      proc.on('error', () => resolve(0));
    });
  }

  /** 创建 Stage1 pdfplumber 提取器 */
  createExtractor(): IStage1Extractor {
    return new PhillipPdfplumberExtractor();
  }

  /** 创建 Stage2 规则格式化器 */
  createFormatter(config?: Record<string, unknown>): IStage2Formatter {
    return new PhillipRuleFormatter(config);
  }
}
