# 🚦 SmartTraffic AI: Traffic Video Analytics and Signal Optimization


## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [System Architecture](#system-architecture)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Running the Project](#running-the-project)
- [API Endpoints](#api-endpoints)
- [AI Modules](#ai-modules)
- [Pages Overview](#pages-overview)
- [Screenshots](#screenshots)

---

## Overview

SmartTraffic is a full-stack intelligent traffic management system that analyses live traffic videos across 4 intersection lanes and dynamically adjusts signal timing using AI. Unlike traditional fixed-timing systems (60s per lane), SmartTraffic allocates green time based on real-time vehicle count, density, speed, and congestion level — resulting in measurable cycle time reductions and efficiency improvements.

The system was developed as a Final Year Project and demonstrates:
- Real-time vehicle detection and tracking using YOLOv8 + DeepSORT
- Priority classification using a trained Random Forest model (`congestion.pkl`)
- Emergency vehicle detection with immediate signal override
- Live dashboard, analytics comparison, and AI signal simulation

---

## Features

| Feature | Description |
|---|---|
| 🎥 Video Upload | Upload MP4/AVI/MOV traffic videos per lane with file validation |
| 🤖 AI Detection | YOLOv8n detects cars, motorcycles, buses, trucks per frame |
| 🔁 Vehicle Tracking | DeepSORT tracks individual vehicles across frames |
| 🧠 Priority Model | Random Forest classifies lane priority (Low / Medium / High) |
| 🚨 Emergency Override | Large bus-class vehicles flagged as ambulance, immediate green |
| 📊 Live Dashboard | Real-time lane stats, congestion count, emergency alerts |
| 📈 Analytics | Traditional vs AI comparison charts + performance metrics table |
| 🚦 AI Simulation | Canvas intersection with turning vehicles, indicator lights, signal phases |
| 💾 Supabase Storage | Auto-saves lane stats every 5s, emergency log, comparison results |
| 🔐 Authentication | Supabase Auth (email/password login and registration) |

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (React)                      │
│  Dashboard │ Upload │ Analytics │ Simulation │ Feedback      │
└─────────────────────┬───────────────────────────────────────┘
                      │ HTTP / MJPEG stream
┌─────────────────────▼───────────────────────────────────────┐
│                    Flask API (Python)                        │
│  /api/live-stats  /api/stream-local  /api/emergency         │
│  /api/comparison  /api/performance   /api/start-analysis    │
└────────┬───────────────────────┬────────────────────────────┘
         │                       │
┌────────▼────────┐   ┌──────────▼──────────┐
│  AI Pipeline    │   │   Supabase (DB)      │
│  YOLOv8n        │   │   lane_status        │
│  DeepSORT       │   │   emergency_log      │
│  RF Model       │   │   comparison_results │
│  congestion.pkl │   │   video              │
└─────────────────┘   │   feedback           │
                      └─────────────────────┘
```

---

## Tech Stack

### Backend
| Technology | Version | Purpose |
|---|---|---|
| Python | 3.10+ | Backend runtime |
| Flask | 2.x | REST API + MJPEG streaming |
| YOLOv8n | ultralytics | Vehicle detection |
| DeepSORT Realtime | latest | Multi-object tracking |
| scikit-learn | latest | Random Forest model |
| OpenCV | 4.x | Video processing |
| Supabase Python | latest | Database client |
| pandas / numpy | latest | Data processing |

### Frontend
| Technology | Version | Purpose |
|---|---|---|
| React | 18 | UI framework |
| TypeScript | 5 | Type safety |
| Vite | 5 | Build tool |
| Tailwind CSS | 3 | Styling |
| Chart.js / react-chartjs-2 | latest | Analytics charts |
| Motion (Framer) | latest | Animations |
| Lucide React | latest | Icons |
| Supabase JS | latest | Auth + DB client |

### Database
| Service | Purpose |
|---|---|
| Supabase (PostgreSQL) | Persistent storage for lane stats, emergencies, comparisons |

---

## Project Structure

```
smarttraffic/
├── backend/
│   ├── app.py                      # Flask API — main entry point
│   └── model/
│       ├── yolov8n.pt              # YOLOv8 nano weights
│       ├── congestion.pkl          # Trained Random Forest model
│       ├── traffic A.mp4           # Lane A video
│       ├── traffic B.mp4           # Lane B video
│       ├── traffic C.mp4           # Lane C video
│       ├── traffic D.mp4           # Lane D video
│       ├── model_output/
│       │   └── training_data.csv
│       ├── comparison_output/
│       │   ├── comparison_table.csv
│       │   └── performance_metrics.csv
│       └── emergency_output/
│           └── emergency_log.csv
│
└── frontend/
    ├── src/
    │   ├── pages/
    │   │   ├── LandingPage.tsx
    │   │   ├── AuthPage.tsx
    │   │   ├── DashboardHome.tsx   # Live dashboard
    │   │   ├── UploadPage.tsx      # Video upload + stream view
    │   │   ├── AnalyticsPage.tsx   # AI vs Traditional charts
    │   │   ├── SimulationPage.tsx  # Canvas intersection simulation
    │   │   └── FeedbackPage.tsx
    │   ├── components/
    │   │   ├── Card.tsx
    │   │   ├── Badge.tsx
    │   │   ├── Button.tsx
    │   │   ├── DashboardLayout.tsx
    │   │   └── TrafficLightIcon.tsx
    │   ├── App.tsx                 # Root — routing + shared state
    │   ├── types.ts
    │   └── utils.ts
    ├── package.json
    └── vite.config.ts
```

---

## Prerequisites

- Python **3.10+**
- Node.js **18+**
- Traffic videos — MP4/AVI/MOV files for each lane placed in `backend/model/`

---

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/yourusername/smarttraffic.git
cd smarttraffic
```

### 2. Backend setup

```bash
cd backend
pip install flask flask-cors ultralytics deep-sort-realtime opencv-python supabase pandas numpy scikit-learn
```

### 3. Frontend setup

```bash
cd frontend
npm install
```

---

## Configuration

### Backend — environment variables

Create a `.env` file inside `backend/` or set these directly in `app.py`:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key
```

### Frontend — environment variables

Create a `.env` file inside `frontend/`:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

---
## Running the Project

### Start the Flask backend

```bash
cd backend
python app.py
```

Flask runs on `http://127.0.0.1:5000`

### Start the React frontend

```bash
cd frontend
npm run dev
```

Frontend runs on `http://localhost:5173`

> ⚠️ Both must be running simultaneously. Start Flask first.

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Health check + model status |
| `GET` | `/api/live-stats` | Live stats for all 4 lanes |
| `GET` | `/api/live-stats/<lane_key>` | Live stats for one lane |
| `GET` | `/api/stream-local/<lane_key>` | MJPEG video stream |
| `GET` | `/api/emergency` | Live emergency detections (current session) |
| `GET` | `/api/emergency-history` | Full emergency log from Supabase |
| `GET` | `/api/comparison` | AI vs Traditional comparison data |
| `GET` | `/api/performance` | Performance metrics summary |
| `POST` | `/api/upload-video` | Upload video file for a lane |
| `POST` | `/api/start-analysis` | Start YOLO processing on all lanes |
| `POST` | `/api/stop-analysis` | Stop analysis and reset state |
| `POST` | `/api/save-comparison` | Save comparison_table.csv to Supabase |
| `POST` | `/api/save-emergency` | Save emergency_log.csv to Supabase |

---

## Modules

### Module 1 — Vehicle Detection (YOLOv8n)
Detects 4 vehicle classes from COCO: `Car (2)`, `Motorcycle (3)`, `Bus (5)`, `Truck (7)`. Runs every 2 frames (`PROCESS_EVERY_N = 2`) to balance performance and accuracy.

### Module 2 — Vehicle Tracking (DeepSORT)
Tracks each detected vehicle across frames using `n_init=1` (immediate confirmation) with a `last_boxes` cache to prevent flicker on non-detection frames.

### Module 3 — Speed Estimation
Calculates speed in km/h from pixel displacement between frames using `PIXELS_PER_METER = 8.0` calibration constant.

### Module 4 — Congestion Classification
Classifies each lane as `Low / Medium / High` based on vehicle count thresholds:
- `High`: ≥ 15 vehicles
- `Medium`: ≥ 8 vehicles
- `Low`: < 8 vehicles

### Module 5 — Priority Prediction (Random Forest)
`congestion.pkl` takes `[vehicle_count, density, heavy_ratio, avg_speed, congestion_enc]` as input and predicts priority level. Rule-based overrides ensure High congestion always maps to High priority regardless of model output.

### Module 6 — Green Time Allocation
Calculates optimal green time per lane using congestion level, vehicle count, speed, and heavy vehicle ratio. Range: `10s (MIN_GREEN)` to `60s (MAX_GREEN)`.

### Module 7 — Emergency Detection
Large Bus-class bounding boxes (width or height > 25% of frame) are flagged as potential ambulances. Immediately overrides priority to High and extends green to MAX_GREEN (60s).

## Screenshots

## Known Limitations

- YOLOv8n (COCO) has no dedicated ambulance class — emergency detection uses a large Bus-class heuristic
- Speed estimation accuracy depends on `PIXELS_PER_METER` calibration which varies by camera angle

---

## License

This project is developed for academic purposes as a Final Year Project.

---
