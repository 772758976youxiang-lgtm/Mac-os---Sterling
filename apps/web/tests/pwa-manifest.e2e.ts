import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { expect, it } from 'vitest'

const DIST_ROOT = fileURLToPath(new URL('../dist', import.meta.url))

it('ships install metadata with the built web application', async () => {
  const index = await readFile(join(DIST_ROOT, 'index.html'), 'utf8')
  expect(index).toContain('<link rel="manifest" href="/manifest.webmanifest" />')
  expect(index).toContain('<link rel="icon" type="image/png" href="/branding/sterling-rose-512.png" />')

  const manifest: unknown = JSON.parse(await readFile(join(DIST_ROOT, 'manifest.webmanifest'), 'utf8'))
  expect(manifest).toEqual({
    id: '/',
    name: 'Sterling Harness',
    short_name: 'Sterling',
    start_url: '/',
    scope: '/',
    display: 'fullscreen',
    icons: [
      {
        src: '/branding/sterling-rose-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any maskable',
      },
      {
        src: '/branding/sterling-rose-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any maskable',
      },
    ],
  })
})

it('ships the supplied brand artwork at the PWA icon sizes', async () => {
  const icon192 = await readFile(join(DIST_ROOT, 'branding', 'sterling-rose-192.png'))
  const icon512 = await readFile(join(DIST_ROOT, 'branding', 'sterling-rose-512.png'))
  const pngSignature = '89504e470d0a1a0a'

  expect(icon192.subarray(0, 8).toString('hex')).toBe(pngSignature)
  expect(icon512.subarray(0, 8).toString('hex')).toBe(pngSignature)
})
