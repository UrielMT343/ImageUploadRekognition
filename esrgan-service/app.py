import numpy as np
import os
import cv2

from realesrgan import RealESRGANer
from basicsr.archs.srvgg_arch import SRVGGNetCompact
from fastapi import FastAPI, UploadFile, File, HTTPException, Response
from threading import Lock


app = FastAPI()

upsampler = None
model_lock = Lock()


@app.on_event("startup")
def load_model():
    global upsampler
    print("Starting model loading...", flush=True)

    model_path = os.path.join("models", "realesr-general-x4v3.pth")

    model = SRVGGNetCompact(
        num_in_ch=3,
        num_out_ch=3,
        num_feat=64,
        num_conv=32,
        upscale=4,
        act_type='prelu'
    )

    upsampler = RealESRGANer(
        scale=4,
        model_path=model_path,
        model=model,
        tile=0,
        tile_pad=10,
        pre_pad=0,
        half=False
    )

    print("ESRGAN model loaded successfully.")


@app.get("/health")
async def health_check():
    if upsampler is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    print("Health check endpoint was called")
    return {"status": "Nice and healthy!"}


@app.post("/enhance/")
async def enhance_image(file: UploadFile = File(...)):
    if upsampler is None:
        print("Model not loaded during enhancement request")
        raise HTTPException(status_code=503, detail="Service temporarily unavailable (model loading)")
    
    if not file:
        raise HTTPException(status_code=422, detail="No file uploaded")

    print(f"Received file: {file.filename}")
    contents = await file.read()
    img_np = np.frombuffer(contents, np.uint8)
    print(f"Image bytes to numpy array: {img_np.shape}")

    img = cv2.imdecode(img_np, cv2.IMREAD_COLOR)
    if img is None:
        print("Failed to decode image")
        raise HTTPException(status_code=400, detail="Invalid image")

    try:
        with model_lock:
            print("Enhancing image...")
            output, _ = upsampler.enhance(img)
    except Exception as e:
        print(f"Enhancement failed: {e}")
        raise HTTPException(status_code=500, detail="Enhancement failed")

    _, img_encoded = cv2.imencode('.jpg', output)
    return Response(content=img_encoded.tobytes(), media_type="image/jpeg")
