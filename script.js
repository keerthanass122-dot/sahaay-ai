// ============================================================
// TriageBridge — Three-Stage Gemini Pipeline
// Stage 1: Extraction
// Stage 2: Verification
// Stage 3: Action Plan
//
// Gemini is called through the deployed backend.
// Gemini API key is NOT stored in this frontend.
// ============================================================


// ============================================================
// BACKEND
// ============================================================

const BACKEND_URL = "https://sahaay-ai-back.onrender.com";


// ============================================================
// DOM ELEMENTS
// ============================================================

const symptomsEl = document.getElementById("symptoms");
const historyEl = document.getElementById("history");

const photoEl = document.getElementById("photo");
const photoPreviewWrap =
  document.getElementById("photoPreviewWrap");
const photoPreview =
  document.getElementById("photoPreview");

const micBtn = document.getElementById("micBtn");
const micStatus = document.getElementById("micStatus");

const runBtn = document.getElementById("runBtn");
const runStatus = document.getElementById("runStatus");

let photoBase64 = null;
let photoMimeType = null;


// ============================================================
// SMALL HELPERS
// ============================================================

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeString(value, fallback = "unknown") {
  if (value === null || value === undefined) {
    return fallback;
  }

  return String(value);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


// ============================================================
// VOICE INPUT
// ============================================================

const SpeechRecognition =
  window.SpeechRecognition ||
  window.webkitSpeechRecognition;

let recognizer = null;
let recording = false;

if (SpeechRecognition) {
  recognizer = new SpeechRecognition();

  recognizer.continuous = false;
  recognizer.interimResults = false;
  recognizer.lang = "en-US";

  recognizer.onresult = (e) => {
    const transcript =
      e.results?.[0]?.[0]?.transcript || "";

    symptomsEl.value =
      (symptomsEl.value
        ? symptomsEl.value + " "
        : "") + transcript;
  };

  recognizer.onend = () => {
    recording = false;

    if (micBtn) {
      micBtn.classList.remove("recording");
    }

    if (micStatus) {
      micStatus.textContent = "";
    }
  };

  recognizer.onerror = (e) => {
    recording = false;

    if (micBtn) {
      micBtn.classList.remove("recording");
    }

    if (micStatus) {
      micStatus.textContent =
        "Voice input error: " + e.error;
    }
  };
} else {
  if (micBtn) {
    micBtn.disabled = true;
  }

  if (micStatus) {
    micStatus.textContent =
      "Voice input is not supported in this browser — type instead.";
  }
}


if (micBtn) {
  micBtn.addEventListener("click", () => {
    if (!recognizer || recording) {
      return;
    }

    recording = true;

    micBtn.classList.add("recording");

    if (micStatus) {
      micStatus.textContent = "Listening…";
    }

    recognizer.start();
  });
}


// ============================================================
// PHOTO INPUT
// ============================================================

if (photoEl) {
  photoEl.addEventListener("change", () => {
    const file = photoEl.files?.[0];

    if (!file) {
      return;
    }

    photoMimeType = file.type;

    const reader = new FileReader();

    reader.onload = () => {
      const result = String(reader.result || "");

      if (result.includes(",")) {
        photoBase64 = result.split(",")[1];
      } else {
        photoBase64 = result;
      }

      if (photoPreview) {
        photoPreview.src = result;
      }

      if (photoPreviewWrap) {
        photoPreviewWrap.hidden = false;
      }
    };

    reader.readAsDataURL(file);
  });
}


// ============================================================
// GEMINI BACKEND CALL
// ============================================================

async function callGemini({
  systemInstruction,
  userParts
}) {
  const res = await fetch(
    `${BACKEND_URL}/api/gemini`,
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json"
      },

      body: JSON.stringify({
        systemInstruction,
        userParts
      })
    }
  );

  if (!res.ok) {
    const errText = await res.text();

    throw new Error(
      `Backend error (${res.status}): ${errText}`
    );
  }

  const data = await res.json();

  if (!data || data.result === undefined) {
    throw new Error(
      "Backend response does not contain a result."
    );
  }

  return data.result;
}


// ============================================================
// STAGE UI
// ============================================================

function setStage(id, state, flagText) {
  const stage = document.getElementById(id);

  if (!stage) {
    return;
  }

  stage.dataset.state = state;

  const flag = document.getElementById(
    id + "flag"
  );

  if (flag) {
    flag.textContent = flagText;
  }
}


// ============================================================
// STAGE 1 — EXTRACTION
// ============================================================

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
          symptomsEl?.value || "(none provided)"
        }\n\n` +

        `Pasted medical history: ${
          historyEl?.value || "(none provided)"
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

  const normalized = normalizeStage1(result);

  renderStage1(normalized);

  setStage(
    "stage1",
    "done",
    "extracted"
  );

  return normalized;
}


// ============================================================
// NORMALIZE STAGE 1
// ============================================================

function normalizeStage1(data) {
  data = data || {};

  return {
    chief_complaint:
      safeString(data.chief_complaint),

    symptom_onset:
      safeString(data.symptom_onset),

    current_medications:
      safeArray(data.current_medications),

    known_allergies:
      safeArray(data.known_allergies),

    existing_conditions:
      safeArray(data.existing_conditions),

    photo_observations:
      safeString(data.photo_observations),

    unclear_or_missing:
      safeArray(data.unclear_or_missing)
  };
}


// ============================================================
// RENDER STAGE 1
// ============================================================

function renderStage1(data) {
  const body =
    document.getElementById("stage1body");

  if (!body) {
    return;
  }

  body.innerHTML = "";

  const medications =
    safeArray(data.current_medications);

  const allergies =
    safeArray(data.known_allergies);

  const conditions =
    safeArray(data.existing_conditions);

  const unclear =
    safeArray(data.unclear_or_missing);

  const rows = [
    [
      "Chief complaint",
      safeString(data.chief_complaint)
    ],

    [
      "Onset",
      safeString(data.symptom_onset)
    ],

    [
      "Medications",
      medications.length
        ? medications.join(", ")
        : "none reported"
    ],

    [
      "Allergies",
      allergies.length
        ? allergies.join(", ")
        : "none reported"
    ],

    [
      "Conditions",
      conditions.length
        ? conditions.join(", ")
        : "none reported"
    ],

    [
      "Photo shows",
      safeString(data.photo_observations)
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
        ${escapeHtml(
          safeString(value)
        )}
      </span>
    `;

    body.appendChild(row);
  }

  if (unclear.length > 0) {
    const note =
      document.createElement("p");

    note.className = "hint";

    note.textContent =
      "Flagged as unclear: " +
      unclear.join(", ");

    body.appendChild(note);
  }
}


// ============================================================
// STAGE 2 — VERIFICATION
// ============================================================

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

  const normalized =
    normalizeStage2(result);

  renderStage2(normalized);

  setStage(
    "stage2",
    "done",
    `${normalized.overall_risk} risk`
  );

  return normalized;
}


// ============================================================
// NORMALIZE STAGE 2
// ============================================================

function normalizeStage2(data) {
  data = data || {};

  return {
    flags: safeArray(data.flags).map(
      (flag) => ({
        issue: safeString(
          flag?.issue,
          "Unknown issue"
        ),

        severity:
          ["low", "medium", "high"].includes(
            flag?.severity
          )
            ? flag.severity
            : "low",

        reasoning: safeString(
          flag?.reasoning,
          "No reasoning provided."
        )
      })
    ),

    overall_risk:
      ["low", "medium", "high"].includes(
        data.overall_risk
      )
        ? data.overall_risk
        : "low"
  };
}


// ============================================================
// RENDER STAGE 2
// ============================================================

function renderStage2(data) {
  const body =
    document.getElementById("stage2body");

  if (!body) {
    return;
  }

  body.innerHTML = "";

  const flags = safeArray(data.flags);

  if (flags.length === 0) {
    const empty =
      document.createElement("p");

    empty.className = "hint";

    empty.textContent =
      "No medication or allergy conflicts detected.";

    body.appendChild(empty);

    return;
  }

  for (const flag of flags) {
    const row =
      document.createElement("div");

    row.className = "fact-row";

    row.innerHTML = `
      <div>
        <strong>
          ${escapeHtml(
            safeString(
              flag.issue,
              "Unknown issue"
            )
          )}
        </strong>

        <span class="risk-badge ${escapeHtml(
          flag.severity
        )}">
          ${escapeHtml(
            flag.severity.toUpperCase()
          )}
        </span>
      </div>

      <div class="fact-value">
        ${escapeHtml(
          safeString(
            flag.reasoning,
            "No reasoning provided."
          )
        )}
      </div>
    `;

    body.appendChild(row);
  }
}


// ============================================================
// STAGE 3 — ACTION PLAN
// ============================================================

const STAGE3_SYSTEM = `
You are a cautious medical action-plan assistant.

You receive:

1. Extracted patient facts.
2. Verification results.

Create a safe, non-diagnostic action plan.

Output ONLY JSON matching this exact schema:

{
  "urgency": "routine"|"soon"|"urgent",
  "recommended_actions": string[],
  "questions_for_clinician": string[],
  "red_flags": string[],
  "disclaimer": string
}

Rules:

- Do not diagnose.
- Do not prescribe medications.
- Do not recommend changing medication doses.
- Do not invent patient information.
- Use concise and practical recommendations.
- If serious warning signs are present, mention seeking urgent medical attention.
- If there are no known red flags, return an empty red_flags array.
- Always include a short disclaimer.
`;


async function runStage3(
  stage1Data,
  stage2Data
) {
  setStage(
    "stage3",
    "running",
    "planning…"
  );

  const parts = [
    {
      text: JSON.stringify({
        extracted_facts: stage1Data,
        verification: stage2Data
      })
    }
  ];

  const result = await callGemini({
    systemInstruction: STAGE3_SYSTEM,
    userParts: parts
  });

  const normalized =
    normalizeStage3(result);

  renderStage3(normalized);

  setStage(
    "stage3",
    "done",
    normalized.urgency
  );

  return normalized;
}


// ============================================================
// NORMALIZE STAGE 3
// ============================================================

function normalizeStage3(data) {
  data = data || {};

  return {
    urgency:
      ["routine", "soon", "urgent"].includes(
        data.urgency
      )
        ? data.urgency
        : "routine",

    recommended_actions:
      safeArray(data.recommended_actions),

    questions_for_clinician:
      safeArray(data.questions_for_clinician),

    red_flags:
      safeArray(data.red_flags),

    disclaimer:
      safeString(
        data.disclaimer,
        "This information is for guidance only and is not a diagnosis."
      )
  };
}


// ============================================================
// RENDER STAGE 3
// ============================================================

function renderStage3(data) {
  const body =
    document.getElementById("stage3body");

  if (!body) {
    return;
  }

  body.innerHTML = "";

  // -------------------------
  // Urgency
  // -------------------------

  const urgency =
    document.createElement("div");

  urgency.className = "fact-row";

  urgency.innerHTML = `
    <span class="fact-label">
      Urgency
    </span>

    <span class="fact-value">
      ${escapeHtml(
        data.urgency.toUpperCase()
      )}
    </span>
  `;

  body.appendChild(urgency);


  // -------------------------
  // Recommended actions
  // -------------------------

  const actions =
    safeArray(
      data.recommended_actions
    );

  if (actions.length > 0) {
    const heading =
      document.createElement("h4");

    heading.textContent =
      "Recommended actions";

    body.appendChild(heading);

    const list =
      document.createElement("ul");

    for (const action of actions) {
      const item =
        document.createElement("li");

      item.textContent =
        safeString(action);

      list.appendChild(item);
    }

    body.appendChild(list);
  }


  // -------------------------
  // Questions for clinician
  // -------------------------

  const questions =
    safeArray(
      data.questions_for_clinician
    );

  if (questions.length > 0) {
    const heading =
      document.createElement("h4");

    heading.textContent =
      "Questions for clinician";

    body.appendChild(heading);

    const list =
      document.createElement("ul");

    for (const question of questions) {
      const item =
        document.createElement("li");

      item.textContent =
        safeString(question);

      list.appendChild(item);
    }

    body.appendChild(list);
  }


  // -------------------------
  // Red flags
  // -------------------------

  const redFlags =
    safeArray(data.red_flags);

  if (redFlags.length > 0) {
    const heading =
      document.createElement("h4");

    heading.textContent =
      "Red flags";

    body.appendChild(heading);

    const list =
      document.createElement("ul");

    for (const flag of redFlags) {
      const item =
        document.createElement("li");

      item.textContent =
        safeString(flag);

      list.appendChild(item);
    }

    body.appendChild(list);
  }


  // -------------------------
  // Disclaimer
  // -------------------------

  const disclaimer =
    document.createElement("p");

  disclaimer.className = "hint";

  disclaimer.textContent =
    data.disclaimer;

  body.appendChild(disclaimer);
}


// ============================================================
// RUN ALL THREE STAGES
// ============================================================

async function runPipeline() {
  if (runBtn) {
    runBtn.disabled = true;
  }

  if (runStatus) {
    runStatus.textContent =
      "Running TriageBridge…";
  }

  try {
    // -------------------------
    // Stage 1
    // -------------------------

    const stage1Data =
      await runStage1();


    // -------------------------
    // Stage 2
    // -------------------------

    const stage2Data =
      await runStage2(
        stage1Data
      );


    // -------------------------
    // Stage 3
    // -------------------------

    await runStage3(
      stage1Data,
      stage2Data
    );


    if (runStatus) {
      runStatus.textContent =
        "Analysis completed successfully.";
    }

  } catch (error) {
    console.error(
      "TriageBridge error:",
      error
    );

    if (runStatus) {
      runStatus.textContent =
        "Error: " +
        error.message;
    }

    // Mark running stages as failed
    ["stage1", "stage2", "stage3"].forEach(
      (id) => {
        const stage =
          document.getElementById(id);

        if (
          stage &&
          stage.dataset.state === "running"
        ) {
          setStage(
            id,
            "error",
            "error"
          );
        }
      }
    );

  } finally {
    if (runBtn) {
      runBtn.disabled = false;
    }
  }
}


// ============================================================
// RUN BUTTON
// ============================================================

if (runBtn) {
  runBtn.addEventListener(
    "click",
    runPipeline
  );
}