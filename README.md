# AI Plant Disease Detection Project

This project is a multi-platform AI system for detecting plant diseases. 

## Structure

- `/model` : Python (TensorFlow/Keras) CNN model training scripts.
- `/backend` : Python (Flask) API server for hosting the model.
- `/mobile` : Flutter (Dart) mobile application code.
- `/src` : React (TypeScript) Web Demo (the application running in this preview).

## Setup Instructions

### 1. AI Model Training (Local)
1. Navigate to `/model`.
2. Install requirements: `pip install -r requirements.txt`.
3. Put your dataset in `data/train` and run `python train.py`.
4. This will generate `plant_disease_model.h5`.

### 2. Backend API Deployment
1. Move `plant_disease_model.h5` to `/backend`.
2. Install requirements: `pip install -r requirements.txt`.
3. Run `python app.py` to start the Flask server locally.
4. Deploy to Railway/Render/AWS using the provided files.

### 3. Flutter Mobile App
1. Navigate to `/mobile`.
2. Run `flutter pub get`.
3. **Important**: Open `lib/main.dart` and update `_baseUrl` with your deployed backend URL.
4. Run on your device: `flutter run`.

## Web Demo Notes
The web preview you see here uses the **Gemini 3 Pro** model to provide real-time diagnosis in the browser. It follows the same user flow as the mobile app but provides higher performance without needing a custom GPU server.

### Key Features
- **Smart Scan**: Upload or take a photo of a plant leaf.
- **History**: Track past diagnoses locally.
- **Database**: Quick access to common disease treatments.
- **Responsive Design**: Mimics a native mobile experience.
