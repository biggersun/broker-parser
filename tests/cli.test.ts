/**
 * CLI 测试
 *
 * 测试 CLI 入口的核心功能，不依赖 PDF 文件。
 * 直接导入 registry 和 plugin 模块测试，避免依赖 build 产物。
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  detectInstallTargets,
  installSkill,
  resolveSkillTargetPath,
} from '../src/cli/install-skill';
import { setupEnvironment } from '../src/cli/setup';
import { PluginRegistry } from '../src/core/registry';
import { PhillipPlugin } from '../src/parsers/phillip';

describe('CLI — PluginRegistry', () => {
  let registry: PluginRegistry;

  beforeAll(() => {
    registry = new PluginRegistry();
    registry.register(new PhillipPlugin());
  });

  it('listPlugins 应包含 phillip', () => {
    const plugins = registry.listPlugins();
    expect(plugins.length).toBeGreaterThan(0);

    const names = plugins.map((p) => p.name);
    expect(names).toContain('phillip');
  });

  it('phillip 插件 displayName 应为 Phillip Securities', () => {
    const plugins = registry.listPlugins();
    const phillip = plugins.find((p) => p.name === 'phillip');
    expect(phillip).toBeDefined();
    expect(phillip!.displayName).toBe('Phillip Securities');
  });

  it('getPlugin 按名称获取 phillip 插件', () => {
    const plugin = registry.getPlugin('phillip');
    expect(plugin).toBeDefined();
    expect(plugin.name).toBe('phillip');
  });

  it('getPlugin 未知券商应抛出异常', () => {
    expect(() => registry.getPlugin('unknown_broker')).toThrow(/Unknown broker/);
  });

  it('phillip 插件支持 pdf 文件类型', () => {
    const plugin = registry.getPlugin('phillip');
    expect(plugin.supportedFileTypes).toContain('pdf');
  });

  it('phillip 可创建 extractor 和 formatter', () => {
    const plugin = registry.getPlugin('phillip');
    const extractor = plugin.createExtractor();
    const formatter = plugin.createFormatter();
    expect(extractor).toBeDefined();
    expect(formatter).toBeDefined();
  });
});

describe('CLI — Package version', () => {
  it('package.json 包含有效版本号', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pkg = require('../package.json');
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('package.json bin 字段指向 tcos-parse', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pkg = require('../package.json');
    expect(pkg.bin).toBeDefined();
    expect(pkg.bin['tcos-parse']).toBeDefined();
  });
});

describe('CLI — install-skill', () => {
  let tempRoot: string;
  let tempHomeDir: string;
  let tempPackageRoot: string;
  let skillSourcePath: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'broker-parser-skill-'));
    tempHomeDir = path.join(tempRoot, 'home');
    tempPackageRoot = path.join(tempRoot, 'package');
    skillSourcePath = path.join(tempPackageRoot, '.claude', 'skills', 'parse-statement');

    fs.mkdirSync(tempHomeDir, { recursive: true });
    fs.mkdirSync(tempPackageRoot, { recursive: true });
    fs.mkdirSync(skillSourcePath, { recursive: true });
    fs.writeFileSync(
      path.join(tempPackageRoot, 'package.json'),
      JSON.stringify({ name: '@tcos/broker-parser', version: '0.1.0-test' }),
      'utf-8'
    );
    fs.writeFileSync(path.join(skillSourcePath, 'SKILL.md'), '# parse-statement\n', 'utf-8');
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('自动探测可识别 Claude 与 Agent Skills 宿主', () => {
    fs.mkdirSync(path.join(tempHomeDir, '.claude'), { recursive: true });
    const targets = detectInstallTargets({
      homeDir: tempHomeDir,
      hasCommand: (command) => command === 'openclaw',
    });

    expect(targets).toEqual(['claude', 'agents']);
  });

  it('auto 模式可同时安装到 Claude 与 Agent Skills 目录', () => {
    fs.mkdirSync(path.join(tempHomeDir, '.claude'), { recursive: true });
    fs.mkdirSync(path.join(tempHomeDir, '.agents'), { recursive: true });

    const result = installSkill({
      homeDir: tempHomeDir,
      packageRoot: tempPackageRoot,
      host: 'auto',
      hasCommand: () => false,
    });

    expect(result.actions).toHaveLength(2);

    const claudeTarget = resolveSkillTargetPath('claude', tempHomeDir);
    const agentsTarget = resolveSkillTargetPath('agents', tempHomeDir);

    expect(fs.lstatSync(claudeTarget).isDirectory()).toBe(true);
    expect(fs.lstatSync(agentsTarget).isDirectory()).toBe(true);
    expect(fs.existsSync(path.join(claudeTarget, 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(agentsTarget, 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(claudeTarget, '.broker-parser-install.json'))).toBe(true);
    expect(fs.existsSync(path.join(agentsTarget, '.broker-parser-install.json'))).toBe(true);
  });

  it('重复安装相同版本的已管理目录时应跳过', () => {
    fs.mkdirSync(path.join(tempHomeDir, '.claude'), { recursive: true });

    installSkill({
      homeDir: tempHomeDir,
      packageRoot: tempPackageRoot,
      host: 'claude',
    });

    const result = installSkill({
      homeDir: tempHomeDir,
      packageRoot: tempPackageRoot,
      host: 'claude',
    });

    expect(result.actions).toEqual([
      expect.objectContaining({
        host: 'claude',
        status: 'skipped',
        message: 'already installed',
      }),
    ]);
  });

  it('目标已存在普通目录且未指定 force 时应报错', () => {
    const targetPath = resolveSkillTargetPath('claude', tempHomeDir);
    fs.mkdirSync(targetPath, { recursive: true });

    expect(() =>
      installSkill({
        homeDir: tempHomeDir,
        packageRoot: tempPackageRoot,
        host: 'claude',
      })
    ).toThrow(/already exists/);
  });

  it('force 模式可替换冲突目录', () => {
    const targetPath = resolveSkillTargetPath('claude', tempHomeDir);
    fs.mkdirSync(targetPath, { recursive: true });
    fs.writeFileSync(path.join(targetPath, 'old.txt'), 'legacy', 'utf-8');

    const result = installSkill({
      homeDir: tempHomeDir,
      packageRoot: tempPackageRoot,
      host: 'claude',
      force: true,
    });

    expect(result.actions[0]).toEqual(
      expect.objectContaining({
        host: 'claude',
        status: 'installed',
      })
    );
    expect(fs.lstatSync(targetPath).isDirectory()).toBe(true);
  });

  it('dry-run 模式只输出计划动作，不创建目标文件', () => {
    const result = installSkill({
      homeDir: tempHomeDir,
      packageRoot: tempPackageRoot,
      host: 'agents',
      dryRun: true,
    });

    expect(result.actions).toEqual([
      expect.objectContaining({
        host: 'agents',
        status: 'installed',
        message: 'planned',
      }),
    ]);
    expect(fs.existsSync(resolveSkillTargetPath('agents', tempHomeDir))).toBe(false);
  });
});

describe('CLI — setup', () => {
  it('dry-run 会为缺失依赖生成安装计划', () => {
    const result = setupEnvironment({
      dryRun: true,
      hasCommand: (command) => command === 'brew',
      pythonHasPip: () => false,
      pythonHasModule: () => false,
    });

    expect(result.actions).toEqual([
      expect.objectContaining({
        status: 'planned',
        message: 'install global tcos-parse CLI',
        command: 'npm',
      }),
      expect.objectContaining({
        status: 'planned',
        message: 'install python3 via Homebrew',
        command: 'brew',
      }),
      expect.objectContaining({
        status: 'planned',
        message: 'install pip for python3',
        command: 'python3',
      }),
      expect.objectContaining({
        status: 'planned',
        message: 'install pdfplumber for current user',
        command: 'python3',
      }),
      expect.objectContaining({
        status: 'planned',
        message: 'install poppler via Homebrew',
        command: 'brew',
      }),
    ]);
  });

  it('已有依赖时应全部跳过', () => {
    const result = setupEnvironment({
      hasCommand: (command) => ['tcos-parse', 'python3', 'pdftotext'].includes(command),
      pythonHasPip: () => true,
      pythonHasModule: () => true,
      runCommand: () => {
        throw new Error('should not execute commands');
      },
    });

    expect(result.actions).toEqual([
      expect.objectContaining({
        status: 'skipped',
        message: 'tcos-parse already available',
      }),
      expect.objectContaining({
        status: 'skipped',
        message: 'python3 already available',
      }),
      expect.objectContaining({
        status: 'skipped',
        message: 'python3 pip already available',
      }),
      expect.objectContaining({
        status: 'skipped',
        message: 'pdfplumber already available',
      }),
      expect.objectContaining({
        status: 'skipped',
        message: 'pdftotext already available',
      }),
    ]);
  });
});
