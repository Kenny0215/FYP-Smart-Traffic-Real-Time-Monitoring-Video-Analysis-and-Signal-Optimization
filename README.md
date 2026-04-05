# 🚦 SmartTraffic AI: Real-Time Traffic Monitoring And Simulation Based Adaptive Signal Optimization

> **Final Year Project (FYP)**
> AI-powered adaptive traffic signal control system with fuzzy logic, inter-lane coordination, real-time vehicle classification, and multi-lane emergency scenario management.

---

## 📋 Table of Contents

- [Overview](#overview)
- [What's New in v4.5](#whats-new-in-v45)
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

### Backend (`app.py`)
| Change | Details |
|---|---|
| **Fuzzy Logic Controller** | Replaced hard `if/else` green time formula with `scikit-fuzzy` controller. Inputs: vehicle count, avg speed, heavy ratio. Output: smooth 10–60s green time. Thread-safe with `_fuzzy_lock`. |
| **Inter-lane Coordination** | `coordinate_green_times()` distributes a shared 120s cycle across all 4 lanes proportionally by priority score (0–100). High-congestion lanes take time from low-congestion lanes. |
| **Continuous Priority Score** | `calculate_priority_score()` replaces Low/Medium/High label for coordination. Weighted formula: vehicle count × 2.5 + density × 15 + heavy ratio × 20 + speed factor × 15 + congestion tier × 25. |
| **Vehicle Type Classification Fix** | `vehicle_types` (Car/Motorcycle/Bus/Truck) now sourced from **DeepSort confirmed tracks** — not raw YOLO boxes. Ensures `Car + Motorcycle + Bus + Truck == vehicle_count` always. |
| **New Fields in `lane_stats`** | `coordinated_green`, `priority_score`, `vehicle_types`, `dominant_vehicle_type` added to shared state and Supabase auto-save. |
| **New Endpoints** | `/api/coordination` — full cycle breakdown per lane. `/api/vehicle-type-summary` — aggregated type counts across all lanes. `/api/model-metrics` — RF model accuracy, F1, confusion matrix, feature importances. `/api/snapshot/<lane_key>` — single JPEG frame capture. |

### Frontend — Dashboard (`DashboardHome.tsx`)
| Change | Details |
|---|---|
| **Vehicle Category Breakdown** | New card showing live Car/Motorcycle/Bus/Truck counts with percentage bars and per-lane breakdown table. |
| **Lane Cards — Monitoring Only** | Removed Fuzzy/Coordinated/Priority Score bars from lane cards. Dashboard is now pure real-time monitoring — signal details belong to Simulation page. |
| **Vehicle Type Badges** | Each lane card shows inline type mini-badges for detected vehicle categories. |

### Frontend — Simulation (`SimulationPage.tsx`)
| Change | Details |
|---|---|
| **Score-based Round-robin** | `sortByScore()` replaces `RF_W` label sort. Lanes ordered by continuous `priority_score` — finer granularity than Low/Medium/High. |
| **Coordinated Green Timing** | Simulation uses `coordinated_green` (inter-lane allocated time) as signal duration, not just fuzzy `green_time`. |
| **Type-accurate Vehicle Spawning** | Canvas vehicles now spawn to **exactly match `vehicle_count`** from backend detection, split by `vehicle_types` ratio. Car (teal), Motorcycle (amber/small), Bus (blue/large), Truck (orange/large). Excess vehicles removed when count drops. |
| **Multi-lane Emergency Scenarios** | Full emergency system with 4 vehicle types × multiple scenarios per type. |
| **Severity Ranking Engine** | `SEVERITY_RANK × 10 + VEHICLE_TYPE_RANK` — Ambulance Critical (44) beats Police Critical (42). Highest-rank emergency wins the signal each cycle. |
| **Queue-based Panel** | Users build a staged list of entries (different lane + vehicle type + scenario each), then confirm all at once. Fixed modal overlay — no scroll clipping. |
| **Active Emergency Banner** | Shows all active emergencies sorted by rank with `▲ HIGHEST PRIORITY` indicator. Individual and "Clear All" controls. |

### Frontend — Analytics (`AnalyticsPage.tsx`)
| Change | Details |
|---|---|
| **On-demand Generation** | Analytics no longer auto-loads on page open. User must click **Generate Report** first. Three states: `idle → loading → ready`. |
| **Regenerate Button** | When data is loaded, a Regenerate button allows re-fetching after a new analysis run. |

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
| 🛡️ **Rate Limiting** | Per-IP sliding window rate limiter on all API endpoints |
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
│                    Flask API v4.5 (Python)                          │
│                                                                     │
│  /api/live-stats        /api/coordination    /api/stream-local      │
│  /api/vehicle-type-summary  /api/emergency   /api/model-metrics     │
│  /api/comparison        /api/performance     /api/snapshot          │
│  /api/upload-video      /api/start-analysis  /api/stop-analysis     │
│                                                                     │
│  Rate Limiter (per-IP) │ CORS │ Auto-save thread (5s)              │
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
│   ├── app.py                          # Flask API v4.5 — main entry point
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
- Supabase project with the required tables created

### Supabase Tables Required

```sql
-- lane_status
create table lane_status (
  id                   bigserial primary key,
  lane_name            text,
  frame                integer,
  vehicle_count        integer,
  density              float,
  heavy_ratio          float,
  avg_speed            float,
  congestion           text,
  ai_green_time        float,
  coordinated_green    float,
  priority_score       float,
  priority_level       text,
  car_count            integer,
  motorcycle_count     integer,
  bus_count            integer,
  truck_count          integer,
  dominant_vehicle_type text,
  timestamp            timestamptz
);

-- emergency_log
create table emergency_log (
  id           bigserial primary key,
  vehicle_type text,
  lane         text,
  action       text,
  frame        integer,
  timestamp    timestamptz
);

-- comparison_results
create table comparison_results (
  id                     bigserial primary key,
  lane                   text,
  avg_vehicles           float,
  traditional_green      float,
  ai_green               float,
  ideal_green            float,
  traditional_efficiency float,
  ai_efficiency          float,
  improvement            float,
  traditional_wait       float,
  ai_wait                float,
  timestamp              timestamptz
);

-- video
create table video (
  id          bigserial primary key,
  lane_name   text,
  file_name   text,
  file_size   float,
  format      text,
  upload_date timestamptz
);
```

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

On startup it:
- Loads YOLOv8n model
- Loads `congestion_model.pkl` (Random Forest)
- Builds the fuzzy logic controller (scikit-fuzzy)
- Starts 4 lane processing threads (daemon)
- Starts auto-save thread (writes to Supabase every 5s)

### 2. Start the React frontend

```bash
cd frontend
npm run dev
```

Frontend runs on `http://localhost:5173`

> ⚠️ Start Flask **before** the frontend. Both must run simultaneously.

---

## API Endpoints

### Live Data

| Method | Endpoint | Rate Limit | Description |
|---|---|---|---|
| `GET` | `/api/health` | 30/min | Health check — YOLO + RF model + stream status |
| `GET` | `/api/live-stats` | 60/min | Live stats for all 4 lanes including `vehicle_types`, `coordinated_green`, `priority_score` |
| `GET` | `/api/live-stats/<lane_key>` | 60/min | Live stats for one specific lane |
| `GET` | `/api/coordination` | 30/min | Full 120s cycle breakdown — fuzzy green, coordinated green, priority score per lane |
| `GET` | `/api/vehicle-type-summary` | 60/min | Aggregated Car/Motorcycle/Bus/Truck totals across all lanes |

### Streaming

| Method | Endpoint | Rate Limit | Description |
|---|---|---|---|
| `GET` | `/api/stream-local/<lane_key>` | 10/min | MJPEG video stream (multipart/x-mixed-replace) |
| `GET` | `/api/snapshot/<lane_key>` | 20/min | Single JPEG frame for a lane |

### Results & Analysis

| Method | Endpoint | Rate Limit | Description |
|---|---|---|---|
| `GET` | `/api/comparison` | 10/min | AI vs Traditional comparison (CSV → JSON) |
| `GET` | `/api/performance` | 10/min | 5-row summary metrics from `performance_metrics.csv` |
| `GET` | `/api/model-metrics` | — | RF model accuracy, F1, confusion matrix, feature importances |
| `GET` | `/api/chart` | 10/min | Pre-generated bar chart as base64 PNG |

### Emergency

| Method | Endpoint | Rate Limit | Description |
|---|---|---|---|
| `GET` | `/api/emergency` | 30/min | Live session emergency detections (current run only) |
| `GET` | `/api/emergency-history` | 10/min | Full historical emergency log from Supabase |

### Control

| Method | Endpoint | Rate Limit | Description |
|---|---|---|---|
| `POST` | `/api/upload-video` | 10/min | Upload video file for a lane |
| `POST` | `/api/start-analysis` | 5/min | Start YOLO processing threads |
| `POST` | `/api/stop-analysis` | 5/min | Stop analysis and reset all state |
| `POST` | `/api/save-lanes-csv` | 5/min | Save `training_data.csv` to Supabase `lane_status` |
| `POST` | `/api/save-comparison` | 5/min | Save `comparison_table.csv` to Supabase `comparison_results` |
| `POST` | `/api/save-emergency` | 5/min | Save `emergency_log.csv` to Supabase `emergency_log` |

---

## AI Modules

### Module 1 — Vehicle Detection (YOLOv8n)
Detects 4 vehicle classes from COCO: `Car (2)`, `Motorcycle (3)`, `Bus (5)`, `Truck (7)`. Runs every 2 frames (`PROCESS_EVERY_N = 2`) with a shared `yolo_lock` for thread safety across 4 concurrent lanes. Confidence threshold: 0.4.

### Module 2 — Vehicle Tracking (DeepSORT)
Tracks each detected vehicle across frames using `n_init=1` (immediate confirmation), `max_age=30`, `max_iou_distance=0.7`. A `last_boxes` cache redraws cached bounding boxes on non-detection frames to prevent flicker.

### Module 3 — Vehicle Classification
Vehicle type counts (Car/Motorcycle/Bus/Truck) are derived from **confirmed DeepSort tracks only** — not raw YOLO boxes. This ensures the sum of all type counts always equals `vehicle_count`. `track_type_counts` replaces the old `frame_type_counts`.

### Module 4 — Speed Estimation
Calculates speed in km/h from pixel displacement between confirmed track positions using `PIXELS_PER_METER = 8.0` calibration. Speed is sampled every `SPEED_SAMPLE_FRAMES = 5` frames for stability.

### Module 5 — Congestion Classification
Rule-based classification per lane:
- `High`: ≥ 15 vehicles (`CONG_HIGH`)
- `Medium`: ≥ 8 vehicles (`CONG_MEDIUM`)
- `Low`: < 8 vehicles

### Module 6 — Priority Prediction (Random Forest)
`congestion_model.pkl` takes `[vehicle_count, density, heavy_ratio, avg_speed, congestion_enc]` and predicts Low/Medium/High priority. A three-layer hybrid system:
1. Rule-based override — High congestion always → High priority (RF bypassed)
2. RF model with floor — Medium congestion → RF result floored at Medium
3. Pure RF — Low congestion → RF decides freely

### Module 7 — Fuzzy Logic Signal Timing *(new in v4.5)*
`scikit-fuzzy` controller replaces the hard `if/else` green time formula. Three inputs with triangular membership functions:
- `vehicle_count`: low (0–8), medium (5–17), high (13–30)
- `avg_speed`: slow (0–30), medium (20–70), fast (60–100)
- `heavy_ratio`: low (0–0.4), high (0.3–1.0)

Six fuzzy rules produce a continuous green time output (10–60s). A rule-based fallback (`_rule_based_green_time`) is used if fuzzy inference fails. Thread-safe via `_fuzzy_lock`.

### Module 8 — Inter-lane Coordination *(new in v4.5)*
`coordinate_green_times()` distributes a fixed `CYCLE_TIME = 120s` across all 4 lanes proportionally by `priority_score`. Each lane's `coordinated_green` = `(score / total_score) × 120`, clamped to `[MIN_GREEN, MAX_GREEN]`. This means high-congestion lanes take allocated time directly from low-congestion lanes.

Priority score formula: `vehicle_count × 2.5 + density × 15 + heavy_ratio × 20 + speed_factor × 15 + congestion_weight × 25`, capped at 100.

### Module 9 — Emergency Detection
Large Bus-class bounding boxes (width or height > 25% of frame) are flagged as potential ambulances using a size heuristic. Immediately overrides priority to `High` and extends green to `MAX_GREEN (60s)`. Only logged once per track ID per session.

---

## Pages Overview

### 🏠 Dashboard (`DashboardHome.tsx`)
Real-time monitoring only. Shows:
- Total vehicles, avg time saved, high congestion count, active signal
- **Vehicle Category Breakdown** card — live Car/Motorcycle/Bus/Truck counts with % bars and per-lane table
- Lane status cards — congestion badge, vehicle count, speed, AI green vs Traditional, vehicle type mini-badges
- Emergency alerts panel — live session detections with 30s window indicator

### 📹 Video Upload (`UploadPage.tsx`)
- Upload MP4/AVI/MOV/MKV per lane, start/stop analysis
- Live MJPEG stream view per lane
- `hasData` prop propagated to Dashboard and Simulation

### 📊 Analytics (`AnalyticsPage.tsx`)
- **On-demand only** — data loads when user clicks **Generate Report**
- 4 bar charts: Green Time, Signal Efficiency, Wait Time, Congestion Distribution
- Sortable comparison table with averages row
- Export to PDF (print-to-PDF via browser)
- Regenerate button to re-fetch after new analysis

### 🎮 Simulation (`SimulationPage.tsx`)
Canvas intersection with:
- **Type-accurate vehicle spawning** — exact `vehicle_count` from backend, split by `vehicle_types` ratio. Car (teal), Motorcycle (amber/small), Bus (blue/large with BUS label), Truck (orange with TRK label)
- **Coordinated signal timing** — uses `coordinated_green` (inter-lane) as actual signal duration
- **Score-based round-robin** — continuous priority score ordering (not just Low/Medium/High)
- **Emergency scenario system** — queue-based modal (Step 1: Vehicle Type, Step 2: Scenario, Step 3: Lane). 4 vehicle types, 25 scenarios. Staged entries, confirm all at once.
- **Severity ranking engine**: `SEVERITY_RANK × 10 + VEHICLE_TYPE_RANK` — Ambulance Critical (44) > Police Critical (42) > Ambulance High (34)
- Speed control: 1×, 2×, 4×
- Decision log showing score-based ordering and emergency overrides

#### Emergency Vehicle Types & Scenarios

| Vehicle | Scenarios |
|---|---|
| 🚑 Ambulance | Cardiac Arrest, Near Death, Stroke/Brain, Broken Bone, Leg Broken, Head Injury, Chest Pain, Minor Injury |
| 🚒 Fire Truck | Building Fire, Gas Explosion, Vehicle Fire, Forest Fire, Small Fire, Rescue Operation |
| 🚓 Police | Active Chase, Armed Robbery, Hostage Situation, Accident Response, Crowd Control, Routine Patrol |
| 🚐 VIP Convoy | Head of State, State Minister, Diplomatic Visit, Medical Transfer, Celebrity/Event |

### 📈 Analytics — Signal Comparison
Compares AI adaptive system against traditional fixed 60s timing across all 4 lanes. Metrics: green time, wait time, efficiency %, improvement %. Data sourced from `comparison_table.csv` with Supabase fallback.

---

## Known Limitations

| Limitation | Notes |
|---|---|
| No dedicated ambulance YOLO class | YOLOv8n (COCO) detects no ambulance class — emergency detection uses a large Bus-class size heuristic (> 25% of frame) |
| Speed calibration | `PIXELS_PER_METER = 8.0` is fixed — accuracy varies with camera angle and height |
| Simulation vs real signal | Canvas simulation runs its own signal cycle engine — it does not directly control real-world signals |
| Single intersection | System is designed for a 4-lane single intersection; multi-intersection support would require architectural changes |

---

## License

This project is developed for academic purposes as a Final Year Project (FYP).

---

*SmartTraffic AI — FYP v4.5 | Built with Flask · React · YOLOv8 · scikit-fuzzy · Supabase*
