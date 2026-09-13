/**
 * Exports one or more sheets of row data to a downloaded .xlsx file.
 * Requires the SheetJS library to be loaded on the page first:
 *   <script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>
 *
 * sheets: [{ name: "Members", rows: [{Col1: val, Col2: val}, ...] }, ...]
 */
export function exportToExcel(filename, sheets) {
  if (typeof XLSX === "undefined") {
    alert("Excel export library did not load — check your internet connection and try again.");
    return;
  }
  const wb = XLSX.utils.book_new();
  sheets.forEach(({ name, rows }) => {
    const ws = XLSX.utils.json_to_sheet(rows && rows.length ? rows : [{ " ": "No data" }]);
    XLSX.utils.book_append_sheet(wb, ws, (name || "Sheet1").slice(0, 31));
  });
  XLSX.writeFile(wb, filename);
}
