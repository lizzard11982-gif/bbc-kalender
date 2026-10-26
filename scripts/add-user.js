#!/usr/bin/env node
'use strict';
// Nutzung: node scripts/add-user.js <benutzername> "<Anzeigename>" <passwort>
// Gibt einen JSON-Eintrag aus, den du in die Umgebungsvariable USERS (JSON-Array) einfügst.
const { hashPassword } = require('../lib/auth');
const [, , username, name, password] = process.argv;
if (!username || !name || !password) {
  console.error('Nutzung: node scripts/add-user.js <benutzername> "<Anzeigename>" <passwort>');
  process.exit(1);
}
if (password.length < 8) { console.error('Passwort bitte mit mindestens 8 Zeichen.'); process.exit(1); }
console.log(JSON.stringify({ username: username.toLowerCase(), name, hash: hashPassword(password) }));
