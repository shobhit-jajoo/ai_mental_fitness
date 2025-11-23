import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Create Gemini client. The API Key is loaded from the .env file.
const client = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY, // Use the environment variable
});

app.post("/ai-response", async (req, res) => {
  const { moodValue, note } = req.body;

  // Log incoming request (helpful for debugging)
  console.log("\n==== Incoming Check-in ====");
  console.log("Mood Value:", moodValue);
  console.log("Note:", note);

  try {
    const moodMap = {
      1: "very low (😞)",
      2: "low (😕)",
      3: "neutral (😐)",
      4: "good (🙂)",
      5: "great (😄)",
    };

    const prompt = `
User mood rating: ${moodMap[moodValue] || moodValue}
User note: "${note || "(no note)"}"

Respond to the user with a single paragraph, following these steps:

1. A warm, supportive emotional reflection based on their mood and note.
2. Identify the likely emotion behind their experience (e.g., 'It sounds like you're feeling a bit of relief').
3. Give 1–2 small, actionable, practical tips they can try right now.

Tone must be friendly, kind, non-judgmental, and **do not mention AI or that you are a model.**
`;

    console.log("\n==== Sending prompt to AI ====");

    // FIX: Use client.generateContent() for the latest Google Gen AI SDK
    const result = await client.models.generateContent({
  model: "gemini-2.5-flash",
  contents: prompt,
});


    // FIX: Extract response text using the correct property for the latest SDK
    const aiText = result?.text || "I'm here with you, even if I couldn't generate a reply ❤️";

    console.log("\n==== AI Response Received ====");
    console.log(aiText);

    res.json({ reply: aiText });
  } catch (error) {
    console.error("\n==== Gemini Error ====");
    console.error(error); // This will log the detailed error (like connection failure or invalid key)

    res.json({
      reply: "AI couldn't respond right now — but you're doing great ❤️",
    });
  }
});

app.listen(3000, () => {
  console.log("Gemini server running on http://localhost:3000");
});