# Quản lý cơ sở PCCC

Node.js (Express) + MongoDB, deploy lên Vercel.

## Chức năng
- **Cơ sở**: thêm/sửa/xóa, tìm kiếm, lọc theo loại hình, phân trang
- **Loại hình**: danh mục loại hình, lĩnh vực, chu kỳ kiểm tra
- **Kiểm tra**: lập biên bản kiểm tra (checklist, vi phạm, kiến nghị, kết luận) + in
- **Tăng / giảm**: lập danh sách tăng, giảm theo tháng (tự cập nhật trạng thái cơ sở, hủy phiếu = hoàn tác), in
- **Import Excel**: nạp các file mẫu `.xlsx` trong thư mục dự án

## Chạy local
```
npm install
copy .env.example .env     # điền MONGODB_URI
npm run import             # (tùy chọn) nạp dữ liệu từ Excel
npm run dev                # http://localhost:3000
```
Lấy `MONGODB_URI` bằng `vercel env pull .env.local` nếu đã connect Mongo trong Vercel (đổi tên thành `.env`).

## Deploy Vercel
```
vercel --prod
```
Biến môi trường: `MONGODB_URI` (do integration Mongo tạo), tùy chọn `MONGODB_DB`, `ADMIN_PASSWORD` (bảo vệ thao tác ghi).
File `*.xlsx` bị ignore khỏi git; import dữ liệu chạy local trỏ vào cùng DB.

## Đăng nhập & phân quyền
Lần đầu mở web sẽ hiện màn hình tạo quản trị viên đầu tiên. Sau đó vào menu **Quản trị** để:
- cấp tài khoản (Quản trị viên / Cán bộ / Chỉ xem), khóa/mở khóa, đặt lại mật khẩu, buộc đăng xuất, xóa
- xem nhật ký đăng nhập
- quản lý danh mục loại hình cơ sở

Sai mật khẩu 5 lần sẽ khóa tạm 15 phút. Biến môi trường `AUTH_SECRET` dùng để ký phiên đăng nhập (thay cho `ADMIN_PASSWORD` cũ).

## Import d? li?u Excel
```n# X�a d? li?u cu (co s?, lo?i h�nh, tang/gi?m; gi? t�i kho?n) r?i n?p d? li?u m?i t? thu m?c/ file:
npm run import -- --reset "D:\KV7-PC07\A Nghia\X�y d?ng app\anh H�o"
# Ch?y th?, kh�ng ghi DB:
npm run import -- --dry "<thu m?c ho?c file>"
```n- Bi?u m?u h? so (DS c?p nh?t h? so PC): t?o/c?p nh?t co s?.
- Bi?u m?u 10 linh v?c (sheet PL1..PL10): t?o danh m?c lo?i h�nh theo c�y ph�n c?p v� g?p ph�n lo?i (nh�m PL II, PL VII, th?m duy?t, t?ng h?m/n?i, di?n t�ch m?t b?ng...) v�o co s? tr�ng t�n.
