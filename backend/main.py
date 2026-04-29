from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import numpy as np
import io
import os
from PIL import Image
import tensorflow as tf
from typing import List, Dict
import logging

# Setup Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("DrPlant-API")

app = FastAPI(title="Dr Plant AI Backend", version="2.0.0")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration
MODEL_PATH = 'plant_disease_model.h5'
IMG_SIZE = 224

# Mapping (Same as before but production organized)
CLASS_NAMES = [
    'Apple Scab', 'Apple Black Rot', 'Apple Cedar Rust', 'Apple Healthy',
    'Blueberry Healthy', 'Cherry Powdery Mildew', 'Cherry Healthy',
    'Corn Gray Leaf Spot', 'Corn Common Rust', 'Corn Northern Leaf Blight', 'Corn Healthy',
    'Grape Black Rot', 'Grape Black Measles', 'Grape Leaf Blight', 'Grape Healthy',
    'Orange Citrus Greening', 'Peach Bacterial Spot', 'Peach Healthy',
    'Pepper Bacterial Spot', 'Pepper Healthy', 'Potato Early Blight', 'Potato Late Blight', 'Potato Healthy',
    'Raspberry Healthy', 'Soybean Healthy', 'Squash Powdery Mildew', 'Strawberry Leaf Scorch', 'Strawberry Healthy',
    'Tomato Bacterial Spot', 'Tomato Early Blight', 'Tomato Late Blight', 'Tomato Leaf Mold', 'Tomato Septoria Leaf Spot', 'Tomato Spider Mites', 'Tomato Target Spot', 'Tomato Yellow Leaf Curl Virus', 'Tomato Mosaic Virus', 'Tomato Healthy'
]

# Lazy load model
model = None

@app.on_event("startup")
def load_ai_model():
    global model
    if os.path.exists(MODEL_PATH):
        try:
            model = tf.keras.models.load_model(MODEL_PATH)
            logger.info("✅ CNN Model loaded successfully.")
        except Exception as e:
            logger.error(f"❌ Failed to load model: {e}")
    else:
        logger.warning(f"⚠️ Model not found at {MODEL_PATH}. Prediction service will be offline.")

def preprocess_image(image_data: bytes):
    img = Image.open(io.BytesIO(image_data))
    img = img.resize((IMG_SIZE, IMG_SIZE))
    img_array = tf.keras.preprocessing.image.img_to_array(img)
    img_array = np.expand_dims(img_array, axis=0)
    img_array /= 255.0
    return img_array

@app.post("/predict")
async def predict(file: UploadFile = File(...)):
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded on server")

    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File provided is not an image")

    try:
        content = await file.read()
        processed_img = preprocess_image(content)
        
        # Inference
        predictions = model.predict(processed_img)
        class_idx = np.argmax(predictions[0])
        confidence = float(np.max(predictions[0]))
        
        disease = CLASS_NAMES[class_idx]
        
        logger.info(f"Diagnosis: {disease} | Confidence: {confidence:.2f}")

        return {
            "disease": disease,
            "confidence": round(confidence, 4),
            "status": "success",
            "server_timestamp": tf.timestamp().numpy()
        }

    except Exception as e:
        logger.error(f"Prediction Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
def health_check():
    return {
        "status": "online",
        "model_loaded": model is not None,
        "api_version": "2.0.0"
    }

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=3000)
