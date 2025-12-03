from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import cv2
import numpy as np
import pytesseract
from PIL import Image
import io
import base64
from typing import List, Dict
import traceback
import platform

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

if platform.system() == 'Windows':
    pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'

def preprocess_image(image: np.ndarray) -> np.ndarray:
    """Preprocessing sederhana tapi efektif"""
    # Convert ke grayscale
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    
    # Resize jika terlalu kecil (meningkatkan akurasi)
    height, width = gray.shape
    if width < 2000:
        scale = 2000 / width
        new_width = int(width * scale)
        new_height = int(height * scale)
        gray = cv2.resize(gray, (new_width, new_height), interpolation=cv2.INTER_CUBIC)
    
    # Denoise
    denoised = cv2.fastNlMeansDenoising(gray, None, 10, 7, 21)
    
    # Increase contrast
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8,8))
    contrast = clahe.apply(denoised)
    
    # Thresholding - pilih yang lebih baik antara adaptive dan otsu
    # Adaptive threshold
    adaptive = cv2.adaptiveThreshold(contrast, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, 
                                     cv2.THRESH_BINARY, 11, 2)
    
    # Otsu threshold
    blur = cv2.GaussianBlur(contrast, (5,5), 0)
    _, otsu = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    
    # Gunakan otsu jika lebih jelas (lebih banyak pixel hitam/putih)
    if np.sum(otsu == 0) > np.sum(adaptive == 0):
        return otsu
    return adaptive

def detect_text_regions(image: np.ndarray) -> List[Dict]:
    """Deteksi region teks"""
    processed = preprocess_image(image)
    
    try:
        # Gunakan PSM 3 (Fully automatic page segmentation)
        config = '--oem 3 --psm 3'
        data = pytesseract.image_to_data(processed, output_type=pytesseract.Output.DICT, 
                                        config=config, lang='eng')
        
        boxes = []
        n_boxes = len(data['text'])
        
        for i in range(n_boxes):
            conf = int(data['conf'][i])
            if conf > 30:  # Confidence threshold
                text = data['text'][i].strip()
                if text and len(text) > 0:
                    boxes.append({
                        'text': text,
                        'x': int(data['left'][i]),
                        'y': int(data['top'][i]),
                        'width': int(data['width'][i]),
                        'height': int(data['height'][i]),
                        'confidence': float(conf)
                    })
        
        return boxes
    except Exception as e:
        print(f"Text detection error: {e}")
        return []

def draw_bounding_boxes(image: np.ndarray, boxes: List[Dict]) -> np.ndarray:
    """Gambar bounding box"""
    result_image = image.copy()
    
    for box in boxes:
        x, y, w, h = box['x'], box['y'], box['width'], box['height']
        
        # Warna berdasarkan confidence
        if box['confidence'] > 70:
            color = (0, 255, 0)  # Hijau
        elif box['confidence'] > 50:
            color = (255, 165, 0)  # Orange
        else:
            color = (0, 0, 255)  # Merah
        
        cv2.rectangle(result_image, (x, y), (x + w, y + h), color, 2)
        
        # Label
        label = f"{box['confidence']:.0f}%"
        cv2.putText(result_image, label, (x, y - 5), 
                   cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1)
    
    return result_image

def extract_text(image: np.ndarray) -> str:
    """Ekstrak teks dari gambar"""
    processed = preprocess_image(image)
    
    try:
        # PSM 3: Fully automatic page segmentation (default)
        # PSM 6: Assume a single uniform block of text
        # Coba keduanya dan pilih hasil terpanjang
        
        config1 = '--oem 3 --psm 3'
        text1 = pytesseract.image_to_string(processed, config=config1, lang='eng')
        
        config2 = '--oem 3 --psm 6'
        text2 = pytesseract.image_to_string(processed, config=config2, lang='eng')
        
        # Pilih hasil yang lebih panjang (biasanya lebih akurat)
        if len(text2.strip()) > len(text1.strip()):
            return text2.strip()
        return text1.strip()
        
    except Exception as e:
        print(f"Text extraction error: {e}")
        return ""

@app.post("/process-ocr")
async def process_ocr(file: UploadFile = File(...)):
    """Endpoint utama untuk memproses OCR"""
    try:
        print(f"Processing file: {file.filename}")
        
        # Baca file
        contents = await file.read()
        nparr = np.frombuffer(contents, np.uint8)
        image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if image is None:
            raise HTTPException(status_code=400, detail="Invalid image file")
        
        print(f"Image shape: {image.shape}")
        
        # Deteksi text regions
        print("Detecting text regions...")
        text_boxes = detect_text_regions(image)
        print(f"Found {len(text_boxes)} text boxes")
        
        # Extract text
        print("Extracting text...")
        extracted_text = extract_text(image)
        print(f"Extracted text length: {len(extracted_text)}")
        
        # Gambar bounding boxes
        image_with_boxes = draw_bounding_boxes(image, text_boxes)
        
        # Convert gambar ke base64
        _, buffer = cv2.imencode('.jpg', image_with_boxes)
        image_base64 = base64.b64encode(buffer).decode('utf-8')
        
        # Hitung average confidence
        avg_conf = np.mean([b['confidence'] for b in text_boxes]) if text_boxes else 0
        
        return JSONResponse({
            "success": True,
            "data": {
                "text": extracted_text if extracted_text else "Tidak dapat mendeteksi teks",
                "average_confidence": round(avg_conf, 2),
                "rotation_angle": 0,
                "text_boxes": text_boxes,
                "processed_image": f"data:image/jpeg;base64,{image_base64}",
                "total_boxes": len(text_boxes)
            }
        })
        
    except Exception as e:
        print(f"ERROR: {str(e)}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Processing error: {str(e)}")

@app.get("/")
async def root():
    return {"message": "OCR Backend API is running"}

@app.get("/test-tesseract")
async def test_tesseract():
    """Test Tesseract installation"""
    try:
        version = pytesseract.get_tesseract_version()
        return {"status": "OK", "tesseract_version": str(version)}
    except Exception as e:
        return {"status": "ERROR", "message": str(e)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)