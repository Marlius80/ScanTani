import { GoogleGenAI, GenerateContentResponse } from "@google/genai";

let aiClient: GoogleGenAI | null = null;

function getAIClient() {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("Kunci API Gemini (GEMINI_API_KEY) belum diatur di environment variables Netlify.");
    }
    aiClient = new GoogleGenAI({ apiKey });
  }
  return aiClient;
}

export interface PlantAnalysis {
  plantName: string;
  diseaseName: string;
  severity: number;
  description: string;
  recommendations: {
    organic: string;
    chemical: string;
  };
}

export async function analyzePlantImage(base64Image: string): Promise<PlantAnalysis> {
  const model = "gemini-3-flash-preview";
  const prompt = `
    Analyze this plant image (leaf, stem, or fruit). 
    Identify the plant name, the disease (if any), and the severity of the disease in percentage (0-100).
    Provide a brief description of the disease and recommendations for treatment (both organic and chemical).
    
    Return the result strictly in JSON format with the following structure:
    {
      "plantName": "string",
      "diseaseName": "string (or 'Healthy' if no disease)",
      "severity": number (0-100),
      "description": "string",
      "recommendations": {
        "organic": "string",
        "chemical": "string"
      }
    }
  `;

  const imagePart = {
    inlineData: {
      mimeType: "image/jpeg",
      data: base64Image.split(',')[1] || base64Image,
    },
  };

  const ai = getAIClient();
  const response: GenerateContentResponse = await ai.models.generateContent({
    model,
    contents: [{ parts: [{ text: prompt }, imagePart] }],
    config: {
      responseMimeType: "application/json",
    }
  });

  try {
    const result = JSON.parse(response.text || "{}");
    return result as PlantAnalysis;
  } catch (error) {
    console.error("Failed to parse Gemini response:", error);
    throw new Error("Gagal menganalisis gambar. Silakan coba lagi.");
  }
}
