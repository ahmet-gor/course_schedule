const { app, BrowserWindow } = require('electron')
const { join } = require('path')
const { mkdtempSync } = require('fs')
const { tmpdir } = require('os')

process.env.SMOKE = '1'
app.setPath('userData', mkdtempSync(join(tmpdir(), 'cs-smoke-')))

require(join(__dirname, '..', 'out', 'main', 'index.js'))

app.whenReady().then(async () => {
  await new Promise((r) => setTimeout(r, 2500))
  const win = BrowserWindow.getAllWindows()[0]
  if (!win) {
    console.log(JSON.stringify({ ok: false, error: 'no window' }))
    app.quit()
    return
  }
  const call = (expr) => win.webContents.executeJavaScript(expr)

  const onboardTr = await call(`document.querySelector('h1')?.textContent.trim()`)

  await call(`localStorage.setItem('locale', 'en'); location.reload()`)
  await new Promise((r) => setTimeout(r, 1500))
  const onboardEn = await call(`document.querySelector('h1')?.textContent.trim()`)

  await call(`localStorage.setItem('locale', 'tr'); location.reload()`)
  await new Promise((r) => setTimeout(r, 1500))

  await call(
    `(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('Örnek verileri')); if (b) b.click(); return !!b })()`
  )
  await new Promise((r) => setTimeout(r, 2500))
  const navTr = await call(
    `(() => [...document.querySelectorAll('aside nav button')].map(b => b.textContent.trim()))()`
  )
  const sidebarCombos = await call(
    `(() => [...document.querySelectorAll('aside [role=combobox]')].length)()`
  )
  const sidebarNativeSelects = await call(
    `(() => [...document.querySelectorAll('aside select')].length)()`
  )

  await call(`localStorage.setItem('theme', 'dark'); location.reload()`)
  await new Promise((r) => setTimeout(r, 1500))
  const darkClass = await call(`document.documentElement.classList.contains('dark')`)
  const darkBg = await call(`getComputedStyle(document.body).backgroundColor`)

  await call(`localStorage.setItem('theme', 'light'); location.reload()`)
  await new Promise((r) => setTimeout(r, 1500))
  const lightClass = await call(`document.documentElement.classList.contains('dark')`)
  const lightBg = await call(`getComputedStyle(document.body).backgroundColor`)

  await call(`localStorage.setItem('theme', 'system'); location.reload()`)
  await new Promise((r) => setTimeout(r, 1500))

  const term = { id: await call(`window.api.terms.list().then(l => l[0].id)`) }

  const data = await call(`window.api.schedule.getData(${term.id})`)
  const unscheduled = data.sections.filter((s) => s.meetings.length === 0)
  const target = unscheduled[0]
  await call(
    `window.api.schedule.apply(${term.id}, { "${target.id}": { days: [2,4], start: 600, end: 675, roomId: ${data.rooms[0].id}, instructorId: ${data.instructors[1].id} } })`
  )
  const after = await call(`window.api.schedule.getData(${term.id})`)
  const moved = after.sections.find((s) => s.id === target.id)

  const pageErrors = []
  const consoleErrors = new Set()
  win.webContents.on('render-process-gone', (_e, details) => pageErrors.push(details.reason))
  win.webContents.on('console-message', (_e, level, message) => {
    if (level >= 2 && /Uncaught|Error: Rendered|Minified React error/i.test(message)) pageErrors.push(message)
    if (level >= 3 && !message.includes('Autofill')) consoleErrors.add(message.slice(0, 160))
  })

  await call(
    `(() => { const b = [...document.querySelectorAll('aside nav button')].find(x => x.textContent.trim() === 'Oluştur'); if (b) b.click(); return !!b })()`
  )
  await new Promise((r) => setTimeout(r, 2000))
  const generateHeading = await call(
    `(() => { const h = [...document.querySelectorAll('h1')].map(x => x.textContent.trim()); return h.join(' | ') })()`
  )
  const generateCheckboxCount = await call(`document.querySelectorAll('[role=checkbox]').length`)

  const termId = term.id
  await call(`window.api.terms.update(${termId}, { weeks: 4, startDate: '2026-09-28', breakWeeks: [2] })`)
  await call(
    `window.api.overrides.create({ sectionId: ${target.id}, week: 3, kind: 'cancel', fromDay: 2, toDay: null, start: null, end: null, roomId: null, instructorId: null, note: '' })`
  )
  let weekData = await call(`window.api.schedule.getData(${termId})`)
  const afterCancel = { weeks: weekData.term.weeks, breaks: weekData.term.breakWeeks, overrides: weekData.overrides.length }
  await call(
    `window.api.schedule.resolveWeek(${termId}, 3, { "${target.id}": { days: [1, 3], start: 600, end: 675, roomId: ${data.rooms[0].id}, instructorId: ${data.instructors[1].id} } })`
  )
  weekData = await call(`window.api.schedule.getData(${termId})`)
  const resolvedKinds = weekData.overrides
    .filter((o) => o.week === 3)
    .map((o) => o.kind)
    .sort()
    .join(',')

  await call(
    `(() => { const b = [...document.querySelectorAll('aside nav button')].find(x => x.textContent.trim() === 'Ders Programları'); if (b) b.click(); return !!b })()`
  )
  await new Promise((r) => setTimeout(r, 1200))
  const weekCombos = await call(`[...document.querySelectorAll('main [role=combobox]')].length`)
  await call(
    `(() => { const trigger = document.querySelector('main [role=combobox]'); if (!trigger) return false; trigger.focus(); trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })); return true })()`
  )
  await new Promise((r) => setTimeout(r, 700))
  const weekPicked = await call(
    `(() => {
      const opts = [...document.querySelectorAll('[role=option]')]
      const o = opts.find(x => x.textContent.includes('W03'))
      if (!o) return false
      o.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }))
      o.click()
      return true
    })()`
  )
  await new Promise((r) => setTimeout(r, 900))
  const movedBadgeCount = await call(
    `(() => { const blocks = [...document.querySelectorAll('main button')]; return blocks.filter(b => b.textContent.includes('⤴')).length })()`
  )
  const dateSublabel = await call(
    `(() => { const headers = [...document.querySelectorAll('main .sticky')]; return headers.some(h => /\\d{1,2} (Eki|Eyl|Kas)/.test(h.textContent)) })()`
  )

  const dragTest = await call(`(async () => {
    const block = [...document.querySelectorAll('main button.cursor-grab')][0]
    if (!block) return { found: false }
    const r = block.getBoundingClientRect()
    const col = block.closest('.relative')
    if (!col) return { found: false }
    const cr = col.getBoundingClientRect()
    const startX = r.left + r.width / 2
    const startY = r.top + Math.min(10, r.height / 2)
    const endX = cr.left + cr.width * 2.5
    const endY = cr.top + 150
    block.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, clientX: startX, clientY: startY }))
    await new Promise((res) => setTimeout(res, 80))
    window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, cancelable: true, clientX: startX + 10, clientY: startY + 6 }))
    await new Promise((res) => setTimeout(res, 80))
    window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, cancelable: true, clientX: endX, clientY: endY }))
    await new Promise((res) => setTimeout(res, 200))
    const ghost = !!document.querySelector('.grid-drag-ghost')
    const placeholder = !!document.querySelector('.grid-drop-placeholder')
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, clientX: endX, clientY: endY }))
    return { found: true, ghost, placeholder }
  })()`)
  await new Promise((r) => setTimeout(r, 1000))
  const postDragData = await call(`window.api.schedule.getData(${termId})`)
  const overridesAfterDrag = postDragData.overrides.filter((o) => o.week === 3).length

  await call(
    `(() => { const trigger = document.querySelector('main [role=combobox]'); trigger.focus(); trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })); return true })()`
  )
  await new Promise((r) => setTimeout(r, 700))
  const patternPicked = await call(
    `(() => { const o = [...document.querySelectorAll('[role=option]')].find(x => x.textContent.includes('Şablon')); if (!o) return false; o.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true })); o.click(); return true })()`
  )
  await new Promise((r) => setTimeout(r, 900))
  const laneLayout = await call(`(() => {
    const cols = [...document.querySelectorAll('main .relative')]
    const find = (label) => {
      for (const col of cols) {
        const b = [...col.querySelectorAll('button')].find(x => x.textContent.includes(label))
        if (b) return { bw: b.getBoundingClientRect().width, cw: col.getBoundingClientRect().width }
      }
      return null
    }
    const alone = find('MAT211-A')
    const overlapped = find('CSE201-A')
    return {
      aloneRatio: alone ? +(alone.bw / alone.cw).toFixed(2) : null,
      overlappedRatio: overlapped ? +(overlapped.bw / overlapped.cw).toFixed(2) : null
    }
  })()`)

  const overwriteChecks = {}
  await call(
    `window.api.overrides.create({ sectionId: ${target.id}, week: 1, kind: 'extra', fromDay: null, toDay: 5, start: 600, end: 675, roomId: ${data.rooms[0].id}, instructorId: null, note: '' })`
  )
  overwriteChecks.applyCleared = await call(
    `window.api.schedule.apply(${termId}, { "${target.id}": { days: [2,4], start: 600, end: 675, roomId: ${data.rooms[0].id}, instructorId: ${data.instructors[1].id} } })`
  )
  const afterApply = await call(`window.api.schedule.getData(${termId})`)
  overwriteChecks.targetOverridesAfterApply = afterApply.overrides.filter((o) => o.sectionId === target.id).length
  const unsched = afterApply.sections.find((s) => s.meetings.length === 0)
  if (unsched) {
    await call(
      `window.api.schedule.resolveWeek(${termId}, 9, { "${unsched.id}": { days: [3], start: 600, end: 675, roomId: ${data.rooms[0].id}, instructorId: ${data.instructors[1].id} } })`
    )
  }
  const afterExtend = await call(`window.api.schedule.getData(${termId})`)
  overwriteChecks.weeksAfterWeek9 = afterExtend.term.weeks
  overwriteChecks.unschedOverrideKinds = unsched
    ? afterExtend.overrides
        .filter((o) => o.sectionId === unsched.id)
        .map((o) => o.kind)
        .join(',')
    : null

  const tableOverflow = {}
  for (const navLabel of ['Şubeler', 'Dersler', 'Öğretim Üyeleri', 'Derslikler']) {
    await call(
      `(() => { const b = [...document.querySelectorAll('aside nav button')].find(x => x.textContent.trim() === '${navLabel}'); if (b) b.click(); return !!b })()`
    )
    await new Promise((r) => setTimeout(r, 800))
    tableOverflow[navLabel] = await call(
      `(() => {
        const tds = [...document.querySelectorAll('td')].filter(td => td.querySelectorAll('button').length > 1)
        const overflowing = tds.filter(td => td.scrollWidth > td.clientWidth + 1).length
        const wrapped = tds.filter(td => {
          const rects = [...td.querySelectorAll('button')].map(b => b.getBoundingClientRect())
          const tops = [...new Set(rects.map(r => Math.round(r.top / 5)))]
          return tops.length > 1
        }).length
        return { cells: tds.length, overflowing, wrapped }
      })()`
    )
  }

  await call(
    `(() => { const b = [...document.querySelectorAll('aside nav button')].find(x => x.textContent.trim() === 'Ayarlar'); if (b) b.click(); return !!b })()`
  )
  await new Promise((r) => setTimeout(r, 800))
  const settingsCombos = await call(
    `(() => {
      const combos = [...document.querySelectorAll('main [role=combobox]')].map(c => c.textContent.trim())
      return combos
    })()`
  )

  console.log(
    JSON.stringify({
      ok: true,
      onboardTr,
      onboardEn,
      navTr,
      sidebarCombos,
      sidebarNativeSelects,
      settingsCombos,
      theme: { darkClass, darkBg, lightClass, lightBg },
      sections: data.sections.length,
      targetMeetings: moved.meetings.length,
      targetRoom: moved.roomName,
      generateHeading,
      generateCheckboxCount,
      weeks: { afterCancel, resolvedKinds, weekCombos, weekPicked, movedBadgeCount, dateSublabel, dragTest, overridesAfterDrag, patternPicked, laneLayout, overwriteChecks },
      tableOverflow,
      pageErrors,
      consoleErrors: [...consoleErrors]
    })
  )
  app.quit()
})
