if (!globalThis.__pageGrooveContentInitialized) {
  globalThis.__pageGrooveContentInitialized = true;

  const MAX_HASH_SAMPLES = 50000;

  let lastMetricsSignature = "";

  function count(selector) {
    return document.querySelectorAll(selector).length;
  }

  function debounce(fn, delayMs) {
    let timeoutId = null;

    return (...args) => {
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => fn(...args), delayMs);
    };
  }

  function stableHash(parts) {
    let hash = 0x811c9dc5;

    for (const part of parts) {
      const value = String(part || "");
      const stride = Math.max(1, Math.floor(value.length / MAX_HASH_SAMPLES));

      for (let index = 0; index < value.length; index += stride) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
      }

      hash ^= value.length;
      hash = Math.imul(hash, 0x01000193);
    }

    return hash >>> 0;
  }

  function computeMaxDepth(root) {
    if (!root) {
      return 0;
    }

    let maxDepth = 1;
    const stack = [[root, 1]];

    while (stack.length > 0) {
      const [node, depth] = stack.pop();
      maxDepth = Math.max(maxDepth, depth);

      for (let index = node.children.length - 1; index >= 0; index -= 1) {
        stack.push([node.children[index], depth + 1]);
      }
    }

    return maxDepth;
  }

  function collectMetrics() {
    const html = document.documentElement?.outerHTML || "";
    const text = document.body?.innerText || "";
    const metrics = {
      url: window.location.href,
      hostname: window.location.hostname,
      title: document.title || window.location.hostname || "Untitled page",
      htmlLength: html.length,
      textLength: text.length,
      headings: count("h1, h2, h3, h4, h5, h6"),
      links: document.links.length,
      images: document.images.length,
      forms: document.forms.length,
      buttons: count("button, input[type='button'], input[type='submit']"),
      listItems: count("li"),
      scripts: document.scripts.length,
      domNodes: document.getElementsByTagName("*").length,
      maxDepth: computeMaxDepth(document.body || document.documentElement)
    };

    metrics.hash = stableHash([
      metrics.url,
      metrics.title,
      html,
      metrics.textLength,
      metrics.links,
      metrics.images,
      metrics.maxDepth
    ]);

    return metrics;
  }

  function reportMetrics(reason = "update") {
    const metrics = collectMetrics();
    const signature = `${metrics.url}:${metrics.hash}`;

    if (signature === lastMetricsSignature) {
      return metrics;
    }

    lastMetricsSignature = signature;

    chrome.runtime
      .sendMessage({
        type: "PAGE_METRICS",
        reason,
        metrics
      })
      .catch(() => {});

    return metrics;
  }

  const reportMetricsDebounced = debounce((reason) => reportMetrics(reason), 1200);

  function patchHistoryMethod(methodName) {
    const originalMethod = history[methodName];

    history[methodName] = function patchedHistoryState(...args) {
      const result = originalMethod.apply(this, args);
      reportMetricsDebounced(methodName);
      return result;
    };
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "REQUEST_PAGE_METRICS") {
      sendResponse(collectMetrics());
    }
  });

  window.addEventListener("load", () => {
    reportMetrics("load");
  });

  window.addEventListener("hashchange", () => {
    reportMetrics("hashchange");
  });

  window.addEventListener("popstate", () => {
    reportMetrics("popstate");
  });

  document.addEventListener("readystatechange", () => {
    if (document.readyState === "complete") {
      reportMetrics("ready");
    }
  });

  window.addEventListener("yt-navigate-finish", () => {
    reportMetricsDebounced("yt-navigate-finish");
  });

  patchHistoryMethod("pushState");
  patchHistoryMethod("replaceState");

  reportMetrics("boot");
}
