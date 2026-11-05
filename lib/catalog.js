const catalogData = require('./catalog.json');

const GROUPS = catalogData.danh_muc_loai_hinh_co_so_pccc;

// Map parent id ("1".."10") -> ten nhom linh vuc
const LINH_VUC_MAP = Object.fromEntries(
  GROUPS.map((g) => [String(g.id), g.nhom_linh_vuc])
);

// Flat list of all 138 standardized facility types
const ALL_TYPES = GROUPS.flatMap((g) =>
  g.cac_loai_hinh_co_so_rieng.map((item, idx) => ({
    maLoaiHinh: String(item.id),
    ten: item.ten,
    linhVuc: String(g.id), // ID của phần cha (1..10)
    tenLinhVuc: g.nhom_linh_vuc,
    thuTu: g.id * 100 + (idx + 1),
  }))
);

const BY_MA = Object.fromEntries(ALL_TYPES.map((t) => [t.maLoaiHinh, t]));
const BY_TEN = Object.fromEntries(ALL_TYPES.map((t) => [t.ten.toLowerCase(), t]));

/**
 * Chuẩn hóa loại hình & lĩnh vực của một cơ sở về đúng danh mục chuẩn.
 * Luôn trả về { maLoaiHinh, loaiHinh, linhVuc (ID cha 1..10), tenLinhVuc }
 */
function normalizeFacilityType(f = {}) {
  const rawTen = String(f.loaiHinh || '').trim();
  const rawNhom = String(f.nhomLoaiHinh || '').trim();
  const rawDacThu = String(f.thongTinDacThu || '').trim();
  const rawTenCoSo = String(f.ten || '').trim();
  const combined = `${rawTen} | ${rawNhom} | ${rawDacThu} | ${rawTenCoSo}`.toLowerCase();

  // 1. Nếu đã khớp chính xác tên chuẩn hoặc mã loại hình chuẩn
  if (f.maLoaiHinh && BY_MA[f.maLoaiHinh]) {
    const t = BY_MA[f.maLoaiHinh];
    return { maLoaiHinh: t.maLoaiHinh, loaiHinh: t.ten, linhVuc: t.linhVuc, tenLinhVuc: t.tenLinhVuc };
  }
  if (BY_TEN[rawTen.toLowerCase()]) {
    const t = BY_TEN[rawTen.toLowerCase()];
    return { maLoaiHinh: t.maLoaiHinh, loaiHinh: t.ten, linhVuc: t.linhVuc, tenLinhVuc: t.tenLinhVuc };
  }

  // 2. Quy tắc ánh xạ từ dữ liệu Excel cũ / 10 lĩnh vực sang danh mục chuẩn
  let code = null;
  if (/nhà chung cư/i.test(combined)) code = '1.1';
  else if (/nhà tập thể/i.test(combined)) code = '1.2';
  else if (/nhà ở kết hợp sản xuất, kinh doanh/i.test(combined)) code = '1.4';
  else if (/trụ sở.*cấp trung ương/i.test(combined)) code = '1.5';
  else if (/trụ sở.*cấp tỉnh/i.test(combined)) code = '1.6';
  else if (/trụ sở.*cấp xã/i.test(combined)) code = '1.7';
  else if (/trụ sở, nhà làm việc của doanh nghiệp|văn phòng/i.test(combined)) code = '1.8';
  else if (/nhà đa năng|nhà hỗn hợp/i.test(combined)) code = '1.9';
  else if (/bưu điện/i.test(combined)) code = '1.10';
  else if (/bưu cục/i.test(combined)) code = '1.11';
  else if (/bưu chính, viễn thông/i.test(combined)) code = '1.12';
  else if (/phòng khám/i.test(combined)) code = '2.3';
  else if (/bệnh viện công/i.test(combined)) code = '2.1';
  else if (/bệnh viện tư/i.test(combined)) code = '2.2';
  else if (/trạm y tế/i.test(combined)) code = '2.4';
  else if (/nhà trẻ/i.test(combined) && !/mẫu giáo|mầm non/i.test(combined)) code = '3.1';
  else if (/mẫu giáo, mầm non công lập/i.test(combined)) code = '3.2';
  else if (/mẫu giáo, mầm non.*(dân lập|tư thục)|mầm non/i.test(combined)) code = '3.3';
  else if (/tiểu học công lập/i.test(combined)) code = '3.4';
  else if (/tiểu học.*(dân lập|tư thục)/i.test(combined)) code = '3.5';
  else if (/trung học cơ sở công lập/i.test(combined)) code = '3.6';
  else if (/trung học cơ sở.*(dân lập|tư thục)/i.test(combined)) code = '3.7';
  else if (/trung học phổ thông công lập/i.test(combined)) code = '3.8';
  else if (/trung học phổ thông.*(dân lập|tư thục)/i.test(combined)) code = '3.9';
  else if (/nhiều cấp học/i.test(combined)) code = '3.10';
  else if (/học viện/i.test(combined)) code = '3.11';
  else if (/đại học/i.test(combined)) code = '3.12';
  else if (/cao đẳng/i.test(combined)) code = '3.13';
  else if (/cơ sở giáo dục khác|anh văn|anh ngữ|giáo dục thường xuyên/i.test(combined)) code = '3.16';
  else if (/karaoke/i.test(combined)) code = '4.13';
  else if (/vũ trường/i.test(combined)) code = '4.14';
  else if (/vui chơi, giải trí/i.test(combined)) code = '4.15';
  else if (/tín ngưỡng/i.test(rawTen) || (!/tôn giáo/i.test(rawTen) && /tín ngưỡng/i.test(combined))) code = '4.17';
  else if (/tôn giáo/i.test(combined)) code = '4.16';
  else if (/di tích/i.test(combined)) code = '4.18';
  else if (/^khách sạn$/i.test(rawTen) || /khách sạn, nhà khách.*> khách sạn/i.test(rawNhom)) code = '4.19';
  else if (/nhà khách/i.test(rawTen)) code = '4.20';
  else if (/nhà nghỉ/i.test(rawTen)) code = '4.21';
  else if (/cơ sở nghỉ dưỡng|nhà trọ|lưu trú khác/i.test(combined)) code = '4.22';
  else if (/chợ hạng 1/i.test(combined)) code = '5.1';
  else if (/chợ hạng 2/i.test(combined)) code = '5.2';
  else if (/chợ hạng 3/i.test(combined)) code = '5.3';
  else if (/trung tâm thương mại/i.test(combined)) code = '5.4';
  else if (/siêu thị/i.test(combined) && !/điện máy/i.test(combined)) code = '5.5';
  else if (/điện máy|cửa hàng, cơ sở kinh doanh hàng hóa dễ cháy/i.test(combined)) code = '5.9';
  else if (/ăn uống|nhà hàng|ẩm thực|buffet/i.test(combined)) code = '5.6';
  else if (/massage|spa|thẩm mỹ|tắm hơi/i.test(combined)) code = '5.7';
  else if (/giặt là/i.test(combined)) code = '5.8';
  else if (/nhà để xe|gara/i.test(combined)) code = '6.1';
  else if (/trạm biến áp 110/i.test(combined)) code = '7.7';
  else if (/trạm biến áp 220/i.test(combined)) code = '7.8';
  else if (/trạm biến áp 500/i.test(combined)) code = '7.9';
  else if (/kinh doanh khí đốt|gas/i.test(combined)) code = '8.14';
  else if (/cửa hàng xăng dầu trên mặt đất/i.test(combined)) code = '8.12';
  else if (/cửa hàng xăng dầu trên mặt nước/i.test(combined)) code = '8.13';
  else if (/công nghiệp nhẹ/i.test(combined)) code = '10.4';
  else if (/kho chứa hàng hóa/i.test(combined)) code = '10.6';
  else if (/vật liệu, sản phẩm xây dựng/i.test(combined)) code = '10.1';

  // Fallback theo lĩnh vực gốc nếu chưa khớp
  if (!code) {
    const lv = String(f.linhVuc || '1').replace(/\D/g, '') || '1';
    const firstInGroup = ALL_TYPES.find((t) => t.linhVuc === lv) || ALL_TYPES[0];
    code = firstInGroup.maLoaiHinh;
  }

  const t = BY_MA[code];
  return {
    maLoaiHinh: t.maLoaiHinh,
    loaiHinh: t.ten,
    linhVuc: t.linhVuc, // ID cha ("1".."10")
    tenLinhVuc: t.tenLinhVuc,
  };
}

module.exports = {
  GROUPS,
  LINH_VUC_MAP,
  ALL_TYPES,
  BY_MA,
  BY_TEN,
  normalizeFacilityType,
};
