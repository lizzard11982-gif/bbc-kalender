'use strict';
(() => {
  const $ = (id) => document.getElementById(id);
  const MONTHS = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
  const MON_SHORT = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
  const WD = ['Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag','Sonntag'];
  const WD_SHORT = ['Mo','Di','Mi','Do','Fr','Sa','So'];
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (y, m, d) => { const t = new Date(y, m, d); return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`; }; // normalisiert Monatsüberlauf
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const parse = (s) => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
  const wdIndex = (date) => (date.getDay() + 6) % 7;
  const timeOf = (s) => s.slice(11, 16);
  const longDate = (s) => { const d = parse(s); return `${WD[wdIndex(d)]}, ${d.getDate()}. ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };

  const today = new Date();
  const st = { y: today.getFullYear(), m: today.getMonth(), view: 'month', scope: 'month', events: [], cats: [], teams: [], hidden: new Set(), team: 'alle', sel: null, lastFocus: null };
  const catOf = (id) => st.cats.find((c) => c.id === id) || { label: id, color: '#031029' };

  // ----- Daten -----
  async function load() {
    $('status').className = 'status'; $('status').textContent = 'Termine werden geladen …';
    try {
      const yearMode = st.view === 'year' || (st.view === 'list' && st.scope === 'year');
      const from = yearMode ? ymd(st.y, 0, 1) : ymd(st.y, st.m - 1, 1), to = yearMode ? ymd(st.y + 1, 0, 1) : ymd(st.y, st.m + 2, 1);
      const r = await fetch(`/api/events?from=${from}&to=${to}`);
      if (!r.ok) throw new Error();
      st.events = (await r.json()).events;
      $('status').textContent = '';
    } catch {
      $('status').className = 'status err'; $('status').textContent = 'Die Termine konnten gerade nicht geladen werden. Bitte später erneut versuchen.';
      st.events = [];
    }
    render();
  }
  const visible = () => st.events.filter((e) => !st.hidden.has(e.category) && (st.team === 'alle' || e.team === 'alle' || e.team === st.team));
  const sortEv = (a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0);

  function eventsOn(dateStr, list) {
    return list.filter((e) => e.start.slice(0, 10) <= dateStr && e.end.slice(0, 10) >= dateStr).sort(sortEv);
  }

  // ----- Rendering -----
  function render() {
    const yearMode = st.view === 'year' || (st.view === 'list' && st.scope === 'year');
    $('monthLabel').textContent = yearMode ? String(st.y) : `${MONTHS[st.m]} ${st.y}`;
    $('prev').setAttribute('aria-label', yearMode ? 'Voriges Jahr' : 'Voriger Monat');
    $('next').setAttribute('aria-label', yearMode ? 'Nächstes Jahr' : 'Nächster Monat');
    $('scope').hidden = st.view !== 'list';
    $('sMonth').setAttribute('aria-pressed', st.scope === 'month');
    $('sYear').setAttribute('aria-pressed', st.scope === 'year');
    $('vMonth').setAttribute('aria-selected', st.view === 'month');
    $('vList').setAttribute('aria-selected', st.view === 'list');
    $('vYear').setAttribute('aria-selected', st.view === 'year');
    st.view === 'month' ? renderMonth() : st.view === 'year' ? renderYear() : renderList();
    renderDayPanel();
    postHeight();
  }

  function renderMonth() {
    const list = visible();
    const first = new Date(st.y, st.m, 1), startOffset = wdIndex(first);
    const gridStart = new Date(st.y, st.m, 1 - startOffset);
    const weeks = Math.ceil((startOffset + new Date(st.y, st.m + 1, 0).getDate()) / 7);
    const todayStr = ymd(today.getFullYear(), today.getMonth(), today.getDate());
    let html = `<div class="grid"><div class="dow">${WD_SHORT.map((d) => `<div>${d}</div>`).join('')}</div>`;
    for (let w = 0; w < weeks; w++) {
      html += '<div class="week">';
      for (let d = 0; d < 7; d++) {
        const cur = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + w * 7 + d);
        const ds = ymd(cur.getFullYear(), cur.getMonth(), cur.getDate());
        const evs = eventsOn(ds, list);
        const cls = ['day', cur.getMonth() !== st.m && 'other', ds === todayStr && 'today', ds === st.sel && 'sel'].filter(Boolean).join(' ');
        const label = `${cur.getDate()}. ${MONTHS[cur.getMonth()]}${evs.length ? `, ${evs.length} Termin${evs.length > 1 ? 'e' : ''}` : ''}`;
        html += `<div class="${cls}" data-day="${ds}" role="button" tabindex="0" aria-label="${esc(label)}"><span class="num">${cur.getDate()}</span>`;
        html += evs.slice(0, 3).map((e) => `<button class="pill" style="--c:${catOf(e.category).color}" data-id="${esc(e.id)}" data-d="${ds}">${e.allDay ? '' : `<span class="t">${timeOf(e.start)}</span>`}${esc(e.title)}</button>`).join('');
        if (evs.length > 3) html += `<span class="more">+ ${evs.length - 3} weitere</span>`;
        if (evs.length) html += `<span class="dots">${evs.slice(0, 5).map((e) => `<i style="--c:${catOf(e.category).color}"></i>`).join('')}</span>`;
        html += '</div>';
      }
      html += '</div>';
    }
    $('view').innerHTML = html + '</div>';
  }

  function itemHtml(e, showDay = true) {
    const c = catOf(e.category), d = parse(e.start);
    const multi = e.end.slice(0, 10) !== e.start.slice(0, 10);
    const when = e.allDay ? (multi ? `${parse(e.start).getDate()}. – ${parse(e.end).getDate()}. ${MON_SHORT[parse(e.end).getMonth()]}` : 'ganztägig') : `${timeOf(e.start)} Uhr`;
    return `<button class="item" style="--c:${c.color}" data-id="${esc(e.id)}">
      <span class="dbox"><b>${d.getDate()}</b><span>${showDay ? WD_SHORT[wdIndex(d)] + ', ' + MON_SHORT[d.getMonth()] : MON_SHORT[d.getMonth()]}</span></span>
      <span><span class="ttl">${esc(e.title)}</span><br><span class="sub">${esc(when)}${e.location ? ' · ' + esc(e.location) : ''}</span></span>
      <span class="badge" style="--c:${c.color}">${esc(c.label)}</span></button>`;
  }

  function renderList() {
    const yearMode = st.scope === 'year';
    const from = yearMode ? ymd(st.y, 0, 1) : ymd(st.y, st.m, 1), to = yearMode ? ymd(st.y + 1, 0, 1) : null;
    const list = visible().filter((e) => e.end.slice(0, 10) >= from && (!to || e.start.slice(0, 10) < to)).sort(sortEv);
    if (!list.length) { $('view').innerHTML = `<div class="list"><p class="empty">${yearMode ? `Keine Termine im Jahr ${st.y}.` : 'Keine Termine in diesem Zeitraum.'}</p></div>`; return; }
    let html = '<div class="list">', last = '';
    if (yearMode) html += `<p class="year-sum">${list.length} Termin${list.length === 1 ? '' : 'e'} im Jahr ${st.y}</p>`;
    for (const e of list) {
      const d = parse(e.start), key = `${d.getFullYear()}-${d.getMonth()}`;
      if (key !== last) { html += `<h3>${MONTHS[d.getMonth()]} ${d.getFullYear()}</h3>`; last = key; }
      html += itemHtml(e);
    }
    $('view').innerHTML = html + '</div>';
  }


  // ----- Jahresansicht: 12 Monate auf einen Blick -----
  function renderYear() {
    const list = visible();
    const byDay = {};
    const y0 = ymd(st.y, 0, 1), y1 = ymd(st.y, 11, 31);
    for (const e of list) {
      const a = e.start.slice(0, 10) < y0 ? y0 : e.start.slice(0, 10), b = e.end.slice(0, 10) > y1 ? y1 : e.end.slice(0, 10);
      if (a > y1 || b < y0) continue;
      for (let d = parse(a), end = parse(b); d <= end; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
        const k = ymd(d.getFullYear(), d.getMonth(), d.getDate());
        (byDay[k] = byDay[k] || []).push(e);
      }
    }
    const todayStr = ymd(today.getFullYear(), today.getMonth(), today.getDate());
    const total = list.filter((e) => e.end.slice(0, 10) >= y0 && e.start.slice(0, 10) <= y1).length;
    let html = `<div class="year"><p class="year-sum">${total} Termin${total === 1 ? '' : 'e'} im Jahr ${st.y} · Tag antippen für Details</p><div class="ymonths">`;
    for (let m = 0; m < 12; m++) {
      const lead = wdIndex(new Date(st.y, m, 1)), days = new Date(st.y, m + 1, 0).getDate();
      html += `<section class="ymonth"><h3><button class="ymname" data-month="${m}" aria-label="${MONTHS[m]} ${st.y} in der Monatsansicht öffnen">${MONTHS[m]}</button></h3><div class="ygrid">`;
      html += WD_SHORT.map((d, i) => `<span class="ydow${i === 6 ? ' we' : ''}">${d}</span>`).join('');
      html += '<span class="yblank"></span>'.repeat(lead);
      for (let d = 1; d <= days; d++) {
        const ds = ymd(st.y, m, d), evs = byDay[ds] || [];
        const cats = [...new Set(evs.map((e) => e.category))];
        const wd = (lead + d - 1) % 7;
        const cls = ['yday', wd === 6 && 'we', ds === todayStr && 'today', evs.length && 'has'].filter(Boolean).join(' ');
        let style = '';
        if (cats.length) {
          const cols = cats.slice(0, 4).map((c) => catOf(c).color), step = 100 / cols.length;
          style = ` style="--tint:${cols[0]};--bar:linear-gradient(90deg,${cols.map((c, i) => `${c} ${i * step}% ${(i + 1) * step}%`).join(',')})"`;
        }
        const label = `${d}. ${MONTHS[m]}${evs.length ? `, ${evs.length} Termin${evs.length > 1 ? 'e' : ''}: ${evs.slice(0, 3).map((e) => e.title).join(', ')}` : ''}`;
        html += evs.length
          ? `<button class="${cls}" data-day="${ds}"${style} aria-label="${esc(label)}" title="${esc(evs.map((e) => e.title).join('\n'))}">${d}</button>`
          : `<span class="${cls}">${d}</span>`;
      }
      html += '</div></section>';
    }
    $('view').innerHTML = html + '</div></div>';
  }

  // Tag mit mehreren Terminen: Auswahl öffnen; mit einem Termin: direkt die Details
  function openDay(ds) {
    const evs = eventsOn(ds, visible());
    if (!evs.length) return;
    if (evs.length === 1) return openEvent(evs[0].id);
    st.lastFocus = document.activeElement;
    $('dTitle').textContent = longDate(ds);
    $('dList').innerHTML = evs.map((e) => itemHtml(e, false)).join('');
    $('dayModal').hidden = false;
    $('dClose').focus();
    window.parent !== window && window.parent.postMessage({ type: 'bbc-cal-scroll-top' }, '*');
  }
  function closeDay() { $('dayModal').hidden = true; st.lastFocus && st.lastFocus.focus && st.lastFocus.focus(); }

  function renderDayPanel() {
    const p = $('dayPanel');
    if (st.view !== 'month' || !st.sel) { p.hidden = true; return; }
    const evs = eventsOn(st.sel, visible());
    p.hidden = false;
    p.innerHTML = `<h3>${esc(longDate(st.sel))}</h3>` + (evs.length ? evs.map((e) => itemHtml(e, false)).join('') : '<p class="empty" style="padding:14px 0">Kein Termin an diesem Tag.</p>');
  }

  // ----- Modal -----
  function openEvent(id) {
    const e = st.events.find((x) => x.id === id); if (!e) return;
    const c = catOf(e.category);
    st.lastFocus = document.activeElement;
    $('mStripe').style.setProperty('--c', c.color);
    const b = $('mBadge'); b.textContent = c.label; b.style.setProperty('--c', c.color);
    $('mTitle').textContent = e.title;
    const multi = e.end.slice(0, 10) !== e.start.slice(0, 10);
    let when;
    if (e.allDay) when = multi ? `${longDate(e.start)} bis ${longDate(e.end)}` : `${longDate(e.start)} (ganztägig)`;
    else when = multi ? `${longDate(e.start)}, ${timeOf(e.start)} Uhr bis ${longDate(e.end)}, ${timeOf(e.end)} Uhr`
      : `${longDate(e.start)}<br>${timeOf(e.start)} – ${timeOf(e.end)} Uhr`;
    const team = st.teams.find((t) => t.id === e.team);
    let facts = `<dt>Wann</dt><dd>${e.allDay ? esc(when) : when.replace(/(^|<br>)([^<]*)/g, (m, a, t) => a + esc(t))}</dd>`;
    if (e.location) facts += `<dt>Wo</dt><dd>${esc(e.location)} · <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(e.location)}" target="_blank" rel="noopener">Karte</a></dd>`;
    if (team && e.team !== 'alle') facts += `<dt>Team</dt><dd>${esc(team.label)}</dd>`;
    $('mFacts').innerHTML = facts;
    $('mDesc').textContent = e.description || '';
    $('mDesc').hidden = !e.description;
    let act = '<button class="btn small" id="mIcs">In Kalender speichern</button>';
    if (e.url) act += `<a class="btn ghost small" href="${esc(e.url)}" target="_blank" rel="noopener">Mehr erfahren</a>`;
    $('mActions').innerHTML = act;
    $('mIcs').onclick = () => downloadIcs(e);
    $('modal').hidden = false;
    $('mClose').focus();
    window.parent !== window && window.parent.postMessage({ type: 'bbc-cal-scroll-top' }, '*');
  }
  function closeModal() { $('modal').hidden = true; st.lastFocus && st.lastFocus.focus && st.lastFocus.focus(); }
  function downloadIcs(e) {
    const f = (s) => s.replace(/[-:]/g, ''), x = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (m) => '\\' + m);
    let t;
    if (e.allDay) { const d = parse(e.end); d.setDate(d.getDate() + 1); t = [`DTSTART;VALUE=DATE:${f(e.start)}`, `DTEND;VALUE=DATE:${ymd(d.getFullYear(), d.getMonth(), d.getDate()).replace(/-/g, '')}`]; }
    else t = [`DTSTART;TZID=Europe/Berlin:${f(e.start)}00`, `DTEND;TZID=Europe/Berlin:${f(e.end)}00`];
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//BBC Stendal//DE', 'BEGIN:VEVENT', `UID:${e.id}@bbc-stendal.de`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`, ...t,
      `SUMMARY:${x(e.title)}`, `LOCATION:${x(e.location)}`, `DESCRIPTION:${x(e.description)}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
    a.download = 'termin.ics'; document.body.appendChild(a); a.click(); a.remove();
  }

  // ----- Einbettung: Höhe an die Elternseite melden -----
  function postHeight() {
    if (window.parent === window) return;
    requestAnimationFrame(() => window.parent.postMessage({ type: 'bbc-cal-height', height: Math.max(document.documentElement.scrollHeight, $('modal').hidden ? 0 : $('modal').scrollHeight) }, '*'));
  }
  new ResizeObserver(postHeight).observe(document.body);

  // ----- Events -----
  function shift(n) {
    if (st.view === 'year' || (st.view === 'list' && st.scope === 'year')) st.y += n;
    else { const d = new Date(st.y, st.m + n, 1); st.y = d.getFullYear(); st.m = d.getMonth(); }
    st.sel = null; load();
  }
  document.addEventListener('click', (ev) => {
    const t = ev.target;
    const ctl = t.closest('[data-id]');
    if (ctl) return openEvent(ctl.dataset.id);
    const day = t.closest('.day');
    if (day) { st.sel = st.sel === day.dataset.day ? null : day.dataset.day; render(); }
    const chip = t.closest('.chip');
    if (chip) { const id = chip.dataset.cat; st.hidden.has(id) ? st.hidden.delete(id) : st.hidden.add(id); renderChips(); render(); }
    const ym = t.closest('.ymname');
    if (ym) { st.m = Number(ym.dataset.month); st.view = 'month'; st.sel = null; load(); return; }
    const yd = t.closest('.yday.has');
    if (yd) return openDay(yd.dataset.day);
    if (t === $('modal')) closeModal();
    if (t === $('dayModal')) closeDay();
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') { if (!$('modal').hidden) closeModal(); else if (!$('dayModal').hidden) closeDay(); }
    if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.classList?.contains('day')) { ev.preventDefault(); ev.target.click(); }
  });
  $('mClose').onclick = closeModal;
  $('prev').onclick = () => shift(-1);
  $('next').onclick = () => shift(1);
  $('today').onclick = () => { st.y = today.getFullYear(); st.m = today.getMonth(); st.sel = null; load(); };
  $('vMonth').onclick = () => { st.view = 'month'; load(); };
  $('vList').onclick = () => { st.view = 'list'; load(); };
  $('vYear').onclick = () => { st.view = 'year'; load(); };
  $('dClose').onclick = closeDay;
  $('sMonth').onclick = () => { st.scope = 'month'; load(); };
  $('sYear').onclick = () => { st.scope = 'year'; load(); };
  $('team').onchange = (e) => { st.team = e.target.value; render(); };
  $('subscribe').href = `webcal://${location.host}/api/calendar.ics`;

  function renderChips() {
    $('chips').innerHTML = st.cats.map((c) => `<button class="chip" style="--c:${c.color}" data-cat="${c.id}" aria-pressed="${!st.hidden.has(c.id)}"><i></i>${esc(c.label)}</button>`).join('');
  }

  (async function init() {
    try {
      const cfg = await (await fetch('/api/config')).json();
      st.cats = cfg.categories; st.teams = cfg.teams;
    } catch { st.cats = []; }
    renderChips();
    $('team').innerHTML = st.teams.map((t) => `<option value="${t.id}">${t.id === 'alle' ? 'Alle Mannschaften' : esc(t.label)}</option>`).join('');
    // Mobil startet die Liste – übersichtlicher
    if (matchMedia('(max-width: 680px)').matches) st.view = 'list';
    load();
  })();
})();
