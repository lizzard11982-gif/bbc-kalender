'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { loadCredentials, createGoogleStore } = require('./lib/google');
const { createMockStore } = require('./lib/mock');
const auth = require('./lib/auth');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const EMBED_ORIGINS = (process.env.ALLOWED_EMBED_ORIGINS || 'https://www.bbc-stendal.de https://bbc-stendal.de').trim();
const SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');

const CATEGORIES = [
  { id: 'heimspiel', label: 'Heimspiel', color: '#E04412' },
  { id: 'auswaerts', label: 'Auswärtsspiel', color: '#031029' },
  { id: 'camp', label: 'Camps & Turniere', color: '#F09C00' },
  { id: 'verein', label: 'Vereinsleben', color: '#2F7D6B' },
  { id: 'sponsor', label: 'Sponsoren & Presse', color: '#6B4FA0' },
];
const TEAMS = [
  { id: 'alle', label: 'Gesamtverein' },
  { id: 'herren', label: 'Herren' },
  { id: 'jugend', label: 'Jugend' },
];

// ---------- Store ----------
const creds = loadCredentials();
const calendarId = process.env.GOOGLE_CALENDAR_ID;
const store = creds && calendarId ? createGoogleStore(creds, calendarId) : createMockStore();

// ---------- Nutzer ----------
let users = [];
try { users = JSON.parse(process.env.USERS || '[]'); } catch { console.error('USERS ist kein gültiges JSON.'); }
if (!users.length && store.mode === 'demo') {
  users = [{ username: 'demo', name: 'Demo-Nutzer', hash: auth.hashPassword('demo1234') }];
  console.log('DEMO-MODUS: Login demo / demo1234, Termine nur im Speicher.');
}

// ---------- Hilfsfunktionen ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.ico': 'image/x-icon' };

function send(res, status, body, headers = {}) {
  const isObj = typeof body === 'object' && !Buffer.isBuffer(body);
  res.writeHead(status, { 'Content-Type': isObj ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
    'X-Content-Type-Options': 'nosniff', ...headers });
  res.end(isObj ? JSON.stringify(body) : body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let d = ''; req.on('data', (c) => { d += c; if (d.length > 50000) { reject(new Error('zu groß')); req.destroy(); } });
    req.on('end', () => { try { resolve(d ? JSON.parse(d) : {}); } catch { reject(new Error('Ungültiges JSON')); } });
  });
}
const CORS = { 'Access-Control-Allow-Origin': '*' };

const clean = (s, max) => String(s ?? '').trim().slice(0, max);
const RE_DT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, RE_D = /^\d{4}-\d{2}-\d{2}$/;
function validate(b) {
  const e = {
    title: clean(b.title, 150), category: clean(b.category, 20), team: clean(b.team || 'alle', 20),
    allDay: !!b.allDay, start: clean(b.start, 16), end: clean(b.end || b.start, 16),
    location: clean(b.location, 200), description: clean(b.description, 4000), url: clean(b.url, 300),
  };
  if (!e.title) return { error: 'Bitte einen Titel angeben.' };
  if (!CATEGORIES.some((c) => c.id === e.category)) return { error: 'Ungültige Kategorie.' };
  if (!TEAMS.some((t) => t.id === e.team)) return { error: 'Ungültige Mannschaft.' };
  const re = e.allDay ? RE_D : RE_DT;
  if (!re.test(e.start) || !re.test(e.end)) return { error: 'Ungültiges Datum bzw. Uhrzeit.' };
  if (e.end < e.start) return { error: 'Das Ende liegt vor dem Beginn.' };
  if (e.url && !/^https?:\/\//i.test(e.url)) return { error: 'Der Link muss mit http:// oder https:// beginnen.' };
  return { value: e };
}

// Event-Cache (öffentliche Liste)
const cache = new Map();
let version = 0;
const invalidate = () => { version++; cache.clear(); };
async function listCached(from, to) {
  const key = from + '|' + to, hit = cache.get(key);
  if (hit && Date.now() - hit.t < 60000) return hit.v;
  const ver = version;
  const v = await store.list(from, to);
  if (ver === version) cache.set(key, { v, t: Date.now() }); // keine veralteten Daten nach einer Änderung cachen
  return v;
}

const attempts = new Map();
function throttled(ip) {
  const now = Date.now(), a = (attempts.get(ip) || []).filter((t) => now - t < 15 * 60000);
  attempts.set(ip, a);
  return a.length >= 10;
}

function currentUser(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? auth.verify(h.slice(7), SECRET) : null;
}

function ics(events) {
  const esc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (m) => '\\' + m);
  const dt = (s) => s.replace(/[-:]/g, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//BBC Stendal//Kalender//DE', 'X-WR-CALNAME:BBC Stendal Lizards', 'X-WR-TIMEZONE:Europe/Berlin'];
  for (const e of events) {
    lines.push('BEGIN:VEVENT', `UID:${e.id}@bbc-stendal.de`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`);
    if (e.allDay) {
      const end = new Date(e.end + 'T00:00:00Z'); end.setUTCDate(end.getUTCDate() + 1);
      lines.push(`DTSTART;VALUE=DATE:${dt(e.start)}`, `DTEND;VALUE=DATE:${end.toISOString().slice(0, 10).replace(/-/g, '')}`);
    } else lines.push(`DTSTART;TZID=Europe/Berlin:${dt(e.start)}00`, `DTEND;TZID=Europe/Berlin:${dt(e.end)}00`);
    lines.push(`SUMMARY:${esc(e.title)}`, `LOCATION:${esc(e.location)}`, `DESCRIPTION:${esc(e.description)}`, 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

const validDay = (v) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(v || '')) return false; const d = new Date(v + 'T00:00:00Z'); return !isNaN(d) && d.toISOString().slice(0, 10) === v; };
function range(url) {
  const now = new Date();
  const def = (y, m) => { const d = new Date(Date.UTC(y, m, 1)); return d.toISOString().slice(0, 10); };
  const f = url.searchParams.get('from'), t = url.searchParams.get('to');
  return [validDay(f) ? f : def(now.getFullYear(), now.getMonth() - 1), validDay(t) ? t : def(now.getFullYear() + 1, now.getMonth() + 1)];
}

// ---------- API ----------
async function api(req, res, url) {
  const p = url.pathname, m = req.method;

  if (m === 'OPTIONS') return send(res, 204, '', { ...CORS, 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Allow-Headers': 'Content-Type' });

  if (p === '/api/config' && m === 'GET') return send(res, 200, { categories: CATEGORIES, teams: TEAMS, mode: store.mode }, CORS);

  if (p === '/api/events' && m === 'GET') {
    const [from, to] = range(url);
    return send(res, 200, { events: await listCached(from, to) }, { ...CORS, 'Cache-Control': 'public, max-age=60' });
  }
  if (p === '/api/calendar.ics' && m === 'GET') {
    const [from, to] = range(url);
    return send(res, 200, ics(await listCached(from, to)), { ...CORS, 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'inline; filename="bbc-stendal.ics"' });
  }

  if (p === '/api/login' && m === 'POST') {
    const ip = req.socket.remoteAddress;
    if (throttled(ip)) return send(res, 429, { error: 'Zu viele Versuche. Bitte in 15 Minuten erneut probieren.' });
    const b = await readBody(req);
    const u = users.find((x) => x.username === String(b.username || '').trim().toLowerCase());
    // Immer hashen, damit die Antwortzeit nichts verrät
    const ok = auth.verifyPassword(String(b.password || ''), u ? u.hash : 'scrypt$x$y') && u;
    if (!ok) { attempts.get(ip).push(Date.now()); return send(res, 401, { error: 'Benutzername oder Passwort falsch.' }); }
    return send(res, 200, { token: auth.sign({ u: u.username, n: u.name }, SECRET), name: u.name });
  }

  // ---- ab hier nur angemeldete Editoren ----
  const me = currentUser(req);
  if (!me) return send(res, 401, { error: 'Nicht angemeldet.' });

  if (p === '/api/me' && m === 'GET') return send(res, 200, { username: me.u, name: me.n });

  if (p === '/api/google/status' && m === 'GET')
    return send(res, 200, { mode: store.mode, calendarId: store.mode === 'google' ? store.calendarId : null, serviceAccount: store.mode === 'google' ? store.serviceAccount : null });

  if (p === '/api/google/test' && m === 'POST') {
    try { return send(res, 200, { ok: true, ...(await store.test()) }); }
    catch (e) {
      const hint = e.status === 404 ? 'Kalender nicht gefunden oder nicht für das Service-Konto freigegeben.' : e.message;
      return send(res, 200, { ok: false, error: hint });
    }
  }

  if (p === '/api/events' && m === 'POST') {
    const r = validate(await readBody(req));
    if (r.error) return send(res, 400, { error: r.error });
    const ev = await store.create(r.value); invalidate();
    return send(res, 201, ev);
  }
  const mm = p.match(/^\/api\/events\/([^/]+)$/);
  if (mm && m === 'PUT') {
    const r = validate(await readBody(req));
    if (r.error) return send(res, 400, { error: r.error });
    const ev = await store.update(decodeURIComponent(mm[1]), r.value); invalidate();
    return send(res, 200, ev);
  }
  if (mm && m === 'DELETE') { await store.remove(decodeURIComponent(mm[1])); invalidate(); return send(res, 200, { ok: true }); }

  return send(res, 404, { error: 'Nicht gefunden.' });
}

// ---------- Statische Dateien ----------
function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') { res.writeHead(302, { Location: '/kalender/' }); return res.end(); }
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC + path.sep)) return send(res, 403, 'Verboten');
  fs.readFile(file, (err, data) => {
    if (err) {
      if (!path.extname(rel) && fs.existsSync(path.join(PUBLIC, rel, 'index.html'))) { res.writeHead(302, { Location: url.pathname + '/' }); return res.end(); }
      return send(res, 404, 'Nicht gefunden');
    }
    const embeddable = rel.startsWith('/kalender/');
    send(res, 200, data, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Content-Security-Policy': `frame-ancestors ${embeddable ? EMBED_ORIGINS : "'none'"}`,
      'Cache-Control': /\.(html|js|css|webmanifest)$/.test(rel) ? 'no-cache' : 'public, max-age=86400', // Seiten/Skripte immer frisch, Bilder dürfen gecacht werden
    });
  });
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname.startsWith('/api/')) await api(req, res, url);
    else serveStatic(req, res, url);
  } catch (e) {
    console.error(e);
    send(res, e.status && e.status < 500 ? e.status : 500, { error: e.message || 'Serverfehler' });
  }
}).listen(PORT, () => console.log(`BBC-Kalender läuft auf Port ${PORT} (${store.mode})`));
