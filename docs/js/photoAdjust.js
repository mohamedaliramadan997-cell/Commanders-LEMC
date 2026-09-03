// ============================================================
// Reusable "adjust this photo" widget: zoom + pan sliders over an
// already-uploaded photo, so a badly-framed photo can be fixed without
// re-uploading. Values are just numbers stored alongside the photo URL
// (photo_zoom, photo_pos_x, photo_pos_y) — the original image file
// never changes.
// ============================================================

export function photoStyle({ zoom = 1, x = 50, y = 50 } = {}) {
  return `object-fit:cover; object-position:${x}% ${y}%; transform: scale(${zoom}); transform-origin: center;`;
}

/**
 * Renders a frame (circle or rect) with the photo plus zoom/X/Y sliders
 * underneath. `idPrefix` must be unique per widget instance on the page
 * (e.g. "edit-photo", "edit-bike-photo", "sub-photo-abc123").
 */
export function adjustWidgetHtml({ idPrefix, label, imgUrl, shape = "rect", values = {} }) {
  const v = { zoom: values.zoom ?? 1, x: values.x ?? 50, y: values.y ?? 50 };
  const frameStyle = shape === "circle"
    ? "width:110px; height:110px; border-radius:50%;"
    : "width:100%; height:160px; border-radius:6px;";

  if (!imgUrl) {
    return `<div><label>${label}</label><div class="no-photo">No photo</div></div>`;
  }

  return `
    <div class="photo-adjust" data-prefix="${idPrefix}">
      <label>${label}</label>
      <div class="photo-adjust-frame" style="${frameStyle} overflow:hidden; border:1px solid var(--line); margin-bottom:8px;">
        <img id="${idPrefix}-img" src="${imgUrl}" style="width:100%; height:100%; ${photoStyle(v)}" />
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
 * Wires up the sliders rendered by adjustWidgetHtml for live preview.
 * Call this once after inserting the HTML into the DOM. Returns a
 * getValues() function to read the current zoom/x/y when saving.
 */
export function wireAdjustWidget(idPrefix) {
  const img = document.getElementById(`${idPrefix}-img`);
  const zoomEl = document.getElementById(`${idPrefix}-zoom`);
  const xEl = document.getElementById(`${idPrefix}-x`);
  const yEl = document.getElementById(`${idPrefix}-y`);
  if (!img || !zoomEl || !xEl || !yEl) {
    return () => ({ zoom: 1, x: 50, y: 50 }); // no photo was rendered for this slot
  }

  function update() {
    img.style.cssText = `width:100%; height:100%; ${photoStyle({
      zoom: Number(zoomEl.value), x: Number(xEl.value), y: Number(yEl.value),
    })}`;
  }
  [zoomEl, xEl, yEl].forEach((el) => el.addEventListener("input", update));

  return () => ({ zoom: Number(zoomEl.value), x: Number(xEl.value), y: Number(yEl.value) });
}
