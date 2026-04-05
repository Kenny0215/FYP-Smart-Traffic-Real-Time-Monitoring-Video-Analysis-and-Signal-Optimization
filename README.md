# 🚦 SmartTraffic AI: Real-Time Traffic Monitoring And Simulation Based Adaptive Signal Optimization

> **Final Year Project (FYP)**
> AI-powered adaptive traffic signal control system with fuzzy logic, inter-lane coordination, real-time vehicle classification and multi-lane emergency scenario management.

---

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
- [Screenshots](#screenshots)
- [Known Limitations](#known-limitations)

---

## Overview

SmartTraffic is a full-stack intelligent traffic management system that analyses live traffic videos across 4 intersection lanes and dynamically adjusts signal timing using AI. Unlike traditional fixed-timing systems (60s per lane), SmartTraffic allocates green time based on real-time vehicle count, density, speed, congestion level, and vehicle type composition — resulting in measurable cycle time reductions and efficiency improvements.

The system was developed as a Final Year Project and demonstrates:
- Real-time vehicle detection and classification using **YOLOv8n + DeepSORT**
- Adaptive signal timing via a **Fuzzy Logic controller** (replaces rule-based thresholds)
- **Inter-lane cycle coordination** — all 4 lanes compete for a shared 120s cycle based on continuous priority scores
- Priority classification using a trained **Random Forest model**
- **Multi-lane emergency scenario system** with severity-based decision engine
- Live dashboard, analytics comparison, and AI signal simulation with type-accurate vehicle spawning

---

## Features

| Feature | Description |
|---|---|
| 🎥 **Video Upload** | Upload MP4/AVI/MOV/MKV traffic videos per lane with file validation and size reporting |
| 🤖 **AI Detection** | YOLOv8n detects cars, motorcycles, buses, trucks per frame (COCO classes 2, 3, 5, 7) |
| 🔁 **Vehicle Tracking** | DeepSORT tracks individual vehicles across frames with consistent IDs |
| 🔀 **Fuzzy Logic Timing** | scikit-fuzzy controller produces smooth, continuous green time (10–60s) per lane |
| ⚖️ **Inter-lane Coordination** | 120s shared cycle distributed proportionally by priority score across all 4 lanes |
| 🧠 **Priority Model** | Random Forest classifies lane priority (Low / Medium / High) with rule-based safety override |
| 🚗 **Vehicle Classification** | Real-time Car/Motorcycle/Bus/Truck counts synced between backend detection and canvas simulation |
| 🚨 **Emergency Scenarios** | Multi-lane emergency panel — Ambulance, Fire Truck, Police, VIP Convoy with 25+ scenarios and severity ranking |
| 📊 **Live Dashboard** | Real-time lane stats, vehicle type breakdown, congestion monitoring, emergency alerts |
| 📈 **Analytics** | On-demand Traditional vs AI comparison charts + performance metrics table + PDF export |
| 🚦 **AI Simulation** | Canvas intersection with type-accurate vehicles, fuzzy + coordinated signal timing, decision log |
| 💾 **Supabase Storage** | Auto-saves lane stats every 5s including type counts, emergency log, comparison results |
| 🔐 **Authentication** | Supabase Auth (email/password login and registration) |

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Frontend (React 18 + Vite)                   │
│  Dashboard │ Upload │ Analytics │ Simulation │ Emergency │ Landing  │
└─────────────────────────┬───────────────────────────────────────────┘
                          │ HTTP / MJPEG stream / poll every 3s
┌─────────────────────────▼───────────────────────────────────────────┐
│                         Flask API (Python)                          │
│                                                                     │
│  /api/live-stats        /api/coordination    /api/stream-local      │
│  /api/vehicle-type-summary  /api/emergency   /api/model-metrics     │
│  /api/comparison        /api/performance     /api/snapshot          │
│  /api/upload-video      /api/start-analysis  /api/stop-analysis     │
│                                                                     │
│  Rate Limiter (per-IP) │ CORS │ Auto-save thread (5s)               │
└────────┬────────────────────────────┬───────────────────────────────┘
         │                            │
┌────────▼────────────────┐  ┌────────▼──────────────────┐
│     AI Pipeline         │  │    Supabase (PostgreSQL)  │
│  YOLOv8n (detection)    │  │  lane_status              │
│  DeepSORT (tracking)    │  │  emergency_log            │
│  Fuzzy Logic (timing)   │  │  comparison_results       │
│  Random Forest (priority│  │  video                    │
│  Coordination Engine    │  └───────────────────────────┘
│  Emergency Detection    │
└─────────────────────────┘
```

---

## Tech Stack

### Backend
| Technology | Version | Purpose |
|---|---|---|
| Python | 3.10+ | Backend runtime |
| Flask | 2.x | REST API + MJPEG streaming |
| YOLOv8n | ultralytics | Vehicle detection (4 classes) |
| DeepSORT Realtime | latest | Multi-object tracking |
| scikit-fuzzy | 0.5+ | Fuzzy logic green time controller |
| scikit-learn | latest | Random Forest priority model |
| OpenCV (headless) | 4.x | Video processing |
| Supabase Python | latest | Database client |
| pandas / numpy | latest | Data processing |
| python-dotenv | latest | Environment variable loading |

### Frontend
| Technology | Version | Purpose |
|---|---|---|
| React | 18 | UI framework |
| TypeScript | 5 | Type safety |
| Vite | 5 | Build tool |
| Tailwind CSS | 3 | Styling |
| Chart.js / react-chartjs-2 | latest | Analytics bar charts |
| Motion (Framer) | latest | Page animations |
| Lucide React | latest | Icons |
| Supabase JS | latest | Auth + DB client |

### Database
| Service | Tables | Purpose |
|---|---|---|
| Supabase (PostgreSQL) | `lane_status` | Per-lane stats including type counts, fuzzy/coordinated green, priority score |
| | `emergency_log` | Historical emergency detections |
| | `comparison_results` | AI vs Traditional comparison data |
| | `video` | Uploaded video metadata |

---

## Project Structure

```
smarttraffic/
├── backend/
│   ├── app.py                          # Flask API - main entry point
│   ├── .env.local                      # Supabase credentials (not committed)
│   ├── uploads/                        # Uploaded video files
│   └── model/
│       ├── yolov8n.pt                  # YOLOv8 nano weights
│       ├── traffic A.mp4               # Lane A default video
│       ├── traffic B.mp4               # Lane B default video
│       ├── traffic C.mp4               # Lane C default video
│       ├── traffic D.mp4               # Lane D default video
│       ├── model_output/
│       │   ├── congestion_model.pkl    # Trained Random Forest model
│       │   └── training_data.csv       # Training dataset
│       ├── comparison_output/
│       │   ├── comparison_table.csv    # AI vs Traditional results
│       │   ├── performance_metrics.csv # Summary metrics (5 rows)
│       │   └── bar_chart.png           # Pre-generated chart image
│       └── emergency_output/
│           └── emergency_log.csv
│
└── frontend/
    ├── src/
    │   ├── pages/
    │   │   ├── LandingPage.tsx         # Landing / home page
    │   │   ├── AuthPage.tsx            # Login + registration
    │   │   ├── DashboardHome.tsx       # Live monitoring dashboard
    │   │   ├── UploadPage.tsx          # Video upload + MJPEG stream view
    │   │   ├── AnalyticsPage.tsx       # On-demand AI vs Traditional charts
    │   │   ├── SimulationPage.tsx      # Canvas intersection simulation
    │   │   └── FeedbackPage.tsx        # User feedback form
    │   ├── components/
    │   │   ├── Card.tsx
    │   │   ├── Badge.tsx
    │   │   ├── Button.tsx
    │   │   ├── DashboardLayout.tsx
    │   │   └── TrafficLightIcon.tsx
    │   ├── App.tsx                     # Root — routing + hasData shared state
    │   ├── types.ts
    │   └── utils.ts
    ├── package.json
    └── vite.config.ts
```

---

## Prerequisites

- Python **3.10+**
- Node.js **18+**
- Traffic videos — MP4/AVI/MOV/MKV files for each lane placed in `backend/model/`
- Supabase project with the required credential keys needed

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/yourusername/smarttraffic.git
cd smarttraffic
```

### 2. Backend setup

```bash
cd backend
pip install flask flask-cors ultralytics deep-sort-realtime \
  opencv-python-headless supabase pandas numpy scikit-learn \
  scikit-fuzzy joblib python-dotenv werkzeug
```

> ⚠️ Use `opencv-python-headless` not `opencv-python` — servers have no display.
> `scikit-fuzzy` is required for the fuzzy logic green time controller.

### 3. Frontend setup

```bash
cd frontend
npm install
```

---

## Configuration

### Backend — `.env.local` inside `backend/`

```env
PROJECT_URL=https://your-project.supabase.co
PUBLISHABLE_KEY=your-supabase-anon-key
```

### Frontend — `.env` inside `frontend/`

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
VITE_API_URL=http://127.0.0.1:5000
```

> For production deployment, set `VITE_API_URL` to your Railway backend URL.

---

## Running the Project

### 1. Start the Flask backend

```bash
cd backend
python app.py
```

Flask runs on `http://127.0.0.1:5000`

### 2. Start the React frontend

```bash
cd frontend
npm run dev
```

Frontend runs on `http://localhost:5173`

> ⚠️ Start Flask **before** the frontend. Both must run simultaneously.

## Screenshots

## Known Limitations

| Limitation | Notes |
|---|---|
| No dedicated ambulance YOLO class | YOLOv8n (COCO) detects no ambulance class as emergency detection uses a large Bus-class size heuristic (> 25% of frame) |
| Speed calibration | `PIXELS_PER_METER = 8.0` is fixed as accuracy varies with camera angle and height |
| Single intersection | System is designed for a 4-lane single intersection; multi-intersection support would require architectural changes |

---

## License

This project is developed as a prototype product for academic purposes of Final Year Project.

Author : Kenny Khow Jiun Xian | Faculty of Artificial Intelligence and Cybersecurity (FAIX) | University Technical Malaysia Melacca (UTeM)


