import { ensureJsPdf } from "./libLoader.js";
import { showToast } from "./toast.js";
import { downloadBlob, safeFileName } from "./exportExcel.js";

const INK = [20, 18, 14], GOLD = [201, 162, 39], CREAM = [243, 239, 228];
const FILL = { P: [220, 234, 217], A: [243, 217, 217], E: [245, 227, 191] };
const TXT = { P: [76, 122, 76], A: [156, 59, 59], E: [160, 100, 20] };

/**
 * Pure builder (testable in Node). Portrait A4. Ride columns are split into
 * bands so the table stays readable; each band repeats Name + summary.
 * model: { seasonName, filterLabel, generatedAt, rides:[{label}], 
 *          rows:[{group, name, symbols:[P|A|E|""], attended, total, pct}] }
 * runTable(doc, options) -> runs autoTable.
 */
export function buildAttendancePdf(doc, runTable, model) {
  const { rides, rows } = model;
  const M = 10, pageW = doc.internal.pageSize.getWidth();
  const SUMW = 11, NAMEW = 38, RIDEW = 8.2;
  const perBand = Math.max(1, Math.floor((pageW - 2 * M - NAMEW - 3 * SUMW) / RIDEW));
  const bands = [];
  for (let i = 0; i < Math.max(rides.length, 1); i += perBand) bands.push([i, Math.min(rides.length, i + perBand)]);

  // Title block
  doc.setFillColor(...INK); doc.rect(0, 0, pageW, 24, "F");
  doc.setTextColor(...GOLD); doc.setFont("helvetica", "bold"); doc.setFontSize(15);
  doc.text("COMMANDERS LEMC  |  UAE CHAPTER", M, 11);
  doc.setFontSize(9); doc.setTextColor(...CREAM); doc.setFont("helvetica", "normal");
  doc.text(`Attendance - ${model.seasonName}   |   ${model.filterLabel}   |   ${rides.length} ride(s), ${rows.length} member(s)`, M, 17.5);
  doc.setFontSize(7.5);
  doc.text(`Generated ${model.generatedAt}`, M, 21.5);
  doc.setTextColor(...INK);
  let y = 30;
  doc.setFontSize(8);
  doc.text("P = Attended    A = Missed    E = Excused    blank = not marked    Total excludes excused rides    % = Attended / Total", M, y);
  y += 4;

  bands.forEach(([from, to], bi) => {
    const slice = rides.slice(from, to);
    const head = [["Name", ...slice.map((r) => r.label), "Att", "Tot", "%"]];
    const body = [];
    let lastGroup = null;
    rows.forEach((r) => {
      if (r.group && r.group !== lastGroup) {
        body.push([{ content: r.group.toUpperCase(), colSpan: slice.length + 4, styles: { fillColor: INK, textColor: GOLD, fontStyle: "bold", halign: "left" } }]);
        lastGroup = r.group;
      }
      body.push([r.name, ...r.symbols.slice(from, to), String(r.attended), String(r.total), r.pct === null ? "-" : Math.round(r.pct * 100) + "%"]);
    });
    if (!rows.length) body.push([{ content: "No members match this filter.", colSpan: slice.length + 4 }]);

    if (bands.length > 1) {
      doc.setFontSize(9); doc.setFont("helvetica", "bold");
      doc.text(`Rides ${from + 1}-${to} of ${rides.length}`, M, y + 3);
      doc.setFont("helvetica", "normal");
      y += 5;
    }

    const colStyles = { 0: { cellWidth: NAMEW, halign: "left" } };
    slice.forEach((_, i) => { colStyles[i + 1] = { cellWidth: RIDEW }; });
    const sc = slice.length + 1;
    colStyles[sc] = { cellWidth: SUMW, fontStyle: "bold" };
    colStyles[sc + 1] = { cellWidth: SUMW, fontStyle: "bold" };
    colStyles[sc + 2] = { cellWidth: SUMW, fontStyle: "bold" };

    runTable(doc, {
      head, body, startY: y,
      margin: { left: M, right: M, top: 14, bottom: 14 },
      theme: "grid",
      styles: { font: "helvetica", fontSize: 7.5, cellPadding: 1.3, halign: "center", valign: "middle", lineColor: [190, 184, 165], lineWidth: 0.1, overflow: "ellipsize" },
      headStyles: { fillColor: INK, textColor: GOLD, fontSize: 6.5, halign: "center", cellPadding: 1 },
      columnStyles: colStyles,
      showHead: "everyPage",
      rowPageBreak: "avoid",
      didParseCell(d) {
        if (d.section !== "body" || d.column.index < 1 || d.column.index > slice.length) return;
        const v = d.cell.raw;
        if (FILL[v]) { d.cell.styles.fillColor = FILL[v]; d.cell.styles.textColor = TXT[v]; d.cell.styles.fontStyle = "bold"; }
        if (d.column.index === 0) d.cell.styles.halign = "left";
      },
    });
    y = doc.lastAutoTable.finalY + 8;
    if (bi < bands.length - 1 && y > doc.internal.pageSize.getHeight() - 40) { doc.addPage(); y = 16; }
  });

  const pages = doc.internal.getNumberOfPages();
  const h = doc.internal.pageSize.getHeight();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFontSize(7.5); doc.setTextColor(120, 114, 96);
    doc.text("GOLD BLACK NATION  |  RESPECT ALL... FEAR NONE", M, h - 6);
    doc.text(`Page ${p} of ${pages}`, pageW - M, h - 6, { align: "right" });
  }
  return doc;
}

export async function exportAttendancePdf(model, filename) {
  try {
    if (!(await ensureJsPdf())) {
      showToast("Couldn't load the PDF library. Check your connection or ad-blocker and try again.", "error", 7000);
      return false;
    }
    const doc = new window.jspdf.jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    buildAttendancePdf(doc, (d, o) => d.autoTable(o), model);
    downloadBlob(doc.output("blob"), safeFileName(filename));
    return true;
  } catch (err) {
    console.error("PDF export failed:", err);
    showToast("PDF export failed: " + (err && err.message ? err.message : err), "error", 7000);
    return false;
  }
}
