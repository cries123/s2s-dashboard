import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

// Middleware
app.use(express.json({ limit: '10mb' }));

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
    const { pdfBase64 } = req.body;

    if (!pdfBase64) {
      return res.status(400).json({ error: "Missing PDF data" });
    }

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview", 
      contents: [
        {
          inlineData: {
            mimeType: "application/pdf",
            data: pdfBase64,
          },
        },
        {
          text: `Extract all service appointments from this report. 
          Categorize each appointment based on the following strict rules:
          1. OIL CHANGE: If the services include 'PERFORM FULL SYNTHETIC OIL & FILTER CHANGE'.
          2. RECALL: If the services include 'RECALL' or 'CAMPAIGN'.
          3. DIAGNOSIS: If the services or notes include 'CUSTOMER STATES' or 'CUST REQ' for specific issues (like sputtering, noise, etc).
          4. MISC: Any other appointment that doesn't fit the above.

          Count the number of appointments in each category.
          Return ONLY a JSON object with the following structure:
          {
            "diagnosis": number,
            "oilChange": number,
            "recall": number,
            "misc": number,
            "total": number
          }`,
        },
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
      },
    });

    try {
      const data = JSON.parse(response.text || "{}");
      res.json(data);
    } catch (parseError) {
      console.error("Gemini Parse Error:", response.text);
      res.status(500).json({ error: "Failed to parse model output" });
    }
  } catch (error) {
    console.error("Gemini API Error:", error);
    res.status(500).json({ error: "Failed to process PDF with AI" });
  }
});

app.post("/api/parse-performance", async (req, res) => {
  try {
    const { pdfBase64 } = req.body;

    if (!pdfBase64) {
      return res.status(400).json({ error: "Missing PDF data" });
    }

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          inlineData: {
            mimeType: "application/pdf",
            data: pdfBase64,
          },
        },
        {
          text: `Extract the Advisor Performance / Productivity metrics from this report. 

          DOCUMENT CONTEXT: This is a Service Advisor Productivity report (typically from CDK, Reynolds, or Dealertrack). 
          It contains columns for Advisors and their financial performance.

          EXTRACTION RULES (CRITICAL):
          1. DISTINGUISH BETWEEN SALES AND GROSS:
             - 'SALES' is Revenue.
             - 'GROSS' is Profit (Sales minus Cost).
          2. FIND THE 'SALE TYPE' SUMMARY TABLE (MANDATORY FOR TOTALS):
             - Look for a table with rows 'Parts', 'Labor', 'Sublet', 'Total'.
             - For 'totalLabor': Use the 'Sales' value from the 'Labor' row.
             - For 'totalGross': Use the 'Gross' value from the 'Labor' row.
             - For 'totalParts': Use the 'Sales' value from the 'Parts' row.
             - For 'totalGrossParts': Use the 'Gross' value from the 'Parts' row.
             - For 'totalSales': Use the 'Sales' value from the 'Total' row.
          3. HANDLING ADVISORS:
             - Find the individual advisor sections or table.
             - Extract soCount, hrsSold, laborSold, grossLabor, partsSold, grossParts for each advisor.

          For each Advisor:
          - name, soCount, hrsSold, laborSold, grossLabor, partsSold, grossParts, totalSales, gpPercent, elr.

          Return ONLY JSON:
          {
            "advisors": [{ "name": string, "soCount": number, "hrsSold": number, "laborSold": number, "grossLabor": number, "partsSold": number, "grossParts": number, "totalSales": number, "gpPercent": number, "elr": number }],
            "totals": { "totalSales": number, "totalLabor": number, "totalGross": number, "totalParts": number, "totalGrossParts": number, "totalHrs": number, "avgGp": number }
          }`,
        },
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
                  upsells: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        code: { type: Type.STRING },
                        description: { type: Type.STRING },
                        count: { type: Type.NUMBER },
                        revenue: { type: Type.NUMBER },
                      },
                    },
                  },
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
      },
    });

    try {
      const data = JSON.parse(response.text || "{}");
      res.json(data);
    } catch (parseError) {
      console.error("Gemini Performance Parse Error:", response.text);
      res.status(500).json({ error: "Failed to parse performance output" });
    }
  } catch (error) {
    console.error("Gemini Performance API Error:", error);
    res.status(500).json({ error: "Failed to process Performance PDF" });
  }
});

async function startServer() {
  // Vite middleware for development
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
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
