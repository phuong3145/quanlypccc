const crypto = require('crypto');
const { ObjectId } = require('mongodb');
const { getDb } = require('./db');

const COOKIE = 'pccc_session';
const TTL = 7 * 24 * 3600; // giây
const secret = () => process.env.AUTH_SECRET || crypto.createHash('sha256').update('pccc|' + (process.env.MONGODB_URI || 'dev')).digest('hex');

const ROLES = ['admin', 'banchihuy', 'canbo', 'xem'];

const PERMISSION_KEYS = [
  'viewAllFacilities',
  'manageFacilities',
  'assignFacilityOwner',
  'manageTypes',
  'manageInspections',
  'manageChanges',
  'manageSystem',
];

const ROLE_DEFAULT_PERMISSIONS = {
  admin: {
    viewAllFacilities: true,
    manageFacilities: true,
    assignFacilityOwner: true,
    manageTypes: true,
    manageInspections: true,
    manageChanges: true,
    manageSystem: true,
  },
  banchihuy: {
    viewAllFacilities: true,
    manageFacilities: true,
    assignFacilityOwner: true,
    manageTypes: true,
    manageInspections: true,
    manageChanges: true,
    manageSystem: false,
  },
  canbo: {
    viewAllFacilities: false,
    manageFacilities: true,
    assignFacilityOwner: false,
    manageTypes: false,
    manageInspections: true,
    manageChanges: true,
    manageSystem: false,
  },
  xem: {
    viewAllFacilities: false,
    manageFacilities: false,
    assignFacilityOwner: false,
    manageTypes: false,
    manageInspections: false,
    manageChanges: false,
    manageSystem: false,
  },
};

function getEffectivePermissions(u) {
  if (!u) return { ...ROLE_DEFAULT_PERMISSIONS.xem };
  const base = ROLE_DEFAULT_PERMISSIONS[u.role] || ROLE_DEFAULT_PERMISSIONS.canbo;
  const custom = u.permissions && typeof u.permissions === 'object' ? u.permissions : {};
  const out = { ...base };
  for (const k of PERMISSION_KEYS) {
    if (typeof custom[k] === 'boolean') out[k] = custom[k];
  }
  return out;
}

function sanitizePermissions(input, role = 'canbo') {
  const base = ROLE_DEFAULT_PERMISSIONS[role] || ROLE_DEFAULT_PERMISSIONS.canbo;
  const out = { ...base };
  if (input && typeof input === 'object') {
    for (const k of PERMISSION_KEYS) {
      if (typeof input[k] === 'boolean') out[k] = input[k];
    }
  }
  return out;
}

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

const publicUser = (u) => ({
  _id: u._id,
  username: u.username,
  hoTen: u.hoTen,
  role: u.role,
  permissions: getEffectivePermissions(u),
  active: u.active,
  lastLogin: u.lastLogin,
  createdAt: u.createdAt,
});

/* ---- Middleware ---- */
async function loadUser(req) {
  const p = verify(readCookie(req));
  if (!p) return null;
  let _id;
  try { _id = new ObjectId(p.uid); } catch { return null; }
  const db = await getDb();
  const u = await db.collection('users').findOne({ _id });
  if (!u || !u.active || (u.sessionVersion || 0) !== p.sv) return null;
  u.perms = getEffectivePermissions(u);
  return u;
}
const PUBLIC = ['/auth/login', '/auth/setup', '/auth/status'];
async function authMiddleware(req, res, next) {
  try {
    if (PUBLIC.includes(req.path)) return next();
    const u = await loadUser(req);
    if (!u) return res.status(401).json({ error: 'Chưa đăng nhập' });
    req.user = u;
    const perms = u.perms;
    if (req.path.startsWith('/admin') && !perms.manageSystem) {
      return res.status(403).json({ error: 'Tài khoản không có quyền Quản trị hệ thống' });
    }
    if (req.method !== 'GET') {
      if (req.path.startsWith('/types') && !perms.manageTypes) {
        return res.status(403).json({ error: 'Tài khoản không có quyền chỉnh sửa danh mục loại hình' });
      }
      if (req.path.startsWith('/facilities') && !perms.manageFacilities) {
        return res.status(403).json({ error: 'Tài khoản không có quyền thêm/sửa/xóa cơ sở' });
      }
      if (req.path.startsWith('/inspections') && !perms.manageInspections) {
        return res.status(403).json({ error: 'Tài khoản không có quyền thao tác biên bản kiểm tra' });
      }
      if (req.path.startsWith('/changes') && !perms.manageChanges) {
        return res.status(403).json({ error: 'Tài khoản không có quyền thao tác tăng/giảm cơ sở' });
      }
    }
    next();
  } catch (e) { res.status(500).json({ error: e.message }); }
}

module.exports = {
  ROLES,
  PERMISSION_KEYS,
  ROLE_DEFAULT_PERMISSIONS,
  getEffectivePermissions,
  sanitizePermissions,
  hashPassword,
  checkPassword,
  setSession,
  clearSession,
  authMiddleware,
  loadUser,
  publicUser,
};
