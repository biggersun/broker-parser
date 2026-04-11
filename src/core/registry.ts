/**
 * PluginRegistry — 券商插件注册表
 *
 * 管理所有已注册的 IBrokerPlugin 实例，支持：
 * - 按名称精确获取
 * - 列出全部已注册插件
 * - 自动检测 PDF 所属券商（取置信度最高者）
 */

import { IBrokerPlugin } from '../types/plugin';

export class PluginRegistry {
  private readonly plugins = new Map<string, IBrokerPlugin>();

  /** 注册一个券商插件 */
  register(plugin: IBrokerPlugin): void {
    this.plugins.set(plugin.name, plugin);
  }

  /** 按名称获取插件，找不到则抛异常 */
  getPlugin(name: string): IBrokerPlugin {
    const plugin = this.plugins.get(name);
    if (!plugin) {
      throw new Error(`Unknown broker: "${name}". Use --list-parsers to see available parsers.`);
    }
    return plugin;
  }

  /** 列出所有已注册插件 */
  listPlugins(): IBrokerPlugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * 自动检测 PDF 所属券商
   * 遍历所有插件调用 detect()，返回置信度最高且 >= 0.5 的插件
   */
  async autoDetect(filePath: string): Promise<IBrokerPlugin> {
    let bestPlugin: IBrokerPlugin | null = null;
    let bestScore = 0;

    for (const plugin of this.plugins.values()) {
      const score = await plugin.detect(filePath);
      if (score > bestScore) {
        bestScore = score;
        bestPlugin = plugin;
      }
    }

    if (!bestPlugin || bestScore < 0.5) {
      throw new Error(
        'Cannot auto-detect broker from this PDF. Try specifying with -b (e.g., -b phillip).'
      );
    }

    return bestPlugin;
  }
}
