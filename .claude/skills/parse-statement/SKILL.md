---
name: parse-statement
description: 解析券商 PDF 结单文件，提取交易记录、持仓和资产汇总为结构化 JSON
---

# 券商 PDF 结单解析

仅解析券商结单、交易记录、持仓和资产汇总；普通 PDF 阅读使用 PDF 能力。

- 优先使用已安装的 `tcos-parse`，用 `--help` 或 `--list-parsers` 核对实际 CLI 能力。每次解析不重复运行 setup 或 install-skill，也不覆盖本地技能。
- 缺少 CLI 或解析依赖时，先识别缺失项；仅在任务包含环境安装时使用包的 setup。不要把一次解析扩展为全局安装或配置迁移。
- 基础形式：`tcos-parse /绝对路径/结单.pdf -o /绝对路径/结果.json`；只处理本次授权的文件。
- `-b phillip` 指定券商；`--detect` 检测支持情况；`--raw` 查看 Stage1 提取；`--no-clean` 跳过 Stage3；`-v` 输出耗时、`-q` 静默输出。以当前 `--help` 为准。
- 需要消费字段时读取 [StatementData 样例](references/output-format.md)；核对交易、持仓、资产与原结单，缺失或不支持的字段明确报告。
- 报告使用脱敏标识；不要将真实姓名、账户号或原 PDF 放入 Git、共享日志或外部服务。
