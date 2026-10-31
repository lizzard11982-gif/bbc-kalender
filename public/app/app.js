'use strict';
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MON = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
  const WD = ['So','Mo','Di','Mi','Do','Fr','Sa'];
  const pad = (n) => String(n).padStart(2, '0');
  const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} }, del: (k) => { try { localStorage.removeItem(k); } catch {} } };
  const st = { token: store.get('bbc_token'), cats: [], teams: [], events: [], upcoming: true, editId: null };

  async function api(path, opt = {}) {
    const r = await fetch('/api' + path, { ...opt, cache: 'no-store', headers: { 'Content-Type': 'application/json', ...(st.token ? { Authorization: 'Bearer ' + st.token } : {}) }, body: opt.body ? JSON.stringify(opt.body) : undefined });
    const data = await r.json().catch(() => ({}));
    if (r.status === 401 && path !== '/login') { logout(); throw new Error('Bitte erneut anmelden.'); }
    if (!r.ok) throw new Error(data.error || 'Fehler ' + r.status);
    return data;
  }
  const catOf = (id) => st.cats.find((c) => c.id === id) || { label: id, color: '#031029' };
  const toast = (msg, bad) => { const t = $('toast'); t.textContent = msg; t.className = 'toast' + (bad ? ' bad' : ''); clearTimeout(toast.h); toast.h = setTimeout(() => (t.textContent = ''), 5000); };

  // ----- Anmeldung -----
  function showLogin() { $('app').hidden = true; $('login').hidden = false; }
  function logout() { st.token = null; store.del('bbc_token'); showLogin(); }
  $('logout').onclick = logout;
  $('loginForm').onsubmit = async (e) => {
    e.preventDefault(); $('lErr').textContent = '';
    try {
      const r = await api('/login', { method: 'POST', body: { username: $('lUser').value, password: $('lPass').value } });
      st.token = r.token; store.set('bbc_token', r.token); $('lPass').value = ''; start(r.name);
    } catch (err) { $('lErr').textContent = err.message; }
  };

  async function start(name) {
    $('login').hidden = true; $('app').hidden = false;
    $('meName').textContent = name || '';
    if (!st.cats.length) { const c = await (await fetch('/api/config')).json(); st.cats = c.categories; st.teams = c.teams; fillSelects(); }
    loadEvents(); loadGoogle();
  }

  // ----- Termine -----
  async function loadEvents() {
    const now = new Date(), from = new Date(now.getFullYear(), now.getMonth() - 12, 1), to = new Date(now.getFullYear() + 2, now.getMonth(), 1);
    const f = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const seq = loadEvents.seq = (loadEvents.seq || 0) + 1; // nur die jüngste Antwort zählt
    try { const r = (await api(`/events?from=${f(from)}&to=${f(to)}`)).events; if (seq !== loadEvents.seq) return; st.events = r; } catch (e) { toast(e.message, true); }
    renderList();
  }
  function renderList() {
    const today = new Date().toISOString().slice(0, 10);
    const todayLocal = `${new Date().getFullYear()}-${pad(new Date().getMonth() + 1)}-${pad(new Date().getDate())}`;
    let list = st.events.filter((e) => (st.upcoming ? e.end.slice(0, 10) >= todayLocal : e.end.slice(0, 10) < todayLocal));
    list.sort((a, b) => (st.upcoming ? a.start.localeCompare(b.start) : b.start.localeCompare(a.start)));
    $('list').innerHTML = list.length ? list.map((e) => {
      const c = catOf(e.category), d = new Date(e.start.slice(0, 10) + 'T00:00:00');
      const multi = e.end.slice(0, 10) !== e.start.slice(0, 10);
      const when = e.allDay ? (multi ? `${e.start.slice(8, 10)}.${e.start.slice(5, 7)}. – ${e.end.slice(8, 10)}.${e.end.slice(5, 7)}.` : 'ganztägig') : `${e.start.slice(11)}–${e.end.slice(11)} Uhr`;
      const team = st.teams.find((t) => t.id === e.team);
      return `<article class="ev" style="--c:${c.color}"><div class="dbox"><b>${d.getDate()}</b><span>${WD[d.getDay()]}, ${MON[d.getMonth()]}</span></div>
        <div><div class="t">${esc(e.title)}</div><div class="s">${esc(when)}${e.location ? ' · ' + esc(e.location) : ''}${team && e.team !== 'alle' ? ' · ' + esc(team.label) : ''}</div><span class="tag">${esc(c.label)}</span></div>
        <div class="acts">${e.readOnly ? '<span class="muted small">Spielplan (nur Anzeige)</span>' : `<button class="btn ghost small" data-edit="${esc(e.id)}">Bearbeiten</button><button class="btn danger small" data-del="${esc(e.id)}">Löschen</button>`}</div></article>`;
    }).join('') : `<p class="empty">${st.upcoming ? 'Keine kommenden Termine. Lege mit „+ Neuer Termin“ den ersten an.' : 'Keine vergangenen Termine.'}</p>`;
  }
  $('list').onclick = async (e) => {
    const ed = e.target.closest('[data-edit]'), del = e.target.closest('[data-del]');
    if (ed) openForm(st.events.find((x) => x.id === ed.dataset.edit));
    if (del) {
      const ev = st.events.find((x) => x.id === del.dataset.del);
      if (!confirm(`„${ev.title}“ wirklich löschen?\nDer Termin verschwindet auch aus dem Google-Kalender.`)) return;
      try { await api('/events/' + encodeURIComponent(ev.id), { method: 'DELETE' }); toast('Termin gelöscht.'); loadEvents(); } catch (err) { toast(err.message, true); }
    }
  };
  $('fUp').onclick = () => { st.upcoming = true; $('fUp').setAttribute('aria-pressed', true); $('fPast').setAttribute('aria-pressed', false); renderList(); };
  $('fPast').onclick = () => { st.upcoming = false; $('fUp').setAttribute('aria-pressed', false); $('fPast').setAttribute('aria-pressed', true); renderList(); };

  // ----- Formular -----
  function fillSelects() {
    $('fCat').innerHTML = st.cats.map((c) => `<option value="${c.id}">${esc(c.label)}</option>`).join('');
    $('fTeam').innerHTML = st.teams.map((t) => `<option value="${t.id}">${esc(t.label)}</option>`).join('');
  }
  function setAllDay(on, keep) {
    const s = $('fStart'), e = $('fEnd'), sv = s.value, ev = e.value;
    s.type = e.type = on ? 'date' : 'datetime-local';
    if (keep !== false) {
      s.value = on ? sv.slice(0, 10) : (sv.slice(0, 10) + 'T19:00');
      e.value = on ? ev.slice(0, 10) : (ev.slice(0, 10) + 'T21:00');
    }
  }
  $('fAll').onchange = () => setAllDay($('fAll').checked);
  $('fStart').onchange = () => { if (!$('fEnd').value || $('fEnd').value < $('fStart').value) $('fEnd').value = $('fStart').value.length > 10 ? shiftHours($('fStart').value, 2) : $('fStart').value; };
  function shiftHours(v, h) { const d = new Date(v); d.setHours(d.getHours() + h); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; }

  function openForm(ev) {
    st.editId = ev ? ev.id : null; $('fErr').textContent = '';
    $('dTitle').textContent = ev ? 'Termin bearbeiten' : 'Neuer Termin';
    $('fTitle').value = ev?.title || ''; $('fCat').value = ev?.category || 'heimspiel'; $('fTeam').value = ev?.team || 'herren';
    $('fLoc').value = ev?.location || ''; $('fDesc').value = ev?.description || ''; $('fUrl').value = ev?.url || '';
    $('fAll').checked = !!ev?.allDay;
    const t = new Date(); t.setDate(t.getDate() + 1);
    const base = `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
    $('fStart').type = $('fEnd').type = ev?.allDay ? 'date' : 'datetime-local';
    $('fStart').value = ev ? ev.start : base + 'T19:00'; $('fEnd').value = ev ? ev.end : base + 'T21:00';
    $('dlg').showModal(); $('fTitle').focus();
  }
  $('newBtn').onclick = () => openForm(null);
  $('fCancel').onclick = () => $('dlg').close();
  $('form').onsubmit = async (e) => {
    e.preventDefault(); $('fErr').textContent = ''; $('fSave').disabled = true;
    const body = { title: $('fTitle').value, category: $('fCat').value, team: $('fTeam').value, allDay: $('fAll').checked,
      start: $('fStart').value, end: $('fEnd').value, location: $('fLoc').value, description: $('fDesc').value, url: $('fUrl').value };
    try {
      await api(st.editId ? '/events/' + encodeURIComponent(st.editId) : '/events', { method: st.editId ? 'PUT' : 'POST', body });
      $('dlg').close(); toast(st.editId ? 'Änderungen gespeichert.' : 'Termin angelegt.'); loadEvents();
    } catch (err) { $('fErr').textContent = err.message; }
    $('fSave').disabled = false;
  };

  // ----- Google-Verbindung -----
  async function loadGoogle() {
    try {
      const g = await api('/google/status');
      $('gStatus').innerHTML = g.mode === 'google'
        ? `<dl class="g-status"><dt>Status</dt><dd><span class="pill-ok">Konfiguriert</span></dd><dt>Kalender-ID</dt><dd>${esc(g.calendarId)}</dd><dt>Dienstkonto</dt><dd>${esc(g.serviceAccount)} <button class="btn ghost small" id="copySa" type="button">Kopieren</button></dd></dl>`
        : `<dl class="g-status"><dt>Status</dt><dd><span class="pill-demo">Demo-Modus</span></dd><dt>Hinweis</dt><dd>Es ist noch kein Google-Kalender verbunden. Termine liegen nur im Arbeitsspeicher und gehen beim Neustart verloren. Lies die Schritte unten.</dd></dl>`;
      const c = $('copySa'); if (c) c.onclick = () => navigator.clipboard?.writeText(g.serviceAccount).then(() => (c.textContent = 'Kopiert ✓'));
    } catch {}
  }
  $('gTest').onclick = async () => {
    const b = $('gTest'); b.disabled = true; b.textContent = 'Teste …'; $('gResult').innerHTML = '';
    try {
      const r = await api('/google/test', { method: 'POST' });
      $('gResult').innerHTML = r.ok
        ? `<div class="res ${r.writable ? 'ok' : 'bad'}"><strong>${r.writable ? '✓ Verbindung steht.' : '⚠ Verbunden, aber nur Lesezugriff.'}</strong><br>Kalender: ${esc(r.name)} (${esc(r.timeZone)})${r.writable ? '' : '<br>Bitte das Dienstkonto in Google Kalender mit „Änderungen an Terminen vornehmen“ freigeben.'}</div>`
        : `<div class="res bad"><strong>✗ Keine Verbindung.</strong><br>${esc(r.error)}</div>`;
    } catch (err) { $('gResult').innerHTML = `<div class="res bad">${esc(err.message)}</div>`; }
    b.disabled = false; b.textContent = 'Verbindung testen';
  };

  // ----- Tabs / Start -----
  function tab(which) {
    $('pEvents').hidden = which !== 'e'; $('pGoogle').hidden = which !== 'g';
    $('tEvents').setAttribute('aria-selected', which === 'e'); $('tGoogle').setAttribute('aria-selected', which === 'g');
  }
  $('tEvents').onclick = () => tab('e'); $('tGoogle').onclick = () => tab('g');

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  (async () => {
    if (!st.token) return showLogin();
    try { const me = await api('/me'); start(me.name); } catch { showLogin(); }
  })();
})();
