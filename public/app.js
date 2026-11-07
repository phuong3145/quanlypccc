const $ = (s) => document.querySelector(s);
const app = $('#app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const LINH_VUC_MAP = {
  '1': 'Nhà ở, Trụ sở & Bưu chính',
  '2': 'Y tế & Trợ giúp xã hội',
  '3': 'Giáo dục & Nghiên cứu',
  '4': 'Văn hóa, Thể thao, Giải trí & Lưu trú',
  '5': 'Thương mại & Dịch vụ',
  '6': 'Giao thông, Hạ tầng & Bãi xe',
  '7': 'Năng lượng & Điện lực',
  '8': 'Dầu khí, Xăng dầu & Khí đốt',
  '9': 'Hóa chất, Vật liệu nổ & Công nghiệp nguy hiểm',
  '10': 'Sản xuất Công nghiệp & Kho hàng',
};
const LV_IDS = Object.keys(LINH_VUC_MAP);
const parentLvId = (v) => String(v ?? '').split('.')[0].replace(/\D/g, '') || '';

const ROLE_NAME = {
  admin: 'Quản trị viên',
  banchihuy: 'Ban chỉ huy',
  canbo: 'Cán bộ',
  xem: 'Chỉ xem',
};
const ROLE_TAG = {
  admin: 'red',
  banchihuy: 'gold',
  canbo: 'blue',
  xem: '',
};

const PERM_SCHEMA = [
  ['viewAllFacilities', 'Xem cơ sở của tất cả cán bộ', 'Tắt: chỉ xem được cơ sở thuộc tài khoản của mình'],
  ['manageFacilities', 'Thêm / Sửa / Xóa cơ sở PCCC', 'Cho phép nhập mới, cập nhật và xóa hồ sơ cơ sở'],
  ['assignFacilityOwner', 'Chuyển / Gán cán bộ quản lý cơ sở', 'Cho phép chọn cơ sở thuộc về tài khoản cán bộ nào'],
  ['manageTypes', 'Quản lý Danh mục Loại hình cơ sở', 'Thêm, sửa, xóa loại hình trong 10 lĩnh vực PCCC'],
  ['manageInspections', 'Quản lý Biên bản kiểm tra', 'Lập mới, sửa và xóa biên bản kiểm tra an toàn PCCC'],
  ['manageChanges', 'Quản lý Tăng / Giảm cơ sở', 'Thêm, sửa và xóa/hủy phiếu tăng giảm cơ sở'],
  ['manageSystem', 'Quản trị hệ thống (Tài khoản & Nhật ký)', 'Truy cập mục Quản lý tài khoản, Phân quyền & Nhật ký'],
];

const ROLE_DEFAULTS = {
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

let ME = null;
let OFFICERS = [];
const hasPerm = (k) => !!(ME?.permissions ? ME.permissions[k] : ROLE_DEFAULTS[ME?.role || 'canbo']?.[k]);

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

// Ngăn các phím tắt của trình duyệt / extension (như phím F, /) chặn việc gõ chữ trong ô input
['keydown', 'keypress', 'keyup'].forEach((evt) => {
  document.addEventListener(evt, (e) => {
    const tag = e.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
      e.stopPropagation();
    }
  }, false);
});

const WARD_NAMES = [
  'Phường Tân Thuận',
  'Phường Phú Thuận',
  'Phường Tân Mỹ',
  'Phường Tân Hưng',
];

const FIELDS = [
  ['ten', 'Tên cơ sở *', 'full'],
  ['soHoSo', 'Số hồ sơ'],
  ['soTaiKhoan', 'Số tài khoản'],
  ['loaiHinh', 'Loại hình cơ sở *', 'type'],
  ['linhVuc', 'Thuộc lĩnh vực (ID cha 1–10)', 'linhvuc'],
  ['soNha', 'Số nhà, tên đường'],
  ['khuPho', 'Khu phố / KCN'],
  ['phuong', 'Phường / xã *', 'ward'],
  ['thangNamHoatDong', 'Tháng/năm hoạt động (vd 03/2020)'],
  ['soTang', 'Số tầng (nổi)', 'number'],
  ['soTangHam', 'Số tầng hầm', 'number'],
  ['dienTichMatBang', 'Diện tích mặt bằng (m²)', 'number'],
  ['dienTichSan', 'Tổng diện tích sàn (m²)', 'number'],
  ['khoiTich', 'Khối tích (m³)', 'number'],
  ['thongTinDacThu', 'Thông tin đặc thù', 'full'],
  ['phanLoai', 'Phân loại theo Nghị định', 'select', ['', 'Ngoài Phụ lục II', 'Nhóm 1 - Phụ lục II', 'Nhóm 2 - Phụ lục II', 'Phụ lục III', 'Phụ lục VII', 'UBND cấp xã quản lý']],
  ['thamDuyet', 'Thẩm duyệt / nghiệm thu', 'select', ['', 'Đã thẩm duyệt, nghiệm thu', 'Đã thẩm duyệt, chưa nghiệm thu', 'Chưa được thẩm duyệt, nghiệm thu']],
  ['tinhTrangViPham', 'Tình trạng vi phạm', 'full'],
  ['nguoiDaiDien', 'Người đại diện / Cán bộ phụ trách'],
  ['dienThoai', 'Số điện thoại'],
  ['donViQuanLy', 'Đơn vị quản lý'],
  ['ghiChu', 'Ghi chú'],
];

let TYPES = [];
const loadTypes = async () => (TYPES = await api('/types'));
const loadOfficers = async () => {
  if (hasPerm('viewAllFacilities') || hasPerm('assignFacilityOwner')) {
    OFFICERS = await api('/officers').catch(() => []);
  } else if (ME) {
    OFFICERS = [{ username: ME.username, hoTen: ME.hoTen, role: ME.role }];
  }
};

function renderLvBadge(lv) {
  const pid = parentLvId(lv);
  if (!pid) return '<span class="tag">—</span>';
  const name = LINH_VUC_MAP[pid] || '';
  return `<span class="lv-badge" title="${esc(name)}">Lĩnh vực ${esc(pid)}</span>${name ? `<span class="lv-sub">${esc(name)}</span>` : ''}`;
}

function facilityForm(f = {}, prefix = 'f') {
  const curLv = parentLvId(f.linhVuc) || '1';
  const groupedOptions = LV_IDS.map((id) => {
    const items = TYPES.filter((t) => parentLvId(t.linhVuc) === id);
    if (!items.length) return '';
    return `<optgroup label="Lĩnh vực ${id}: ${esc(LINH_VUC_MAP[id])}">${items
      .map((t) => `<option value="${esc(t.ten)}" data-lv="${id}" ${t.ten === f.loaiHinh ? 'selected' : ''}>${esc(t.ten)}</option>`)
      .join('')}</optgroup>`;
  }).join('');
  const extraOpt = f.loaiHinh && !TYPES.some((t) => t.ten === f.loaiHinh)
    ? `<option value="${esc(f.loaiHinh)}" selected>${esc(f.loaiHinh)}</option>` : '';

  const curOwner = f.canBoUsername || ME?.username || '';
  const ownerSelectHtml = hasPerm('assignFacilityOwner')
    ? `<div class="full"><label for="${prefix}_canBoUsername">👤 Tài khoản Cán bộ phụ trách cơ sở *</label>
        <select id="${prefix}_canBoUsername">
          ${OFFICERS.map((u) => `<option value="${esc(u.username)}" ${u.username === curOwner ? 'selected' : ''}>${esc(u.hoTen)} (${esc(u.username)} — ${esc(ROLE_NAME[u.role] || u.role)})</option>`).join('')}
        </select>
      </div>`
    : '';

  return `<div class="grid">` +
    ownerSelectHtml +
    FIELDS.map(([k, label, kind, opts]) => {
      const id = `${prefix}_${k}`, v = esc(f[k] ?? '');
      let input;
      if (kind === 'type') {
        input = `<select id="${id}"><option value="">-- Chọn loại hình cơ sở --</option>${extraOpt}${groupedOptions}</select>`;
      } else if (kind === 'linhvuc') {
        input = `<select id="${id}">${LV_IDS.map((lid) => `<option value="${lid}" ${lid === curLv ? 'selected' : ''}>Lĩnh vực ${lid} — ${esc(LINH_VUC_MAP[lid])}</option>`).join('')}</select>`;
      } else if (kind === 'ward') {
        const curWard = WARD_NAMES.includes(f[k]) ? f[k] : WARD_NAMES[0];
        input = `<select id="${id}">${WARD_NAMES.map((w) => `<option value="${esc(w)}" ${w === curWard ? 'selected' : ''}>${esc(w)}</option>`).join('')}</select>`;
      } else if (kind === 'select') {
        const list = f[k] && !opts.includes(f[k]) ? [...opts, f[k]] : opts;
        input = `<select id="${id}">${list.map((o) => `<option ${o === f[k] ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
      } else {
        input = `<input id="${id}" type="${kind === 'number' ? 'number' : 'text'}" value="${v}" autocomplete="off" ${kind === 'number' ? 'step="any"' : ''}>`;
      }
      return `<div class="${kind === 'full' ? 'full' : ''}"><label for="${id}">${label}</label>${input}</div>`;
    }).join('') + '</div>';
}

function bindFacilityFormEvents(prefix = 'f') {
  const typeSel = $(`#${prefix}_loaiHinh`);
  const lvSel = $(`#${prefix}_linhVuc`);
  if (typeSel && lvSel) {
    typeSel.onchange = () => {
      const opt = typeSel.selectedOptions[0];
      if (opt && opt.dataset.lv) lvSel.value = opt.dataset.lv;
    };
  }
}

const readForm = (prefix = 'f') => {
  const obj = Object.fromEntries(FIELDS.map(([k]) => [k, $(`#${prefix}_${k}`).value.trim()]));
  const opt = $(`#${prefix}_loaiHinh`)?.selectedOptions?.[0];
  if (opt?.dataset?.lv) obj.linhVuc = opt.dataset.lv; // Đảm bảo luôn lưu ID của phần cha (1..10)
  const ownerEl = $(`#${prefix}_canBoUsername`);
  if (ownerEl) obj.canBoUsername = ownerEl.value;
  return obj;
};

/* ---------- Router ---------- */
const routes = { '': dashboard, facilities, wards, types, inspections, changes, users, logs, 'inspection': inspectionPrint, 'new-inspection': inspectionForm };
const ADMIN_ROUTES = ['users', 'logs'];
const SPINNER_HTML = '<div class="spin-screen"><div class="spinner"></div></div>';
async function route() {
  if (!ME) return;
  const [name, arg] = location.hash.replace(/^#\/?/, '').split('/');
  document.querySelectorAll('#nav a').forEach((a) => a.classList.toggle('on', a.getAttribute('href') === `#/${name}`));
  app.innerHTML = SPINNER_HTML;
  try {
    if (ADMIN_ROUTES.includes(name) && !hasPerm('manageSystem')) throw new Error('Tài khoản không có quyền truy cập Quản trị hệ thống');
    await Promise.all([loadTypes(), loadOfficers()]);
    await (routes[name] || dashboard)(arg);
  } catch (e) { app.innerHTML = `<p style="color:#b91c1c">Lỗi: ${esc(e.message)}</p>`; }
}
window.addEventListener('hashchange', route);

/* ---------- Đăng nhập / khởi động ---------- */
const EYE_ICON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
const EYE_OFF_ICON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;

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
          <button type="button" class="pw-toggle" id="a_toggle" title="Hiện / ẩn mật khẩu" aria-label="Hiện / ẩn mật khẩu" tabindex="-1">${EYE_ICON}</button>
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
    toggleBtn.innerHTML = isPw ? EYE_OFF_ICON : EYE_ICON;
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
  document.querySelectorAll('.adminOnly').forEach((e) => e.classList.toggle('hidden', !hasPerm('manageSystem')));
  $('#me').innerHTML = `<b>👤 ${esc(ME.hoTen)}</b><small>${esc(ROLE_NAME[ME.role] || ME.role)} (${esc(ME.username)})</small>
    <button class="sm sec" id="chpw">Đổi MK</button><button class="sm sec" id="logout">Đăng xuất</button>`;
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

/* ---------- Quản trị: Tài khoản & Phân quyền ---------- */
const PERM_SHORT = {
  viewAllFacilities: 'Xem tất cả CS',
  manageFacilities: 'Thêm/Sửa/Xóa CS',
  assignFacilityOwner: 'Gán cán bộ',
  manageTypes: 'Sửa loại hình',
  manageInspections: 'Biên bản KT',
  manageChanges: 'Tăng/Giảm CS',
  manageSystem: 'Quản trị HT',
};

function renderPermSummary(u) {
  const p = u.permissions || ROLE_DEFAULTS[u.role] || {};
  const badges = Object.entries(PERM_SHORT)
    .filter(([k]) => p[k])
    .map(([k, lbl]) => `<span class="tag ${k === 'manageSystem' ? 'red' : k === 'viewAllFacilities' ? 'gold' : 'green'}">${esc(lbl)}</span>`);
  if (!badges.length) return '<span class="tag">Chỉ xem CS cá nhân</span>';
  return `<div class="perm-pills">${badges.join('')}</div>`;
}

async function users() {
  const list = await api('/admin/users');
  app.innerHTML = `<div class="page-head">
    <div>
      <h2>👥 Quản lý tài khoản &amp; Phân quyền</h2>
      <p class="sub-note">Cấp phát tài khoản Quản trị viên, Ban chỉ huy, Cán bộ và tùy chỉnh quyền hạn từng chức năng</p>
    </div>
    <button class="ok" id="add">+ Cấp tài khoản mới</button>
  </div>
  <div class="table-wrap"><table>
    <thead><tr>
      <th>Tên đăng nhập</th>
      <th>Họ và tên</th>
      <th>Vai trò</th>
      <th>Số cơ sở phụ trách</th>
      <th>Phân quyền chức năng</th>
      <th>Trạng thái</th>
      <th>Đăng nhập cuối</th>
      <th>Thao tác</th>
    </tr></thead>
    <tbody>
    ${list.map((u) => `<tr>
      <td><b>${esc(u.username)}</b></td>
      <td>${esc(u.hoTen)}</td>
      <td><span class="tag ${ROLE_TAG[u.role] || 'blue'}">${esc(ROLE_NAME[u.role] || u.role)}</span></td>
      <td><span class="tag ${u.soCoSo ? 'green' : ''}">${u.soCoSo || 0} cơ sở</span></td>
      <td>${renderPermSummary(u)}</td>
      <td><span class="tag ${u.active ? 'green' : 'red'}">${u.active ? 'Hoạt động' : 'Đã khóa'}</span></td>
      <td>${u.lastLogin ? new Date(u.lastLogin).toLocaleString('vi-VN') : '—'}</td>
      <td style="white-space:nowrap">
        <button class="sm" data-e="${u._id}">🔐 Phân quyền / Sửa</button>
        <button class="sm sec" data-t="${u._id}">${u.active ? 'Khóa' : 'Mở khóa'}</button>
        <button class="sm sec" data-o="${u._id}">Buộc xuất</button>
        <button class="sm sec" data-x="${u._id}">Xóa</button>
      </td>
    </tr>`).join('')}
    </tbody>
  </table></div>`;

  const form = (u) => {
    const initRole = u?.role || 'canbo';
    const initPerms = { ...(ROLE_DEFAULTS[initRole] || ROLE_DEFAULTS.canbo), ...(u?.permissions || {}) };
    modal(`<h3>${u ? `🔐 Phân quyền &amp; Sửa tài khoản: ${esc(u.username)}` : '➕ Cấp tài khoản mới &amp; Phân quyền'}</h3>
    <div class="grid">
      ${u ? '' : '<div><label>Tên đăng nhập *</label><input id="u_name" type="text" autocomplete="off" placeholder="vd: tuannghia"></div>'}
      <div><label>Họ và tên *</label><input id="u_ht" type="text" autocomplete="off" value="${esc(u?.hoTen || '')}" placeholder="Nhập họ tên cán bộ..."></div>
      <div>
        <label>Vai trò (Chọn để áp dụng mẫu quyền mặc định)</label>
        <select id="u_role">
          ${Object.entries(ROLE_NAME).map(([k, v]) => `<option value="${k}" ${initRole === k ? 'selected' : ''}>${v}</option>`).join('')}
        </select>
      </div>
      <div class="${u ? 'full' : ''}">
        <label>${u ? 'Mật khẩu mới (để trống nếu giữ nguyên)' : 'Mật khẩu * (tối thiểu 6 ký tự)'}</label>
        <input id="u_pw" type="text" autocomplete="off" placeholder="${u ? 'Nhập mật khẩu mới nếu muốn đổi...' : 'Nhập mật khẩu ≥ 6 ký tự...'}">
      </div>
      <div class="full">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
          <label style="margin:0;font-size:13px;color:var(--red-800)">⚙️ Phân quyền chức năng chi tiết (Có thể bật/tắt tùy ý cho từng tài khoản)</label>
          <button type="button" class="sm sec" id="u_reset_perm">Đặt lại theo mẫu vai trò</button>
        </div>
        <div class="perm-box">
          <div class="perm-grid">
            ${PERM_SCHEMA.map(([k, title, desc]) => `
              <label class="perm-item">
                <input type="checkbox" data-perm="${k}" ${initPerms[k] ? 'checked' : ''}>
                <div>
                  <b>${esc(title)}</b>
                  <small>${esc(desc)}</small>
                </div>
              </label>
            `).join('')}
          </div>
        </div>
      </div>
    </div>
    <p style="margin-top:16px"><button id="save">💾 Lưu tài khoản &amp; Phân quyền</button> <button class="sec" onclick="closeModal()">Hủy</button></p>`);

    const applyRolePreset = (role) => {
      const preset = ROLE_DEFAULTS[role] || ROLE_DEFAULTS.canbo;
      document.querySelectorAll('#modalBox [data-perm]').forEach((cb) => {
        cb.checked = !!preset[cb.dataset.perm];
      });
    };
    $('#u_role').onchange = (e) => applyRolePreset(e.target.value);
    $('#u_reset_perm').onclick = () => applyRolePreset($('#u_role').value);

    $('#save').onclick = safe(async () => {
      const permissions = {};
      document.querySelectorAll('#modalBox [data-perm]').forEach((cb) => {
        permissions[cb.dataset.perm] = cb.checked;
      });
      const b = { hoTen: $('#u_ht').value.trim(), role: $('#u_role').value, permissions };
      if ($('#u_pw').value) b.password = $('#u_pw').value;
      if (u) {
        await api('/admin/users/' + u._id, 'PUT', b);
        if (String(u._id) === String(ME._id)) {
          const st = await api('/auth/status');
          if (st.user) ME = st.user;
        }
      } else {
        await api('/admin/users', 'POST', { ...b, username: $('#u_name').value, password: $('#u_pw').value });
      }
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
  app.innerHTML = `<div class="page-head"><div><h2>🕒 Nhật ký đăng nhập</h2><p class="sub-note">200 lượt truy cập gần nhất</p></div></div>
  <div class="table-wrap"><table><thead><tr><th>Thời gian</th><th>Tài khoản</th><th>Địa chỉ IP</th><th>Kết quả</th></tr></thead><tbody>
  ${list.map((l) => `<tr><td>${new Date(l.at).toLocaleString('vi-VN')}</td><td><b>${esc(l.username)}</b></td><td>${esc(l.ip)}</td>
  <td><span class="tag ${l.ok ? 'green' : 'red'}">${l.ok ? 'Thành công' : esc(l.note || 'Thất bại')}</span></td></tr>`).join('')}</tbody></table></div>`;
}

/* ---------- Tổng quan ---------- */
let dashCanBo = '';
async function dashboard() {
  const canViewAll = hasPerm('viewAllFacilities');
  const qs = canViewAll && dashCanBo ? `?canBo=${encodeURIComponent(dashCanBo)}` : '';
  const s = await api('/stats' + qs);
  const bars = (arr, labelFn = (x) => x._id || '(trống)') => {
    if (!arr || !arr.length) return '<p style="color:#94a3b8;font-size:13px">Chưa có dữ liệu</p>';
    const m = Math.max(1, ...arr.map((x) => x.n));
    return `<div class="bars">${arr.map((x) => `<div><span class="lbl" title="${esc(labelFn(x))}">${esc(labelFn(x))}</span><div class="track"><i style="width:${x.n ? Math.max(4, (x.n / m) * 100) : 0}%"></i></div><b class="val">${x.n}</b></div>`).join('')}</div>`;
  };
  const fieldItems = [...(s.byField || [])].sort((a, b) => Number(a._id || 99) - Number(b._id || 99));
  const scopeNote = canViewAll
    ? (dashCanBo ? `Đang lọc theo cán bộ: ${dashCanBo}` : 'Toàn bộ cơ sở trên hệ thống (Tất cả cán bộ)')
    : `Cơ sở do cán bộ ${ME.hoTen} (${ME.username}) phụ trách`;

  app.innerHTML = `<div class="page-head">
    <div>
      <h2>📊 Tổng quan công tác quản lý PCCC</h2>
      <p class="sub-note">Phạm vi dữ liệu: <b>${esc(scopeNote)}</b></p>
    </div>
    ${canViewAll ? `<div>
      <select id="dash_cb" style="min-width:240px">
        <option value="">👥 Tất cả cán bộ phụ trách</option>
        ${OFFICERS.map((u) => `<option value="${esc(u.username)}" ${dashCanBo === u.username ? 'selected' : ''}>👤 ${esc(u.hoTen)} (${esc(u.username)})</option>`).join('')}
      </select>
    </div>` : ''}
  </div>
  <div class="cards">
    <div class="card"><b>${s.total}</b>Cơ sở đang quản lý</div>
    <div class="card gold"><b>${LV_IDS.length}</b>Nhóm lĩnh vực PCCC (${TYPES.length} loại hình)</div>
    <div class="card green"><b>${s.tang} / ${s.giam}</b>Lượt Tăng / Giảm cơ sở</div>
    <div class="card slate"><b>${s.inspections}</b>Biên bản kiểm tra đã lập</div>
  </div>
  <div class="cards charts-grid">
    <div class="card"><h4>Phân bố theo 10 Lĩnh vực PCCC</h4>${bars(fieldItems, (x) => `Lĩnh vực ${x._id}: ${LINH_VUC_MAP[x._id] || 'Khác'}`)}</div>
    <div class="card gold"><h4>Top 10 Loại hình cơ sở</h4>${bars(s.byType)}</div>
    <div class="card slate"><h4>Phân bố theo Phường / Xã</h4>${bars(s.byWard)}</div>
    ${canViewAll ? `<div class="card green"><h4>Phân bố theo Cán bộ phụ trách</h4>${bars(s.byOfficer, (x) => `${x.hoTen || x._id || 'Chưa gán'} (${x._id || '—'})`)}</div>` : ''}
  </div>`;
  if ($('#dash_cb')) {
    $('#dash_cb').onchange = (e) => { dashCanBo = e.target.value; dashboard(); };
  }
}

/* ---------- Cơ sở ---------- */
let fq = { q: '', linhVuc: '', loaiHinh: '', phuong: '', trangThai: 'hoatdong', canBo: '', page: 1 };
async function facilities() {
  const canViewAll = hasPerm('viewAllFacilities');
  const canManage = hasPerm('manageFacilities');
  const canInspect = hasPerm('manageInspections');
  const qs = new URLSearchParams({ ...fq, limit: 20 });
  if (!canViewAll) qs.delete('canBo');
  const d = await api('/facilities?' + qs);
  const pages = Math.max(1, Math.ceil(d.total / d.limit));
  const filteredTypes = fq.linhVuc ? TYPES.filter((t) => parentLvId(t.linhVuc) === fq.linhVuc) : TYPES;

  app.innerHTML = `<div class="page-head">
    <div>
      <h2>🏢 Danh sách cơ sở PCCC (${d.total})</h2>
      <p class="sub-note">${canViewAll ? 'Xem toàn bộ cơ sở của các cán bộ trên địa bàn' : `Danh sách cơ sở thuộc quyền quản lý của cán bộ <b>${esc(ME.hoTen)} (${esc(ME.username)})</b>`}</p>
    </div>
    ${canManage ? '<button class="ok" id="add">+ Thêm cơ sở mới</button>' : ''}
  </div>
  <form class="bar" id="facFilterForm" autocomplete="off">
    <input id="q" name="q" type="text" autocomplete="off" placeholder="🔍 Tìm tên cơ sở, số hồ sơ, mã tài khoản, địa chỉ..." value="${esc(fq.q)}">
    <select id="ph">
      <option value="">📍 Tất cả 4 phường</option>
      ${WARD_NAMES.map((w) => `<option value="${esc(w)}" ${fq.phuong === w ? 'selected' : ''}>${esc(w)}</option>`).join('')}
    </select>
    ${canViewAll ? `<select id="cb">
      <option value="">👥 Tất cả cán bộ phụ trách</option>
      ${OFFICERS.map((u) => `<option value="${esc(u.username)}" ${fq.canBo === u.username ? 'selected' : ''}>👤 ${esc(u.hoTen)} (${esc(u.username)})</option>`).join('')}
    </select>` : ''}
    <select id="lv">
      <option value="">Tất cả lĩnh vực (1–10)</option>
      ${LV_IDS.map((id) => `<option value="${id}" ${fq.linhVuc === id ? 'selected' : ''}>Lĩnh vực ${id}: ${esc(LINH_VUC_MAP[id])}</option>`).join('')}
    </select>
    <select id="lh">
      <option value="">Tất cả loại hình (${filteredTypes.length})</option>
      ${filteredTypes.map((t) => `<option value="${esc(t.ten)}" ${t.ten === fq.loaiHinh ? 'selected' : ''}>${esc(t.ten)}</option>`).join('')}
    </select>
    <select id="tt">
      <option value="hoatdong">Đang hoạt động</option>
      <option value="giam" ${fq.trangThai === 'giam' ? 'selected' : ''}>Đã giảm</option>
      <option value="all" ${fq.trangThai === 'all' ? 'selected' : ''}>Tất cả trạng thái</option>
    </select>
    <button type="submit" id="go">Lọc kết quả</button>
  </form>
  <div class="table-wrap"><table>
    <thead><tr>
      <th>Tên cơ sở &amp; Hồ sơ</th>
      <th>Địa chỉ</th>
      <th>Thuộc lĩnh vực</th>
      <th>Loại hình cơ sở</th>
      <th>Quy mô</th>
      <th>Cán bộ phụ trách</th>
      <th>Thao tác</th>
    </tr></thead>
    <tbody>
    ${d.items.map((f) => `<tr>
        <td><b>${esc(f.ten)}</b><br><small style="color:#64748b">${esc(f.soHoSo || f.soTaiKhoan || '')}</small> ${f.trangThai === 'giam' ? '<span class="tag red">Đã giảm</span>' : ''}</td>
        <td>${esc([f.soNha, f.khuPho, f.phuong].filter(Boolean).join(', '))}</td>
        <td>${renderLvBadge(f.linhVuc)}</td>
        <td>${esc(f.loaiHinh || '—')}</td>
        <td style="white-space:nowrap">${f.soTang ? `${f.soTang} tầng` : ''}${f.soTangHam ? ` (${f.soTangHam} hầm)` : ''}<br><small style="color:#64748b">${f.dienTichSan ? `${f.dienTichSan} m² sàn` : (f.dienTichMatBang ? `${f.dienTichMatBang} m² MB` : '')}</small></td>
        <td><span class="tag blue">👤 ${esc(f.canBoHoTen || f.canBoUsername || '—')}</span></td>
        <td style="white-space:nowrap">
          <button class="sm info" data-view="${f._id}">Chi tiết</button>
          ${canManage ? `<button class="sm" data-edit="${f._id}">Sửa</button>` : ''}
          ${canInspect ? `<a class="btn sm amber" href="#/new-inspection/${f._id}">Kiểm tra</a>` : ''}
          ${canManage ? `<button class="sm sec" data-del="${f._id}">Xóa</button>` : ''}
        </td>
      </tr>`).join('')}
    </tbody>
  </table></div>
  <div class="pager">
    <span>Hiển thị <b>${d.items.length}</b> / <b>${d.total}</b> cơ sở</span>
    <div><button class="sm sec" id="prev" ${fq.page <= 1 ? 'disabled' : ''}>‹ Trang trước</button> <span style="margin:0 8px">Trang <b>${d.page}</b> / ${pages}</span> <button class="sm sec" id="next" ${fq.page >= pages ? 'disabled' : ''}>Trang sau ›</button></div>
  </div>`;

  const apply = () => {
    fq = {
      ...fq,
      q: $('#q').value,
      phuong: $('#ph').value,
      canBo: $('#cb') ? $('#cb').value : '',
      linhVuc: $('#lv').value,
      loaiHinh: $('#lh').value,
      trangThai: $('#tt').value,
      page: 1,
    };
    facilities();
  };
  $('#facFilterForm').onsubmit = (e) => { e.preventDefault(); apply(); };
  $('#ph').onchange = apply;
  if ($('#cb')) $('#cb').onchange = apply;
  $('#lv').onchange = () => { fq.linhVuc = $('#lv').value; fq.loaiHinh = ''; fq.page = 1; facilities(); };
  $('#lh').onchange = apply;
  $('#tt').onchange = apply;
  $('#prev').onclick = () => { fq.page--; facilities(); };
  $('#next').onclick = () => { fq.page++; facilities(); };
  if ($('#add')) $('#add').onclick = () => editFacility();
  app.querySelectorAll('[data-view]').forEach((b) => (b.onclick = () => viewFacility(d.items.find((x) => x._id === b.dataset.view))));
  app.querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => editFacility(d.items.find((x) => x._id === b.dataset.edit))));
  app.querySelectorAll('[data-del]').forEach((b) => (b.onclick = safe(async () => { if (confirm('Xóa cơ sở này?')) { await api('/facilities/' + b.dataset.del, 'DELETE'); facilities(); } })));
}

function viewFacility(f) {
  if (!f) return;
  const lvId = parentLvId(f.linhVuc);
  const lvName = LINH_VUC_MAP[lvId] || f.tenLinhVuc || '—';
  const rows = [
    ['Tên cơ sở', f.ten, true],
    ['Số hồ sơ', f.soHoSo],
    ['Số tài khoản', f.soTaiKhoan],
    ['Trạng thái hoạt động', f.trangThai === 'giam' ? `Đã giảm (${f.thangGiam || ''} - ${f.lyDoGiam || ''})` : 'Đang hoạt động'],
    ['Cán bộ phụ trách', `${f.canBoHoTen || f.canBoUsername || '—'} ${f.canBoUsername ? `(${f.canBoUsername})` : ''}`],
    ['Thuộc lĩnh vực PCCC', lvId ? `Lĩnh vực ${lvId} — ${lvName}` : '—', true],
    ['Loại hình cơ sở', f.loaiHinh, true],
    ['Số nhà, tên đường', f.soNha],
    ['Khu phố / KCN', f.khuPho],
    ['Phường / Xã', f.phuong],
    ['Tháng/năm hoạt động', f.thangNamHoatDong],
    ['Số tầng nổi / tầng hầm', `${f.soTang ?? '—'} tầng nổi / ${f.soTangHam ?? 0} tầng hầm`],
    ['Diện tích mặt bằng (m²)', f.dienTichMatBang],
    ['Tổng diện tích sàn (m²)', f.dienTichSan],
    ['Khối tích (m³)', f.khoiTich],
    ['Phân loại theo Nghị định', f.phanLoai],
    ['Thẩm duyệt / Nghiệm thu', f.thamDuyet],
    ['Thông tin đặc thù', f.thongTinDacThu, true],
    ['Tình trạng vi phạm', f.tinhTrangViPham, true],
    ['Người đại diện / Phụ trách CS', f.nguoiDaiDien],
    ['Số điện thoại', f.dienThoai],
    ['Đơn vị quản lý', f.donViQuanLy],
    ['Lần kiểm tra cuối', f.lanKiemTraCuoi ? `${f.lanKiemTraCuoi} (${f.ketQuaKiemTraCuoi || ''})` : '—'],
    ['Ghi chú', f.ghiChu, true],
  ];
  modal(`<h3>📋 Hồ sơ chi tiết cơ sở PCCC</h3>
    <div class="detail-grid">
      ${rows.map(([lbl, val, full]) => `<div class="detail-item ${full ? 'full' : ''}"><span>${esc(lbl)}</span><b>${esc(val !== undefined && val !== '' && val !== null ? val : '—')}</b></div>`).join('')}
    </div>
    <p style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap">
      ${hasPerm('manageFacilities') ? `<button id="v_edit">✏️ Sửa thông tin</button>` : ''}
      ${hasPerm('manageInspections') ? `<a class="btn amber" href="#/new-inspection/${f._id}" onclick="closeModal()">📝 Lập biên bản kiểm tra</a>` : ''}
      <button class="sec" onclick="closeModal()">Đóng</button>
    </p>`);
  if ($('#v_edit')) $('#v_edit').onclick = () => editFacility(f);
}

function editFacility(f) {
  modal(`<h3>${f ? '✏️ Cập nhật thông tin cơ sở' : '➕ Thêm cơ sở PCCC mới'}</h3>${facilityForm(f || {})}<p style="margin-top:16px"><button id="save">💾 Lưu thông tin</button> <button class="sec" onclick="closeModal()">Hủy</button></p>`);
  bindFacilityFormEvents('f');
  $('#save').onclick = safe(async () => {
    await api(f ? '/facilities/' + f._id : '/facilities', f ? 'PUT' : 'POST', readForm('f'));
    closeModal(); facilities();
  });
}

/* ---------- Địa bàn 4 Phường ---------- */
async function wards() {
  const list = await api('/wards');
  const totalActive = list.reduce((s, w) => s + (w.soCoSo || 0), 0);
  const colors = ['', 'gold', 'green', 'slate'];

  app.innerHTML = `<div class="page-head">
    <div>
      <h2>📍 Quản lý Địa bàn Phường (4 Phường)</h2>
      <p class="sub-note">Chuẩn hóa địa bàn 4 phường: Phường Tân Thuận, Phường Phú Thuận, Phường Tân Mỹ, Phường Tân Hưng</p>
    </div>
  </div>
  <div class="cards">
    ${list.map((w, i) => `<div class="card ${colors[i % colors.length]}">
      <b>${w.soCoSo || 0}</b>
      <div style="font-weight:700;font-size:15px;color:var(--slate-900);margin-bottom:4px">📍 ${esc(w.ten)}</div>
      <small style="color:#64748b;display:block;margin-bottom:10px">${w.soGiam ? `Đã giảm: ${w.soGiam} cơ sở` : 'Đang hoạt động ổn định'}</small>
      <button class="sm info" data-go-ward="${esc(w.ten)}">Xem danh sách cơ sở →</button>
    </div>`).join('')}
  </div>
  <div class="table-wrap"><table>
    <thead><tr>
      <th style="width:60px">STT</th>
      <th>Tên Phường</th>
      <th>Số cơ sở đang hoạt động</th>
      <th>Số cơ sở đã giảm</th>
      <th>Tỷ lệ phân bố</th>
      <th>Phân bố theo Lĩnh vực PCCC</th>
      <th>Thao tác</th>
    </tr></thead>
    <tbody>
      ${list.map((w, idx) => {
        const pct = totalActive ? ((w.soCoSo / totalActive) * 100).toFixed(1) : '0.0';
        const fieldBadges = (w.byField || []).map((f) => `<span class="tag gold" title="${esc(LINH_VUC_MAP[f.linhVuc] || '')}">Lĩnh vực ${esc(f.linhVuc)}: <b>${f.count}</b></span>`).join(' ');
        return `<tr>
          <td style="font-weight:700;color:#64748b">${idx + 1}</td>
          <td><b style="font-size:15px;color:var(--red-800)">📍 ${esc(w.ten)}</b><br><small style="color:#64748b">${esc(w.moTa || '')}</small></td>
          <td><span class="tag ${w.soCoSo ? 'green' : ''}">${w.soCoSo || 0} cơ sở</span></td>
          <td><span class="tag ${w.soGiam ? 'red' : ''}">${w.soGiam || 0}</span></td>
          <td><b>${pct}%</b></td>
          <td><div class="perm-pills">${fieldBadges || '<span style="color:#94a3b8">Chưa có cơ sở</span>'}</div></td>
          <td style="white-space:nowrap">
            <button class="sm info" data-go-ward="${esc(w.ten)}">🔍 Lọc cơ sở</button>
            ${hasPerm('manageFacilities') ? `<button class="sm ok" data-add-ward="${esc(w.ten)}">+ Thêm CS tại đây</button>` : ''}
          </td>
        </tr>`;
      }).join('')}
    </tbody>
  </table></div>`;

  app.querySelectorAll('[data-go-ward]').forEach((b) => {
    b.onclick = () => {
      fq = { ...fq, phuong: b.dataset.goWard, page: 1 };
      location.hash = '#/facilities';
    };
  });
  app.querySelectorAll('[data-add-ward]').forEach((b) => {
    b.onclick = () => {
      modal(`<h3>➕ Thêm cơ sở PCCC tại ${esc(b.dataset.addWard)}</h3>${facilityForm({ phuong: b.dataset.addWard }, 'f')}<p style="margin-top:16px"><button id="save">💾 Lưu thông tin</button> <button class="sec" onclick="closeModal()">Hủy</button></p>`);
      bindFacilityFormEvents('f');
      $('#save').onclick = safe(async () => {
        await api('/facilities', 'POST', readForm('f'));
        closeModal(); wards();
      });
    };
  });
}

/* ---------- Loại hình cơ sở (gom theo 10 lĩnh vực) ---------- */
let tFilter = { q: '', lv: '' };
async function types() {
  const canEditTypes = hasPerm('manageTypes');
  const qLow = tFilter.q.trim().toLowerCase();

  const groupsHtml = LV_IDS.filter((id) => !tFilter.lv || tFilter.lv === id).map((id) => {
    const items = TYPES.filter((t) => {
      if (parentLvId(t.linhVuc) !== id) return false;
      if (!qLow) return true;
      return (t.ten || '').toLowerCase().includes(qLow);
    });
    if (!items.length && qLow) return '';
    const totalFacs = items.reduce((s, t) => s + (t.soCoSo || 0), 0);
    return `<div class="lv-group" data-group="${id}">
      <div class="lv-group-head">
        <div class="lv-group-title">
          <span class="lv-id-circle">Lĩnh vực ${id}</span>
          <div>
            <div>${esc(LINH_VUC_MAP[id])}</div>
            <small style="color:#64748b;font-weight:500">Gồm ${items.length} loại hình cơ sở riêng</small>
          </div>
        </div>
        <div class="lv-group-meta">
          <span class="tag gold">${items.length} loại hình</span>
          <span class="tag ${totalFacs ? 'green' : ''}">${totalFacs} cơ sở</span>
        </div>
      </div>
      <div class="lv-group-body">
        <table>
          <thead><tr>
            <th style="width:60px">STT</th>
            <th>Tên loại hình cơ sở riêng</th>
            <th style="width:150px">Thuộc lĩnh vực</th>
            <th style="width:110px">Số cơ sở</th>
            <th style="width:130px">Chu kỳ KT</th>
            ${canEditTypes ? '<th style="width:120px">Thao tác</th>' : ''}
          </tr></thead>
          <tbody>
            ${items.map((t, idx) => `<tr>
              <td style="color:#64748b;font-weight:600">${idx + 1}</td>
              <td><b>${esc(t.ten)}</b>${t.moTa ? `<br><small style="color:#64748b">${esc(t.moTa)}</small>` : ''}</td>
              <td><span class="lv-badge">Lĩnh vực ${id}</span></td>
              <td>${t.soCoSo ? `<span class="tag green">${t.soCoSo} cơ sở</span>` : '<span style="color:#94a3b8">0</span>'}</td>
              <td>${t.chuKyKiemTraThang ? `${esc(t.chuKyKiemTraThang)} tháng` : '—'}</td>
              ${canEditTypes ? `<td style="white-space:nowrap"><button class="sm" data-e="${t._id}">Sửa</button> <button class="sm sec" data-d="${t._id}">Xóa</button></td>` : ''}
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
  }).join('');

  app.innerHTML = `<div class="page-head">
    <div>
      <h2>🗂️ Danh mục Loại hình cơ sở PCCC (${TYPES.length} loại hình / 10 lĩnh vực)</h2>
      <p class="sub-note">Chuẩn hóa và gom nhóm theo 10 lĩnh vực PCCC</p>
    </div>
    ${canEditTypes ? '<button class="ok" id="add">+ Thêm loại hình</button>' : ''}
  </div>
  <form class="bar" id="typeFilterForm" autocomplete="off">
    <input id="tq" name="tq" type="text" autocomplete="off" placeholder="🔍 Tìm theo tên loại hình cơ sở..." value="${esc(tFilter.q)}" style="flex:1;min-width:240px">
    <select id="tlv">
      <option value="">Tất cả 10 nhóm lĩnh vực</option>
      ${LV_IDS.map((id) => `<option value="${id}" ${tFilter.lv === id ? 'selected' : ''}>Lĩnh vực ${id}: ${esc(LINH_VUC_MAP[id])}</option>`).join('')}
    </select>
    <button type="submit" id="tgo">Lọc</button>
    <button type="button" class="sec" id="toggleAll">Thu gọn / Mở rộng tất cả</button>
  </form>
  <div id="lvGroups">${groupsHtml || '<div class="card">Không tìm thấy loại hình phù hợp.</div>'}</div>`;

  const applyFilter = () => { tFilter = { q: $('#tq').value, lv: $('#tlv').value }; types(); };
  $('#typeFilterForm').onsubmit = (e) => { e.preventDefault(); applyFilter(); };
  $('#tlv').onchange = applyFilter;
  $('#toggleAll').onclick = () => {
    const groups = [...app.querySelectorAll('.lv-group')];
    const anyOpen = groups.some((g) => !g.classList.contains('collapsed'));
    groups.forEach((g) => g.classList.toggle('collapsed', anyOpen));
  };
  app.querySelectorAll('.lv-group-head').forEach((h) => {
    h.onclick = () => h.parentElement.classList.toggle('collapsed');
  });

  const form = (t) => {
    const curLv = parentLvId(t?.linhVuc) || '1';
    modal(`<h3>${t ? 'Sửa loại hình cơ sở' : 'Thêm loại hình cơ sở mới'}</h3>
    <div class="grid">
      <div><label>Thuộc lĩnh vực (1–10) *</label>
        <select id="t_lv">${LV_IDS.map((id) => `<option value="${id}" ${id === curLv ? 'selected' : ''}>Lĩnh vực ${id}: ${esc(LINH_VUC_MAP[id])}</option>`).join('')}</select>
      </div>
      <div><label>Chu kỳ kiểm tra (tháng)</label><input id="t_ck" type="number" value="${esc(t?.chuKyKiemTraThang ?? '')}"></div>
      <div class="full"><label>Tên loại hình cơ sở *</label><input id="t_ten" type="text" autocomplete="off" value="${esc(t?.ten || '')}"></div>
      <div class="full"><label>Ghi chú / Mô tả</label><textarea id="t_mt">${esc(t?.moTa || '')}</textarea></div>
    </div>
    <p><button id="save">Lưu</button> <button class="sec" onclick="closeModal()">Hủy</button></p>`);
    $('#save').onclick = safe(async () => {
      const b = { ten: $('#t_ten').value.trim(), linhVuc: $('#t_lv').value, chuKyKiemTraThang: $('#t_ck').value, moTa: $('#t_mt').value };
      await api(t ? '/types/' + t._id : '/types', t ? 'PUT' : 'POST', b); closeModal(); route();
    });
  };
  if ($('#add')) $('#add').onclick = () => form();
  app.querySelectorAll('[data-e]').forEach((b) => (b.onclick = () => form(TYPES.find((t) => t._id === b.dataset.e))));
  app.querySelectorAll('[data-d]').forEach((b) => (b.onclick = safe(async () => { if (confirm('Xóa loại hình này?')) { await api('/types/' + b.dataset.d, 'DELETE'); route(); } })));
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
  const canInspect = hasPerm('manageInspections');
  const [list, facs] = await Promise.all([api('/inspections'), api('/facilities?limit=500&trangThai=all')]);
  const name = Object.fromEntries(facs.items.map((f) => [f._id, f.ten]));
  app.innerHTML = `<div class="page-head"><div><h2>📋 Biên bản kiểm tra an toàn PCCC</h2><p class="sub-note">Chọn cơ sở bên trang <a href="#/facilities">Danh sách cơ sở</a> → bấm nút <b>Kiểm tra</b> để lập biên bản mới</p></div></div>
  <div class="table-wrap"><table><thead><tr><th>Số biên bản</th><th>Ngày kiểm tra</th><th>Tên cơ sở</th><th>Cán bộ phụ trách</th><th>Kết luận</th><th>Thao tác</th></tr></thead><tbody>
  ${list.map((i) => `<tr>
    <td><b>${esc(i.soBienBan)}</b></td>
    <td>${esc(i.ngayKiemTra)}</td>
    <td>${esc(name[i.facilityId] || '(đã xóa)')}</td>
    <td><span class="tag blue">👤 ${esc(i.canBoHoTen || i.canBoUsername || '—')}</span></td>
    <td><span class="tag ${i.ketLuan === 'Đạt' ? 'green' : 'red'}">${esc(i.ketLuan)}</span></td>
    <td>
      <a class="btn sm" href="#/inspection/${i._id}">🖨 Xem / In</a>
      ${canInspect ? `<button class="sm sec" data-d="${i._id}">Xóa</button>` : ''}
    </td>
  </tr>`).join('')}</tbody></table></div>`;
  app.querySelectorAll('[data-d]').forEach((b) => (b.onclick = safe(async () => { if (confirm('Xóa biên bản?')) { await api('/inspections/' + b.dataset.d, 'DELETE'); inspections(); } })));
}
async function inspectionForm(fid) {
  const f = await api('/facilities/' + fid);
  app.innerHTML = `<div class="page-head"><div><h2>📝 Lập biên bản kiểm tra PCCC</h2></div></div>
  <div class="card"><b style="font-size:18px">${esc(f.ten)}</b>${esc([f.soNha, f.khuPho, f.phuong].filter(Boolean).join(', '))} — Lĩnh vực ${esc(f.linhVuc)}: ${esc(f.loaiHinh)}</div><br>
  <div class="grid"><div><label>Ngày kiểm tra</label><input type="date" id="i_ngay" value="${new Date().toISOString().slice(0, 10)}"></div>
  <div><label>Loại kiểm tra</label><select id="i_loai"><option>Định kỳ</option><option>Đột xuất</option><option>Theo dõi khắc phục</option></select></div>
  <div><label>Đoàn kiểm tra</label><input id="i_doan" type="text" autocomplete="off" value="${esc(ME?.hoTen || '')}"></div><div><label>Người đại diện cơ sở</label><input id="i_dd" type="text" autocomplete="off" value="${esc(f.nguoiDaiDien)}"></div></div>
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
  <p><b>Cơ sở:</b> ${esc(f.ten)}<br><b>Địa chỉ:</b> ${esc([f.soNha, f.khuPho, f.phuong].filter(Boolean).join(', '))}<br><b>Thuộc lĩnh vực:</b> Lĩnh vực ${esc(f.linhVuc)} (${esc(LINH_VUC_MAP[parentLvId(f.linhVuc)] || '')}) — <b>Loại hình:</b> ${esc(f.loaiHinh)}<br><b>Số hồ sơ:</b> ${esc(f.soHoSo)} — <b>Quy mô:</b> ${f.soTang ?? '...'} tầng, ${f.dienTichSan ?? '...'} m² sàn<br><b>Người đại diện:</b> ${esc(i.nguoiDaiDien)}</p>
  <table><tr><th>TT</th><th>Nội dung</th><th>Kết quả</th></tr>${(i.checklist || []).map((c, n) => `<tr><td>${n + 1}</td><td>${esc(c.noiDung)}</td><td>${esc(c.ketQua)}</td></tr>`).join('')}</table>
  <p><b>Vi phạm, tồn tại:</b><br>${esc(i.viPham || 'Không').replace(/\n/g, '<br>')}</p>
  <p><b>Kiến nghị:</b><br>${esc(i.kienNghi || 'Không').replace(/\n/g, '<br>')}<br>Hạn khắc phục: ${vnDate(i.hanKhacPhuc)}</p>
  <p><b>Kết luận:</b> ${esc(i.ketLuan)}</p>
  <table style="border:0"><tr style="text-align:center"><td style="border:0"><b>ĐẠI DIỆN CƠ SỞ</b><br><br><br><br></td><td style="border:0"><b>ĐOÀN KIỂM TRA</b><br><br><br><br></td></tr></table></div>`;
}

/* ---------- Tăng / giảm ---------- */
let chThang = new Date().toISOString().slice(0, 7);
const vnMonthLabel = (ym) => {
  const [y, m] = String(ym || '').split('-');
  return m && y ? `tháng ${m}/${y}` : ym;
};
function renderMonthYearSelect(prefix, ym) {
  const [curY, curM] = String(ym || new Date().toISOString().slice(0, 7)).split('-');
  const months = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
  const baseYear = new Date().getFullYear();
  const years = Array.from({ length: 15 }, (_, i) => String(baseYear - 7 + i));
  return `<div style="display:inline-flex;gap:6px;align-items:center">
    <select id="${prefix}_m" style="min-width:125px">
      ${months.map((m) => `<option value="${m}" ${m === curM ? 'selected' : ''}>📅 Tháng ${Number(m)}</option>`).join('')}
    </select>
    <select id="${prefix}_y" style="min-width:115px">
      ${years.map((y) => `<option value="${y}" ${y === curY ? 'selected' : ''}>Năm ${y}</option>`).join('')}
    </select>
  </div>`;
}
const readMonthYear = (prefix) => `${$(`#${prefix}_y`).value}-${$(`#${prefix}_m`).value}`;

async function changes() {
  const canChange = hasPerm('manageChanges');
  const list = await api('/changes?thang=' + chThang);
  const row = (c) => `<tr>
    <td><b>${esc(c.snapshot?.ten)}</b></td>
    <td>${esc([c.snapshot?.soNha, c.snapshot?.khuPho, c.snapshot?.phuong].filter(Boolean).join(', '))}</td>
    <td>${renderLvBadge(c.snapshot?.linhVuc)}</td>
    <td>${esc(c.snapshot?.loaiHinh)}</td>
    <td><span class="tag blue">👤 ${esc(c.canBoHoTen || c.canBoUsername || '—')}</span></td>
    <td>${esc(c.lyDo)}</td>
    <td class="noprint" style="white-space:nowrap">
      ${canChange ? `<button class="sm" data-ech="${c._id}">Sửa</button> <button class="sm sec" data-d="${c._id}">Xóa / Hoàn tác</button>` : ''}
    </td>
  </tr>`;
  const sect = (loai, title) => {
    const l = list.filter((c) => c.loai === loai);
    return `<h3>${title} (${l.length})</h3><div class="table-wrap"><table><thead><tr><th>Tên cơ sở</th><th>Địa chỉ</th><th>Thuộc lĩnh vực</th><th>Loại hình</th><th>Cán bộ phụ trách</th><th>Ghi chú / lý do</th><th class="noprint">Thao tác</th></tr></thead><tbody>${l.map(row).join('')}</tbody></table></div>`;
  };
  app.innerHTML = `<div class="page-head"><div><h2>📈 Danh sách tăng, giảm cơ sở ${vnMonthLabel(chThang)}</h2><p class="sub-note">Theo dõi biến động cơ sở PCCC hàng tháng</p></div></div>
  <div class="bar noprint">
    ${renderMonthYearSelect('th', chThang)}
    ${canChange ? '<button id="tang" class="ok">+ Tăng cơ sở</button><button id="giam">− Giảm cơ sở</button>' : ''}
    <button class="sec" onclick="print()">🖨 In danh sách</button>
  </div>
  ${sect('tang', 'DANH SÁCH TĂNG CƠ SỞ')}${sect('giam', 'DANH SÁCH GIẢM CƠ SỞ')}`;

  const onMonthChange = () => { chThang = readMonthYear('th'); changes(); };
  $('#th_m').onchange = onMonthChange;
  $('#th_y').onchange = onMonthChange;
  app.querySelectorAll('[data-ech]').forEach((b) => {
    b.onclick = () => {
      const c = list.find((x) => x._id === b.dataset.ech);
      if (!c) return;
      modal(`<h3>✏️ Sửa phiếu ${c.loai === 'tang' ? 'Tăng' : 'Giảm'} cơ sở</h3>
        <div class="grid">
          <div class="full"><label>Tên cơ sở</label><input id="ec_ten" type="text" autocomplete="off" value="${esc(c.snapshot?.ten || '')}"></div>
          <div><label>Tháng biến động</label>${renderMonthYearSelect('ec_thang', c.thang)}</div>
          <div><label>Ghi chú / Lý do</label><input id="ec_lydo" type="text" autocomplete="off" value="${esc(c.lyDo || '')}"></div>
        </div>
        <p style="margin-top:16px"><button id="save">💾 Lưu thay đổi</button> <button class="sec" onclick="closeModal()">Hủy</button></p>`);
      $('#save').onclick = safe(async () => {
        await api('/changes/' + c._id, 'PUT', {
          ten: $('#ec_ten').value.trim(),
          thang: readMonthYear('ec_thang'),
          lyDo: $('#ec_lydo').value.trim(),
        });
        closeModal(); changes();
      });
    };
  });
  app.querySelectorAll('[data-d]').forEach((b) => (b.onclick = safe(async () => { if (confirm('Xóa phiếu và hoàn tác trạng thái cơ sở?')) { await api('/changes/' + b.dataset.d, 'DELETE'); changes(); } })));
  if ($('#tang')) $('#tang').onclick = () => {
    modal(`<h3>➕ Tăng cơ sở — ${vnMonthLabel(chThang)}</h3>${facilityForm({}, 'n')}<p><button id="save">Lưu</button> <button class="sec" onclick="closeModal()">Hủy</button></p>`);
    bindFacilityFormEvents('n');
    $('#save').onclick = safe(async () => { await api('/changes', 'POST', { loai: 'tang', thang: chThang, lyDo: $('#n_ghiChu').value, facility: readForm('n') }); closeModal(); changes(); });
  };
  if ($('#giam')) $('#giam').onclick = () => {
    modal(`<h3>➖ Giảm cơ sở — ${vnMonthLabel(chThang)}</h3>
    <form class="bar" id="giamSearchForm" autocomplete="off">
      <input id="gq" name="gq" type="text" autocomplete="off" placeholder="🔍 Tìm tên cơ sở cần giảm..." style="flex:1">
      <button type="submit" id="gs">Tìm</button>
    </form>
    <div id="gres"></div>
    <div style="margin-top:10px"><label>Lý do giảm</label><input id="gly" type="text" autocomplete="off" placeholder="Ngưng hoạt động, chuyển địa điểm, ..."></div>
    <p style="margin-top:14px"><button class="sec" onclick="closeModal()">Đóng</button></p>`);
    $('#giamSearchForm').onsubmit = safe(async (e) => {
      e.preventDefault();
      const d = await api('/facilities?limit=15&q=' + encodeURIComponent($('#gq').value));
      $('#gres').innerHTML = `<div class="table-wrap"><table>${d.items.map((f) => `<tr><td><b>${esc(f.ten)}</b><br><small>${esc([f.soNha, f.phuong].filter(Boolean).join(', '))}</small></td><td>${renderLvBadge(f.linhVuc)}</td><td><button type="button" class="sm" data-g="${f._id}">Chọn giảm</button></td></tr>`).join('')}</table></div>`;
      $('#gres').querySelectorAll('[data-g]').forEach((b) => (b.onclick = safe(async () => {
        await api('/changes', 'POST', { loai: 'giam', thang: chThang, lyDo: $('#gly').value, facilityId: b.dataset.g }); closeModal(); changes();
      })));
    });
  };
}
