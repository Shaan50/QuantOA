/**
 * Drives the running dev server with Playwright: smoke-tests every screen and
 * captures the README screenshots into docs/screenshots/.
 *
 *   npm run dev -- --port 5199 &
 *   npx tsx scripts/seed-demo.ts > /tmp/demo.json
 *   npx tsx scripts/screenshots.ts /tmp/demo.json
 */
import { readFileSync, mkdirSync } from 'node:fs'
import { chromium, type Page } from 'playwright'

const BASE = process.env.BASE_URL ?? 'http://localhost:5199/'
const OUT = 'docs/screenshots'
const demoPath = process.argv[2]
mkdirSync(OUT, { recursive: true })

const demo = demoPath ? (JSON.parse(readFileSync(demoPath, 'utf8')) as Record<string, unknown>) : null
const errors: string[] = []

/** Answer the current question correctly via the dev-only engine handle. */
async function answerCorrectly(page: Page) {
  await page.evaluate(() => {
    const e = (window as unknown as { __quantoa: { current: { answer: Record<string, unknown> } } }).__quantoa
    const a = e.current.answer
    const s = a.type === 'fraction' ? `${a.num}/${a.den}` : a.type === 'multiple-choice' ? String((a.correctIndex as number) + 1) : String(a.value)
    ;(window as unknown as { __answer: string }).__answer = s
  })
  const ans = await page.evaluate(() => (window as unknown as { __answer: string }).__answer)
  const isMC = await page.evaluate(() => (window as unknown as { __quantoa: { current: { answer: { type: string } } } }).__quantoa.current.answer.type === 'multiple-choice')
  if (isMC) await page.keyboard.press(ans)
  else {
    await page.fill('input[aria-label="Answer"]', ans)
    await page.keyboard.press('Enter')
  }
}

async function shot(page: Page, name: string, fullPage = false) {
  await page.waitForTimeout(900)
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage })
  console.log('📸', name)
}

async function main() {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: 'dark' })
  if (demo) {
    await ctx.addInitScript((data: Record<string, unknown>) => {
      if (localStorage.getItem('quantoa:seeded')) return
      for (const [k, v] of Object.entries(data)) if (k !== 'version') localStorage.setItem(`quantoa:${k}`, JSON.stringify(v))
      localStorage.setItem('quantoa:seeded', '1')
    }, demo)
  }
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`))

  await page.goto(BASE)
  await page.waitForSelector('text=Game modes')
  await shot(page, '01-home')

  await page.goto(`${BASE}#/mode/oa`)
  await page.waitForSelector('text=Format')
  await shot(page, '02-oa-setup')

  // Sprint: answer a few, then capture mid-question with a typed answer.
  await page.goto(`${BASE}#/mode/sprint`)
  await page.waitForSelector('text=Duration')
  await page.keyboard.press('Enter')
  await page.waitForFunction(() => (window as unknown as { __quantoa?: { current?: unknown; phase: string } }).__quantoa?.phase === 'question')
  for (let i = 0; i < 4; i++) {
    await answerCorrectly(page)
    await page.waitForFunction(() => (window as unknown as { __quantoa: { phase: string } }).__quantoa.phase === 'question')
    await page.waitForTimeout(150)
  }
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur?.())
  await shot(page, '03-player')
  // Wrong answer feedback
  const isText = await page.locator('input[aria-label="Answer"]').count()
  if (isText) {
    await page.fill('input[aria-label="Answer"]', '42')
    await page.keyboard.press('Enter')
  } else await page.keyboard.press('1')
  await page.waitForTimeout(150)
  await shot(page, '04-feedback')
  await page.waitForTimeout(1600)
  // End the sprint and look at results
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  await page.keyboard.press('Enter')
  await page.waitForSelector('text=Every question')
  await shot(page, '05-results', true)

  // Zen mode with full explanation (probability)
  await page.goto(`${BASE}#/mode/zen?cat=probability`)
  await page.waitForSelector('text=Subcategories')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(500)
  const zenText = await page.locator('input[aria-label="Answer"]').count()
  if (zenText) {
    await page.fill('input[aria-label="Answer"]', '1/7')
    await page.keyboard.press('Enter')
  } else await page.keyboard.press('2')
  await page.waitForSelector('text=Solution')
  await shot(page, '06-zen-explanation')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(300)

  // Brainteaser with a hint
  await page.goto(`${BASE}#/mode/drill?cat=brainteasers`)
  await page.waitForSelector('text=Subcategories')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(400)
  await page.keyboard.press('?')
  await page.waitForTimeout(250)
  await shot(page, '07-brainteaser-hint')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(300)

  // Full OA section break
  await page.goto(`${BASE}#/mode/oa`)
  await page.click('text=Full OA · 4 sections')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(300)
  await page.evaluate(() => {
    const e = (window as unknown as { __quantoa: { sectionTimeUp(n: number): void } }).__quantoa
    e.sectionTimeUp(Date.now())
  })
  await page.keyboard.press('Tab') // nudge a re-render
  await page.waitForTimeout(300)
  await page.keyboard.press('Escape')
  await page.keyboard.press('Enter')

  await page.goto(`${BASE}#/dashboard`)
  await page.waitForSelector('text=Weak-spots heatmap')
  await shot(page, '08-dashboard', true)

  // Market making: play two rounds
  await page.goto(`${BASE}#/market`)
  await page.waitForSelector('text=How it works')
  await shot(page, '09-market-picker')
  await page.click('text=Sum of three dice')
  await page.waitForSelector('text=Your quote')
  for (const [b, a] of [
    ['9.5', '11.5'],
    ['10', '12'],
  ]) {
    await page.fill('input[aria-label="Bid"]', b)
    await page.fill('input[aria-label="Ask"]', a)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(250)
  }
  await shot(page, '10-market-game')
  await page.fill('input[aria-label="Bid"]', '10')
  await page.fill('input[aria-label="Ask"]', '11.5')
  await page.keyboard.press('Enter')
  await page.waitForSelector('text=Spread penalty')
  await shot(page, '11-market-settled', true)

  await page.goto(`${BASE}#/daily`)
  await page.waitForSelector("text=Today's set")
  await shot(page, '12-daily')

  await page.goto(`${BASE}#/review`)
  await page.waitForSelector('text=Queue')
  await shot(page, '13-review')

  await page.goto(`${BASE}#/settings`)
  await page.waitForSelector('text=Your data')
  await shot(page, '14-settings')

  // Light theme + mobile
  await page.goto(BASE)
  await page.click('button[aria-label="Toggle theme"] >> nth=-1')
  await page.waitForTimeout(300)
  await shot(page, '15-home-light')
  await page.click('button[aria-label="Toggle theme"] >> nth=-1')

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'dark', isMobile: true })
  if (demo) await mobile.addInitScript((data: Record<string, unknown>) => {
    if (localStorage.getItem('quantoa:seeded')) return
    for (const [k, v] of Object.entries(data)) if (k !== 'version') localStorage.setItem(`quantoa:${k}`, JSON.stringify(v))
    localStorage.setItem('quantoa:seeded', '1')
  }, demo)
  const m = await mobile.newPage()
  m.on('pageerror', (e) => errors.push(`mobile pageerror: ${e.message}`))
  await m.goto(BASE)
  await m.waitForSelector('text=Game modes')
  await shot(m, '16-mobile-home')
  await m.goto(`${BASE}#/mode/drill?cat=mental-math`)
  await m.waitForSelector('text=Subcategories')
  await m.click('button:has-text("Start")')
  await m.waitForTimeout(500)
  await shot(m, '17-mobile-player')
  const hScroll = await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
  if (hScroll) errors.push('mobile: horizontal scroll on player')

  await browser.close()
  if (errors.length) {
    console.error('\n❌ Errors:\n' + errors.join('\n'))
    process.exit(1)
  }
  console.log('\n✅ All screens rendered without errors')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
