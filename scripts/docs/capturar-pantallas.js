#!/usr/bin/env node
/**
 * Capturas de pantalla del panel y de Portainer vía CDP.
 *
 * Uso:
 *   BASIC_AUTH="usuario:clave" node capturar-pantallas.js --out docs/capturas \
 *       --app http://127.0.0.1:9000 --portainer https://cluster-red.ponciop.online
 *
 * Requiere Chrome headless escuchando en --port (9333 por defecto).
 */
const fs = require('fs');
const path = require('path');
const { attach } = require('./cdp');

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const OUT = opt('out', 'docs/capturas');
const APP = opt('app', 'http://127.0.0.1:9000');
const PORTAINER = opt('portainer', '');
const PORT = Number(opt('port', '9333'));
const BASIC_AUTH = process.env.BASIC_AUTH || '';
const PORTAINER_USER = process.env.PORTAINER_USER || 'admin';
const PORTAINER_PASS = process.env.PORTAINER_PASS || '';

const authHeader = BASIC_AUTH
  ? { Authorization: 'Basic ' + Buffer.from(BASIC_AUTH).toString('base64') }
  : {};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const c = await attach(PORT);
  const { send, ev, wait } = c;

  const viewport = (width, height, mobile = false, scale = 1) =>
    send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile });

  const save = async (file, clip, fmt = 'png') => {
    const params = { format: fmt, fromSurface: true, captureBeyondViewport: true };
    if (fmt === 'jpeg') params.quality = 90;
    if (clip) params.clip = { ...clip, scale: 1 };
    let r;
    for (let attempt = 1; attempt <= 3; attempt++) {
      r = await send('Page.captureScreenshot', params);
      if (r.result && r.result.data) break;
      await wait(700);
    }
    if (!r.result || !r.result.data) throw new Error('captura vacía: ' + file);
    const full = path.join(OUT, file);
    fs.writeFileSync(full, Buffer.from(r.result.data, 'base64'));
    console.log(`  ${file.padEnd(30)} ${Math.round(fs.statSync(full).size / 1024)} KB`);
  };

  const waitFor = async (expr, timeout = 25000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      if (await ev(`!!(${expr})`)) return true;
      await wait(500);
    }
    return false;
  };

  const fullPage = async file => {
    const m = await send('Page.getLayoutMetrics');
    const w = Math.ceil(m.result.cssContentSize.width);
    const h = Math.min(9000, Math.ceil(m.result.cssContentSize.height));
    await save(file, { x: 0, y: 0, width: w, height: h });
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');

  // ---------- app de escritorio (a través del gateway) ----------
  await send('Network.setExtraHTTPHeaders', { headers: authHeader });
  await viewport(1440, 1000);
  console.log(`Capturando ${APP} ...`);
  await send('Page.navigate', { url: APP + '/' });
  await wait(6500);

  await fullPage('01-panel-escritorio.png');

  await ev(`document.querySelector('.tab[data-tab="redes"]').click()`);
  await wait(1000);
  await fullPage('02-panel-redes.png');

  await ev(`document.querySelector('.tab[data-tab="dev"]').click()`);
  await wait(1200);
  await fullPage('03-panel-desarrollo.png');

  // ---------- diagrama aislado ----------
  await ev(`document.querySelector('.tab[data-tab="infra"]').click()`);
  await wait(800);
  const box = JSON.parse(await ev(`(() => {
    const r = document.querySelector('.diagram-card').getBoundingClientRect();
    return JSON.stringify({ x: r.x + window.scrollX, y: r.y + window.scrollY, width: r.width, height: r.height });
  })()`));
  await save('05-diagrama.png', box);

  // ---------- móvil ----------
  await viewport(390, 844, true, 1.5);
  await send('Page.navigate', { url: APP + '/' });
  await wait(6000);
  await save('04-panel-movil.jpg', null, 'jpeg');

  // ---------- Portainer (login propio, sin Basic Auth) ----------
  if (PORTAINER) {
    await send('Network.setExtraHTTPHeaders', { headers: {} });
    await viewport(1280, 800);
    console.log(`Capturando ${PORTAINER} ...`);
    await send('Page.navigate', { url: PORTAINER + '/' });
    // Los bundles de Portainer pesan >10 MB: esperar a que salga del spinner.
    const listo = await waitFor(
      `document.body && document.body.innerText.trim().length > 0 && !/Loading Portainer/.test(document.body.innerText)`,
      45000
    );
    await wait(1500);
    await save('06-portainer-login.png');
    console.log(`  (SPA ${listo ? 'cargada' : 'AÚN en loading tras 45 s'})`);

    // ---------- Portainer autenticado: servicios y redes ----------
    if (PORTAINER_PASS) {
      // La UI es React: hay que usar el setter nativo y disparar `input`.
      const login = await ev(`(() => {
        const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        const u = document.querySelector('input[name="username"]');
        const p = document.querySelector('input[name="password"]');
        const b = document.querySelector('button[type="submit"]');
        if (!u || !p || !b) return false;
        set.call(u, ${JSON.stringify(PORTAINER_USER)});
        u.dispatchEvent(new Event('input', { bubbles: true }));
        set.call(p, ${JSON.stringify(PORTAINER_PASS)});
        p.dispatchEvent(new Event('input', { bubbles: true }));
        b.click();
        return true;
      })()`);

      const dentro = await waitFor(
        `location.hash !== '#!/auth' && /Home/.test(document.body.innerText)`,
        30000
      );
      console.log(`  (login ${login ? 'enviado' : 'no disponible'}; ${dentro ? 'sesión iniciada' : 'sin sesión'})`);

      const buscar = term => ev(`(() => {
        const i = document.querySelector('input[aria-label="Search input"]');
        if (!i) return false;
        const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        set.call(i, ${JSON.stringify(term)});
        i.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      })()`);

      if (dentro) {
        await viewport(1440, 900);

        await send('Page.navigate', { url: PORTAINER + '/#!/1/docker/services' });
        const srv = await waitFor(
          `document.body && document.body.innerText.includes('portainer_portainer')`,
          30000
        );
        await buscar('portainer');
        await wait(1500);
        await save('07-portainer-servicios.png');
        console.log(`  (servicios ${srv ? 'visibles' : 'no encontrados'})`);

        await send('Page.navigate', { url: PORTAINER + '/#!/1/docker/networks' });
        const net = await waitFor(
          `document.body && document.body.innerText.includes('lab14-segmentado_back')`,
          30000
        );
        await buscar('lab14');
        await wait(1500);
        await save('08-portainer-redes.png');
        console.log(`  (redes ${net ? 'visibles' : 'no encontradas'})`);
      }
    } else {
      console.log('  (sin PORTAINER_PASS: solo se captura el login)');
    }
  }

  c.close();
  process.exit(0);
})().catch(err => {
  console.error('ERROR:', err.message);
  process.exit(2);
});
