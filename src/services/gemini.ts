import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export async function analyzeMentalConsistency(thoughts: { content: string, timestamp: any, categories: string[] }[], goals: any[] = []) {
  const model = "gemini-3.1-pro-preview";
  const prompt = `
    Analyze the following thoughts from a personal diary. 
    The user wants to know if their thinking is linear or unstable over time.
    Identify if they are saying one thing one day and another thing another day.
    
    Take the user's ANNUAL GOALS into account as a reference for what they want to achieve.
    Evaluate if their thoughts, actions, and feelings are aligned with these goals.
    
    Annual Goals:
    ${goals.map(g => `- [${g.category}] ${g.title}: ${g.description || ''} (Status: ${g.status})`).join('\n')}

    Thoughts:
    ${thoughts.map(t => `[${t.timestamp.toDate().toISOString()}] (${t.categories.join(', ')}): ${t.content}`).join('\n')}
    
    Provide a summary of their mental state, consistency, and alignment with their goals.
  `;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      systemInstruction: "You are a psychological consistency analyst. Your goal is to help the user understand if their thoughts and actions are aligned over time. Be objective but supportive.",
    }
  });

  return response.text;
}

export async function categorizeFinanceFromText(text: string, existingMappings: any[] = []) {
  const model = "gemini-3-flash-preview";
  const prompt = `
    Extract financial transactions from the following text (likely from a bank statement or PDF).
    For each transaction, provide:
    - amount (number, positive for income, negative for expense)
    - description (string)
    - category (string)
    - subCategory (string)
    - type (one of: "expense", "income", "investment")
    - date (ISO string if possible, otherwise best guess)
    - isFixed (boolean, true if it looks like a recurring/fixed expense like rent, insurance, subscriptions)
    - confidence (number, from 0 to 1, representing how sure you are about the category)
    - needsReview (boolean, true if confidence is low or if the description is ambiguous)

    User's existing mappings for reference (use these if the description matches):
    ${JSON.stringify(existingMappings)}

    Text:
    ${text}
  `;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            amount: { type: Type.NUMBER },
            description: { type: Type.STRING },
            category: { type: Type.STRING },
            subCategory: { type: Type.STRING },
            type: { type: Type.STRING, enum: ["expense", "income", "investment"] },
            date: { type: Type.STRING },
            isFixed: { type: Type.BOOLEAN },
            confidence: { type: Type.NUMBER },
            needsReview: { type: Type.BOOLEAN }
          },
          required: ["amount", "description", "category", "type", "date", "isFixed", "confidence", "needsReview"]
        }
      }
    }
  });

  try {
    let textResponse = response.text.trim();
    // Remove markdown code blocks if present
    if (textResponse.includes('```')) {
      textResponse = textResponse.replace(/```json/g, '').replace(/```/g, '').trim();
    }
    return JSON.parse(textResponse);
  } catch (e) {
    console.error("Failed to parse Gemini response as JSON:", response.text);
    throw new Error("Error al procesar la respuesta de la IA. Por favor, intenta de nuevo.");
  }
}

export async function analyzeFinancialState(finances: any[]) {
  const model = "gemini-3-flash-preview";
  const prompt = `
    Analyze the following financial transactions and provide a summary of the user's financial state.
    Identify trends, major expenses, and investment status.
    
    Transactions:
    ${JSON.stringify(finances)}
  `;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
  });

  return response.text;
}

export async function categorizeThought(content: string, availableCategories: { label: string, icon: string }[]) {
  const model = "gemini-3-flash-preview";
  const prompt = `
    Analyze the following thought and categorize it into one or more of the available categories.
    Available Categories:
    ${availableCategories.map(c => `- ${c.label} (${c.icon})`).join('\n')}

    Thought:
    ${content}

    Return only a JSON array of the category labels that apply.
  `;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: { type: Type.STRING }
      }
    }
  });

  try {
    let text = response.text.trim();
    if (text.includes('```')) {
      text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    }
    return JSON.parse(text);
  } catch (e) {
    console.error("Failed to parse categorization response:", response.text);
    return [availableCategories[0].label]; // Fallback
  }
}

export async function checkHabitProgress(thought: string, activeHabits: any[]) {
  if (activeHabits.length === 0) return "";
  
  const model = "gemini-3-flash-preview";
  const prompt = `
    Based on the following thought, check if the user is making progress on any of their active habits.
    Active Habits:
    ${activeHabits.map(h => `- ${h.title}: ${h.description}`).join('\n')}

    Thought:
    ${thought}

    Provide a brief, supportive feedback message if any progress is detected. If not, return an empty string.
  `;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      systemInstruction: "You are a supportive habit coach. Your goal is to identify progress on habits from the user's thoughts and provide encouraging feedback. Be very brief."
    }
  });

  return response.text;
}

export async function transcribeAudio(base64Audio: string, mimeType: string) {
  const model = "gemini-3-flash-preview";
  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        inlineData: {
          data: base64Audio,
          mimeType: mimeType
        }
      },
      {
        text: "Transcribe the audio accurately. Provide only the transcription text."
      }
    ],
    config: {
      systemInstruction: "You are an accurate audio transcriptionist. Your goal is to transcribe the provided audio exactly as spoken, without adding any commentary or interpretation."
    }
  });

  return response.text;
}

export async function analyzeImage(base64Image: string, mimeType: string, prompt: string = "Analyze this image and provide insights related to the user's mental state or thoughts.") {
  const model = "gemini-3.1-pro-preview";
  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        inlineData: {
          data: base64Image,
          mimeType: mimeType
        }
      },
      {
        text: prompt
      }
    ],
    config: {
      systemInstruction: "You are a visual analyst. Your goal is to help the user understand the context and meaning of the images they share, especially in the context of a personal diary or mental state tracker."
    }
  });

  return response.text;
}

export async function analyzeCalendarAndSuggest(events: any[], habits: any[], goals: any[], thoughts: any[]) {
  const model = "gemini-3.1-pro-preview";
  const prompt = `
    Analyze the following Google Calendar events for the next 7 days and suggest time slots for the user's habits, goals, and tasks.
    
    User's Calendar Events:
    ${JSON.stringify(events.map(e => ({ summary: e.summary, start: e.start, end: e.end })))}
    
    Active Habits:
    ${habits.map(h => `- ${h.title}: ${h.description}`).join('\n')}
    
    Annual Goals:
    ${goals.map(g => `- [${g.category}] ${g.title}: ${g.description || ''}`).join('\n')}
    
    Recent Thoughts/Context:
    ${thoughts.slice(0, 5).map(t => `- ${t.content}`).join('\n')}
    
    Provide:
    1. A summary of how the user is spending their time (based on event summaries).
    2. Specific suggestions for when to work on their habits or goals during free slots.
    3. Any conflicts or areas where they might be over-committed.
    
    Be supportive and practical.
  `;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      systemInstruction: "You are a productivity and time-management coach. Your goal is to help the user optimize their schedule based on their real calendar and their personal goals/habits."
    }
  });

  return response.text;
}
