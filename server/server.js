const express = require("express");
const cors = require("cors");
require("dotenv").config();

const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.get("/", (req, res) => {
  res.json({
    message: "Sahaay-AI backend is running!"
  });
});

app.post("/api/gemini", async (req, res) => {
  try {
    const { systemInstruction, userParts } = req.body;

    if (!systemInstruction || !userParts) {
      return res.status(400).json({
        error: "Missing systemInstruction or userParts"
      });
    }

    const model = genAI.getGenerativeModel({
      model: "gemini-3.6-flash",
      systemInstruction
    });

    const result = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: userParts
        }
      ],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json"
      }
    });

    const text = result.response.text();

    res.json({
      result: JSON.parse(text)
    });

  } catch (error) {
    console.error("Gemini error:", error);

    res.status(500).json({
      error: error.message || "Gemini API request failed"
    });
  }
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
