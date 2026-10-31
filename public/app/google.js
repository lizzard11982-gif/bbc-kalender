'use strict';
// Google-Kalender-Anbindung per Service-Account – ohne externe Pakete.
const crypto = require('crypto');

const TZ = 'Europe/Berlin';
const SCOPE = 'https://www.googleapis.com/auth/calendar';
const API = 'https://www.googleapis.com/calendar/v3';

const b64u = (b) => Buffer.from(b).toString('base64url');

function loadCredentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    const json = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
    const c = JSON.parse(json);
    if (!c.client_email || !c.private_key) return null;
    c.private_key = c.private_key.replace(/\\n/g, '\n');
    return c;
  } catch { return null; }
}

let tokenCache = { token: null, exp: 0 };

async function accessToken(creds) {
  if (tokenCache.token && Date.now() < tokenCache.exp - 60000) return tokenCache.token;
  const now = Math.floor(Date.now() / 1000);
  const head = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64u(JSON.stringify({
    iss: creds.client_email, scope: SCOPE,
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  }));
  const sig = crypto.createSign('RSA-SHA256').update(`${head}.${claim}`).sign(creds.private_key).toString('base64url');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${head}.${claim}.${sig}`,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Google-Anmeldung fehlgeschlagen: ${data.error_description || data.error}`);
  tokenCache = { token: data.access_token, exp: Date.now() + data.expires_in * 1000 };
  return tokenCache.token;
}

async function call(creds, method, path, body, query) {
  const token = await accessToken(creds);
  const url = new URL(API + path);
  if (query) for (const [k, v] of Object.entries(query)) if (v != null) url.searchParams.set(k, v);
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(data.error?.message || `Google-API Fehler ${res.status}`);
    e.status = res.status;
    throw e;
  }
  return data;
}

// ---------- Datum-Hilfen (Berlin-Lokalzeit) ----------
function toBerlinLocal(iso) {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(new Date(iso));
  return parts.replace(' ', 'T'); // YYYY-MM-DDTHH:mm
}
function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// ---------- Mapping Google <-> App ----------
function fromGoogle(g) {
  const priv = g.extendedProperties?.private || {};
  const allDay = !!g.start?.date;
  let start, end;
  if (allDay) { start = g.start.date; end = addDays(g.end.date, -1); if (end < start) end = start; }
  else { start = toBerlinLocal(g.start.dateTime); end = toBerlinLocal(g.end.dateTime); }
  return {
    id: g.id,
    title: g.summary || '(ohne Titel)',
    category: priv.category || 'verein',
    team: priv.team || 'alle',
    allDay, start, end,
    location: g.location || '',
    description: g.description || '',
    url: priv.url || '',
  };
}
function toGoogle(e) {
  const g = {
    summary: e.title,
    location: e.location || undefined,
    description: e.description || undefined,
    extendedProperties: { private: { category: e.category, team: e.team, url: e.url || '' } },
  };
  if (e.allDay) {
    g.start = { date: e.start.slice(0, 10) };
    g.end = { date: addDays((e.end || e.start).slice(0, 10), 1) };
  } else {
    g.start = { dateTime: e.start + ':00', timeZone: TZ };
    g.end = { dateTime: (e.end || e.start) + ':00', timeZone: TZ };
  }
  return g;
}

function createGoogleStore(creds, calendarId) {
  const cal = encodeURIComponent(calendarId);
  return {
    mode: 'google',
    serviceAccount: creds.client_email,
    calendarId,
    async list(from, to) {
      const out = [];
      let pageToken;
      do {
        const r = await call(creds, 'GET', `/calendars/${cal}/events`, null, {
          timeMin: new Date(from).toISOString(), timeMax: new Date(to).toISOString(),
          singleEvents: 'true', orderBy: 'startTime', maxResults: '250', pageToken,
        });
        out.push(...(r.items || []).filter((i) => i.status !== 'cancelled').map(fromGoogle));
        pageToken = r.nextPageToken;
      } while (pageToken);
      return out;
    },
    async create(e) { return fromGoogle(await call(creds, 'POST', `/calendars/${cal}/events`, toGoogle(e))); },
    async update(id, e) { return fromGoogle(await call(creds, 'PUT', `/calendars/${cal}/events/${encodeURIComponent(id)}`, toGoogle(e))); },
    async remove(id) { await call(creds, 'DELETE', `/calendars/${cal}/events/${encodeURIComponent(id)}`); },
    async test() {
      const meta = await call(creds, 'GET', `/calendars/${cal}`);
      let writable = true;
      try {
        const ent = await call(creds, 'GET', `/users/me/calendarList/${cal}`);
        writable = ['owner', 'writer'].includes(ent.accessRole);
      } catch (err) { writable = err.status === 404 ? false : true; }
      return { name: meta.summary, timeZone: meta.timeZone, writable };
    },
  };
}

// Fremder Kalender nur zum Lesen (z. B. Spielplan)
function createReadOnlySource(creds, calendarId) {
  const cal = encodeURIComponent(calendarId);
  return {
    async list(from, to) {
      const out = [];
      let pageToken;
      do {
        const r = await call(creds, 'GET', `/calendars/${cal}/events`, null, {
          timeMin: new Date(from).toISOString(), timeMax: new Date(to).toISOString(),
          singleEvents: 'true', orderBy: 'startTime', maxResults: '250', pageToken,
        });
        out.push(...(r.items || []).filter((i) => i.status !== 'cancelled').map(fromGoogle));
        pageToken = r.nextPageToken;
      } while (pageToken);
      return out;
    },
  };
}

module.exports = { loadCredentials, createGoogleStore, createReadOnlySource };
