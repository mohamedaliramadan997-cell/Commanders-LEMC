/**
 * Loads third-party scripts on demand, trying several CDNs in order.
 * Avoids the old failure mode where a single blocked <script> tag made
 * Export silently do nothing.
 */
const cache = new Map();

function loadScript(url, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    const timer = setTimeout(() => { s.remove(); reject(new Error("timeout " + url)); }, timeoutMs);
    s.src = url;
    s.async = true;
    s.onload = () => { clearTimeout(timer); resolve(); };
    s.onerror = () => { clearTimeout(timer); s.remove(); reject(new Error("failed " + url)); };
    document.head.appendChild(s);
  });
}

export async function loadFirstWorking(urls, isReady) {
  if (isReady()) return true;
  for (const url of urls) {
    try {
      await loadScript(url);
      if (isReady()) return true;
    } catch (_) { /* try next CDN */ }
  }
  return false;
}

function once(key, fn) {
  if (!cache.has(key)) cache.set(key, fn().then((ok) => { if (!ok) cache.delete(key); return ok; }));
  return cache.get(key);
}

export function ensureXLSX() {
  return once("xlsx", () => loadFirstWorking([
    "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js",
    "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js",
    "https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js",
  ], () => typeof window.XLSX !== "undefined"));
}

export function ensureJsPdf() {
  return once("jspdf", async () => {
    const a = await loadFirstWorking([
      "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js",
      "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
      "https://unpkg.com/jspdf@2.5.1/dist/jspdf.umd.min.js",
    ], () => !!(window.jspdf && window.jspdf.jsPDF));
    if (!a) return false;
    return loadFirstWorking([
      "https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js",
      "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js",
      "https://unpkg.com/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js",
    ], () => typeof window.jspdf.jsPDF.API.autoTable === "function");
  });
}
