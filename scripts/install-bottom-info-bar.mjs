// 自动安装 dsh-bottom-info-bar 到 web profile（幂等）。
// 挂载于根 package.json 的 postinstall：新机器 clone 后执行 pnpm install 即自动完成插件构建与注册，
// 无需手动运行 dsh-bottom-info-bar/install.sh。
// 跳过开关：DSH_SKIP_PLUGIN_AUTOINSTALL=1。
// 尽力而为：环境不满足或安装失败时打印提示并以 0 退出，不阻断 pnpm install 主流程。
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))
const PLUGIN_DIR = join(REPO_ROOT, 'dsh-bottom-info-bar', 'plugin')
// 与 dsh 的 resolveDshHome 保持一致：优先 DSH_HOME 环境变量，支持 ~ 前缀，默认 ~/.dsh
const dshHome = (() => {
  const fromEnv = process.env.DSH_HOME
  const selected = fromEnv !== undefined && fromEnv.trim().length > 0 ? fromEnv : join(homedir(), '.dsh')
  return selected === '~' ? homedir() : selected.startsWith('~/') || selected.startsWith('~\\') ? join(homedir(), selected.slice(2)) : selected
})()
const PROFILE_MANIFEST = join(dshHome, 'profiles', 'web', 'package.json')
const NAME = '[dsh-bottom-info-bar:auto]'
const info = (message) => console.log(`${NAME} ${message}`)
const warn = (message) => console.warn(`${NAME} 警告: ${message}`)

if (process.env.DSH_SKIP_PLUGIN_AUTOINSTALL === '1') {
  info('已通过 DSH_SKIP_PLUGIN_AUTOINSTALL=1 跳过')
  process.exit(0)
}

if (!existsSync(PROFILE_MANIFEST)) {
  info('跳过：本机无 dsh web profile（未使用过 dsh web；之后使用过再 pnpm install 即会自动安装）')
  process.exit(0)
}

// 幂等：插件已注册到 web profile 则跳过
try {
  const manifest = JSON.parse(readFileSync(PROFILE_MANIFEST, 'utf8'))
  if ((manifest.dsh?.profile?.bundles ?? []).includes('dsh-bottom-info-bar')) {
    info('已注册到 web profile，跳过')
    process.exit(0)
  }
} catch {
  // profile manifest 解析失败时继续尝试注册，交由 dsh plugin 给出明确诊断
}

// 构建产物缺失时先构建（plugin/lib/ 不入 git）
if (!existsSync(join(PLUGIN_DIR, 'lib', 'index.js'))) {
  info('构建插件产物…')
  const build = spawnSync(process.execPath, [join(PLUGIN_DIR, 'scripts', 'build.mjs')], { stdio: 'inherit' })
  if (build.status !== 0) {
    warn(`插件构建失败（exit ${build.status}），请手动执行：cd dsh-bottom-info-bar && ./install.sh`)
    process.exit(0)
  }
}

// 注册（使用仓库内的 dsh CLI；其内部通过 pnpm 安装，需要 pnpm 在 PATH 中）
info('注册到 web profile…')
const register = spawnSync(process.execPath, [
  '--import',
  'tsx/esm',
  join(REPO_ROOT, 'apps', 'cli', 'src', 'bin.ts'),
  'plugin',
  '--profile',
  'web',
  'add',
  PLUGIN_DIR,
], { stdio: 'inherit' })
if (register.status !== 0) {
  warn(`插件注册失败（exit ${register.status}），请手动执行：cd dsh-bottom-info-bar && ./install.sh（确认 pnpm 已安装并在 PATH 中）`)
  process.exit(0)
}

info('安装完成 ✔ 重启 dsh web 后生效')
