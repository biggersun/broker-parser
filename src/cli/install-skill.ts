import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export type SkillInstallHost = 'auto' | 'claude' | 'agents';
export type SkillTarget = 'claude' | 'agents';

export interface DetectHostsOptions {
  homeDir?: string;
  hasCommand?: (command: string) => boolean;
}

export interface InstallSkillOptions extends DetectHostsOptions {
  host?: SkillInstallHost;
  dryRun?: boolean;
  force?: boolean;
  packageRoot?: string;
}

export interface InstallSkillAction {
  host: SkillTarget;
  sourcePath: string;
  targetPath: string;
  status: 'installed' | 'skipped';
  message: string;
}

export interface InstallSkillResult {
  sourcePath: string;
  actions: InstallSkillAction[];
}

interface PackageInfo {
  name: string;
  version: string;
}

interface InstallManifest extends PackageInfo {
  skillName: string;
}

const SKILL_NAME = 'parse-statement';
const MANIFEST_FILE = '.broker-parser-install.json';

/** 检查命令是否存在于当前 PATH。 */
function commandExists(command: string): boolean {
  const pathValue = process.env.PATH;
  if (!pathValue) return false;

  for (const dir of pathValue.split(path.delimiter)) {
    if (!dir) continue;
    const candidate = path.join(dir, command);
    if (fs.existsSync(candidate)) {
      return true;
    }
  }

  return false;
}

/** 读取当前包的基础信息。 */
function readPackageInfo(packageRoot: string): PackageInfo {
  const packageJsonPath = path.join(packageRoot, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8')) as {
    name?: string;
    version?: string;
  };

  return {
    name: packageJson.name ?? '@tcos/broker-parser',
    version: packageJson.version ?? '0.0.0',
  };
}

/** 返回包内 Skill 的发布路径。 */
export function resolveSkillSourcePath(packageRoot = resolvePackageRoot()): string {
  return path.join(packageRoot, '.claude', 'skills', SKILL_NAME);
}

/** 从 src/cli 或 dist/cli 目录反推出包根目录。 */
export function resolvePackageRoot(currentDir = __dirname): string {
  return path.resolve(currentDir, '..', '..');
}

/** 根据本机环境探测需要安装到哪些宿主目录。 */
export function detectInstallTargets(options: DetectHostsOptions = {}): SkillTarget[] {
  const homeDir = options.homeDir ?? os.homedir();
  const hasCommand = options.hasCommand ?? commandExists;

  const supportsClaude = hasCommand('claude') || fs.existsSync(path.join(homeDir, '.claude'));
  const supportsAgentSkills =
    hasCommand('codex') || hasCommand('openclaw') || fs.existsSync(path.join(homeDir, '.agents'));

  const targets: SkillTarget[] = [];
  if (supportsClaude) {
    targets.push('claude');
  }
  if (supportsAgentSkills) {
    targets.push('agents');
  }

  return targets;
}

/** 校验并规范化 host 参数。 */
export function normalizeInstallHost(host: string): SkillInstallHost {
  if (host === 'auto' || host === 'claude' || host === 'agents') {
    return host;
  }

  throw new Error(`Invalid host: ${host}. Expected auto, claude, or agents.`);
}

/** 返回指定宿主的 Skill 安装目标路径。 */
export function resolveSkillTargetPath(host: SkillTarget, homeDir = os.homedir()): string {
  if (host === 'claude') {
    return path.join(homeDir, '.claude', 'skills', SKILL_NAME);
  }

  return path.join(homeDir, '.agents', 'skills', SKILL_NAME);
}

/** 读取安装清单，用于识别是否为 broker-parser 管理的目录。 */
function readInstallManifest(targetPath: string): InstallManifest | null {
  const manifestPath = path.join(targetPath, MANIFEST_FILE);
  if (!fs.existsSync(manifestPath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as InstallManifest;
  } catch {
    return null;
  }
}

/** 复制 Skill 目录并写入安装清单，避免 npx 临时目录软链失效。 */
function copySkillDirectory(
  sourcePath: string,
  targetPath: string,
  manifest: InstallManifest
): void {
  fs.cpSync(sourcePath, targetPath, { recursive: true });
  fs.writeFileSync(
    path.join(targetPath, MANIFEST_FILE),
    JSON.stringify(manifest, null, 2),
    'utf-8'
  );
}

/** 以统一规则安装 parse-statement Skill。 */
export function installSkill(options: InstallSkillOptions = {}): InstallSkillResult {
  const packageRoot = options.packageRoot ?? resolvePackageRoot();
  const packageInfo = readPackageInfo(packageRoot);
  const manifest: InstallManifest = {
    ...packageInfo,
    skillName: SKILL_NAME,
  };
  const sourcePath = resolveSkillSourcePath(packageRoot);
  const homeDir = options.homeDir ?? os.homedir();
  const host = normalizeInstallHost(options.host ?? 'auto');
  const dryRun = options.dryRun ?? false;
  const force = options.force ?? false;

  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Skill source not found: ${sourcePath}`);
  }

  const targets = host === 'auto' ? detectInstallTargets(options) : ([host] as SkillTarget[]);

  if (targets.length === 0) {
    throw new Error(
      'No supported host detected. Use --host claude or --host agents to install manually.'
    );
  }

  const actions: InstallSkillAction[] = [];

  for (const targetHost of targets) {
    const targetPath = resolveSkillTargetPath(targetHost, homeDir);
    const targetDir = path.dirname(targetPath);

    if (!dryRun) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    if (fs.existsSync(targetPath)) {
      const stat = fs.lstatSync(targetPath);
      if (stat.isSymbolicLink()) {
        const currentLink = fs.readlinkSync(targetPath);
        const resolvedLink = path.resolve(path.dirname(targetPath), currentLink);

        if (resolvedLink === sourcePath) {
          actions.push({
            host: targetHost,
            sourcePath,
            targetPath,
            status: 'skipped',
            message: 'already installed',
          });
          continue;
        }
      }

      if (stat.isDirectory()) {
        const existingManifest = readInstallManifest(targetPath);
        if (
          existingManifest &&
          existingManifest.name === manifest.name &&
          existingManifest.version === manifest.version &&
          existingManifest.skillName === manifest.skillName
        ) {
          actions.push({
            host: targetHost,
            sourcePath,
            targetPath,
            status: 'skipped',
            message: 'already installed',
          });
          continue;
        }
      }

      if (!force) {
        throw new Error(
          `Skill target already exists: ${targetPath}. Re-run with --force to replace it.`
        );
      }

      if (!dryRun) {
        fs.rmSync(targetPath, { recursive: true, force: true });
      }
    }

    if (!dryRun) {
      copySkillDirectory(sourcePath, targetPath, manifest);
    }

    actions.push({
      host: targetHost,
      sourcePath,
      targetPath,
      status: 'installed',
      message: dryRun ? 'planned' : 'installed',
    });
  }

  return { sourcePath, actions };
}
