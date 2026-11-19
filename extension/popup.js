const solveBtn = document.getElementById("solve");
const statusEl = document.getElementById("status");
const resultEl = document.getElementById("result");
const previewEl = document.getElementById("preview");
const debugPanel = document.getElementById("debug-panel");
const debugModel = document.getElementById("debug-model");
const debugVision = document.getElementById("debug-vision-output");
const modelSelect = document.getElementById("model-select");
const visionModelSelect = document.getElementById("vision-model-select");

function setDebugModel(modelName, path) {
  debugPanel.style.display = "block";
  debugModel.replaceChildren();
  const label = document.createElement("span");
  label.className = "debug-label";
  label.textContent = "final answer from";
  const name = document.createElement("span");
  name.className = "model-name";
  name.textContent = modelName;
  const pathEl = document.createElement("span");
  pathEl.className = "model-path";
  pathEl.textContent = `(${path})`;
  debugModel.append(label, name, pathEl);
}

function setDebugVision(text) {
  debugVision.replaceChildren();
  const label = document.createElement("span");
  label.className = "debug-label";
  label.textContent = "vision → calc ai";
  const vision = document.createElement("span");
  vision.className = "vision-text";
  vision.textContent = text || "—";
  debugVision.append(label, vision);
}

function clearDebug() {
  debugPanel.style.display = "none";
  debugModel.replaceChildren();
  debugVision.replaceChildren();
}

chrome.storage.local.get(
  ["groqApiKey", "groqModel", "groqVisionModel", "lastAnswer", "lastScreenshot", "currentQuestion", "lastDebugModel", "lastDebugPath", "lastDebugVision"],
  (result) => {
    if (result.groqApiKey) document.getElementById("api-key").value = result.groqApiKey;
    if (result.groqModel) modelSelect.value = result.groqModel;
    if (result.groqVisionModel) visionModelSelect.value = result.groqVisionModel;
    if (result.lastAnswer) setResult(result.lastAnswer);
    if (result.lastScreenshot) {
      const img = document.createElement("img");
      img.src = result.lastScreenshot;
      previewEl.replaceChildren(img);
    }
    if (result.currentQuestion) setStatus(`Current: ${result.currentQuestion}`);
    if (result.lastDebugModel) {
      setDebugModel(result.lastDebugModel, result.lastDebugPath || "");
      setDebugVision(result.lastDebugVision || "");
    }
  }
);

document.getElementById("saveKey").addEventListener("click", () => {
  const key = document.getElementById("api-key").value.trim();
  chrome.storage.local.set({ groqApiKey: key });
});

modelSelect.addEventListener("change", () => {
  chrome.storage.local.set({ groqModel: modelSelect.value });
});

visionModelSelect.addEventListener("change", () => {
  chrome.storage.local.set({ groqVisionModel: visionModelSelect.value });
});

document.getElementById("refreshModels").addEventListener("click", async () => {
  const apiKey = document.getElementById("api-key").value.trim();
  if (!apiKey) return setResult("enter your groq api key first.");
  const btn = document.getElementById("refreshModels");
  const statusEl2 = document.getElementById("modelsStatus");
  btn.disabled = true;
  btn.textContent = "loading...";
  statusEl2.innerText = "fetching models...";
  try {
    const response = await fetch("https://api.groq.com/openai/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    if (!response.ok) throw new Error("failed to fetch models");
    const data = await response.json();
    const models = (data.data || []).map(m => m.id).sort();
    const visionModels = models.filter(m =>
      m.toLowerCase().includes("vision") || m.toLowerCase().includes("scout")
    );
    const textModels = models.filter(m =>
      !m.toLowerCase().includes("vision") && !m.toLowerCase().includes("scout")
    );

    function fillSelect(select, options, currentValue) {
      select.replaceChildren();
      options.forEach(m => {
        const o = document.createElement("option");
        o.value = m;
        o.textContent = m;
        select.appendChild(o);
      });
      if (currentValue && options.includes(currentValue)) {
        select.value = currentValue;
      } else if (options.length > 0) {
        select.value = options[0];
      }
    }

    fillSelect(visionModelSelect, visionModels.length > 0 ? visionModels : models, visionModelSelect.value);
    fillSelect(modelSelect, textModels.length > 0 ? textModels : models, modelSelect.value);

    chrome.storage.local.set({ groqModel: modelSelect.value, groqVisionModel: visionModelSelect.value });
    statusEl2.innerText = `loaded ${models.length} models`;
  } catch (err) {
    console.error(err);
    statusEl2.innerText = "error: " + err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = "refresh models";
  }
});

function setStatus(msg) { statusEl.innerText = msg; }
function setResult(msg) { resultEl.innerText = msg; }
function setLoading(on) { solveBtn.disabled = on; }

function showBoxes() {
  statusEl.style.display = "block";
  previewEl.style.display = "block";
  resultEl.style.display = "block";
}

function hideBoxes() {
  statusEl.style.display = "none";
  previewEl.style.display = "none";
  resultEl.style.display = "none";
  debugPanel.style.display = "none";
}

solveBtn.addEventListener("click", async () => {
  const apiKey = document.getElementById("api-key").value.trim();
  if (!apiKey) return setResult("enter your groq api key first.");

  const solverModel = modelSelect.value;

  setLoading(true);
  showBoxes();
  setResult("");
  previewEl.replaceChildren();
  clearDebug();

  try {
    setStatus("taking screenshot...");
    const dataUrl = await captureScreenshot();
    const img = document.createElement("img");
    img.src = dataUrl;
    previewEl.replaceChildren(img);
    const base64 = dataUrl.split(",")[1];

    setStatus("reading question...");
    const questionText = await extractTextFromScreenshot(base64, apiKey);

    setStatus("solving...");

    const visionOutput = questionText;
    const { result: calcAnswer, model: usedModel } = await solveQuestion(questionText, apiKey, solverModel);
    const answer = calcAnswer;
    const usedPath = `${visionModelSelect.value} → ${solverModel}`;

    setDebugModel(usedModel, usedPath);
    setDebugVision(visionOutput ?? "(vision solved directly — no text relay)");
    chrome.storage.local.set({ lastDebugModel: usedModel, lastDebugPath: usedPath, lastDebugVision: visionOutput ?? "(vision solved directly)" });

    setResult(answer);
    setStatus(`done. | current: ${(await getStorage("currentQuestion")) ?? ""}`);

    chrome.storage.local.set({ lastAnswer: answer, lastScreenshot: dataUrl });

    chrome.storage.local.get(["bookwork", "currentQuestion"], (data) => {
      const bookwork = data.bookwork || [];
      const idx = bookwork.findLastIndex((e) => e.label === data.currentQuestion);
      if (idx !== -1) bookwork[idx].answer = answer;
      chrome.storage.local.set({ bookwork });
    });
  } catch (err) {
    console.error(err);
    setResult("error: " + err.message);
    setStatus("");
  } finally {
    setLoading(false);
  }
});

function getStorage(key) {
  return new Promise((resolve) => chrome.storage.local.get([key], (r) => resolve(r[key])));
}

function captureScreenshot() {
  return new Promise((resolve, reject) => {
    chrome.tabs.captureVisibleTab(null, { format: "jpeg", quality: 90 }, (dataUrl) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      resolve(dataUrl);
    });
  });
}

async function extractTextFromScreenshot(base64, apiKey) {
  const visionModel = visionModelSelect.value;
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: visionModelSelect.value,
      max_tokens: 1024,
      messages: [{
        role: "user",
        content: [
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64}` } },
          { type: "text", text: `You are describing a Sparx maths question to a blind solver AI. Extract the COMPLETE question including all numbers, variables, fractions (a/b), exponents (x^n), roots (sqrt(x)), and multiple parts (a, b, c). If there is a graph, diagram, shape, or any visual element: describe it in full detail — axis labels, scale, plotted points/lines/curves, coordinates, angles, dimensions, shaded regions, and anything else needed to solve the question without seeing the image. Return ONLY the question text and any visual description, nothing else. Your measurements should be exact, no approximates unless the question states they are approximate. If a calculation is needed to work out an exact measurement, complete that calculation. When reading where a line passes through a graph make sure it is correct and makes logical sense. If you cannot read the number on a graph, work it out from the numbers before and after it.` }
        ]
      }]
    })
  });
  const raw = await response.text();
  const data = JSON.parse(raw);
  if (!response.ok) throw new Error(data.error?.message || "Vision API error");
  return data.choices[0].message.content;
}

async function solveQuestion(questionText, apiKey, model) {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: model || "openai/gpt-oss-120b",
      max_tokens: 512,
      messages: [
        { role: "system", content: `You are an answer extractor. Return ONLY the final answer, nothing else. No steps, no working, no explanation, no sentences. Just the answer value. If multiple parts, use: a) ... b) ...` },
        { role: "user", content: `Return just the answer value. ${questionText}` }
      ]
    })
  });
  const raw = await response.text();
  const data = JSON.parse(raw);
  const modelName = data.model || model || "openai/gpt-oss-120b";
  console.log("solveQuestion model:", modelName, "| raw:", data.choices[0].message.content);
  if (!response.ok) throw new Error(data.error?.message || "Solver API error");
  return { result: cleanAnswer(data.choices[0].message.content), model: modelName };
}

async function solveWithVision(base64, apiKey) {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: visionModelSelect.value,
      max_tokens: 512,
      messages: [
        {
          role: "system",
          content: `You are an answer extractor. Return ONLY the final answer, nothing else. No steps, no working, no explanation, no sentences. Just the answer value. If multiple parts, use: a) ... b) ...`
        },
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64}` } },
            { type: "text", text: `What is the answer to this maths question? Return just the answer value.` }
          ]
        }
      ]
    })
  });
  const raw = await response.text();
  const data = JSON.parse(raw);
  const modelName = data.model || visionModelSelect.value;
  console.log("solveWithVision model:", modelName, "| raw:", data.choices[0].message.content);
  if (!response.ok) throw new Error(data.error?.message || "Vision solver error");
  return { result: cleanAnswer(data.choices[0].message.content), model: modelName };
}

function cleanAnswer(text) {
  try { text = decodeURIComponent(escape(text)); } catch {}
  text = text
    .replace(/â‰¤/g, "≤")
    .replace(/â‰¥/g, "≥")
    .replace(/â‰ /g, "≠")
    .replace(/Ã—/g, "×")
    .replace(/Ã·/g, "÷")
    .replace(/Ï€/g, "π")
    .replace(/â€"/g, "−");
  text = text.replace(/\\boxed\{([^}]+)\}/g, "$1");
  text = text.replace(/([^\s^]+)\^(-?\d+)/g, (_, base, exp) => {
    const superMap = {'0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹','-':'⁻'};
    return base + [...exp].map(c => superMap[c] ?? c).join('');
  });
  return text
    .trim()
    .replace(/\$\$?/g, "")
    .replace(/\\ge/g, "≥").replace(/\\le/g, "≤")
    .replace(/\\gt/g, ">").replace(/\\lt/g, "<")
    .replace(/\\neq/g, "≠").replace(/\\pm/g, "±")
    .replace(/\\times/g, "×").replace(/\\div/g, "÷")
    .replace(/\\infty/g, "∞").replace(/\\pi/g, "π")
    .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, "$1/$2")
    .replace(/\\sqrt\{([^}]+)\}/g, "sqrt($1)")
    .replace(/\^{([^}]+)}/g, "^$1")
    .replace(/\\/g, "")
    .trim();
}

function openTab(tabName) {
  document.querySelectorAll(".tabpanel").forEach((el) => (el.classList.remove("active")));
  document.querySelectorAll(".tablink").forEach((el) => el.classList.remove("active"));
  document.getElementById(tabName).classList.add("active");
  document.querySelector(`[data-tab="${tabName}"]`).classList.add("active");
  if (tabName === "bookwork") renderBookwork();
}

document.querySelectorAll(".tablink").forEach((btn) => {
  btn.addEventListener("click", () => openTab(btn.dataset.tab));
});

openTab("answer");

function renderBookwork() {
  chrome.storage.local.get(["bookwork"], (data) => {
    const bookwork = data.bookwork || [];

    const filtered = bookwork.filter(e =>
      e.label?.length > 1 && e.answer != null && e.answer !== "..."
    );

    if (filtered.length !== bookwork.length) {
      chrome.storage.local.set({ bookwork: filtered }, () => renderBookwork());
      return;
    }

    const el = document.getElementById("bookwork");
    el.replaceChildren();

    const clearBtn = document.createElement("button");
    clearBtn.id = "clearBookwork";
    clearBtn.className = "btn btn-danger";
    clearBtn.textContent = "clear bookwork";
    el.appendChild(clearBtn);

    const list = document.createElement("div");
    list.className = "bookwork-list";
    el.appendChild(list);

    if (filtered.length === 0) {
      const empty = document.createElement("p");
      empty.className = "bookwork-empty";
      empty.textContent = "no questions yet.";
      list.appendChild(empty);
    } else {
      [...filtered].reverse().forEach((e) => {
        const div = document.createElement("div");
        div.className = "bookwork-item";
        const strong = document.createElement("strong");
        strong.className = "bookwork-label";
        strong.textContent = e.label;
        const span = document.createElement("span");
        span.className = "bookwork-answer";
        span.textContent = e.answer;
        div.append(strong, span);
        list.appendChild(div);
      });
    }

    document.getElementById("clearBookwork").addEventListener("click", () => {
      chrome.storage.local.remove(["bookwork"], () => renderBookwork());
    });
  });
}
