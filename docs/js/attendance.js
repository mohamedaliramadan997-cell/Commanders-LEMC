import { supabase } from "./supabaseClient.js";
import { requireAuth, applyRoleVisibility, escapeHtml } from "./auth.js";
import { computeMemberStats, REQUIRED_STREAK, promotionLabel } from "./streaks.js";
import { openModal, closeModal } from "./modal.js";
import { refreshNavBadge } from "./notifications.js";

const LEVEL_ORDER = ["Full-Batch", "Prospect", "Hang-around", "Honor Member"];
const STATUS_CYCLE = [null, "attended", "missed", "excused"]; // click cycles through these

let session;
let seasons = [], selectedSeasonId = null;
let members = [], allRides = [], attendance = [];
let editMode = false;
let pendingEdits = new Map();      // "memberId::rideId" -> 'attended'|'missed'|'excused'|'DELETE'
let pendingRideDeleteId = null;    // ride currently showing its delete-confirm header

init();

async function init() {
  session = await requireAuth();
  if (!session) return;
  applyRoleVisibility(session.profile.role);

  document.getElementById("season-select").addEventListener("change", (e) => {
    selectedSeasonId = e.target.value;
    exitEditMode(false);
    render();
  });
  document.getElementById("new-season-btn")?.addEventListener("click", openNewSeasonModal);
  document.getElementById("add-ride-btn")?.addEventListener("click", addRide);
  document.getElementById("edit-toggle-btn")?.addEventListener("click", enterEditMode);
  document.getElementById("save-changes-btn")?.addEventListener("click", saveChanges);
  document.getElementById("discard-changes-btn")?.addEventListener("click", () => exitEditMode(true));

  await loadAll();
}

async function loadAll() {
  const [{ data: se }, { data: m }, { data: r }, { data: a }] = await Promise.all([
    supabase.from("seasons").select("*").order("start_date", { ascending: false }),
    supabase.from("members").select("*"),
    supabase.from("rides").select("*").order("ride_date"),
    supabase.from("attendance").select("*"),
  ]);
  seasons = se || [];
  members = m || [];
  allRides = r || [];
  attendance = a || [];

  if (!selectedSeasonId || !seasons.find((s) => s.id === selectedSeasonId)) {
    const active = seasons.find((s) => s.status === "active");
    selectedSeasonId = active ? active.id : (seasons[0] ? seasons[0].id : null);
  }
  render();
}

function activeSeason() { return seasons.find((s) => s.status === "active"); }
function currentSeason() { return seasons.find((s) => s.id === selectedSeasonId); }
function isViewingActiveSeason() {
  const cs = currentSeason();
  return !!cs && cs.status === "active";
}
function displayRides() {
  return allRides.filter((r) => r.season_id === selectedSeasonId).sort((a, b) => (a.ride_date < b.ride_date ? -1 : 1));
}

function render() {
  renderSeasonControls();

  const rides = displayRides();
  const canEditHere = session.profile.role === "admin" && isViewingActiveSeason();

  document.getElementById("add-ride-panel").style.display = canEditHere ? "flex" : "none";
  document.getElementById("edit-lock-panel").style.display = canEditHere ? "flex" : "none";
  document.getElementById("page-subtitle").textContent = canEditHere
    ? "Grouped Full-Batch → Prospect → Hang-around → Honor Members. Click Edit to unlock changes."
    : "Viewing a closed season — read-only archive.";

  const head = document.getElementById("table-head");
  head.innerHTML = `<th>Name</th>` +
    rides.map((r) => rideHeaderHtml(r, canEditHere)).join("") +
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
      // Stats always look across ALL seasons' rides — continuous history.
      const stats = computeMemberStats(m, allRides, attendance);
      html += `<tr>
        <td><strong>${escapeHtml(m.full_name)}</strong></td>
        ${rides.map((r) => cellHtml(m, r, editMode && canEditHere)).join("")}
        <td>${stats.attendancePct === null ? "—" : (stats.attendancePct * 100).toFixed(0) + "%"}</td>
        <td>${stats.currentStreak}${REQUIRED_STREAK[m.membership_level] ? "/" + REQUIRED_STREAK[m.membership_level] : ""}</td>
        <td>${promotionPill(stats, m)}</td>
        <td>${warningPill(stats)}</td>
      </tr>`;
    });
  });
  body.innerHTML = html || `<tr><td>No members yet — add some on Master Record.</td></tr>`;

  if (editMode && canEditHere) {
    body.querySelectorAll(".att-cell").forEach((td) => {
      td.addEventListener("click", () => onCellClick(td.dataset.memberId, td.dataset.rideId));
    });
  }
  head.querySelectorAll("[data-confirm-delete-ride]").forEach((btn) =>
    btn.addEventListener("click", () => { pendingRideDeleteId = btn.dataset.confirmDeleteRide; render(); }));
  head.querySelectorAll("[data-do-delete-ride]").forEach((btn) =>
    btn.addEventListener("click", () => deleteRide(btn.dataset.doDeleteRide)));
  head.querySelectorAll("[data-cancel-delete-ride]").forEach((btn) =>
    btn.addEventListener("click", () => { pendingRideDeleteId = null; render(); }));

  document.getElementById("edit-toggle-btn").style.display = (editMode || !canEditHere) ? "none" : "inline-block";
  document.getElementById("save-changes-btn").style.display = editMode ? "inline-block" : "none";
  document.getElementById("discard-changes-btn").style.display = editMode ? "inline-block" : "none";
  document.getElementById("edit-status-msg").textContent = editMode
    ? (pendingEdits.size ? `${pendingEdits.size} unsaved change(s)` : "Editing — click cells to change attendance")
    : "";
}

function renderSeasonControls() {
  const select = document.getElementById("season-select");
  select.innerHTML = seasons.map((s) =>
    `<option value="${s.id}" ${s.id === selectedSeasonId ? "selected" : ""}>${escapeHtml(s.name)}${s.status === "active" ? " (active)" : ""}</option>`
  ).join("");

  const cs = currentSeason();
  const pill = document.getElementById("season-status-pill");
  pill.innerHTML = cs
    ? `<span class="pill ${cs.status === "active" ? "pill-ok" : "pill-progress"}">${cs.status === "active" ? "Active" : "Closed"}</span>`
    : "";

  const newSeasonBtn = document.getElementById("new-season-btn");
  if (newSeasonBtn) newSeasonBtn.style.display = session.profile.role === "admin" ? "inline-block" : "none";
}

function rideHeaderHtml(ride, canEditHere) {
  if (pendingRideDeleteId === ride.id) {
    return `<th style="background:var(--red-bg); color:var(--red); min-width:120px;">
      Delete this ride?<br/>
      <button class="danger" style="padding:3px 8px; font-size:11px; margin-top:4px;" data-do-delete-ride="${ride.id}">Yes</button>
      <button class="ghost" style="padding:3px 8px; font-size:11px;" data-cancel-delete-ride="${ride.id}">No</button>
    </th>`;
  }
  const dateLabel = formatDate(ride.ride_date);
  const deleteBtn = (editMode && canEditHere)
    ? `<button data-confirm-delete-ride="${ride.id}" title="Delete this ride" style="background:none; border:none; color:var(--cream-dim); cursor:pointer; padding:0 0 0 4px; font-size:12px;">✕</button>`
    : "";
  return `<th title="${ride.label || ""}">${dateLabel}${deleteBtn}</th>`;
}

function getEffectiveStatus(memberId, rideId) {
  const key = `${memberId}::${rideId}`;
  if (pendingEdits.has(key)) {
    const v = pendingEdits.get(key);
    return v === "DELETE" ? null : v;
  }
  const rec = attendance.find((a) => a.member_id === memberId && a.ride_id === rideId);
  return rec ? rec.status : null;
}

function cellHtml(member, ride, clickable) {
  const status = getEffectiveStatus(member.id, ride.id);
  const cls = status === "attended" ? "att-1" : status === "missed" ? "att-0" : status === "excused" ? "att-e" : "";
  const label = status === "attended" ? "✓" : status === "missed" ? "✗" : status === "excused" ? "E" : "";
  const clickAttrs = clickable ? `class="att-cell ${cls}" data-member-id="${member.id}" data-ride-id="${ride.id}"` : `class="${cls}"`;
  return `<td ${clickAttrs}>${label}</td>`;
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

// ============================================================
// EDIT LOCK — nothing writes to the database until Save Changes
// ============================================================
function enterEditMode() {
  editMode = true;
  pendingEdits.clear();
  render();
}

function exitEditMode(discard) {
  editMode = false;
  if (discard) pendingEdits.clear();
  render();
}

function onCellClick(memberId, rideId) {
  const key = `${memberId}::${rideId}`;
  const current = getEffectiveStatus(memberId, rideId);
  const idx = STATUS_CYCLE.indexOf(current);
  const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];
  pendingEdits.set(key, next === null ? "DELETE" : next);
  render();
}

async function saveChanges() {
  const ops = [];
  for (const [key, value] of pendingEdits.entries()) {
    const [memberId, rideId] = key.split("::");
    const rec = attendance.find((a) => a.member_id === memberId && a.ride_id === rideId);
    if (value === "DELETE") {
      if (rec) ops.push(supabase.from("attendance").delete().eq("id", rec.id));
    } else if (rec) {
      ops.push(supabase.from("attendance").update({ status: value, marked_by: session.user.id }).eq("id", rec.id));
    } else {
      ops.push(supabase.from("attendance").insert({ member_id: memberId, ride_id: rideId, status: value, marked_by: session.user.id }));
    }
  }
  document.getElementById("edit-status-msg").textContent = "Saving…";
  await Promise.all(ops);
  pendingEdits.clear();
  editMode = false;
  await loadAll();
  await refreshNavBadge(); // attendance changes can flip promotion-ready status
}

// ============================================================
// RIDE DELETE (two-step confirm, inline in the column header)
// ============================================================
async function deleteRide(rideId) {
  await supabase.from("rides").delete().eq("id", rideId); // attendance rows cascade-delete
  pendingRideDeleteId = null;
  await loadAll();
  await refreshNavBadge();
}

// ============================================================
// ADD RIDE (always attaches to the currently active season)
// ============================================================
async function addRide() {
  const dateVal = document.getElementById("new-ride-date").value;
  const label = document.getElementById("new-ride-label").value.trim();
  const msg = document.getElementById("ride-msg");
  if (!dateVal) { msg.textContent = "Pick a date first."; return; }
  const active = activeSeason();
  if (!active) { msg.textContent = "No active season found."; return; }

  const { error } = await supabase.from("rides").insert({ ride_date: dateVal, label: label || null, season_id: active.id });
  if (error) { msg.textContent = error.message; return; }
  msg.textContent = "Added.";
  document.getElementById("new-ride-date").value = "";
  document.getElementById("new-ride-label").value = "";
  await loadAll();
}

// ============================================================
// SEASONS — close current, start a new one
// ============================================================
function openNewSeasonModal() {
  const active = activeSeason();
  const suggestion = active ? nextSeasonName(active.name) : "Season 1";

  openModal(`
    <h2>Close Season &amp; Start New</h2>
    ${active
      ? `<p style="color:#5a5748; font-size:13.5px;">This closes <strong>${escapeHtml(active.name)}</strong> (it becomes a read-only archive) and starts a new active season below.</p>`
      : `<p style="color:#5a5748; font-size:13.5px;">No active season currently exists — this creates the first one.</p>`}
    <label>New season name</label>
    <input id="new-season-name" type="text" value="${escapeHtml(suggestion)}" />
    <div id="new-season-msg"></div>
    <div class="modal-actions">
      <button class="gold" id="confirm-new-season-btn">${active ? "Close & Start New" : "Start Season"}</button>
      <button class="ghost" id="cancel-new-season-btn">Cancel</button>
    </div>
  `);
  document.getElementById("confirm-new-season-btn").addEventListener("click", () => confirmNewSeason(active));
  document.getElementById("cancel-new-season-btn").addEventListener("click", () => closeModal());
}

function nextSeasonName(currentName) {
  const m = currentName.match(/(\d+)(?!.*\d)/); // last number in the name
  if (!m) return currentName + " (New)";
  const nextNum = Number(m[1]) + 1;
  return currentName.slice(0, m.index) + nextNum + currentName.slice(m.index + m[1].length);
}

async function confirmNewSeason(active) {
  const name = document.getElementById("new-season-name").value.trim();
  const msg = document.getElementById("new-season-msg");
  if (!name) { msg.innerHTML = `<div class="msg msg-error">Enter a season name.</div>`; return; }

  const today = new Date().toISOString().slice(0, 10);
  if (active) {
    await supabase.from("seasons").update({ status: "closed", end_date: today }).eq("id", active.id);
  }
  const { data: created, error } = await supabase.from("seasons").insert({ name, status: "active", start_date: today }).select().single();
  if (error) { msg.innerHTML = `<div class="msg msg-error">${error.message}</div>`; return; }

  selectedSeasonId = created.id;
  closeModal();
  await loadAll();
}

function formatDate(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
}
