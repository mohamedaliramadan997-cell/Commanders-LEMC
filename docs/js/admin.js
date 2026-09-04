import { supabase } from "./supabaseClient.js";
import { requireAuth, applyRoleVisibility, escapeHtml } from "./auth.js";
import { computeMemberStats, REQUIRED_STREAK } from "./streaks.js";
import { titleCase, normalizeEmail, normalizePhone, sinceYearToYears, ridingExperienceOptionsHtml, yearsToSinceYear } from "./utils.js";
import { openModal, closeModal } from "./modal.js";
import { adjustWidgetHtml, wireAdjustWidget } from "./photoAdjust.js";
import { getBirthdayNotifications, acknowledgeBirthday, refreshNavBadge } from "./notifications.js";

let session, allSubmissions = [];

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
  await Promise.all([loadNotifications(), loadSubmissions(), loadPromotions(), loadProfiles()]);
}

// ============================================================
// NOTIFICATIONS — birthday reminders (1 day before), acknowledgeable
// ============================================================
let currentBirthdayNotifs = [];

async function loadNotifications() {
  const el = document.getElementById("notifications-list");
  currentBirthdayNotifs = await getBirthdayNotifications();

  if (!currentBirthdayNotifs.length) {
    el.innerHTML = `<p style="color:#5a5748;">Nothing to flag right now.</p>`;
    return;
  }

  el.innerHTML = currentBirthdayNotifs.map(({ member, notifDate }) => `
    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; border:1px solid var(--line); border-radius:6px; padding:12px 14px; margin-bottom:10px;">
      <div>
        <span class="pill pill-soon">Birthday tomorrow</span>
        <strong style="margin-left:8px;">${escapeHtml(member.full_name)}</strong>
      </div>
      <div style="display:flex; gap:8px;">
        <button class="ghost" data-wa-birthday="${member.id}">Send via WhatsApp</button>
        <button class="gold" data-ack="${member.id}" data-date="${notifDate}">Acknowledge</button>
      </div>
    </div>
  `).join("");

  el.querySelectorAll("[data-ack]").forEach((btn) =>
    btn.addEventListener("click", () => acknowledge(btn.dataset.ack, btn.dataset.date)));
  el.querySelectorAll("[data-wa-birthday]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const notif = currentBirthdayNotifs.find((n) => n.member.id === btn.dataset.waBirthday);
      if (notif) sendWhatsApp(`Reminder: it's ${notif.member.full_name}'s birthday tomorrow — Commanders LEMC UAE.`);
    }));
}

async function acknowledge(memberId, notifDate) {
  await acknowledgeBirthday(memberId, notifDate, session.user.id);
  await loadNotifications();
  await refreshNavBadge();
}

function sendWhatsApp(text) {
  window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, "_blank");
}

async function sendWhatsAppSummary() {
  const lines = ["Commanders LEMC — UAE Chapter — Admin summary:"];
  const subCountEl = document.querySelectorAll("#submissions-list > div").length;
  lines.push(`• ${subCountEl} new intake submission(s) awaiting review`);
  const promoCountEl = document.querySelectorAll("#promotions-list > div").length;
  lines.push(`• ${promoCountEl} member(s) ready for promotion approval`);
  lines.push(`• ${currentBirthdayNotifs.length} birthday reminder(s) for tomorrow`);
  if (currentBirthdayNotifs.length) {
    lines.push(...currentBirthdayNotifs.map((n) => `   – ${n.member.full_name}`));
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
