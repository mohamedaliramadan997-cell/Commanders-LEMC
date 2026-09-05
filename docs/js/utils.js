// ============================================================
// Shared helpers: text auto-correction and the "riding experience that
// updates itself every year" logic.
// ============================================================

/** Trims leading/trailing whitespace and collapses internal double+ spaces to one. */
export function collapseSpaces(str) {
  if (str === null || str === undefined) return "";
  return String(str).replace(/\s+/g, " ").trim();
}

/**
 * Title-cases a name/place/etc, while preserving short all-caps acronyms
 * like "BMW", "KTM", "GS" so bike brands and initials don't get mangled
 * into "Bmw" / "Ktm".
 */
export function titleCase(str) {
  const cleaned = collapseSpaces(str);
  if (!cleaned) return "";
  return cleaned
    .split(" ")
    .map((word) => {
      if (word.length <= 4 && word === word.toUpperCase() && /[A-Z]/.test(word)) {
        return word; // preserve acronyms: BMW, KTM, GS, R1, etc.
      }
      // preserve internal capitals after a hyphen/apostrophe, e.g. "Al-Ameri"
      return word
        .split(/(-|')/)
        .map((part) => (part === "-" || part === "'" ? part : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()))
        .join("");
    })
    .join(" ");
}

/** Lowercases + trims/collapses an email address. */
export function normalizeEmail(str) {
  return collapseSpaces(str).toLowerCase();
}

/** Trims/collapses spacing in a phone number without altering the digits/symbols. */
export function normalizePhone(str) {
  return collapseSpaces(str);
}

// ---------- Riding experience: stored as a start-year, always computed live ----------

export function currentYear() {
  return new Date().getFullYear();
}

/** Convert a "years of experience" dropdown value into the year they started riding. */
export function yearsToSinceYear(years) {
  return currentYear() - Number(years);
}

/** Convert a stored "riding_since_year" back into a live years-of-experience number. */
export function sinceYearToYears(sinceYear) {
  if (sinceYear === null || sinceYear === undefined || sinceYear === "") return null;
  return Math.max(0, currentYear() - Number(sinceYear));
}

/** Builds <option> HTML for a 0–70 years-of-experience dropdown. */
export function ridingExperienceOptionsHtml(selectedYears) {
  let html = `<option value="" disabled ${selectedYears === null || selectedYears === undefined ? "selected" : ""}>Select years of experience…</option>`;
  for (let y = 0; y <= 70; y++) {
    const sel = Number(selectedYears) === y ? "selected" : "";
    html += `<option value="${y}" ${sel}>${y} ${y === 1 ? "year" : "years"}</option>`;
  }
  return html;
}

/**
 * Auto-corrects an entire form's worth of values in one go. Pass an object
 * of {fieldName: rawValue} and a map of {fieldName: 'name'|'email'|'phone'|'plain'}
 * describing how each should be normalized.
 */
export function autoCorrectFields(values, fieldTypes) {
  const out = {};
  Object.entries(values).forEach(([key, val]) => {
    const type = fieldTypes[key] || "plain";
    if (type === "name") out[key] = titleCase(val);
    else if (type === "email") out[key] = normalizeEmail(val);
    else if (type === "phone") out[key] = normalizePhone(val);
    else out[key] = collapseSpaces(val);
  });
  return out;
}

// ---------- Shared photo upload (used by Intake form and Master Record edit) ----------

/** Uploads a photo file to a Supabase Storage bucket ('member-photos' or
 * 'bike-photos') and returns its public URL. Throws on failure. */
export async function uploadPhotoToStorage(supabase, file, bucket) {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type,
  });
  if (error) throw error;
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}
