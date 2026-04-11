#!/usr/bin/env node
/**
 * CLI 入口 — tcos-parse 命令
 *
 * 用法：
 *   tcos-parse <pdf>              # 解析并输出 JSON 到 stdout
 *   tcos-parse <pdf> -o out.json  # 输出到文件
 *   tcos-parse <pdf> --raw        # 只输出 Stage1 原始数据
 *   tcos-parse <pdf> --no-clean   # 跳过 Stage3 清理
 *   tcos-parse -b phillip <pdf>   # 指定券商
 *   tcos-parse --detect <pdf>     # 检测 PDF 所属券商
 *   tcos-parse --list-parsers     # 列出支持的券商
 *   tcos-parse -v <pdf>           # 显示各阶段耗时
 *   tcos-parse -q <pdf>           # 静默模式，只输出 JSON
 */

import * as fs from 'fs';
import * as path from 'path';

import { Command } from 'commander';

import { ParsePipeline } from '../core/pipeline';
import { PluginRegistry } from '../core/registry';
import { PhillipPlugin } from '../parsers/phillip';

// 初始化插件注册表
const registry = new PluginRegistry();
registry.register(new PhillipPlugin());
const pipeline = new ParsePipeline(registry);

const program = new Command();

program
  .name('tcos-parse')
  .description('Parse brokerage PDF statements into structured JSON')
  .version('0.1.0');

// 主命令：解析 PDF
program
  .argument('[pdf]', 'PDF statement file to parse')
  .option('-o, --output <file>', 'output to file (default: stdout)')
  .option('-b, --broker <name>', 'specify broker (default: auto-detect)')
  .option('--raw', 'output Stage1 raw data only')
  .option('--no-clean', 'skip cleaning step')
  .option('-v, --verbose', 'show stage timing and details')
  .option('-q, --quiet', 'silent mode, only output JSON')
  .option('--detect', 'detect broker instead of parsing')
  .option('--list-parsers', 'list available broker parsers')
  .action(
    async (
      pdfArg: string | undefined,
      opts: {
        output?: string;
        broker?: string;
        raw?: boolean;
        clean: boolean; // commander --no-clean → clean=false
        verbose?: boolean;
        quiet?: boolean;
        detect?: boolean;
        listParsers?: boolean;
      }
    ) => {
      // --list-parsers：列出支持的券商
      if (opts.listParsers) {
        const plugins = registry.listPlugins();
        console.log('Available parsers:');
        for (const p of plugins) {
          console.log(`  ${p.name} — ${p.displayName}`);
        }
        return;
      }

      // 其他操作都需要 PDF 路径
      if (!pdfArg) {
        console.error('Error: PDF file path is required. Use --help for usage.');
        process.exit(1);
      }

      const pdfPath = path.resolve(pdfArg);

      // 检查文件是否存在
      if (!fs.existsSync(pdfPath)) {
        console.error(`Error: File not found: ${pdfPath}`);
        process.exit(1);
      }

      // --detect：检测券商模式
      if (opts.detect) {
        const plugins = registry.listPlugins();
        let bestName = 'unknown';
        let bestScore = 0;
        for (const p of plugins) {
          const score = await p.detect(pdfPath);
          if (score > bestScore) {
            bestScore = score;
            bestName = p.name;
          }
        }
        if (!opts.quiet) {
          console.log(`Detected broker: ${bestName} (confidence: ${bestScore.toFixed(2)})`);
        } else {
          console.log(bestName);
        }
        return;
      }

      // 解析模式
      try {
        const result = await pipeline.parse(pdfPath, {
          broker: opts.broker,
          raw: opts.raw,
          noClean: !opts.clean, // commander --no-clean → clean=false → noClean=true
          verbose: opts.verbose,
        });

        // verbose 时把耗时输出到 stderr（不污染 stdout JSON）
        if (opts.verbose) {
          const t = result.metadata.timings;
          process.stderr.write(
            `[timing] detect=${t.detect}ms stage1=${t.stage1}ms ` +
              `stage2=${t.stage2}ms clean=${t.clean}ms total=${t.total}ms\n`
          );
        }

        const json = JSON.stringify(result.data, null, 2);

        if (opts.output) {
          fs.writeFileSync(path.resolve(opts.output), json, 'utf-8');
          if (!opts.quiet) {
            process.stderr.write(`Written to ${opts.output}\n`);
          }
        } else {
          console.log(json);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        process.stderr.write(`Error: ${message}\n`);
        process.exit(1);
      }
    }
  );

program.parse();
