/**
 * Stage2 规则格式化器回归测试
 *
 * 测试 PhillipRuleFormatter 规则引擎的准确性。
 * 使用 tests/fixtures/phillip/ 目录下的脱敏测试用例。
 *
 * 每个测试用例目录包含：
 * - input.json: 输入的 RawTableData (Stage1 输出)
 * - expected.json: 预期的 StatementData 输出
 * - metadata.json: 用例元数据（可选）
 *
 * 验证规则：
 * 1. 必填字段验证 — 必须存在且类型正确
 * 2. 核心字段比较 — 必须完全匹配（数值允许 0.01 误差）
 * 3. 条目数量必须完全一致
 * 4. 条目顺序可以不同（通过主键匹配）
 * 5. 关键字段提取率 >= 90%
 */

import * as fs from 'fs';
import * as path from 'path';

import { PhillipRuleFormatter } from '../src/parsers/phillip/formatter';
import { cleanStatementData } from '../src/core/cleaning';
import { RawTableData } from '../src/types/raw';
import { StatementData } from '../src/types/statement';

// ============================================================================
// fixture 加载
// ============================================================================

const FIXTURES_DIR = path.join(__dirname, 'fixtures/phillip');

interface FixtureCase {
  name: string;
  dir: string;
}

/** 发现所有 fixture 目录 */
function loadFixtures(): FixtureCase[] {
  if (!fs.existsSync(FIXTURES_DIR)) return [];
  return fs
    .readdirSync(FIXTURES_DIR, { withFileTypes: true })
    .filter(
      (d) =>
        d.isDirectory() &&
        fs.existsSync(path.join(FIXTURES_DIR, d.name, 'input.json')) &&
        fs.existsSync(path.join(FIXTURES_DIR, d.name, 'expected.json'))
    )
    .map((d) => ({ name: d.name, dir: path.join(FIXTURES_DIR, d.name) }));
}

// ============================================================================
// 必填字段定义
// ============================================================================

type FieldType = 'string' | 'number' | 'date';

interface RequiredFieldRule {
  name: string;
  type: FieldType;
}

const TRANSACTION_REQUIRED_FIELDS: RequiredFieldRule[] = [
  { name: 'stockCode', type: 'string' },
  { name: 'transactionType', type: 'string' },
  { name: 'transactionDate', type: 'date' },
  { name: 'currency', type: 'string' },
];

const TRANSACTION_CONDITIONAL_REQUIRED: Record<string, RequiredFieldRule[]> = {
  BUY: [
    { name: 'quantity', type: 'number' },
    { name: 'price', type: 'number' },
  ],
  SELL: [
    { name: 'quantity', type: 'number' },
    { name: 'price', type: 'number' },
  ],
};

const IPO_REQUIRED_FIELDS: RequiredFieldRule[] = [
  { name: 'stockCode', type: 'string' },
  { name: 'type', type: 'string' },
  { name: 'transactionDate', type: 'date' },
  { name: 'currency', type: 'string' },
  { name: 'quantity', type: 'number' },
  { name: 'price', type: 'number' },
];

const SNAPSHOT_REQUIRED_FIELDS: RequiredFieldRule[] = [
  { name: 'symbol', type: 'string' },
  { name: 'assetCategory', type: 'string' },
  { name: 'quantity', type: 'number' },
  { name: 'marketPrice', type: 'number' },
  { name: 'marketValue', type: 'number' },
  { name: 'currency', type: 'string' },
];

const TOP_LEVEL_REQUIRED_FIELDS: RequiredFieldRule[] = [
  { name: 'accountCode', type: 'string' },
  { name: 'clientName', type: 'string' },
  { name: 'period', type: 'date' },
  { name: 'statementDate', type: 'date' },
];

// ============================================================================
// 核心字段定义
// ============================================================================

const TRANSACTION_CRITICAL_FIELDS = [
  'stockCode',
  'stockName',
  'transactionType',
  'amount',
  'quantity',
  'price',
  'fee',
  'transactionDate',
  'settlementDate',
  'currency',
];

const IPO_CRITICAL_FIELDS = [
  'stockCode',
  'stockName',
  'type',
  'amount',
  'quantity',
  'price',
  'transactionDate',
  'settlementDate',
  'currency',
];

const SNAPSHOT_CRITICAL_FIELDS = [
  'symbol',
  'assetCategory',
  'quantity',
  'marketPrice',
  'marketValue',
  'currency',
  'description',
];

const TOP_LEVEL_CRITICAL_FIELDS = ['accountCode', 'clientName', 'period', 'statementDate'];

// ============================================================================
// 比较工具函数
// ============================================================================

function validateFieldType(value: unknown, expectedType: FieldType): boolean {
  if (value === null || value === undefined) return false;
  switch (expectedType) {
    case 'string':
      return typeof value === 'string' && value.trim() !== '';
    case 'number':
      return typeof value === 'number' && !isNaN(value);
    case 'date':
      return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
    default:
      return false;
  }
}

function validateRequiredFields(
  item: Record<string, unknown>,
  requiredFields: RequiredFieldRule[],
  itemId: string
): string[] {
  const errors: string[] = [];
  for (const field of requiredFields) {
    const value = item[field.name];
    if (value === null || value === undefined) {
      errors.push(`${itemId}.${field.name}: missing required field`);
    } else if (!validateFieldType(value, field.type)) {
      errors.push(
        `${itemId}.${field.name}: invalid type, expected ${field.type}, got ${typeof value} (value: ${JSON.stringify(value)})`
      );
    }
  }
  return errors;
}

function validateTransactionConditionalFields(
  item: Record<string, unknown>,
  itemId: string
): string[] {
  const transactionType = item.transactionType as string;
  const conditionalFields = TRANSACTION_CONDITIONAL_REQUIRED[transactionType];
  if (!conditionalFields) return [];
  return validateRequiredFields(item, conditionalFields, itemId);
}

function valuesMatch(actual: unknown, expected: unknown): boolean {
  const isEmptyValue = (v: unknown) => v === null || v === undefined || v === '';
  if (isEmptyValue(actual) && isEmptyValue(expected)) return true;
  if (typeof actual === 'number' && typeof expected === 'number') {
    return Math.abs(actual - expected) < 0.01;
  }
  if (typeof actual === 'string' && typeof expected === 'string') {
    return actual.trim() === expected.trim();
  }
  return actual === expected;
}

function compareCriticalFields(
  actual: Record<string, unknown>,
  expected: Record<string, unknown>,
  criticalFields: string[],
  itemId: string
): string[] {
  const mismatches: string[] = [];
  for (const field of criticalFields) {
    if (!valuesMatch(actual[field], expected[field])) {
      mismatches.push(`${itemId}.${field}: expected "${expected[field]}", got "${actual[field]}"`);
    }
  }
  return mismatches;
}

function compareArrayWithCriticalFields(
  actual: Array<Record<string, unknown>>,
  expected: Array<Record<string, unknown>>,
  primaryKey: string,
  criticalFields: string[],
  arrayName: string
): { criticalMismatches: string[]; extraItems: string[]; missingItems: string[] } {
  const criticalMismatches: string[] = [];
  const extraItems: string[] = [];
  const missingItems: string[] = [];

  const expectedMap = new Map<string, Record<string, unknown>>();
  for (const item of expected) {
    const key = String(item[primaryKey] || '');
    if (key) expectedMap.set(key, item);
  }

  const actualMap = new Map<string, Record<string, unknown>>();
  for (const item of actual) {
    const key = String(item[primaryKey] || '');
    if (key) actualMap.set(key, item);
  }

  for (const [key, actualItem] of actualMap) {
    const expectedItem = expectedMap.get(key);
    if (!expectedItem) {
      extraItems.push(`${arrayName}: extra item with ${primaryKey}="${key}"`);
      continue;
    }
    const mismatches = compareCriticalFields(
      actualItem,
      expectedItem,
      criticalFields,
      `${arrayName}[${primaryKey}="${key}"]`
    );
    criticalMismatches.push(...mismatches);
  }

  for (const key of expectedMap.keys()) {
    if (!actualMap.has(key)) {
      missingItems.push(`${arrayName}: missing item with ${primaryKey}="${key}"`);
    }
  }

  return { criticalMismatches, extraItems, missingItems };
}

function getIpoKey(item: Record<string, unknown>): string {
  return `${item.stockCode || ''}_${item.transactionDate || ''}_${item.type || ''}`;
}

function compareIpoArrayWithCriticalFields(
  actual: Array<Record<string, unknown>>,
  expected: Array<Record<string, unknown>>,
  criticalFields: string[]
): { criticalMismatches: string[]; extraItems: string[]; missingItems: string[] } {
  const criticalMismatches: string[] = [];
  const extraItems: string[] = [];
  const missingItems: string[] = [];

  const expectedMap = new Map<string, Record<string, unknown>>();
  for (const item of expected) {
    expectedMap.set(getIpoKey(item), item);
  }

  const actualMap = new Map<string, Record<string, unknown>>();
  for (const item of actual) {
    actualMap.set(getIpoKey(item), item);
  }

  for (const [key, actualItem] of actualMap) {
    const expectedItem = expectedMap.get(key);
    if (!expectedItem) {
      extraItems.push(`ipo: extra item with key="${key}"`);
      continue;
    }
    const mismatches = compareCriticalFields(
      actualItem,
      expectedItem,
      criticalFields,
      `ipo[${key}]`
    );
    criticalMismatches.push(...mismatches);
  }

  for (const key of expectedMap.keys()) {
    if (!actualMap.has(key)) {
      missingItems.push(`ipo: missing item with key="${key}"`);
    }
  }

  return { criticalMismatches, extraItems, missingItems };
}

// ============================================================================
// 主比较函数
// ============================================================================

interface ComparisonResult {
  requiredFieldErrors: string[];
  criticalMismatches: string[];
  countMismatches: string[];
  extraItems: string[];
  missingItems: string[];
}

function compareStage2Output(actual: StatementData, expected: StatementData): ComparisonResult {
  const result: ComparisonResult = {
    requiredFieldErrors: [],
    criticalMismatches: [],
    countMismatches: [],
    extraItems: [],
    missingItems: [],
  };

  // 顶层必填字段
  result.requiredFieldErrors.push(
    ...validateRequiredFields(
      actual as unknown as Record<string, unknown>,
      TOP_LEVEL_REQUIRED_FIELDS,
      'root'
    )
  );

  // 顶层核心字段
  for (const field of TOP_LEVEL_CRITICAL_FIELDS) {
    const actualVal = (actual as unknown as Record<string, unknown>)[field];
    const expectedVal = (expected as unknown as Record<string, unknown>)[field];
    if (!valuesMatch(actualVal, expectedVal)) {
      result.criticalMismatches.push(`${field}: expected "${expectedVal}", got "${actualVal}"`);
    }
  }

  // transactions
  const actualTxns = (actual.transactions || []) as unknown as Array<Record<string, unknown>>;
  const expectedTxns = (expected.transactions || []) as unknown as Array<Record<string, unknown>>;

  if (actualTxns.length !== expectedTxns.length) {
    result.countMismatches.push(
      `transactions count: expected ${expectedTxns.length}, got ${actualTxns.length}`
    );
  }

  for (let i = 0; i < actualTxns.length; i++) {
    const txn = actualTxns[i];
    const itemId = `transactions[${i}]`;
    result.requiredFieldErrors.push(
      ...validateRequiredFields(txn, TRANSACTION_REQUIRED_FIELDS, itemId)
    );
    result.requiredFieldErrors.push(...validateTransactionConditionalFields(txn, itemId));
  }

  const txnResult = compareArrayWithCriticalFields(
    actualTxns,
    expectedTxns,
    'refNo',
    TRANSACTION_CRITICAL_FIELDS,
    'transactions'
  );
  result.criticalMismatches.push(...txnResult.criticalMismatches);
  result.extraItems.push(...txnResult.extraItems);
  result.missingItems.push(...txnResult.missingItems);

  // ipo
  const actualIpo = (actual.ipo || []) as unknown as Array<Record<string, unknown>>;
  const expectedIpo = (expected.ipo || []) as unknown as Array<Record<string, unknown>>;

  if (actualIpo.length !== expectedIpo.length) {
    result.countMismatches.push(
      `ipo count: expected ${expectedIpo.length}, got ${actualIpo.length}`
    );
  }

  for (let i = 0; i < actualIpo.length; i++) {
    result.requiredFieldErrors.push(
      ...validateRequiredFields(actualIpo[i], IPO_REQUIRED_FIELDS, `ipo[${i}]`)
    );
  }

  const ipoResult = compareIpoArrayWithCriticalFields(actualIpo, expectedIpo, IPO_CRITICAL_FIELDS);
  result.criticalMismatches.push(...ipoResult.criticalMismatches);
  result.extraItems.push(...ipoResult.extraItems);
  result.missingItems.push(...ipoResult.missingItems);

  // snapshots
  const actualSnaps = (actual.snapshots || []) as unknown as Array<Record<string, unknown>>;
  const expectedSnaps = (expected.snapshots || []) as unknown as Array<Record<string, unknown>>;

  if (actualSnaps.length !== expectedSnaps.length) {
    result.countMismatches.push(
      `snapshots count: expected ${expectedSnaps.length}, got ${actualSnaps.length}`
    );
  }

  for (let i = 0; i < actualSnaps.length; i++) {
    result.requiredFieldErrors.push(
      ...validateRequiredFields(actualSnaps[i], SNAPSHOT_REQUIRED_FIELDS, `snapshots[${i}]`)
    );
  }

  const snapResult = compareArrayWithCriticalFields(
    actualSnaps,
    expectedSnaps,
    'symbol',
    SNAPSHOT_CRITICAL_FIELDS,
    'snapshots'
  );
  result.criticalMismatches.push(...snapResult.criticalMismatches);
  result.extraItems.push(...snapResult.extraItems);
  result.missingItems.push(...snapResult.missingItems);

  return result;
}

// ============================================================================
// 测试用例
// ============================================================================

describe('Stage2 Rule Formatter Regression Tests', () => {
  const fixtures = loadFixtures();

  test('should have test fixtures available', () => {
    expect(fixtures.length).toBeGreaterThan(0);
    // eslint-disable-next-line no-console
    console.log(`Found ${fixtures.length} test fixtures in ${FIXTURES_DIR}`);
  });

  fixtures.forEach(({ name, dir }) => {
    test(
      `Case: ${name}`,
      async () => {
        const input = JSON.parse(
          fs.readFileSync(path.join(dir, 'input.json'), 'utf-8')
        ) as RawTableData;
        const expected = JSON.parse(
          fs.readFileSync(path.join(dir, 'expected.json'), 'utf-8')
        ) as StatementData;

        // Stage2 格式化
        const formatter = new PhillipRuleFormatter();
        const formatted = await formatter.format(input);

        // Stage3 清理
        const { result: actual } = cleanStatementData(formatted);

        // 比较
        const comparison = compareStage2Output(actual, expected);

        // 汇总问题
        const allIssues = [
          ...comparison.requiredFieldErrors,
          ...comparison.countMismatches,
          ...comparison.criticalMismatches,
          ...comparison.extraItems,
          ...comparison.missingItems,
        ];

        if (allIssues.length > 0) {
          // eslint-disable-next-line no-console
          console.log(`[${name}] Found ${allIssues.length} issues:`);
          allIssues.slice(0, 10).forEach((issue) => {
            // eslint-disable-next-line no-console
            console.log(`  - ${issue}`);
          });
          if (allIssues.length > 10) {
            // eslint-disable-next-line no-console
            console.log(`  ... and ${allIssues.length - 10} more`);
          }
        }

        // 断言
        expect(comparison.requiredFieldErrors).toEqual([]);
        expect(comparison.criticalMismatches).toEqual([]);
        expect(comparison.countMismatches).toEqual([]);
        expect(comparison.extraItems).toEqual([]);
        expect(comparison.missingItems).toEqual([]);
      },
      30000
    );
  });

  test('关键字段提取率 >= 90%', async () => {
    let totalFields = 0;
    let matchedFields = 0;

    for (const { dir } of fixtures) {
      const input = JSON.parse(
        fs.readFileSync(path.join(dir, 'input.json'), 'utf-8')
      ) as RawTableData;
      const expected = JSON.parse(
        fs.readFileSync(path.join(dir, 'expected.json'), 'utf-8')
      ) as StatementData;

      const formatter = new PhillipRuleFormatter();
      const formatted = await formatter.format(input);
      const { result: actual } = cleanStatementData(formatted);

      // 统计 accountCode
      totalFields++;
      if (actual.accountCode === expected.accountCode) matchedFields++;

      // 统计 statementDate
      totalFields++;
      if (actual.statementDate === expected.statementDate) matchedFields++;

      // 统计 transactions 数量
      totalFields++;
      if (actual.transactions.length === expected.transactions.length) matchedFields++;

      // 统计 ipo 数量
      totalFields++;
      if (actual.ipo.length === expected.ipo.length) matchedFields++;

      // 统计 snapshots 数量
      totalFields++;
      if (actual.snapshots.length === expected.snapshots.length) matchedFields++;
    }

    const rate = totalFields > 0 ? matchedFields / totalFields : 0;
    // eslint-disable-next-line no-console
    console.log(
      `Extraction rate: ${matchedFields}/${totalFields} = ${(rate * 100).toFixed(1)}%`
    );
    expect(rate).toBeGreaterThanOrEqual(0.9);
  });
});
