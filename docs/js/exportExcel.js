import { ensureXLSX } from "./libLoader.js";
import { showToast } from "./toast.js";

/** Excel sheet names: max 31 chars, none of  : \ / ? * [ ]  and not blank. */
export function safeSheetName(name, fallback = "Sheet1") {
  const cleaned = String(name ?? "").replace(/[:\\/?*\[\]]/g, "-").replace(/^'+|'+$/g, "").trim().slice(0, 31);
  return cleaned || fallback;
}

export function safeFileName(name) {
  return String(name).replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "_");
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * Exports sheets to a downloaded .xlsx file. Loads SheetJS on demand (with
 * fallback CDNs) and reports problems with a visible message.
 * sheets: [{ name, rows: [{Col: val}], percentCols?: ["Attendance %"] }]
 * Returns true on success.
 */
export async function exportToExcel(filename, sheets) {
  try {
    if (!(await ensureXLSX())) {
      showToast("Couldn't load the Excel library. Check your connection or ad-blocker and try again.", "error", 7000);
      return false;
    }
    const XLSX = window.XLSX;
    const wb = XLSX.utils.book_new();
    const used = new Set();
    sheets.forEach(({ name, rows, percentCols = [] }, i) => {
      const data = rows && rows.length ? rows : [{ " ": "No data" }];
      const ws = XLSX.utils.json_to_sheet(data);
      const headers = Object.keys(data[0]);
      ws["!cols"] = headers.map((h) => ({
        wch: Math.min(40, Math.max(String(h).length, ...data.map((r) => String(r[h] ?? "").length)) + 2),
      }));
      percentCols.forEach((col) => {
        const c = headers.indexOf(col);
        if (c < 0) return;
        for (let r = 1; r <= data.length; r++) {
          const cell = ws[XLSX.utils.encode_cell({ r, c })];
          if (cell && typeof cell.v === "number") cell.z = "0%";
        }
      });
      let sheetName = safeSheetName(name, `Sheet${i + 1}`);
      let n = 2;
      while (used.has(sheetName.toLowerCase())) sheetName = safeSheetName(name).slice(0, 28) + " " + n++;
      used.add(sheetName.toLowerCase());
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    });
    const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    downloadBlob(
      new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
      safeFileName(filename)
    );
    return true;
  } catch (err) {
    console.error("Excel export failed:", err);
    showToast("Excel export failed: " + (err && err.message ? err.message : err), "error", 7000);
    return false;
  }
}
