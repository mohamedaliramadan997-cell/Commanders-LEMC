import { supabase } from "./supabaseClient.js";
import {
  titleCase, normalizeEmail, normalizePhone, collapseSpaces,
  yearsToSinceYear, ridingExperienceOptionsHtml, uploadPhotoToStorage,
} from "./utils.js";

const MAX_PHOTO_MB = 8;

const form = document.getElementById("intake-form");
const msg = document.getElementById("msg");

// ---------- Populate the 0–70 years dropdown ----------
document.getElementById("riding_years").innerHTML = ridingExperienceOptionsHtml(null);

// ---------- Auto-correct text fields on blur (capitalization + spacing) ----------
form.querySelectorAll("input[data-type]").forEach((input) => {
  input.addEventListener("blur", () => {
    const type = input.dataset.type;
    if (type === "name") input.value = titleCase(input.value);
    else if (type === "email") input.value = normalizeEmail(input.value);
    else if (type === "phone") input.value = normalizePhone(input.value);
    else input.value = collapseSpaces(input.value);
  });
});

// ---------- Photo previews ----------
wirePreview("photo_file", "photo_preview");
wirePreview("bike_photo_file", "bike_photo_preview");

function wirePreview(inputId, previewId) {
  const input = document.getElementById(inputId);
  const preview = document.getElementById(previewId);
  input.addEventListener("change", () => {
    const file = input.files[0];
    if (!file) { preview.style.display = "none"; return; }
    preview.src = URL.createObjectURL(file);
    preview.style.display = "block";
  });
}

// ---------- Submit ----------
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  msg.innerHTML = "";

  // Re-run auto-correction on every text field right before validating,
  // in case someone submits without tabbing out of the last field.
  form.querySelectorAll("input[data-type]").forEach((input) => {
    const type = input.dataset.type;
    if (type === "name") input.value = titleCase(input.value);
    else if (type === "email") input.value = normalizeEmail(input.value);
    else if (type === "phone") input.value = normalizePhone(input.value);
    else input.value = collapseSpaces(input.value);
  });

  const photoFile = document.getElementById("photo_file").files[0];
  const bikePhotoFile = document.getElementById("bike_photo_file").files[0];

  // Native HTML5 required-field check first (covers text/select/date/file).
  if (!form.reportValidity()) return;

  if (!photoFile || !bikePhotoFile) {
    msg.innerHTML = `<div class="msg msg-error">Both photos are required.</div>`;
    return;
  }
  for (const f of [photoFile, bikePhotoFile]) {
    if (f.size > MAX_PHOTO_MB * 1024 * 1024) {
      msg.innerHTML = `<div class="msg msg-error">Each photo must be under ${MAX_PHOTO_MB}MB. "${f.name}" is too large.</div>`;
      return;
    }
  }

  const submitBtn = document.getElementById("submit-btn");
  submitBtn.disabled = true;
  submitBtn.textContent = "Submitting…";

  try {
    const [photoUrl, bikePhotoUrl] = await Promise.all([
      uploadPhotoToStorage(supabase, photoFile, "member-photos"),
      uploadPhotoToStorage(supabase, bikePhotoFile, "bike-photos"),
    ]);

    const values = Object.fromEntries(new FormData(form).entries());
    const ridingYears = values.riding_years;
    delete values.riding_years;

    const payload = {
      ...values,
      riding_since_year: yearsToSinceYear(ridingYears),
      photo_url: photoUrl,
      bike_photo_url: bikePhotoUrl,
    };

    const { error } = await supabase.from("intake_submissions").insert(payload);
    if (error) throw error;

    form.style.display = "none";
    msg.innerHTML = `
      <div class="submitted-confirmation">
        <div class="confirmation-badge">✓</div>
        <h2>Application Received</h2>
        <p>Thank you for stepping forward. Your application to join <strong>Commanders LEMC — UAE Chapter</strong>
        has been submitted for review.</p>
        <p>A member of the Secretary's office will be in touch if anything further is needed, and to
        confirm your standing as a Hang-around.</p>
        <div class="confirmation-brandline">GOLD BLACK NATION · RESPECT ALL... FEAR NONE</div>
      </div>
    `;
  } catch (err) {
    msg.innerHTML = `<div class="msg msg-error">${err.message || "Something went wrong. Please try again."}</div>`;
    submitBtn.disabled = false;
    submitBtn.textContent = "Submit";
  }
});

async function uploadPhoto(file, bucket) {
  return uploadPhotoToStorage(supabase, file, bucket);
}
