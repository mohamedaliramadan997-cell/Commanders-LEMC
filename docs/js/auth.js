import { supabase } from "./supabaseClient.js";

/**
 * Call this at the top of every protected page. Redirects to login.html
 * if nobody's signed in, and returns { user, profile } (profile.role is
 * 'admin' or 'officer') so the page can tailor what it shows.
 */
export async function requireAuth() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    window.location.href = "login.html";
    return null;
  }
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", session.user.id)
    .single();

  if (error || !profile) {
    console.error("Could not load profile", error);
    window.location.href = "login.html";
    return null;
  }

  renderWho(profile);
  wireLogout();
  return { user: session.user, profile };
}

function renderWho(profile) {
  const el = document.getElementById("who-box");
  if (!el) return;
  el.innerHTML = `
    <div><strong>${escapeHtml(profile.full_name)}</strong></div>
    <div>${profile.role === "admin" ? "Admin (full access)" : "Officer (read-only)"}</div>
    <button id="logout-btn" class="ghost">Log out</button>
  `;
}

function wireLogout() {
  document.addEventListener("click", async (e) => {
    if (e.target && e.target.id === "logout-btn") {
      await supabase.auth.signOut();
      window.location.href = "login.html";
    }
  });
}

export function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Hides/disables any element with [data-admin-only] if the user is not admin. */
export function applyRoleVisibility(role) {
  document.querySelectorAll("[data-admin-only]").forEach((el) => {
    if (role !== "admin") {
      if (el.tagName === "BUTTON" || el.tagName === "INPUT" || el.tagName === "SELECT") {
        el.disabled = true;
        el.title = "Admin only";
      } else {
        el.style.display = "none";
      }
    }
  });
}
