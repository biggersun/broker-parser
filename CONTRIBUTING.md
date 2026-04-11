# Contributing to broker-parser

感谢你对 broker-parser 的贡献！

## 开发环境设置

```bash
# 克隆仓库
git clone https://github.com/biggersun/broker-parser.git
cd broker-parser

# 安装依赖
npm install

# 运行测试
npm test
```

## 开发流程

1. Fork 仓库并创建功能分支
2. 编写代码和测试
3. 确保所有检查通过：
   ```bash
   npm run lint
   npm run format:check
   npm run typecheck
   npm test
   ```
4. 提交 PR

## 架构约束

- **零数据库依赖**：禁止引用 `prisma`、`pg`、`sequelize`、`typeorm`
- **严格类型**：禁止使用 `any`
- **中文注释**：代码注释使用中文

## 提交规范

```bash
# type: feat | fix | refactor | test | docs | chore
git commit -m "feat: 新增功能描述"
```

## 测试规范

- `npm test` — CI 测试（Stage2 + CLI，无 PDF 依赖）
- `npm run test:local` — 本地完整测试（需真实 PDF）
- 测试 fixtures 放在 `tests/fixtures/phillip/`（脱敏 JSON）
- 真实 PDF 放在 `tests/fixtures/local/`（已 gitignore）

## 新增券商解析器

1. 在 `src/parsers/<broker>/` 下创建目录
2. 实现 `IBrokerPlugin` 接口
3. 添加对应的测试 fixtures
4. 更新 README.md 的支持列表
