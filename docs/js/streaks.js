// ============================================================
// Attendance/promotion math — the single source of truth used by
// Dashboard, Members, and Attendance pages. This is the logic that used
// to live as fragile spreadsheet formulas; here it's plain, testable JS.
// ============================================================

export const REQUIRED_STREAK = {
  "Hang-around": 4,
  "Prospect": 8,
};

/**
 * Given one member, the full rides list (sorted ascending by date), and
 * the full attendance list, compute:
 *  - currentStreak: consecutive attended rides counting back from most
 *    recent, skipping excused rides, resetting on any unexcused miss
 *  - currentMissStreak: same idea but for consecutive unexcused misses
 *  - attendancePct: attended / (eligible - excused), or null if no rides yet
 *  - promotionStatus: 'ready' | 'soon' | 'in_progress' | null (Full-Batch/Honor)
 *  - attendanceWarning: true if 3+ consecutive unexcused misses (not applicable
 *    to Honor Members)
 */
export function computeMemberStats(member, rides, attendance) {
  // Only rides on/after the member joined count toward their record.
  const relevantRides = rides
    .filter((r) => !member.date_joined || r.ride_date >= member.date_joined)
    .sort((a, b) => (a.ride_date < b.ride_date ? -1 : 1));

  const attByRide = {};
  attendance
    .filter((a) => a.member_id === member.id)
    .forEach((a) => { attByRide[a.ride_id] = a.status; });

  let attendStreak = 0;
  let missStreak = 0;
  let attendedCount = 0;
  let excusedCount = 0;
  let eligibleCount = 0;

  relevantRides.forEach((ride) => {
    const status = attByRide[ride.id]; // 'attended' | 'missed' | 'excused' | undefined
    if (status === "attended") {
      attendStreak += 1;
      missStreak = 0;
      attendedCount += 1;
      eligibleCount += 1;
    } else if (status === "missed") {
      attendStreak = 0;
      missStreak += 1;
      eligibleCount += 1;
    } else if (status === "excused") {
      // Excused: doesn't break either streak, doesn't count in the % denominator.
      excusedCount += 1;
    }
    // undefined = not yet marked / ride hasn't happened yet — skip entirely.
  });

  const attendancePct = eligibleCount > 0 ? attendedCount / eligibleCount : null;

  let promotionStatus = null;
  const required = REQUIRED_STREAK[member.membership_level];
  if (required) {
    if (attendStreak >= required) promotionStatus = "ready";
    else if (required - attendStreak <= 2) promotionStatus = "soon";
    else promotionStatus = "in_progress";
  }

  const attendanceWarning = member.membership_level !== "Honor Member" && missStreak >= 3;

  return {
    currentStreak: attendStreak,
    currentMissStreak: missStreak,
    attendancePct,
    attendedCount,
    eligibleCount,
    excusedCount,
    promotionStatus,
    attendanceWarning,
  };
}

export function promotionLabel(status, streak, required) {
  if (status === "ready") return `READY — Approve promotion`;
  if (status === "soon") return `${required - streak} ride(s) away — review soon`;
  if (status === "in_progress") return `In progress (${streak}/${required})`;
  return "—";
}
