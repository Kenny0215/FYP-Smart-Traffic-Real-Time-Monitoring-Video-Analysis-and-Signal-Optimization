import express from "express";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // API routes
  app.get("/api/live-stats", (req, res) => {
    // Generate some dynamic mock data
    const lanes = ["Lane A", "Lane B", "Lane C", "Lane D"];
    const priorities = ["High", "Medium", "Low", "Low"];
    
    // Shuffle priorities for variety
    const shuffledPriorities = [...priorities].sort(() => Math.random() - 0.5);

    const data = lanes.map((lane, index) => {
      const count = Math.floor(Math.random() * 150);
      let congestion = "Low";
      let aiGreenTime = 20;

      if (count > 100) {
        congestion = "High";
        aiGreenTime = 40 + Math.floor(Math.random() * 20);
      } else if (count > 50) {
        congestion = "Medium";
        aiGreenTime = 20 + Math.floor(Math.random() * 20);
      } else {
        aiGreenTime = 10 + Math.floor(Math.random() * 10);
      }

      return {
        lane,
        vehicle_count: count,
        congestion,
        ai_green_time: aiGreenTime,
        priority: shuffledPriorities[index],
        avg_speed: 30 + Math.floor(Math.random() * 40),
        timestamp: new Date().toISOString()
      };
    });

    res.json(data);
  });

  app.get("/api/summary", (req, res) => {
    res.json({
      efficiency_improvement: "56.7% → 90.4% (+33.8%)",
      cycle_time_reduction: "240s → 155s (-35.4%)",
      green_time_saved: "60s → 39s (-21s)"
    });
  });

  app.get("/api/emergency", (req, res) => {
    // Randomly generate an emergency occasionally
    const emergencies = [];
    if (Math.random() > 0.7) {
      const types = ['ambulance', 'fire truck', 'police'];
      const lanes = ['Lane A', 'Lane B', 'Lane C', 'Lane D'];
      emergencies.push({
        id: Math.random().toString(36).substr(2, 9),
        type: types[Math.floor(Math.random() * types.length)],
        lane: lanes[Math.floor(Math.random() * lanes.length)],
        timestamp: new Date().toISOString()
      });
    }
    res.json(emergencies);
  });

  app.get("/api/comparison", (req, res) => {
    const data = [
      {
        lane: "Lane A",
        avg_vehicles: 112,
        congestion: "High",
        traditional_green: 60,
        ai_green: 28,
        ideal_green: 30,
        traditional_efficiency: "50.0%",
        ai_efficiency: "96.7%",
        improvement: "+46.7%",
        traditional_wait: 180,
        ai_wait: 127
      },
      {
        lane: "Lane B",
        avg_vehicles: 85,
        congestion: "Medium",
        traditional_green: 60,
        ai_green: 54,
        ideal_green: 49,
        traditional_efficiency: "81.7%",
        ai_efficiency: "91.7%",
        improvement: "+10.0%",
        traditional_wait: 180,
        ai_wait: 101
      },
      {
        lane: "Lane C",
        avg_vehicles: 42,
        congestion: "Low",
        traditional_green: 60,
        ai_green: 16,
        ideal_green: 13,
        traditional_efficiency: "21.7%",
        ai_efficiency: "95.0%",
        improvement: "+73.3%",
        traditional_wait: 180,
        ai_wait: 139
      },
      {
        lane: "Lane D",
        avg_vehicles: 98,
        congestion: "Medium",
        traditional_green: 60,
        ai_green: 57,
        ideal_green: 44,
        traditional_efficiency: "73.3%",
        ai_efficiency: "78.3%",
        improvement: "+5.0%",
        traditional_wait: 180,
        ai_wait: 98
      }
    ];
    res.json(data);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
