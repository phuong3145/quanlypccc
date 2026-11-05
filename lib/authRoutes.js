const express = require('express');
const { ObjectId } = require('mongodb');
const { getDb } = require('./db');
const { hashPassword, checkPassword, setSession, clearSession, loadUser, publicUser } = require('./auth');

const r = express.Router();
const wrap = (fn) => (req, res) => fn(req, res).catch((e) => { console.error(e); res.status(500).json({ error: e.message }); });
const oid = (id) => { try { return new ObjectId(id); } catch { return null; } };
const ROLES = ['admin', 'canbo', 'xem'];
const ip = (req) => (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
const validPw = (p) => typeof p === 'string' && p.length >= 6;
const log = async (db, data) => db.collection('loginLogs').insertOne({ ...data, at: new Date() });

r.get('/auth/status', wrap(async (req, res) => {
  const db = await getDb();
  const n = await db.collection('users').countDocuments();
  if (n === 0) return res.json({ needSetup: true });
  const u = await loadUser(req);
  res.json({ user: u ? publicUser(u) : null });
}));

// Tạo quản trị viên đầu tiên (chỉ khi chưa có người dùng nào)
r.post('/auth/setup', wrap(async (req, res) => {
  const db = await getDb();
  if (await db.collection('users').countDocuments()) return res.status(403).json({ error: 'Hệ thống đã được thiết lập' });
  const { username, password, hoTen } = req.body;
  if (!username || !validPw(password)) return res.status(400).json({ error: 'Cần tên đăng nhập và mật khẩu ≥ 6 ký tự' });
  const u = { username: username.trim().toLowerCase(), hoTen: hoTen || username, role: 'admin', active: true, sessionVersion: 0, passwordHash: hashPassword(password), createdAt: new Date() };
  u._id = (await db.collection('users').insertOne(u)).insertedId;
  await db.collection('users').createIndex({ username: 1 }, { unique: true });
  setSession(req, res, u);
  res.json({ user: publicUser(u) });
}));

r.post('/auth/login', wrap(async (req, res) => {
  const db = await getDb();
  const users = db.collection('users');
  const username = String(req.body.username || '').trim().toLowerCase();
  const u = await users.findOne({ username });
  const fail = async (msg, code = 401) => { await log(db, { username, ip: ip(req), ok: false, note: msg }); return res.status(code).json({ error: msg }); };
  if (!u) return fail('Sai tên đăng nhập hoặc mật khẩu');
  if (u.lockUntil && u.lockUntil > new Date()) return fail('Tài khoản bị tạm khóa do nhập sai nhiều lần, thử lại sau 15 phút', 429);
  if (!u.active) return fail('Tài khoản đã bị vô hiệu hóa', 403);
  if (!checkPassword(String(req.body.password || ''), u.passwordHash)) {
    const failed = (u.failed || 0) + 1;
    await users.updateOne({ _id: u._id }, { $set: failed >= 5 ? { failed: 0, lockUntil: new Date(Date.now() + 15 * 60000) } : { failed } });
    return fail('Sai tên đăng nhập hoặc mật khẩu');
  }
  await users.updateOne({ _id: u._id }, { $set: { failed: 0, lastLogin: new Date() }, $unset: { lockUntil: '' } });
  await log(db, { username, ip: ip(req), ok: true });
  setSession(req, res, u);
  res.json({ user: publicUser(u) });
}));

r.post('/auth/logout', (req, res) => { clearSession(res); res.json({ ok: true }); });

r.post('/auth/password', wrap(async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!checkPassword(String(oldPassword || ''), req.user.passwordHash)) return res.status(400).json({ error: 'Mật khẩu cũ không đúng' });
  if (!validPw(newPassword)) return res.status(400).json({ error: 'Mật khẩu mới ≥ 6 ký tự' });
  const db = await getDb();
  const sv = (req.user.sessionVersion || 0) + 1;
  await db.collection('users').updateOne({ _id: req.user._id }, { $set: { passwordHash: hashPassword(newPassword), sessionVersion: sv } });
  setSession(req, res, { ...req.user, sessionVersion: sv });
  res.json({ ok: true });
}));

/* ---------- Quản trị tài khoản ---------- */
const activeAdmins = (db, excludeId) => db.collection('users').countDocuments({ role: 'admin', active: true, ...(excludeId ? { _id: { $ne: excludeId } } : {}) });

r.get('/admin/users', wrap(async (req, res) => {
  const db = await getDb();
  res.json((await db.collection('users').find().sort({ createdAt: 1 }).toArray()).map(publicUser));
}));
r.post('/admin/users', wrap(async (req, res) => {
  const db = await getDb();
  const { username, password, hoTen, role = 'canbo' } = req.body;
  if (!username || !validPw(password)) return res.status(400).json({ error: 'Cần tên đăng nhập và mật khẩu ≥ 6 ký tự' });
  if (!ROLES.includes(role)) return res.status(400).json({ error: 'Vai trò không hợp lệ' });
  const name = username.trim().toLowerCase();
  if (await db.collection('users').findOne({ username: name })) return res.status(409).json({ error: 'Tên đăng nhập đã tồn tại' });
  const u = { username: name, hoTen: hoTen || name, role, active: true, sessionVersion: 0, passwordHash: hashPassword(password), createdAt: new Date() };
  u._id = (await db.collection('users').insertOne(u)).insertedId;
  res.json(publicUser(u));
}));
r.put('/admin/users/:id', wrap(async (req, res) => {
  const db = await getDb();
  const _id = oid(req.params.id);
  const set = {};
  if (req.body.hoTen !== undefined) set.hoTen = req.body.hoTen;
  if (req.body.role !== undefined) { if (!ROLES.includes(req.body.role)) return res.status(400).json({ error: 'Vai trò không hợp lệ' }); set.role = req.body.role; }
  if (req.body.active !== undefined) set.active = !!req.body.active;
  const demote = (set.role && set.role !== 'admin') || set.active === false;
  if (demote && String(_id) === String(req.user._id) && !(await activeAdmins(db, _id))) return res.status(400).json({ error: 'Không thể bỏ quyền quản trị viên cuối cùng' });
  const upd = { $set: set };
  if (req.body.password) {
    if (!validPw(req.body.password)) return res.status(400).json({ error: 'Mật khẩu ≥ 6 ký tự' });
    set.passwordHash = hashPassword(req.body.password);
    set.failed = 0;
    upd.$unset = { lockUntil: '' };
  }
  if (set.passwordHash || set.active === false || set.role) upd.$inc = { sessionVersion: 1 }; // buộc đăng nhập lại
  if (!Object.keys(set).length) return res.json({ ok: true });
  await db.collection('users').updateOne({ _id }, upd);
  res.json({ ok: true });
}));
r.post('/admin/users/:id/logout', wrap(async (req, res) => {
  const db = await getDb();
  await db.collection('users').updateOne({ _id: oid(req.params.id) }, { $inc: { sessionVersion: 1 } });
  res.json({ ok: true });
}));
r.post('/admin/users/:id/unlock', wrap(async (req, res) => {
  const db = await getDb();
  await db.collection('users').updateOne({ _id: oid(req.params.id) }, { $set: { failed: 0 }, $unset: { lockUntil: '' } });
  res.json({ ok: true });
}));
r.delete('/admin/users/:id', wrap(async (req, res) => {
  const db = await getDb();
  const _id = oid(req.params.id);
  if (String(_id) === String(req.user._id)) return res.status(400).json({ error: 'Không thể xóa chính mình' });
  await db.collection('users').deleteOne({ _id });
  res.json({ ok: true });
}));
r.get('/admin/logs', wrap(async (req, res) => {
  const db = await getDb();
  res.json(await db.collection('loginLogs').find().sort({ at: -1 }).limit(200).toArray());
}));

module.exports = r;
