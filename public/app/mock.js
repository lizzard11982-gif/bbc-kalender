'use strict';
// Demo-Modus: In-Memory-Termine, wenn kein Google-Zugang konfiguriert ist.
function iso(offsetDays, time) {
  const d = new Date(); d.setDate(d.getDate() + offsetDays);
  const day = d.toISOString().slice(0, 10);
  return time ? `${day}T${time}` : day;
}
function createMockStore() {
  let n = 0;
  const mk = (o) => ({ id: 'demo' + ++n, location: '', description: '', url: '', team: 'herren', ...o });
  const items = [
    mk({ title: 'BBC Stendal – USC Magdeburg II', category: 'heimspiel', start: iso(3, '19:30'), end: iso(3, '21:30'), location: 'Bürgerparkhalle, Stendal', description: 'Heimspiel der Lizards in der Landesliga. Einlass ab 18:45 Uhr, Eintritt frei. Kuchen und Getränke gibt es am Hallenbuffet.' }),
    mk({ title: 'Baskets Wolmirstedt III – BBC Stendal', category: 'auswaerts', start: iso(10, '18:00'), end: iso(10, '20:00'), location: 'Sporthalle Wolmirstedt', description: 'Auswärtsspiel. Treffpunkt 16:15 Uhr am Parkplatz Bürgerparkhalle, Fahrgemeinschaften bitte im Team abstimmen.' }),
    mk({ title: 'U16 Heimspieltag', category: 'heimspiel', team: 'jugend', start: iso(6, '10:00'), end: iso(6, '14:00'), location: 'Bürgerparkhalle, Stendal', description: 'Zwei Heimspiele am Stück. Eltern sind herzlich zum Kuchenverkauf eingeladen.' }),
    mk({ title: 'Herbst-Camp', category: 'camp', team: 'jugend', allDay: true, start: iso(14), end: iso(17), location: 'Bürgerparkhalle, Stendal', description: 'Vier Tage Basketball für Kinder und Jugendliche von 8 bis 16 Jahren. Training, Turnier und Abschlussfeier.', url: 'https://www.bbc-stendal.de' }),
    mk({ title: 'Streetball-Turnier', category: 'camp', team: 'alle', allDay: true, start: iso(27), end: iso(27), location: 'Marktplatz Stendal', description: 'Open-Air-Turnier 3x3. Anmeldung über die Vereinswebseite.' }),
    mk({ title: 'Mitgliederversammlung', category: 'verein', team: 'alle', start: iso(20, '19:00'), end: iso(20, '21:00'), location: 'Vereinsheim', description: 'Jahreshauptversammlung mit Vorstandsbericht und Wahl der Kassenprüfer.' }),
    mk({ title: 'Sponsorenabend', category: 'sponsor', team: 'alle', start: iso(33, '18:30'), end: iso(33, '21:00'), location: 'Stendal', description: 'Treffen mit unseren Partnern und Förderern, inklusive Mannschaftsvorstellung.' }),
    mk({ title: 'Pressetermin Teamfoto', category: 'sponsor', team: 'herren', start: iso(8, '17:00'), end: iso(8, '18:00'), location: 'Bürgerparkhalle', description: 'Fototermin mit der Altmark-Zeitung.' }),
    mk({ title: 'Training Herren', category: 'verein', team: 'herren', start: iso(1, '20:00'), end: iso(1, '22:00'), location: 'Bürgerparkhalle' }),
  ];
  return {
    mode: 'demo', serviceAccount: 'demo@example.invalid', calendarId: 'demo',
    async list(from, to) { return items.filter((e) => e.end.slice(0, 10) >= from.slice(0, 10) && e.start.slice(0, 10) <= to.slice(0, 10)); },
    async create(e) { const x = { ...e, id: 'demo' + ++n }; items.push(x); return x; },
    async update(id, e) { const i = items.findIndex((x) => x.id === id); if (i < 0) { const er = new Error('Termin nicht gefunden'); er.status = 404; throw er; } items[i] = { ...e, id }; return items[i]; },
    async remove(id) { const i = items.findIndex((x) => x.id === id); if (i >= 0) items.splice(i, 1); },
    async test() { throw new Error('Demo-Modus: Es ist noch kein Google-Kalender verbunden. Setze GOOGLE_SERVICE_ACCOUNT_JSON und GOOGLE_CALENDAR_ID (siehe Anleitung unten).'); },
  };
}
module.exports = { createMockStore, gamesSample: () => { const d = new Date(); d.setDate(d.getDate() + 2); const day = d.toISOString().slice(0, 10); const mk = (id, title, h) => ({ id, title, category: 'verein', team: 'alle', allDay: false, start: day + 'T' + h + ':00', end: day + 'T' + (+h.slice(0, 2) + 2) + ':00', location: '', description: '', url: '' }); return [mk('a', 'LL Herren Salzwedel - BBC I', '15:00'), mk('b', 'BL U14 BBC Stendal - Burg Towers II', '10:00'), mk('c', 'Halle gesperrt', '08:00')]; } };
