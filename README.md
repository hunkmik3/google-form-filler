# Điền Google Form bằng link điền sẵn

Dùng được cho mọi Google Form công khai. Không cần cài thêm thư viện.

## Giao diện web

```bash
cd ~/SGS_Workspace/google_form_filler
python3 server.py
```

Mở http://127.0.0.1:8765. Dán link form, sửa đáp án hoặc bấm Random lại, rồi bấm **Mở form đã điền**. Mỗi lần bấm sẽ mở một cửa sổ Chrome, Edge hoặc Brave mới, profile trống, không dùng cache hay tài khoản đang đăng nhập. Xem lại trên form và tự bấm Gửi. Tắt trang bằng Ctrl+C.

- **Mẫu đã test:** Khối và giới tính được bốc cùng nhau theo cơ cấu 700 học sinh (khối 9: 50 nữ / 56 nam, khối 10: 77 / 50, khối 11: 121 / 99, khối 12: 149 / 98). Sửa bảng nếu muốn đổi tỉ lệ. Học lực random 3 mức đầu. Thời gian tự học random 3 mức còn lại, không chọn trên 120 phút. Câu chọn nhiều random từng ô. Các lưới random trong 3 mức tích cực.
- Bấm một đáp án để khóa hàng đó. **Random lại** bỏ qua hàng đã khóa.
- **Sửa vùng random** chọn những ô được phép random.
- **3 mức đầu** random trong 3 đáp án đầu của mọi câu.

```bash
cd ~/SGS_Workspace/google_form_filler

# 1. Tạo file trả lời mẫu từ link form
python3 form_filler.py template "LINK_FORM" -o tra_loi.txt

# 2. Mở tra_loi.txt, ghi số thứ tự đáp án sau mỗi dấu "=", lưu lại

# 3. Tạo link điền sẵn và mở trình duyệt
python3 form_filler.py link tra_loi.txt --open
```

Form mở ra đã điền sẵn. Xem lại từng trang rồi **tự bấm Gửi**. Script không tự gửi.

## Cách ghi đáp án
| Loại câu | Ghi | Ví dụ |
|---|---|---|
| Chọn 1 | số thứ tự (hoặc gõ đúng chữ của đáp án) | `Q1 = 2` hoặc `Q2 = Nữ` |
| Chọn nhiều | các số cách nhau dấu phẩy | `Q7 = 1,4,5` |
| Mục "Khác" | `khac: nội dung` | `Q7 = 1,4, khac: Tự học lập trình` |
| Lưới | mỗi hàng `Qn.r` một số | `Q5.1 = 4` |
| Trả lời chữ | ghi thẳng nội dung | `Q9 = Không có ý kiến` |
| Ngày / giờ | `YYYY-MM-DD` / `HH:MM` | `Q10 = 2026-11-19` |

- Để trống là bỏ qua. Script sẽ nhắc nếu còn câu bắt buộc (có dấu `*`) chưa điền.
- Ghi sai (số ngoài khoảng, chọn 2 đáp án cho câu chọn 1...) thì script báo lỗi và chỉ rõ dòng nào.
- Form bắt đăng nhập: mở form trong Chrome, Cmd+S lưu thành `.html`, rồi chạy `template file.html`.
- Câu "Tải file lên" không điền sẵn được, phải tự làm trên form.
- Nếu người tạo form sửa câu hỏi, chạy lại bước 1 để tạo file mẫu mới.
