/**
 * CLI 测试
 *
 * 测试 CLI 入口的核心功能，不依赖 PDF 文件。
 * 直接导入 registry 和 plugin 模块测试，避免依赖 build 产物。
 */

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
