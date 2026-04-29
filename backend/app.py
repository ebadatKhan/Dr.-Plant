import os
import numpy as np
from flask import Flask, request, jsonify
from flask_cors import CORS
from tensorflow.keras.models import load_model
from tensorflow.keras.preprocessing import image
from PIL import Image
import io

app = Flask(__name__)
CORS(app) # Enable CORS for cross-platform access (Mobile/Web)

# Configuration
MODEL_PATH = 'plant_disease_model.h5'
IMG_SIZE = 224

# Mock classes - these should match the indices from your training script
CLASS_NAMES = [
    'Apple___Apple_scab', 'Apple___Black_rot', 'Apple___Cedar_apple_rust', 'Apple___healthy',
    'Blueberry___healthy', 'Cherry___Powdery_mildew', 'Cherry___healthy',
    'Corn___Cercospora_leaf_spot Gray_leaf_spot', 'Corn___Common_rust', 'Corn___Northern_Leaf_Blight', 'Corn___healthy',
    'Grape___Black_rot', 'Grape___Esca_(Black_Measles)', 'Grape___Leaf_blight_(Isariopsis_Leaf_Spot)', 'Grape___healthy',
    'Orange___Haunglongbing_(Citrus_greening)', 'Peach___Bacterial_spot', 'Peach___healthy',
    'Pepper,_bell___Bacterial_spot', 'Pepper,_bell___healthy', 'Potato___Early_blight', 'Potato___Late_blight', 'Potato___healthy',
    'Raspberry___healthy', 'Soybean___healthy', 'Squash___Powdery_mildew', 'Strawberry___Leaf_scorch', 'Strawberry___healthy',
    'Tomato___Bacterial_spot', 'Tomato___Early_blight', 'Tomato___Late_blight', 'Tomato___Leaf_Mold', 'Tomato___Septoria_leaf_spot', 'Tomato___Spider_mites Two-spotted_spider_mite', 'Tomato___Target_Spot', 'Tomato___Tomato_Yellow_Leaf_Curl_Virus', 'Tomato___Tomato_mosaic_virus', 'Tomato___healthy'
]

# Load model globally
model = None
if os.path.exists(MODEL_PATH):
    model = load_model(MODEL_PATH)
    print("Model loaded successfully.")
else:
    print(f"Warning: {MODEL_PATH} not found. Prediction endpoint will fail.")

def preprocess_image(img_bytes):
    """
    Resizes and normalizes the incoming image for the CNN model.
    """
    img = Image.open(io.BytesIO(img_bytes))
    img = img.resize((IMG_SIZE, IMG_SIZE))
    img_array = image.img_to_array(img)
    img_array = np.expand_dims(img_array, axis=0) # Create batch axis
    img_array /= 255.0 # Normalize pixel values
    return img_array

@app.route('/predict', methods=['POST'])
def predict():
    if model is None:
        return jsonify({'error': 'Model not loaded on server'}), 500

    if 'file' not in request.files:
        return jsonify({'error': 'No file part in the request'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400

    try:
        img_bytes = file.read()
        processed_img = preprocess_image(img_bytes)
        
        # Inference
        predictions = model.predict(processed_img)
        score = tf.nn.softmax(predictions[0])
        
        class_idx = np.argmax(predictions[0])
        confidence = float(np.max(predictions[0]))
        disease_name = CLASS_NAMES[class_idx]
        
        # Clean up name for response (e.g. Tomato___healthy -> Tomato Healthy)
        clean_name = disease_name.replace('___', ' ').replace('_', ' ')

        return jsonify({
            'disease': clean_name,
            'confidence': round(confidence, 4),
            'status': 'success'
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'online', 'model_loaded': model is not None})

if __name__ == '__main__':
    # Binding to 0.0.0.0:3000 for local dev if needed, 
    # but usually backend runs on a different port like 5000
    app.run(host='0.0.0.0', port=5000, debug=True)
