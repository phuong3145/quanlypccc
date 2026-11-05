/**
 * Import dữ liệu từ các file Excel mẫu vào MongoDB.
 * Chạy:  npm run import            (tất cả *.xlsx ở thư mục gốc, bỏ qua file "Copy of ...")
 *        npm run import -- "file1.xlsx" "file2.xlsx"
 * Nhận diện cột theo tên tiêu đề nên chịu được các biểu mẫu khác nhau.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { getDb } = require('../lib/db');

const root = path.join(__dirname, '..');
const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const low = (s) => norm(s).toLowerCase();

// [field, regex]  (thứ tự = ưu tiên)
const RULES = [
  ['soHoSo', /số hồ sơ/],
  ['soLuu', /số lưu/],
  ['soTaiKhoan', /số tài khoản/],
  ['ten', /tên cơ/],
  ['soNha', /số nhà/],
  ['khuPho', /khu phố/],
  ['phuong', /tên phường|phường\/xã/],
  ['linhVuc', /lĩnh vực/],
  ['loaiHinh', /loại hình|tính chất hoạt động/],
  ['thangNamHoatDong', /đưa vào hoạt/],
  ['soTang', /số tầng/],
  ['khoiTich', /khối tích/],
  ['dienTichSan', /diện tích sàn/],
  ['thongTinDacThu', /thông tin đặc thù/],
  ['pl_ngoai', /ngoài phụ lục ii/],
  ['pl_n1', /nhóm 1/],
  ['pl_n2', /nhóm 2/],
  ['pl_3', /phụ lục iii/],
  ['pl_7', /phụ lục vii/],
  ['td_xong', /đã thẩm duyệt, nghiệm thu|đã thẩm duyệt, đã nghiệm/],
  ['td_chua_nt', /đã thẩm duyệt, chưa nghiệm/],
  ['td_chua', /chưa được thẩm duyệt/],
  ['vp_xd', /vi\s*phạm về xây dựng/],
  ['vp_kd', /vi\s*phạm về đăng ký/],
  ['vp_pccc', /vi\s*phạm về pccc|vi\s*phạm về phòng/],
  ['donViQuanLy', /đơn vị quản lý/],
  ['canBo', /tên cán bộ/],
  ['dienThoai', /số điện thoại/],
  ['ghiChu', /ghi chú/],
];
const PL = { pl_ngoai: 'Ngoài Phụ lục II', pl_n1: 'Nhóm 1 - Phụ lục II', pl_n2: 'Nhóm 2 - Phụ lục II', pl_3: 'Phụ lục III', pl_7: 'Phụ lục VII' };
const TD = { td_xong: 'Đã thẩm duyệt, nghiệm thu', td_chua_nt: 'Đã thẩm duyệt, chưa nghiệm thu', td_chua: 'Chưa được thẩm duyệt, nghiệm thu' };
const VP = { vp_xd: 'Vi phạm về xây dựng', vp_kd: 'Vi phạm về đăng ký kinh doanh', vp_pccc: 'Vi phạm về PCCC' };

function mapHeader(rows, hdrIdx) {
  const width = Math.max(...rows.slice(0, hdrIdx + 3).map((r) => r.length));
  const cols = {};
  for (let c = 0; c < width; c++) {
    // Ghép các dòng tiêu đề (dòng STT + 2 dòng tiếp)
    const t = low([0, 1, 2].map((k) => (rows[hdrIdx + k] || [])[c]).join(' '));
    // tiêu đề riêng của cột: ưu tiên dòng con trước, rồi dòng cha
    for (const [f, re] of RULES) {
      if (cols[f] === undefined && re.test(t)) { cols[f] = c; break; }
    }
  }
  return cols;
}

const fmtDate = (v) => {
  if (v instanceof Date) return `${String(v.getMonth() + 1).padStart(2, '0')}/${v.getFullYear()}`;
  return norm(v);
};
const toNum = (v) => {
  if (typeof v === 'number') return v;
  const n = Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) && String(v ?? '').trim() !== '' ? n : undefined;
};
const marked = (v) => /^x$/i.test(norm(v));

function parseSheet(ws) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
  const hdr = rows.findIndex((r, i) => i < 8 && r.some((c) => /^stt$/i.test(norm(c))) && r.some((c) => /tên cơ/i.test(norm(c))));
  if (hdr < 0) return null;
  const col = mapHeader(rows, hdr);
  if (col.ten === undefined) return null;
  const title = norm(rows.slice(0, hdr).flat().find((c) => /tháng/i.test(norm(c))));
  const get = (r, f) => (col[f] === undefined ? null : r[col[f]]);
  const items = [];
  for (let i = hdr + 1; i < rows.length; i++) {
    const r = rows[i];
    const ten = norm(get(r, 'ten'));
    if (!ten || ten.startsWith('=') || /^tên cơ/i.test(ten) || /^=?counta/i.test(ten)) continue;
    if (typeof get(r, 'ten') === 'number' || /^\d+$/.test(ten)) continue; // dòng đếm COUNTA
    const f = {
      ten,
      soHoSo: norm(get(r, 'soHoSo')),
      soLuu: norm(get(r, 'soLuu')),
      soTaiKhoan: norm(get(r, 'soTaiKhoan')),
      soNha: norm(get(r, 'soNha')),
      khuPho: norm(get(r, 'khuPho')),
      phuong: norm(get(r, 'phuong')),
      linhVuc: norm(get(r, 'linhVuc')),
      loaiHinh: norm(get(r, 'loaiHinh')),
      thangNamHoatDong: fmtDate(get(r, 'thangNamHoatDong')),
      soTang: toNum(get(r, 'soTang')),
      khoiTich: toNum(get(r, 'khoiTich')),
      dienTichSan: toNum(get(r, 'dienTichSan')),
      thongTinDacThu: norm(get(r, 'thongTinDacThu')),
      donViQuanLy: norm(get(r, 'donViQuanLy')),
      nguoiPhuTrach: norm(get(r, 'canBo')),
      dienThoai: norm(get(r, 'dienThoai')),
      ghiChu: norm(get(r, 'ghiChu')),
      phanLoai: Object.keys(PL).filter((k) => marked(get(r, k))).map((k) => PL[k]).join('; '),
      thamDuyet: Object.keys(TD).filter((k) => marked(get(r, k))).map((k) => TD[k]).join('; '),
      tinhTrangViPham: Object.keys(VP).filter((k) => marked(get(r, k))).map((k) => VP[k]).join('; '),
    };
    for (const k of Object.keys(f)) if (f[k] === '' || f[k] === undefined) delete f[k];
    items.push(f);
  }
  return { items, title };
}

const keyOf = (f) => f.soTaiKhoan || f.soHoSo || `${f.ten}|${f.soNha || ''}`;

/* ---------- Biểu mẫu "10 lĩnh vực" (sheet PL1-..., PL10-...) ---------- */
const PL_RULES = [
  ['dienTichMatBang', /diện tích mặt bằng|công suất|trữ lượng/],
  ['soTangHam', /số tầng hầm|số tổ máy/],
  ['soTang', /số tầng nổi/],
  ['nhom1', /nhóm 1/],
  ['nhom2', /nhóm 2/],
  ['ubnd', /ubnd|cơ sỏ do/],
  ['daMua', /đã mua/],
  ['phaiMua', /phải mua/],
  ['td_xong', /đã td, tđ, nt|đã td, tđ,nt/],
  ['td_chua_nt', /đã td, tđ, chưa/],
  ['td_chua', /chưa td, tđ/],
  ['doiVien', /sl đội viên đội/],
  ['nguoiHuanLuyen', /số lượng người đ/],
];
const LV_NAME = { 1: 'Nhà ở, trụ sở, bưu chính', 2: 'Y tế', 3: 'Giáo dục', 4: 'Văn hóa, thể thao', 5: 'Thương mại, dịch vụ', 6: 'Giao thông vận tải', 7: 'Năng lượng', 8: 'Xăng dầu, khí', 9: 'Hóa chất', 10: 'Công nghiệp, kho' };
// Số có dấu chấm ngăn cách hàng nghìn bị đọc thành số lẻ (vd 1.264 => 1264)
const fixThousands = (v) => {
  const n = toNum(v);
  return n !== undefined && !Number.isInteger(n) && n < 100 ? Math.round(n * 1000) : n;
};
const tenKey = (s) => norm(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

function parsePL(ws, sheetName) {
  const m = sheetName.match(/^PL\s*(\d+)/i);
  if (!m) return null;
  const lv = String(+m[1]);
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
  const hdr = rows.findIndex((r, i) => i < 8 && /^(stt|tt)$/i.test(norm(r[0])) && /tên cơ/i.test(norm(r[1])));
  if (hdr < 0) return null;
  const width = Math.max(...rows.slice(0, hdr + 4).map((r) => r.length));
  const col = {};
  for (let c = 3; c < width; c++) {
    const t = low([0, 1, 2].map((k) => (rows[hdr + k] || [])[c]).join(' '));
    for (const [f, re] of PL_RULES) if (col[f] === undefined && re.test(t)) { col[f] = c; break; }
  }
  const get = (r, f) => (col[f] === undefined ? null : r[col[f]]);
  const body = rows.slice(hdr + 4);
  // Biểu mẫu đánh số A, I, I.1 (chữ/La Mã) hay đánh số 1, 1.1 (số)?
  const letterScheme = body.some((r) => /^[A-Z]$|^[IVX]+(\.\d+)?$/.test(norm(r[0])) && norm(r[1]) && !norm(r[2]));
  let topLetter = '';
  // Cấp của dòng nhóm; -1 nếu không phải dòng nhóm (vd số thứ tự trong biểu mẫu chữ/La Mã)
  const depthOf = (s) => {
    if (/^[A-Z]$/.test(s)) {
      const roman = /^[IVX]$/.test(s) && letterScheme && topLetter && String.fromCharCode(topLetter.charCodeAt(0) + 1) !== s;
      if (roman) return 1;
      topLetter = s; return 0;
    }
    if (/^[IVX]+$/.test(s)) return 1;
    if (/^[IVX]+\.\d+$/.test(s)) return 2;
    if (!letterScheme) { if (/^\d+$/.test(s)) return 0; if (/^\d+\.\d+$/.test(s)) return 1; if (/^\d+\.\d+\.\d+$/.test(s)) return 2; }
    return -1;
  };
  const path = []; // phân cấp loại hình
  const types = [], items = [];
  let lastSection = null;
  const closeSection = () => { if (lastSection && lastSection.leaf) types.push(lastSection); lastSection = null; };
  for (const r of body) {
    const stt = norm(r[0]), name = norm(r[1]);
    if (!stt || !name) continue;
    if (/^ghi chú/i.test(name)) break;
    const hasAddr = !!norm(r[2]);
    if (!hasAddr) { // dòng nhóm loại hình (hoặc dòng mẫu không có địa chỉ)
      const d = depthOf(stt);
      if (d < 0) continue;
      if (lastSection && d > lastSection.depth) lastSection.leaf = false; // nhóm cha, không phải loại hình cuối
      closeSection();
      path.length = d;
      path[d] = name;
      const full = path.filter(Boolean);
      const ten = d >= 2 ? full.slice(-2).join(' - ') : name;
      lastSection = { ten, depth: d, linhVuc: lv, moTa: `Lĩnh vực ${lv} (${LV_NAME[lv] || sheetName}): ${full.join(' > ')}`, leaf: true };
      continue;
    }
    if (/^[.…]+$/.test(name)) continue;
    const cur = lastSection;
    const f = {
      ten: name, soNha: norm(r[2]), linhVuc: lv,
      loaiHinh: cur ? cur.ten : '', nhomLoaiHinh: path.filter(Boolean).join(' > '),
      dienTichMatBang: fixThousands(get(r, 'dienTichMatBang')), soTangHam: toNum(get(r, 'soTangHam')), soTang: toNum(get(r, 'soTang')),
      phanLoai: [marked(get(r, 'nhom1')) && 'Nhóm 1 - Phụ lục II', marked(get(r, 'nhom2')) && 'Nhóm 2 - Phụ lục II', marked(get(r, 'ubnd')) && 'UBND cấp xã quản lý', marked(get(r, 'phaiMua')) && 'Phụ lục VII'].filter(Boolean).join('; '),
      thamDuyet: Object.keys(TD).filter((k) => marked(get(r, k))).map((k) => TD[k]).join('; '),
      doiVienPCCC: toNum(get(r, 'doiVien')), soNguoiHuanLuyen: toNum(get(r, 'nguoiHuanLuyen')),
      muaBaoHiemChayNo: marked(get(r, 'daMua')) ? 'Đã mua' : marked(get(r, 'phaiMua')) ? 'Phải mua, chưa mua' : '',
    };
    for (const k of Object.keys(f)) if (f[k] === '' || f[k] === undefined || f[k] === null) delete f[k];
    items.push(f);
  }
  closeSection();
  return { items, types, lv };
}

function listFiles(args) {
  const out = [];
  for (const a of args.length ? args : [root]) {
    const p = path.resolve(root, a);
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
      fs.readdirSync(p).filter((f) => /\.xlsx$/i.test(f) && !/^(~\$|copy of)/i.test(f) && (args.length || !/^10 l/i.test(f))).forEach((f) => out.push(path.join(p, f)));
    } else out.push(p);
  }
  return out;
}

async function main() {
  const argv = process.argv.slice(2);
  const reset = argv.includes('--reset'), dry = argv.includes('--dry');
  const files = listFiles(argv.filter((a) => !a.startsWith('--')));
  if (!files.length) throw new Error('Không tìm thấy file .xlsx');

  const db = dry ? null : await getDb();
  const facs = db && db.collection('facilities');
  if (reset && !dry) {
    for (const c of ['facilities', 'types', 'changes']) await db.collection(c).deleteMany({});
    console.log('Đã xóa dữ liệu cũ: facilities, types, changes (tài khoản & biên bản kiểm tra được giữ lại)');
  }
  const types = new Map(); // `${linhVuc}|${ten}` -> type
  const addType = (t) => { if (t.ten) types.set(`${t.linhVuc || ''}|${t.ten}|${t.moTa || ''}`, { ten: t.ten, linhVuc: t.linhVuc || '', moTa: t.moTa || '' }); };
  let created = 0, updated = 0, merged = 0, tang = 0, giam = 0;

  // Biểu mẫu thường trước, biểu mẫu PL (phân loại 10 lĩnh vực) sau để gộp thông tin vào cơ sở đã có
  const books = files.map((file) => ({ file, wb: XLSX.readFile(file, { cellDates: true }) }));
  const isPL = (b) => b.wb.SheetNames.some((n) => /^PL\s*\d+/i.test(n));
  books.sort((a, b) => isPL(a) - isPL(b));

  for (const { file, wb } of books) {
    console.log('\n>>', path.basename(file));
    for (const name of wb.SheetNames) {
      if (/^tổng$/i.test(name.trim())) continue;

      if (/^PL\s*\d+/i.test(name)) {
        const p = parsePL(wb.Sheets[name], name);
        if (!p) continue;
        p.types.forEach(addType);
        console.log(`   ${name}: ${p.items.length} cơ sở, ${p.types.length} loại hình`);
        if (dry) continue;
        for (const f of p.items) {
          const key = tenKey(f.ten);
          const exist = await facs.findOne({ tenKey: key });
          if (exist) { // gộp thông tin phân loại, giữ nguyên hồ sơ gốc
            const { ten, soNha, ...cls } = f;
            await facs.updateOne({ _id: exist._id }, { $set: { ...cls, updatedAt: new Date() } });
            merged++;
          } else {
            await facs.insertOne({ ...f, tenKey: key, trangThai: 'hoatdong', nguon: path.basename(file), createdAt: new Date() });
            created++;
          }
        }
        continue;
      }

      const parsed = parseSheet(wb.Sheets[name]);
      if (!parsed || !parsed.items.length) continue;
      const isGiam = /giảm/i.test(name), isTang = /tăng/i.test(name);
      const m = parsed.title.match(/(\d{1,2})\s*[\/.]\s*(\d{4})/);
      const thang = m ? `${m[2]}-${m[1].padStart(2, '0')}` : '';
      console.log(`   ${name}: ${parsed.items.length} dòng`);
      if (dry) { parsed.items.forEach((f) => f.loaiHinh && addType({ ten: f.loaiHinh, linhVuc: f.linhVuc })); continue; }
      for (const f of parsed.items) {
        if (f.loaiHinh) addType({ ten: f.loaiHinh, linhVuc: f.linhVuc });
        const q = f.soTaiKhoan ? { soTaiKhoan: f.soTaiKhoan } : f.soHoSo ? { soHoSo: f.soHoSo } : { ten: f.ten, soNha: f.soNha };
        const set = { ...f, tenKey: tenKey(f.ten), trangThai: isGiam ? 'giam' : 'hoatdong', nguon: path.basename(file), updatedAt: new Date() };
        if (isGiam) set.thangGiam = thang;
        if (isTang) set.thangTang = thang;
        const r = await facs.updateOne(q, { $set: set, $setOnInsert: { createdAt: new Date() } }, { upsert: true });
        r.upsertedCount ? created++ : updated++;
        if (isTang || isGiam) {
          const doc = await facs.findOne(q);
          const loai = isGiam ? 'giam' : 'tang';
          const dup = await db.collection('changes').findOne({ loai, thang, facilityId: String(doc._id) });
          if (!dup) {
            await db.collection('changes').insertOne({ loai, thang, lyDo: f.ghiChu || '', facilityId: String(doc._id), snapshot: doc, createdAt: new Date() });
            isGiam ? giam++ : tang++;
          }
        }
      }
    }
  }
  if (dry) { console.log(`\n[DRY RUN] ${types.size} loại hình sẽ được tạo. Không ghi vào DB.`); return process.exit(0); }
  for (const t of types.values()) {
    const { ALL_TYPES, normalizeFacilityType } = require('../lib/catalog');
    await db.collection('types').deleteMany({});
    await db.collection('types').insertMany(ALL_TYPES.map((item) => ({ ...item, createdAt: new Date() })));
    const allFacs = await facs.find({}).toArray();
    if (allFacs.length) {
      await facs.bulkWrite(allFacs.map((f) => {
        const std = normalizeFacilityType(f);
        return { updateOne: { filter: { _id: f._id }, update: { $set: { maLoaiHinh: std.maLoaiHinh, loaiHinh: std.loaiHinh, linhVuc: std.linhVuc, tenLinhVuc: std.tenLinhVuc } } } };
      }));
    }
    break;
  }
  await facs.createIndex({ soTaiKhoan: 1 });
  await facs.createIndex({ ten: 1 });
  await facs.createIndex({ tenKey: 1 });
  console.log(`\nXong: +${created} mới, ${updated} cập nhật, ${merged} gộp phân loại 10 lĩnh vực, ${types.size} loại hình, ${tang} phiếu tăng, ${giam} phiếu giảm`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
