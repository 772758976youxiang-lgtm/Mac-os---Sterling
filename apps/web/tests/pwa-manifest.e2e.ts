import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { expect, it } from 'vitest'

const DIST_ROOT = fileURLToPath(new URL('../dist', import.meta.url))

it('ships install metadata with the built web application', async () => {
  const index = await readFile(join(DIST_ROOT, 'index.html'), 'utf8')
  expect(index).toContain('<link rel="manifest" href="/manifest.webmanifest" />')

  const manifest: unknown = JSON.parse(await readFile(join(DIST_ROOT, 'manifest.webmanifest'), 'utf8'))
  expect(manifest).toEqual({
    id: '/',
    name: 'Sterling Harness',
    short_name: 'Sterling',
    start_url: '/',
    scope: '/',
    display: 'fullscreen',
    icons: [{
      src: '/sterling-icon.png',
      sizes: '1254x1254',
      type: 'image/png',
      purpose: 'any',
    }],
  })
})

it('ships the Sterling app icon and favicon alias', async () => {
  const icon = await readFile(join(DIST_ROOT, 'sterling-icon.png'))
  expect(icon.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))

  const favicon = await readFile(join(DIST_ROOT, 'favicon.svg'), 'utf8')
  expect(favicon).toContain('sterling-icon.png')
})
