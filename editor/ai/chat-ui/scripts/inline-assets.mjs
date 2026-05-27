/**
 * Post-build script: inline any remaining assets (SVG fonts, etc.)
 * into dist/index.html as base64 data URIs.
 */
import { readFileSync, writeFileSync, readdirSync } from 'fs'
import { join, extname } from 'path'

const distDir = join(import.meta.dirname, '..', 'dist')
const htmlPath = join(distDir, 'index.html')

let html = readFileSync(htmlPath, 'utf-8')

const assets = readdirSync(distDir).filter(f => f !== 'index.html')

for (const asset of assets) {
  const ext = extname(asset).toLowerCase()
  const mimeMap = { '.svg': 'image/svg+xml', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf' }
  const mime = mimeMap[ext] || 'application/octet-stream'

  const data = readFileSync(join(distDir, asset))
  const b64 = data.toString('base64')
  const dataUri = `data:${mime};base64,${b64}`

  // Replace all references to this asset filename in the HTML.
  const escapedName = asset.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`[./]*${escapedName}`, 'g')
  const count = (html.match(regex) || []).length
  if (count > 0) {
    html = html.replace(regex, dataUri)
    console.log(`Inlined ${asset} (${count} references, ${(data.length / 1024).toFixed(1)}KB)`)
  }
}

writeFileSync(htmlPath, html)
console.log(`Final size: ${(Buffer.byteLength(html) / 1024).toFixed(1)}KB`)
