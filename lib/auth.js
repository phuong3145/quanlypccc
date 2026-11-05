const crypto = require('crypto');
const { ObjectId } = require('mongodb');
const { getDb } = require('./db');

const COOKIE = 'pccc_session';
const TTL = 7 * 24 * 3600; // giây
const secret = () => process.env.AUTH_SECRET || crypto.createHash('sha256').update('pccc|' + (process.env.MONGODB_URI || 'dev')).digest('hex');

/* ---- Mật khẩu (scrypt) ---- */
function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return salt + ':' + crypto.scryptSync(pw, salt, 64).toString('hex');
}
function checkPassword(pw, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const h = crypto.scryptSync(pw, salt, 64);
  const b = Buffer.from(hash, 'hex');
  return b.length === h.length && crypto.timingSafeEqual(b, h);
}

/* ---- Token ký HMAC ---- */
const b64 = (s) => Buffer.from(s).toString('base64url');
function sign(payload) {
  const body = b64(JSON.stringify(payload));
  return body + '.' + crypto.createHmac('sha256', secret()).update(body).digest('base64url');
}
function verify(token) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return null;
  const exp = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  if (sig.length !== exp.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(exp))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    return p.exp > Date.now() / 1000 ? p : null;
  } catch { return null; }
}
const readCookie = (req) => {
  const m = (req.headers.cookie || '').match(new RegExp('(?:^|; )' + COOKIE + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : null;
};
function setSession(req, res, user) {
  const token = sign({ uid: String(user._id), sv: user.sessionVersion || 0, exp: Math.floor(Date.now() / 1000) + TTL });
  const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${TTL}${secure}`);
}
const clearSession = (res) => res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; Path=/; Max-Age=0`);

const publicUser = (u) => ({ _id: u._id, username: u.username, hoTen: u.hoTen, role: u.role, active: u.active, lastLogin: u.lastLogin, createdAt: u.createdAt });

/* ---- Middleware ---- */
async function loadUser(req) {
  const p = verify(readCookie(req));
  if (!p) return null;
  let _id;
  try { _id = new ObjectId(p.uid); } catch { return null; }
  const db = await getDb();
  const u = await db.collection('users').findOne({ _id });
  if (!u || !u.active || (u.sessionVersion || 0) !== p.sv) return null;
  return u;
}
const PUBLIC = ['/auth/login', '/auth/setup', '/auth/status'];
async function authMiddleware(req, res, next) {
  try {
    if (PUBLIC.includes(req.path)) return next();
    const u = await loadUser(req);
    if (!u) return res.status(401).json({ error: 'Chưa đăng nhập' });
    req.user = u;
    if (req.path.startsWith('/admin') && u.role !== 'admin') return res.status(403).json({ error: 'Chỉ quản trị viên' });
    if (req.method !== 'GET') {
      const adminOnly = req.path.startsWith('/types') || req.path.startsWith('/admin');
      if (adminOnly && u.role !== 'admin') return res.status(403).json({ error: 'Chỉ quản trị viên được thực hiện' });
      if (!['admin', 'canbo'].includes(u.role) && req.path !== '/auth/logout' && req.path !== '/auth/password')
        return res.status(403).json({ error: 'Tài khoản chỉ có quyền xem' });
    }
    next();
  } catch (e) { res.status(500).json({ error: e.message }); }
}

module.exports = { hashPassword, checkPassword, setSession, clearSession, authMiddleware, loadUser, publicUser };
