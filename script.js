// =========================
// Simple Mood Tracker + Gemini AI Integration
// =========================

const STORAGE_KEY = "mf_mood_entries_v1";

function qs(sel) { return document.querySelector(sel); }
function qsa(sel) { return Array.from(document.querySelectorAll(sel)); }

const moods = qsa(".mood");
const noteEl = qs("#note");
const saveBtn = qs("#saveBtn");
const clearBtn = qs("#clearBtn");
const historyList = qs("#historyList");
const avgMoodEl = qs("#avgMood");
const streakEl = qs("#streak");
const entriesCountEl = qs("#entriesCount");
const sparkCanvas = qs("#sparkline");
const historyRange = qs("#historyRange");
const exportBtn = qs("#exportBtn");
const clearAllBtn = qs("#clearAllBtn");
const aiContainer = qs("#ai-container");
const activitiesContainer = qs("#recommendations .chips");

let selectedMood = null;

// ------------------------
// Quick activities data (per mood)
// ------------------------
const defaultActivities = [
  "2-minute breathing",
  "Gratitude: 1 thing",
  "Walk for 5 min",
  "Stretch",
  "Write 1 sentence",
];

const activitiesByMood = {
  1: [
    "Slow 2-minute breathing",
    "Drink a glass of water",
    "Message someone you trust",
    "Write 1 thing that’s hard right now",
  ],
  2: [
    "Short walk (3–5 min)",
    "Note 1 thing that went okay today",
    "Gentle stretching for 2 min",
  ],
  3: [
    "Gratitude: 2 small things",
    "Plan 1 nice thing for later",
    "Tidy one small area",
  ],
  4: [
    "Celebrate 1 win from today",
    "Do something fun for 5 min",
    "Send a kind message to someone",
  ],
  5: [
    "Capture this mood in 1 sentence",
    "Do a quick dance or stretch",
    "Start a small project you’ve been delaying",
  ],
};

// ------------------------
// Loading helpers
// ------------------------
function showLoading() {
  aiContainer.innerHTML = `
    <div class="ai-loading">
      <span class="spinner"></span>
      <span>Preparing a response…</span>
    </div>
  `;
  saveBtn.disabled = true;
  clearBtn.disabled = true;
}

function hideLoading() {
  saveBtn.disabled = false;
  clearBtn.disabled = false;
}

// ------------------------
// Mood button click handler
// ------------------------
moods.forEach((btn) => {
  btn.addEventListener("click", () => {
    selectedMood = Number(btn.dataset.value);
    moods.forEach((b) => b.setAttribute("aria-pressed", "false"));
    btn.setAttribute("aria-pressed", "true");

    // Update quick activities based on currently selected mood
    renderActivities(selectedMood);
  });
});

// ------------------------
// Save Entry + Send to Gemini AI
// ------------------------
saveBtn.addEventListener("click", async () => {
  if (!selectedMood) {
    alert("Please select your mood (tap an emoji).");
    return;
  }

  const note = noteEl.value.trim();

  // Save entry in history
  const entry = { value: selectedMood, note, date: new Date().toISOString() };
  const entries = readEntries();
  entries.unshift(entry);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));

  // Show loading state before calling the server
  showLoading();

  // Send to Gemini for feedback
  try {
    const res = await fetch("http://localhost:3000/ai-response", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ moodValue: selectedMood, note }),
    });

    const data = await res.json();
    hideLoading();
    showAIMessage(data.reply || "✨ AI replied but no text was returned.");
  } catch (e) {
    hideLoading();
    showAIMessage("AI unavailable right now, but you’re doing great ❤️");
  }

  resetForm();
  render();
});

// ------------------------
// Clear input form
// ------------------------
clearBtn.addEventListener("click", resetForm);

// ------------------------
// Export to CSV
// ------------------------
exportBtn.addEventListener("click", () => {
  const entries = readEntries();
  if (!entries.length) {
    alert("No entries to export.");
    return;
  }
  const csv = toCSV(entries);
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "mood_entries.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

// ------------------------
// Clear all entries
// ------------------------
clearAllBtn.addEventListener("click", () => {
  if (!confirm("Clear ALL entries? This cannot be undone.")) return;
  localStorage.removeItem(STORAGE_KEY);
  render();
});

// ------------------------
// Date range selection
// ------------------------
historyRange.addEventListener("change", render);

// ------------------------
// Read saved entries
// ------------------------
function readEntries() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch (e) {
    return [];
  }
}

// ------------------------
// Reset form fields
// ------------------------
function resetForm() {
  selectedMood = null;
  noteEl.value = "";
  moods.forEach((b) => b.setAttribute("aria-pressed", "false"));
}

// ------------------------
// Render history + stats
// ------------------------
function render() {
  const all = readEntries();
  const range = Number(historyRange.value);
  const shown = range === 365 ? all : all.slice(0, range);

  // History items
  historyList.innerHTML = "";
  if (!shown.length)
    historyList.innerHTML = '<li class="muted">No entries yet — try a check-in.</li>';
  shown.forEach((e) => {
    const li = document.createElement("li");
    const moodEmoji = ["", "😞", "😕", "😐", "🙂", "😄"][e.value] || "—";
    const time = new Date(e.date);
    li.innerHTML = `
      <div><strong>${moodEmoji}</strong> ${
        e.note ? escapeHtml(e.note) : '<span class="muted">(no note)</span>'
      }</div>
      <div><time>${time.toLocaleString()}</time></div>`;
    historyList.appendChild(li);
  });

  // Stats
  entriesCountEl.textContent = all.length;
  const last30 = all.slice(0, 30);
  if (last30.length) {
    const avg = (
      last30.reduce((s, a) => s + a.value, 0) / last30.length
    ).toFixed(2);
    avgMoodEl.textContent = avg;
  } else {
    avgMoodEl.textContent = "—";
  }

  streakEl.textContent = calcStreak(all);

  drawSparkline(
    all.slice(0, 30).map((e) => e.value).reverse()
  );

  // Choose mood for activities:
  // - if user has selected a mood now, use that
  // - else, if there is history, use the most recent entry's mood
  // - else, default list
  let moodForActivities = selectedMood;
  if (!moodForActivities && all.length) {
    moodForActivities = all[0].value;
  }
  renderActivities(moodForActivities);
}

// ------------------------
// Escape HTML
// ------------------------
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

// ------------------------
// Streak calculation
// ------------------------
function calcStreak(entries) {
  if (!entries.length) return 0;
  const daysWith = new Set(
    entries.map((e) => new Date(e.date).toISOString().slice(0, 10))
  );
  let streak = 0;
  let d = new Date();
  while (true) {
    const key = d.toISOString().slice(0, 10);
    if (daysWith.has(key)) streak++;
    else break;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

// ------------------------
// Convert to CSV
// ------------------------
function toCSV(entries) {
  const header = ["date", "mood", "note"];
  const lines = [header.join(",")];
  entries
    .slice()
    .reverse()
    .forEach((e) => {
      const date = new Date(e.date).toISOString();
      const note = (e.note || "").replace(/\"/g, '"').replace(/\n/g, " ");
      lines.push([date, e.value, `"${note.replace(/"/g, '""')}"`].join(","));
    });
  return lines.join("\n");
}

// ------------------------
// Draw small trend graph
// ------------------------
function drawSparkline(values) {
  const c = sparkCanvas;
  const ctx = c.getContext("2d");
  const w = c.width;
  const h = c.height;
  ctx.clearRect(0, 0, w, h);
  if (!values.length) return;

  const max = 5, min = 1;

  ctx.lineWidth = 2;
  ctx.beginPath();
  values.forEach((v, i) => {
    const x = (i / (values.length - 1 || 1)) * (w - 10) + 5;
    const y = h - ((v - min) / (max - min)) * (h - 12) - 6;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = "#6c5ce7";
  ctx.stroke();

  values.forEach((v, i) => {
    const x = (i / (values.length - 1 || 1)) * (w - 10) + 5;
    const y = h - ((v - min) / (max - min)) * (h - 12) - 6;
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#6c5ce7";
    ctx.lineWidth = 1.5;
    ctx.fill();
    ctx.stroke();
  });
}

// ------------------------
// Display AI message
// ------------------------
function showAIMessage(message) {
  const box = document.createElement("div");
  box.className = "ai-message";
  box.innerHTML = `<p>${message}</p>`;
  aiContainer.innerHTML = "";
  aiContainer.appendChild(box);
}

// ------------------------
// Render quick activities
// ------------------------
function renderActivities(moodValue) {
  const list = activitiesByMood[moodValue] || defaultActivities;
  activitiesContainer.innerHTML = "";

  list.forEach((label) => {
    const btn = document.createElement("button");
    btn.className = "chip";
    btn.textContent = label;

    // Optional: simple behavior when clicking an activity
    btn.addEventListener("click", () => {
      // Example: add it as a suggestion in the note field
      if (!noteEl.value.includes(label)) {
        noteEl.value = noteEl.value
          ? noteEl.value + " | " + label
          : label;
      }
    });

    activitiesContainer.appendChild(btn);
  });
}

// Init first render
render();
