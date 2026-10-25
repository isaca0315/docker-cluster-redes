/* =========================================================
   Laboratorio 14 — panel de infraestructura, redes y desarrollo
   Datos declarados + estado en vivo desde la API Flask.
   ========================================================= */

const TOPOLOGY = {
  nodes: [
    {
      id: 'manager', icon: '👑', name: 'kernel-lab', role: 'Manager · Leader',
      status: 'ready',
      fields: {
        'IP LAN': '172.25.208.103',
        'Docker': '29.8.1',
        'Rol': 'Manager / Leader',
        'SO': 'Linux',
      },
      desc: 'Nodo principal del Swarm. Ejecuta Portainer, el gateway nginx y el stack compose del Lab 14.',
    },
    {
      id: 'worker', icon: '🧩', name: 'ubuntu24-cwl', role: 'Worker',
      status: 'ready',
      fields: {
        'IP LAN': '172.25.208.110',
        'Docker': '29.1.3',
        'Rol': 'Worker',
        'SO': 'Ubuntu 24.04',
      },
      desc: 'Nodo trabajador unido con join-worker.sh. Sin servicios del stack del Lab 14: el stack corre en el manager.',
    },
  ],

  services: [
    {
      id: 'cloud', icon: '☁', name: 'Cloudflare Tunnel', role: 'Borde / salida',
      tags: [['cyan', 'edge'], ['green', 'TLS'], ['violet', 'saliente']],
      fields: {
        'Hostname app': 'app-red.ponciop.online',
        'Hostname Portainer': 'cluster-red.ponciop.online',
        'Servicio local': 'http://localhost:9000',
        'Modo': 'remotely managed',
      },
      desc: 'El túnel es saliente: no se abren puertos en el router. Cloudflare termina TLS y entrega al gateway en loopback.',
    },
    {
      id: 'gateway', icon: '🛡', name: 'Gateway nginx', role: 'Acceso / auth',
      tags: [['cyan', 'Basic Auth'], ['violet', 'loopback'], ['green', 'proxy']],
      fields: {
        'Escucha': '127.0.0.1:9000',
        'Acceso local': '8088 app · 9090 Portainer',
        'Upstream app': '127.0.0.1:8080',
        'Upstream Portainer': '127.0.0.1:9001',
      },
      desc: 'Puerta única del túnel. Aplica Basic Auth antes de dejar pasar a la app o a Portainer. Nunca escucha en la LAN.',
    },
    {
      id: 'portainer', icon: '📦', name: 'Portainer CE', role: 'Gestión del clúster',
      tags: [['violet', 'swarm'], ['cyan', 'UI'], ['amber', 'login']],
      fields: {
        'URL pública': 'cluster-red.ponciop.online',
        'Puerto host': '9001',
        'Credencial': 'admin + password',
        'Imagen': 'portainer/portainer-ce:latest',
      },
      desc: 'Panel de administración del Swarm. Corre como servicio en el manager y habla con el socket de Docker.',
    },
    {
      id: 'web', icon: '🌐', name: 'web · nginx', role: 'Frontend',
      tags: [['cyan', 'front'], ['green', 'HTML/CSS/JS'], ['violet', 'proxy /api']],
      fields: {
        'IP front': '172.28.10.10',
        'Puerto': '8080',
        'Imagen': 'nginx:alpine',
        'Proxy': '/api/ → api:5000',
      },
      desc: 'Sirve esta aplicación y reenvía /api/* a la API. Es el único contenedor que el gateway necesita conocer.',
    },
    {
      id: 'api', icon: '⚙', name: 'api · Flask', role: 'Lógica / puente',
      tags: [['violet', 'puente'], ['cyan', 'front'], ['pink', 'back']],
      fields: {
        'IP front': '172.28.10.20',
        'IP back': '172.28.20.30',
        'Puerto': '5000',
        'Imagen': 'lab14-segmentado-api',
      },
      desc: 'Única pieza con interfaces en las dos redes. Responde /health, /db, /info y es la que consulta PostgreSQL.',
    },
    {
      id: 'db', icon: '🗄', name: 'db · PostgreSQL', role: 'Datos',
      tags: [['pink', 'back'], ['green', 'postgres 13'], ['amber', 'internal']],
      fields: {
        'IP back': '172.28.20.20',
        'Puerto': '5432',
        'Base / usuario': 'appdb / appuser',
        'Healthcheck': 'pg_isready',
      },
      desc: 'Base de datos aislada en la red back (internal: true). No tiene salida a Internet ni camino directo desde web.',
    },
    {
      id: 'dnsmasq', icon: '🧭', name: 'dnsmasq', role: 'DNS interno',
      tags: [['cyan', 'front'], ['violet', 'DNS'], ['green', ':53']],
      fields: {
        'IP front': '172.28.10.53',
        'Puerto': '53/udp',
        'Zonas': 'web.local · api.local · db.local',
        'Imagen': '4km3/dnsmasq:2.85-r2',
      },
      desc: 'Resuelve los nombres .local del laboratorio. Las pruebas usan nslookup contra 172.28.10.53.',
    },
  ],

  networks: [
    {
      id: 'front', name: 'front', subnet: '172.28.10.0/24', gateway: '172.28.10.1',
      driver: 'bridge', internal: false,
      members: [
        { name: 'web', ip: '172.28.10.10', port: '8080' },
        { name: 'api', ip: '172.28.10.20', port: '5000' },
        { name: 'dnsmasq', ip: '172.28.10.53', port: '53' },
      ],
    },
    {
      id: 'back', name: 'back', subnet: '172.28.20.0/24', gateway: '172.28.20.1',
      driver: 'bridge', internal: true,
      members: [
        { name: 'db', ip: '172.28.20.20', port: '5432' },
        { name: 'api', ip: '172.28.20.30', port: '5000' },
      ],
    },
  ],

  dns: [
    { name: 'web.local', ip: '172.28.10.10', zone: 'front', note: 'frontend nginx' },
    { name: 'api.local', ip: '172.28.10.20', zone: 'front', note: 'API Flask' },
    { name: 'dns.local', ip: '172.28.10.53', zone: 'front', note: 'dnsmasq' },
    { name: 'db.local', ip: '172.28.20.20', zone: 'back', note: 'PostgreSQL' },
  ],

  checks: [
    'web no resuelve db por nombre',
    'web no alcanza db por IP',
    'api alcanza db por IP',
    'DNS web.local → 172.28.10.10',
    'DNS api.local → 172.28.10.20',
    'DNS db.local → 172.28.20.20',
    'web responde HTTP 200',
  ],

  endpoints: [
    { path: 'GET /', target: 'web :8080', desc: 'Esta aplicación (HTML/CSS/JS)' },
    { path: 'GET /api/health', target: 'api :5000', desc: 'Estado del servicio Flask', live: 'health' },
    { path: 'GET /api/db', target: 'api → db :5432', desc: 'Prueba TCP real contra PostgreSQL', live: 'db' },
    { path: 'GET /api/info', target: 'api :5000', desc: 'Hostname, Python, uptime y target de DB', live: 'info' },
    { path: 'GET /portainer/', target: 'gateway → Portainer :9001', desc: 'Panel del Swarm (Basic Auth + login)' },
  ],

  stack: [
    { icon: '🎨', name: 'Frontend', tech: 'HTML + CSS + JS (sin frameworks)', note: 'Diagrama SVG animado, pestañas y polling cada 4 s. Se sirve desde web/nginx:alpine.' },
    { icon: '🐍', name: 'API', tech: 'Python 3.9 + Flask', note: '/health, /db, /info. Healthcheck propio y usuario no root en la imagen.' },
    { icon: '🐘', name: 'Datos', tech: 'PostgreSQL 13 Alpine', note: 'appdb/appuser, volumen db_data y healthcheck pg_isready.' },
    { icon: '🐳', name: 'Entrega', tech: 'Docker Compose + Swarm + Portainer', note: 'Stack segmentado en kernel-lab, Swarm de 2 nodos y túnel Cloudflare.' },
  ],
};

/* ------------------------- utilidades ------------------------- */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function tagsHtml(tags) {
  return tags.map(([color, label]) => `<span class="tag ${color}">${escapeHtml(label)}</span>`).join('');
}

function fieldsHtml(fields) {
  return `<dl class="kv">${Object.entries(fields)
    .map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`)
    .join('')}</dl>`;
}

function cardHtml(item, extra = {}) {
  const id = item.id ? `card-${item.id}` : '';
  return `
    <article class="info-card" id="${id}">
      <div class="info-head">
        <div class="info-icon" aria-hidden="true">${item.icon || '•'}</div>
        <div>
          <h4>${escapeHtml(item.name)}</h4>
          <small>${escapeHtml(item.role || '')}</small>
        </div>
      </div>
      ${item.tags ? `<div class="tags">${tagsHtml(item.tags)}</div>` : ''}
      ${item.fields ? fieldsHtml(item.fields) : ''}
      ${item.desc ? `<p class="kv" style="display:block;color:var(--muted);line-height:1.55;margin:10px 0 0">${escapeHtml(item.desc)}</p>` : ''}
      ${extra.after || ''}
    </article>`;
}

/* ------------------------- render ------------------------- */

function renderInfra() {
  const nodeCards = TOPOLOGY.nodes.map(n => cardHtml({
    id: n.id, icon: n.icon, name: n.name, role: n.role,
    tags: [['green', n.status === 'ready' ? 'READY' : n.status.toUpperCase()], ['cyan', n.role.split('·')[0].trim()]],
    fields: n.fields, desc: n.desc,
  })).join('');

  const serviceCards = TOPOLOGY.services.map(s => cardHtml(s)).join('');

  $('#panel-infra').innerHTML = `
    <h3 class="section-title">Clúster Swarm</h3>
    <div class="grid-cards">${nodeCards}</div>

    <h3 class="section-title">Servicios y capas</h3>
    <div class="grid-cards">${serviceCards}</div>

    <h3 class="section-title">Runtime de la API (en vivo)</h3>
    <div class="grid-cards">
      <article class="info-card" id="card-runtime">
        <div class="info-head">
          <div class="info-icon">📈</div>
          <div><h4>api · runtime</h4><small>datos de /api/info</small></div>
        </div>
        <dl class="kv">
          <dt>Hostname</dt><dd id="api-hostname">—</dd>
          <dt>Python</dt><dd id="api-python">—</dd>
          <dt>Uptime</dt><dd id="api-uptime">—</dd>
          <dt>Target DB</dt><dd id="api-target">—</dd>
          <dt>IP front</dt><dd id="api-front">—</dd>
          <dt>IP back</dt><dd id="api-back">—</dd>
        </dl>
      </article>
      <article class="info-card">
        <div class="info-head">
          <div class="info-icon">🔐</div>
          <div><h4>Superficie expuesta</h4><small>qué sale y qué no</small></div>
        </div>
        <dl class="kv">
          <dt>Internet</dt><dd>Cloudflare → 9000</dd>
          <dt>LAN</dt><dd>solo 9001 (Portainer)</dd>
          <dt>Loopback</dt><dd>8080 · 8081 · 8088 · 9000 · 9090</dd>
          <dt>Swarm</dt><dd>2377 / 7946 / 4789</dd>
          <dt>DB</dt><dd>sin publicar puertos</dd>
        </dl>
      </article>
    </div>
  `;
}

function renderRedes() {
  const netCards = TOPOLOGY.networks.map(net => `
    <article class="net-card ${net.internal ? 'back' : ''}" id="card-${net.id}">
      <h4>
        <span>${net.internal ? '🔒' : '🌐'} red ${escapeHtml(net.name)}</span>
        <span class="tag ${net.internal ? 'pink' : 'cyan'}">${net.internal ? 'internal: true' : 'bridge'}</span>
      </h4>
      <p class="subnet">${escapeHtml(net.subnet)} · gw ${escapeHtml(net.gateway)}</p>
      ${net.members.map(m => `
        <div class="member">
          <span>${escapeHtml(m.name)}</span>
          <code>${escapeHtml(m.ip)} · :${escapeHtml(m.port)}</code>
        </div>`).join('')}
      ${net.internal
        ? '<div class="note">Sin salida a Internet y sin ruta directa desde <b>front</b>. Solo <b>api</b> tiene una interfaz en esta red, y por eso es el único puente hacia <b>db</b>.</div>'
        : '<div class="note" style="border-color:rgba(34,211,238,.3);background:rgba(34,211,238,.05);color:#bdefff">Red de servicio: aquí viven <b>web</b>, <b>api</b> y <b>dnsmasq</b>. La API también mira hacia <b>back</b>, pero <b>web</b> no.</div>'}
    </article>`).join('');

  const dnsRows = TOPOLOGY.dns.map(d => `
    <tr>
      <td class="mono">${escapeHtml(d.name)}</td>
      <td class="mono">${escapeHtml(d.ip)}</td>
      <td><span class="tag ${d.zone === 'back' ? 'pink' : 'cyan'}">${escapeHtml(d.zone)}</span></td>
      <td>${escapeHtml(d.note)}</td>
    </tr>`).join('');

  const checks = TOPOLOGY.checks.map(c => `<div class="check"><b>✅</b> ${escapeHtml(c)}</div>`).join('');

  $('#panel-redes').innerHTML = `
    <h3 class="section-title">Segmentación</h3>
    <div class="net-grid">${netCards}</div>

    <h3 class="section-title">DNS interno (dnsmasq · 172.28.10.53)</h3>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Nombre</th><th>IP</th><th>Zona</th><th>Qué resuelve</th></tr></thead>
        <tbody>${dnsRows}</tbody>
      </table>
    </div>

    <h3 class="section-title">Pruebas de segmentación</h3>
    <div class="check-list">${checks}</div>

    <h3 class="section-title">Reglas de oro</h3>
    <div class="code-block"><span class="c"># lo que nunca debe romperse</span>
<span class="p">front</span>  NO resuelve ni alcanza <span class="y">db</span> por nombre ni por IP
<span class="p">back</span>   es <span class="y">internal: true</span> → sin gateway a Internet
<span class="p">api</span>    es el <span class="g">único</span> contenedor con IP en front y en back
<span class="p">db</span>     no publica <span class="y">ports:</span> y solo habla con api:5432
<span class="p">web</span>    nunca se conecta a la red back</div>
  `;
}

function renderDev() {
  const stackCards = TOPOLOGY.stack.map(s => `
    <article class="info-card">
      <div class="info-head">
        <div class="info-icon">${s.icon}</div>
        <div><h4>${escapeHtml(s.name)}</h4><small>${escapeHtml(s.tech)}</small></div>
      </div>
      <p style="margin:0;color:var(--muted);font-size:.8rem;line-height:1.55">${escapeHtml(s.note)}</p>
    </article>`).join('');

  const endpointRows = TOPOLOGY.endpoints.map(e => `
    <tr>
      <td class="mono">${escapeHtml(e.path)}</td>
      <td class="mono">${escapeHtml(e.target)}</td>
      <td>${escapeHtml(e.desc)}</td>
      <td>${e.live ? `<span class="pill-live" id="ep-${e.live}">—</span>` : '<span class="tag green">estático</span>'}</td>
    </tr>`).join('');

  $('#panel-dev').innerHTML = `
    <h3 class="section-title">Stack de desarrollo</h3>
    <div class="grid-cards">${stackCards}</div>

    <h3 class="section-title">Endpoints (estado en vivo)</h3>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Endpoint</th><th>Destino</th><th>Descripción</th><th>Estado</th></tr></thead>
        <tbody>${endpointRows}</tbody>
      </table>
    </div>

    <h3 class="section-title">Recorrido de una petición</h3>
    <div class="code-block"><span class="c"># navegador → nginx → web → API → PostgreSQL</span>
<span class="y">GET</span> https://app-red.ponciop.online/api/db
  │
  ├─ <span class="p">Cloudflare</span>            TLS + túnel saliente
  ├─ <span class="p">nginx gateway</span> :9000    Basic Auth ✔
  ├─ <span class="p">web</span> 172.28.10.10:8080   location /api/ → api:5000
  ├─ <span class="p">api</span> 172.28.10.20:5000   GET /db
  └─ <span class="p">db</span>  172.28.20.20:5432   TCP connect ✔
       <span class="g">{"db":"reachable","host":"db","port":5432}</span></div>

    <h3 class="section-title">Config del proxy en web</h3>
    <div class="code-block"><span class="c"># web/nginx.conf</span>
location <span class="y">/api/</span> {
    proxy_pass http://<span class="p">api:5000</span>/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}</div>

    <h3 class="section-title">Respuesta viva de /api/db</h3>
    <pre class="code-block" id="live-json">esperando datos…</pre>
  `;
}

/* ------------------------- datos en vivo ------------------------- */

const LIVE = {
  health: { ok: false, data: null, ms: 0 },
  db: { ok: false, data: null, ms: 0 },
  info: { ok: false, data: null, ms: 0 },
  lastUpdate: null,
  failures: 0,
};

async function getJSON(url, timeout = 5000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  const t0 = performance.now();
  try {
    const res = await fetch(url, { cache: 'no-store', signal: ctrl.signal });
    const ms = Math.round(performance.now() - t0);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { ok: true, data: await res.json(), ms };
  } catch (err) {
    return { ok: false, error: err.name === 'AbortError' ? 'timeout' : err.message, ms: Math.round(performance.now() - t0) };
  } finally {
    clearTimeout(timer);
  }
}

function setDot(el, state) {
  if (!el) return;
  el.classList.remove('ok', 'err', 'unknown');
  el.classList.add(state);
}

function setText(sel, text) {
  const el = $(sel);
  if (el) el.textContent = text;
}

function pill(el, ok, text) {
  if (!el) return;
  el.className = `pill-live ${ok ? 'ok' : 'err'}`;
  el.textContent = text;
}

function formatSeconds(total) {
  const s = Math.max(0, Math.round(total));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h) return `${h}h ${m}m ${sec}s`;
  if (m) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function updateDashboard() {
  const apiOk = LIVE.health.ok;
  const dbOk = LIVE.db.ok && LIVE.db.data && LIVE.db.data.db === 'reachable';

  setText('#global-status', apiOk ? 'API en línea' : 'API sin conexión');
  setDot($('#global-dot'), apiOk ? 'ok' : 'err');

  setDot($('#dot-api'), apiOk ? 'ok' : 'err');
  setDot($('#chip-api-dot'), apiOk ? 'ok' : 'err');
  setText('#api-latency', apiOk ? `${LIVE.health.ms} ms` : 'sin respuesta');

  setDot($('#dot-db'), dbOk ? 'ok' : 'err');
  setDot($('#chip-db-dot'), dbOk ? 'ok' : 'err');
  setText('#db-live', dbOk ? 'reachable' : (LIVE.db.ok ? 'unreachable' : 'sin respuesta'));

  const now = new Date();
  setText('#last-update', now.toLocaleTimeString('es-PE', { hour12: false }));
  LIVE.lastUpdate = now;

  // runtime de la API
  if (LIVE.info.ok && LIVE.info.data) {
    const d = LIVE.info.data;
    setText('#api-hostname', d.hostname || '—');
    setText('#api-python', d.python || '—');
    setText('#api-uptime', formatSeconds(d.uptime_seconds || 0));
    setText('#api-target', d.db_target || '—');
    setText('#api-front', d.front_ip || '—');
    setText('#api-back', d.back_ip || '—');
  }

  // tabla de endpoints
  pill($('#ep-health'), apiOk, apiOk ? `200 · ${LIVE.health.ms} ms` : 'error');
  pill($('#ep-db'), dbOk, dbOk ? `200 · ${LIVE.db.ms} ms` : 'error');
  pill($('#ep-info'), LIVE.info.ok, LIVE.info.ok ? `200 · ${LIVE.info.ms} ms` : 'error');

  // JSON vivo
  const pre = $('#live-json');
  if (pre) {
    const payload = {
      db: LIVE.db.ok ? LIVE.db.data : { error: LIVE.db.error },
      info: LIVE.info.ok ? LIVE.info.data : { error: LIVE.info.error },
    };
    pre.textContent = JSON.stringify(payload, null, 2);
  }

  const banner = $('#banner');
  if (banner) banner.hidden = apiOk || LIVE.failures < 2;
}

async function poll() {
  const [health, db, info] = await Promise.all([
    getJSON('/api/health'),
    getJSON('/api/db'),
    getJSON('/api/info'),
  ]);

  LIVE.health = health;
  LIVE.db = db;
  LIVE.info = info;
  LIVE.failures = health.ok ? 0 : LIVE.failures + 1;

  updateDashboard();
}

function schedulePoll() {
  window.setTimeout(async () => {
    if (!document.hidden) await poll();
    schedulePoll();
  }, 4000);
}

/* ------------------------- interacción ------------------------- */

function switchTab(name) {
  $$('.tab').forEach(t => {
    const active = t.dataset.tab === name;
    t.classList.toggle('active', active);
    t.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  $$('.tab-panel').forEach(p => p.classList.toggle('active', p.id === `panel-${name}`));
}

function initTabs() {
  $$('.tab').forEach(tab => tab.addEventListener('click', () => switchTab(tab.dataset.tab)));
}

function goToCard(id) {
  const card = document.getElementById(id);
  if (!card) return;
  const panel = card.closest('.tab-panel');
  if (panel) switchTab(panel.id.replace('panel-', ''));
  window.setTimeout(() => {
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.remove('flash');
    void card.offsetWidth;
    card.classList.add('flash');
  }, 80);
}

function initDiagramClicks() {
  $$('#topology .node').forEach(node => {
    const activate = () => goToCard(node.dataset.card);
    node.addEventListener('click', activate);
    node.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        activate();
      }
    });
  });
}

function initAnimationToggle() {
  const svg = $('#topology');
  const btn = $('#toggle-anim');
  let paused = false;

  btn.addEventListener('click', () => {
    paused = !paused;
    svg.classList.toggle('paused', paused);
    document.body.classList.toggle('paused', paused);
    try {
      if (paused) svg.pauseAnimations(); else svg.unpauseAnimations();
    } catch (_) { /* algunos navegadores no exponen SMIL */ }
    btn.textContent = paused ? '▶ Reanudar animación' : '⏸ Pausar animación';
  });
}

function initClock() {
  const tick = () => {
    setText('#clock', new Date().toLocaleTimeString('es-PE', { hour12: false }));
  };
  tick();
  window.setInterval(tick, 1000);
}

function animateCounter(el, target) {
  const start = performance.now();
  const duration = 900;
  const from = 0;
  const step = now => {
    const p = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(from + (target - from) * eased);
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function initStats() {
  const nodes = TOPOLOGY.nodes.length;
  const services = TOPOLOGY.services.length;
  const networks = TOPOLOGY.networks.length;

  animateCounter($('#stat-nodes'), nodes);
  animateCounter($('#stat-services'), services);
  animateCounter($('#stat-networks'), networks);

  const ok = TOPOLOGY.checks.length;
  const el = $('#stat-checks');
  let n = 0;
  const timer = window.setInterval(() => {
    n = Math.min(ok, n + 1);
    el.textContent = `${n}/${ok}`;
    if (n >= ok) window.clearInterval(timer);
  }, 90);
}

function initRetry() {
  $('#retry').addEventListener('click', async () => {
    const btn = $('#retry');
    btn.disabled = true;
    btn.textContent = 'Reintentando…';
    await poll();
    btn.disabled = false;
    btn.textContent = 'Reintentar';
  });
}

/* ------------------------- arranque ------------------------- */

function boot() {
  renderInfra();
  renderRedes();
  renderDev();

  initTabs();
  initDiagramClicks();
  initAnimationToggle();
  initClock();
  initStats();
  initRetry();

  poll();
  schedulePoll();

  // Al volver a la pestaña, refrescar de inmediato en vez de esperar al ciclo.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) poll();
  });
}

document.addEventListener('DOMContentLoaded', boot);
