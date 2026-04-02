import {
  DENSITY_OPTIONS,
  DEFAULT_TRACK_SETTINGS,
  NOTE_NAMES,
  SCALE_LIBRARY,
  TEMPO_PRESET_VALUES,
  normalizeTrackSettings
} from "./music-map.js";

const SIMPLE_TEMPO_OPTIONS = [
  { value: "auto", label: "Auto" },
  { value: "slow", label: "Slow" },
  { value: "medium", label: "Medium" },
  { value: "fast", label: "Fast" }
];

const SIMPLE_TEMPO_TO_BPM = {
  slow: 84,
  medium: 108,
  fast: 132
};

const ADVANCED_MODE_STORAGE_KEY = "pagegroove:advancedMode";

function isSupportedUrl(url = "") {
  return /^https?:\/\//i.test(url);
}

function withFallback(value, fallback = "-") {
  return value === null || value === undefined || value === "" ? fallback : value;
}

function tempoSettingToSimpleValue(tempo) {
  if (tempo === null || tempo === undefined) {
    return "auto";
  }

  if (tempo < 90) {
    return "slow";
  }

  if (tempo < 120) {
    return "medium";
  }

  return "fast";
}

function simpleTempoLabel(tempo) {
  const simpleValue = tempoSettingToSimpleValue(tempo);
  return SIMPLE_TEMPO_OPTIONS.find((option) => option.value === simpleValue)?.label || "Auto";
}

function loadAdvancedModePreference() {
  try {
    return globalThis.localStorage?.getItem(ADVANCED_MODE_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function persistAdvancedModePreference(enabled) {
  try {
    globalThis.localStorage?.setItem(ADVANCED_MODE_STORAGE_KEY, enabled ? "true" : "false");
  } catch {
    // Ignore storage failures in the popup UI.
  }
}

const uiState = {
  advancedMode: loadAdvancedModePreference()
};

const elements = {
  toggleButton: document.getElementById("toggleButton"),
  statusDot: document.getElementById("statusDot"),
  statusText: document.getElementById("statusText"),
  trackTitle: document.getElementById("trackTitle"),
  trackHost: document.getElementById("trackHost"),
  volumeSlider: document.getElementById("volumeSlider"),
  volumeValue: document.getElementById("volumeValue"),
  advancedModeToggle: document.getElementById("advancedModeToggle"),
  advancedModeValue: document.getElementById("advancedModeValue"),
  detailGrid: document.getElementById("detailGrid"),
  tempoValue: document.getElementById("tempoValue"),
  densityValue: document.getElementById("densityValue"),
  moodValue: document.getElementById("moodValue"),
  rootCard: document.getElementById("rootCard"),
  rootValue: document.getElementById("rootValue"),
  theoryHint: document.getElementById("theoryHint"),
  seedValue: document.getElementById("seedValue"),
  tempoSimpleSetting: document.getElementById("tempoSimpleSetting"),
  tempoSetting: document.getElementById("tempoSetting"),
  keySetting: document.getElementById("keySetting"),
  densitySetting: document.getElementById("densitySetting"),
  moodSetting: document.getElementById("moodSetting")
};

const SELECT_OPTIONS = {
  simpleTempo: SIMPLE_TEMPO_OPTIONS,
  exactTempo: [
    { value: "auto", label: "Auto" },
    ...TEMPO_PRESET_VALUES.map((tempo) => ({
      value: String(tempo),
      label: `${tempo} BPM`
    }))
  ],
  density: DENSITY_OPTIONS,
  key: [
    { value: "auto", label: "Auto" },
    ...NOTE_NAMES.map((note) => ({
      value: note,
      label: note
    }))
  ],
  mood: [
    { value: "auto", label: "Auto" },
    ...SCALE_LIBRARY.map((scale) => ({
      value: scale.mood,
      label: `${scale.mood} (${scale.name})`
    }))
  ]
};

function populateSelect(selectElement, options) {
  selectElement.textContent = "";

  for (const option of options) {
    const optionElement = document.createElement("option");
    optionElement.value = option.value;
    optionElement.textContent = option.label;
    selectElement.append(optionElement);
  }
}

function initializeControls() {
  populateSelect(elements.tempoSimpleSetting, SELECT_OPTIONS.simpleTempo);
  populateSelect(elements.tempoSetting, SELECT_OPTIONS.exactTempo);
  populateSelect(elements.keySetting, SELECT_OPTIONS.key);
  populateSelect(elements.densitySetting, SELECT_OPTIONS.density);
  populateSelect(elements.moodSetting, SELECT_OPTIONS.mood);
}

function applyAdvancedMode(enabled) {
  uiState.advancedMode = Boolean(enabled);
  elements.advancedModeToggle.checked = uiState.advancedMode;
  elements.advancedModeValue.textContent = uiState.advancedMode ? "On" : "Off";
  elements.detailGrid.classList.toggle("advanced-mode", uiState.advancedMode);
  elements.rootCard.hidden = !uiState.advancedMode;
  elements.theoryHint.hidden = !uiState.advancedMode;
  elements.tempoSimpleSetting.hidden = uiState.advancedMode;
  elements.tempoSimpleSetting.disabled = uiState.advancedMode;
  elements.tempoSetting.hidden = !uiState.advancedMode;
  elements.tempoSetting.disabled = !uiState.advancedMode;
}

async function getPopupState() {
  const [state, activeTabs] = await Promise.all([
    chrome.runtime.sendMessage({
      type: "GET_STATE"
    }),
    chrome.tabs.query({
      active: true,
      lastFocusedWindow: true
    })
  ]);

  return {
    state,
    activeTab: activeTabs[0] || null
  };
}

function renderVolume(volume) {
  const safeVolume = Number.isFinite(Number(volume)) ? Math.min(100, Math.max(0, Math.round(Number(volume)))) : 62;
  elements.volumeSlider.value = String(safeVolume);
  elements.volumeValue.textContent = `${safeVolume}%`;
}

function renderSettings(settingsInput) {
  const settings = normalizeTrackSettings(settingsInput || DEFAULT_TRACK_SETTINGS);

  elements.tempoSimpleSetting.value = tempoSettingToSimpleValue(settings.tempo);
  elements.tempoSetting.value = settings.tempo === null ? "auto" : String(settings.tempo);
  elements.keySetting.value = settings.key;
  elements.densitySetting.value = settings.density;
  elements.moodSetting.value = settings.mood;
}

function render({ state, activeTab }) {
  const supported = isSupportedUrl(activeTab?.url || "");
  const track = state.lastTrack;
  const settings = normalizeTrackSettings(state.settings || DEFAULT_TRACK_SETTINGS);
  const selectedScaleName =
    settings.mood === "auto"
      ? null
      : SCALE_LIBRARY.find((scale) => scale.mood === settings.mood)?.name || null;
  const playing = state.enabled && track?.status === "Playing" && supported;
  const tempoDisplayValue = uiState.advancedMode
    ? Number.isFinite(track?.tempo)
      ? `${track.tempo} BPM`
      : settings.tempo === null
        ? "Auto"
        : `${settings.tempo} BPM`
    : track?.tempoFeel || (settings.tempo === null ? "Auto" : simpleTempoLabel(settings.tempo));
  const densityDisplayValue =
    track?.density ||
    (settings.density === "auto"
      ? "Auto"
      : SELECT_OPTIONS.density.find((option) => option.value === settings.density)?.label || settings.density);
  const moodDisplayValue =
    uiState.advancedMode && track?.mood && track?.mode
      ? `${track.mood} (${track.mode})`
      : track?.mood || (settings.mood === "auto" ? "Auto" : settings.mood);
  const rootDisplayValue = track?.rootNote || (settings.key === "auto" ? "Auto" : settings.key);
  const theoryDisplayValue =
    track?.theoryKey ||
    (settings.key !== "auto" && selectedScaleName ? `${settings.key} ${selectedScaleName}` : "Auto");

  elements.toggleButton.textContent = state.enabled ? "Stop Groove" : "Play This Page";
  elements.toggleButton.disabled = !supported && !state.enabled;
  elements.statusText.textContent = supported
    ? track?.status || (state.enabled ? "Loading groove" : "Ready")
    : "Chrome pages are not supported";
  elements.trackTitle.textContent = withFallback(track?.title, activeTab?.title || "Choose a page");
  elements.trackHost.textContent = supported
    ? withFallback(track?.hostname, activeTab ? new URL(activeTab.url).hostname : "current site")
    : "Open a regular website, then press play.";
  elements.tempoValue.textContent = withFallback(tempoDisplayValue);
  elements.densityValue.textContent = withFallback(densityDisplayValue);
  elements.moodValue.textContent = withFallback(moodDisplayValue);
  elements.rootValue.textContent = withFallback(rootDisplayValue);
  elements.theoryHint.textContent = `Key: ${withFallback(track?.key, rootDisplayValue)} • Theory: ${withFallback(theoryDisplayValue)}`;
  elements.seedValue.textContent = `Seed: ${withFallback(track?.seed)}`;
  elements.statusDot.classList.toggle("playing", Boolean(playing));
  renderVolume(state.volume);
  renderSettings(state.settings);
  applyAdvancedMode(uiState.advancedMode);
}

async function refresh() {
  render(await getPopupState());
}

async function updateSettings(patch) {
  await chrome.runtime.sendMessage({
    type: "UPDATE_SETTINGS",
    settings: patch
  });

  await refresh();
}

elements.toggleButton.addEventListener("click", async () => {
  elements.toggleButton.disabled = true;

  try {
    await chrome.runtime.sendMessage({
      type: "TOGGLE_ENABLED"
    });
  } finally {
    await refresh();
  }
});

elements.volumeSlider.addEventListener("input", () => {
  const volume = Number(elements.volumeSlider.value);
  renderVolume(volume);

  void chrome.runtime.sendMessage({
    type: "UPDATE_VOLUME",
    volume
  });
});

elements.advancedModeToggle.addEventListener("change", async () => {
  applyAdvancedMode(elements.advancedModeToggle.checked);
  persistAdvancedModePreference(uiState.advancedMode);
  await refresh();
});

elements.tempoSimpleSetting.addEventListener("change", async () => {
  const selectedValue = elements.tempoSimpleSetting.value;

  await updateSettings({
    tempo: selectedValue === "auto" ? null : SIMPLE_TEMPO_TO_BPM[selectedValue]
  });
});

elements.tempoSetting.addEventListener("change", async () => {
  await updateSettings({
    tempo: elements.tempoSetting.value === "auto" ? null : Number(elements.tempoSetting.value)
  });
});

elements.keySetting.addEventListener("change", async () => {
  await updateSettings({
    key: elements.keySetting.value
  });
});

elements.densitySetting.addEventListener("change", async () => {
  await updateSettings({
    density: elements.densitySetting.value
  });
});

elements.moodSetting.addEventListener("change", async () => {
  await updateSettings({
    mood: elements.moodSetting.value
  });
});

initializeControls();
applyAdvancedMode(uiState.advancedMode);
refresh();
