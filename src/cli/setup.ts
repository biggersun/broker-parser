import { spawnSync } from 'child_process';
import * as path from 'path';

export interface SetupEnvironmentOptions {
  dryRun?: boolean;
  hasCommand?: (command: string) => boolean;
  pythonHasModule?: (pythonBin: string, moduleName: string) => boolean;
  pythonHasPip?: (pythonBin: string) => boolean;
  runCommand?: (command: string, args: string[]) => void;
  packageName?: string;
}

export interface SetupAction {
  status: 'installed' | 'skipped' | 'planned' | 'manual';
  message: string;
  command?: string;
  args?: string[];
}

export interface SetupEnvironmentResult {
  actions: SetupAction[];
}

/** 检查命令是否存在于当前 PATH。 */
function commandExists(command: string): boolean {
  const pathValue = process.env.PATH;
  if (!pathValue) return false;

  for (const dir of pathValue.split(path.delimiter)) {
    if (!dir) continue;
    const candidate = path.join(dir, command);
    const probe = spawnSync(candidate, ['--version'], { stdio: 'ignore' });
    if (!probe.error) {
      return true;
    }
  }

  return false;
}

/** 检查 python 模块是否可导入。 */
function defaultPythonHasModule(pythonBin: string, moduleName: string): boolean {
  const probe = spawnSync(pythonBin, ['-c', `import ${moduleName}`], { stdio: 'ignore' });
  return probe.status === 0;
}

/** 检查 python3 是否已具备 pip。 */
function defaultPythonHasPip(pythonBin: string): boolean {
  const probe = spawnSync(pythonBin, ['-m', 'pip', '--version'], { stdio: 'ignore' });
  return probe.status === 0;
}

/** 执行外部命令，并在失败时抛出异常。 */
function defaultRunCommand(command: string, args: string[]): void {
  const result = spawnSync(command, args, { stdio: 'inherit' });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(' ')}`);
  }
}

/** 执行或计划一条 setup 动作。 */
function executeOrPlan(
  actions: SetupAction[],
  dryRun: boolean,
  runCommand: (command: string, args: string[]) => void,
  message: string,
  command: string,
  args: string[]
): void {
  if (dryRun) {
    actions.push({
      status: 'planned',
      message,
      command,
      args,
    });
    return;
  }

  runCommand(command, args);
  actions.push({
    status: 'installed',
    message,
    command,
    args,
  });
}

/** 安装或检查运行时依赖。 */
export function setupEnvironment(options: SetupEnvironmentOptions = {}): SetupEnvironmentResult {
  const dryRun = options.dryRun ?? false;
  const hasCommand = options.hasCommand ?? commandExists;
  const pythonHasModule = options.pythonHasModule ?? defaultPythonHasModule;
  const pythonHasPip = options.pythonHasPip ?? defaultPythonHasPip;
  const runCommand = options.runCommand ?? defaultRunCommand;
  const packageName = options.packageName ?? '@tcos/broker-parser';
  const actions: SetupAction[] = [];

  const hasBrew = hasCommand('brew');
  const hasApt = hasCommand('apt-get');

  if (!hasCommand('tcos-parse')) {
    executeOrPlan(actions, dryRun, runCommand, 'install global tcos-parse CLI', 'npm', [
      'install',
      '-g',
      packageName,
    ]);
  } else {
    actions.push({
      status: 'skipped',
      message: 'tcos-parse already available',
    });
  }

  let pythonReady = hasCommand('python3');
  if (!pythonReady) {
    if (hasBrew) {
      executeOrPlan(actions, dryRun, runCommand, 'install python3 via Homebrew', 'brew', [
        'install',
        'python3',
      ]);
      pythonReady = true;
    } else if (hasApt) {
      executeOrPlan(actions, dryRun, runCommand, 'install python3 and pip via apt-get', 'sudo', [
        'apt-get',
        'install',
        '-y',
        'python3',
        'python3-pip',
      ]);
      pythonReady = true;
    } else {
      actions.push({
        status: 'manual',
        message: 'python3 not found; install Python 3 manually',
      });
    }
  } else {
    actions.push({
      status: 'skipped',
      message: 'python3 already available',
    });
  }

  if (pythonReady) {
    if (!pythonHasPip('python3')) {
      executeOrPlan(actions, dryRun, runCommand, 'install pip for python3', 'python3', [
        '-m',
        'ensurepip',
        '--upgrade',
      ]);
    } else {
      actions.push({
        status: 'skipped',
        message: 'python3 pip already available',
      });
    }

    if (!pythonHasModule('python3', 'pdfplumber')) {
      executeOrPlan(actions, dryRun, runCommand, 'install pdfplumber for current user', 'python3', [
        '-m',
        'pip',
        'install',
        '--user',
        'pdfplumber',
      ]);
    } else {
      actions.push({
        status: 'skipped',
        message: 'pdfplumber already available',
      });
    }
  }

  if (!hasCommand('pdftotext')) {
    if (hasBrew) {
      executeOrPlan(actions, dryRun, runCommand, 'install poppler via Homebrew', 'brew', [
        'install',
        'poppler',
      ]);
    } else if (hasApt) {
      executeOrPlan(actions, dryRun, runCommand, 'install poppler via apt-get', 'sudo', [
        'apt-get',
        'install',
        '-y',
        'poppler-utils',
      ]);
    } else {
      actions.push({
        status: 'manual',
        message: 'pdftotext not found; install poppler manually if your system requires it',
      });
    }
  } else {
    actions.push({
      status: 'skipped',
      message: 'pdftotext already available',
    });
  }

  return { actions };
}
