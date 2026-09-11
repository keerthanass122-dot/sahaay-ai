
// TriageBridge — three-stage Gemini pipeline
// Stage 1: Extraction
// Stage 2: Verification
// Stage 3: Action plan
//
// Gemini is now called through the backend.
// The Gemini API key is NOT stored in this frontend file.

// Backend URL for local testing
const BACKEND_URL = "http://localhost:5000";

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

// ---------- Voice input (Web Speech API) ----------
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
      (symptomsEl.value ? symptomsEl.value + " " : "") + transcript;
  };

  recognizer.onend = () => {
    recording = false;
    micBtn.classList.remove("recording");
    micStatus.textContent = "";
  };

  recognizer.onerror = (e) => {
    micStatus.textContent = "Voice input error: " + e.error;
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
    // reader.result:
    // data:image/png;base64,AAAA...
    photoBase64 = reader.result.split(",")[1];

    photoPreview.src = reader.result;
    photoPreviewWrap.hidden = false;
  };

  reader.readAsDataURL(file);
});

// ---------- Gemini call helper ----------
// Frontend -> Backend -> Gemini
//
// IMPORTANT:
// The Gemini API key is NOT used here.
// The backend keeps the API key securely in .env.

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

  document.getElementById(id + "flag").textContent = flagText;
}

// ---------- STAGE 1: Extraction ----------

const STAGE1_SYSTEM = `You are a medical intake extraction engine. You read messy, unstructured input 
(free text symptoms, informally pasted medical history, and optionally a photo) and output ONLY 
a JSON object matching this exact schema — no prose, no markdown fences: 

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
- Never invent a medication name, dosage, or condition that is not stated or clearly shown. 
- If a field cannot be determined from the input, use "unknown" for strings or an empty array. 
- Extract from ALL provided sources: the symptom text, the pasted history text, and the photo if present. 
- Do not diagnose. Only extract and structure what is stated or visually evident.`;

async function runStage1() {
  setStage("stage1", "running", "extracting…");

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
        "The image above is part of the intake — describe what it shows in photo_observations."
    });
  }

  const result = await callGemini({
    systemInstruction: STAGE1_SYSTEM,
    userParts: parts
  });

  renderStage1(result);

  setStage("stage1", "done", "extracted");

  return result;
}

function renderStage1(data) {
  const body = document.getElementById("stage1body");

  body.innerHTML = "";

  const rows = [
    ["Chief complaint", data.chief_complaint],
    ["Onset", data.symptom_onset],
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
    ["Photo shows", data.photo_observations]
  ];

  for (const [label, value] of rows) {
    const row = document.createElement("div");

    row.className = "fact-row";

    row.innerHTML = `
      <span class="fact-label">${escapeHtml(label)}</span>
      <span class="fact-value">${escapeHtml(String(value))}</span>
    `;

    body.appendChild(row);
  }

  if (data.unclear_or_missing?.length) {
    const note = document.createElement("p");

    note.className = "hint";

    note.textContent =
      "Flagged as unclear: " +
      data.unclear_or_missing.join(", ");

    body.appendChild(note);
  }
}

// ---------- STAGE 2: Verification ----------

const STAGE2_SYSTEM = `You are a clinical safety verification engine. You receive structured patient facts 
(already extracted — do not re-extract or add new facts) and check ONLY for: 
- drug-drug interactions among current_medications 
- drug-allergy conflicts between current_medications and known_allergies 
- condition-medication conflicts (e.g. a medication contraindicated for a stated condition) 

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
- If you are not confident an interaction is real, do not fabricate it — omit it. 
- Base severity on real-world clinical seriousness, not on how many facts are present. 
- If there is nothing to flag, return an empty flags array and overall_risk "low". 
- Keep each reasoning to one short sentence.`;

async function runStage2(stage1Data) {
  setStage("stage2", "running", "checking…");

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
  const body = document.getElementById("stage2body");

  body.innerHTML = "";

  if (!data.flags || data.flags.length === 0) {
    body.innerHTML =
      `<p class="hint">No interactions or conflicts detected from the given facts.</p>`;

    return;
  }

  for (const flag of data.flags) {
    const div = document.createElement("div");

    div.className =
      `flag-item severity-${flag.severity}`;

    div.innerHTML = `
      <strong>${escapeHtml(flag.issue)}</strong>
      <br>
      ${escapeHtml(flag.reasoning)}
    `;

    body.appendChild(div);
  }
}

// ---------- STAGE 3: Action plan ----------

const STAGE3_SYSTEM = `You are a triage action-planning engine. You receive verified structured patient 
facts and a list of safety flags. Produce a clear action plan for a non-medical person to follow. 

Output ONLY JSON matching this schema: 

{ 
  "urgency": "routine" | "monitor" | "urgent", 
  "urgency_reason": string, 
  "recommended_actions": string[], 
  "avoid": string[], 
  "what_to_tell_a_clinician": string 
} 

Urgency guide: 
- "urgent": call emergency services or go to an ER now. 
- "monitor": see a doctor soon (within 24-48h) and watch for specific warning signs. 
- "routine": self-care appropriate, follow up if symptoms persist. 

Rules: 
- Base urgency on overall_risk and the flags — never downplay a high-severity flag. 
- "avoid" must list concrete things NOT to do, not vague caution. 
- Keep language plain, calm, and directive. 
- Never state a diagnosis. Describe actions, not conclusions about disease.`;

async function runStage3(stage1Data, stage2Data) {
  setStage("stage3", "running", "planning…");

  const parts = [
    {
      text: JSON.stringify({
        facts: stage1Data,
        verification: stage2Data
      })
    }
  ];

  const result = await callGemini({
    systemInstruction: STAGE3_SYSTEM,
    userParts: parts
  });

  renderStage3(result);

  setStage("stage3", "done", result.urgency);

  return result;
}

function renderStage3(data) {
  const body = document.getElementById("stage3body");

  body.innerHTML = "";

  const banner = document.createElement("div");

  banner.className =
    `urgency-banner ${data.urgency}`;

  const labels = {
    routine: "Routine — self-care",
    monitor: "Monitor — see a doctor soon",
    urgent: "Urgent — seek care now"
  };

  banner.textContent =
    labels[data.urgency] || data.urgency;

  body.appendChild(banner);

  const reason = document.createElement("p");

  reason.textContent = data.urgency_reason;

  body.appendChild(reason);

  const actionsTitle = document.createElement("p");

  actionsTitle.innerHTML =
    "<strong>Recommended actions</strong>";

  body.appendChild(actionsTitle);

  const ul = document.createElement("ul");

  ul.className = "action-list";

  (data.recommended_actions || []).forEach((a) => {
    const li = document.createElement("li");

    li.textContent = a;

    ul.appendChild(li);
  });

  body.appendChild(ul);

  if (data.avoid?.length) {
    const avoidDiv = document.createElement("div");

    avoidDiv.className = "avoid-list";

    avoidDiv.innerHTML = `
      <strong>Avoid</strong>
      <ul class="action-list">
        ${data.avoid
          .map(
            (a) =>
              `<li>${escapeHtml(a)}</li>`
          )
          .join("")}
      </ul>
    `;

    body.appendChild(avoidDiv);
  }

  const tellDiv = document.createElement("p");

  tellDiv.innerHTML = `
    <strong>Tell a clinician:</strong>
    ${escapeHtml(data.what_to_tell_a_clinician)}
  `;

  body.appendChild(tellDiv);
}

// ---------- Orchestration ----------

runBtn.addEventListener("click", async () => {
  runBtn.disabled = true;

  runStatus.textContent = "";

  [1, 2, 3].forEach((n) => {
    setStage(
      `stage${n}`,
      "pending",
      "waiting"
    );
  });

  document
    .querySelectorAll(".stage-body")
    .forEach((el) => {
      el.innerHTML = "";
    });

  try {
    const stage1 = await runStage1();

    const stage2 = await runStage2(stage1);

    await runStage3(stage1, stage2);

    runStatus.textContent =
      "Pipeline complete.";
  } catch (err) {
    console.error(err);

    runStatus.textContent =
      "Error: " + err.message;

    document
      .querySelectorAll(
        '.stage[data-state="running"]'
      )
      .forEach((s) => {
        s.dataset.state = "error";

        s.querySelector(
          ".stage-flag"
        ).textContent = "failed";
      });
  } finally {
    runBtn.disabled = false;
  }
});

// ---------- utils ----------

function escapeHtml(str) {
  const div = document.createElement("div");

  div.textContent = str;

  return div.innerHTML;
}

