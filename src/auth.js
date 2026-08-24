import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
const SCRYPT_KEYLEN = 32;
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  return `scrypt$${salt}$${hash}`;
}
export function verifyPassword(password, stored) {
  try {
    const [, salt, hash] = stored.split('$');
    const test = crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(test, 'hex'));
  } catch { return false; }
}
export function signToken(payload, secret, expiresIn = '2h') { return jwt.sign(payload, secret, { expiresIn }); }
export function verifyToken(token, secret) { try { return jwt.verify(token, secret); } catch { return null; } }
