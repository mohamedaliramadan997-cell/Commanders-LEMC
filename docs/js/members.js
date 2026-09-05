import { supabase } from "./supabaseClient.js";
import { requireAuth, applyRoleVisibility, escapeHtml } from "./auth.js";
import { ridingExperienceOptionsHtml, yearsToSinceYear, sinceYearToYears, uploadPhotoToStorage } from "./utils.js";
import { openModal, setModalContent, closeModal } from "./modal.js";
import { photoStyle, adjustWidgetHtml, wireAdjustWidget } from "./photoAdjust.js";

const LEVELS = ["Hang-around", "Prospect", "Full-Batch", "Honor Member"];

const EDIT_FIELDS = [
  ["full_name", "Full Name", "text", "full"],
  ["officer_title", "Officer Position / Title", "text", ""],
  ["city", "City", "text", ""],
  ["neighborhood", "Neighborhood", "text", ""],
  ["date_joined", "Date Joined (Hang-around)", "date", ""],
  ["promotion_date_prospect", "Promotion Date → Prospect", "date", ""],
  ["promotion_date_fullbatch", "Promotion Date → Full-Batch", "date", ""],
  ["mobile", "Mobile Number", "text", ""],
  ["whatsapp", "WhatsApp Number", "text", ""],
  ["email", "Email", "text", ""],
  ["date_of_birth", "Date of Birth", "date", ""],
  ["bike_model", "Bike Model", "text", "", "Brand, Model, Year — e.g. Harley-Davidson, Street Glide, 2022"],
  ["profession", "Profession / Occupation", "text", ""],
  ["emergency_contact_name", "Emergency Contact — Name", "text", ""],
  ["emergency_contact_relation", "Emergency Contact — Relation", "text", ""],
  ["emergency_contact_mobile", "Emergency Contact — Mobile", "text", ""],
  ["photo_url", "Photo URL", "text", "full"],
  ["bike_photo_url", "Bike Photo URL", "text", "full"],
  ["notes", "Notes", "text", "full"],
];

let session, allMembers = [];

init();

async function init() {
  session = await requireAuth();
  if (!session) return;
  applyRoleVisibility(session.profile.role);
  if (session.profile.role !== "admin") {
    document.getElementById("readonly-note").style.display = "inline";
  }

  document.getElementById("search").addEventListener("input", render);
  document.getElementById("filter-level").addEventListener("change", render);
  document.getElementById("add-btn").addEventListener("click", () => openEditModal(null));

  document.getElementById("edit-panel")?.remove(); // old inline panel no longer used

  await load();
}

async function load() {
  const { data, error } = await supabase.from("members").select("*").order("full_name");
  if (error) { console.error(error); return; }
  allMembers = data;
  render();
}

function render() {
  const q = document.getElementById("search").value.trim().toLowerCase();
  const lvl = document.getElementById("filter-level").value;
  const rows = allMembers.filter((m) =>
    (!q || m.full_name.toLowerCase().includes(q)) && (!lvl || m.membership_level === lvl)
  );

  const body = document.getElementById("members-body");
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="8">No members match.</td></tr>`;
    return;
  }
  body.innerHTML = rows.map((m) => `
    <tr data-id="${m.id}" style="cursor:pointer;">
      <td><strong>${escapeHtml(m.full_name)}</strong></td>
      <td>${escapeHtml(m.membership_level)}</td>
      <td>${escapeHtml(m.officer_title || "")}</td>
      <td>${escapeHtml(m.city || "")}</td>
      <td>${escapeHtml(m.mobile || "")}</td>
      <td>${escapeHtml(m.whatsapp || "")}</td>
      <td>${escapeHtml(m.email || "")}</td>
      <td>${escapeHtml(m.bike_model || "")}</td>
    </tr>
  `).join("");

  body.querySelectorAll("tr").forEach((tr) => {
    tr.addEventListener("click", () => openViewModal(tr.dataset.id));
  });
}

// ============================================================
// VIEW MODE (read-only, professional profile card)
// ============================================================
function openViewModal(id) {
  const m = allMembers.find((x) => x.id === id);
  if (!m) return;
  openModal(viewHtml(m));
  wireViewActions(m);
}

function viewHtml(m) {
  const initials = (m.full_name || "?").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const years = sinceYearToYears(m.riding_since_year);

  const fields = [
    ["Membership Level", m.membership_level, "full"],
    ["City", m.city], ["Neighborhood", m.neighborhood],
    ["Mobile", m.mobile], ["WhatsApp", m.whatsapp],
    ["Email", m.email, "full"],
    ["Date of Birth", m.date_of_birth], ["Riding Experience", years !== null ? `${years} ${years === 1 ? "year" : "years"}` : ""],
    ["Bike Model", m.bike_model, "full"],
    ["Profession", m.profession, "full"],
    ["Date Joined (Hang-around)", m.date_joined],
    ["Promotion → Prospect", m.promotion_date_prospect],
    ["Promotion → Full-Batch", m.promotion_date_fullbatch],
    ["Emergency Contact", m.emergency_contact_name ? `${m.emergency_contact_name} (${m.emergency_contact_relation || "—"})` : "", ""],
    ["Emergency Mobile", m.emergency_contact_mobile],
    ["Notes", m.notes, "full"],
  ];

  return `
    <div class="profile-header">
      ${m.photo_url
        ? `<div class="profile-photo-frame"><img src="${m.photo_url}" alt="${escapeHtml(m.full_name)}" style="${photoStyle({ zoom: m.photo_zoom, x: m.photo_pos_x, y: m.photo_pos_y, isAvatar: true })}" /></div>`
        : `<div class="profile-photo-placeholder">${escapeHtml(initials)}</div>`}
      <div>
        <h2>${escapeHtml(m.full_name)}</h2>
        <div class="profile-title">
          <span class="pill pill-progress">${escapeHtml(m.membership_level)}</span>
          ${m.officer_title ? ` · ${escapeHtml(m.officer_title)}` : ""}
        </div>
      </div>
    </div>

    <div class="profile-grid">
      ${fields.filter(([, v]) => v !== undefined).map(([k, v, span]) => `
        <div class="field ${span === "full" ? "full" : ""}">
          <div class="k">${k}</div>
          <div class="v">${v ? escapeHtml(String(v)) : "—"}</div>
        </div>`).join("")}
    </div>

    <div class="bike-photo-strip" style="margin-top:16px;">
      <div class="k" style="margin-bottom:6px;">BIKE</div>
      ${m.bike_photo_url
        ? `<div class="bike-photo-frame"><img src="${m.bike_photo_url}" alt="Bike" style="${photoStyle({ zoom: m.bike_photo_zoom, x: m.bike_photo_pos_x, y: m.bike_photo_pos_y })}" /></div>`
        : `<div class="no-photo">No bike photo uploaded</div>`}
    </div>

    <div class="modal-actions" data-admin-only>
      <button class="gold" id="modal-edit-btn">Edit</button>
      <button class="ghost" id="modal-delete-btn" style="color:var(--red); border-color:var(--red);">Delete Record</button>
    </div>
    <div id="delete-zone"></div>
  `;
}

function wireViewActions(m) {
  const overlay = document.getElementById("shared-modal-overlay");
  overlay.querySelectorAll("[data-admin-only]").forEach((el) => {
    if (session.profile.role !== "admin") el.style.display = "none";
  });
  document.getElementById("modal-edit-btn")?.addEventListener("click", () => openEditModal(m.id));
  document.getElementById("modal-delete-btn")?.addEventListener("click", () => {
    document.getElementById("delete-zone").innerHTML = `
      <div class="delete-confirm-box">
        <p>Delete ${escapeHtml(m.full_name)} permanently? This cannot be undone.</p>
        <button class="danger" id="confirm-delete-btn">Yes, delete permanently</button>
        <button class="ghost" id="cancel-delete-btn">Cancel</button>
      </div>`;
    document.getElementById("confirm-delete-btn").addEventListener("click", () => deleteMember(m.id));
    document.getElementById("cancel-delete-btn").addEventListener("click", () => {
      document.getElementById("delete-zone").innerHTML = "";
    });
  });
}

async function deleteMember(id) {
  const { error } = await supabase.from("members").delete().eq("id", id);
  if (error) { alert(error.message); return; }
  closeModal();
  await load();
}

// ============================================================
// EDIT MODE
// ============================================================
function openEditModal(id) {
  const m = id ? allMembers.find((x) => x.id === id) : {};
  setModalOrOpen(editHtml(m, !!id));
  wireEditActions(id);
}

function setModalOrOpen(html) {
  if (document.getElementById("shared-modal-overlay")) setModalContent(html);
  else openModal(html);
}

function editHtml(m, isExisting) {
  const rankOptions = LEVELS.map((l) => `<option ${l === m.membership_level ? "selected" : ""}>${l}</option>`).join("");
  const fieldsHtml = EDIT_FIELDS.map(([key, label, type, span, placeholder]) => {
    const val = m[key] ?? "";
    return `<div class="${span === "full" ? "full" : ""}">
      <label>${label}</label>
      <input data-key="${key}" type="${type}" value="${escapeHtml(val)}" ${placeholder ? `placeholder="${escapeHtml(placeholder)}"` : ""} />
    </div>`;
  }).join("");

  return `
    <h2>${isExisting ? "Edit Member" : "Add New Member"}</h2>

    <div class="form-grid" style="margin-bottom:6px;">
      <div>
        <div id="edit-photo-widget-container">${adjustWidgetHtml({ idPrefix: "edit-photo", label: "Personal Photo", imgUrl: m.photo_url, shape: "circle", values: { zoom: m.photo_zoom, x: m.photo_pos_x, y: m.photo_pos_y } })}</div>
        <label style="margin-top:8px;">${m.photo_url ? "Replace" : "Upload"} personal photo</label>
        <input type="file" accept="image/*" id="edit-photo-upload" />
        <div id="edit-photo-upload-msg" style="font-size:12px; margin-top:4px;"></div>
      </div>
      <div>
        <div id="edit-bike-photo-widget-container">${adjustWidgetHtml({ idPrefix: "edit-bike-photo", label: "Bike Photo", imgUrl: m.bike_photo_url, shape: "rect", values: { zoom: m.bike_photo_zoom, x: m.bike_photo_pos_x, y: m.bike_photo_pos_y } })}</div>
        <label style="margin-top:8px;">${m.bike_photo_url ? "Replace" : "Upload"} bike photo</label>
        <input type="file" accept="image/*" id="edit-bike-photo-upload" />
        <div id="edit-bike-photo-upload-msg" style="font-size:12px; margin-top:4px;"></div>
      </div>
    </div>

    <div class="form-grid">
      <div class="full">
        <label>Membership Level</label>
        <select data-key="membership_level" id="rank-select">${rankOptions}</select>
      </div>
      ${fieldsHtml}
      <div>
        <label>Riding Experience (auto-updates every year)</label>
        <select data-key="riding_since_year" id="riding-years-select">
          ${ridingExperienceOptionsHtml(sinceYearToYears(m.riding_since_year))}
        </select>
      </div>
    </div>
    <div id="edit-msg"></div>
    <div class="modal-actions">
      <button class="gold" id="save-btn">Save</button>
      <button class="ghost" id="cancel-edit-btn">Cancel</button>
    </div>
  `;
}

function wireEditActions(id) {
  let getPhotoValues = wireAdjustWidget("edit-photo", { isAvatar: true });
  let getBikePhotoValues = wireAdjustWidget("edit-bike-photo");

  wirePhotoUpload({
    fileInputId: "edit-photo-upload", msgId: "edit-photo-upload-msg",
    containerId: "edit-photo-widget-container", idPrefix: "edit-photo",
    label: "Personal Photo", shape: "circle", isAvatar: true, bucket: "member-photos",
    urlFieldKey: "photo_url",
    onRewired: (getValues) => { getPhotoValues = getValues; },
  });
  wirePhotoUpload({
    fileInputId: "edit-bike-photo-upload", msgId: "edit-bike-photo-upload-msg",
    containerId: "edit-bike-photo-widget-container", idPrefix: "edit-bike-photo",
    label: "Bike Photo", shape: "rect", isAvatar: false, bucket: "bike-photos",
    urlFieldKey: "bike_photo_url",
    onRewired: (getValues) => { getBikePhotoValues = getValues; },
  });

  document.getElementById("save-btn").addEventListener("click", () => saveMember(id, () => getPhotoValues(), () => getBikePhotoValues()));
  document.getElementById("cancel-edit-btn").addEventListener("click", () => {
    if (id) openViewModal(id);
    else closeModal();
  });
}

function wirePhotoUpload({ fileInputId, msgId, containerId, idPrefix, label, shape, isAvatar, bucket, urlFieldKey, onRewired }) {
  const fileInput = document.getElementById(fileInputId);
  const msgEl = document.getElementById(msgId);
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    if (!file) return;
    msgEl.textContent = "Uploading…";
    try {
      const url = await uploadPhotoToStorage(supabase, file, bucket);
      // Update the (hidden-ish, visible) URL text field so Save picks it up.
      const urlField = document.querySelector(`[data-key="${urlFieldKey}"]`);
      if (urlField) urlField.value = url;
      // Re-render the adjust widget fresh, reset to default framing for the new photo.
      const container = document.getElementById(containerId);
      container.innerHTML = adjustWidgetHtml({ idPrefix, label, imgUrl: url, shape, values: { zoom: 1, x: 50, y: 50 } });
      const getValues = wireAdjustWidget(idPrefix, { isAvatar });
      onRewired(getValues);
      msgEl.textContent = "Uploaded. Adjust the framing below if needed, then Save.";
    } catch (err) {
      msgEl.textContent = err.message || "Upload failed.";
    }
  });
}

async function saveMember(id, getPhotoValues, getBikePhotoValues) {
  const overlay = document.getElementById("shared-modal-overlay");
  const inputs = overlay.querySelectorAll("[data-key]");
  const payload = {};
  inputs.forEach((el) => {
    if (el.dataset.key === "riding_since_year") {
      payload.riding_since_year = el.value === "" ? null : yearsToSinceYear(el.value);
      return;
    }
    const v = el.value.trim();
    payload[el.dataset.key] = v === "" ? null : v;
  });

  const photoVals = getPhotoValues();
  payload.photo_zoom = photoVals.zoom;
  payload.photo_pos_x = photoVals.x;
  payload.photo_pos_y = photoVals.y;
  const bikeVals = getBikePhotoValues();
  payload.bike_photo_zoom = bikeVals.zoom;
  payload.bike_photo_pos_x = bikeVals.x;
  payload.bike_photo_pos_y = bikeVals.y;

  if (!payload.full_name) {
    document.getElementById("edit-msg").innerHTML = `<div class="msg msg-error">Full name is required.</div>`;
    return;
  }

  const query = id
    ? supabase.from("members").update(payload).eq("id", id)
    : supabase.from("members").insert(payload);

  const { error } = await query;
  if (error) {
    document.getElementById("edit-msg").innerHTML = `<div class="msg msg-error">${error.message}</div>`;
    return;
  }
  await load();
  const savedId = id || allMembers.find((m) => m.full_name === payload.full_name)?.id;
  closeModal();
  if (savedId) openViewModal(savedId);
}
