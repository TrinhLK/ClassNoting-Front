# Smoke benchmark diarization

Ngày chạy: 06/10/2026, máy local của workspace, Sherpa-ONNX 1.13.8.
Audio công khai: [0-four-speakers-zh.wav](https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-segmentation-models/0-four-speakers-zh.wav), 56,8607 giây. Đây là tiếng Trung, không phải tập đánh giá họp tiếng Việt.

Model: Pyannote segmentation 3.0 ONNX + 3D-Speaker ERes2Net embedding. Window 8 giây; centroid tồn tại qua các window.

| Ngưỡng cosine | Số cụm sinh ra | Tổng giây tính toán | Số span unknown |
|---|---:|---:|---:|
| 0,45 | 4 | 1,544 | 3 |
| 0,50 | 4 | 1,446 | 3 |
| 0,55 | 4 | 2,365 | 3 |
| 0,60 | 5 | 1,448 | 3 |
| 0,65 | 6 | 1,412 | 3 |

Mẫu có tên mô tả bốn người. Có đúng bốn cụm **không chứng minh** gán đúng người theo thời gian. Chưa đo DER hoặc lỗi tên trên ground truth. Ngưỡng 0,55 chỉ là điểm bắt đầu thử nghiệm, cần hiệu chỉnh trên tập tiếng Việt độc lập; không tối ưu sản phẩm chỉ theo số cụm.

Ở lượt đầu với ngưỡng 0,65: RTF 0,0245; p95 xử lý window 0,307 giây. Số này chỉ tính module diarization trên máy local, không tính tải model, ASR, mạng, VAD, chờ metadata hay số phiên đồng thời.

Gating trước rollout rộng: dữ liệu tiếng Việt được gán nhãn thủ công; đo DER, lỗi tên, unknown, p50/p95 end-to-end; test nói chồng, người nói ngắn, echo mic/loa và reconnect. Chưa có dữ liệu này trong yêu cầu hiện tại.

## Kiểm thử giao thức với model thật

ASR/VAD dùng model cache của repo realtime, audio 5 giây đầu của mẫu trên. Đã kiểm tra handshake protocol 2, ping/pong, flush tạo final packet ngay cả khi VAD chưa đóng câu, timestamp với offset 12 giây, nhãn speaker/uncertain từng từ. Kết quả: 1 final packet, đủ các xác nhận. Đây không phải kiểm thử độ chính xác ASR tiếng Việt.

Chạy từ thư mục realtime: `python test_protocol_smoke.py /path/to/16khz-speech.wav`.
