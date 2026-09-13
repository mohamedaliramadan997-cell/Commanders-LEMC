import { supabase } from "./supabaseClient.js";
import {
  titleCase, normalizeEmail, normalizePhone, collapseSpaces,
  yearsToSinceYear, sinceYearToYears, ridingExperienceOptionsHtml, uploadPhotoToStorage,
} from "./utils.js";
import { adjustWidgetHtml, wireAdjustWidget } from "./photoAdjust.js";

const params = new URLSearchParams(window.location.search);
const token = params.get("token");

const loadingEl = document.getElementById("loading-state");
const invalidEl = document.getElementById("invalid-state");
const formEl = document.getElementById("update-form");

let member = null;
let getPhotoValues = () => ({ zoom: 1, x: 50, y: 50 });
let getBikePhotoValues = () => ({ zoom: 1, x: 50, y: 50 });
let newPhotoUrl = null, newBikePhotoUrl = null;

init();

async function init() {
  if (!token) return showInvalid();

  const { data, error } = await supabase.rpc("get_own_member_info", { p_token: token });
  if (error || !data || !data.length) return showInvalid();

  member = data[0];
  loadingEl.style.display = "none";
  formEl.style.display = "block";
  populateForm();
}

function showInvalid() {
  loadingEl.style.display = "none";
  invalidEl.style.display = "block";
}

function populateForm() {
  document.getElementById("member-name-heading").textContent = member.full_name;
  document.getElementById("member-rank-sub").textContent =
    member.membership_level + (member.officer_title ? " · " + member.officer_title : "");

  document.getElementById("photo-widget-container").innerHTML = adjustWidgetHtml({
    idPrefix: "photo", label: "Your Photo", imgUrl: member.photo_url, shape: "circle",
    values: { zoom: member.photo_zoom, x: member.photo_pos_x, y: member.photo_pos_y },
  });
  document.getElementById("bike-photo-widget-container").innerHTML = adjustWidgetHtml({
    idPrefix: "bike-photo", label: "Bike Photo", imgUrl: member.bike_photo_url, shape: "rect",
    values: { zoom: member.bike_photo_zoom, x: member.bike_photo_pos_x, y: member.bike_photo_pos_y },
  });
  getPhotoValues = wireAdjustWidget("photo", { isAvatar: true });
  getBikePhotoValues = wireAdjustWidget("bike-photo");

  wireReplaceUpload("photo", "member-photos", "circle", "Your Photo", true, (url) => { newPhotoUrl = url; });
  wireReplaceUpload("bike-photo", "bike-photos", "rect", "Bike Photo", false, (url) => { newBikePhotoUrl = url; });

  document.getElementById("riding_years").innerHTML = ridingExperienceOptionsHtml(sinceYearToYears(member.riding_since_year));

  const form = document.getElementById("update-form");
  ["mobile", "whatsapp", "email", "city", "neighborhood", "date_of_birth", "bike_model", "profession",
   "emergency_contact_name", "emergency_contact_relation", "emergency_contact_mobile"].forEach((key) => {
    const el = form.querySelector(`[name="${key}"]`);
    if (el && member[key] !== null && member[key] !== undefined) el.value = member[key];
  });

  form.querySelectorAll("input[data-type]").forEach((input) => {
    input.addEventListener("blur", () => normalizeField(input));
  });

  form.addEventListener("submit", onSubmit);
}

function normalizeField(input) {
  const type = input.dataset.type;
  if (type === "name") input.value = titleCase(input.value);
  else if (type === "email") input.value = normalizeEmail(input.value);
  else if (type === "phone") input.value = normalizePhone(input.value);
  else input.value = collapseSpaces(input.value);
}

function wireReplaceUpload(idPrefix, bucket, shape, label, isAvatar, onUploaded) {
  const container = document.getElementById(`${idPrefix}-widget-container`).parentElement;
  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <label style="margin-top:8px;">Replace photo</label>
    <input type="file" accept="image/*" id="${idPrefix}-upload" />
    <div id="${idPrefix}-upload-msg" style="font-size:12px; margin-top:4px;"></div>
  `;
  container.appendChild(wrap);

  document.getElementById(`${idPrefix}-upload`).addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const msgEl = document.getElementById(`${idPrefix}-upload-msg`);
    msgEl.textContent = "Uploading…";
    try {
      const url = await uploadPhotoToStorage(supabase, file, bucket);
      onUploaded(url);
      const widgetContainer = document.getElementById(`${idPrefix}-widget-container`);
      widgetContainer.innerHTML = adjustWidgetHtml({ idPrefix, label, imgUrl: url, shape, values: { zoom: 1, x: 50, y: 50 } });
      if (idPrefix === "photo") getPhotoValues = wireAdjustWidget(idPrefix, { isAvatar });
      else getBikePhotoValues = wireAdjustWidget(idPrefix, { isAvatar });
      msgEl.textContent = "Uploaded — adjust the framing above if needed.";
    } catch (err) {
      msgEl.textContent = err.message || "Upload failed.";
    }
  });
}

async function onSubmit(e) {
  e.preventDefault();
  const form = e.target;
  form.querySelectorAll("input[data-type]").forEach(normalizeField);

  const msg = document.getElementById("msg");
  const values = Object.fromEntries(new FormData(form).entries());
  const ridingYears = values.riding_years;
  delete values.riding_years;
  Object.keys(values).forEach((k) => { if (values[k] === "") values[k] = null; });

  const photoVals = getPhotoValues();
  const bikeVals = getBikePhotoValues();

  const payload = {
    p_token: token,
    p_city: values.city, p_neighborhood: values.neighborhood,
    p_mobile: values.mobile, p_whatsapp: values.whatsapp, p_email: values.email,
    p_date_of_birth: values.date_of_birth,
    p_bike_model: values.bike_model, p_profession: values.profession,
    p_riding_since_year: ridingYears ? yearsToSinceYear(ridingYears) : null,
    p_emergency_contact_name: values.emergency_contact_name,
    p_emergency_contact_relation: values.emergency_contact_relation,
    p_emergency_contact_mobile: values.emergency_contact_mobile,
    p_photo_url: newPhotoUrl, p_bike_photo_url: newBikePhotoUrl,
    p_photo_zoom: photoVals.zoom, p_photo_pos_x: photoVals.x, p_photo_pos_y: photoVals.y,
    p_bike_photo_zoom: bikeVals.zoom, p_bike_photo_pos_x: bikeVals.x, p_bike_photo_pos_y: bikeVals.y,
  };

  const { data, error } = await supabase.rpc("submit_member_update", payload);
  if (error || data !== true) {
    msg.innerHTML = `<div class="msg msg-error">${error ? error.message : "Something went wrong — please try again."}</div>`;
    return;
  }
  form.style.display = "none";
  msg.innerHTML = `<div class="msg msg-ok">Thanks! Your update has been submitted to the Secretary for review — it'll be reflected on your profile once approved.</div>`;
}
