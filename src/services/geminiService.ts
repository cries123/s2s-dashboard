import { logAIUsage } from './loggingService';

export const parseReportWithAI = async (reportText: string) => {
  try {
    const response = await fetch('/api/parse-pot-of-gold', {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reportText }),
    });

    if (!response.ok) {
      let errorMessage = 'Failed to parse report';
      const contentType = response.headers.get('content-type');
      
      if (contentType && contentType.includes('application/json')) {
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch (e) {
          errorMessage = `Server Error (${response.status}): Malformed error response.`;
        }
      } else {
        const text = await response.text();
        console.error('Server returned non-JSON error:', text.substring(0, 200));
        errorMessage = `Server Error (${response.status}): ${response.statusText}. The system may be overloaded.`;
      }
      throw new Error(errorMessage);
    }

    try {
      const data = await response.json();
      
      // Log usage if available
      if (data._usage) {
        logAIUsage('Parse Pot of Gold (Text)', data._usage);
      }
      
      return data;
    } catch (e) {
      console.error('Failed to parse successful response as JSON:', e);
      throw new Error('Server returned an invalid data format. Please try again.');
    }
  } catch (error) {
    console.error("AI Parsing Error:", error);
    throw error;
  }
};
