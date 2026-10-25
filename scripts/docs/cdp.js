/**
 * Cliente mínimo de Chrome DevTools Protocol sobre WebSocket/TCP.
 * Sin dependencias: se usa desde los scripts de captura de documentación.
 */
const net = require('net');
const crypto = require('crypto');
const http = require('http');

function getJSON(port, path) {
  return new Promise((res, rej) => {
    http.get({ host: '127.0.0.1', port, path }, r => {
      let d = '';
      r.on('data', c => (d += c));
      r.on('end', () => res(JSON.parse(d)));
    }).on('error', rej);
  });
}

function connectWS(url) {
  const u = new URL(url);
  return new Promise((resolve, reject) => {
    const sock = net.connect(Number(u.port), u.hostname, () => sock.write(
      `GET ${u.pathname}${u.search} HTTP/1.1\r\n` +
      `Host: ${u.host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n` +
      `Sec-WebSocket-Key: ${crypto.randomBytes(16).toString('base64')}\r\n` +
      `Sec-WebSocket-Version: 13\r\n\r\n`
    ));
    let buf = Buffer.alloc(0);
    let upgraded = false;
    const listeners = [];
    sock.on('error', reject);

    function frames() {
      while (buf.length >= 2) {
        const op = buf[0] & 0x0f;
        let len = buf[1] & 0x7f;
        let off = 2;
        if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
        else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
        if (buf.length < off + len) return;
        const payload = buf.subarray(off, off + len);
        buf = buf.subarray(off + len);
        if (op === 1) listeners.forEach(fn => fn(payload.toString('utf8')));
      }
    }

    sock.on('data', chunk => {
      buf = Buffer.concat([buf, chunk]);
      if (!upgraded) {
        const idx = buf.indexOf('\r\n\r\n');
        if (idx === -1) return;
        if (!buf.subarray(0, idx).toString().includes('101')) return reject(new Error('handshake falló'));
        upgraded = true;
        buf = buf.subarray(idx + 4);
        resolve({
          on: fn => listeners.push(fn),
          close: () => sock.end(),
          send: text => {
            const data = Buffer.from(text, 'utf8');
            const mask = crypto.randomBytes(4);
            let header;
            if (data.length < 126) header = Buffer.from([0x81, 0x80 | data.length]);
            else if (data.length < 65536) {
              header = Buffer.alloc(4);
              header[0] = 0x81; header[1] = 0x80 | 126;
              header.writeUInt16BE(data.length, 2);
            } else {
              header = Buffer.alloc(10);
              header[0] = 0x81; header[1] = 0x80 | 127;
              header.writeBigUInt64BE(BigInt(data.length), 2);
            }
            const masked = Buffer.alloc(data.length);
            for (let i = 0; i < data.length; i++) masked[i] = data[i] ^ mask[i % 4];
            sock.write(Buffer.concat([header, mask, masked]));
          },
        });
      }
      frames();
    });
  });
}

/** Conecta a la primera pestaña de Chrome y devuelve helpers CDP. */
async function attach(port = 9333) {
  const target = (await getJSON(port, '/json/list')).find(t => t.type === 'page');
  if (!target) throw new Error('Chrome no expone ninguna pestaña');
  const ws = await connectWS(target.webSocketDebuggerUrl);

  let id = 0;
  const pending = new Map();
  ws.on(raw => {
    const msg = JSON.parse(raw);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  });

  const send = (method, params = {}) => new Promise(res => {
    const mid = ++id;
    pending.set(mid, res);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });

  const ev = async expression => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.result && r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
    return r.result.result.value;
  };

  const wait = ms => new Promise(r => setTimeout(r, ms));

  return { send, ev, wait, close: () => ws.close() };
}

module.exports = { attach, getJSON };
