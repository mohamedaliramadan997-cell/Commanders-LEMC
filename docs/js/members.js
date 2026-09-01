import { supabase } from "./supabaseClient.js";
import { requireAuth, applyRoleVisibility, escapeHtml } from "./auth.js";

const FIELDS = [
  ["full_name", "Full Name", "text", "full"],
  ["membership_level", "Membership Level", "select:Hang-around,Prospect,Full-Batch,Honor Member", ""],
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
  ["bike_model", "Bike Model", "text", ""],
  ["profession", "Profession / Occupation", "text", ""],
  ["riding_experience", "Riding Experience", "text", ""],
  ["emergency_contact_name", "Emergency Contact — Name", "text", ""],
  ["emergency_contact_relation", "Emergency Contact — Relation", "text", ""],
  ["emergency_contact_mobile", "Emergency Contact — Mobile", "text", ""],
  ["photo_url", "Photo URL (upload elsewhere, paste link)", "text", "full"],
  ["bike_photo_url", "Bike Photo URL", "text", "full"],
  ["notes", "Notes", "text", "full"],
];

let session, allMembers = [], editingId = null;

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
  document.getElementById("add-btn").addEventListener("click", () => openEdit(null));
  document.getElementById("cancel-btn").addEventListener("click", closeEdit);
  document.getElementById("save-btn").addEventListener("click", save);

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
    <tr data-id="${m.id}" style="cursor:${session.profile.role === "admin" ? "pointer" : "default"}">
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

  if (session.profile.role === "admin") {
    body.querySelectorAll("tr").forEach((tr) => {
      tr.addEventListener("click", () => openEdit(tr.dataset.id));
    });
  }
}

function openEdit(id) {
  editingId = id;
  const member = id ? allMembers.find((m) => m.id === id) : {};
  const formEl = document.getElementById("edit-form");
  formEl.innerHTML = FIELDS.map(([key, label, type, span]) => {
    const val = member[key] ?? "";
    let input;
    if (type.startsWith("select:")) {
      const opts = type.split(":")[1].split(",");
      input = `<select data-key="${key}">` +
        opts.map((o) => `<option ${o === val ? "selected" : ""}>${o}</option>`).join("") +
        `</select>`;
    } else {
      input = `<input data-key="${key}" type="${type}" value="${escapeHtml(val)}" />`;
    }
    return `<div class="${span === "full" ? "full" : ""}"><label>${label}</label>${input}</div>`;
  }).join("");
  document.getElementById("edit-msg").innerHTML = "";
  document.getElementById("edit-panel").style.display = "block";
  document.getElementById("edit-panel").scrollIntoView({ behavior: "smooth" });
}

function closeEdit() {
  editingId = null;
  document.getElementById("edit-panel").style.display = "none";
}

async function save() {
  const inputs = document.querySelectorAll("#edit-form [data-key]");
  const payload = {};
  inputs.forEach((el) => {
    let v = el.value.trim();
    payload[el.dataset.key] = v === "" ? null : v;
  });
  if (!payload.full_name) {
    document.getElementById("edit-msg").innerHTML = `<div class="msg msg-error">Full name is required.</div>`;
    return;
  }

  const query = editingId
    ? supabase.from("members").update(payload).eq("id", editingId)
    : supabase.from("members").insert(payload);

  const { error } = await query;
  if (error) {
    document.getElementById("edit-msg").innerHTML = `<div class="msg msg-error">${error.message}</div>`;
    return;
  }
  document.getElementById("edit-msg").innerHTML = `<div class="msg msg-ok">Saved.</div>`;
  await load();
  setTimeout(closeEdit, 500);
}
