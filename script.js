
// TriageBridge — three-stage Gemini pipeline
// Stage 1: Extraction
// Stage 2: Verification
// Stage 3: Action plan
//
// Gemini is called through the deployed backend.
// The Gemini API key is NOT stored in this frontend file.

// ---------- BACKEND ----------
// Production backend deployed on Render
const BACKEND_URL = "const BACKEND_URL = "http://localhost:5000";";

// ---------- DOM ----------
const symptomsEl = document.getElementById("symptoms");
const historyEl = document.getElementById("history");
const photoEl = document.getElementById("photo");
const photoPreviewWrap = document.getElementById("photoPreviewWrap");
const photoPreview = document.getElementById("photoPreview");
const micBtn = document.getElementById("micBtn");
const micStatus = document.getElementById("micStatus");
const runBtn = document.getElementById("runBtn");
const runStatus = document.getElementById("runStatus");

let photoBase64 = null;
let photoMimeType = null;

// ---------- Voice input ----------
const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition;

let recognizer = null;
let recording = false;

if (SpeechRecognition) {
  recognizer = new SpeechRecognition();

  recognizer.continuous = false;
  recognizer.interimResults = false;
  recognizer.lang = "en-US";

  recognizer.onresult = (e) => {
    const transcript = e.results[0][0].transcript;

    symptomsEl.value =
      (symptomsEl.value ? symptomsEl.value + " " : "") +
      transcript;
  };

  recognizer.onend = () => {
    recording = false;

    micBtn.classList.remove("recording");
    micStatus.textContent = "";
  };

  recognizer.onerror = (e) => {
    recording = false;

    micBtn.classList.remove("recording");

    micStatus.textContent =
      "Voice input error: " + e.error;
  };
} else {
  micBtn.disabled = true;

  micStatus.textContent =
    "Voice input not supported in this browser — type instead.";
}

micBtn.addEventListener("click", () => {
  if (!recognizer || recording) return;

  recording = true;

  micBtn.classList.add("recording");

  micStatus.textContent = "Listening…";

  recognizer.start();
});

// ---------- Photo input ----------
photoEl.addEventListener("change", () => {
  const file = photoEl.files[0];

  if (!file) return;

  photoMimeType = file.type;

  const reader = new FileReader();

  reader.onload = () => {
    // Convert image into base64 data
    photoBase64 = reader.result.split(",")[1];

    photoPreview.src = reader.result;

    photoPreviewWrap.hidden = false;
  };

  reader.readAsDataURL(file);
});

// ---------- Gemini call helper ----------
// Frontend → Render Backend → Gemini
//
// IMPORTANT:
// The Gemini API key is kept ONLY on the backend.

async function callGemini({ systemInstruction, userParts }) {
  const res = await fetch(`${BACKEND_URL}/api/gemini`, {
    method: "POST",

    headers: {
      "Content-Type": "application/json"
    },

    body: JSON.stringify({
      systemInstruction,
      userParts
    })
  });

  if (!res.ok) {
    const errText = await res.text();

    throw new Error(
      `Backend error (${res.status}): ${errText}`
    );
  }

  const data = await res.json();

  return data.result;
}

// ---------- Stage UI helpers ----------
function setStage(id, state, flagText) {
  const stage = document.getElementById(id);

  stage.dataset.state = state;

  document.getElementById(id + "flag").textContent =
    flagText;
}

// ---------- STAGE 1: Extraction ----------

const STAGE1_SYSTEM = `
You are a medical intake extraction engine.

You read messy, unstructured input including:
- free text symptoms
- medical history
- optionally an image

Output ONLY a JSON object matching this exact schema:

{
  "chief_complaint": string,
  "symptom_onset": string,
  "current_medications": string[],
  "known_allergies": string[],
  "existing_conditions": string[],
  "photo_observations": string,
  "unclear_or_missing": string[]
}

Rules:
- Never invent medication names, dosages, or conditions.
- If a field cannot be determined, use "unknown" for strings.
- Use an empty array when no information is available.
- Extract information from all provided sources.
- Do not diagnose.
- Only extract and structure what is stated or visually evident.
`;

async function runStage1() {
  setStage(
    "stage1",
    "running",
    "extracting…"
  );

  const parts = [
    {
      text:
        `Symptom description: ${
          symptomsEl.value || "(none provided)"
        }\n\n` +
        `Pasted medical history: ${
          historyEl.value || "(none provided)"
        }`
    }
  ];

  if (photoBase64) {
    parts.push({
      inlineData: {
        mimeType: photoMimeType,
        data: photoBase64
      }
    });

    parts.push({
      text:
        "The image above is part of the intake. Describe what it shows in photo_observations."
    });
  }

  const result = await callGemini({
    systemInstruction: STAGE1_SYSTEM,
    userParts: parts
  });

  renderStage1(result);

  setStage(
    "stage1",
    "done",
    "extracted"
  );

  return result;
}

function renderStage1(data) {
  const body =
    document.getElementById("stage1body");

  body.innerHTML = "";

  const rows = [
    [
      "Chief complaint",
      data.chief_complaint
    ],
    [
      "Onset",
      data.symptom_onset
    ],
    [
      "Medications",
      (data.current_medications || []).join(", ") ||
        "none reported"
    ],
    [
      "Allergies",
      (data.known_allergies || []).join(", ") ||
        "none reported"
    ],
    [
      "Conditions",
      (data.existing_conditions || []).join(", ") ||
        "none reported"
    ],
    [
      "Photo shows",
      data.photo_observations
    ]
  ];

  for (const [label, value] of rows) {
    const row =
      document.createElement("div");

    row.className = "fact-row";

    row.innerHTML = `
      <span class="fact-label">
        ${escapeHtml(label)}
      </span>

      <span class="fact-value">
        ${escapeHtml(String(value ?? "unknown"))}
      </span>
    `;

    body.appendChild(row);
  }

  if (
    data.unclear_or_missing &&
    data.unclear_or_missing.length
  ) {
    const note =
      document.createElement("p");

    note.className = "hint";

    note.textContent =
      "Flagged as unclear: " +
      data.unclear_or_missing.join(", ");

    body.appendChild(note);
  }
}

// ---------- STAGE 2: Verification ----------

const STAGE2_SYSTEM = `
You are a clinical safety verification engine.

You receive structured patient facts that have already been extracted.

Check ONLY for:
- drug-drug interactions among current medications
- drug-allergy conflicts
- condition-medication conflicts

Output ONLY JSON matching this schema:

{
  "flags": [
    {
      "issue": string,
      "severity": "low"|"medium"|"high",
      "reasoning": string
    }
  ],
  "overall_risk": "low"|"medium"|"high"
}

Rules:
- Do not invent interactions.
- If you are not confident an interaction is real, omit it.
- Base severity on clinical seriousness.
- If nothing is detected, return an empty flags array and overall_risk "low".
- Keep each reasoning to one short sentence.
`;

async function runStage2(stage1Data) {
  setStage(
    "stage2",
    "running",
    "checking…"
  );

  const parts = [
    {
      text: JSON.stringify(stage1Data)
    }
  ];

  const result = await callGemini({
    systemInstruction: STAGE2_SYSTEM,
    userParts: parts
  });

  renderStage2(result);

  setStage(
    "stage2",
    "done",
    result.overall_risk + " risk"
  );

  return result;
}

function renderStage2(data) {
  const body =
    document.getElementById("stage2body");

  body.
