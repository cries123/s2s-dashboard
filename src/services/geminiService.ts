export const parseReportWithAI = async (reportText: string) => {
  try {
    const response = await fetch('/api/parse-pot-of-gold', {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reportText }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Failed to parse report");
    }

    return await response.json();
  } catch (error) {
    console.error("AI Parsing Error:", error);
    throw error;
  }
};
