import { supabase } from "./supabaseClient.js";
import { requireAuth, applyRoleVisibility, escapeHtml } from "./auth.js";
import { computeMemberStats, REQUIRED_STREAK } from "./streaks.js";
import { openModal, closeModal } from "./modal.js";
import { exportToExcel } from "./exportExcel.js";

const LEVELS = ["Full-Batch", "Prospect", "Hang-around", "Honor Member"];

let allMembers = [], allStats = [];

init();

async function init() {
  const session = await requireAuth();
  if (session) {
    applyRoleVisibility(session.profile.role);
    document.getElementById("export-dashboard-btn").addEventListener("click", exportDashboard);
    await loadDashboard();
  }
}

async function loadDashboard() {
  const { data: members } = await supabase.from("members").select("*");
  const { data: rides } = await supabase.from("rides").select("*").order("ride_date");
  const { data: attendance } = await supabase.from("attendance").select("*");
  const { data: submissions } = await supabase
    .from("intake_submissions")
    .select("id")
    .eq("reviewed", false);

  allMembers = members || [];
  allStats = allMembers.map((m) => computeMemberStats(m, rides || [], attendance || []));

  renderHeadcount();
  renderHealth(submissions ? submissions.length : 0);
  renderRanking();
  renderAttention();
}

// ============================================================
// HEADCOUNT — clickable boxes showing member names for that group
// ============================================================
function renderHeadcount() {
  const counts = Object.fromEntries(LEVELS.map((l) => [l, 0]));
  allMembers.forEach((m) => { counts[m.membership_level] = (counts[m.membership_level] || 0) + 1; });

  document.getElementById("headcount-grid").innerHTML =
    LEVELS.map((l) => clickableStatBox(counts[l] || 0, l + "s", l)).join("") +
    clickableStatBox(allMembers.length, "Total Roster", null);

  document.querySelectorAll("[data-level-box]").forEach((box) => {
    box.addEventListener("click", () => openLevelModal(box.dataset.levelBox || null));
  });
}

function clickableStatBox(num, label, level) {
  return `<div class="stat-box" data-level-box="${level || ""}" style="cursor:pointer;">
    <div class="num">${num}</div><div class="lbl">${label}</div>
  </div>`;
}

function openLevelModal(level) {
  const names = allMembers
    .filter((m) => !level || m.membership_level === level)
    .map((m) => m.full_name)
    .sort((a, b) => a.localeCompare(b));

  openModal(`
    <h2>${level ? escapeHtml(level) + "s" : "Total Roster"}</h2>
    <p style="color:#5a5748; font-size:13px;">${names.length} member${names.length === 1 ? "" : "s"}</p>
    <div style="max-height:50vh; overflow-y:auto;">
      ${names.map((n) => `<div style="padding:8px 0; border-bottom:1px solid var(--line);">${escapeHtml(n)}</div>`).join("") || "<p>No members.</p>"}
    </div>
    <div class="modal-actions">
      <a class="btn gold" href="members.html${level ? "?level=" + encodeURIComponent(level) : ""}" style="text-decoration:none; display:inline-block; text-align:center;">View Full Master Record</a>
      <button class="ghost" id="close-level-modal-btn">Close</button>
    </div>
  `);
  document.getElementById("close-level-modal-btn").addEventListener("click", () => closeModal());
}

// ============================================================
// ATTENDANCE HEALTH
// ============================================================
function renderHealth(submissionCount) {
  const pctValues = allStats.filter((s) => s.attendancePct !== null).map((s) => s.attendancePct);
  const avgPct = pctValues.length ? (pctValues.reduce((a, b) => a + b, 0) / pctValues.length) : 0;
  const readyCount = allStats.filter((s) => s.promotionStatus === "ready").length;
  const soonCount = allStats.filter((s) => s.promotionStatus === "soon").length;
  const warnCount = allStats.filter((s) => s.attendanceWarning).length;

  document.getElementById("health-grid").innerHTML =
    statBox((avgPct * 100).toFixed(1) + "%", "Chapter Attendance") +
    statBox(readyCount, "Ready for Promotion") +
    statBox(soonCount, "2 Rides Away") +
    statBox(warnCount, "Poor-Attendance Warnings") +
    statBox(submissionCount, "New Intake Submissions");
}

function statBox(num, label) {
  return `<div class="stat-box"><div class="num">${num}</div><div class="lbl">${label}</div></div>`;
}

// ============================================================
// ATTENDANCE RANKING — top 3 green, bottom 3 red
// ============================================================
function getRanking() {
  return allMembers
    .map((m, i) => ({ member: m, stats: allStats[i] }))
    .filter((x) => x.stats.attendancePct !== null)
    .sort((a, b) => b.stats.attendancePct - a.stats.attendancePct);
}

function renderRanking() {
  const ranked = getRanking();
  const body = document.getElementById("ranking-body");
  if (!ranked.length) {
    body.innerHTML = `<tr><td colspan="4">No attendance recorded yet.</td></tr>`;
    return;
  }

  const topCount = Math.min(3, ranked.length);
  const bottomStart = Math.max(topCount, ranked.length - 3);

  body.innerHTML = ranked.map(({ member, stats }, i) => {
    let rowStyle = "";
    if (i < topCount) rowStyle = "background: var(--green-bg);";
    else if (i >= bottomStart) rowStyle = "background: var(--red-bg);";
    return `<tr style="${rowStyle}">
      <td>${i + 1}</td>
      <td><strong>${escapeHtml(member.full_name)}</strong></td>
      <td>${escapeHtml(member.membership_level)}</td>
      <td>${(stats.attendancePct * 100).toFixed(0)}%</td>
    </tr>`;
  }).join("");
}

// ============================================================
// NEEDS YOUR ATTENTION
// ============================================================
function renderAttention() {
  const attentionItems = [];
  allMembers.forEach((m, i) => {
    const s = allStats[i];
    if (s.promotionStatus === "ready") {
      attentionItems.push(pillRow(m.full_name, `Ready to promote (${s.currentStreak}/${REQUIRED_STREAK[m.membership_level]})`, "pill-ready"));
    }
  });
  allMembers.forEach((m, i) => {
    const s = allStats[i];
    if (s.attendanceWarning) {
      attentionItems.push(pillRow(m.full_name, `${s.currentMissStreak} consecutive misses`, "pill-warn"));
    }
  });

  document.getElementById("attention-list").innerHTML = attentionItems.length
    ? attentionItems.join("")
    : `<p style="color:#5a5748;">Nothing needs review right now.</p>`;
}

function pillRow(name, detail, pillClass) {
  return `<div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--line);">
    <span>${escapeHtml(name)}</span>
    <span class="pill ${pillClass}">${escapeHtml(detail)}</span>
  </div>`;
}

// ============================================================
// EXPORT
// ============================================================
function exportDashboard() {
  const counts = Object.fromEntries(LEVELS.map((l) => [l, 0]));
  allMembers.forEach((m) => { counts[m.membership_level] = (counts[m.membership_level] || 0) + 1; });
  const headcountRows = LEVELS.map((l) => ({ "Rank": l, "Count": counts[l] || 0 }));
  headcountRows.push({ "Rank": "Total Roster", "Count": allMembers.length });

  const rankingRows = getRanking().map(({ member, stats }, i) => ({
    "#": i + 1,
    "Name": member.full_name,
    "Rank": member.membership_level,
    "Attendance %": (stats.attendancePct * 100).toFixed(0) + "%",
  }));

  exportToExcel(`Commanders_LEMC_Dashboard_${new Date().toISOString().slice(0, 10)}.xlsx`, [
    { name: "Headcount", rows: headcountRows },
    { name: "Attendance Ranking", rows: rankingRows },
  ]);
}
