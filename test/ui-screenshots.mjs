import { promises as fs } from 'node:fs'

const tokenUrl = process.argv[2]
const targets = await (await fetch('http://127.0.0.1:9225/json/list')).json()
const page = targets.find((item) => item.type === 'page')
const ws = new WebSocket(page.webSocketDebuggerUrl)
const pending = new Map()
let nextId = 0
ws.onmessage = (event) => {
  const message = JSON.parse(event.data)
  if (message.id !== undefined && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id)
    pending.delete(message.id)
    if (message.error) reject(new Error(JSON.stringify(message.error)))
    else resolve(message.result)
  }
}
await new Promise((resolve, reject) => {
  ws.onopen = resolve
  ws.onerror = reject
})
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++nextId
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? 'eval failed')
  return result.result.value
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function settle() {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const changed = await evaluate(`(() => {
      let changed = false;
      const buttons = [...document.querySelectorAll('button')];
      const close = buttons.find(b => (b.getAttribute('aria-label') || '') === '关闭');
      if (close) { close.click(); changed = true; }
      const open = buttons.find(b => (b.getAttribute('aria-label') || '') === '打开侧边栏');
      if (open) { open.click(); changed = true; }
      const go = buttons.find(b => (b.innerText || '').trim() === '继续');
      if (go) { go.click(); changed = true; }
      return changed;
    })()`)
    if (!changed) break
    await sleep(800)
  }
}

async function sanitize() {
  return evaluate(`(() => {
    const fake = 'session-00000000-0000-4000-8000-000000000000';
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      let value = node.nodeValue || '';
      if (/session-[0-9a-f]{8}-/.test(value)) {
        node.nodeValue = value.replace(/session-[0-9a-f-]{8,}/g, fake);
        value = node.nodeValue;
      }
      if (value.trim() === '未命名') node.nodeValue = value.replace('未命名', '示例会话');
    }
    document.querySelectorAll('.dsd-session-title').forEach((el, i) => {
      el.textContent = ['代码审查记录', '旅行计划'][i] || '示例会话';
    });
    return true;
  })()`)
}

async function screenshot(file) {
  const { data } = await send('Page.captureScreenshot', { format: 'png' })
  await fs.writeFile(file, Buffer.from(data, 'base64'))
}

await send('Page.enable')
await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', {
  width: 1100,
  height: 760,
  deviceScaleFactor: 1,
  mobile: false,
})

// 1. Settings → Session management.
await send('Page.navigate', { url: tokenUrl })
await sleep(8500)
await settle()
await evaluate(`(() => {
  const btn = [...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') || '') === '账号菜单');
  if (btn) btn.click();
  return true;
})()`)
await sleep(700)
await evaluate(`(() => {
  const item = [...document.querySelectorAll('[role="menuitem"]')].find(el => /设置/.test(el.innerText || ''));
  if (item) item.click();
  return true;
})()`)
await sleep(1400)
await evaluate(`(() => {
  const item = [...document.querySelectorAll('button, a')].find(el => (el.innerText || '').trim().startsWith('会话管理'));
  if (item) item.click();
  return true;
})()`)
await sleep(1200)
await sanitize()
await sleep(300)
await screenshot('D:/deepseek/dsh-safe-session-delete/assets/screenshot-settings.png')

// 2. Session row menu.
await send('Page.navigate', { url: tokenUrl })
await sleep(7000)
await settle()
await evaluate(`(() => {
  const btn = [...document.querySelectorAll('button')].find(b => /会话.*操作/.test(b.getAttribute('aria-label') || ''));
  if (btn) btn.click();
  return true;
})()`)
await sleep(900)
await sanitize()
await sleep(300)
await screenshot('D:/deepseek/dsh-safe-session-delete/assets/screenshot-menu.png')
console.log('screenshots saved')
ws.close()
