#!/usr/bin/env node
/**
 * Captura un HTML local a PNG con la altura exacta de su contenido.
 * Uso: node capturar-html.js <entrada.html> <salida.png> [ancho]
 */
const fs = require('fs');
const path = require('path');
const { attach } = require('./cdp');

const [html, png, widthArg] = process.argv.slice(2);
const width = Number(widthArg || 1260);

(async () => {
  if (!html || !png) throw new Error('faltan argumentos: <entrada.html> <salida.png>');
  const c = await attach(9333);
  await c.send('Page.enable');
  await c.send('Runtime.enable');
  await c.send('Emulation.setDeviceMetricsOverride', {
    width, height: 200, deviceScaleFactor: 1, mobile: false,
  });
  await c.send('Page.navigate', { url: 'file://' + path.resolve(html) });
  await c.wait(700);

  const m = await c.send('Page.getLayoutMetrics');
  const w = Math.ceil(m.result.cssContentSize.width);
  const h = Math.ceil(m.result.cssContentSize.height);

  const shot = await c.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: w, height: h, scale: 1 },
  });
  fs.writeFileSync(png, Buffer.from(shot.result.data, 'base64'));
  console.log(`  ${path.basename(png).padEnd(30)} ${w}x${h} · ${Math.round(fs.statSync(png).size / 1024)} KB`);

  c.close();
  process.exit(0);
})().catch(err => {
  console.error('ERROR:', err.message);
  process.exit(2);
});
