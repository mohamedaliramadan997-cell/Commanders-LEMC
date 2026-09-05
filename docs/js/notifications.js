import { supabase } from "./supabaseClient.js";
import { computeMemberStats } from "./streaks.js";

/** Days from today until this person's NEXT birthday (this year if it
 * hasn't happened yet, otherwise next year), plus that actual date. */
function nextBirthdayInfo(dobIso) {
  const dob = new Date(dobIso + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let next = new Date(today.getFullYear(), dob.getMonth(), dob.getDate());
  if (next < today) next = new Date(today.getFullYear() + 1, dob.getMonth(), dob.getDate());

  const daysUntil = Math.round((next - today) / 86400000);
  return { nextDate: next, daysUntil };
}

/**
 * Always returns up to `limit` members, nearest-birthday-first. As soon
 * as a birthday passes, it naturally rolls out of this list (its "next"
 * date recalculates to next year) and the next-nearest member rolls in
 * — no manual dismissal needed.
 */
export async function getUpcomingBirthdays(limit = 3) {
  const { data: members } = await supabase
    .from("members")
    .select("id, full_name, date_of_birth")
    .not("date_of_birth", "is", null);

  const withDates = (members || []).map((m) => {
    const { nextDate, daysUntil } = nextBirthdayInfo(m.date_of_birth);
    return { member: m, nextDate, daysUntil };
  });

  withDates.sort((a, b) => a.daysUntil - b.daysUntil);
  return withDates.slice(0, limit);
}

export function birthdayCountdownLabel(daysUntil) {
  if (daysUntil === 0) return "Today!";
  if (daysUntil === 1) return "Tomorrow";
  return `In ${daysUntil} days`;
}

/** Total count of everything needing Admin action right now: unreviewed
 * intake submissions + promotion-ready members. (Upcoming birthdays are
 * informational, always-on display — not an action queue item, so they
 * don't add to this badge.) */
export async function getPendingActionCount() {
  const [{ count: subCount }, { data: members }, { data: rides }, { data: attendance }] = await Promise.all([
    supabase.from("intake_submissions").select("id", { count: "exact", head: true }).eq("reviewed", false),
    supabase.from("members").select("*"),
    supabase.from("rides").select("*"),
    supabase.from("attendance").select("*"),
  ]);

  const readyCount = (members || []).filter(
    (m) => computeMemberStats(m, rides || [], attendance || []).promotionStatus === "ready"
  ).length;

  return (subCount || 0) + readyCount;
}

/** Renders/updates the red circle badge on the "Admin — Review & Approve"
 * sidebar link. Safe to call on any page. */
export async function refreshNavBadge() {
  const link = document.querySelector('a[href="admin.html"]');
  if (!link) return;

  let count = 0;
  try {
    count = await getPendingActionCount();
  } catch (err) {
    console.error("Could not compute pending-action count", err);
    return;
  }

  let badge = link.querySelector(".nav-badge");
  if (count > 0) {
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "nav-badge";
      link.appendChild(badge);
    }
    badge.textContent = count > 99 ? "99+" : String(count);
  } else if (badge) {
    badge.remove();
  }
}
