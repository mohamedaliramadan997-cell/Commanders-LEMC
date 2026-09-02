import { supabase } from "./supabaseClient.js";
import { requireAuth, applyRoleVisibility, escapeHtml } from "./auth.js";
import { computeMemberStats, REQUIRED_STREAK } from "./streaks.js";

let session;

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
  await Promise.all([loadSubmissions(), loadPromotions(), loadProfiles()]);
}

async function loadSubmissions() {
  const { data, error } = await supabase
    .from("intake_submissions")
    .select("*")
    .eq("reviewed", false)
    .order("submitted_at", { ascending: false });

  const el = document.getElementById("submissions-list");
  if (error) { el.innerHTML = `<div class="msg msg-error">${error.message}</div>`; return; }
  if (!data.length) { el.innerHTML = `<p style="color:#5a5748;">No new submissions.</p>`; return; }

  el.innerHTML = data.map((s) => `
    <div style="display:flex; gap:14px; border:1px solid var(--line); border-radius:6px; padding:12px 14px; margin-bottom:10px;">
      ${s.photo_url ? `<img src="${s.photo_url}" alt="" style="width:56px;height:56px;border-radius:50%;object-fit:cover;flex-shrink:0;" />` : ""}
      <div style="flex:1;">
        <strong>${escapeHtml(s.full_name)}</strong> — ${escapeHtml(s.mobile || "")} · ${escapeHtml(s.city || "")}
        <div style="font-size:12.5px; color:#5a5748; margin:4px 0 10px;">
          ${escapeHtml(s.email || "")} ${s.bike_model ? " · " + escapeHtml(s.bike_model) : ""}
          ${s.riding_since_year ? " · riding since " + s.riding_since_year : ""}
          ${s.bike_photo_url ? ` · <a href="${s.bike_photo_url}" target="_blank">bike photo ↗</a>` : ""}
        </div>
        <button class="gold" data-approve="${s.id}">Add to Master Record as Hang-around</button>
        <button class="ghost" data-dismiss="${s.id}">Dismiss</button>
      </div>
    </div>
  `).join("");

  el.querySelectorAll("[data-approve]").forEach((btn) =>
    btn.addEventListener("click", () => approveSubmission(btn.dataset.approve, data)));
  el.querySelectorAll("[data-dismiss]").forEach((btn) =>
    btn.addEventListener("click", () => dismissSubmission(btn.dataset.dismiss)));
}

async function approveSubmission(id, submissions) {
  const s = submissions.find((x) => x.id === id);
  const { error: insertErr } = await supabase.from("members").insert({
    full_name: s.full_name,
    membership_level: "Hang-around",
    chapter_id: s.chapter_id,
    city: s.city,
    neighborhood: s.neighborhood,
    mobile: s.mobile,
    whatsapp: s.whatsapp,
    email: s.email,
    date_of_birth: s.date_of_birth,
    bike_model: s.bike_model,
    profession: s.profession,
    riding_since_year: s.riding_since_year,
    emergency_contact_name: s.emergency_contact_name,
    emergency_contact_relation: s.emergency_contact_relation,
    emergency_contact_mobile: s.emergency_contact_mobile,
    photo_url: s.photo_url,
    bike_photo_url: s.bike_photo_url,
    date_joined: new Date().toISOString().slice(0, 10),
  });
  if (insertErr) { alert(insertErr.message); return; }
  await supabase.from("intake_submissions").update({ reviewed: true }).eq("id", id);
  await loadSubmissions();
}

async function dismissSubmission(id) {
  await supabase.from("intake_submissions").update({ reviewed: true }).eq("id", id);
  await loadSubmissions();
}

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
    <div style="display:flex; justify-content:space-between; align-items:center; border:1px solid var(--line); border-radius:6px; padding:12px 14px; margin-bottom:10px;">
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
}

async function loadProfiles() {
  const { data, error } = await supabase.from("profiles").select("*").order("full_name");
  const el = document.getElementById("profiles-list");
  if (error) { el.innerHTML = `<div class="msg msg-error">${error.message}</div>`; return; }

  el.innerHTML = `<table><thead><tr><th>Name</th><th>Role</th><th></th></tr></thead><tbody>` +
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
    `</tbody></table>`;

  el.querySelectorAll("[data-toggle-role]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const newRole = btn.dataset.current === "admin" ? "officer" : "admin";
      if (!confirm(`Change this person's role to ${newRole}?`)) return;
      const { error } = await supabase.from("profiles").update({ role: newRole }).eq("id", btn.dataset.toggleRole);
      if (error) { alert(error.message); return; }
      await loadProfiles();
    }));
}
