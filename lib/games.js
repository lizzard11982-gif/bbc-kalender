'use strict';
// Spielplan-Kalender (nur lesen): ordnet Termine Heim-/Auswärtsspiel zu.
// Regel: Titel "Heim - Gast". Steht der eigene Verein vorn -> Heimspiel, hinten -> Auswärtsspiel.
const CLUB = new RegExp(process.env.GAMES_CLUB_REGEX || '\\bBBC\\b(?!\\s+Halle)|Stendal', 'i');
const IGNORE = new RegExp(process.env.GAMES_IGNORE_REGEX || 'Halle gesperrt|Heimspiele|Handball', 'i');
// Nur Spiele ab diesem Datum übernehmen (Standard: 01.11.2026), änderbar per GAMES_FROM=JJJJ-MM-TT
const FROM = process.env.GAMES_FROM || '2026-11-01';
const SPLIT = /\s+[-–—]\s+/;

function teamOf(t) {
  if (/\bU\s?1[0-9]\b/i.test(t) || /jugend/i.test(t)) return 'jugend';
  if (/herren|Ü\s?40|\bLL\b|Ligapokal/i.test(t)) return 'herren';
  return 'alle';
}

// -> { category, team } oder null (Termin überspringen)
function classify(title) {
  const t = String(title || '').trim();
  if (!t || IGNORE.test(t)) return null;
  const parts = t.split(SPLIT);
  if (parts.length >= 2) {
    const left = parts[0], right = parts.slice(1).join(' - ');
    if (CLUB.test(left)) return { category: 'heimspiel', team: teamOf(t) };
    if (CLUB.test(right)) return { category: 'auswaerts', team: teamOf(t) };
    return null; // Spiel ohne unseren Verein
  }
  if (/camp|turnier/i.test(t) && CLUB.test(t)) return { category: 'camp', team: teamOf(t) };
  return null;
}

function mapGames(items, prefix) {
  const out = [];
  for (const ev of items) {
    if (ev.start.slice(0, 10) < FROM) continue;
    const c = classify(ev.title);
    if (!c) continue;
    out.push({ ...ev, id: `g:${prefix}:${ev.id}`, category: c.category, team: c.team, readOnly: true });
  }
  return out;
}

module.exports = { classify, mapGames };
