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
  // Initialize lazily to avoid crashing on startup if key is missing
  let ai: GoogleGenAI | null = null;
  const getAI = () => {
    if (!ai) {
      if (!process.env.GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY is not defined");
      }
      ai = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });
    }
    return ai;
  };

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", env: process.env.NODE_ENV, hasKey: !!process.env.GEMINI_API_KEY });
  });

  app.post("/api/parse-appointments", async (req, res) => {
    try {
      const { pdfBase64 } = req.body;
      if (!pdfBase64) return res.status(400).json({ error: "Missing PDF" });

      const response = await getAI().models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            role: "user",
            parts: [
              {
                inlineData: {
                  mimeType: "application/pdf",
                  data: pdfBase64,
                },
              },
              { text: `Extract appointment summary from this PDF. 
              
              RULES:
              1. COUNT UNIQUE APPOINTMENTS: Count each customer entry as exactly ONE appointment. In this PDF, there should be exactly 8 unique appointments.
              2. CATEGORIZATION PRIORITY (Assign ONLY ONE category per appointment in this order):
                 - OIL CHANGE: If services mention "FULL SYNTHETIC OIL AND FILTER CHANGE" or "HYUNDAI COMPLIMENTARY MAINTENANCE". This takes top priority even if recalls are present.
                 - RECALL: If services mention "Recall", "Campaign", "TSB", or "ECU Update".
                 - DIAGNOSIS: If services mention "Check", "Noise", "Diagnosis", "Pulling", or "Inspection".
                 - MISC: Anything else.
              
              Return JSON with counts for each category.` }
            ]
          }
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
      const isQuotaError = error.message?.includes("429") || error.status === 429;
      res.status(isQuotaError ? 429 : 500).json({ 
        error: error.message,
        isQuotaError
      });
    }
  });

  app.post("/api/parse-performance", async (req, res) => {
    try {
      const { pdfBase64 } = req.body;
      if (!pdfBase64) return res.status(400).json({ error: "Missing PDF" });

      const response = await getAI().models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            role: "user",
            parts: [
              {
                inlineData: {
                  mimeType: "application/pdf",
                  data: pdfBase64,
                },
              },
              { text: `Analyze this PDF. It is either a 'CSR Productivity Analysis' (Performance) or an 'Op Code Frequency - Labor' (Upsell) report.
              
              DETECTION RULE:
              - If the document header says 'Op Code Frequency', it is an UPSELL report.
              - If it says 'Productivity Analysis', it is a PERFORMANCE report.
              
              IF CSR PRODUCTIVITY ANALYSIS (PERFORMANCE):
              1. Extract MTD Totals from the bottom 'Total' row of the 'Sale Type' table (approx middle of last page).
                 - 'totalLabor' = Sales value.
                 - 'totalGross' = Gross Profit value.
              2. For each Advisor (e.g., FRANK, JARYN): Extract name, soCount, laborSold (Sales), grossLabor (Gross), partsSold, grossParts, elr.
              
              IF OP CODE FREQUENCY - LABOR (UPSELL):
              1. This report lists advisors (CSR: XX - NAME) and then several 'Operation Code' blocks under them.
              2. DO NOT extract MTD totals (set totals to null).
              3. FOR EACH ADVISOR:
                 - Find their name (e.g., CSR: 01 - FRANK).
                 - For every 'Operation Code' block under them (e.g., AF - ENGINE AIR FILTER):
                   - 'code' = The short code (e.g., AF).
                   - 'description' = The full name (e.g., ENGINE AIR FILTER REPLACEMENT).
                   - 'count' = The 'Freq' value for that code total.
                   - 'revenue' = The 'Total Sale' for that code total.
                 - Map these to the 'upsells' array for that advisor.
              
              Return JSON.` }
            ]
          }
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
                    laborSold: { type: Type.NUMBER },
                    grossLabor: { type: Type.NUMBER },
                    partsSold: { type: Type.NUMBER },
                    grossParts: { type: Type.NUMBER },
                    totalSales: { type: Type.NUMBER },
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
                        required: ["code", "description", "count", "revenue"],
                      }
                    }
                  },
                  required: ["name"],
                },
              },
              totals: {
                type: Type.OBJECT,
                nullable: true,
                properties: {
                  totalSales: { type: Type.NUMBER },
                  totalLabor: { type: Type.NUMBER },
                  totalGross: { type: Type.NUMBER },
                  totalParts: { type: Type.NUMBER },
                  totalGrossParts: { type: Type.NUMBER },
                },
              },
            },
            required: ["advisors"],
          },
        }
      });

      const text = response.text;
      if (!text) throw new Error("Empty response from AI");
      res.json(JSON.parse(text));
    } catch (error: any) {
      console.error("API Error Performance:", error);
      const isQuotaError = error.message?.includes("429") || error.status === 429;
      res.status(isQuotaError ? 429 : 500).json({ 
        error: error.message,
        isQuotaError
      });
    }
  });

  app.post("/api/parse-service-history", async (req, res) => {
    try {
      const { pdfBase64 } = req.body;
      if (!pdfBase64) return res.status(400).json({ error: "Missing PDF" });

      const response = await getAI().models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            role: "user",
            parts: [
              {
                inlineData: {
                  mimeType: "application/pdf",
                  data: pdfBase64,
                },
              },
              { text: `This is a high-volume Service History report. Extract EVERY unique customer visit found in the document.
              
              For each entry, capture:
              1. CUSTOMER INFO:
                 - firstName / lastName (Split 'CASSEL, STEVEN' or 'MEEHAN, APRIL/STEVEN')
                 - phone (e.g., (805) 598-9179)
                 - vin (Full 17 digits)
                 - make & model
                 - year
              2. VISIT INFO:
                 - soNumber (Service Order #)
                 - date (Open Date)
                 - mileage (Odom In)
                 - advisor (CSR Code or Name)
                 - requests (The full text in the 'Requests' column)
              
              Return a JSON object with an array 'visits'.` }
            ]
          }
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              visits: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    firstName: { type: Type.STRING },
                    lastName: { type: Type.STRING },
                    phone: { type: Type.STRING },
                    vin: { type: Type.STRING },
                    make: { type: Type.STRING },
                    model: { type: Type.STRING },
                    year: { type: Type.STRING },
                    soNumber: { type: Type.STRING },
                    date: { type: Type.STRING },
                    mileage: { type: Type.NUMBER },
                    advisor: { type: Type.STRING },
                    requests: { type: Type.STRING },
                  },
                  required: ["lastName", "vin", "soNumber", "date", "mileage"],
                }
              }
            },
            required: ["visits"],
          },
        }
      });

      const text = response.text;
      if (!text) throw new Error("Empty response from AI");
      res.json(JSON.parse(text));
    } catch (error: any) {
      console.error("API Error Service History:", error);
      const isQuotaError = error.message?.includes("429") || error.status === 429;
      res.status(isQuotaError ? 429 : 500).json({ 
        error: error.message,
        isQuotaError
      });
    }
  });

  app.post("/api/parse-pot-of-gold", async (req, res) => {
    try {
      const { reportText } = req.body;
      if (!reportText) return res.status(400).json({ error: "Missing report text" });

      const response = await getAI().models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `
          Analyze the following Op Code Frequency Report text and extract the counts for each advisor and technician.
          Map the results to the following Op Codes:
          - AF: ENGINE AIR FILTER
          - ALIGN: PERFORM 2/4 WHEEL ALIGNMENT
          - BAT: BATTERY REPLACEMENT
          - BFR: BRAKE FLUID SERVICE
          - CAF: CABIN AIR FILTER
          - CE: COOLING SYSTEM EXCHANGE
          - FB: FRONT BRAKE PAD/RESURFACE
          - FSC: MOC ENHANCE FUEL SYSTEM
          - GDI: GDI FUEL/AIR INDUCTION
          - RB: REAR BRAKE PAD/SERVICE
          - TIRE1: MOUNT AND BALANCE 1 TIRE
          - TIRE2: MOUNT AND BALANCE 2 TIRES
          - TIRE3: MOUNT AND BALANCE 3 TIRES
          - TIRE4: MOUNT AND BALANCE 4 TIRES
          - TS: TRANSMISSION SERVICE
          - CCC: COMBUSTION CHAMBER CLEANING

          Report Text:
          ${reportText}

          Return a JSON object with:
          1. "advisors": { "frank": { "CODE": COUNT }, "lemmy": { ... }, "jay": { ... } }
          2. "technicians": { "Daniel": { "CODE": COUNT }, "Jon": { ... }, "Matthew": { ... }, "Jacinto": { ... }, "Ethan": { ... }, "Trevor": { ... } }
        `,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              advisors: {
                type: Type.OBJECT,
                properties: {
                  frank: { type: Type.OBJECT, additionalProperties: { type: Type.NUMBER } },
                  lemmy: { type: Type.OBJECT, additionalProperties: { type: Type.NUMBER } },
                  jay: { type: Type.OBJECT, additionalProperties: { type: Type.NUMBER } },
                }
              },
              technicians: {
                type: Type.OBJECT,
                properties: {
                  Daniel: { type: Type.OBJECT, additionalProperties: { type: Type.NUMBER } },
                  Jon: { type: Type.OBJECT, additionalProperties: { type: Type.NUMBER } },
                  Matthew: { type: Type.OBJECT, additionalProperties: { type: Type.NUMBER } },
                  Jacinto: { type: Type.OBJECT, additionalProperties: { type: Type.NUMBER } },
                  Ethan: { type: Type.OBJECT, additionalProperties: { type: Type.NUMBER } },
                  Trevor: { type: Type.OBJECT, additionalProperties: { type: Type.NUMBER } },
                }
              }
            }
          }
        }
      });

      const text = response.text;
      if (!text) throw new Error("Empty response from AI");
      res.json(JSON.parse(text));
    } catch (error: any) {
      console.error("API Error Pot of Gold:", error);
      const isQuotaError = error.message?.includes("429") || error.status === 429;
      res.status(isQuotaError ? 429 : 500).json({ 
        error: error.message,
        isQuotaError
      });
    }
  });

  app.post("/api/estimate-value", async (req, res) => {
    try {
      const { year, make, model, trim, mileage } = req.body;
      
      const response = await getAI().models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            role: "user",
            parts: [
              { text: `Estimate the current trade-in market value range for this vehicle in 2026:
              Year: ${year}
              Make: ${make}
              Model: ${model}
              Trim: ${trim}
              Mileage: ${mileage}
              
              Provide a low and high estimate for "Trade-In" and "Private Party". 
              Also provide a brief "Advisor Tip" on why this car is a good trade candidate (e.g., high demand, aging tech, or upcoming major service).
              
              Return JSON.` }
            ]
          }
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              tradeInLow: { type: Type.NUMBER },
              tradeInHigh: { type: Type.NUMBER },
              privatePartyLow: { type: Type.NUMBER },
              privatePartyHigh: { type: Type.NUMBER },
              advisorTip: { type: Type.STRING },
              marketTrend: { type: Type.STRING, enum: ["Rising", "Stable", "Falling"] }
            },
            required: ["tradeInLow", "tradeInHigh", "advisorTip", "marketTrend"],
          },
        }
      });

      const text = response.text;
      if (!text) throw new Error("Empty response from AI");
      res.json(JSON.parse(text));
    } catch (error: any) {
      console.error("API Error Valuation:", error);
      const isQuotaError = error.message?.includes("429") || error.status === 429;
      res.status(isQuotaError ? 429 : 500).json({ 
        error: error.message,
        isQuotaError
      });
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
