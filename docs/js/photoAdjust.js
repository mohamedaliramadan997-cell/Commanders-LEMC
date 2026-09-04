// ============================================================
// Reusable "adjust this photo" widget: zoom + pan, controllable by
// sliders OR by finger/mouse drag directly on the photo (drag to pan,
// pinch with two fingers — or mouse wheel — to zoom). Values are just
// numbers stored alongside the photo URL (photo_zoom, photo_pos_x,
// photo_pos_y) — the original image file never changes.
//
// Bike/other rectangular photos default to showing the WHOLE image
// uncropped (object-fit: contain) until the person deliberately zooms
// in past 1x, at which point it behaves like a normal crop-to-fill so
// they can frame in on a detail if they want to. Avatars (personal
// photo circles) always fill their frame, since a partially-empty
// circle looks broken.
// ============================================================

export function photoStyle({ zoom = 1, x = 50, y = 50, isAvatar = false } = {}) {
  const z = Number(zoom) || 1;
  if (!isAvatar && z <= 1) {
    return `object-fit:contain; object-position:${x}% ${y}%; transform:scale(1); transform-origin:center; background:#e9e6da;`;
  }
  return `object-fit:cover; object-position:${x}% ${y}%; transform:scale(${z}); transform-origin:center;`;
}

/**
 * Renders a frame (circle or rect) with the photo plus zoom/X/Y sliders
 * underneath. `idPrefix` must be unique per widget instance on the page
 * (e.g. "edit-photo", "edit-bike-photo", "sub-photo-abc123").
 */
export function adjustWidgetHtml({ idPrefix, label, imgUrl, shape = "rect", values = {} }) {
  const v = { zoom: values.zoom ?? 1, x: values.x ?? 50, y: values.y ?? 50 };
  const isAvatar = shape === "circle";
  const frameStyle = isAvatar
    ? "width:130px; height:130px; border-radius:50%;"
    : "width:100%; height:min(60vh, 380px); border-radius:6px;";

  if (!imgUrl) {
    return `<div><label>${label}</label><div class="no-photo">No photo</div></div>`;
  }

  return `
    <div class="photo-adjust" data-prefix="${idPrefix}">
      <label>${label} <span style="font-weight:400; color:#8a8672;">— drag to reposition, pinch or scroll to zoom</span></label>
      <div class="photo-adjust-frame" id="${idPrefix}-frame" style="${frameStyle} overflow:hidden; border:1px solid var(--line); margin-bottom:8px; position:relative; touch-action:none; cursor:grab;">
        <img id="${idPrefix}-img" src="${imgUrl}" draggable="false" style="width:100%; height:100%; ${photoStyle({ ...v, isAvatar })}" />
      </div>
      <div class="photo-adjust-sliders">
        <label style="margin:4px 0 2px;">Zoom</label>
        <input type="range" id="${idPrefix}-zoom" min="1" max="3" step="0.05" value="${v.zoom}" />
        <label style="margin:4px 0 2px;">Horizontal position</label>
        <input type="range" id="${idPrefix}-x" min="0" max="100" step="1" value="${v.x}" />
        <label style="margin:4px 0 2px;">Vertical position</label>
        <input type="range" id="${idPrefix}-y" min="0" max="100" step="1" value="${v.y}" />
      </div>
    </div>
  `;
}

/**
 * Wires up the sliders AND touch/mouse drag+pinch rendered by
 * adjustWidgetHtml for live preview. Call this once after inserting the
 * HTML into the DOM. Returns a getValues() function to read the current
 * zoom/x/y when saving.
 */
export function wireAdjustWidget(idPrefix, { isAvatar = false } = {}) {
  const frame = document.getElementById(`${idPrefix}-frame`);
  const img = document.getElementById(`${idPrefix}-img`);
  const zoomEl = document.getElementById(`${idPrefix}-zoom`);
  const xEl = document.getElementById(`${idPrefix}-x`);
  const yEl = document.getElementById(`${idPrefix}-y`);
  if (!frame || !img || !zoomEl || !xEl || !yEl) {
    return () => ({ zoom: 1, x: 50, y: 50 }); // no photo was rendered for this slot
  }

  const state = { zoom: Number(zoomEl.value), x: Number(xEl.value), y: Number(yEl.value) };

  function render() {
    img.style.cssText = `width:100%; height:100%; ${photoStyle({ ...state, isAvatar })}`;
    zoomEl.value = state.zoom;
    xEl.value = state.x;
    yEl.value = state.y;
  }

  function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

  // ---------- Sliders (always available, most precise) ----------
  zoomEl.addEventListener("input", () => { state.zoom = Number(zoomEl.value); render(); });
  xEl.addEventListener("input", () => { state.x = Number(xEl.value); render(); });
  yEl.addEventListener("input", () => { state.y = Number(yEl.value); render(); });

  // ---------- Drag-to-pan / pinch-to-zoom ----------
  const pointers = new Map(); // pointerId -> {x, y}
  let dragBaseline = null;   // {startClientX, startClientY, startX, startY}
  let pinchBaseline = null;  // {startDist, startZoom}

  function distanceBetween(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  frame.addEventListener("pointerdown", (e) => {
    frame.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    frame.style.cursor = "grabbing";

    if (pointers.size === 1) {
      dragBaseline = { startClientX: e.clientX, startClientY: e.clientY, startX: state.x, startY: state.y };
      pinchBaseline = null;
    } else if (pointers.size === 2) {
      const [p1, p2] = [...pointers.values()];
      pinchBaseline = { startDist: distanceBetween(p1, p2), startZoom: state.zoom };
      dragBaseline = null;
    }
  });

  frame.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size === 2 && pinchBaseline) {
      const [p1, p2] = [...pointers.values()];
      const newDist = distanceBetween(p1, p2);
      const ratio = newDist / (pinchBaseline.startDist || 1);
      state.zoom = clamp(pinchBaseline.startZoom * ratio, 1, 3);
      render();
    } else if (pointers.size === 1 && dragBaseline) {
      const rect = frame.getBoundingClientRect();
      const dxPct = ((e.clientX - dragBaseline.startClientX) / rect.width) * 100;
      const dyPct = ((e.clientY - dragBaseline.startClientY) / rect.height) * 100;
      state.x = clamp(dragBaseline.startX - dxPct, 0, 100);
      state.y = clamp(dragBaseline.startY - dyPct, 0, 100);
      render();
    }
  });

  function endPointer(e) {
    pointers.delete(e.pointerId);
    frame.style.cursor = "grab";
    if (pointers.size === 1) {
      const [p] = [...pointers.values()];
      dragBaseline = { startClientX: p.x, startClientY: p.y, startX: state.x, startY: state.y };
      pinchBaseline = null;
    } else {
      dragBaseline = null;
      pinchBaseline = null;
    }
  }
  frame.addEventListener("pointerup", endPointer);
  frame.addEventListener("pointercancel", endPointer);
  frame.addEventListener("pointerleave", (e) => { if (pointers.has(e.pointerId)) endPointer(e); });

  // ---------- Mouse wheel / trackpad zoom (desktop) ----------
  frame.addEventListener("wheel", (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.08 : 0.08;
    state.zoom = clamp(state.zoom + delta, 1, 3);
    render();
  }, { passive: false });

  render();
  return () => ({ zoom: Math.round(state.zoom * 100) / 100, x: Math.round(state.x), y: Math.round(state.y) });
}
