const express = require('express');
const { ObjectId } = require('mongodb');
const { getDb } = require('../lib/db');

const app = express();
app.use(express.json({ limit: '2mb' }));

const { authMiddleware } = require('../lib/auth');
app.use('/api', authMiddleware);
app.use('/api', require('../lib/authRoutes'));

const wrap = (fn) => (req, res) =>
  fn(req, res).catch((e) => {
    console.error(e);
    res.status(500).json({ error: e.message });
  });
const oid = (id) => {
  try { return new ObjectId(id); } catch { return null; }
};
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const clean = (body, allowed) => {
  const o = {};
  for (const k of allowed) if (body[k] !== undefined) o[k] = body[k];
  return o;
};

const FAC_FIELDS = [
  'soHoSo', 'soTaiKhoan', 'ten', 'soNha', 'khuPho', 'phuong', 'linhVuc', 'loaiHinh',
  'thangNamHoatDong', 'soTang', 'khoiTich', 'dienTichSan', 'thongTinDacThu', 'phanLoai',
  'thamDuyet', 'tinhTrangViPham', 'donViQuanLy', 'ghiChu', 'nguoiDaiDien', 'dienThoai',
  'soTangHam', 'dienTichMatBang', 'nhomLoaiHinh',
];
const num = (o, ks) => ks.forEach((k) => { if (o[k] !== undefined && o[k] !== '') o[k] = Number(o[k]); });

/* ---------- Loại hình ---------- */
app.get('/api/types', wrap(async (req, res) => {
  const db = await getDb();
  res.json(await db.collection('types').find().sort({ ten: 1 }).toArray());
}));
app.post('/api/types', wrap(async (req, res) => {
  const db = await getDb();
  const d = clean(req.body, ['ten', 'linhVuc', 'moTa', 'chuKyKiemTraThang']);
  if (!d.ten) return res.status(400).json({ error: 'Thiếu tên loại hình' });
  num(d, ['chuKyKiemTraThang']);
  const r = await db.collection('types').insertOne(d);
  res.json({ _id: r.insertedId, ...d });
}));
app.put('/api/types/:id', wrap(async (req, res) => {
  const db = await getDb();
  const d = clean(req.body, ['ten', 'linhVuc', 'moTa', 'chuKyKiemTraThang']);
  num(d, ['chuKyKiemTraThang']);
  await db.collection('types').updateOne({ _id: oid(req.params.id) }, { $set: d });
  res.json({ ok: true });
}));
app.delete('/api/types/:id', wrap(async (req, res) => {
  const db = await getDb();
  await db.collection('types').deleteOne({ _id: oid(req.params.id) });
  res.json({ ok: true });
}));

/* ---------- Cơ sở ---------- */
app.get('/api/facilities', wrap(async (req, res) => {
  const db = await getDb();
  const { q, loaiHinh, phuong, trangThai = 'hoatdong', linhVuc } = req.query;
  const page = Math.max(1, +req.query.page || 1);
  const limit = Math.min(500, +req.query.limit || 20);
  const f = {};
  if (trangThai !== 'all') f.trangThai = trangThai;
  if (loaiHinh) f.loaiHinh = loaiHinh;
  if (phuong) f.phuong = phuong;
  if (linhVuc) f.linhVuc = linhVuc;
  if (q) {
    const r = new RegExp(esc(q), 'i');
    f.$or = [{ ten: r }, { soHoSo: r }, { soTaiKhoan: r }, { soNha: r }, { khuPho: r }];
  }
  const col = db.collection('facilities');
  const [items, total] = await Promise.all([
    col.find(f).sort({ ten: 1 }).skip((page - 1) * limit).limit(limit).toArray(),
    col.countDocuments(f),
  ]);
  res.json({ items, total, page, limit });
}));
app.get('/api/facilities/:id', wrap(async (req, res) => {
  const db = await getDb();
  const f = await db.collection('facilities').findOne({ _id: oid(req.params.id) });
  if (!f) return res.status(404).json({ error: 'Không tìm thấy' });
  res.json(f);
}));
app.post('/api/facilities', wrap(async (req, res) => {
  const db = await getDb();
  const d = clean(req.body, FAC_FIELDS);
  if (!d.ten) return res.status(400).json({ error: 'Thiếu tên cơ sở' });
  num(d, ['soTang', 'soTangHam', 'khoiTich', 'dienTichSan', 'dienTichMatBang']);
  d.trangThai = 'hoatdong';
  d.createdAt = new Date();
  const r = await db.collection('facilities').insertOne(d);
  res.json({ _id: r.insertedId, ...d });
}));
app.put('/api/facilities/:id', wrap(async (req, res) => {
  const db = await getDb();
  const d = clean(req.body, FAC_FIELDS);
  num(d, ['soTang', 'soTangHam', 'khoiTich', 'dienTichSan', 'dienTichMatBang']);
  d.updatedAt = new Date();
  await db.collection('facilities').updateOne({ _id: oid(req.params.id) }, { $set: d });
  res.json({ ok: true });
}));
app.delete('/api/facilities/:id', wrap(async (req, res) => {
  const db = await getDb();
  await db.collection('facilities').deleteOne({ _id: oid(req.params.id) });
  res.json({ ok: true });
}));

/* ---------- Biên bản kiểm tra ---------- */
const INSP_FIELDS = [
  'facilityId', 'ngayKiemTra', 'doanKiemTra', 'nguoiDaiDien', 'loaiKiemTra',
  'checklist', 'viPham', 'kienNghi', 'hanKhacPhuc', 'ketLuan',
];
app.get('/api/inspections', wrap(async (req, res) => {
  const db = await getDb();
  const f = {};
  if (req.query.facilityId) f.facilityId = req.query.facilityId;
  res.json(await db.collection('inspections').find(f).sort({ ngayKiemTra: -1 }).limit(500).toArray());
}));
app.get('/api/inspections/:id', wrap(async (req, res) => {
  const db = await getDb();
  const i = await db.collection('inspections').findOne({ _id: oid(req.params.id) });
  if (!i) return res.status(404).json({ error: 'Không tìm thấy' });
  const facility = await db.collection('facilities').findOne({ _id: oid(i.facilityId) });
  res.json({ ...i, facility });
}));
app.post('/api/inspections', wrap(async (req, res) => {
  const db = await getDb();
  const d = clean(req.body, INSP_FIELDS);
  if (!d.facilityId) return res.status(400).json({ error: 'Chưa chọn cơ sở' });
  d.createdAt = new Date();
  const count = await db.collection('inspections').countDocuments();
  d.soBienBan = `${count + 1}/BB-KT`;
  const r = await db.collection('inspections').insertOne(d);
  await db.collection('facilities').updateOne(
    { _id: oid(d.facilityId) },
    { $set: { lanKiemTraCuoi: d.ngayKiemTra, ketQuaKiemTraCuoi: d.ketLuan } }
  );
  res.json({ _id: r.insertedId, ...d });
}));
app.put('/api/inspections/:id', wrap(async (req, res) => {
  const db = await getDb();
  await db.collection('inspections').updateOne({ _id: oid(req.params.id) }, { $set: clean(req.body, INSP_FIELDS) });
  res.json({ ok: true });
}));
app.delete('/api/inspections/:id', wrap(async (req, res) => {
  const db = await getDb();
  await db.collection('inspections').deleteOne({ _id: oid(req.params.id) });
  res.json({ ok: true });
}));

/* ---------- Tăng / giảm cơ sở ---------- */
app.get('/api/changes', wrap(async (req, res) => {
  const db = await getDb();
  const f = {};
  if (req.query.thang) f.thang = req.query.thang;
  if (req.query.loai) f.loai = req.query.loai;
  res.json(await db.collection('changes').find(f).sort({ createdAt: -1 }).toArray());
}));
// body: { loai:'tang'|'giam', thang:'2026-10', lyDo, facilityId (giảm), facility:{...} (tăng) }
app.post('/api/changes', wrap(async (req, res) => {
  const db = await getDb();
  const { loai, thang, lyDo } = req.body;
  if (!['tang', 'giam'].includes(loai) || !thang) return res.status(400).json({ error: 'Thiếu loại hoặc tháng' });
  const facs = db.collection('facilities');
  let facility;
  if (loai === 'tang') {
    const d = clean(req.body.facility || {}, FAC_FIELDS);
    if (!d.ten) return res.status(400).json({ error: 'Thiếu thông tin cơ sở' });
    num(d, ['soTang', 'soTangHam', 'khoiTich', 'dienTichSan', 'dienTichMatBang']);
    Object.assign(d, { trangThai: 'hoatdong', thangTang: thang, createdAt: new Date() });
    const r = await facs.insertOne(d);
    facility = { _id: r.insertedId, ...d };
  } else {
    const _id = oid(req.body.facilityId);
    facility = await facs.findOne({ _id });
    if (!facility) return res.status(404).json({ error: 'Không tìm thấy cơ sở' });
    await facs.updateOne({ _id }, { $set: { trangThai: 'giam', thangGiam: thang, lyDoGiam: lyDo || '' } });
  }
  const rec = { loai, thang, lyDo: lyDo || '', facilityId: String(facility._id), snapshot: facility, createdAt: new Date() };
  const r = await db.collection('changes').insertOne(rec);
  res.json({ _id: r.insertedId, ...rec });
}));
// Hủy phiếu tăng/giảm (hoàn tác)
app.delete('/api/changes/:id', wrap(async (req, res) => {
  const db = await getDb();
  const c = await db.collection('changes').findOne({ _id: oid(req.params.id) });
  if (!c) return res.status(404).json({ error: 'Không tìm thấy' });
  const facs = db.collection('facilities');
  if (c.loai === 'tang') await facs.deleteOne({ _id: oid(c.facilityId) });
  else await facs.updateOne({ _id: oid(c.facilityId) }, { $set: { trangThai: 'hoatdong' }, $unset: { thangGiam: '', lyDoGiam: '' } });
  await db.collection('changes').deleteOne({ _id: c._id });
  res.json({ ok: true });
}));

/* ---------- Thống kê ---------- */
app.get('/api/stats', wrap(async (req, res) => {
  const db = await getDb();
  const facs = db.collection('facilities');
  const act = { trangThai: 'hoatdong' };
  const [total, byType, byWard, byField, tang, giam, inspections] = await Promise.all([
    facs.countDocuments(act),
    facs.aggregate([{ $match: act }, { $group: { _id: '$loaiHinh', n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 10 }]).toArray(),
    facs.aggregate([{ $match: act }, { $group: { _id: '$phuong', n: { $sum: 1 } } }, { $sort: { n: -1 } }]).toArray(),
    facs.aggregate([{ $match: act }, { $group: { _id: '$linhVuc', n: { $sum: 1 } } }, { $sort: { n: -1 } }]).toArray(),
    db.collection('changes').countDocuments({ loai: 'tang' }),
    db.collection('changes').countDocuments({ loai: 'giam' }),
    db.collection('inspections').countDocuments(),
  ]);
  res.json({ total, byType, byWard, byField, tang, giam, inspections });
}));

module.exports = app;
