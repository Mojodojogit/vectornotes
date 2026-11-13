// Prüft alle <video> der Website, damit ein Video nicht wieder still im Browser hängen bleibt.
// Ordner beginnt mit „_“: GitHub Pages (Jekyll) veröffentlicht ihn nicht.
//
//   node _werkzeuge/videos-pruefen.mjs              Kodierung + Markup (lokal, vor dem Commit)
//   VN_BASIS=http://localhost:8792 node _werkzeuge/videos-pruefen.mjs --abspielen   Wiedergabe gegen lokalen Server
//   node _werkzeuge/videos-pruefen.mjs --live       zusätzlich: Pages-Build abwarten, Header live prüfen,
//                                                   Wiedergabe in Chrome und Edge (Desktop + Handy-Emulation)
//
// Hintergrund (07.11. und 13.11.): Videos aus JPEG-Einzelbildern landen ohne Umwandlung im Vollbereich (yuvj420p, pc).
// Chrome am Desktop meldet dafür PIPELINE_ERROR_DECODE und bleibt beim ersten Bild stehen. Darum hier Pflicht:
// yuv420p im TV-Bereich, BT.709, quadratische Pixel, Start bei 0; MP4 (H.264) als erste Quelle mit codecs-Angabe.
// Umwandeln: -vf "fps=30:start_time=0,scale=W:H:in_range=full:out_range=limited:out_color_matrix=bt709,format=yuv420p,setsar=1"
//            -color_range tv -colorspace bt709 -color_primaries bt709 -color_trc bt709
import { execFileSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const WURZEL = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '..')
const BASIS = process.env.VN_BASIS || 'https://vectornotes.de'
const REPO = 'Mojodojogit/vectornotes'
const FFMPEG = process.env.FFMPEG || 'C:/Users/Dan/Tools/ffmpeg/ffmpeg.exe'
const live = process.argv.includes('--live')
const nurAbspielen = process.argv.includes('--abspielen') // z. B. VN_BASIS=http://localhost:8792 vor dem Push
const fehler = []
const melde = (ok, text) => { console.log((ok ? 'ok   ' : 'FEHLER ') + text); if (!ok) fehler.push(text) }
const still = { windowsHide: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }

// ---------- 1) Seiten und Videos einsammeln
const seiten = []
;(function such(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name.startsWith('_') || e.name.startsWith('.')) continue
    const p = path.join(d, e.name)
    if (e.isDirectory()) such(p)
    else if (e.name.endsWith('.html')) seiten.push(p)
  }
})(WURZEL)
const videos = [] // { seite, url, quellen: [{src, type}] }
for (const p of seiten) {
  const html = fs.readFileSync(p, 'utf8')
  const url = '/' + path.relative(WURZEL, p).replace(/\\/g, '/').replace(/index\.html$/, '')
  for (const m of html.matchAll(/<video\b[^>]*>([\s\S]*?)<\/video>/g)) {
    const quellen = [...m[1].matchAll(/<source\s+src="([^"]+)"\s+type="([^"]+)"/g)].map(q => ({ src: q[1], type: q[2] }))
    videos.push({ seite: url, quellen, tag: m[0].slice(0, m[0].indexOf('>') + 1) })
  }
}
console.log(`${seiten.length} Seiten, ${videos.length} Videos`)

// ---------- 2) Markup und Kodierung
const geprueft = new Set()
for (const v of videos) {
  const name = v.seite + ' ' + (v.quellen[0]?.src || '?')
  melde(v.quellen.length > 0, `${name}: hat <source>`)
  if (!v.quellen.length) continue
  melde(v.quellen[0].type.startsWith('video/mp4'), `${name}: MP4 ist erste Quelle`)
  melde(v.quellen.every(q => /codecs=/.test(q.type)), `${name}: codecs-Angabe an jeder Quelle`)
  melde(/data-auto/.test(v.tag), `${name}: data-auto (Fallback in site.js)`)
  for (const q of v.quellen) {
    const datei = path.join(WURZEL, q.src.split('?')[0])
    if (geprueft.has(datei)) continue
    geprueft.add(datei)
    if (!fs.existsSync(datei)) { melde(false, `${q.src}: Datei fehlt`); continue }
    let info = ''
    try { execFileSync(FFMPEG, ['-hide_banner', '-i', datei], still) } catch (e) { info = String(e.stderr || '') }
    const strom = (info.match(/Stream #0:0.*Video: .*/) || [''])[0]
    const start = +((info.match(/start: ([\d.]+)/) || [0, 0])[1])
    const rel = q.src.split('?')[0]
    melde(/yuv420p\(tv, bt709/.test(strom), `${rel}: yuv420p, TV-Bereich, BT.709  [${(strom.match(/yuvj?420p\([^)]*\)/) || ['?'])[0]}]`)
    melde(!/SAR (?!1:1)/.test(strom), `${rel}: quadratische Pixel`)
    melde(start < 0.05, `${rel}: beginnt bei 0 s  [${start}]`)
    if (q.type.startsWith('video/mp4')) melde(/h264/.test(strom) && /avc1\.640028/.test(q.type) === /High/.test(strom), `${rel}: H.264 passend zur codecs-Angabe`)
  }
}

// ---------- 3) Live: Build abwarten, Header, Wiedergabe
if (live) {
  const kopf = execFileSync('git', ['-C', WURZEL, 'rev-parse', 'HEAD'], still).trim()
  for (let i = 0; ; i++) {
    const b = JSON.parse(execFileSync('gh', ['api', `repos/${REPO}/pages/builds/latest`], still))
    if (b.commit === kopf && b.status === 'built') { console.log('Pages-Build fertig', kopf.slice(0, 7)); break }
    if (b.status === 'errored') { melde(false, 'Pages-Build fehlgeschlagen: ' + JSON.stringify(b.error)); break }
    if (i > 60) { melde(false, 'Pages-Build nach 10 min nicht fertig'); break }
    await new Promise(r => setTimeout(r, 10000))
  }
  for (const datei of geprueft) {
    const rel = '/' + path.relative(WURZEL, datei).replace(/\\/g, '/')
    const erwartet = rel.endsWith('.mp4') ? 'video/mp4' : 'video/webm'
    const r = await fetch(BASIS + rel + '?pruef=' + Date.now(), { headers: { Range: 'bytes=0-1023' } })
    melde(r.status === 206 && r.headers.get('content-type') === erwartet, `${rel}: live ${r.status}, ${r.headers.get('content-type')} (Range-Anfrage)`)
    const ganz = await fetch(BASIS + rel + '?pruef=' + Date.now(), { method: 'HEAD' })
    melde(+ganz.headers.get('content-length') === fs.statSync(datei).size, `${rel}: Größe live = lokal`)
  }
}

if (live || nurAbspielen) {
  const BROWSER = [['Chrome', 'C:/Program Files/Google/Chrome/Application/chrome.exe'], ['Edge', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe']].filter(b => fs.existsSync(b[1]))
  const seitenMitVideo = [...new Set(videos.map(v => v.seite))]
  for (const [name, exe] of BROWSER) for (const handy of [false, true]) await abspielen(name, exe, handy, seitenMitVideo)
}

async function abspielen(name, exe, handy, urls) {
  const profil = fs.mkdtempSync(path.join(os.tmpdir(), 'vn-video-'))
  const port = 9300 + Math.floor(Math.random() * 500)
  const proz = spawn(exe, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profil}`, '--autoplay-policy=no-user-gesture-required', '--no-first-run', '--mute-audio', 'about:blank'], { windowsHide: true, stdio: 'ignore' })
  try {
    let ziel
    for (let i = 0; i < 50 && !ziel; i++) { await new Promise(r => setTimeout(r, 200)); ziel = await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json()).then(l => l.find(t => t.type === 'page')).catch(() => null) }
    const ws = new WebSocket(ziel.webSocketDebuggerUrl)
    await new Promise(r => ws.addEventListener('open', r, { once: true }))
    let id = 0
    const offen = new Map()
    ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && offen.has(m.id)) { offen.get(m.id)(m); offen.delete(m.id) } })
    const cdp = (method, params = {}) => new Promise(r => { const i = ++id; offen.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
    if (handy) {
      await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true })
      await cdp('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36' })
      await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
    }
    const art = `${name} ${handy ? 'Handy' : 'Desktop'}`
    for (const u of urls) {
      await cdp('Page.navigate', { url: BASIS + u + '?pruef=' + Date.now() })
      await new Promise(r => setTimeout(r, 2500))
      // jedes Video der Seite einzeln laden und 1,5 s abspielen lassen (ohne auf Sichtbarkeit zu warten)
      const r = await cdp('Runtime.evaluate', { awaitPromise: true, returnByValue: true, expression: `(async () => {
        const out = []
        const teste = async (v, src) => {
          const t0 = Date.now()
          await new Promise(res => { const f = () => (v.readyState >= 3 || v.error || Date.now() - t0 > 15000) ? res() : setTimeout(f, 100); f() })
          try { await v.play() } catch (e) {}
          const a = v.currentTime
          await new Promise(res => setTimeout(res, 1500))
          out.push({ src: src || (v.currentSrc || '').replace(location.origin, '').split('?')[0], fehler: v.error && (v.error.code + ' ' + v.error.message), lief: v.currentTime - a, breite: v.videoWidth })
          v.pause()
        }
        for (const v of document.querySelectorAll('video')) {
          // so wie die Seite es abspielt (Browser wählt die Quelle)
          v.preload = 'auto'; v.muted = true
          if (v.readyState === 0) v.load()
          await teste(v)
          // und jede Quelle einzeln, auch die Ersatzquelle
          for (const q of v.querySelectorAll('source')) {
            if (!document.createElement('video').canPlayType(q.type)) { out.push({ src: q.getAttribute('src').split('?')[0] + ' (vom Browser nicht unterstützt)', lief: 1, breite: 1 }); continue }
            const t = document.createElement('video'); t.muted = true; t.preload = 'auto'; t.src = q.src
            await teste(t, q.getAttribute('src').split('?')[0] + ' einzeln'); t.removeAttribute('src'); t.load()
          }
        }
        return out })()` })
      for (const v of r.result?.result?.value || []) melde(!v.fehler && v.lief > 0.5 && v.breite > 0, `${art} ${u} ${v.src}: ${v.fehler ? 'Fehler ' + v.fehler : `spielt (${v.lief.toFixed(1)} s in 1,5 s)`}`)
    }
    ws.close()
  } catch (e) { melde(false, `${name}: ${e.message}`) } finally {
    try { execFileSync('taskkill', ['/PID', String(proz.pid), '/T', '/F'], still) } catch { proz.kill() }
    await new Promise(r => setTimeout(r, 1500))
    try { fs.rmSync(profil, { recursive: true, force: true, maxRetries: 5, retryDelay: 400 }) } catch { /* Profil-Reste im Temp-Ordner sind harmlos */ }
  }
}

console.log(fehler.length ? `\n${fehler.length} Fehler` : '\nalles in Ordnung')
process.exit(fehler.length ? 1 : 0)
