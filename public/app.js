const $ = (s) => document.querySelector(s);
const app = $('#app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let ME = null;
async function api(path, method = 'GET', body) {
  const r = await fetch('/api' + path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await r.json().catch(() => ({}));
  if (r.status === 401 && !path.startsWith('/auth/')) { ME = null; boot(); throw new Error('Phiên đăng nhập đã hết hạn'); }
  if (!r.ok) throw new Error(data.error || 'Lỗi');
  return data;
}
const safe = (fn) => async (...a) => { try { await fn(...a); } catch (e) { alert(e.message); } };

function modal(html) { $('#modalBox').innerHTML = html; $('#modal').classList.remove('hidden'); }
function closeModal() { $('#modal').classList.add('hidden'); }
$('#modal').addEventListener('mousedown', (e) => { if (e.target.id === 'modal') closeModal(); });

const FIELDS = [
  ['ten', 'Tên cơ sở *', 'full'], ['soHoSo', 'Số hồ sơ'], ['soTaiKhoan', 'Số tài khoản'],
  ['soNha', 'Số nhà, đường'], ['khuPho', 'Khu phố / KCN'], ['phuong', 'Phường / xã'], ['linhVuc', 'Thuộc lĩnh vực'],
  ['loaiHinh', 'Loại hình cơ sở', 'type'], ['thangNamHoatDong', 'Tháng/năm hoạt động (vd 03/2020)'],
  ['soTang', 'Số tầng (nổi)', 'number'], ['soTangHam', 'Số tầng hầm', 'number'], ['dienTichMatBang', 'Diện tích mặt bằng (m2)', 'number'], ['khoiTich', 'Khối tích (m3)', 'number'], ['dienTichSan', 'Tổng diện tích sàn (m2)', 'number'],
  ['thongTinDacThu', 'Thông tin đặc thù', 'full'], ['nhomLoaiHinh', 'Nhóm loại hình (theo 10 lĩnh vực)', 'full'],
  ['phanLoai', 'Phân loại theo NĐ 136', 'select', ['', 'Ngoài Phụ lục II', 'Nhóm 1 - Phụ lục II', 'Nhóm 2 - Phụ lục II', 'Phụ lục III', 'Phụ lục VII']],
  ['thamDuyet', 'Thẩm duyệt/nghiệm thu', 'select', ['', 'Đã thẩm duyệt, nghiệm thu', 'Đã thẩm duyệt, chưa nghiệm thu', 'Chưa được thẩm duyệt, nghiệm thu']],
  ['tinhTrangViPham', 'Tình trạng vi phạm', 'full'], ['nguoiDaiDien', 'Người đại diện'], ['dienThoai', 'Điện thoại'],
  ['donViQuanLy', 'Đơn vị quản lý'], ['ghiChu', 'Ghi chú'],
];
let TYPES = [];
const loadTypes = async () => (TYPES = await api('/types'));

function facilityForm(f = {}, prefix = 'f') {
  return `<datalist id="dlTypes">${TYPES.map((t) => `<option value="${esc(t.ten)}">`).join('')}</datalist><div class="grid">` +
    FIELDS.map(([k, label, kind, opts]) => {
      const id = `${prefix}_${k}`, v = esc(f[k] ?? '');
      let input;
      if (kind === 'select') input = `<select id="${id}">${(f[k] && !opts.includes(f[k]) ? [...opts, f[k]] : opts).map((o) => `<option ${o === f[k] ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
      else input = `<input id="${id}" value="${v}" ${kind === 'type' ? 'list="dlTypes"' : ''} ${kind === 'number' ? 'type="number" step="any"' : ''}>`;
      return `<div class="${kind === 'full' ? 'full' : ''}"><label>${label}</label>${input}</div>`;
    }).join('') + '</div>';
}
const readForm = (prefix = 'f') => Object.fromEntries(FIELDS.map(([k]) => [k, $(`#${prefix}_${k}`).value.trim()]));

/* ---------- Router ---------- */
const routes = { '': dashboard, facilities, types, inspections, changes, users, logs, 'inspection': inspectionPrint, 'new-inspection': inspectionForm };
const ADMIN_ROUTES = ['types', 'users', 'logs'];
async function route() {
  if (!ME) return;
  const [name, arg] = location.hash.replace(/^#\/?/, '').split('/');
  document.querySelectorAll('#nav a').forEach((a) => a.classList.toggle('on', a.getAttribute('href') === `#/${name}`));
  app.innerHTML = 'Đang tải...';
  try {
    if (ADMIN_ROUTES.includes(name) && ME.role !== 'admin') throw new Error('Chỉ quản trị viên được truy cập');
    await loadTypes(); await (routes[name] || dashboard)(arg);
  } catch (e) { app.innerHTML = `<p style="color:#b91c1c">Lỗi: ${esc(e.message)}</p>`; }
}
window.addEventListener('hashchange', route);

/* ---------- Đăng nhập / khởi động ---------- */
const ROLE_NAME = { admin: 'Quản trị viên', canbo: 'Cán bộ', xem: 'Chỉ xem' };
// Ẩn nút thao tác ghi với tài khoản chỉ xem
new MutationObserver(() => {
  if (!ME || ME.role !== 'xem') return;
  app.querySelectorAll('#add,#tang,#giam,[data-edit],[data-del],[data-d],a[href^="#/new-inspection"]').forEach((e) => e.remove());
}).observe(app, { childList: true, subtree: true });

function authScreen(setup) {
  $('#shell').classList.add('hidden');
  const v = $('#authView');
  v.classList.remove('hidden');
  v.innerHTML = `<div class="login">
    <div class="login-head">
      <div class="login-badge">🛡️</div>
      <div class="sub">Cảnh sát PCCC &amp; CNCH</div>
      <h2>Hệ thống Quản lý Cơ sở PCCC</h2>
      <p>${setup ? 'Khởi tạo tài khoản Quản trị viên đầu tiên' : 'Đăng nhập hệ thống quản lý nghiệp vụ'}</p>
    </div>
    <form class="login-body" id="authForm" autocomplete="on">
      ${setup ? `<div class="login-field">
        <label for="a_name">Họ và tên cán bộ</label>
        <input id="a_name" name="fullname" type="text" placeholder="Ví dụ: Nguyễn Văn Hào" autocomplete="name">
      </div>` : ''}
      <div class="login-field">
        <label for="a_user">Tên đăng nhập *</label>
        <input id="a_user" name="username" type="text" placeholder="Nhập tên tài khoản..." required autocomplete="username">
      </div>
      <div class="login-field">
        <label for="a_pw">Mật khẩu * (tối thiểu 6 ký tự)</label>
        <div class="pw-wrap">
          <input id="a_pw" name="password" type="password" placeholder="Nhập mật khẩu..." required minlength="6" autocomplete="off">
          <button type="button" class="pw-toggle" id="a_toggle" tabindex="-1">Hiện</button>
        </div>
      </div>
      <div class="err" id="a_err"></div>
      <button type="submit" class="submit-btn" id="a_go">${setup ? '🔥 Khởi tạo Quản trị viên' : '🔐 Đăng nhập hệ thống'}</button>
      <div class="login-foot">An toàn PCCC là hạnh phúc của mọi nhà</div>
    </form>
  </div>`;
  const pwInput = $('#a_pw');
  const toggleBtn = $('#a_toggle');
  toggleBtn.onclick = () => {
    const isPw = pwInput.type === 'password';
    pwInput.type = isPw ? 'text' : 'password';
    toggleBtn.textContent = isPw ? 'Ẩn' : 'Hiện';
    pwInput.focus();
  };
  $('#authForm').onsubmit = async (e) => {
    e.preventDefault();
    $('#a_err').textContent = '';
    const btn = $('#a_go');
    btn.disabled = true;
    try {
      const body = { username: $('#a_user').value, password: pwInput.value };
      if (setup) body.hoTen = $('#a_name').value;
      const d = await api(setup ? '/auth/setup' : '/auth/login', 'POST', body);
      ME = d.user; start();
    } catch (err) {
      $('#a_err').textContent = err.message;
      btn.disabled = false;
    }
  };
  setTimeout(() => (setup ? $('#a_name') : $('#a_user'))?.focus(), 50);
}
function start() {
  $('#authView').classList.add('hidden');
  $('#shell').classList.remove('hidden');
  document.querySelectorAll('.adminOnly').forEach((e) => e.classList.toggle('hidden', ME.role !== 'admin'));
  $('#me').innerHTML = `<b>${esc(ME.hoTen)}</b><br><small>${ROLE_NAME[ME.role]}</small><br>
    <button class="sm sec" id="chpw">Đổi mật khẩu</button><button class="sm sec" id="logout">Đăng xuất</button>`;
  $('#logout').onclick = async () => { await api('/auth/logout', 'POST').catch(() => {}); ME = null; boot(); };
  $('#chpw').onclick = () => {
    modal(`<h3>Đổi mật khẩu</h3><div class="grid"><div class="full"><label>Mật khẩu cũ</label><input id="p0" type="password"></div>
      <div class="full"><label>Mật khẩu mới (≥ 6 ký tự)</label><input id="p1" type="password"></div></div><p><button id="save">Lưu</button> <button class="sec" onclick="closeModal()">Hủy</button></p>`);
    $('#save').onclick = safe(async () => { await api('/auth/password', 'POST', { oldPassword: $('#p0').value, newPassword: $('#p1').value }); closeModal(); alert('Đã đổi mật khẩu'); });
  };
  route();
}
async function boot() {
  const s = await fetch('/api/auth/status').then((r) => r.json()).catch(() => ({ error: 1 }));
  if (s.needSetup) return authScreen(true);
  if (s.user) { ME = s.user; return start(); }
  authScreen(false);
}
boot();

/* ---------- Quản trị: tài khoản ---------- */
async function users() {
  const list = await api('/admin/users');
  app.innerHTML = `<h2>Quản lý tài khoản</h2><div class="bar"><button class="ok" id="add">+ Cấp tài khoản</button></div>
  <table><tr><th>Tên đăng nhập</th><th>Họ tên</th><th>Vai trò</th><th>Trạng thái</th><th>Đăng nhập cuối</th><th></th></tr>
  ${list.map((u) => `<tr><td>${esc(u.username)}</td><td>${esc(u.hoTen)}</td><td>${ROLE_NAME[u.role]}</td>
  <td><span class="tag ${u.active ? 'green' : 'red'}">${u.active ? 'Hoạt động' : 'Đã khóa'}</span></td><td>${u.lastLogin ? new Date(u.lastLogin).toLocaleString('vi-VN') : '—'}</td>
  <td style="white-space:nowrap"><button class="sm" data-e="${u._id}">Sửa / đặt lại MK</button> <button class="sm sec" data-t="${u._id}">${u.active ? 'Khóa' : 'Mở khóa'}</button>
  <button class="sm sec" data-o="${u._id}">Buộc đăng xuất</button> <button class="sm sec" data-x="${u._id}">Xóa</button></td></tr>`).join('')}</table>`;
  const form = (u) => {
    modal(`<h3>${u ? 'Sửa tài khoản ' + esc(u.username) : 'Cấp tài khoản mới'}</h3><div class="grid">
    ${u ? '' : '<div><label>Tên đăng nhập *</label><input id="u_name"></div>'}
    <div><label>Họ tên</label><input id="u_ht" value="${esc(u?.hoTen)}"></div>
    <div><label>Vai trò</label><select id="u_role">${Object.entries(ROLE_NAME).map(([k, v]) => `<option value="${k}" ${u?.role === k || (!u && k === 'canbo') ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
    <div><label>${u ? 'Mật khẩu mới (để trống nếu không đổi)' : 'Mật khẩu * (≥ 6 ký tự)'}</label><input id="u_pw" type="text" autocomplete="off"></div></div>
    <p><small>Quản trị viên: toàn quyền · Cán bộ: nhập liệu, lập biên bản, tăng/giảm · Chỉ xem: chỉ xem dữ liệu.</small></p>
    <p><button id="save">Lưu</button> <button class="sec" onclick="closeModal()">Hủy</button></p>`);
    $('#save').onclick = safe(async () => {
      const b = { hoTen: $('#u_ht').value, role: $('#u_role').value };
      if ($('#u_pw').value) b.password = $('#u_pw').value;
      if (u) await api('/admin/users/' + u._id, 'PUT', b);
      else await api('/admin/users', 'POST', { ...b, username: $('#u_name').value, password: $('#u_pw').value });
      closeModal(); users();
    });
  };
  const find = (id) => list.find((u) => u._id === id);
  $('#add').onclick = () => form();
  app.querySelectorAll('[data-e]').forEach((b) => (b.onclick = () => form(find(b.dataset.e))));
  app.querySelectorAll('[data-t]').forEach((b) => (b.onclick = safe(async () => { await api('/admin/users/' + b.dataset.t, 'PUT', { active: !find(b.dataset.t).active }); users(); })));
  app.querySelectorAll('[data-o]').forEach((b) => (b.onclick = safe(async () => { await api(`/admin/users/${b.dataset.o}/logout`, 'POST'); alert('Đã buộc đăng xuất'); })));
  app.querySelectorAll('[data-x]').forEach((b) => (b.onclick = safe(async () => { if (confirm('Xóa tài khoản này?')) { await api('/admin/users/' + b.dataset.x, 'DELETE'); users(); } })));
}

/* ---------- Quản trị: nhật ký đăng nhập ---------- */
async function logs() {
  const list = await api('/admin/logs');
  app.innerHTML = `<h2>Nhật ký đăng nhập (200 gần nhất)</h2><table><tr><th>Thời gian</th><th>Tài khoản</th><th>IP</th><th>Kết quả</th></tr>
  ${list.map((l) => `<tr><td>${new Date(l.at).toLocaleString('vi-VN')}</td><td>${esc(l.username)}</td><td>${esc(l.ip)}</td>
  <td><span class="tag ${l.ok ? 'green' : 'red'}">${l.ok ? 'Thành công' : esc(l.note || 'Thất bại')}</span></td></tr>`).join('')}</table>`;
}

/* ---------- Tổng quan ---------- */
async function dashboard() {
  const s = await api('/stats');
  const bars = (arr) => { const m = Math.max(1, ...arr.map((x) => x.n)); return `<div class="bars">${arr.map((x) => `<div><span style="width:170px">${esc(x._id || '(trống)')}</span><i style="width:${(x.n / m) * 200}px"></i> ${x.n}</div>`).join('')}</div>`; };
  app.innerHTML = `<h2>Tổng quan</h2>
  <div class="cards"><div class="card"><b>${s.total}</b>Cơ sở đang quản lý</div><div class="card"><b>${s.tang}</b>Lượt tăng</div><div class="card"><b>${s.giam}</b>Lượt giảm</div><div class="card"><b>${s.inspections}</b>Biên bản kiểm tra</div></div>
  <div class="cards" style="grid-template-columns:1fr 1fr"><div class="card"><h4>Theo loại hình (top 10)</h4>${bars(s.byType)}</div><div class="card"><h4>Theo phường/xã</h4>${bars(s.byWard)}</div></div>`;
}

/* ---------- Cơ sở ---------- */
let fq = { q: '', loaiHinh: '', phuong: '', trangThai: 'hoatdong', page: 1 };
async function facilities() {
  const qs = new URLSearchParams({ ...fq, limit: 20 });
  const d = await api('/facilities?' + qs);
  const pages = Math.max(1, Math.ceil(d.total / d.limit));
  app.innerHTML = `<h2>Cơ sở (${d.total})</h2>
  <div class="bar"><input id="q" placeholder="Tìm tên, số hồ sơ, địa chỉ..." value="${esc(fq.q)}">
  <select id="lh"><option value="">Mọi loại hình</option>${TYPES.map((t) => `<option ${t.ten === fq.loaiHinh ? 'selected' : ''}>${esc(t.ten)}</option>`).join('')}</select>
  <select id="tt"><option value="hoatdong">Đang hoạt động</option><option value="giam" ${fq.trangThai === 'giam' ? 'selected' : ''}>Đã giảm</option><option value="all" ${fq.trangThai === 'all' ? 'selected' : ''}>Tất cả</option></select>
  <button id="go">Tìm</button><button class="ok" id="add">+ Thêm cơ sở</button></div>
  <table><tr><th>Tên cơ sở</th><th>Địa chỉ</th><th>Loại hình</th><th>Quy mô</th><th>Kiểm tra cuối</th><th></th></tr>
  ${d.items.map((f) => `<tr><td><b>${esc(f.ten)}</b><br><small>${esc(f.soHoSo || f.soTaiKhoan || '')}</small> ${f.trangThai === 'giam' ? '<span class="tag red">đã giảm</span>' : ''}</td>
  <td>${esc([f.soNha, f.khuPho, f.phuong].filter(Boolean).join(', '))}</td><td>${esc(f.loaiHinh)}</td>
  <td>${f.soTang ?? ''} tầng<br>${f.dienTichSan ?? ''} m²</td><td>${esc(f.lanKiemTraCuoi || '—')}</td>
  <td style="white-space:nowrap"><button class="sm" data-edit="${f._id}">Sửa</button> <a class="btn sm" href="#/new-inspection/${f._id}">Kiểm tra</a> <button class="sm sec" data-del="${f._id}">Xóa</button></td></tr>`).join('')}</table>
  <div class="pager"><button class="sm sec" id="prev" ${fq.page <= 1 ? 'disabled' : ''}>‹</button> Trang ${d.page}/${pages} <button class="sm sec" id="next" ${fq.page >= pages ? 'disabled' : ''}>›</button></div>`;
  const apply = () => { fq = { ...fq, q: $('#q').value, loaiHinh: $('#lh').value, trangThai: $('#tt').value, page: 1 }; facilities(); };
  $('#go').onclick = apply; $('#q').onkeydown = (e) => e.key === 'Enter' && apply();
  $('#prev').onclick = () => { fq.page--; facilities(); }; $('#next').onclick = () => { fq.page++; facilities(); };
  $('#add').onclick = () => editFacility();
  app.querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => editFacility(d.items.find((x) => x._id === b.dataset.edit))));
  app.querySelectorAll('[data-del]').forEach((b) => (b.onclick = safe(async () => { if (confirm('Xóa cơ sở này?')) { await api('/facilities/' + b.dataset.del, 'DELETE'); facilities(); } })));
}
function editFacility(f) {
  modal(`<h3>${f ? 'Sửa' : 'Thêm'} cơ sở</h3>${facilityForm(f || {})}<p><button id="save">Lưu</button> <button class="sec" onclick="closeModal()">Hủy</button></p>`);
  $('#save').onclick = safe(async () => {
    await api(f ? '/facilities/' + f._id : '/facilities', f ? 'PUT' : 'POST', readForm());
    closeModal(); facilities();
  });
}

/* ---------- Loại hình ---------- */
async function types() {
  app.innerHTML = `<h2>Loại hình cơ sở</h2><div class="bar"><button class="ok" id="add">+ Thêm loại hình</button></div>
  <table><tr><th>Tên loại hình</th><th>Lĩnh vực</th><th>Chu kỳ kiểm tra (tháng)</th><th>Mô tả</th><th></th></tr>
  ${TYPES.map((t) => `<tr><td>${esc(t.ten)}</td><td>${esc(t.linhVuc)}</td><td>${esc(t.chuKyKiemTraThang ?? '')}</td><td>${esc(t.moTa)}</td>
  <td><button class="sm" data-e="${t._id}">Sửa</button> <button class="sm sec" data-d="${t._id}">Xóa</button></td></tr>`).join('')}</table>`;
  const form = (t) => {
    modal(`<h3>Loại hình</h3><div class="grid"><div class="full"><label>Tên *</label><input id="t_ten" value="${esc(t?.ten)}"></div>
    <div><label>Lĩnh vực</label><input id="t_lv" value="${esc(t?.linhVuc)}"></div><div><label>Chu kỳ kiểm tra (tháng)</label><input id="t_ck" type="number" value="${esc(t?.chuKyKiemTraThang)}"></div>
    <div class="full"><label>Mô tả</label><textarea id="t_mt">${esc(t?.moTa)}</textarea></div></div>
    <p><button id="save">Lưu</button> <button class="sec" onclick="closeModal()">Hủy</button></p>`);
    $('#save').onclick = safe(async () => {
      const b = { ten: $('#t_ten').value, linhVuc: $('#t_lv').value, chuKyKiemTraThang: $('#t_ck').value, moTa: $('#t_mt').value };
      await api(t ? '/types/' + t._id : '/types', t ? 'PUT' : 'POST', b); closeModal(); route();
    });
  };
  $('#add').onclick = () => form();
  app.querySelectorAll('[data-e]').forEach((b) => (b.onclick = () => form(TYPES.find((t) => t._id === b.dataset.e))));
  app.querySelectorAll('[data-d]').forEach((b) => (b.onclick = safe(async () => { if (confirm('Xóa?')) { await api('/types/' + b.dataset.d, 'DELETE'); route(); } })));
}

/* ---------- Kiểm tra ---------- */
const CHECKLIST = [
  'Hồ sơ pháp lý về PCCC (thẩm duyệt, nghiệm thu)', 'Quyết định thành lập đội PCCC cơ sở / phân công người phụ trách',
  'Nội quy, biển cấm, biển báo, tiêu lệnh chữa cháy', 'Phương án chữa cháy và thoát nạn được phê duyệt',
  'Hệ thống báo cháy, chữa cháy tự động', 'Bình chữa cháy xách tay (số lượng, hạn kiểm định)',
  'Hệ thống điện, thiết bị sinh lửa, sinh nhiệt', 'Lối thoát nạn, cửa thoát nạn, thang thoát hiểm',
  'Đèn chiếu sáng sự cố, đèn exit', 'Họp huấn luyện, diễn tập PCCC định kỳ',
];
async function inspections() {
  const [list, facs] = await Promise.all([api('/inspections'), api('/facilities?limit=500&trangThai=all')]);
  const name = Object.fromEntries(facs.items.map((f) => [f._id, f.ten]));
  app.innerHTML = `<h2>Biên bản kiểm tra</h2><p>Chọn cơ sở bên trang <a href="#/facilities">Cơ sở</a> → nút <b>Kiểm tra</b> để lập biên bản mới.</p>
  <table><tr><th>Số BB</th><th>Ngày</th><th>Cơ sở</th><th>Kết luận</th><th></th></tr>
  ${list.map((i) => `<tr><td>${esc(i.soBienBan)}</td><td>${esc(i.ngayKiemTra)}</td><td>${esc(name[i.facilityId] || '(đã xóa)')}</td>
  <td><span class="tag ${i.ketLuan === 'Đạt' ? 'green' : 'red'}">${esc(i.ketLuan)}</span></td>
  <td><a class="btn sm" href="#/inspection/${i._id}">Xem / in</a> <button class="sm sec" data-d="${i._id}">Xóa</button></td></tr>`).join('')}</table>`;
  app.querySelectorAll('[data-d]').forEach((b) => (b.onclick = safe(async () => { if (confirm('Xóa biên bản?')) { await api('/inspections/' + b.dataset.d, 'DELETE'); inspections(); } })));
}
async function inspectionForm(fid) {
  const f = await api('/facilities/' + fid);
  app.innerHTML = `<h2>Lập biên bản kiểm tra</h2><div class="card"><b style="font-size:18px">${esc(f.ten)}</b>${esc([f.soNha, f.khuPho, f.phuong].filter(Boolean).join(', '))} — ${esc(f.loaiHinh)}</div><br>
  <div class="grid"><div><label>Ngày kiểm tra</label><input type="date" id="i_ngay" value="${new Date().toISOString().slice(0, 10)}"></div>
  <div><label>Loại kiểm tra</label><select id="i_loai"><option>Định kỳ</option><option>Đột xuất</option><option>Theo dõi khắc phục</option></select></div>
  <div><label>Đoàn kiểm tra</label><input id="i_doan"></div><div><label>Người đại diện cơ sở</label><input id="i_dd" value="${esc(f.nguoiDaiDien)}"></div></div>
  <h3>Nội dung kiểm tra</h3><div class="chk"><span class="h">Nội dung</span><span class="h">Đạt</span><span class="h">Không đạt</span><span class="h">N/A</span>
  ${CHECKLIST.map((c, n) => `<span>${esc(c)}</span>${['Đạt', 'Không đạt', 'N/A'].map((v, k) => `<input type="radio" name="c${n}" value="${v}" ${k === 0 ? 'checked' : ''}>`).join('')}`).join('')}</div>
  <div class="grid" style="margin-top:12px"><div class="full"><label>Vi phạm / tồn tại phát hiện</label><textarea id="i_vp" rows="3"></textarea></div>
  <div class="full"><label>Kiến nghị, yêu cầu khắc phục</label><textarea id="i_kn" rows="3"></textarea></div>
  <div><label>Hạn khắc phục</label><input type="date" id="i_han"></div>
  <div><label>Kết luận</label><select id="i_kl"><option>Đạt</option><option>Không đạt</option></select></div></div>
  <p><button id="save">Lưu biên bản</button> <a class="btn sec" href="#/facilities">Hủy</a></p>`;
  $('#save').onclick = safe(async () => {
    const checklist = CHECKLIST.map((c, n) => ({ noiDung: c, ketQua: document.querySelector(`input[name=c${n}]:checked`).value }));
    const r = await api('/inspections', 'POST', {
      facilityId: fid, ngayKiemTra: $('#i_ngay').value, loaiKiemTra: $('#i_loai').value, doanKiemTra: $('#i_doan').value,
      nguoiDaiDien: $('#i_dd').value, checklist, viPham: $('#i_vp').value, kienNghi: $('#i_kn').value, hanKhacPhuc: $('#i_han').value, ketLuan: $('#i_kl').value,
    });
    location.hash = '#/inspection/' + r._id;
  });
}
const vnDate = (s) => (s ? s.split('-').reverse().join('/') : '...');
async function inspectionPrint(id) {
  const i = await api('/inspections/' + id), f = i.facility || {};
  app.innerHTML = `<div class="noprint bar"><button onclick="print()">🖨 In biên bản</button><a class="btn sec" href="#/inspections">Quay lại</a></div>
  <div class="paper"><p class="c"><b>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</b><br>Độc lập - Tự do - Hạnh phúc</p>
  <h3>Biên bản kiểm tra an toàn về phòng cháy và chữa cháy<br><small>Số: ${esc(i.soBienBan)}</small></h3>
  <p>Hôm nay, ngày ${vnDate(i.ngayKiemTra)}, đoàn kiểm tra (${esc(i.doanKiemTra) || '...'}) đã tiến hành kiểm tra (${esc(i.loaiKiemTra)}) đối với:</p>
  <p><b>Cơ sở:</b> ${esc(f.ten)}<br><b>Địa chỉ:</b> ${esc([f.soNha, f.khuPho, f.phuong].filter(Boolean).join(', '))}<br><b>Loại hình:</b> ${esc(f.loaiHinh)} — <b>Số hồ sơ:</b> ${esc(f.soHoSo)}<br>
  <b>Quy mô:</b> ${f.soTang ?? '...'} tầng, ${f.dienTichSan ?? '...'} m² sàn<br><b>Người đại diện:</b> ${esc(i.nguoiDaiDien)}</p>
  <table><tr><th>TT</th><th>Nội dung</th><th>Kết quả</th></tr>${(i.checklist || []).map((c, n) => `<tr><td>${n + 1}</td><td>${esc(c.noiDung)}</td><td>${esc(c.ketQua)}</td></tr>`).join('')}</table>
  <p><b>Vi phạm, tồn tại:</b><br>${esc(i.viPham || 'Không').replace(/\n/g, '<br>')}</p>
  <p><b>Kiến nghị:</b><br>${esc(i.kienNghi || 'Không').replace(/\n/g, '<br>')}<br>Hạn khắc phục: ${vnDate(i.hanKhacPhuc)}</p>
  <p><b>Kết luận:</b> ${esc(i.ketLuan)}</p>
  <table style="border:0"><tr style="text-align:center"><td style="border:0"><b>ĐẠI DIỆN CƠ SỞ</b><br><br><br><br></td><td style="border:0"><b>ĐOÀN KIỂM TRA</b><br><br><br><br></td></tr></table></div>`;
}

/* ---------- Tăng / giảm ---------- */
let chThang = new Date().toISOString().slice(0, 7);
async function changes() {
  const list = await api('/changes?thang=' + chThang);
  const row = (c) => `<tr><td>${esc(c.snapshot?.ten)}</td><td>${esc([c.snapshot?.soNha, c.snapshot?.khuPho, c.snapshot?.phuong].filter(Boolean).join(', '))}</td><td>${esc(c.snapshot?.loaiHinh)}</td><td>${esc(c.lyDo)}</td><td class="noprint"><button class="sm sec" data-d="${c._id}">Hủy phiếu</button></td></tr>`;
  const sect = (loai, title) => { const l = list.filter((c) => c.loai === loai); return `<h3>${title} (${l.length})</h3><table><tr><th>Tên cơ sở</th><th>Địa chỉ</th><th>Loại hình</th><th>Ghi chú / lý do</th><th class="noprint"></th></tr>${l.map(row).join('')}</table>`; };
  app.innerHTML = `<h2>Danh sách tăng, giảm cơ sở tháng ${chThang.split('-').reverse().join('/')}</h2>
  <div class="bar noprint"><input type="month" id="th" value="${chThang}"><button id="tang" class="ok">+ Tăng cơ sở</button><button id="giam">− Giảm cơ sở</button><button class="sec" onclick="print()">🖨 In</button></div>
  ${sect('tang', 'DANH SÁCH TĂNG')}${sect('giam', 'DANH SÁCH GIẢM')}`;
  $('#th').onchange = (e) => { chThang = e.target.value; changes(); };
  app.querySelectorAll('[data-d]').forEach((b) => (b.onclick = safe(async () => { if (confirm('Hủy phiếu và hoàn tác?')) { await api('/changes/' + b.dataset.d, 'DELETE'); changes(); } })));
  $('#tang').onclick = () => {
    modal(`<h3>Tăng cơ sở — tháng ${chThang}</h3>${facilityForm({}, 'n')}<p><button id="save">Lưu</button> <button class="sec" onclick="closeModal()">Hủy</button></p>`);
    $('#save').onclick = safe(async () => { await api('/changes', 'POST', { loai: 'tang', thang: chThang, lyDo: $('#n_ghiChu').value, facility: readForm('n') }); closeModal(); changes(); });
  };
  $('#giam').onclick = () => {
    modal(`<h3>Giảm cơ sở — tháng ${chThang}</h3><div class="bar"><input id="gq" placeholder="Tìm cơ sở..."><button id="gs">Tìm</button></div><div id="gres"></div>
    <div><label>Lý do giảm</label><input id="gly" placeholder="Ngưng hoạt động, chuyển địa điểm, ..."></div>`);
    $('#gs').onclick = safe(async () => {
      const d = await api('/facilities?limit=15&q=' + encodeURIComponent($('#gq').value));
      $('#gres').innerHTML = `<table>${d.items.map((f) => `<tr><td>${esc(f.ten)}<br><small>${esc([f.soNha, f.phuong].filter(Boolean).join(', '))}</small></td><td><button class="sm" data-g="${f._id}">Giảm</button></td></tr>`).join('')}</table>`;
      $('#gres').querySelectorAll('[data-g]').forEach((b) => (b.onclick = safe(async () => {
        await api('/changes', 'POST', { loai: 'giam', thang: chThang, lyDo: $('#gly').value, facilityId: b.dataset.g }); closeModal(); changes();
      })));
    });
  };
}
