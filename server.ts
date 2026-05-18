import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware
  app.use(express.json({ limit: '50mb' }));

  // Gemini Initialization
  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });

  // API Routes
  app.post("/api/parse-appointments", async (req, res) => {
    try {
      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ error: "GEMINI_API_KEY is not defined" });
      }

      const { pdfBase64 } = req.body;
      if (!pdfBase64) return res.status(400).json({ error: "Missing PDF" });

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            inlineData: {
              mimeType: "application/pdf",
              data: pdfBase64,
            },
          },
          "Extract appointment summary from this PDF. Provide a breakdown of diagnosis, oil changes, recalls, and misc counts. Return JSON."
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              diagnosis: { type: Type.NUMBER },
              oilChange: { type: Type.NUMBER },
              recall: { type: Type.NUMBER },
              misc: { type: Type.NUMBER },
              total: { type: Type.NUMBER },
            },
            required: ["diagnosis", "oilChange", "recall", "misc", "total"],
          },
        }
      });

      const text = response.text;
      if (!text) throw new Error("Empty response from AI");
      res.json(JSON.parse(text));
    } catch (error: any) {
      console.error("API Error Appointments:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/parse-performance", async (req, res) => {
    try {
      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ error: "GEMINI_API_KEY is not defined" });
      }

      const { pdfBase64 } = req.body;
      if (!pdfBase64) return res.status(400).json({ error: "Missing PDF" });

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            inlineData: {
              mimeType: "application/pdf",
              data: pdfBase64,
            },
          },
          "Extract performance summary from this PDF. Return advisor breakdown and MTD totals. Return JSON."
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              advisors: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    soCount: { type: Type.NUMBER },
                    hrsSold: { type: Type.NUMBER },
                    laborSold: { type: Type.NUMBER },
                    grossLabor: { type: Type.NUMBER },
                    partsSold: { type: Type.NUMBER },
                    grossParts: { type: Type.NUMBER },
                    totalSales: { type: Type.NUMBER },
                    gpPercent: { type: Type.NUMBER },
                    elr: { type: Type.NUMBER },
                  },
                  required: ["name", "soCount", "laborSold", "grossLabor"],
                },
              },
              totals: {
                type: Type.OBJECT,
                properties: {
                  totalSales: { type: Type.NUMBER },
                  totalLabor: { type: Type.NUMBER },
                  totalGross: { type: Type.NUMBER },
                  totalParts: { type: Type.NUMBER },
                  totalGrossParts: { type: Type.NUMBER },
                  totalHrs: { type: Type.NUMBER },
                  avgGp: { type: Type.NUMBER },
                },
                required: ["totalSales", "totalGross"],
              },
            },
            required: ["advisors", "totals"],
          },
        }
      });

      const text = response.text;
      if (!text) throw new Error("Empty response from AI");
      res.json(JSON.parse(text));
    } catch (error: any) {
      console.error("API Error Performance:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Serve static files / Vite
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
