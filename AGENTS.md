# broker-parser 项目约定

- 零数据库依赖；不引入 Prisma、pg、Sequelize 或 TypeORM。Python 仅用于 `src/parsers/phillip/extract.py`，由 TypeScript `child_process.spawn` 调用；新增 Python 提取器需先明确架构例外。
- TypeScript 保持 `strict: true`，不使用 `any`。依赖方向为 `core → types`、`parsers → types`、`cli → core/parsers`；核心和解析器不能依赖 CLI。
- 新 parser 实现 `IBrokerPlugin`、Stage1 提取和 Stage2 格式化；在 `src/cli/index.ts` 注册并从 `src/index.ts` 导出。参考 `src/parsers/phillip/`，添加脱敏 fixture 和相关回归用例。
- 真实 PDF 只放 gitignored 的 `tests/fixtures/local/`；脱敏 JSON 放 `tests/fixtures/<broker>/`。不得提交真实姓名、账户号或 PDF。

## 验证入口

- `npm test` / `npm run test:ci`：Stage2 与 CLI 的 CI 套件，不依赖 PDF；PR 需通过，解析成功率要求至少 90%。不要把旧快照中的成功率当成本次实测。
- `npm run test:local`：包含 Stage1，需本地 PDF；缺失时报告跳过，不为了本次任务搜索其他私人 PDF。
- `npm run lint`、`npm run format:check`、`npm run typecheck`、`npm run build`：按改动选择所需检查。
- 代码审查直接审阅指定差异并给出可验证的问题；使用当前可用工具，不依赖不存在的 skill。
