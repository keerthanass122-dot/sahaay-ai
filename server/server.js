
const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));

// ---------- HOME ----------
app.get("/", (req, res) => {
  res.json({
    message: "Sahaay-AI backend is running!"
  });
});

// ---------- DEMO AI ENDPOINT ----------
// No API key required
app.post("/api/gemini", async (req, res) => {
  try {
    const { systemInstruction, userParts } = req.body || {};

    if (!systemInstruction || !Array.isArray(userParts)) {
      return res.status(400).json({
        error: "Missing or invalid systemInstruction/userParts"
      });
    }

    const inputText = JSON.stringify(userParts).toLowerCase();

    // ==========================================
    // STAGE 1: EXTRACTION
    // ==========================================
    if (
      systemInstruction.includes(
        "medical intake extraction engine"
      )
    ) {
      const result = {
        chief_complaint: extractComplaint(inputText),

        symptom_onset:
          "Not clearly provided",

        current_medications: [],

        known_allergies: [],

        existing_conditions: [],

        photo_observations:
          "No specific observation available",

        unclear_or_missing: [
          "Medication information",
          "Allergy information",
          "Medical history details"
        ]
      };

      return res.json({
        result
      });
    }

    // ==========================================
    // STAGE 2: VERIFICATION
    // ==========================================
    if (
      systemInstruction.includes(
        "clinical safety verification engine"
      )
    ) {
      const result = {
        flags: [],

        overall_risk: "low"
      };

      return res.json({
        result
      });
    }

    // ==========================================
// STAGE 3: ACTION PLAN
// ==========================================
if (
  systemInstruction.includes(
    "cautious medical action-plan assistant"
  )
) {
  const result = {
    urgency: "routine",

    recommended_actions: [
      "Monitor your symptoms.",
      "Stay hydrated and rest.",
      "Contact a healthcare professional if symptoms persist or worsen.",
      "Seek emergency care if severe or life-threatening symptoms develop."
    ],

    questions_for_clinician: [
      "When did the symptoms start?",
      "Have the symptoms become better or worse?",
      "Are you currently taking any medications?",
      "Do you have any known allergies or existing medical conditions?"
    ],

    red_flags: [],

    disclaimer:
      "This information is for guidance only and is not a diagnosis."
  };

  return res.json({
    result
  });
}