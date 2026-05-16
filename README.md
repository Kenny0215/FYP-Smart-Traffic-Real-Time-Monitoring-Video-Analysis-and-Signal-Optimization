# 🚦 Smart Traffic AI
### Real-Time Traffic Monitoring & Adaptive Signal Control Decision

> **Final Year Project (FYP) — Kenny Khow Jiun Xian**  
> Faculty of Artificial Intelligence and Cybersecurity (FAIX)  
> Universiti Teknikal Malaysia Melaka (UTeM)

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
- [Role-Based Access](#role-based-access)
- [Violation Detection](#violation-detection)
- [Known Limitations](#known-limitations)

---

## Overview

SmartTraffic AI is a full-stack intelligent traffic management system that analyses uploaded traffic videos across 4 intersection lanes and dynamically adjusts signal timing using AI. Unlike traditional fixed-timing systems, SmartTraffic allocates green time based on real-time vehicle count, density, speed, congestion level, and vehicle type composition — resulting in measurable cycle time reductions and efficiency improvements.

The system includes a **dual-role platform**: a user-facing dashboard for traffic analysis and an admin control center for complaint management, user administration, and feedback review.

---

## Features

### User Features
| Feature | Description |
|---|---|
| 🎥 **Video Upload** | Upload MP4/AVI/MOV per lane with validation — processing starts only after clicking Start AI Analysis |
| 🤖 **YOLO Detection** | YOLOv8n detects Cars, Motorcycles, Buses, Trucks per frame |
| 🔁 **DeepSORT Tracking** | Tracks individual vehicles across frames with consistent IDs and speed estimation |
| 🔀 **Fuzzy Logic Timing** | scikit-fuzzy controller produces smooth green time (10–60s) per lane |
| ⚖️ **Inter-lane Coordination** | 120s shared cycle distributed proportionally by priority score |
| 🧠 **Random Forest Priority** | Classifies lane priority (Low / Medium / High) with rule-based safety override |
| 🚨 **Emergency Detection** | Large Bus-class heuristic triggers emergency override and extends green time |
| 📊 **Live Dashboard** | Real-time lane stats, vehicle type breakdown, congestion monitoring |
| 📈 **Analytics** | Traditional vs AI comparison charts + performance metrics + PDF export |
| 🚦 **AI Simulation** | Canvas intersection with type-accurate vehicles and fuzzy signal timing |
| 💬 **Traffic Chatbox** | AI-powered chatbot for traffic queries |
| ⭐ **Feedback** | Star rating + quality dropdown + comments submitted to database |

### Admin Features
| Feature | Description |
|---|---|
| 🛡️ **Complaint Management** | View all auto-detected violations with snapshot evidence, filter by status/lane |
| ✅ **Approve / Dismiss** | Admin reviews each complaint, adds notes, approves or dismisses |
| 🗑️ **Clear All Complaints** | Bulk delete with confirmation dialog |
| 👥 **User Management** | View, add (US001 format) and delete user accounts |
| 📋 **Feedback Review** | View all user feedback with star breakdown, quality distribution, expandable comments |
| 📊 **Overview Stats** | Live complaint counts — today, pending, approved, dismissed with progress bars |

---

## System Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                     Frontend (React 18 + Vite + TypeScript)          │
│                                                                      │
│  User Role                          Admin Role                       │
│  ├── LandingPage                    ├── AdminDashboard               │
│  ├── AuthPage (login only)          │   ├── AdminOverview            │
│  ├── DashboardHome                  │   ├── AdminComplaints          │
│  ├── UploadPage (MJPEG streams)     │   ├── AdminTrafficMap          │
│  ├── AnalyticsPage                  │   ├── AdminUsers               │
│  ├── SimulationPage                 │   └── AdminFeedback            │
│  ├── ChatPage                       └────────────────────────────────│
│  └── FeedbackPage                                                    │
└──────────────────────────┬───────────────────────────────────────────┘
                           │ HTTP / MJPEG / fetch poll
┌──────────────────────────▼──────────────────────────────────────────┐
│                      Flask API (Python) — Modular                   │
│                                                                     │
│  routes/stats.py       → /api/live-stats, /api/signal-state         │
│  routes/analysis.py    → /api/upload-video, /api/start-analysis     │
│  routes/complaints.py  → /api/complaints, /api/complaints/stats     │
│  routes/emergency.py   → /api/emergency, /api/emergency-history     │
│  routes/data.py        → /api/comparison, /api/performance          │
│                                                                     │
│  core/detection.py     → YOLO + DeepSORT + violation detection      │
│  core/signal.py        → SignalController (green/yellow/red phases) │
│  core/anpr.py          → EasyOCR plate reading + complaint filing   │
│  core/state.py         → Shared queues, locks, stats, flags         │
└──────────┬───────────────────────────┬──────────────────────────────┘
           │                           │
┌──────────▼──────────────┐  ┌─────────▼──────────────────────────────┐
│     AI Pipeline         │  │         Supabase (PostgreSQL)          │
│  YOLOv8n (detection)    │  │  users            — user accounts      │
│  DeepSORT (tracking)    │  │  admins           — admin accounts     │
│  EasyOCR (plate OCR)    │  │  complaints       — violation records  │
│  Fuzzy Logic (timing)   │  │  feedback         — user ratings       │
│  Random Forest(priority)│  │  lane_status      — live lane data     │
│  SignalController       │  │  emergency_log    — emergency history  │
│  Violation Engine       │  │  comparison_results                    │
└─────────────────────────┘  │  Storage: snapshots bucket (images)    │
                             └────────────────────────────────────────┘
```

---

## Tech Stack

### Backend
| Technology | Purpose |
|---|---|
| Python 3.10+ | Backend runtime |
| Flask + Flask-CORS | REST API + MJPEG streaming |
| YOLOv8n (ultralytics) | Vehicle detection — Car, Motorcycle, Bus, Truck |
| DeepSORT Realtime | Multi-object tracking with persistent IDs |
| EasyOCR | License plate text recognition |
| scikit-fuzzy | Fuzzy logic green time controller |
| scikit-learn | Random Forest priority classification model |
| OpenCV (headless) | Video frame processing and annotation |
| Supabase Python SDK | Database + Storage client |
| pandas / numpy | Data processing |
| python-dotenv | Environment variable management |
| joblib | Model serialization |

### Frontend
| Technology | Purpose |
|---|---|
| React 18 + TypeScript | UI framework with type safety |
| Vite 5 | Build tool and dev server |
| Tailwind CSS | Utility-first styling |
| Framer Motion | Page and component animations |
| Lucide React | Icon library |
| Chart.js / react-chartjs-2 | Analytics charts |
| Supabase JS SDK | Database queries (custom auth tables) |

---

## Project Structure

```
smarttraffic/
├── backend/
│   ├── app.py                        # Entry point — registers blueprints only
│   ├── fuzzy_controller.py           # Fuzzy logic green time controller
│   ├── .env.local                    # Supabase credentials (not committed)
│   ├── uploads/                      # Uploaded video files
│   │
│   ├── core/
│   │   ├── __init__.py
│   │   ├── state.py                  # Shared state — queues, locks, flags
│   │   ├── signal.py                 # SignalController class
│   │   ├── detection.py              # process_lane(), YOLO, DeepSORT, violations
│   │   └── anpr.py                   # EasyOCR plate reader + complaint filing
│   │
│   ├── routes/
│   │   ├── __init__.py
│   │   ├── stats.py                  # Live stats, signal, coordination endpoints
│   │   ├── analysis.py               # Upload, start/stop analysis, stream
│   │   ├── complaints.py             # Complaint CRUD + stats
│   │   ├── emergency.py              # Emergency log endpoints
│   │   └── data.py                   # Comparison, performance, chart, CSV save
│   │
│   └── model/
│       ├── yolov8n.pt                # YOLOv8 nano weights
│       ├── model_output/
│       │   ├── congestion_model.pkl  # Trained Random Forest model
│       │   └── training_data.csv     # Training dataset
│       ├── comparison_output/
│       │   ├── comparison_table.csv
│       │   ├── performance_metrics.csv
│       │   └── bar_chart.png
│       └── emergency_output/
│           └── emergency_log.csv
│
└── frontend/
    └── src/
        ├── pages/
        │   ├── admin/
        │   │   ├── AdminDashboard.tsx
        │   │   ├── AdminOverview.tsx
        │   │   ├── AdminComplaints.tsx
        │   │   ├── AdminTrafficMap.tsx
        │   │   ├── AdminUsers.tsx
        │   │   └── AdminFeedback.tsx
        │   ├── LandingPage.tsx
        │   ├── AuthPage.tsx          # Login only — no self-register
        │   ├── DashboardHome.tsx
        │   ├── UploadPage.tsx
        │   ├── AnalyticsPage.tsx
        │   ├── SimulationPage.tsx
        │   ├── ChatPage.tsx
        │   └── FeedbackPage.tsx
        ├── components/
        │   ├── Card.tsx
        │   ├── Button.tsx
        │   ├── DashboardLayout.tsx
        │   ├── StreamImg.tsx         # Snapshot polling component (replaces MJPEG img)
        │   └── TrafficLightIcon.tsx
        ├── utils/
        │   └── formatId.ts           
        ├── App.tsx
        ├── types.ts
        └── utils.ts
```

> **Supabase Storage:** Create a public bucket named `snapshots` for violation evidence images.

---

## Prerequisites

- Python **3.12 or 3.12+**
- Node.js **18+**
- Supabase project (free tier works)
- Traffic video files (MP4/AVI/MOV) for testing

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
  opencv-python-headless easyocr supabase pandas numpy \
  scikit-learn scikit-fuzzy joblib python-dotenv werkzeug
```

> ⚠️ Use `opencv-python-headless` — servers have no display.  
> EasyOCR downloads language models on first run (~200MB).

### 3. Frontend setup

```bash
cd frontend
npm install
```

---

## Configuration

### Backend — `backend/.env.local`

```env
PROJECT_URL=https://your-project.supabase.co
PUBLISHABLE_KEY=your-supabase-service-role-key
```

> ⚠️ Use the **service role key** (not anon key) — required to bypass RLS for backend writes.

### Frontend — `frontend/.env`

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

### Supabase Setup

Run these in your Supabase SQL Editor:

```sql
-- Disable RLS on all tables (backend uses service role key)
ALTER TABLE users       DISABLE ROW LEVEL SECURITY;
ALTER TABLE admins      DISABLE ROW LEVEL SECURITY;
ALTER TABLE complaints  DISABLE ROW LEVEL SECURITY;
ALTER TABLE feedback    DISABLE ROW LEVEL SECURITY;
ALTER TABLE lane_status DISABLE ROW LEVEL SECURITY;

-- Insert your admin account
INSERT INTO admins (full_name, email, password)
VALUES ('Admin', 'admin@youremail.com', 'yourpassword');
```

---

## Running the Project

### 1. Start Flask backend

```bash
cd backend
python app.py
```

Flask runs on `http://127.0.0.1:5000`  
On startup: only signal controller and auto-save thread start.  
Video processing starts **only** when user uploads and clicks Start AI Analysis.

### 2. Start React frontend

```bash
cd frontend
npm run dev
```

Frontend runs on `http://localhost:3000`

> ⚠️ Start Flask before the frontend. Both must run simultaneously.

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/health` | Server + model status |
| GET | `/api/live-stats` | All lane stats |
| GET | `/api/live-stats/<lane_key>` | Single lane stats |
| GET | `/api/coordination` | Inter-lane coordination data |
| GET | `/api/signal-state` | Current signal phase detail |
| GET | `/api/vehicle-type-summary` | Vehicle type totals by lane |
| POST | `/api/upload-video` | Upload video file to server |
| POST | `/api/start-analysis` | Start YOLO processing threads |
| POST | `/api/stop-analysis` | Stop processing threads |
| GET | `/api/stream-local/<lane_key>` | MJPEG video stream |
| GET | `/api/snapshot/<lane_key>` | Latest JPEG frame |
| GET | `/api/complaints` | List complaints (filter by status) |
| GET | `/api/complaints/stats` | Complaint count summary |
| PATCH | `/api/complaints/<id>` | Update complaint status/notes |
| DELETE | `/api/complaints/clear-all` | Delete all complaints |
| GET | `/api/emergency` | Live emergency log |
| GET | `/api/emergency-history` | Historical emergency log |
| GET | `/api/comparison` | AI vs Traditional comparison |
| GET | `/api/performance` | Performance metrics |
| GET | `/api/model-metrics` | RF model accuracy stats |
| GET | `/api/chart` | Bar chart image (base64) |
| POST | `/api/save-lanes-csv` | Save CSV data to Supabase |
| POST | `/api/save-comparison` | Save comparison to Supabase |
| POST | `/api/save-emergency` | Save emergency log to Supabase |

---

## Role-Based Access

| Role | Login Table | Access |
|---|---|---|
| **User** | `users` | Dashboard, Upload, Analytics, Simulation, Chat, Feedback |
| **Admin** | `admins` | Admin Dashboard — Complaints, Users, Feedback, Traffic Map |

- Login page checks `admins` table first, then `users` table
- Users **cannot self-register** — admin creates accounts via User Management page
- Admin account is created directly in Supabase SQL Editor

---

## Violation Detection

The system detects 3 types of violations automatically during video analysis:

| Violation | Trigger Condition | Colour on Stream |
|---|---|---|
| **Red Light** | Speed ≥ 30 km/h on red signal for 5+ seconds | 🔴 Red |
| **Speeding** | Speed ≥ 80 km/h on any signal state | 🟠 Orange |
| **Overloaded Vehicle** | Bus/Truck bounding box width > 40% of frame | 🔴 Dark Red |

**Complaint pipeline:**
1. Violation confirmed → EasyOCR reads plate from bottom 40% of bounding box
2. UNKNOWN plates are **skipped** — only identifiable plates are filed
3. Annotated snapshot saved to Supabase Storage (`snapshots` bucket)
4. Complaint record inserted with status `pending`
5. Admin reviews in Complaints page → approves or dismisses

**Cooldown:** Each vehicle (`track_id`) can only file one complaint per red phase to prevent spam.

---

## Known Limitations

| Limitation | Notes |
|---|---|
| Plate OCR accuracy | EasyOCR on low-resolution CCTV footage is imperfect which UNKNOWN plates are skipped entirely |
| No ANPR camera | Real JPJ system uses dedicated IR plate cameras; this uses the same frame as vehicle detection |
| Speed calibration | `PIXELS_PER_METER = 8.0` is fixed — accuracy varies with camera angle and mounting height |
| Single intersection | Designed for 4-lane single intersection; multi-intersection needs architectural changes |
---

## License

This project is developed as a prototype for academic purposes (Final Year Project).

**Author:** Kenny Khow Jiun Xian  
**Faculty:** Faculty of Artificial Intelligence and Cybersecurity (FAIX)  
**University:** Universiti Teknikal Malaysia Melaka (UTeM)
