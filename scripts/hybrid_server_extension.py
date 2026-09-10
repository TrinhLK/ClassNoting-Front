
import requests
import json
import os
"""
HƯỚNG DẪN TÍCH HỢP VÀO SERVER PYTHON (FastAPI/Flask)

1. Cài đặt thư viện:
   pip install requests

2. Logic xử lý:
   - Input: audio_url (Firebase/S3), diarization (JSON từ Bot)
   - Process:
     1. Tải file audio về.
     2. Chạy Zipformer (ASR) -> Có Text + Timestamp.
     3. Gọi hàm `align_hybrid_transcript` dưới đây để gán Speaker.
   - Output: Danh sách segments đã gán người nói.
"""

def download_file(url, save_path):
    with requests.get(url, stream=True) as r:
        r.raise_for_status()
        with open(save_path, 'wb') as f:
            for chunk in r.iter_content(chunk_size=8192):
                f.write(chunk)
    return save_path

# Hàm Góng (Alignment) quan trọng nhất
def align_hybrid_transcript(asr_segments, diarization_segments):
    """
    asr_segments: List[{ text, start, end }] (Từ Zipformer)
    diarization_segments: List[{ speaker, start, end }] (Từ Bot MeetingBaas)
    
    Return: List[{ speakerId, text, start, end }]
    """
    final_segments = []
    
    # Sắp xếp theo thời gian
    asr_segments.sort(key=lambda x: x['start'])
    diarization_segments.sort(key=lambda x: x['start'])
    
    for seg in asr_segments:
        seg_mid = (seg['start'] + seg['end']) / 2
        
        # Tìm speaker có đoạn thoại bao trùm điểm giữa của segment này
        best_speaker = "Unknown"
        
        # Cách đơn giản: Tìm đoạn diarization nào chứa seg_mid
        # (Có thể tối ưu bằng Interval Tree nếu dữ liệu lớn)
        for d in diarization_segments:
            if d['start'] <= seg_mid <= d['end']:
                best_speaker = f"SPEAKER_{d['speaker']}" # Hoặc mapping tên
                break
        
        # Logic Gộp (Merge) nếu cùng người nói với đoạn trước
        if final_segments and final_segments[-1]['speakerId'] == best_speaker:
            last = final_segments[-1]
            # Kiểm tra khoảng cách thời gian (nếu < 2s thì gộp)
            if seg['start'] - last['end'] < 2.0:
                last['text'] += " " + seg['text']
                last['end'] = seg['end']
                continue
                
        # Nếu không gộp được, tạo mới
        final_segments.append({
            "id": f"seg_{int(seg['start']*1000)}",
            "speakerId": best_speaker,
            "text": seg['text'],
            "start": seg['start'],
            "end": seg['end']
        })
        
    return final_segments

# --- VÍ DỤ API ENDPOINT (FASTAPI) ---
"""
@app.post("/transcribe_hybrid")
async def transcribe_hybrid(request: Request):
    data = await request.json()
    audio_url = data.get("audio_url")
    diarization = data.get("diarization")
    
    # 1. Tải Audio
    local_filename = f"temp_{int(time.time())}.mp3"
    download_file(audio_url, local_filename)
    
    # 2. Chạy Zipformer (Giả lập hàm của bạn)
    # asr_result = my_zipformer_model.transcribe(local_filename)
    # Giả sử asr_result = [{ "text": "Alo", "start": 0.5, "end": 1.0 }, ...]
    
    # 3. Gán Diarization
    final_segments = align_hybrid_transcript(asr_result, diarization)
    
    return {"segments": final_segments}
"""
