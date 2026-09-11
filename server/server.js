
const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));

// Home route
app.get("/", (req, res) => {
  res.json({
    message: "Sahaay-AI backend is running!"
  });
});

// Demo AI endpoint
// No API key required
app.post("/api/gemini", async (req, res) => {
  try {
    const { systemInstruction, userParts } = req.body;

    if (!systemInstruction || !userParts) {
      return res.status(400).json({
        error: "Missing systemInstruction or userParts"
      });
    }

    const inputText = JSON.stringify(userParts).toLowerCase();

    // ---------- STAGE 1: EXTRACTION ----------
    if (
      systemInstruction.includes(
        "medical intake extraction engine"
      )
    ) {
      const result = {
        chief_complaint: extractComplaint(inputText),
        symptom_onset: "Not clearly provided",
        current_medications: [],
        known_allergies: [],
        existing_conditions: [],
        photo_observations: "No specific observation available",
        unclear_or_missing: [
          "Medication information",
          "Allergy information",
          "Medical history details"
        ]
      };

      return res.json({ result });
    }

    // ---------- STAGE 2: VERIFICATION ----------
    if (
      systemInstruction.includes(
        "clinical safety verification engine"
      )
    ) {
      const result = {
        flags: [],
        overall_risk: "low"
      };

      return res.json({ result });
    }

    // ---------- STAGE 3: ACTION PLAN ----------
    if (
      systemInstruction.includes(
        "triage action-planning engine"
      )
    ) {
      const result = {
        urgency: "monitor",
        urgency_reason:
          "The available information is limited. Consider monitoring symptoms and contacting a healthcare professional if they continue or worsen.",

        recommended_actions: [
          "Monitor your symptoms.",
          "Stay hydrated and rest.",
          "Contact a healthcare professional if symptoms persist or worsen.",
          "Seek emergency care if severe or life-threatening symptoms develop."
        ],

        avoid: [
          "Do not ignore rapidly worsening symptoms.",
          "Do not take unfamiliar medication without professional advice."
        ],

        what_to_tell_a_clinician:
          "Explain your symptoms, when they started, any medications you take, allergies, and relevant medical history."
      };

      return res.json({ result });
    }

    return res.status(400).json({
      error: "Unknown processing stage"
    });

  } catch (error) {
    console.error("Backend error:", error);

    res.status(500).json({
      error: error.message || "Backend processing failed"
    });
  }
});

// Simple symptom extraction for demo
function extractComplaint(text) {
  const symptoms = [
    "fever",
    "headache",
    "cough",
    "cold",
    "chest pain",
    "stomach pain",
    "abdominal pain",
    "vomiting",
    "nausea",
    "dizziness",
    "sore throat",
    "body pain",
    "fatigue"
  ];

  const found = symptoms.filter((symptom) =>
    text.includes(symptom)
  );

  if (found.length > 0) {
    return found.join(", ");
  }

  return "Symptoms provided by the user";
}

// Render provides the PORT automatically
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Sahaay-AI backend running on port ${PORT}`);
});
