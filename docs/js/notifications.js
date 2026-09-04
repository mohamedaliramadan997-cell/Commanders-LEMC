import { supabase } from "./supabaseClient.js";
import { computeMemberStats } from "./streaks.js";

/** Tomorrow's date, as both a month/day pair (for matching recurring
 * birthdays) and an ISO date string (for the acknowledgment record). */
function tomorrow() {
  const t = new Date();
  t.setDate(t.getDate() + 1);
  return { month: t.getMonth() + 1, day: t.getDate(), iso: t.toISOString().slice(0, 10) };
}

/**
 * Members whose birthday is tomorrow, minus any already acknowledged
 * for that specific date (so it stops nagging once you've seen it,
 * but will show again next year).
 */
export async function getBirthdayNotifications() {
  const { data: members } = await supabase.from("members").select("id, full_name, date_of_birth, membership_level");
  const { month, day, iso } = tomorrow();

  const candidates = (members || []).filter((m) => {
    if (!m.date_of_birth) return false;
    const d = new Date(m.date_of_birth + "T00:00:00");
    return d.getMonth() + 1 === month && d.getDate() === day;
  });
  if (!candidates.length) return [];

  const { data: acks } = await supabase
    .from("notification_acks")
    .select("member_id")
    .eq("kind", "birthday")
    .eq("notif_date", iso);
  const ackedIds = new Set((acks || []).map((a) => a.member_id));

  return candidates
    .filter((m) => !ackedIds.has(m.id))
    .map((m) => ({ member: m, notifDate: iso }));
}

export async function acknowledgeBirthday(memberId, notifDate, adminUserId) {
  await supabase.from("notification_acks").insert({
    member_id: memberId, kind: "birthday", notif_date: notifDate, acknowledged_by: adminUserId,
  });
}

/** Total count of everything needing Admin attention right now:
 * unreviewed intake submissions + promotion-ready members + unacknowledged
 * birthday reminders. */
export async function getPendingActionCount() {
  const [{ count: subCount }, birthdays, { data: members }, { data: rides }, { data: attendance }] = await Promise.all([
    supabase.from("intake_submissions").select("id", { count: "exact", head: true }).eq("reviewed", false),
    getBirthdayNotifications(),
    supabase.from("members").select("*"),
    supabase.from("rides").select("*"),
    supabase.from("attendance").select("*"),
  ]);

  const readyCount = (members || []).filter(
    (m) => computeMemberStats(m, rides || [], attendance || []).promotionStatus === "ready"
  ).length;

  return (subCount || 0) + readyCount + birthdays.length;
}

/** Renders/updates the red circle badge on the "Admin — Review & Approve"
 * sidebar link. Safe to call on any page — does nothing if that link,
 * or the badge count, isn't relevant. */
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
