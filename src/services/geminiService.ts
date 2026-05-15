import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export const parseReportWithAI = async (reportText: string) => {
  const model = "gemini-3-flash-preview";

  const prompt = `
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
  `;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
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

    return JSON.parse(response.text);
  } catch (error) {
    console.error("Gemini AI Parsing Error:", error);
    throw error;
  }
};
