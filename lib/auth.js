'use strict';
const crypto = require('crypto');

const b64u = (b) => Buffer.from(b).toString('base64url');
function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('base64url');
  const h = crypto.scryptSync(pw, salt, 32).toString('base64url');
  return `scrypt$${salt}$${h}`;
}
function verifyPassword(pw, stored) {
  const [alg, salt, h] = String(stored || '').split('$');
  if (alg !== 'scrypt' || !salt || !h) return false;
  const a = crypto.scryptSync(pw, salt, 32), b = Buffer.from(h, 'base64url');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function sign(payload, secret, ttlSec = 60 * 60 * 24 * 14) {
  const body = b64u(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSec }));
  const mac = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${mac}`;
}
function verify(token, secret) {
  const [body, mac] = String(token || '').split('.');
  if (!body || !mac) return null;
  const exp = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  const a = Buffer.from(mac), b = Buffer.from(exp);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    return p.exp > Date.now() / 1000 ? p : null;
  } catch { return null; }
}
module.exports = { hashPassword, verifyPassword, sign, verify };
