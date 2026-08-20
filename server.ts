import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { OpenAI } from "openai";
import admin from "firebase-admin";
import { getApps, initializeApp, getApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";
import { registerParseSalesNoteRoute } from "./server/handlers/parseSalesNote.js";
import { registerAiConfigRoute } from "./server/handlers/aiConfig.js";
import { registerPbsRoutes } from "./server/handlers/pbsRoutes.js";
import { registerOutreachRoutes } from "./server/handlers/registerOutreachRoutes.js";
import { rejectIfOpenAiUnavailable } from "./server/dms/requireOpenAi.js";
import { registerMasterUserRoutes } from "./server/admin/registerMasterUserRoutes.js";
import { getFirebaseAdminApp } from "./server/admin/initFirebaseAdmin.js";
import { extractOperationsPayTypes } from "./src/lib/operationsPayTypes.ts";

dotenv.config();
getFirebaseAdminApp();

export async function createApiApp() {
  const app = express();

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

  // API Routes
  registerAiConfigRoute(app);
  registerPbsRoutes(app);

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", env: process.env.NODE_ENV });
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

  app.post("/api/estimate-value", async (req, res) => {
    try {
      const { year, make, model, trim, mileage } = req.body;
      const vYear = parseInt(year) || 2020;
      const vMileage = parseInt(mileage) || 15000;
      const strToHash = `${make || ''}-${model || ''}-${trim || ''}`.toLowerCase();
      let nameHashVal = 0;
      for (let i = 0; i < strToHash.length; i++) {
        nameHashVal = (nameHashVal + strToHash.charCodeAt(i) * (i + 1)) % 1000;
      }
      
      const trimBonus = trim ? (trim.toLowerCase().includes("limited") || trim.toLowerCase().includes("ultimate") || trim.toLowerCase().includes("premium") || trim.toLowerCase().includes("sport") ? 6000 : 2500) : 0;
      const baseOriginal = 25000 + (nameHashVal * 40) + trimBonus;
      
      const currentYear = 2026;
      const age = Math.max(0, currentYear - vYear);
      let depreciated = baseOriginal * Math.pow(0.88, age);
      
      const mileageDepreciation = vMileage * 0.11;
      depreciated = Math.max(2500, depreciated - mileageDepreciation);
      
      const tradeInLow = Math.round(depreciated * 0.92 / 100) * 100;
      const tradeInHigh = Math.round(depreciated * 1.04 / 100) * 100;
      
      const privatePartyLow = Math.round(depreciated * 1.05 / 100) * 100;
      const privatePartyHigh = Math.round(depreciated * 1.18 / 100) * 100;
      
      let advisorTip = "";
      if (vMileage > 75000) {
        advisorTip = `With ${vMileage.toLocaleString()} miles, this vehicle is nearing major milestone servicing thresholds. Trading now avoids immediate maintenance costs while market demand is peak.`;
      } else if (age >= 6) {
        advisorTip = "A solid contender for budget buyers, but rapidly outdated tech makes this an outstanding time to transition into modern active driver-assistance safety suites.";
      } else if (tradeInHigh > 35000) {
        advisorTip = "High-demand tier vehicle. Dealership stock is actively depleted for this exact model segment, commanding peak trade equity values right now.";
      } else {
        advisorTip = "Strong stable performer in regional pre-owned grids. Perfect candidate for clean trade rollover with excellent competitive value retention.";
      }
      
      let marketTrend = "Stable";
      if (age < 2) {
        marketTrend = "Rising";
      } else if (age > 6 || vMileage > 90000) {
        marketTrend = "Falling";
      } else if (nameHashVal % 3 === 0) {
        marketTrend = "Rising";
      }
      
      res.json({
        tradeInLow,
        tradeInHigh,
        privatePartyLow,
        privatePartyHigh,
        advisorTip,
        marketTrend
      });
    } catch (error: any) {
      console.error("Valuation Error (Deterministic):", error);
      res.status(500).json({ error: "Failed to calculate vehicle value" });
    }
  });

  // Lazy initialize OpenAI client
  let openaiClient: OpenAI | null = null;
  function getOpenAIClient() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY environment variable is required.");
    }
    if (!openaiClient) {
      openaiClient = new OpenAI({ apiKey });
    }
    return openaiClient;
  }

  registerMasterUserRoutes(app);

  registerParseSalesNoteRoute(app, { getOpenAIClient });

  registerOutreachRoutes(app);

  app.post("/api/gemini-parse-dms", async (req, res) => {
    let openaiFailureReason: 'openai_auth_failed' | 'openai_quota_exhausted' | 'openai_api_failed' | 'openai_key_masked' | null = null;
    let openaiFailureError: string | null = null;

    try {
      const { rawReportText } = req.body;
      if (!rawReportText) {
        return res.status(400).json({ error: "Missing rawReportText in post request body" });
      }

      const openaiKey = process.env.OPENAI_API_KEY;
      const isMaskedKey = !!(openaiKey && openaiKey.includes("*"));
      const hasOpenAI = !!(openaiKey && openaiKey.trim() !== "" && !openaiKey.includes("YOUR_") && !isMaskedKey);

      if (rejectIfOpenAiUnavailable(res)) return;

      if (openaiKey && isMaskedKey) {
        return res.status(422).json({
          error: "OPENAI_API_KEY looks masked (contains *). Paste the full key from the OpenAI dashboard.",
          requiresOpenAi: true,
        });
      }

      // OpenAI is required for DMS forecast reports
      if (hasOpenAI) {
        try {
          console.log("[OpenAI DMS Parser] Extracting report text using gpt-4o-mini...");
          const openai = getOpenAIClient();
          const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content: "You are an expert automotive Dealer Management System (DMS) parsing assistant. Extract financial and operational metrics from raw text outputs exactly. Maintain 100% precision with numbers.\n\nCRITICAL INSTRUCTION FOR LABOR GP% (Gross Profit Percentages):\nDo NOT extract GP% for Customer, Warranty, and Internal from the general left-hand 'Pay Type' table (which contains blended parts/labor/sublet margins like 63.9%, 58.6%, 51.7%).\nInstead, you MUST extract the specific LABOR GP% values from the right-hand 'Price Code' table:\n- cpLaborGPPercent MUST be extracted from the 'Labor C' row GP% (e.g., 81.9).\n- warrLaborGPPercent MUST be extracted from the 'Labor W' row GP% (e.g., 86.7).\n- internalLaborGPPercent MUST be extracted from the 'Labor I' row GP% (e.g., 79.0)."
              },
              {
                role: "user",
                content: `Please parse this DMS raw report payload and return structured JSON matching the database requirements:\n\n${rawReportText}`
              }
            ],
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "dms_telemetry",
                strict: true,
                schema: {
                  type: "object",
                  properties: {
                    grossLaborSales: { type: "number", description: "Total Labor Sales from Sale Type row" },
                    laborGrossProfit: { type: "number", description: "Total Labor Gross Profit from Sale Type row" },
                    hoursBilled: { type: "number", description: "Total Hours Sold from top summary matrix" },
                    repairOrdersWritten: { type: "integer", description: "Total physical SO# / RO volume written" },
                    effectiveLaborRate: { type: "number", description: "Blended total shop ELR calculation" },
                    
                    cpHours: { type: "number", description: "Customer pay hours sold" },
                    cpELR: { type: "number", description: "Customer pay Effective Labor Rate" },
                    cpLaborGPPercent: { type: "number", description: "STRICTLY the GP% percentage value of 'Labor C' from the right-hand select Price Code section (e.g., 81.9), DO NOT extract the Customer row GP% (63.9) from the left-hand Pay Type table." },
                    cpCount: { type: "integer", description: "Customer pay repair orders written count (#SO in Pay Type Customer row)" },
                    
                    warrHours: { type: "number", description: "Warranty pay hours sold" },
                    warrELR: { type: "number", description: "Warranty Effective Labor Rate" },
                    warrLaborGPPercent: { type: "number", description: "STRICTLY the GP% percentage value of 'Labor W' from the right-hand select Price Code section (e.g., 86.7), DO NOT extract the Warranty row GP% (58.6) from the left-hand Pay Type table." },
                    warrCount: { type: "integer", description: "Warranty repair orders written count (#SO in Pay Type Warranty row)" },
                    
                    internalHours: { type: "number", description: "Internal / Recon pay hours sold" },
                    internalELR: { type: "number", description: "Internal Effective Labor Rate" },
                    internalLaborGPPercent: { type: "number", description: "STRICTLY the GP% percentage value of 'Labor I' from the right-hand select Price Code section (e.g., 79.0), DO NOT extract the Internal row GP% (51.7) from the left-hand Pay Type table." },
                    internalCount: { type: "integer", description: "Internal / Recon repair orders written count (#SO in Pay Type Internal row)" },
                    
                    subletSales: { type: "number", description: "Total Sublet Sales amount" },
                    subletGrossProfit: { type: "number", description: "Total Sublet Gross profit yield" },
                    miscSales: { type: "number", description: "Total Miscellaneous Sales" },
                    miscGrossProfit: { type: "number", description: "Total Miscellaneous Gross Profit" }
                  },
                  required: [
                    "grossLaborSales", "laborGrossProfit", "hoursBilled", "repairOrdersWritten", "effectiveLaborRate",
                    "cpHours", "cpELR", "cpLaborGPPercent", "warrHours", "warrELR", "warrLaborGPPercent",
                    "internalHours", "internalELR", "internalLaborGPPercent", "subletSales", "subletGrossProfit",
                    "miscSales", "miscGrossProfit", "cpCount", "warrCount", "internalCount"
                  ],
                  additionalProperties: false
                }
              }
            },
            temperature: 0.0
          });

          const resContent = completion.choices[0]?.message?.content;
          if (resContent) {
            console.log("[OpenAI DMS Parser] Successfully fetched structured JSON.");
            const parsedData = JSON.parse(resContent);
            return res.json({ success: true, data: parsedData, isChatGPT: true });
          }
        } catch (openaiErr: any) {
          const errStatus = openaiErr?.status || openaiErr?.statusCode;
          const errMsg = openaiErr?.message || String(openaiErr);
          
          const isAuthError = errStatus === 401 || errMsg.toLowerCase().includes("incorrect api key") || errMsg.toLowerCase().includes("authentication") || errMsg.toLowerCase().includes("invalid_api_key");
          const isQuotaError = errStatus === 429 || errMsg.toLowerCase().includes("quota") || errMsg.toLowerCase().includes("prepayment") || errMsg.toLowerCase().includes("credits") || errMsg.toLowerCase().includes("billing");

          if (isAuthError) {
            console.log("[OpenAI DMS Parser] API authentication failed. Preparing for fallback...");
            openaiFailureReason = "openai_auth_failed";
            openaiFailureError = "OpenAI Authentication failed. The provided API key is incorrect or invalid.";
          } else if (isQuotaError) {
            console.log("[OpenAI DMS Parser] Quota limit exceeded. Preparing for fallback...");
            openaiFailureReason = "openai_quota_exhausted";
            openaiFailureError = "OpenAI API quota exceeded or prepay credits depleted.";
          } else {
            console.log(`[OpenAI DMS Parser] Non-fatal API error: ${errMsg}. Preparing for fallback...`);
            openaiFailureReason = "openai_api_failed";
            openaiFailureError = `OpenAI API failed: ${errMsg}`;
          }
        }
      }


      return res.status(502).json({ success: false, error: openaiFailureError || "OpenAI DMS parse failed.", requiresOpenAi: true });
    } catch (error: any) {
      console.error("[OpenAI DMS Parser] Unexpected error:", error);
      return res.status(500).json({
        success: false,
        error: error?.message || String(error),
        requiresOpenAi: true,
      });
    }
  });

  // API 404 Fallback
  app.all("/api/*", (req, res) => {
    console.warn(`404 - API Route Not Found: ${req.method} ${req.path}`);
    res.status(404).json({ error: `API route not found: ${req.method} ${req.path}` });
  });

  return app;
}

async function startServer() {
  const app = await createApiApp();
  const PORT = 3000;

  // Serve static files / Vite (local dev + production Node server only)
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: [
          '.cursorvm.com',
          '.agent.cvm.dev',
          '.trycloudflare.com',
          '.loca.lt',
          'localhost',
        ],
      },
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

function shouldStartStandaloneServer(): boolean {
  if (process.env.NETLIFY === "true" || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return false;
  }
  const entry = process.argv[1] ? path.resolve(process.argv[1]) : "";
  if (!entry) return false;
  if (entry.endsWith("server.cjs") || entry.endsWith("server.ts")) {
    return true;
  }
  try {
    return fileURLToPath(import.meta.url) === entry;
  } catch {
    return false;
  }
}

if (shouldStartStandaloneServer()) {
  startServer();
}
