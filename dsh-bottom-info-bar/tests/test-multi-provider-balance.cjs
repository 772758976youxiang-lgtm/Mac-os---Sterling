// 多平台余额适配：路由元数据、端点选择、响应解析与失败快照隔离。
// 用法：node tests/test-multi-provider-balance.cjs
const fs = require('fs')

const hostSrc = fs.readFileSync(__dirname + '/../plugin/src/host.js', 'utf8')
const clientSrc = fs.readFileSync(__dirname + '/../plugin/src/client-bundle.js', 'utf8')

function extractFn(name) {
  const start = hostSrc.indexOf('function ' + name)
  if (start < 0) throw new Error('未找到 function ' + name)
  let depth = 0, i = start, inStr = null
  while (i < hostSrc.length) {
    const c = hostSrc[i]
    if (inStr) {
      if (c === '\\') { i += 2; continue }
      if (c === inStr) inStr = null
    } else if (c === '"' || c === "'" || c === '`') {
      inStr = c
    } else if (c === '{') depth++
    else if (c === '}') { depth--; if (depth === 0) break }
    i++
  }
  return eval('(' + hostSrc.slice(start, i + 1) + ')')
}

function extractConst(name) {
  const match = hostSrc.match(new RegExp('const ' + name + ' = (\\[[^\\n]*?\\]|\\{[^\\n]*?\\}|[^\\n]+?)(?:\\s*//[^\\n]*)?\\n'))
  if (!match) throw new Error('未找到 const ' + name)
  return eval('(' + match[1] + ')')
}

const SUBSCRIPTION_PROVIDERS = extractConst('SUBSCRIPTION_PROVIDERS')
const readPath = extractFn('readPath')
const parseCustomBalanceAdapters = extractFn('parseCustomBalanceAdapters')
const balanceProfileForRoute = extractFn('balanceProfileForRoute')
const normalizeBalanceEndpoint = extractFn('normalizeBalanceEndpoint')
const resolveBalanceAdapter = extractFn('resolveBalanceAdapter')
const parseBalanceResponse = extractFn('parseBalanceResponse')
const mergeBalanceResult = extractFn('mergeBalanceResult')

let pass = 0, fail = 0
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) { pass++; console.log('PASS  ' + label + ' → ' + JSON.stringify(actual)) }
  else { fail++; console.log('FAIL  ' + label + ' → 期望 ' + JSON.stringify(expected) + '，实际 ' + JSON.stringify(actual)) }
}

const settings = {
  'llm-deepseek': { baseURL: 'https://api.deepseek.com', apiKeyEnv: 'DEEPSEEK_API_KEY' },
  'llm-pi-ai': {
    providers: {
      a: { displayName: 'ChatGPT', baseURL: 'https://rayplus.site', apiKeyEnv: 'A_API_KEY' },
      d: { displayName: 'image', baseURL: 'https://rayplus.site/v1', apiKeyEnv: 'D_API_KEY' },
      unknown: { displayName: 'Unknown', baseURL: 'https://unknown.example/v1', apiKeyEnv: 'UNKNOWN_KEY' },
    },
  },
}

check('读取嵌套字段', readPath({ account: { remaining: '12.5' } }, 'account.remaining'), '12.5')
check('缺失字段返回 undefined', readPath({}, 'account.remaining'), undefined)

const custom = parseCustomBalanceAdapters(JSON.stringify({
  unknown: {
    endpoint: 'https://billing.example/account',
    credential: 'UNKNOWN_KEY',
    parser: 'paths',
    balancePath: 'account.remaining',
    currency: 'EUR',
  },
}))
check('自定义适配器声明可解析', custom.unknown, {
  endpoint: 'https://billing.example/account',
  credential: 'UNKNOWN_KEY',
  parser: 'paths',
  balancePath: 'account.remaining',
  currency: 'EUR',
})
check('非法自定义声明失败关闭', parseCustomBalanceAdapters('{bad json'), {})

check('读取 pi-ai 路由元数据', balanceProfileForRoute('a', settings), settings['llm-pi-ai'].providers.a)
check('读取 DeepSeek 路由元数据', balanceProfileForRoute('deepseek-official', settings), settings['llm-deepseek'])
check('未知路由无元数据', balanceProfileForRoute('missing', settings), null)

check('Rayplus 根地址归一化', normalizeBalanceEndpoint('https://rayplus.site', '/v1/usage'), 'https://rayplus.site/v1/usage')
check('Rayplus /v1 地址不重复', normalizeBalanceEndpoint('https://rayplus.site/v1', '/v1/usage'), 'https://rayplus.site/v1/usage')

check('DeepSeek 自动适配', resolveBalanceAdapter('deepseek-official', balanceProfileForRoute('deepseek-official', settings), {}), {
  kind: 'deepseek', endpoint: 'https://api.deepseek.com/user/balance', credential: 'DEEPSEEK_API_KEY', parser: 'deepseek', displayName: 'DeepSeek',
})
check('Rayplus 文本路由自动适配', resolveBalanceAdapter('a', balanceProfileForRoute('a', settings), {}), {
  kind: 'rayplus', endpoint: 'https://rayplus.site/v1/usage', credential: 'A_API_KEY', parser: 'rayplus', displayName: 'ChatGPT',
})
check('Rayplus 图片路由使用自己的凭据', resolveBalanceAdapter('d', balanceProfileForRoute('d', settings), {}), {
  kind: 'rayplus', endpoint: 'https://rayplus.site/v1/usage', credential: 'D_API_KEY', parser: 'rayplus', displayName: 'image',
})
check('订阅路由不进入余额适配', resolveBalanceAdapter('chatgpt', null, {}), null)
check('未知平台不伪造余额', resolveBalanceAdapter('unknown', balanceProfileForRoute('unknown', settings), {}), null)
check('显式自定义配置优先', resolveBalanceAdapter('unknown', balanceProfileForRoute('unknown', settings), custom), {
  kind: 'custom', endpoint: 'https://billing.example/account', credential: 'UNKNOWN_KEY', parser: 'paths', balancePath: 'account.remaining', currency: 'EUR', displayName: 'Unknown',
})

check('DeepSeek 响应解析', parseBalanceResponse({ parser: 'deepseek' }, {
  balance_infos: [{ currency: 'CNY', total_balance: '53.23', granted_balance: '1.00', topped_up_balance: '52.23' }],
}), { currency: 'CNY', total: 53.23, granted: 1, toppedUp: 52.23 })
check('Rayplus 响应解析', parseBalanceResponse({ parser: 'rayplus' }, {
  unit: 'USD', balance: 451.8, remaining: 450.5,
}), { currency: 'USD', total: 450.5, granted: 0, toppedUp: 450.5 })
check('自定义路径响应解析', parseBalanceResponse(custom.unknown, {
  account: { remaining: '18.75' },
}), { currency: 'EUR', total: 18.75, granted: 0, toppedUp: 18.75 })
check('非数字余额拒绝解析', parseBalanceResponse(custom.unknown, {
  account: { remaining: 'unknown' },
}), null)

const previous = { data: { currency: 'USD', total: 10 }, fetchedAt: 123, error: null }
check('失败只保留该路由旧快照', mergeBalanceResult(previous, { error: { kind: 'http', message: 'HTTP 500' } }, 456), {
  data: previous.data, fetchedAt: 123, error: { kind: 'http', message: 'HTTP 500' },
})
check('成功替换快照', mergeBalanceResult(previous, { data: { currency: 'USD', total: 20 } }, 456), {
  data: { currency: 'USD', total: 20 }, fetchedAt: 456, error: null,
})

check('client 未配置提示使用路由 credential 引用', clientSrc.includes("'未配置 ' + credential + ' → 设置→模型 填写'"), true)
check('client 明确展示不支持余额查询', clientSrc.includes('该平台暂不支持余额查询'), true)
check('client 不再硬编码 DeepSeek 未配置提示', clientSrc.includes('未配置 DEEPSEEK_API_KEY → 设置→模型 填写'), false)

console.log('\n结果：' + pass + ' PASS / ' + fail + ' FAIL')
process.exit(fail === 0 ? 0 : 1)
