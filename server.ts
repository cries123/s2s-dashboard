import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware
  app.use(express.json({ limit: '50mb' }));

  // Gemini Initialization
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
  
  // API Routes
  app.post("/api/parse-appointments", async (req, res) => {
    try {
      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ error: "GEMINI_API_KEY is not defined" });
      }

      const { pdfBase64 } = req.body;
      if (!pdfBase64) return res.status(400).json({ error: "Missing PDF" });

      const model = genAI.getGenerativeModel({ 
        model: "gemini-2.0-flash",
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: SchemaType.OBJECT,
            properties: {
              diagnosis: { type: SchemaType.NUMBER },
              oilChange: { type: SchemaType.NUMBER },
              recall: { type: SchemaType.NUMBER },
              misc: { type: SchemaType.NUMBER },
              total: { type: SchemaType.NUMBER },
            },
            required: ["diagnosis", "oilChange", "recall", "misc", "total"],
          },
        }
      });

      const result = await model.generateContent([
        {
          inlineData: {
            mimeType: "application/pdf",
            data: pdfBase64,
          },
        },
        "Extract appointment summary from this PDF."
      ]);

      res.json(JSON.parse(result.response.text()));
    } catch (error: any) {
      console.error("API Error:", error);
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

      const model = genAI.getGenerativeModel({ 
        model: "gemini-2.0-flash",
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: SchemaType.OBJECT,
            properties: {
              advisors: {
                type: SchemaType.ARRAY,
                items: {
                  type: SchemaType.OBJECT,
                  properties: {
                    name: { type: SchemaType.STRING },
                    soCount: { type: SchemaType.NUMBER },
                    hrsSold: { type: SchemaType.NUMBER },
                    laborSold: { type: SchemaType.NUMBER },
                    grossLabor: { type: SchemaType.NUMBER },
                    partsSold: { type: SchemaType.NUMBER },
                    grossParts: { type: SchemaType.NUMBER },
                    totalSales: { type: SchemaType.NUMBER },
                    gpPercent: { type: SchemaType.NUMBER },
                    elr: { type: SchemaType.NUMBER },
                  },
                  required: ["name", "soCount", "laborSold", "grossLabor"],
                },
              },
              totals: {
                type: SchemaType.OBJECT,
                properties: {
                  totalSales: { type: SchemaType.NUMBER },
                  totalLabor: { type: SchemaType.NUMBER },
                  totalGross: { type: SchemaType.NUMBER },
                  totalParts: { type: SchemaType.NUMBER },
                  totalGrossParts: { type: SchemaType.NUMBER },
                  totalHrs: { type: SchemaType.NUMBER },
                  avgGp: { type: SchemaType.NUMBER },
                },
                required: ["totalSales", "totalGross"],
              },
            },
            required: ["advisors", "totals"],
          },
        }
      });

      const result = await model.generateContent([
        {
          inlineData: {
            mimeType: "application/pdf",
            data: pdfBase64,
          },
        },
        "Extract performance summary from this PDF."
      ]);

      res.json(JSON.parse(result.response.text()));
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
