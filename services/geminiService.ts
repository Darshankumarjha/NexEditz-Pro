import { GoogleGenAI } from "@google/genai";

const getAI = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API_KEY environment variable is missing");
  }
  return new GoogleGenAI({ apiKey });
};

const cleanBase64 = (base64: string) => {
  return base64.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, '');
};

const getMimeType = (base64: string) => {
  const match = base64.match(/^data:(image\/[a-zA-Z]+);base64,/);
  return match ? match[1] : 'image/png';
};

/**
 * Edits an image using Gemini 2.5 Flash Image based on a text prompt.
 */
export const editImageWithGemini = async (imageBase64: string, prompt: string): Promise<string> => {
  const ai = getAI();
  const base64Data = cleanBase64(imageBase64);
  const mimeType = getMimeType(imageBase64);

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image', 
      contents: {
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Data,
            },
          },
        ],
      },
    });

    if (!response.candidates || response.candidates.length === 0) {
      throw new Error("No candidates returned from Gemini.");
    }

    const content = response.candidates[0].content;
    let generatedImageBase64: string | null = null;
    
    if (content?.parts) {
      for (const part of content.parts) {
        if (part.inlineData && part.inlineData.data) {
          generatedImageBase64 = part.inlineData.data;
          break;
        }
      }
    }

    if (!generatedImageBase64) {
      const textPart = content?.parts?.find(p => p.text)?.text;
      if (textPart) {
        throw new Error(`Gemini returned text instead of image: "${textPart}"`);
      }
      throw new Error("Gemini response did not contain valid image data.");
    }

    return `data:image/png;base64,${generatedImageBase64}`;
    
  } catch (error) {
    console.error("Error editing image:", error);
    throw error;
  }
};

/**
 * Generates a new image from scratch using a text prompt.
 */
export const generateImageWithGemini = async (prompt: string, aspectRatio: string = "1:1"): Promise<string> => {
  const ai = getAI();
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [{ text: prompt }]
      },
      config: {
        imageConfig: {
           aspectRatio: aspectRatio as any
        }
      }
    });

    const content = response.candidates?.[0]?.content;
    let generatedImageBase64: string | null = null;
    
    if (content?.parts) {
      for (const part of content.parts) {
        if (part.inlineData && part.inlineData.data) {
          generatedImageBase64 = part.inlineData.data;
          break;
        }
      }
    }

    if (!generatedImageBase64) {
       throw new Error("Failed to generate image.");
    }

    return `data:image/png;base64,${generatedImageBase64}`;
  } catch (error) {
    console.error("Error generating image:", error);
    throw error;
  }
};

/**
 * Analyzes the image and suggests creative edit prompts.
 */
export const suggestEditsWithGemini = async (imageBase64: string): Promise<string[]> => {
  const ai = getAI();
  const base64Data = cleanBase64(imageBase64);
  const mimeType = getMimeType(imageBase64);

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          { 
            text: "Analyze this image and list 4 short, creative, and distinct text prompts I could use to edit this image with generative AI. Return ONLY a raw JSON array of strings, e.g. [\"Turn the sky purple\", \"Add a vintage filter\"]. Do not include markdown formatting." 
          },
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Data,
            },
          },
        ],
      },
    });

    const text = response.text || "[]";
    const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
    
    try {
      const suggestions = JSON.parse(cleanText);
      if (Array.isArray(suggestions)) {
        return suggestions.slice(0, 4);
      }
      return ["Enhance lighting", "Make it cyberpunk", "Convert to sketch", "Remove background"];
    } catch (e) {
      return ["Enhance colors", "Add cinematic lighting", "Make it black and white", "Remove background objects"];
    }

  } catch (error) {
    return ["Add a neon glow", "Change background to space", "Apply oil painting style", "Make it snowy"];
  }
};
