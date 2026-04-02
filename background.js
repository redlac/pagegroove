import {
  DEFAULT_TRACK_SETTINGS,
  deriveTrack,
  normalizeTrackSettings
} from "./music-map.js";

const STORAGE_KEY = "pageGrooveState";
const DEFAULT_STATE = {
  enabled: false,
  lastTrack: null,
  settings: DEFAULT_TRACK_SETTINGS,
  volume: 62
};
const METRICS_RETRY_DELAYS_MS = [0, 250, 800, 1800];

let offscreenCreation = null;
let latestSyncToken = 0;

function isSupportedUrl(url = "") {
  return /^https?:\/\//i.test(url);
}

function normalizeVolume(value) {
  const volume = Number(value);

  if (!Number.isFinite(volume)) {
    return DEFAULT_STATE.volume;
  }

  return Math.min(100, Math.max(0, Math.round(volume)));
}

async function getState() {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const storedState = stored[STORAGE_KEY] || {};

  return {
    ...DEFAULT_STATE,
    ...storedState,
    settings: normalizeTrackSettings(storedState.settings || {}),
    volume: normalizeVolume(storedState.volume)
  };
}

async function setState(patch) {
  const currentState = await getState();
  const nextState = {
    ...currentState,
    ...patch,
    settings: normalizeTrackSettings({
      ...currentState.settings,
      ...(patch.settings || {})
    }),
    volume: patch.volume === undefined ? currentState.volume : normalizeVolume(patch.volume)
  };

  await chrome.storage.local.set({
    [STORAGE_KEY]: nextState
  });

  return nextState;
}

async function ensureOffscreenDocument() {
  const documentUrl = chrome.runtime.getURL("offscreen.html");
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
    documentUrls: [documentUrl]
  });

  if (existingContexts.length > 0) {
    return;
  }

  if (!offscreenCreation) {
    offscreenCreation = chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: ["AUDIO_PLAYBACK"],
      justification: "Play deterministic background audio generated from the current page."
    });
  }

  try {
    await offscreenCreation;
  } finally {
    offscreenCreation = null;
  }
}

async function hasOffscreenDocument() {
  const documentUrl = chrome.runtime.getURL("offscreen.html");
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
    documentUrls: [documentUrl]
  });

  return existingContexts.length > 0;
}

async function sendToOffscreen(message, { createIfMissing = true } = {}) {
  if (createIfMissing) {
    await ensureOffscreenDocument();
  } else if (!(await hasOffscreenDocument())) {
    return null;
  }

  try {
    return await chrome.runtime.sendMessage(message);
  } catch (error) {
    console.warn("PageGroove: unable to message offscreen document", error);
    return null;
  }
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true
  });

  return tab || null;
}

async function getTab(tabId) {
  try {
    return await chrome.tabs.get(tabId);
  } catch (error) {
    return null;
  }
}

async function requestMetricsFromTab(tabId) {
  try {
    return await chrome.tabs.sendMessage(tabId, {
      type: "REQUEST_PAGE_METRICS"
    });
  } catch (error) {
    return null;
  }
}

async function injectContentScript(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"]
    });
    return true;
  } catch (error) {
    console.warn("PageGroove: unable to inject content script fallback", error);
    return false;
  }
}

function delay(ms) {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });
}

async function requestMetricsWithRecovery(tabId, expectedUrl, syncToken) {
  let injectedFallback = false;

  for (const delayMs of METRICS_RETRY_DELAYS_MS) {
    if (delayMs > 0) {
      await delay(delayMs);
    }

    if (syncToken !== latestSyncToken) {
      return null;
    }

    const currentTab = await getTab(tabId);

    if (!currentTab || currentTab.url !== expectedUrl || !currentTab.active) {
      return null;
    }

    const metrics = await requestMetricsFromTab(tabId);

    if (metrics) {
      return metrics;
    }

    if (!injectedFallback) {
      injectedFallback = await injectContentScript(tabId);
    }
  }

  return null;
}

async function stopPlayback(statusText = "Stopped") {
  await sendToOffscreen(
    {
      type: "STOP_TRACK"
    },
    {
      createIfMissing: false
    }
  );

  const state = await getState();
  const lastTrack = state.lastTrack
    ? {
        ...state.lastTrack,
        status: statusText
      }
    : null;

  return setState({
    lastTrack
  });
}

async function playTrackFromMetrics(metrics, settingsInput, volumeInput) {
  const settings = normalizeTrackSettings(settingsInput);
  const volume = normalizeVolume(volumeInput);
  const track = deriveTrack(metrics, settings);
  const response = await sendToOffscreen({
    type: "PLAY_TRACK",
    metrics,
    settings,
    volume
  });

  if (!response?.ok) {
    console.warn("PageGroove: offscreen play failed", response?.error || "unknown error");
    return setState({
      lastTrack: {
        ...track.summary,
        status: "Audio engine unavailable",
        pageUrl: metrics.url,
        appliedSettings: settings
      }
    });
  }

  return setState({
    lastTrack: {
      ...track.summary,
      status: "Playing",
      pageUrl: metrics.url,
      appliedSettings: settings
    },
    volume
  });
}

function isSamePageAsCurrentTrack(state, metrics) {
  return Boolean(
    state.lastTrack &&
      state.lastTrack.pageUrl === metrics.url &&
      state.lastTrack.status === "Playing"
  );
}

async function syncActiveTabWithOptions({ forceTrackRefresh = false } = {}) {
  const syncToken = ++latestSyncToken;
  const state = await getState();

  if (!state.enabled) {
    return stopPlayback("Stopped");
  }

  const activeTab = await getActiveTab();

  if (!activeTab?.id || !isSupportedUrl(activeTab.url || "")) {
    return stopPlayback("Open a regular web page to play");
  }

  const metrics = await requestMetricsWithRecovery(activeTab.id, activeTab.url, syncToken);

  if (syncToken !== latestSyncToken) {
    return getState();
  }

  if (!metrics) {
    const fallbackHostname = (() => {
      try {
        return new URL(activeTab.url).hostname;
      } catch (error) {
        return "unknown";
      }
    })();

    return setState({
      lastTrack: {
        title: activeTab.title || "Current page",
        hostname: fallbackHostname,
        tempo: null,
        key: null,
        density: null,
        mood: null,
        seed: null,
        status: "Waiting for page data",
        pageUrl: activeTab.url,
        appliedSettings: state.settings
      }
    });
  }

  if (!forceTrackRefresh && isSamePageAsCurrentTrack(state, metrics)) {
    return state;
  }

  return playTrackFromMetrics(metrics, state.settings, state.volume);
}

async function syncActiveTab() {
  return syncActiveTabWithOptions();
}

chrome.runtime.onInstalled.addListener(() => {
  void (async () => {
    const stored = await chrome.storage.local.get(STORAGE_KEY);

    if (!stored[STORAGE_KEY]) {
      await chrome.storage.local.set({
        [STORAGE_KEY]: DEFAULT_STATE
      });
    }
  })();
});

chrome.tabs.onActivated.addListener(() => {
  void syncActiveTab();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.active) {
    void syncActiveTab();
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GET_STATE") {
    void getState().then(sendResponse);
    return true;
  }

  if (message.type === "TOGGLE_ENABLED") {
    void (async () => {
      const currentState = await getState();
      const enabled =
        typeof message.enabled === "boolean" ? message.enabled : !currentState.enabled;

      await setState({
        enabled
      });

      if (enabled) {
        await syncActiveTabWithOptions({
          forceTrackRefresh: true
        });
      } else {
        await stopPlayback("Stopped");
      }

      sendResponse(await getState());
    })();

    return true;
  }

  if (message.type === "UPDATE_SETTINGS") {
    void (async () => {
      const nextState = await setState({
        settings: message.settings || {}
      });

      if (nextState.enabled) {
        await syncActiveTabWithOptions({
          forceTrackRefresh: true
        });
      }

      sendResponse({
        ok: true,
        state: await getState()
      });
    })();

    return true;
  }

  if (message.type === "UPDATE_VOLUME") {
    void (async () => {
      const volume = normalizeVolume(message.volume);
      const nextState = await setState({
        volume
      });

      if (nextState.enabled) {
        await sendToOffscreen(
          {
            type: "SET_VOLUME",
            volume
          },
          {
            createIfMissing: false
          }
        );
      }

      sendResponse({
        ok: true,
        state: await getState()
      });
    })();

    return true;
  }

  if (message.type === "PAGE_METRICS") {
    void (async () => {
      const state = await getState();
      const activeTab = await getActiveTab();

      if (!state.enabled || !sender.tab?.id || sender.tab.id !== activeTab?.id) {
        sendResponse({
          ignored: true
        });
        return;
      }

      if (isSamePageAsCurrentTrack(state, message.metrics)) {
        sendResponse({
          ignored: true,
          reason: "same-page"
        });
        return;
      }

      await playTrackFromMetrics(message.metrics, state.settings, state.volume);
      sendResponse({
        ok: true
      });
    })();

    return true;
  }

  return false;
});
