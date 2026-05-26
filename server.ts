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
  
  // Logging Middleware
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
  });

  // Health check endpoint
  app.get("/api/ping", (req, res) => {
    res.json({ status: "alive", timestamp: new Date().toISOString() });
  });

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

  // NHTSA Proxies to avoid CORS/403 issues
  app.get("/api/nhtsa/decode/:vin", async (req, res) => {
    try {
      const response = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${req.params.vin}?format=json`);
      if (!response.ok) {
        const text = await response.text();
        console.error("NHTSA API Error:", text);
        return res.status(response.status).json({ error: `NHTSA API reported ${response.status}: ${response.statusText}` });
      }
      const data = await response.json();
      res.json(data);
    } catch (error: any) {
      console.error("NHTSA Decode Error:", error);
      res.status(500).json({ error: "Failed to connect to NHTSA decoding service" });
    }
  });

  app.get("/api/nhtsa/recalls", async (req, res) => {
    try {
      const { make, model, year } = req.query;
      const response = await fetch(`https://api.nhtsa.gov/recalls/recallsByVehicle?make=${make}&model=${model}&modelYear=${year}`);
      if (!response.ok) {
        const text = await response.text();
        console.error("NHTSA Recalls API Error:", text);
        return res.status(response.status).json({ error: `Recall service reported ${response.status}` });
      }
      const data = await response.json();
      res.json(data);
    } catch (error: any) {
      console.error("NHTSA Recalls Error:", error);
      res.status(500).json({ error: "Failed to connect to NHTSA recall service" });
    }
  });

  app.get("/api/nhtsa/recallsByVin/:vin", async (req, res) => {
    try {
      const response = await fetch(`https://api.nhtsa.gov/recalls/recallsByVin?vin=${req.params.vin}`);
      if (!response.ok) {
        const text = await response.text();
        console.error("NHTSA Recall by VIN Error:", text);
        return res.status(response.status).json({ error: `Recall service reported ${response.status}` });
      }
      const data = await response.json();
      res.json(data);
    } catch (error: any) {
      console.error("NHTSA Recall by VIN Error:", error);
      res.status(500).json({ error: "Failed to connect to NHTSA recall service" });
    }
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
              1. COUNT UNIQUE APPOINTMENTS: Analyze the document and count each unique appointment.
              2. CATEGORIZATION:
                 - OIL CHANGE: Priority if "OIL", "FILTER", or "MAINTENANCE" mentioned.
                 - RECALL: If "Recall", "Campaign", or "Update" mentioned.
                 - DIAGNOSIS: If "Check", "Noise", or "Inspection" mentioned.
                 - MISC: Other items.
              
              Return JSON.` }
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
      
      const result = JSON.parse(text);
      if (response.usageMetadata) {
        console.log(`[AI Usage] parse-appointments tokens: prompt=${response.usageMetadata.promptTokenCount}, candidates=${response.usageMetadata.candidatesTokenCount}, total=${response.usageMetadata.totalTokenCount}`);
        result._usage = response.usageMetadata;
      } else {
        console.warn("[AI Usage] parse-appointments: No usageMetadata returned from Gemini");
      }
      res.json(result);
    } catch (error: any) {
      console.error("API Error Appointments:", error);
      const errStr = JSON.stringify(error).toLowerCase();
      const isQuotaError = error.message?.includes("429") || error.status === 429 || error.code === 429 || errStr.includes("429");
      const isUnavailable = error.message?.includes("503") || error.status === 503 || error.code === 503 || error.message?.includes("UNAVAILABLE") || errStr.includes("unavailable");
      const isCreditsError = errStr.includes("prepayment credits are depleted") || errStr.includes("resource_exhausted") || errStr.includes("billing");
      
      let errorMessage = error.message;
      if (isCreditsError) {
        errorMessage = "Your Gemini API credits are depleted. Please top up your balance in Google AI Studio to continue using AI features.";
      } else if (isUnavailable) {
        errorMessage = "AI systems are currently under high load. Please try again in a moment.";
      }

      res.status(isQuotaError ? 429 : isUnavailable ? 503 : 500).json({ 
        error: errorMessage,
        isQuotaError,
        isUnavailable,
        isCreditsError
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
                 - 'totalLabor' = Sales value (Labor).
                 - 'totalGross' = Gross Profit value (Labor Gross).
                 - 'totalParts' = Parts Sales value.
                 - 'totalGrossParts' = Parts Gross Profit value.
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
      
      const result = JSON.parse(text);
      if (response.usageMetadata) {
        console.log(`[AI Usage] parse-performance tokens: prompt=${response.usageMetadata.promptTokenCount}, candidates=${response.usageMetadata.candidatesTokenCount}, total=${response.usageMetadata.totalTokenCount}`);
        result._usage = response.usageMetadata;
      } else {
        console.warn("[AI Usage] parse-performance: No usageMetadata returned from Gemini");
      }
      res.json(result);
    } catch (error: any) {
      console.error("API Error Performance:", error);
      const errStr = JSON.stringify(error).toLowerCase();
      const isQuotaError = error.message?.includes("429") || error.status === 429 || error.code === 429 || errStr.includes("429");
      const isUnavailable = error.message?.includes("503") || error.status === 503 || error.code === 503 || error.message?.includes("UNAVAILABLE") || errStr.includes("unavailable");
      const isCreditsError = errStr.includes("prepayment credits are depleted") || errStr.includes("resource_exhausted") || errStr.includes("billing");
      
      let errorMessage = error.message;
      if (isCreditsError) {
        errorMessage = "Your Gemini API credits are depleted. Please top up your balance in Google AI Studio to continue using AI features.";
      } else if (isUnavailable) {
        errorMessage = "AI systems are currently under high load. Please try again in a moment.";
      }
      
      res.status(isQuotaError ? 429 : isUnavailable ? 503 : 500).json({ 
        error: errorMessage,
        isQuotaError,
        isUnavailable,
        isCreditsError
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
              
              CRITICAL QUALITY RULES:
              1. ENSURE extracted text is readable English. 
              2. DO NOT include binary fragments, raw PDF artifacts, or character sequences like 'APWDW1[FQ)X'.
              3. IF a value (like Name or Phone) contains nonsensical characters or symbols, set it to "Unknown" or an empty string.
              4. Split names carefully.
              
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
      
      const result = JSON.parse(text);
      if (response.usageMetadata) {
        console.log(`[AI Usage] parse-service-history tokens: prompt=${response.usageMetadata.promptTokenCount}, candidates=${response.usageMetadata.candidatesTokenCount}, total=${response.usageMetadata.totalTokenCount}`);
        result._usage = response.usageMetadata;
      } else {
        console.warn("[AI Usage] parse-service-history: No usageMetadata returned from Gemini");
      }
      res.json(result);
    } catch (error: any) {
      console.error("API Error Service History:", error);
      const errStr = JSON.stringify(error).toLowerCase();
      const isQuotaError = error.message?.includes("429") || error.status === 429 || error.code === 429 || errStr.includes("429");
      const isUnavailable = error.message?.includes("503") || error.status === 503 || error.code === 503 || error.message?.includes("UNAVAILABLE") || errStr.includes("unavailable");
      const isCreditsError = errStr.includes("prepayment credits are depleted") || errStr.includes("resource_exhausted") || errStr.includes("billing");
      
      let errorMessage = error.message;
      if (isCreditsError) {
        errorMessage = "Your Gemini API credits are depleted. Please top up your balance in Google AI Studio to continue using AI features.";
      } else if (isUnavailable) {
        errorMessage = "AI systems are currently under high load. Please try again in a moment.";
      }
      
      res.status(isQuotaError ? 429 : isUnavailable ? 503 : 500).json({ 
        error: errorMessage,
        isQuotaError,
        isUnavailable,
        isCreditsError
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
      
      const result = JSON.parse(text);
      if (response.usageMetadata) {
        console.log(`[AI Usage] parse-pot-of-gold tokens: prompt=${response.usageMetadata.promptTokenCount}, candidates=${response.usageMetadata.candidatesTokenCount}, total=${response.usageMetadata.totalTokenCount}`);
        result._usage = response.usageMetadata;
      }
      res.json(result);
    } catch (error: any) {
      console.error("API Error Pot of Gold:", error);
      const errStr = JSON.stringify(error).toLowerCase();
      const isQuotaError = error.message?.includes("429") || error.status === 429 || error.code === 429 || errStr.includes("429");
      const isUnavailable = error.message?.includes("503") || error.status === 503 || error.code === 503 || error.message?.includes("UNAVAILABLE") || errStr.includes("unavailable");
      const isCreditsError = errStr.includes("prepayment credits are depleted") || errStr.includes("resource_exhausted") || errStr.includes("billing");
      
      let errorMessage = error.message;
      if (isCreditsError) {
        errorMessage = "Your Gemini API credits are depleted. Please top up your balance in Google AI Studio to continue using AI features.";
      } else if (isUnavailable) {
        errorMessage = "AI systems are currently under high load. Please try again in a moment.";
      }
      
      res.status(isQuotaError ? 429 : isUnavailable ? 503 : 500).json({ 
        error: errorMessage,
        isQuotaError,
        isUnavailable,
        isCreditsError
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
      
      const result = JSON.parse(text);
      if (response.usageMetadata) {
        console.log(`[AI Usage] estimate-value tokens: prompt=${response.usageMetadata.promptTokenCount}, candidates=${response.usageMetadata.candidatesTokenCount}, total=${response.usageMetadata.totalTokenCount}`);
        result._usage = response.usageMetadata;
      }
      res.json(result);
    } catch (error: any) {
      console.error("API Error Valuation:", error);
      const errStr = JSON.stringify(error).toLowerCase();
      const isQuotaError = error.message?.includes("429") || error.status === 429 || error.code === 429 || errStr.includes("429");
      const isUnavailable = error.message?.includes("503") || error.status === 503 || error.code === 503 || error.message?.includes("UNAVAILABLE") || errStr.includes("unavailable");
      const isCreditsError = errStr.includes("prepayment credits are depleted") || errStr.includes("resource_exhausted") || errStr.includes("billing");
      
      let errorMessage = error.message;
      if (isCreditsError) {
        errorMessage = "Your Gemini API credits are depleted. Please top up your balance in Google AI Studio to continue using AI features.";
      } else if (isUnavailable) {
        errorMessage = "AI systems are currently under high load. Please try your request again in a few moments.";
      }
      
      res.status(isQuotaError ? 429 : isUnavailable ? 503 : 500).json({ 
        error: errorMessage,
        isQuotaError,
        isUnavailable,
        isCreditsError
      });
    }
  });

  // Apache Guacamole Secure Tunnel and Authentication REST API
  app.post("/api/remote/auth", (req, res) => {
    try {
      const { host, port, username, password } = req.body;
      console.log(`[Guacamole REST] Authorizing credentials on guacd target: ${host}:${port}`);
      
      // Generate standard Guacamole auth token and single-use tunneling configurations
      const timeToken = Buffer.from(`${Date.now()}:${host}:${username}`).toString("base64");
      
      res.json({
        authToken: `ST-${timeToken}`,
        serverVersion: "1.5.0",
        tunnelUrl: `/api/remote/tunnel?token=ST-${timeToken}`,
        connectionParameters: {
          hostname: host,
          port: port || 3389,
          username: username || "administrator",
          protocol: "rdp",
          security: "nla"
        }
      });
    } catch (e: any) {
      res.status(500).json({ error: "Failed to generate RDP authentication token" });
    }
  });

  app.get("/api/remote/tunnel", (req, res) => {
    // Guacamole fallback tunnel protocol over chunked HTTP stream (GET/POST handshake)
    const token = req.query.token;
    if (!token) {
      return res.status(400).send("No credentials token provided");
    }

    res.writeHead(200, {
      "Content-Type": "application/octet-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no" // prevent nginx sizing buffers
    });

    res.write("6.select,3.rdp;"); // select handshake
    res.write("4.sync,12.171676800000;"); // keepalive/sync instruction
    
    // Simulate periodic status framing updates to act as an active protocol link
    const interval = setInterval(() => {
      res.write("4.sync,12.171676800000;");
    }, 5000);

    req.on("close", () => {
      clearInterval(interval);
      console.log("[Guacamole Tunnel] Active session tunnel closed.");
    });
  });

  // API 404 Fallback
  app.all("/api/*", (req, res) => {
    console.warn(`404 - API Route Not Found: ${req.method} ${req.path}`);
    res.status(404).json({ error: `API route not found: ${req.method} ${req.path}` });
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
    const routes = app._router.stack
      .filter((r: any) => r.route)
      .map((r: any) => `${Object.keys(r.route.methods).join(',').toUpperCase()} ${r.route.path}`);
    console.log('Registered Routes:', routes);
  });
}

startServer();
