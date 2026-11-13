# VUA SINH TỒN 👑🏝️

Game đố vui sinh tồn cho TikTok LIVE: người xem bình luận để lên đảo, dùng avatar TikTok, trả lời câu hỏi trong 25 giây và tranh điểm. Màn hình đảo 9:16 xanh biển – vàng cát được dựng riêng, không kèm giao diện ứng dụng TikTok. Chạy trên máy dẫn live, đưa cửa sổ overlay vào TikTok LIVE Studio/OBS.

## Chạy nhanh

Cần **Node.js 20 trở lên**. Trong thư mục repo:

```sh
npm ci
npm start
```

- Điều khiển: **http://localhost:3000/**
- Màn hình đưa lên LIVE: **http://localhost:3000/overlay.html**

`npm start` hỏi link TikTok hoặc `@username`; có thể bấm Enter để thử game trước. Nếu cổng 3000 đang dùng cho dự án khác, đặt `PORT=3001` (PowerShell: `$env:PORT="3001"`) rồi chạy lại.

## Luật chơi hiện tại

Đã áp dụng bản thay đổi mới nhất:

1. Bình luận **VÔ** (`vo`, `vào` cũng được nhận) ở **bất kỳ câu nào** để lên đảo. Đảo tối đa **200 người**; đủ chỗ thì vào hàng chờ theo thứ tự.
2. Mỗi ván **100 câu**, mỗi câu **25 giây**. Đồng hồ và hạn chốt do server quyết định, không phụ thuộc đồng hồ đếm ngược của trình duyệt.
3. Chỉ tính **câu trả lời đầu tiên** của mỗi người trong mỗi câu. Đúng **+10 điểm**; không phân biệt dấu tiếng Việt, hoa/thường và khoảng cách. Câu toán trả lời bằng số. Hỗ trợ số âm/thập phân khi thêm câu hỏi.
4. **Không trả lời 3 câu liên tiếp**: bị mời khỏi đảo. Trả lời sai vẫn được tính là đã trả lời, nên không cộng lần vắng.
5. Sau khi tham gia đủ **6 câu trên đảo**, cần đúng ít nhất **3 trong 6 câu gần nhất** để ở lại. Đây là cửa sổ trượt: đánh giá lại sau mỗi câu. Trước khi đủ 6 câu chỉ áp dụng điều kiện vắng 3 câu liên tiếp.
6. Người bị loại không tự vào hàng chờ. Họ có thể bình luận **VÔ** để đăng ký lại; điểm trong ván được giữ, lịch sử 6 câu và lần vắng bắt đầu lại sau khi lên đảo. Gửi VÔ khi đang ở trên đảo không xóa lịch sử hay điểm phạt.
7. Khi có ghế trống, hàng chờ **tự lên theo thứ tự**; không cần đúng 3 câu liên tiếp để quay lại. **Không còn** giới hạn vào tới câu 5 hay cứu hộ tới câu 12. Người ở hàng chờ vẫn có thể trả lời lấy điểm, nhưng chưa bị chấm điều kiện trụ đảo.
8. Xếp hạng theo điểm, số câu đúng rồi tổng thời gian trả lời đúng (nhanh hơn ưu tiên). Bảng điểm cập nhật sau mỗi 10 câu. Hết câu 100 tự sang ván mới và giữ nguyên người đang trên đảo.

Người mới lên từ hàng chờ sau khi chốt câu bắt đầu tính lịch sử từ câu tiếp theo. Ván mới xóa danh sách và điểm của ván cũ. Lượt người chơi/hàng chờ được giữ trong bộ nhớ của phiên server, không phục hồi sau khi tắt server.

## Kết nối TikTok và EulerStream

Server dùng `tiktok-live-connector` 2.5.0 với sự kiện chat, đọc ID, tên và avatar TikTok. Chỉ đọc bình luận, **không gửi bình luận ra TikTok**. Sự kiện phải có ID người xem. Cả tình trạng kết nối và số chat nhận được được hiển thị ở bảng điều khiển; một kết nối xanh không tự chứng minh có chat đi vào.

Đặt API key **trên máy chạy server**, không gửi key trong chat hoặc commit lên GitHub:

```powershell
# Windows PowerShell
$env:EULERSTREAM_API_KEY = "YOUR_API_KEY"
npm start
```

```sh
# Bash (macOS/Linux)
read -r -s -p "EulerStream API key: " EULERSTREAM_API_KEY
export EULERSTREAM_API_KEY
npm start
```

Có thể đặt `TIKTOK_CHANNEL=https://www.tiktok.com/@tenkenh/live` trong môi trường để kết nối ngay khi khởi động. Nếu dùng file `.env`, cần Node 20.6+ và chạy **`node --env-file=.env server.mjs`**; `npm start` mặc định không tự đọc file này. Có mẫu `.env.example` không chứa key thật.

Kết nối thử lại sau 2 phút khi chưa thành công/mất kết nối; nút **Ngắt** hủy lịch. Không tải danh mục quà mở rộng để tránh API ký URL Business không cần thiết. **Ký WebSocket vẫn phụ thuộc quyền/hạn mức EulerStream và thay đổi phía TikTok**; không cam kết tài khoản miễn phí luôn kết nối được. Chưa thể xác minh phiên TikTok thật của bạn trong môi trường phát triển.

## Ngân hàng câu hỏi

Có **120 câu / 6 chủ đề**, mỗi chủ đề 20 câu: Ẩm thực, Địa lý, Động vật, Khoa học, Thể thao, Toán học. Chọn chủ đề hoặc tổng hợp trước khi bắt đầu. Mỗi ván rút 100 câu. Nếu chủ đề có dưới 100 câu, game xáo lại và lặp bộ câu hỏi cho đủ; với bộ từ 100 câu trở lên, không trùng ID trong ván.

Bảng điều khiển cho sửa/thêm/xóa câu, nhập JSON và xuất JSON. Chỉ lưu bộ mới ở sảnh hoặc sau ván; một chủ đề cần ít nhất 20 câu để bắt đầu. Đáp án phụ ngăn cách bằng `|` trong trình sửa. Bản lưu riêng ở `data/questions.local.json` (đã bỏ qua Git); file gốc là `data/questions.json`.

```json
{
  "id": "food-cacao",
  "category": "Ẩm thực",
  "prompt": "Sô-cô-la được làm từ hạt gì?",
  "answers": ["Ca cao", "cacao"],
  "explanation": "Hạt ca cao là nguyên liệu chính để làm sô-cô-la."
}
```

File nhập là mảng các đối tượng này, tối thiểu 20 câu, tối đa 1 MB. Server kiểm tra trùng ID và dữ liệu. Đây là bộ câu hỏi biên soạn sẵn, không sinh câu bằng AI trong lúc chơi; người dẫn có thể rà soát và thay đáp án phụ phù hợp đối tượng xem.

## Điều khiển và mô phỏng

- **Bắt đầu / Tạm dừng / Tiếp tục / Chốt đáp án / Câu tiếp theo / Ván mới**.
- Tự sang câu mới sau 5 giây xem đáp án; có thể tắt để dẫn chương trình thủ công.
- Thử bình luận bằng tên tự chọn; tạo thêm 12 người hoặc lấp đủ 200 chỗ và bật bot trả lời. **Mô phỏng là dữ liệu nội bộ**, không phải người xem hoặc bình luận TikTok thật.
- Nhân vật đảo dùng ảnh đại diện TikTok khi tải được, dự phòng bằng chữ viết tắt. Màn hình vẫn có thể hiển thị tối đa 200 avatar; hàng chờ hiển thị tối đa 48 avatar đầu và tổng số đang chờ. Bảng điều khiển có tìm tên và thống kê từng người.

## Giọng đọc

Đọc câu hỏi/đáp án với Hoài My, pitch 0, rate +2%. Bấm **Bật giọng đọc câu hỏi** trên overlay một lần để trình duyệt cho phép phát âm thanh. Có thể tắt đọc ở bảng điều khiển. Stream bị cắt sẽ được thử lại; nếu Edge lỗi thì dùng giọng Việt đã cài trên trình duyệt, nếu không có sẽ hiện thông báo. Không đọc câu cũ khi đã chuyển sang câu khác.

## Kiểm tra

```sh
npm test
```

Các test kiểm tra 200 ghế, hàng chờ FIFO, hạn 25 giây, khóa đáp án đầu tiên, 3 câu vắng, cửa sổ trượt 3/6, VÔ lại, tham gia sau câu 12, pause/resume, xếp hạng và câu hỏi nhiều chủ đề. Màn hình và điều khiển cũng được thử bằng Chromium với 200 người mô phỏng; không đồng nghĩa kết nối TikTok/Edge ở mọi mạng đã được xác minh.

## Cấu trúc

```text
server.mjs                HTTP, WebSocket, TikTok và giọng đọc
src/game.mjs              Bộ máy luật độc lập, kiểm tra được bằng đồng hồ giả
src/                      Chuẩn hóa TikTok, thử kết nối lại và TTS
public/overlay.html       Màn hình đảo dọc 1080×1920, tự co theo cửa sổ
public/control.html       Phòng điều khiển responsive
public/assets/            CSS, JavaScript, font Nunito cục bộ
data/questions.json      Bộ câu hỏi gốc
test/                    Test Node tích hợp sẵn
```

Server chỉ lắng nghe **127.0.0.1**, kiểm tra Host/Origin và chỉ phục vụ thư mục giao diện/âm thanh cho phép. Màn hình overlay là phía nhận; không được điều khiển trận đấu qua socket. Không đưa file server, key hay thư mục dữ liệu lên dịch vụ static để thay cho server Node.

## Giấy phép và nguồn

MIT, xem `LICENSE`. Các mô-đun kết nối/giọng đọc dùng lại từ dự án `via-than-tai-online`; giữ thông báo giấy phép gốc. Bộ máy luật, giao diện đảo và ngân hàng câu hỏi được xây mới cho repo này. Font Nunito Sans đi kèm giấy phép SIL OFL trong `public/assets/fonts/`.

### Xếp hạng và bot

Sau mỗi câu hiển thị và đọc đáp án cùng tối đa ba người trả lời đúng nhanh nhất, điểm cộng và tổng điểm sau câu đó. Tốc độ giọng nữ mặc định +4%. Bảng TOP ĐIỂM chỉ cập nhật sau mỗi 10 câu (10, 20, …, 100), đọc tối đa 10 tên cùng điểm theo thứ hạng, bổ sung cho phần đọc TOP 3 mỗi câu. Bấm bật giọng đọc trên màn hình đảo; đọc xong chờ 5 giây trước câu tiếp theo. Nếu chưa bật âm thanh, game dùng 5 giây hiển thị đáp án; có giới hạn chờ 90 giây nếu TTS lỗi.

Sau câu 100 và phần đọc kết quả, game tự mở ván tiếp theo, giữ nguyên danh sách và ghế người đang trên đảo, hàng chờ và cấu hình bot. Điểm, lịch sử đúng/sai và số câu vắng tính lại cho ván mới. Nút “Ván mới” thủ công vẫn xóa danh sách như trước.

Bảng điều khiển cho bật/tắt và chỉnh 10–100 bot (mặc định 12). Bot có avatar vẽ riêng, tên đa dạng, tự bình luận đáp án với thời điểm và độ chính xác khác nhau; có thể bị loại và vào lại theo luật chung. Số bot thực tế phụ thuộc chỗ trống trên đảo. Bot chỉ mô phỏng trong game, không gửi bình luận lên TikTok.

Bot bị loại không tự quay lại sau vài giây. Khi bật bot, sau mỗi khoảng ngẫu nhiên 1–3 phút, game bù ngẫu nhiên 1–3 bot, không quá số bot đã đặt hoặc sức chứa đảo. Nếu số người chơi thật trên đảo tăng so với lần kiểm tra trước (lần đầu so với lúc bật/chỉnh bot), lượt đó bỏ qua bù bot. Bộ đếm được lên lịch lại sau mỗi lượt; không bù khi đang tạm dừng hoặc đã tắt bot. Hàng chờ được lên ghế trước bot.
