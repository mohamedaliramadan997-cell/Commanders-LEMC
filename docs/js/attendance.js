import { supabase } from "./supabaseClient.js";
import { requireAuth, applyRoleVisibility, escapeHtml } from "./auth.js";
import { computeMemberStats, REQUIRED_STREAK, promotionLabel } from "./streaks.js";

const LEVEL_ORDER = ["Full-Batch", "Prospect", "Hang-around", "Honor Member"];
const STATUS_CYCLE = [null, "attended", "missed", "excused"]; // click cycles through these

let session, members = [], rides = [], attendance = [];

init();

async function init() {
  session = await requireAuth();
  if (!session) return;
  applyRoleVisibility(session.profile.role);
  document.getElementById("add-ride-btn")?.addEventListener("click", addRide);
  await loadAll();
}

async function loadAll() {
  const [{ data: m }, { data: r }, { data: a }] = await Promise.all([
    supabase.from("members").select("*"),
    supabase.from("rides").select("*").order("ride_date"),
    supabase.from("attendance").select("*"),
  ]);
  members = m || [];
  rides = r || [];
  attendance = a || [];
  render();
}

function render() {
  const head = document.getElementById("table-head");
  head.innerHTML = `<th>Name</th>` +
    rides.map((r) => `<th title="${r.label || ""}">${formatDate(r.ride_date)}</th>`).join("") +
    `<th>%</th><th>Streak</th><th>Promotion Status</th><th>Warning</th>`;

  const grouped = LEVEL_ORDER.map((lvl) => ({
    level: lvl,
    members: members.filter((m) => m.membership_level === lvl).sort((a, b) => a.full_name.localeCompare(b.full_name)),
  })).filter((g) => g.members.length);

  const body = document.getElementById("table-body");
  let html = "";
  grouped.forEach((g) => {
    html += `<tr class="section-row"><td colspan="${rides.length + 5}">${g.level.toUpperCase()}</td></tr>`;
    g.members.forEach((m) => {
      const stats = computeMemberStats(m, rides, attendance);
      html += `<tr>
        <td><strong>${escapeHtml(m.full_name)}</strong></td>
        ${rides.map((r) => cellHtml(m, r)).join("")}
        <td>${stats.attendancePct === null ? "—" : (stats.attendancePct * 100).toFixed(0) + "%"}</td>
        <td>${stats.currentStreak}${REQUIRED_STREAK[m.membership_level] ? "/" + REQUIRED_STREAK[m.membership_level] : ""}</td>
        <td>${promotionPill(stats, m)}</td>
        <td>${warningPill(stats, m)}</td>
      </tr>`;
    });
  });
  body.innerHTML = html || `<tr><td>No members yet — add some on Master Record.</td></tr>`;

  if (session.profile.role === "admin") {
    body.querySelectorAll(".att-cell").forEach((td) => {
      td.addEventListener("click", () => cycleAttendance(td.dataset.memberId, td.dataset.rideId));
    });
  }
}

function cellHtml(member, ride) {
  const rec = attendance.find((a) => a.member_id === member.id && a.ride_id === ride.id);
  const status = rec ? rec.status : null;
  const cls = status === "attended" ? "att-1" : status === "missed" ? "att-0" : status === "excused" ? "att-e" : "";
  const label = status === "attended" ? "✓" : status === "missed" ? "✗" : status === "excused" ? "E" : "";
  return `<td class="att-cell ${cls}" data-member-id="${member.id}" data-ride-id="${ride.id}">${label}</td>`;
}

function promotionPill(stats, member) {
  if (!stats.promotionStatus) return `<span class="pill pill-progress">—</span>`;
  const required = REQUIRED_STREAK[member.membership_level];
  const label = promotionLabel(stats.promotionStatus, stats.currentStreak, required);
  const cls = stats.promotionStatus === "ready" ? "pill-ready" : stats.promotionStatus === "soon" ? "pill-soon" : "pill-progress";
  return `<span class="pill ${cls}">${label}</span>`;
}

function warningPill(stats) {
  if (stats.attendanceWarning) return `<span class="pill pill-warn">${stats.currentMissStreak}+ consecutive misses</span>`;
  return `<span class="pill pill-ok">OK</span>`;
}

async function cycleAttendance(memberId, rideId) {
  const rec = attendance.find((a) => a.member_id === memberId && a.ride_id === rideId);
  const currentStatus = rec ? rec.status : null;
  const idx = STATUS_CYCLE.indexOf(currentStatus);
  const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];

  if (next === null) {
    if (rec) await supabase.from("attendance").delete().eq("id", rec.id);
  } else if (rec) {
    await supabase.from("attendance").update({ status: next, marked_by: session.user.id }).eq("id", rec.id);
  } else {
    await supabase.from("attendance").insert({
      member_id: memberId, ride_id: rideId, status: next, marked_by: session.user.id,
    });
  }
  await loadAll();
}

async function addRide() {
  const dateVal = document.getElementById("new-ride-date").value;
  const label = document.getElementById("new-ride-label").value.trim();
  const msg = document.getElementById("ride-msg");
  if (!dateVal) { msg.textContent = "Pick a date first."; return; }

  const { error } = await supabase.from("rides").insert({ ride_date: dateVal, label: label || null });
  if (error) { msg.textContent = error.message; return; }
  msg.textContent = "Added.";
  document.getElementById("new-ride-date").value = "";
  document.getElementById("new-ride-label").value = "";
  await loadAll();
}

function formatDate(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
}
