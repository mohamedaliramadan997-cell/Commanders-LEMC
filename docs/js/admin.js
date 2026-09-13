import { supabase } from "./supabaseClient.js";
import { requireAuth, applyRoleVisibility, escapeHtml } from "./auth.js";
import { computeMemberStats, REQUIRED_STREAK } from "./streaks.js";
import { titleCase, normalizeEmail, normalizePhone, sinceYearToYears, ridingExperienceOptionsHtml, yearsToSinceYear } from "./utils.js";
import { openModal, closeModal } from "./modal.js";
import { adjustWidgetHtml, wireAdjustWidget } from "./photoAdjust.js";
import { getUpcomingBirthdays, birthdayCountdownLabel, refreshNavBadge } from "./notifications.js";
import { exportToExcel } from "./exportExcel.js";

let session, allSubmissions = [], allUpdateRequests = [];

const SUBMISSION_FIELDS = [
  ["full_name", "Full Name", "name"],
  ["city", "City", "name"],
  ["neighborhood", "Neighborhood", "name"],
  ["mobile", "Mobile Number", "phone"],
  ["whatsapp", "WhatsApp Number", "phone"],
  ["email", "Email", "email"],
  ["date_of_birth", "Date of Birth", "date"],
  ["bike_model", "Bike Model", "name"],
  ["profession", "Profession / Occupation", "name"],
  ["emergency_contact_name", "Emergency Contact — Name", "name"],
  ["emergency_contact_relation", "Emergency Contact — Relation", "name"],
  ["emergency_contact_mobile", "Emergency Contact — Mobile", "phone"],
];

const UPDATE_REQUEST_FIELDS = [
  ["city", "City"], ["neighborhood", "Neighborhood"],
  ["mobile", "Mobile Number"], ["whatsapp", "WhatsApp Number"], ["email", "Email"],
  ["date_of_birth", "Date of Birth"],
  ["bike_model", "Bike Model"], ["profession", "Profession / Occupation"],
  ["emergency_contact_name", "Emergency Contact — Name"],
  ["emergency_contact_relation", "Emergency Contact — Relation"],
  ["emergency_contact_mobile", "Emergency Contact — Mobile"],
];

init();

async function init() {
  session = await requireAuth();
  if (!session) return;
  applyRoleVisibility(session.profile.role);

  if (session.profile.role !== "admin") {
    document.getElementById("not-admin-msg").style.display = "block";
    return;
  }
  document.getElementById("admin-body").style.display = "block";
  document.getElementById("whatsapp-summary-btn").addEventListener("click", sendWhatsAppSummary);
  document.getElementById("export-admin-btn").addEventListener("click", exportAdminData);
  await Promise.all([loadNotifications(), loadSubmissions(), loadUpdateRequests(), loadPromotions(), loadProfiles()]);
}

// ============================================================
// NOTIFICATIONS — always shows the next 3 upcoming birthdays; rolls
// forward automatically as each one passes, no action needed.
// ============================================================
let currentBirthdayNotifs = [];

async function loadNotifications() {
  const el = document.getElementById("notifications-list");
  currentBirthdayNotifs = await getUpcomingBirthdays(3);

  if (!currentBirthdayNotifs.length) {
    el.innerHTML = `<p style="color:#5a5748;">No members have a date of birth on file yet.</p>`;
    return;
  }

  el.innerHTML = currentBirthdayNotifs.map(({ member, daysUntil, nextDate }) => `
    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; border:1px solid var(--line); border-radius:6px; padding:12px 14px; margin-bottom:10px;">
      <div>
        <span class="pill ${daysUntil <= 1 ? "pill-soon" : "pill-progress"}">${birthdayCountdownLabel(daysUntil)}</span>
        <strong style="margin-left:8px;">${escapeHtml(member.full_name)}</strong>
        <span style="color:#8a8672; font-size:12.5px; margin-left:6px;">${nextDate.toLocaleDateString(undefined, { day: "2-digit", month: "short" })}</span>
      </div>
      <button class="ghost" data-wa-birthday="${member.id}">Send via WhatsApp</button>
    </div>
  `).join("");

  el.querySelectorAll("[data-wa-birthday]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const notif = currentBirthdayNotifs.find((n) => n.member.id === btn.dataset.waBirthday);
      if (notif) sendWhatsApp(`Reminder: ${notif.member.full_name}'s birthday is ${birthdayCountdownLabel(notif.daysUntil).toLowerCase()} — Commanders LEMC UAE.`);
    }));
}

function sendWhatsApp(text) {
  window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, "_blank");
}

async function sendWhatsAppSummary() {
  const lines = ["Commanders LEMC — UAE Chapter — Admin summary:"];
  const subCountEl = document.querySelectorAll("#submissions-list > div").length;
  lines.push(`• ${subCountEl} new intake submission(s) awaiting review`);
  const updateCountEl = document.querySelectorAll("#update-requests-list > div").length;
  lines.push(`• ${updateCountEl} member update request(s) awaiting review`);
  const promoCountEl = document.querySelectorAll("#promotions-list > div").length;
  lines.push(`• ${promoCountEl} member(s) ready for promotion approval`);
  if (currentBirthdayNotifs.length) {
    lines.push(`• Upcoming birthdays:`);
    lines.push(...currentBirthdayNotifs.map((n) => `   – ${n.member.full_name} (${birthdayCountdownLabel(n.daysUntil)})`));
  }
  sendWhatsApp(lines.join("\n"));
}

// ============================================================
// INTAKE SUBMISSIONS — click a card to review, edit, approve/dismiss
// ============================================================
async function loadSubmissions() {
  const { data, error } = await supabase
    .from("intake_submissions")
    .select("*")
    .eq("reviewed", false)
    .order("submitted_at", { ascending: false });

  const el = document.getElementById("submissions-list");
  if (error) { el.innerHTML = `<div class="msg msg-error">${error.message}</div>`; return; }
  allSubmissions = data;
  if (!data.length) { el.innerHTML = `<p style="color:#5a5748;">No new submissions.</p>`; return; }

  el.innerHTML = data.map((s) => `
    <div class="submission-row" data-id="${s.id}" style="display:flex; gap:14px; align-items:center; border:1px solid var(--line); border-radius:6px; padding:12px 14px; margin-bottom:10px; cursor:pointer;">
      ${s.photo_url ? `<img src="${s.photo_url}" alt="" style="width:48px;height:48px;border-radius:50%;object-fit:cover;flex-shrink:0;" />` : `<div style="width:48px;height:48px;border-radius:50%;background:var(--charcoal);flex-shrink:0;"></div>`}
      <div style="flex:1;">
        <strong>${escapeHtml(s.full_name)}</strong> — ${escapeHtml(s.mobile || "")} · ${escapeHtml(s.city || "")}
        <div style="font-size:12px; color:#5a5748;">Tap to review full application →</div>
      </div>
    </div>
  `).join("");

  el.querySelectorAll(".submission-row").forEach((row) =>
    row.addEventListener("click", () => openSubmissionModal(row.dataset.id)));
}

function openSubmissionModal(id) {
  const s = allSubmissions.find((x) => x.id === id);
  if (!s) return;

  const fieldsHtml = SUBMISSION_FIELDS.map(([key, label, type]) => `
    <div class="${key === "email" || key === "bike_model" || key === "profession" || key === "emergency_contact_mobile" ? "full" : ""}">
      <label>${label}</label>
      <input data-key="${key}" data-type="${type}" type="${type === "date" ? "date" : "text"}" value="${escapeHtml(s[key] || "")}" />
    </div>`).join("");

  openModal(`
    <h2>Review Application</h2>
    <div style="font-size:13px; color:#5a5748; margin-bottom:10px;">Submitted ${new Date(s.submitted_at).toLocaleDateString()}</div>

    <div class="form-grid" style="margin-bottom:6px;">
      <div>${adjustWidgetHtml({ idPrefix: "sub-photo", label: "Personal Photo", imgUrl: s.photo_url, shape: "circle", values: { zoom: s.photo_zoom, x: s.photo_pos_x, y: s.photo_pos_y } })}</div>
      <div>${adjustWidgetHtml({ idPrefix: "sub-bike-photo", label: "Bike Photo", imgUrl: s.bike_photo_url, shape: "rect", values: { zoom: s.bike_photo_zoom, x: s.bike_photo_pos_x, y: s.bike_photo_pos_y } })}</div>
    </div>

    <div class="form-grid">
      ${fieldsHtml}
      <div>
        <label>Riding Experience</label>
        <select data-key="riding_since_year" id="submission-riding-years">
          ${ridingExperienceOptionsHtml(sinceYearToYears(s.riding_since_year))}
        </select>
      </div>
    </div>
    <div id="submission-msg"></div>
    <div class="modal-actions">
      <button class="gold" id="approve-btn">Approve &amp; Add to Master Record</button>
      <button class="ghost" id="dismiss-btn" style="color:var(--red); border-color:var(--red);">Dismiss</button>
      <button class="ghost" id="close-btn">Close</button>
    </div>
  `);

  const getPhotoValues = wireAdjustWidget("sub-photo", { isAvatar: true });
  const getBikePhotoValues = wireAdjustWidget("sub-bike-photo");

  document.getElementById("approve-btn").addEventListener("click", () => approveSubmission(id, getPhotoValues, getBikePhotoValues));
  document.getElementById("dismiss-btn").addEventListener("click", () => confirmDismiss(id, s.full_name));
  document.getElementById("close-btn").addEventListener("click", () => closeModal());
}

function confirmDismiss(id, name) {
  const overlay = document.getElementById("shared-modal-overlay");
  const msg = document.getElementById("submission-msg");
  msg.innerHTML = `
    <div class="delete-confirm-box">
      <p>Dismiss ${escapeHtml(name)}'s application? This removes it from your review queue.</p>
      <button class="danger" id="confirm-dismiss-btn">Yes, dismiss</button>
      <button class="ghost" id="cancel-dismiss-btn">Cancel</button>
    </div>`;
  document.getElementById("confirm-dismiss-btn").addEventListener("click", () => dismissSubmission(id));
  document.getElementById("cancel-dismiss-btn").addEventListener("click", () => { msg.innerHTML = ""; });
}

function collectSubmissionEdits() {
  const overlay = document.getElementById("shared-modal-overlay");
  const edits = {};
  overlay.querySelectorAll("[data-key]").forEach((el) => {
    if (el.dataset.key === "riding_since_year") {
      edits.riding_since_year = el.value === "" ? null : yearsToSinceYear(el.value);
      return;
    }
    let v = el.value.trim();
    const type = el.dataset.type;
    if (type === "name") v = titleCase(v);
    else if (type === "email") v = normalizeEmail(v);
    else if (type === "phone") v = normalizePhone(v);
    edits[el.dataset.key] = v === "" ? null : v;
  });
  return edits;
}

async function approveSubmission(id, getPhotoValues, getBikePhotoValues) {
  const s = allSubmissions.find((x) => x.id === id);
  const edits = collectSubmissionEdits();
  const merged = { ...s, ...edits };
  const photoVals = getPhotoValues();
  const bikeVals = getBikePhotoValues();

  const { error: insertErr } = await supabase.from("members").insert({
    full_name: merged.full_name,
    membership_level: "Hang-around",
    chapter_id: merged.chapter_id,
    city: merged.city,
    neighborhood: merged.neighborhood,
    mobile: merged.mobile,
    whatsapp: merged.whatsapp,
    email: merged.email,
    date_of_birth: merged.date_of_birth,
    bike_model: merged.bike_model,
    profession: merged.profession,
    riding_since_year: merged.riding_since_year,
    emergency_contact_name: merged.emergency_contact_name,
    emergency_contact_relation: merged.emergency_contact_relation,
    emergency_contact_mobile: merged.emergency_contact_mobile,
    photo_url: s.photo_url,
    bike_photo_url: s.bike_photo_url,
    photo_zoom: photoVals.zoom, photo_pos_x: photoVals.x, photo_pos_y: photoVals.y,
    bike_photo_zoom: bikeVals.zoom, bike_photo_pos_x: bikeVals.x, bike_photo_pos_y: bikeVals.y,
    date_joined: new Date().toISOString().slice(0, 10),
  });
  if (insertErr) {
    document.getElementById("submission-msg").innerHTML = `<div class="msg msg-error">${insertErr.message}</div>`;
    return;
  }
  await supabase.from("intake_submissions").update({ reviewed: true }).eq("id", id);
  closeModal();
  await loadSubmissions();
  await refreshNavBadge();
}

async function dismissSubmission(id) {
  await supabase.from("intake_submissions").update({ reviewed: true }).eq("id", id);
  closeModal();
  await loadSubmissions();
  await refreshNavBadge();
}

// ============================================================
// PENDING MEMBER UPDATES — self-update link submissions, reviewed
// before anything touches the real Master Record row.
// ============================================================
async function loadUpdateRequests() {
  const { data, error } = await supabase
    .from("member_update_requests")
    .select(`*, members (
      full_name, membership_level, city, neighborhood, mobile, whatsapp, email,
      date_of_birth, bike_model, profession, riding_since_year,
      emergency_contact_name, emergency_contact_relation, emergency_contact_mobile,
      photo_url, bike_photo_url, photo_zoom, photo_pos_x, photo_pos_y,
      bike_photo_zoom, bike_photo_pos_x, bike_photo_pos_y
    )`)
    .eq("reviewed", false)
    .order("submitted_at", { ascending: false });

  const el = document.getElementById("update-requests-list");
  if (error) { el.innerHTML = `<div class="msg msg-error">${error.message}</div>`; return; }
  allUpdateRequests = data || [];
  if (!allUpdateRequests.length) { el.innerHTML = `<p style="color:#5a5748;">No pending updates.</p>`; return; }

  el.innerHTML = allUpdateRequests.map((r) => `
    <div class="update-request-row" data-id="${r.id}" style="display:flex; gap:14px; align-items:center; border:1px solid var(--line); border-radius:6px; padding:12px 14px; margin-bottom:10px; cursor:pointer;">
      ${r.photo_url ? `<img src="${r.photo_url}" alt="" style="width:48px;height:48px;border-radius:50%;object-fit:cover;flex-shrink:0;" />` : `<div style="width:48px;height:48px;border-radius:50%;background:var(--charcoal);flex-shrink:0;"></div>`}
      <div style="flex:1;">
        <strong>${escapeHtml(r.members.full_name)}</strong>
        <div style="font-size:12px; color:#5a5748;">Submitted ${new Date(r.submitted_at).toLocaleDateString()} — tap to review changes →</div>
      </div>
    </div>
  `).join("");

  el.querySelectorAll(".update-request-row").forEach((row) =>
    row.addEventListener("click", () => openUpdateRequestModal(row.dataset.id)));
}

function diffRowHtml(label, key, currentVal, proposedVal, inputType = "text") {
  const changed = (proposedVal ?? "") !== (currentVal ?? "");
  return `
    <div class="field full" style="${changed ? "background:var(--amber-bg); border-radius:4px; padding:6px 8px;" : ""}">
      <div class="k">${label}${changed ? " (changed)" : ""}</div>
      <div style="display:flex; gap:12px; align-items:center; margin-top:4px;">
        <div style="flex:1; font-size:12.5px; color:#8a8672;">Current: ${currentVal ? escapeHtml(String(currentVal)) : "—"}</div>
        <div style="flex:1;"><input data-key="${key}" type="${inputType}" value="${escapeHtml(proposedVal ?? "")}" /></div>
      </div>
    </div>`;
}

function openUpdateRequestModal(id) {
  const r = allUpdateRequests.find((x) => x.id === id);
  if (!r) return;
  const cur = r.members;

  const fieldsHtml = UPDATE_REQUEST_FIELDS.map(([key, label]) =>
    diffRowHtml(label, key, cur[key], r[key], key === "date_of_birth" ? "date" : "text")
  ).join("");

  const currentYears = cur.riding_since_year != null ? sinceYearToYears(cur.riding_since_year) : null;
  const proposedYears = r.riding_since_year != null ? sinceYearToYears(r.riding_since_year) : currentYears;

  openModal(`
    <h2>Review Changes — ${escapeHtml(cur.full_name)}</h2>
    <p style="color:#5a5748; font-size:12.5px;">Submitted ${new Date(r.submitted_at).toLocaleDateString()}. Amber rows are what changed — edit the proposed value on the right if needed before approving.</p>

    <div class="form-grid" style="margin:14px 0;">
      <div>
        <label>Personal Photo</label>
        <div style="display:flex; gap:8px; margin-bottom:6px;">
          <div style="text-align:center; font-size:11px; color:#8a8672;">
            ${cur.photo_url ? `<img src="${cur.photo_url}" style="width:70px;height:70px;border-radius:50%;object-fit:cover;" />` : ""}<br/>Current
          </div>
        </div>
        ${adjustWidgetHtml({ idPrefix: "req-photo", label: "Proposed", imgUrl: r.photo_url || cur.photo_url, shape: "circle", values: { zoom: r.photo_zoom, x: r.photo_pos_x, y: r.photo_pos_y } })}
      </div>
      <div>
        <label>Bike Photo</label>
        <div style="margin-bottom:6px; font-size:11px; color:#8a8672;">
          ${cur.bike_photo_url ? `<img src="${cur.bike_photo_url}" style="width:100%; max-height:90px; object-fit:cover; border-radius:4px;" />` : ""} Current
        </div>
        ${adjustWidgetHtml({ idPrefix: "req-bike-photo", label: "Proposed", imgUrl: r.bike_photo_url || cur.bike_photo_url, shape: "rect", values: { zoom: r.bike_photo_zoom, x: r.bike_photo_pos_x, y: r.bike_photo_pos_y } })}
      </div>
    </div>

    <div class="form-grid">
      ${fieldsHtml}
      <div class="field full" style="${proposedYears !== currentYears ? "background:var(--amber-bg); border-radius:4px; padding:6px 8px;" : ""}">
        <div class="k">Riding Experience${proposedYears !== currentYears ? " (changed)" : ""}</div>
        <div style="display:flex; gap:12px; align-items:center; margin-top:4px;">
          <div style="flex:1; font-size:12.5px; color:#8a8672;">Current: ${currentYears !== null ? currentYears + " yrs" : "—"}</div>
          <div style="flex:1;"><select data-key="riding_since_year" id="req-riding-years">${ridingExperienceOptionsHtml(proposedYears)}</select></div>
        </div>
      </div>
    </div>

    <div id="update-request-msg"></div>
    <div class="modal-actions">
      <button class="gold" id="approve-update-btn">Approve &amp; Apply to Master Record</button>
      <button class="ghost" id="dismiss-update-btn" style="color:var(--red); border-color:var(--red);">Dismiss</button>
      <button class="ghost" id="close-update-btn">Close</button>
    </div>
  `);

  const getPhotoValues = wireAdjustWidget("req-photo", { isAvatar: true });
  const getBikePhotoValues = wireAdjustWidget("req-bike-photo");

  document.getElementById("approve-update-btn").addEventListener("click", () => approveUpdateRequest(r, getPhotoValues, getBikePhotoValues));
  document.getElementById("dismiss-update-btn").addEventListener("click", () => confirmDismissUpdate(r));
  document.getElementById("close-update-btn").addEventListener("click", () => closeModal());
}

function confirmDismissUpdate(r) {
  const msg = document.getElementById("update-request-msg");
  msg.innerHTML = `
    <div class="delete-confirm-box">
      <p>Dismiss ${escapeHtml(r.members.full_name)}'s update request without applying it?</p>
      <button class="danger" id="confirm-dismiss-update-btn">Yes, dismiss</button>
      <button class="ghost" id="cancel-dismiss-update-btn">Cancel</button>
    </div>`;
  document.getElementById("confirm-dismiss-update-btn").addEventListener("click", () => dismissUpdateRequest(r.id));
  document.getElementById("cancel-dismiss-update-btn").addEventListener("click", () => { msg.innerHTML = ""; });
}

async function approveUpdateRequest(r, getPhotoValues, getBikePhotoValues) {
  const overlay = document.getElementById("shared-modal-overlay");
  const payload = {};
  overlay.querySelectorAll("[data-key]").forEach((el) => {
    if (el.dataset.key === "riding_since_year") {
      payload.riding_since_year = el.value === "" ? null : yearsToSinceYear(el.value);
      return;
    }
    const v = el.value.trim();
    payload[el.dataset.key] = v === "" ? null : v;
  });
  const photoVals = getPhotoValues();
  const bikeVals = getBikePhotoValues();
  payload.photo_url = r.photo_url || r.members.photo_url;
  payload.bike_photo_url = r.bike_photo_url || r.members.bike_photo_url;
  payload.photo_zoom = photoVals.zoom; payload.photo_pos_x = photoVals.x; payload.photo_pos_y = photoVals.y;
  payload.bike_photo_zoom = bikeVals.zoom; payload.bike_photo_pos_x = bikeVals.x; payload.bike_photo_pos_y = bikeVals.y;

  const { error } = await supabase.from("members").update(payload).eq("id", r.member_id);
  if (error) {
    document.getElementById("update-request-msg").innerHTML = `<div class="msg msg-error">${error.message}</div>`;
    return;
  }
  await supabase.from("member_update_requests").update({ reviewed: true }).eq("id", r.id);
  closeModal();
  await loadUpdateRequests();
  await refreshNavBadge();
}

async function dismissUpdateRequest(id) {
  await supabase.from("member_update_requests").update({ reviewed: true }).eq("id", id);
  closeModal();
  await loadUpdateRequests();
  await refreshNavBadge();
}

// ============================================================
// PROMOTION APPROVAL — feeds the same membership_level field that
// Master Record's rank dropdown edits, so both stay in sync automatically.
// ============================================================
async function loadPromotions() {
  const [{ data: members }, { data: rides }, { data: attendance }] = await Promise.all([
    supabase.from("members").select("*"),
    supabase.from("rides").select("*"),
    supabase.from("attendance").select("*"),
  ]);

  const ready = members
    .map((m) => ({ m, stats: computeMemberStats(m, rides, attendance) }))
    .filter((x) => x.stats.promotionStatus === "ready");

  const el = document.getElementById("promotions-list");
  if (!ready.length) { el.innerHTML = `<p style="color:#5a5748;">No one is ready right now.</p>`; return; }

  el.innerHTML = ready.map(({ m, stats }) => {
    const nextLevel = m.membership_level === "Hang-around" ? "Prospect" : "Full-Batch";
    return `
    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; border:1px solid var(--line); border-radius:6px; padding:12px 14px; margin-bottom:10px;">
      <div>
        <strong>${escapeHtml(m.full_name)}</strong>
        <div style="font-size:12.5px; color:#5a5748;">${m.membership_level} → ${nextLevel} · streak ${stats.currentStreak}/${REQUIRED_STREAK[m.membership_level]}</div>
      </div>
      <button class="gold" data-promote="${m.id}" data-next="${nextLevel}">Approve Promotion</button>
    </div>`;
  }).join("");

  el.querySelectorAll("[data-promote]").forEach((btn) =>
    btn.addEventListener("click", () => approvePromotion(btn.dataset.promote, btn.dataset.next)));
}

async function approvePromotion(memberId, nextLevel) {
  const payload = { membership_level: nextLevel };
  const today = new Date().toISOString().slice(0, 10);
  if (nextLevel === "Prospect") payload.promotion_date_prospect = today;
  if (nextLevel === "Full-Batch") payload.promotion_date_fullbatch = today;

  const { error } = await supabase.from("members").update(payload).eq("id", memberId);
  if (error) { alert(error.message); return; }
  await loadPromotions();
  await refreshNavBadge();
}

// ============================================================
// EXPORT
// ============================================================
async function exportAdminData() {
  const submissionRows = allSubmissions.map((s) => ({
    "Full Name": s.full_name, "Mobile": s.mobile || "", "City": s.city || "",
    "Email": s.email || "", "Bike Model": s.bike_model || "",
    "Submitted": new Date(s.submitted_at).toLocaleDateString(),
  }));

  const [{ data: members }, { data: rides }, { data: attendance }] = await Promise.all([
    supabase.from("members").select("*"),
    supabase.from("rides").select("*"),
    supabase.from("attendance").select("*"),
  ]);
  const promoRows = (members || [])
    .map((m) => ({ m, stats: computeMemberStats(m, rides || [], attendance || []) }))
    .filter((x) => x.stats.promotionStatus === "ready")
    .map(({ m, stats }) => ({
      "Name": m.full_name, "Current Rank": m.membership_level,
      "Streak": `${stats.currentStreak}/${REQUIRED_STREAK[m.membership_level]}`,
    }));

  const birthdayRows = currentBirthdayNotifs.map(({ member, daysUntil, nextDate }) => ({
    "Name": member.full_name,
    "Next Birthday": nextDate.toLocaleDateString(),
    "Countdown": birthdayCountdownLabel(daysUntil),
  }));

  const updateRows = allUpdateRequests.map((r) => ({
    "Name": r.members.full_name, "Submitted": new Date(r.submitted_at).toLocaleDateString(),
  }));

  exportToExcel(`Commanders_LEMC_Admin_${new Date().toISOString().slice(0, 10)}.xlsx`, [
    { name: "New Submissions", rows: submissionRows },
    { name: "Pending Member Updates", rows: updateRows },
    { name: "Ready for Promotion", rows: promoRows },
    { name: "Upcoming Birthdays", rows: birthdayRows },
  ]);
}

// ============================================================
// OFFICERS & ROLES
// ============================================================
async function loadProfiles() {
  const { data, error } = await supabase.from("profiles").select("*").order("full_name");
  const el = document.getElementById("profiles-list");
  if (error) { el.innerHTML = `<div class="msg msg-error">${error.message}</div>`; return; }

  el.innerHTML = `<div class="table-scroll"><table><thead><tr><th>Name</th><th>Role</th><th></th></tr></thead><tbody>` +
    data.map((p) => `
      <tr>
        <td>${escapeHtml(p.full_name)}</td>
        <td>${p.role}</td>
        <td>${p.id === session.user.id
          ? "<em>you</em>"
          : `<button class="ghost" data-toggle-role="${p.id}" data-current="${p.role}">
               Make ${p.role === "admin" ? "Officer" : "Admin"}
             </button>`}
        </td>
      </tr>`).join("") +
    `</tbody></table></div>`;

  el.querySelectorAll("[data-toggle-role]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const newRole = btn.dataset.current === "admin" ? "officer" : "admin";
      if (!confirm(`Change this person's role to ${newRole}?`)) return;
      const { error } = await supabase.from("profiles").update({ role: newRole }).eq("id", btn.dataset.toggleRole);
      if (error) { alert(error.message); return; }
      await loadProfiles();
    }));
}
