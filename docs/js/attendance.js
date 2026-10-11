import { supabase } from "./supabaseClient.js";
import { requireAuth, applyRoleVisibility, escapeHtml } from "./auth.js";
import { computeMemberStats, REQUIRED_STREAK, promotionLabel } from "./streaks.js";
import { openModal, closeModal } from "./modal.js";
import { refreshNavBadge } from "./notifications.js";
import { exportToExcel } from "./exportExcel.js";
import { exportAttendancePdf } from "./exportPdf.js";
import { showToast } from "./toast.js";

// Same hierarchy as Master Record: Full-Batch → Prospect → Hang-around → Honor Member
const LEVEL_ORDER = ["Full-Batch", "Prospect", "Hang-around", "Honor Member"];
const LEVEL_PLURAL = { "Full-Batch": "Full-Batch", "Prospect": "Prospects", "Hang-around": "Hang-arounds", "Honor Member": "Honor Members" };
const STATUS_CYCLE = [null, "attended", "missed", "excused"]; // tap cycles through these
const MOBILE_PREVIEW = 8;                                      // chips shown per card before "show all"
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

let session;
let seasons = [], selectedSeasonId = null;
let members = [], allRides = [], attendance = [];
let editMode = false;
let pendingEdits = new Map();      // "memberId::rideId" -> 'attended'|'missed'|'excused'|'DELETE'
let pendingRideDeleteId = null;
let rankFilter = "", searchText = "", sortKey = "rank";
const expanded = new Set();        // member ids whose card shows every ride
const mq = window.matchMedia("(max-width: 820px)");

const $ = (id) => document.getElementById(id);

init();

async function init() {
  session = await requireAuth();
  if (!session) return;
  applyRoleVisibility(session.profile.role);

  $("season-select").addEventListener("change", (e) => {
    if (pendingEdits.size) showToast("Unsaved changes were discarded.", "info");
    selectedSeasonId = e.target.value;
    pendingRideDeleteId = null;
    exitEditMode(true);
  });
  $("new-season-btn")?.addEventListener("click", openNewSeasonModal);
  $("add-ride-btn")?.addEventListener("click", addRide);
  $("edit-toggle-btn")?.addEventListener("click", enterEditMode);
  $("save-changes-btn")?.addEventListener("click", saveChanges);
  $("discard-changes-btn")?.addEventListener("click", () => exitEditMode(true));

  $("rank-chips").addEventListener("click", (e) => {
    const b = e.target.closest("[data-rank]");
    if (!b) return;
    rankFilter = b.dataset.rank;
    render();
  });
  $("att-search").addEventListener("input", (e) => { searchText = e.target.value.trim().toLowerCase(); renderRoot(); });
  $("att-sort").addEventListener("change", (e) => { sortKey = e.target.value; renderRoot(); });

  $("att-root").addEventListener("click", onRootClick);
  $("ride-manage").addEventListener("click", onRootClick);
  mq.addEventListener("change", () => renderRoot());

  setupExportMenu();
  window.addEventListener("beforeunload", (e) => { if (pendingEdits.size) { e.preventDefault(); e.returnValue = ""; } });

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
function isViewingActiveSeason() { const cs = currentSeason(); return !!cs && cs.status === "active"; }
function canEditHere() { return session.profile.role === "admin" && isViewingActiveSeason(); }

function ridesAsc() {
  return allRides.filter((r) => r.season_id === selectedSeasonId).sort((a, b) => (a.ride_date < b.ride_date ? -1 : 1));
}
// Newest first on screen, so the latest rides are right beside the name.
function ridesDesc() { return ridesAsc().reverse(); }

function formatDate(iso) {
  const [, m, d] = iso.split("-");
  return `${d} ${MONTHS[Number(m) - 1]}`;
}

// ---------- attendance data helpers ----------
function getEffectiveStatus(memberId, rideId) {
  const key = `${memberId}::${rideId}`;
  if (pendingEdits.has(key)) {
    const v = pendingEdits.get(key);
    return v === "DELETE" ? null : v;
  }
  const rec = attendance.find((a) => a.member_id === memberId && a.ride_id === rideId);
  return rec ? rec.status : null;
}

// Attendance list with unsaved edits applied, so badges update live while editing.
function effectiveAttendance() {
  if (!pendingEdits.size) return attendance;
  const out = attendance.filter((a) => !pendingEdits.has(`${a.member_id}::${a.ride_id}`));
  for (const [key, v] of pendingEdits) {
    if (v === "DELETE") continue;
    const [member_id, ride_id] = key.split("::");
    out.push({ member_id, ride_id, status: v });
  }
  return out;
}

function beforeJoin(m, ride) { return !!m.date_joined && ride.ride_date < m.date_joined; }

// Per-season numbers for the end-of-row summary.
function seasonStats(m, rides) {
  let attended = 0, missed = 0, excused = 0;
  rides.forEach((r) => {
    if (beforeJoin(m, r)) return;
    const s = getEffectiveStatus(m.id, r.id);
    if (s === "attended") attended++;
    else if (s === "missed") missed++;
    else if (s === "excused") excused++;
  });
  const total = attended + missed;
  return { attended, total, excused, pct: total ? attended / total : null };
}

function pctClass(p) { return p === null ? "pct-none" : p >= 0.75 ? "pct-good" : p >= 0.5 ? "pct-mid" : "pct-low"; }
function pctText(p) { return p === null ? "—" : Math.round(p * 100) + "%"; }

// ---------- rows: filter → stats → sort → group ----------
function buildRows(rides) {
  const eff = effectiveAttendance();
  let list = members
    .filter((m) => (!rankFilter || m.membership_level === rankFilter) &&
                   (!searchText || m.full_name.toLowerCase().includes(searchText)))
    .map((m) => ({ m, season: seasonStats(m, rides), stats: computeMemberStats(m, allRides, eff) }));

  const byName = (a, b) => a.m.full_name.localeCompare(b.m.full_name);
  const byRank = (a, b) => (LEVEL_ORDER.indexOf(a.m.membership_level) - LEVEL_ORDER.indexOf(b.m.membership_level));
  if (sortKey === "name") list.sort(byName);
  else if (sortKey === "title") {
    list.sort((a, b) => {
      const at = (a.m.officer_title || "").toLowerCase(), bt = (b.m.officer_title || "").toLowerCase();
      if (!at !== !bt) return at ? -1 : 1;            // titled members first
      return at.localeCompare(bt) || byRank(a, b) || byName(a, b);
    });
  } else if (sortKey === "pct") {
    list.sort((a, b) => ((b.season.pct ?? -1) - (a.season.pct ?? -1)) || byName(a, b));
  } else {
    list.sort((a, b) => byRank(a, b) || byName(a, b));
  }
  const grouped = sortKey === "rank";
  list.forEach((r) => { r.group = grouped ? r.m.membership_level : null; });
  return list;
}

// ============================================================
// RENDER
// ============================================================
function render() {
  renderSeasonControls();
  const edit = canEditHere();

  $("add-ride-panel").style.display = edit ? "block" : "none";
  $("edit-lock-panel").style.display = edit ? "flex" : "none";
  $("edit-lock-panel").classList.toggle("is-editing", editMode && edit);
  document.body.classList.toggle("is-editing", editMode && edit);
  $("page-subtitle").textContent = edit
    ? "Sorted by rank, same as Master Record. Tap Edit to unlock changes."
    : "Viewing a closed season — read-only archive.";

  $("edit-toggle-btn").style.display = (editMode || !edit) ? "none" : "inline-block";
  $("save-changes-btn").style.display = editMode ? "inline-block" : "none";
  $("discard-changes-btn").style.display = editMode ? "inline-block" : "none";
  $("edit-status-msg").textContent = editMode
    ? (pendingEdits.size ? `${pendingEdits.size} unsaved change(s)` : "Editing — tap a ride to change it")
    : "";

  // rank chips with counts
  const counts = Object.fromEntries(LEVEL_ORDER.map((l) => [l, members.filter((m) => m.membership_level === l).length]));
  const chip = (val, label, n) =>
    `<button type="button" class="att-fchip" data-rank="${val}" aria-pressed="${rankFilter === val}">${label} <span>${n}</span></button>`;
  $("rank-chips").innerHTML = chip("", "All", members.length) +
    LEVEL_ORDER.map((l) => chip(l, LEVEL_PLURAL[l], counts[l])).join("");

  renderRideManage(edit);
  renderRoot();
}

function renderRoot() {
  const root = $("att-root");
  const scroller = root.querySelector(".att-scroll");
  const keep = scroller ? { l: scroller.scrollLeft, t: scroller.scrollTop } : null;

  const rides = ridesDesc();
  const rows = buildRows(rides);
  const edit = editMode && canEditHere();

  if (!members.length) { root.innerHTML = `<div class="panel">No members yet — add some on Master Record.</div>`; return; }
  if (!rows.length) { root.innerHTML = `<div class="panel">No members match this filter.</div>`; return; }

  const summary = `<p class="att-count">${rows.length} member${rows.length === 1 ? "" : "s"} · ${rides.length} ride${rides.length === 1 ? "" : "s"} in this season</p>`;
  root.innerHTML = summary + (mq.matches ? cardsHtml(rows, rides, edit) : tableHtml(rows, rides, edit));

  const sc = root.querySelector(".att-scroll");
  if (sc && keep) { sc.scrollLeft = keep.l; sc.scrollTop = keep.t; }
}

function renderSeasonControls() {
  $("season-select").innerHTML = seasons.map((s) =>
    `<option value="${s.id}" ${s.id === selectedSeasonId ? "selected" : ""}>${escapeHtml(s.name)}${s.status === "active" ? " (active)" : ""}</option>`
  ).join("");
  const cs = currentSeason();
  $("season-status-pill").innerHTML = cs
    ? `<span class="pill ${cs.status === "active" ? "pill-ok" : "pill-progress"}">${cs.status === "active" ? "Active" : "Closed"}</span>`
    : "";
  const btn = $("new-season-btn");
  if (btn) btn.style.display = session.profile.role === "admin" ? "inline-block" : "none";
}

// ---------- cells / chips ----------
function statusInfo(status) {
  return status === "attended" ? { cls: "rc-1", sym: "✓", word: "Attended" }
    : status === "missed" ? { cls: "rc-0", sym: "✗", word: "Missed" }
    : status === "excused" ? { cls: "rc-e", sym: "E", word: "Excused" }
    : { cls: "rc-u", sym: "", word: "Not marked" };
}

function rideCell(m, ride, edit, asChip) {
  if (beforeJoin(m, ride) && !getEffectiveStatus(m.id, ride.id)) {
    return asChip
      ? `<div class="rc rc-na" title="Before this member joined"><span class="rc-d">${formatDate(ride.ride_date)}</span><span class="rc-s">–</span></div>`
      : `<td class="rc-td"><span class="rc rc-na" title="Before this member joined">–</span></td>`;
  }
  const st = statusInfo(getEffectiveStatus(m.id, ride.id));
  const label = `${m.full_name}, ${formatDate(ride.ride_date)}: ${st.word}`;
  const inner = asChip
    ? `<span class="rc-d">${formatDate(ride.ride_date)}</span><span class="rc-s">${st.sym || "·"}</span>`
    : (st.sym || "");
  const el = edit
    ? `<button type="button" class="rc ${st.cls} rc-btn" data-act="cell" data-m="${m.id}" data-r="${ride.id}" aria-label="${escapeHtml(label)}">${inner}</button>`
    : `<${asChip ? "div" : "span"} class="rc ${st.cls}" role="img" aria-label="${escapeHtml(label)}">${inner}</${asChip ? "div" : "span"}>`;
  return asChip ? el : `<td class="rc-td">${el}</td>`;
}

function badgesHtml(row) {
  const { m, stats } = row;
  const req = REQUIRED_STREAK[m.membership_level];
  const parts = [];
  if (req) {
    const cls = stats.promotionStatus === "ready" ? "pill-ready" : stats.promotionStatus === "soon" ? "pill-soon" : "pill-progress";
    parts.push(`<span class="pill ${cls}">${promotionLabel(stats.promotionStatus, stats.currentStreak, req)}</span>`);
  }
  if (stats.attendanceWarning) parts.push(`<span class="pill pill-warn">⚠ ${stats.currentMissStreak} misses in a row</span>`);
  return parts.join("");
}

// ---------- desktop / tablet: table with sticky name + sticky summary ----------
function tableHtml(rows, rides, edit) {
  const cols = rides.length + 4;
  let h = `<div class="att-scroll"><table class="att-table"><thead><tr>
    <th class="sticky-col">Name</th>
    ${rides.map((r) => {
      const [y, mo, d] = r.ride_date.split("-");
      return `<th class="ride-h" title="${escapeHtml(r.label || formatDate(r.ride_date))}"><span class="d">${d}</span><span class="mo">${MONTHS[Number(mo) - 1]}</span></th>`;
    }).join("")}
    <th class="sum sum-att">Attended</th><th class="sum sum-tot">Total</th><th class="sum sum-pct">%</th>
  </tr></thead><tbody>`;
  let last = null;
  rows.forEach((row) => {
    if (row.group && row.group !== last) {
      const n = rows.filter((x) => x.group === row.group).length;
      h += `<tr class="section-row"><td colspan="${cols}"><span class="grp-label">${row.group.toUpperCase()} · ${n}</span></td></tr>`;
      last = row.group;
    }
    const { m, season } = row;
    h += `<tr>
      <td class="sticky-col"><div class="nm">${escapeHtml(m.full_name)}</div>
        <div class="sub">${!row.group ? `<span class="rank-tag">${m.membership_level}</span>` : ""}${m.officer_title ? `<span class="title-tag">${escapeHtml(m.officer_title)}</span>` : ""}${badgesHtml(row)}</div></td>
      ${rides.map((r) => rideCell(m, r, edit, false)).join("")}
      <td class="sum sum-att"><b>${season.attended}</b></td>
      <td class="sum sum-tot"><b>${season.total}</b>${season.excused ? `<small title="Excused rides are not counted">+${season.excused}E</small>` : ""}</td>
      <td class="sum sum-pct ${pctClass(season.pct)}"><b>${pctText(season.pct)}</b></td>
    </tr>`;
  });
  return h + `</tbody></table></div>`;
}

// ---------- phone: one card per member, name always visible, no sideways scroll ----------
function cardsHtml(rows, rides, edit) {
  let h = "", last = null;
  rows.forEach((row) => {
    if (row.group && row.group !== last) {
      const n = rows.filter((x) => x.group === row.group).length;
      h += `<h2 class="att-group">${row.group.toUpperCase()} <span>${n}</span></h2>`;
      last = row.group;
    }
    const { m, season } = row;
    const open = edit || expanded.has(m.id) || rides.length <= MOBILE_PREVIEW;
    const shown = open ? rides : rides.slice(0, MOBILE_PREVIEW);
    h += `<article class="att-card">
      <header><h3 class="nm">${escapeHtml(m.full_name)}</h3><span class="rank-tag">${m.membership_level}</span></header>
      <div class="sub">${m.officer_title ? `<span class="title-tag">${escapeHtml(m.officer_title)}</span>` : ""}${badgesHtml(row)}</div>
      <div class="att-stats">
        <div><b>${season.attended}</b><span>Attended</span></div>
        <div><b>${season.total}</b><span>Total rides</span></div>
        <div class="${pctClass(season.pct)}"><b>${pctText(season.pct)}</b><span>Attendance</span></div>
      </div>
      <div class="att-chipgrid">${shown.map((r) => rideCell(m, r, edit, true)).join("")}</div>
      ${(!edit && rides.length > MOBILE_PREVIEW)
        ? `<button type="button" class="att-more" data-act="expand" data-m="${m.id}" aria-expanded="${open}">${open ? "Show latest only" : `Show all ${rides.length} rides`}</button>` : ""}
    </article>`;
  });
  return h;
}

// ---------- ride management (edit mode): add/delete rides with a clear confirmation ----------
function renderRideManage(edit) {
  const box = $("ride-manage");
  if (!(edit && editMode)) { box.style.display = "none"; box.innerHTML = ""; return; }
  const rides = ridesDesc();
  const pending = rides.find((r) => r.id === pendingRideDeleteId);
  box.style.display = "block";
  box.innerHTML = `<div class="panel-title">RIDES IN THIS SEASON</div>
    <div class="ride-pills">${rides.length ? rides.map((r) =>
      `<span class="ride-pill">${formatDate(r.ride_date)}${r.label ? ` · ${escapeHtml(r.label)}` : ""}
        <button type="button" data-act="ride-ask" data-r="${r.id}" aria-label="Delete ride ${formatDate(r.ride_date)}">✕</button></span>`
    ).join("") : "<em>No rides yet.</em>"}</div>
    ${pending ? `<div class="msg msg-error" role="alert">Delete the ${formatDate(pending.ride_date)} ride? Every member's attendance for it is deleted too.
      <div style="margin-top:8px; display:flex; gap:8px;">
        <button type="button" class="danger" data-act="ride-del" data-r="${pending.id}">Yes, delete ride</button>
        <button type="button" class="ghost" data-act="ride-cancel">Cancel</button></div></div>` : ""}`;
}

// ============================================================
// CLICK HANDLING (delegated)
// ============================================================
function onRootClick(e) {
  const el = e.target.closest("[data-act]");
  if (!el) return;
  const act = el.dataset.act;
  if (act === "cell") {
    onCellClick(el.dataset.m, el.dataset.r);
  } else if (act === "expand") {
    const id = el.dataset.m;
    expanded.has(id) ? expanded.delete(id) : expanded.add(id);
    renderRoot();
    $("att-root").querySelector(`[data-act="expand"][data-m="${id}"]`)?.focus();
  } else if (act === "ride-ask") { pendingRideDeleteId = el.dataset.r; renderRideManage(true); }
  else if (act === "ride-cancel") { pendingRideDeleteId = null; renderRideManage(true); }
  else if (act === "ride-del") deleteRide(el.dataset.r);
}

// ============================================================
// EDIT LOCK — nothing writes to the database until Save Changes
// ============================================================
function enterEditMode() { editMode = true; pendingEdits.clear(); pendingRideDeleteId = null; render(); }

function exitEditMode(discard) {
  editMode = false;
  pendingRideDeleteId = null;
  if (discard) pendingEdits.clear();
  render();
}

function onCellClick(memberId, rideId) {
  const key = `${memberId}::${rideId}`;
  const current = getEffectiveStatus(memberId, rideId);
  const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(current) + 1) % STATUS_CYCLE.length];
  const saved = attendance.find((a) => a.member_id === memberId && a.ride_id === rideId);
  // Back to what's already saved → drop the pending change instead of queueing a no-op
  if ((saved ? saved.status : null) === next) pendingEdits.delete(key);
  else pendingEdits.set(key, next === null ? "DELETE" : next);
  render();
  document.querySelector(`[data-act="cell"][data-m="${memberId}"][data-r="${rideId}"]`)?.focus({ preventScroll: true });
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
  $("edit-status-msg").textContent = "Saving…";
  $("save-changes-btn").disabled = true;
  const results = await Promise.all(ops);
  $("save-changes-btn").disabled = false;
  const failed = results.find((r) => r && r.error);
  if (failed) {
    showToast("Some changes could not be saved: " + failed.error.message, "error", 7000);
    $("edit-status-msg").textContent = "Save failed — your edits are still here, try again.";
    return;
  }
  pendingEdits.clear();
  editMode = false;
  showToast("Attendance saved.", "ok", 2500);
  await loadAll();
  await refreshNavBadge(); // attendance changes can flip promotion-ready status
}

// ============================================================
// RIDE DELETE / ADD
// ============================================================
async function deleteRide(rideId) {
  const { error } = await supabase.from("rides").delete().eq("id", rideId); // attendance rows cascade-delete
  pendingRideDeleteId = null;
  if (error) { showToast("Could not delete ride: " + error.message, "error", 6000); render(); return; }
  // drop pending edits that pointed at the deleted ride
  for (const k of [...pendingEdits.keys()]) if (k.endsWith("::" + rideId)) pendingEdits.delete(k);
  await loadAll();
  await refreshNavBadge();
}

async function addRide() {
  const dateVal = $("new-ride-date").value;
  const label = $("new-ride-label").value.trim();
  const msg = $("ride-msg");
  if (!dateVal) { msg.textContent = "Pick a date first."; return; }
  const active = activeSeason();
  if (!active) { msg.textContent = "No active season found."; return; }

  const { error } = await supabase.from("rides").insert({ ride_date: dateVal, label: label || null, season_id: active.id });
  if (error) { msg.textContent = error.message; return; }
  msg.textContent = "Added.";
  $("new-ride-date").value = "";
  $("new-ride-label").value = "";
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

// ============================================================
// EXPORT (Excel + PDF) — exports exactly what you see: current season,
// filter and sort. Rides run oldest → newest in the files.
// ============================================================
function setupExportMenu() {
  const btn = $("export-btn"), menu = $("export-menu");
  const close = () => { menu.hidden = true; btn.setAttribute("aria-expanded", "false"); };
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
    btn.setAttribute("aria-expanded", String(!menu.hidden));
    if (!menu.hidden) menu.querySelector("button").focus();
  });
  document.addEventListener("click", (e) => { if (!menu.contains(e.target)) close(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !menu.hidden) { close(); btn.focus(); } });
  menu.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-export]");
    if (!b) return;
    close();
    btn.disabled = true;
    const original = btn.textContent;
    btn.textContent = "Preparing…";
    try { await runExport(b.dataset.export); }
    finally { btn.disabled = false; btn.textContent = original; }
  });
}

function exportModel() {
  const rides = ridesAsc();
  const rows = buildRows(rides);
  const cs = currentSeason();
  const seen = {};
  const labels = rides.map((r) => {
    let l = formatDate(r.ride_date);
    seen[l] = (seen[l] || 0) + 1;
    return seen[l] > 1 ? `${l} (${seen[l]})` : l;
  });
  return { rides, rows, labels, seasonName: cs ? cs.name : "Attendance" };
}

const SYMBOL = { attended: "P", missed: "A", excused: "E" };

async function runExport(kind) {
  const { rides, rows, labels, seasonName } = exportModel();
  const stamp = new Date().toISOString().slice(0, 10);
  const base = `Commanders_LEMC_Attendance_${seasonName}_${stamp}`;
  const filterLabel = (rankFilter ? LEVEL_PLURAL[rankFilter] : "All ranks") + (searchText ? ` · "${searchText}"` : "");

  if (kind === "xlsx") {
    const data = rows.map(({ m, season, stats }) => {
      const row = { "Name": m.full_name, "Rank": m.membership_level, "Title": m.officer_title || "" };
      rides.forEach((r, i) => {
        const s = beforeJoin(m, r) ? null : getEffectiveStatus(m.id, r.id);
        row[labels[i]] = s === "attended" ? "✓" : s === "missed" ? "✗" : s === "excused" ? "E" : "";
      });
      row["Attended"] = season.attended;
      row["Total Rides"] = season.total;
      row["Excused"] = season.excused;
      row["Attendance %"] = season.pct === null ? "" : season.pct;
      row["Current Streak"] = stats.currentStreak;
      row["Promotion Status"] = stats.promotionStatus || "";
      row["Consecutive Misses"] = stats.currentMissStreak;
      return row;
    });
    const ok = await exportToExcel(base + ".xlsx", [{ name: seasonName, rows: data, percentCols: ["Attendance %"] }]);
    if (ok) showToast("Excel file downloaded.", "ok", 2500);
  } else {
    const model = {
      seasonName, filterLabel,
      generatedAt: new Date().toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }),
      rides: rides.map((r) => ({ label: formatDate(r.ride_date).replace(" ", "\n") })),
      rows: rows.map(({ m, season, group }) => ({
        group, name: m.full_name,
        symbols: rides.map((r) => (beforeJoin(m, r) ? "" : SYMBOL[getEffectiveStatus(m.id, r.id)] || "")),
        attended: season.attended, total: season.total, pct: season.pct,
      })),
    };
    const ok = await exportAttendancePdf(model, base + ".pdf");
    if (ok) showToast("PDF downloaded.", "ok", 2500);
  }
}
