/**
 * Minimal shared modal system. No HTML changes needed to any page —
 * this creates and removes the overlay directly on document.body.
 */
export function openModal(innerHtml, { onClose } = {}) {
  closeModal(); // only one at a time
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.id = "shared-modal-overlay";
  overlay.innerHTML = `
    <div class="modal-card">
      <button class="modal-close" aria-label="Close">×</button>
      ${innerHtml}
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector(".modal-close").addEventListener("click", () => closeModal(onClose));
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeModal(onClose);
  });
  document.addEventListener("keydown", escHandler);

  function escHandler(e) {
    if (e.key === "Escape") closeModal(onClose);
  }

  return overlay;
}

export function setModalContent(innerHtml) {
  const overlay = document.getElementById("shared-modal-overlay");
  if (!overlay) return;
  overlay.querySelector(".modal-card").innerHTML = `
    <button class="modal-close" aria-label="Close">×</button>
    ${innerHtml}
  `;
  overlay.querySelector(".modal-close").addEventListener("click", () => closeModal());
}

export function closeModal(onClose) {
  const overlay = document.getElementById("shared-modal-overlay");
  if (overlay) overlay.remove();
  if (onClose) onClose();
}
