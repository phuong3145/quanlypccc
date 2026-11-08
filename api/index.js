const express = require('express');
const { ObjectId } = require('mongodb');
const XLSX = require('xlsx-js-style');
const { getDb } = require('../lib/db');
const DEFAULT_DON_VI = 'Đội CC và CNCH KV7';

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
  'soHoSo', 'soTaiKhoan', 'ten', 'soNha', 'khuPho', 'phuong', 'linhVuc', 'tenLinhVuc', 'loaiHinh',
  'thangNamHoatDong', 'soTang', 'khoiTich', 'dienTichSan', 'thongTinDacThu', 'phanLoai',
  'thamDuyet', 'tinhTrangViPham', 'donViQuanLy', 'ghiChu', 'nguoiDaiDien', 'dienThoai',
  'soTangHam', 'dienTichMatBang', 'nhomLoaiHinh', 'canBoUsername',
  'huongDanKhaiBao', 'camKetTruyenTin', 'daLapTruyenTin',
];
const { GROUPS, LINH_VUC_MAP, STANDARD_WARDS, WARD_NAMES, normalizeWard, normalizeMonthYear, normalizeFacilityType } = require('../lib/catalog');
const { getCache, setCache, clearCache } = require('../lib/cache');
const num = (o, ks) => ks.forEach((k) => { if (o[k] !== undefined && o[k] !== '') o[k] = Number(o[k]); });

// Tự động xóa cache (Memory + Upstash Redis) khi có thao tác thêm/sửa/xóa
app.use('/api', (req, res, next) => {
  if (req.method !== 'GET') {
    res.on('finish', () => {
      if (res.statusCode < 400) clearCache().catch(() => {});
    });
  }
  next();
});

function applyLinhVucFromType(d) {
  d.phuong = normalizeWard(d.phuong);
  if (!d.donViQuanLy || !String(d.donViQuanLy).trim()) {
    d.donViQuanLy = DEFAULT_DON_VI;
  }
  if (d.thangNamHoatDong !== undefined) {
    d.thangNamHoatDong = normalizeMonthYear(d.thangNamHoatDong);
    if (d.thangNamHoatDong && !/^(0[1-9]|1[0-2])\/\d{4}$/.test(d.thangNamHoatDong)) {
      throw new Error('Tháng/năm hoạt động phải đúng định dạng MM/YYYY (ví dụ: 03/2020)');
    }
  }
  if (d.loaiHinh) {
    const std = normalizeFacilityType(d);
    if (std) {
      d.linhVuc = String(std.linhVuc); // Luôn lấy ID của phần cha (1..10)
      d.tenLinhVuc = std.tenLinhVuc;
    }
  } else if (d.linhVuc) {
    const parentId = String(d.linhVuc).split('.')[0].replace(/\D/g, '');
    if (LINH_VUC_MAP[parentId]) {
      d.linhVuc = parentId;
      d.tenLinhVuc = LINH_VUC_MAP[parentId];
    }
  }
}

function userScope(req) {
  return req.user.perms.viewAllFacilities ? 'all' : `u:${req.user.username}`;
}

function canAccessFacility(req, fac) {
  if (!fac) return false;
  if (req.user.perms.viewAllFacilities) return true;
  return fac.canBoUsername === req.user.username;
}

async function resolveOwnerFields(db, req, d, isCreate = false) {
  if (req.user.perms.assignFacilityOwner && d.canBoUsername) {
    const u = await db.collection('users').findOne({ username: String(d.canBoUsername).trim().toLowerCase() });
    if (u) {
      d.canBoUsername = u.username;
      d.canBoHoTen = u.hoTen;
      return;
    }
  }
  if (isCreate) {
    d.canBoUsername = req.user.username;
    d.canBoHoTen = req.user.hoTen;
  } else {
    delete d.canBoUsername;
  }
}

/* ---------- Danh mục chuẩn, Phường & Loại hình ---------- */
app.get('/api/catalog', (req, res) => {
  res.json({ groups: GROUPS, linhVucMap: LINH_VUC_MAP, wards: STANDARD_WARDS });
});

app.get('/api/wards', wrap(async (req, res) => {
  const scope = userScope(req);
  const cacheKey = `wards:${scope}`;
  const cached = await getCache(cacheKey);
  if (cached) {
    res.setHeader('X-Cache', `HIT-${cached.source}`);
    return res.json(cached.val);
  }
  const db = await getDb();
  let wards = await db.collection('wards').find().sort({ thuTu: 1 }).toArray();
  if (!wards.length) {
    await db.collection('wards').insertMany(STANDARD_WARDS.map((w) => ({ ...w, createdAt: new Date() })));
    wards = await db.collection('wards').find().sort({ thuTu: 1 }).toArray();
  }
  const ownerMatch = req.user.perms.viewAllFacilities ? {} : { canBoUsername: req.user.username };
  const [activeCounts, giamCounts, fieldCounts] = await Promise.all([
    db.collection('facilities').aggregate([
      { $match: { trangThai: 'hoatdong', ...ownerMatch } },
      { $group: { _id: '$phuong', count: { $sum: 1 } } },
    ]).toArray(),
    db.collection('facilities').aggregate([
      { $match: { trangThai: 'giam', ...ownerMatch } },
      { $group: { _id: '$phuong', count: { $sum: 1 } } },
    ]).toArray(),
    db.collection('facilities').aggregate([
      { $match: { trangThai: 'hoatdong', ...ownerMatch } },
      { $group: { _id: { phuong: '$phuong', linhVuc: '$linhVuc' }, count: { $sum: 1 } } },
    ]).toArray(),
  ]);
  const actMap = Object.fromEntries(activeCounts.map((c) => [c._id, c.count]));
  const giamMap = Object.fromEntries(giamCounts.map((c) => [c._id, c.count]));
  const result = wards.map((w) => ({
    ...w,
    soCoSo: actMap[w.ten] || 0,
    soGiam: giamMap[w.ten] || 0,
    byField: fieldCounts
      .filter((fc) => fc._id.phuong === w.ten)
      .map((fc) => ({ linhVuc: fc._id.linhVuc, count: fc.count }))
      .sort((a, b) => Number(a.linhVuc) - Number(b.linhVuc)),
  }));
  await setCache(cacheKey, result, 300);
  res.setHeader('X-Cache', 'MISS');
  res.json(result);
}));

app.get('/api/types', wrap(async (req, res) => {
  const scope = userScope(req);
  const cacheKey = `types:${scope}`;
  const cached = await getCache(cacheKey);
  if (cached) {
    res.setHeader('X-Cache', `HIT-${cached.source}`);
    return res.json(cached.val);
  }
  const db = await getDb();
  const facMatch = { trangThai: 'hoatdong' };
  if (!req.user.perms.viewAllFacilities) facMatch.canBoUsername = req.user.username;

  const [types, counts] = await Promise.all([
    db.collection('types').find().sort({ thuTu: 1, ten: 1 }).toArray(),
    db.collection('facilities').aggregate([
      { $match: facMatch },
      { $group: { _id: '$loaiHinh', count: { $sum: 1 } } },
    ]).toArray(),
  ]);
  const countMap = Object.fromEntries(counts.map((c) => [c._id, c.count]));
  const result = types.map((t) => ({
    ...t,
    linhVuc: String(t.linhVuc || '').split('.')[0] || '1',
    tenLinhVuc: t.tenLinhVuc || LINH_VUC_MAP[String(t.linhVuc || '').split('.')[0]] || '',
    soCoSo: countMap[t.ten] || 0,
  }));
  await setCache(cacheKey, result, 300);
  res.setHeader('X-Cache', 'MISS');
  res.json(result);
}));
app.post('/api/types', wrap(async (req, res) => {
  const db = await getDb();
  const d = clean(req.body, ['ten', 'linhVuc', 'moTa', 'chuKyKiemTraThang']);
  if (!d.ten) return res.status(400).json({ error: 'Thiếu tên loại hình' });
  d.linhVuc = String(d.linhVuc || '1').split('.')[0];
  d.tenLinhVuc = LINH_VUC_MAP[d.linhVuc] || '';
  num(d, ['chuKyKiemTraThang']);
  const r = await db.collection('types').insertOne(d);
  res.json({ _id: r.insertedId, ...d });
}));
app.put('/api/types/:id', wrap(async (req, res) => {
  const db = await getDb();
  const d = clean(req.body, ['ten', 'linhVuc', 'moTa', 'chuKyKiemTraThang']);
  if (d.linhVuc) {
    d.linhVuc = String(d.linhVuc).split('.')[0];
    d.tenLinhVuc = LINH_VUC_MAP[d.linhVuc] || '';
  }
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
  const { q, loaiHinh, phuong, trangThai = 'hoatdong', linhVuc, canBo } = req.query;
  const page = Math.max(1, +req.query.page || 1);
  const limit = Math.min(500, +req.query.limit || 20);
  const effectiveCanBo = req.user.perms.viewAllFacilities ? (canBo || '') : req.user.username;
  const cacheKey = `facilities:${effectiveCanBo}:${trangThai}:${linhVuc || ''}:${loaiHinh || ''}:${phuong || ''}:${q || ''}:${page}:${limit}`;
  const cached = await getCache(cacheKey);
  if (cached) {
    res.setHeader('X-Cache', `HIT-${cached.source}`);
    return res.json(cached.val);
  }
  const db = await getDb();
  const f = {};
  if (effectiveCanBo) f.canBoUsername = effectiveCanBo;
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
  const result = { items, total, page, limit };
  await setCache(cacheKey, result, 180);
  res.setHeader('X-Cache', 'MISS');
  res.json(result);
}));

app.get('/api/facilities/export', wrap(async (req, res) => {
  const { q, loaiHinh, phuong, trangThai = 'hoatdong', linhVuc, canBo } = req.query;
  const effectiveCanBo = req.user.perms.viewAllFacilities ? (canBo || '') : req.user.username;
  const db = await getDb();
  const f = {};
  if (effectiveCanBo) f.canBoUsername = effectiveCanBo;
  if (trangThai !== 'all') f.trangThai = trangThai;
  if (loaiHinh) f.loaiHinh = loaiHinh;
  if (phuong) f.phuong = phuong;
  if (linhVuc) f.linhVuc = linhVuc;
  if (q) {
    const r = new RegExp(esc(q), 'i');
    f.$or = [{ ten: r }, { soHoSo: r }, { soTaiKhoan: r }, { soNha: r }, { khuPho: r }];
  }
  const items = await db.collection('facilities').find(f).sort({ sttGoc: 1, ten: 1 }).toArray();

  // Dòng 1: Trống (giống mẫu sheet Hào)
  const row0 = Array(37).fill('');
  // Dòng 2: Tiêu đề nhóm cha
  const row1 = [
    'STT',
    'Số hồ sơ (1234/PC…../701CK)',
    'Số tài khoản',
    'Tên cơ\r\n sở',
    'Địa chỉ', '', '',
    'Thuộc lĩnh vực',
    'Loại hình cơ sở (vd Nhà trọ, Văn phòng, cửa hàng…)',
    'Tháng/Năm đưa vào hoạt động (T8/2025)',
    'Quy mô', '', '', '',
    'Phân loại theo Nghị định 105/2025/NĐ-CP', '', '', '', '',
    'Việc thẩm duyệt (thẩm định), nghiệm thu về PCCC', '', '',
    'Cơ sở không được xây dựng hoặc hoạt động đúng theo quy định (theo K7 Đ2 Luật PCCC&CNCH)', '', '', '',
    'Cơ sở không đảm bảo an toàn PCCC hoạt động trước Luật PCCC năm 2001',
    'Cơ sở tồn tại vi phạm không có khả năng khắc phục hoạt động trước Luật PCCC và CNCH (Trước 01/07/2025)',
    'Đình chỉ hoạt động', '',
    'Hệ thống cơ sở dữ liệu Quốc gia về PCCC và CNCH', '', '',
    'Thông tin Đơn vị quản lý', '', '',
    'Ghi chú',
  ];
  // Dòng 3: Tiêu đề cột con
  const row2 = [
    '', '', '', '',
    'Số nhà, tên đường,…', 'khu phố, KCN, KCX,KCNC', 'Tên phường/xã',
    '', '', '',
    'Số tầng', 'Khối tích (m3)', 'Tổng diện tích sàn (m2)', 'Thông tin đặc thù khác (*)',
    'Ngoài Phụ lục II', 'Nhóm 1 - Phụ lục II', 'Nhóm 2 - Phụ lục II', 'Phụ lục III', 'Phụ lục VII',
    'Đã thẩm duyệt, nghiệm thu', 'Đã thẩm duyệt, chưa nghiệm thu', 'Chưa được thẩm duyệt, nghiệm thu',
    'Tháng năm xây dựng', 'Vi phạm về xây dựng', 'Vi phạm về đăng ký kinh doanh', 'Vi phạm về PCCC',
    '', '',
    'Số quyết định (xxx/QĐ-…)', 'Ngày ban hành quyết định (dd/mm/yyyy)',
    'Hướng dẫn khai báo, cập nhật thông tin cơ sở', 'Cam kết lắp đặt thiết bị truyền tin báo cháy', 'Đã lắp đặt thiết bị truyền tin báo cháy',
    'Đơn vị quản lý', 'Tên cán bộ quản lý', 'Số điện thoại liên hệ',
    '',
  ];

  const dataRows = items.map((x, idx) => {
    const pl = String(x.phanLoai || '');
    const td = String(x.thamDuyet || '');
    const vp = String(x.tinhTrangViPham || '');
    const soTangCell = x.soTangHam && x.soTang
      ? `${String(x.soTangHam).padStart(2, '0')} tầng hầm và ${x.soTang} tầng nổi`
      : (x.soTang ?? '');
    return [
      idx + 1,
      x.soHoSo || '',
      x.soTaiKhoan || '',
      x.ten || '',
      x.soNha || '',
      x.khuPho || '',
      x.phuong || '',
      x.linhVuc ? (Number(x.linhVuc) || x.linhVuc) : '',
      x.loaiHinh || '',
      x.thangNamHoatDong || '',
      soTangCell,
      x.khoiTich ?? '',
      x.dienTichSan ?? '',
      x.thongTinDacThu || '',
      /ngoài phụ lục ii/i.test(pl) ? 'X' : '',
      /nh[oó]m 1/i.test(pl) ? 'X' : '',
      /nh[oó]m 2/i.test(pl) ? 'X' : '',
      /phụ lục iii/i.test(pl) ? 'X' : '',
      /phụ lục vii/i.test(pl) ? 'X' : '',
      /đã thẩm duyệt,\s*nghiệm thu/i.test(td) ? 'X' : '',
      /đã thẩm duyệt,\s*chưa nghiệm thu/i.test(td) ? 'X' : '',
      /chưa được thẩm duyệt/i.test(td) ? 'X' : '',
      x.thangNamXayDung || '',
      /xây dựng/i.test(vp) ? 'X' : '',
      /đăng ký kinh doanh/i.test(vp) ? 'X' : '',
      /pccc/i.test(vp) ? 'X' : '',
      x.truocLuat2001 || '',
      x.truocLuat2025 || '',
      x.soQuyetDinhDinhChi || '',
      x.ngayQuyetDinhDinhChi || '',
      x.huongDanKhaiBao ? 'X' : '',
      x.camKetTruyenTin ? 'X' : '',
      x.daLapTruyenTin ? 'X' : '',
      x.donViQuanLy || DEFAULT_DON_VI,
      x.canBoHoTen || x.nguoiDaiDien || x.nguoiPhuTrach || '',
      x.dienThoai || '',
      x.ghiChu || '',
    ];
  });

  // Dòng 4: Dòng đếm tổng (COUNTA) cho từng cột giống mẫu sheet Hào
  const row3 = Array.from({ length: 37 }, (_, c) =>
    dataRows.reduce((cnt, r) => (r[c] !== '' && r[c] !== null && r[c] !== undefined ? cnt + 1 : cnt), 0)
  );

  const ws = XLSX.utils.aoa_to_sheet([row0, row1, row2, row3, ...dataRows]);
  const lastExcelRow = Math.max(5, dataRows.length + 4);
  for (let c = 0; c < 37; c++) {
    const colLetter = XLSX.utils.encode_col(c);
    const cellRef = XLSX.utils.encode_cell({ r: 3, c });
    ws[cellRef] = { t: 'n', v: row3[c], f: `COUNTA(${colLetter}5:${colLetter}${lastExcelRow})` };
  }

  // Kẻ đường viền (border) bảng đầy đủ cho tiêu đề, dòng tổng và toàn bộ dòng dữ liệu
  const thinBorder = {
    top: { style: 'thin', color: { rgb: '334155' } },
    bottom: { style: 'thin', color: { rgb: '334155' } },
    left: { style: 'thin', color: { rgb: '334155' } },
    right: { style: 'thin', color: { rgb: '334155' } },
  };
  const headerStyle = {
    font: { name: 'Times New Roman', sz: 11, bold: true, color: { rgb: '0F172A' } },
    fill: { fgColor: { rgb: 'E2E8F0' } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    border: thinBorder,
  };
  const countStyle = {
    font: { name: 'Times New Roman', sz: 11, bold: true, color: { rgb: '991B1B' } },
    fill: { fgColor: { rgb: 'FEF3C7' } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: thinBorder,
  };
  const totalRows = 4 + dataRows.length;
  const centerCols = new Set([0, 7, 9, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32]);
  for (let r = 1; r < totalRows; r++) {
    for (let c = 0; c < 37; c++) {
      const ref = XLSX.utils.encode_cell({ r, c });
      if (!ws[ref]) ws[ref] = { t: 's', v: '' };
      if (r === 1 || r === 2) {
        ws[ref].s = headerStyle;
      } else if (r === 3) {
        ws[ref].s = countStyle;
      } else {
        ws[ref].s = {
          font: { name: 'Times New Roman', sz: 11 },
          alignment: {
            horizontal: centerCols.has(c) ? 'center' : 'left',
            vertical: 'center',
            wrapText: true,
          },
          border: thinBorder,
        };
      }
    }
  }
  ws['!rows'] = [{ hpt: 14 }, { hpt: 38 }, { hpt: 44 }, { hpt: 22 }];

  ws['!merges'] = [
    { s: { r: 1, c: 0 }, e: { r: 2, c: 0 } },
    { s: { r: 1, c: 1 }, e: { r: 2, c: 1 } },
    { s: { r: 1, c: 2 }, e: { r: 2, c: 2 } },
    { s: { r: 1, c: 3 }, e: { r: 2, c: 3 } },
    { s: { r: 1, c: 4 }, e: { r: 1, c: 6 } },
    { s: { r: 1, c: 7 }, e: { r: 2, c: 7 } },
    { s: { r: 1, c: 8 }, e: { r: 2, c: 8 } },
    { s: { r: 1, c: 9 }, e: { r: 2, c: 9 } },
    { s: { r: 1, c: 10 }, e: { r: 1, c: 13 } },
    { s: { r: 1, c: 14 }, e: { r: 1, c: 18 } },
    { s: { r: 1, c: 19 }, e: { r: 1, c: 21 } },
    { s: { r: 1, c: 22 }, e: { r: 1, c: 25 } },
    { s: { r: 1, c: 26 }, e: { r: 2, c: 26 } },
    { s: { r: 1, c: 27 }, e: { r: 2, c: 27 } },
    { s: { r: 1, c: 28 }, e: { r: 1, c: 29 } },
    { s: { r: 1, c: 30 }, e: { r: 1, c: 32 } },
    { s: { r: 1, c: 33 }, e: { r: 1, c: 35 } },
    { s: { r: 1, c: 36 }, e: { r: 2, c: 36 } },
  ];
  ws['!cols'] = [
    { wch: 6 }, { wch: 20 }, { wch: 16 }, { wch: 36 },
    { wch: 26 }, { wch: 14 }, { wch: 18 }, { wch: 10 },
    { wch: 28 }, { wch: 14 }, { wch: 22 }, { wch: 12 },
    { wch: 14 }, { wch: 24 }, { wch: 12 }, { wch: 14 },
    { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 16 },
    { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 14 },
    { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 16 },
    { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 },
    { wch: 16 }, { wch: 22 }, { wch: 22 }, { wch: 15 },
    { wch: 20 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Hào');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const dateStr = new Date().toISOString().slice(0, 10).split('-').reverse().join('.');
  const fileName = `KV7_DS_co_so_PCCC_${dateStr}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.send(buf);
}));

app.get('/api/facilities/:id', wrap(async (req, res) => {
  const db = await getDb();
  const f = await db.collection('facilities').findOne({ _id: oid(req.params.id) });
  if (!f) return res.status(404).json({ error: 'Không tìm thấy cơ sở' });
  if (!canAccessFacility(req, f)) return res.status(403).json({ error: 'Bạn không có quyền xem cơ sở của cán bộ khác' });
  res.json(f);
}));

app.post('/api/facilities', wrap(async (req, res) => {
  const db = await getDb();
  const d = clean(req.body, FAC_FIELDS);
  if (!d.ten) return res.status(400).json({ error: 'Thiếu tên cơ sở' });
  applyLinhVucFromType(d);
  await resolveOwnerFields(db, req, d, true);
  num(d, ['soTang', 'soTangHam', 'khoiTich', 'dienTichSan', 'dienTichMatBang']);
  d.trangThai = 'hoatdong';
  d.createdAt = new Date();
  const r = await db.collection('facilities').insertOne(d);
  res.json({ _id: r.insertedId, ...d });
}));

app.put('/api/facilities/:id', wrap(async (req, res) => {
  const db = await getDb();
  const existing = await db.collection('facilities').findOne({ _id: oid(req.params.id) });
  if (!existing) return res.status(404).json({ error: 'Không tìm thấy cơ sở' });
  if (!canAccessFacility(req, existing)) return res.status(403).json({ error: 'Bạn không có quyền sửa cơ sở của cán bộ khác' });
  const d = clean(req.body, FAC_FIELDS);
  applyLinhVucFromType(d);
  await resolveOwnerFields(db, req, d, false);
  num(d, ['soTang', 'soTangHam', 'khoiTich', 'dienTichSan', 'dienTichMatBang']);
  d.updatedAt = new Date();
  await db.collection('facilities').updateOne({ _id: existing._id }, { $set: d });
  res.json({ ok: true });
}));

app.delete('/api/facilities/:id', wrap(async (req, res) => {
  const db = await getDb();
  const existing = await db.collection('facilities').findOne({ _id: oid(req.params.id) });
  if (!existing) return res.status(404).json({ error: 'Không tìm thấy cơ sở' });
  if (!canAccessFacility(req, existing)) return res.status(403).json({ error: 'Bạn không có quyền xóa cơ sở của cán bộ khác' });
  await db.collection('facilities').deleteOne({ _id: existing._id });
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
  if (!req.user.perms.viewAllFacilities) {
    f.canBoUsername = req.user.username;
  } else if (req.query.canBo) {
    f.canBoUsername = req.query.canBo;
  }
  res.json(await db.collection('inspections').find(f).sort({ ngayKiemTra: -1 }).limit(500).toArray());
}));
app.get('/api/inspections/:id', wrap(async (req, res) => {
  const db = await getDb();
  const i = await db.collection('inspections').findOne({ _id: oid(req.params.id) });
  if (!i) return res.status(404).json({ error: 'Không tìm thấy' });
  const facility = await db.collection('facilities').findOne({ _id: oid(i.facilityId) });
  if (facility && !canAccessFacility(req, facility)) {
    return res.status(403).json({ error: 'Bạn không có quyền xem biên bản của cán bộ khác' });
  }
  if (!facility && !req.user.perms.viewAllFacilities && i.canBoUsername && i.canBoUsername !== req.user.username) {
    return res.status(403).json({ error: 'Bạn không có quyền xem biên bản của cán bộ khác' });
  }
  res.json({ ...i, facility });
}));
app.post('/api/inspections', wrap(async (req, res) => {
  const db = await getDb();
  const d = clean(req.body, INSP_FIELDS);
  if (!d.facilityId) return res.status(400).json({ error: 'Chưa chọn cơ sở' });
  const facility = await db.collection('facilities').findOne({ _id: oid(d.facilityId) });
  if (!facility) return res.status(404).json({ error: 'Không tìm thấy cơ sở' });
  if (!canAccessFacility(req, facility)) {
    return res.status(403).json({ error: 'Bạn chỉ được tạo biên bản cho cơ sở mình phụ trách' });
  }
  d.canBoUsername = facility.canBoUsername || req.user.username;
  d.canBoHoTen = facility.canBoHoTen || req.user.hoTen;
  d.createdAt = new Date();
  const count = await db.collection('inspections').countDocuments();
  d.soBienBan = `${count + 1}/BB-KT`;
  const r = await db.collection('inspections').insertOne(d);
  await db.collection('facilities').updateOne(
    { _id: facility._id },
    { $set: { lanKiemTraCuoi: d.ngayKiemTra, ketQuaKiemTraCuoi: d.ketLuan } }
  );
  res.json({ _id: r.insertedId, ...d });
}));
app.put('/api/inspections/:id', wrap(async (req, res) => {
  const db = await getDb();
  const existing = await db.collection('inspections').findOne({ _id: oid(req.params.id) });
  if (!existing) return res.status(404).json({ error: 'Không tìm thấy biên bản' });
  if (!req.user.perms.viewAllFacilities && existing.canBoUsername !== req.user.username) {
    return res.status(403).json({ error: 'Bạn không có quyền sửa biên bản của cán bộ khác' });
  }
  const d = clean(req.body, INSP_FIELDS);
  await db.collection('inspections').updateOne({ _id: existing._id }, { $set: d });
  res.json({ ok: true });
}));
app.delete('/api/inspections/:id', wrap(async (req, res) => {
  const db = await getDb();
  const existing = await db.collection('inspections').findOne({ _id: oid(req.params.id) });
  if (!existing) return res.status(404).json({ error: 'Không tìm thấy biên bản' });
  if (!req.user.perms.viewAllFacilities && existing.canBoUsername !== req.user.username) {
    return res.status(403).json({ error: 'Bạn không có quyền xóa biên bản của cán bộ khác' });
  }
  await db.collection('inspections').deleteOne({ _id: existing._id });
  res.json({ ok: true });
}));

/* ---------- Tăng / giảm cơ sở ---------- */
app.get('/api/changes', wrap(async (req, res) => {
  const db = await getDb();
  const f = {};
  if (req.query.thang) f.thang = req.query.thang;
  if (req.query.loai) f.loai = req.query.loai;
  if (!req.user.perms.viewAllFacilities) {
    f.canBoUsername = req.user.username;
  } else if (req.query.canBo) {
    f.canBoUsername = req.query.canBo;
  }
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
    applyLinhVucFromType(d);
    await resolveOwnerFields(db, req, d, true);
    num(d, ['soTang', 'soTangHam', 'khoiTich', 'dienTichSan', 'dienTichMatBang']);
    Object.assign(d, { trangThai: 'hoatdong', thangTang: thang, createdAt: new Date() });
    const r = await facs.insertOne(d);
    facility = { _id: r.insertedId, ...d };
  } else {
    const _id = oid(req.body.facilityId);
    facility = await facs.findOne({ _id });
    if (!facility) return res.status(404).json({ error: 'Không tìm thấy cơ sở' });
    if (!canAccessFacility(req, facility)) {
      return res.status(403).json({ error: 'Bạn chỉ được lập giảm cho cơ sở mình phụ trách' });
    }
    await facs.updateOne({ _id }, { $set: { trangThai: 'giam', thangGiam: thang, lyDoGiam: lyDo || '' } });
  }
  const rec = {
    loai,
    thang,
    lyDo: lyDo || '',
    facilityId: String(facility._id),
    canBoUsername: facility.canBoUsername || req.user.username,
    canBoHoTen: facility.canBoHoTen || req.user.hoTen,
    snapshot: facility,
    createdAt: new Date(),
  };
  const r = await db.collection('changes').insertOne(rec);
  res.json({ _id: r.insertedId, ...rec });
}));

// Sửa phiếu tăng/giảm
app.put('/api/changes/:id', wrap(async (req, res) => {
  const db = await getDb();
  const c = await db.collection('changes').findOne({ _id: oid(req.params.id) });
  if (!c) return res.status(404).json({ error: 'Không tìm thấy phiếu tăng/giảm' });
  if (!req.user.perms.viewAllFacilities && c.canBoUsername !== req.user.username) {
    return res.status(403).json({ error: 'Bạn không có quyền sửa phiếu tăng/giảm của cán bộ khác' });
  }
  const set = {};
  if (req.body.thang) set.thang = req.body.thang;
  if (req.body.lyDo !== undefined) set.lyDo = req.body.lyDo;
  if (req.body.ten && c.snapshot) {
    set['snapshot.ten'] = req.body.ten;
    await db.collection('facilities').updateOne({ _id: oid(c.facilityId) }, { $set: { ten: req.body.ten } });
  }
  await db.collection('changes').updateOne({ _id: c._id }, { $set: set });
  res.json({ ok: true });
}));

// Hủy / xóa phiếu tăng/giảm (hoàn tác)
app.delete('/api/changes/:id', wrap(async (req, res) => {
  const db = await getDb();
  const c = await db.collection('changes').findOne({ _id: oid(req.params.id) });
  if (!c) return res.status(404).json({ error: 'Không tìm thấy' });
  if (!req.user.perms.viewAllFacilities && c.canBoUsername !== req.user.username) {
    return res.status(403).json({ error: 'Bạn không có quyền xóa phiếu tăng/giảm của cán bộ khác' });
  }
  const facs = db.collection('facilities');
  if (c.loai === 'tang') await facs.deleteOne({ _id: oid(c.facilityId) });
  else await facs.updateOne({ _id: oid(c.facilityId) }, { $set: { trangThai: 'hoatdong' }, $unset: { thangGiam: '', lyDoGiam: '' } });
  await db.collection('changes').deleteOne({ _id: c._id });
  res.json({ ok: true });
}));

/* ---------- Thống kê ---------- */
app.get('/api/stats', wrap(async (req, res) => {
  const canBoFilter = req.user.perms.viewAllFacilities ? (req.query.canBo || '') : req.user.username;
  const cacheKey = `stats:${canBoFilter || 'all'}`;
  const cached = await getCache(cacheKey);
  if (cached) {
    res.setHeader('X-Cache', `HIT-${cached.source}`);
    return res.json(cached.val);
  }
  const db = await getDb();
  const facs = db.collection('facilities');
  const act = { trangThai: 'hoatdong' };
  const ownerFilter = {};
  if (canBoFilter) {
    act.canBoUsername = canBoFilter;
    ownerFilter.canBoUsername = canBoFilter;
  }
  const [total, byType, rawByWard, byField, byOfficer, tang, giam, inspections] = await Promise.all([
    facs.countDocuments(act),
    facs.aggregate([{ $match: act }, { $group: { _id: '$loaiHinh', n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 10 }]).toArray(),
    facs.aggregate([{ $match: act }, { $group: { _id: '$phuong', n: { $sum: 1 } } }]).toArray(),
    facs.aggregate([{ $match: act }, { $group: { _id: '$linhVuc', n: { $sum: 1 } } }, { $sort: { n: -1 } }]).toArray(),
    facs.aggregate([{ $match: act }, { $group: { _id: '$canBoUsername', hoTen: { $first: '$canBoHoTen' }, n: { $sum: 1 } } }, { $sort: { n: -1 } }]).toArray(),
    db.collection('changes').countDocuments({ loai: 'tang', ...ownerFilter }),
    db.collection('changes').countDocuments({ loai: 'giam', ...ownerFilter }),
    db.collection('inspections').countDocuments(ownerFilter),
  ]);
  const wardCountMap = Object.fromEntries(rawByWard.map((w) => [normalizeWard(w._id), w.n]));
  const byWard = WARD_NAMES.map((ten) => ({ _id: ten, n: wardCountMap[ten] || 0 }));
  const result = { total, byType, byWard, byField, byOfficer, tang, giam, inspections };
  await setCache(cacheKey, result, 300);
  res.setHeader('X-Cache', 'MISS');
  res.json(result);
}));

module.exports = app;
