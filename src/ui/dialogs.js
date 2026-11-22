// dialogs.js — themed replacements for window.alert / window.confirm (same look as the app's modals).
// All text is inserted with textContent: no HTML injection.

let openCount = 0;
export const isDialogOpen = () => openCount > 0;

/**
 * @param {{title?: string, message: string, kind?: "info"|"error", buttons: {label: string, value: any, kind?: "primary"|"positive"|"danger"|"secondary"}[], cancelValue?: any}} opts
 * @returns {Promise<any>} the value of the pressed button (cancelValue on Esc / outside click)
 */
export function showDialog({ title, message, kind = "info", buttons, cancelValue = null }) {
  return new Promise((resolve) => {
    openCount++;
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay app-dialog";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");

    const card = document.createElement("div");
    card.className = "modal-card d-glass dialog-card" + (kind === "error" ? " dialog-error" : "");

    if (title) {
      const header = document.createElement("div");
      header.className = "modal-header";
      header.textContent = title;
      card.appendChild(header);
    }

    const body = document.createElement("div");
    body.className = "modal-body dialog-message";
    body.textContent = message;
    card.appendChild(body);

    const footer = document.createElement("div");
    footer.className = "modal-footer";
    let primaryBtn = null;
    for (const b of buttons) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = b.label;
      btn.className =
        b.kind === "primary" ? "d-btn is-primary dialog-btn" :
        b.kind === "danger" ? "d-btn is-danger dialog-btn" :
        b.kind === "positive" ? "d-btn is-positive is-solid dialog-btn" : "d-btn is-ghost dialog-btn";
      btn.addEventListener("click", () => close(b.value));
      footer.appendChild(btn);
      if (b.kind === "primary" || b.kind === "positive" || (b.kind === "danger" && !primaryBtn)) primaryBtn = btn;
    }
    card.appendChild(footer);
    overlay.appendChild(card);

    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(cancelValue); }
    };
    overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) close(cancelValue); });
    document.addEventListener("keydown", onKey, true);

    let closed = false;
    function close(value) {
      if (closed) return;
      closed = true;
      openCount--;
      document.removeEventListener("keydown", onKey, true);
      overlay.remove();
      resolve(value);
    }

    document.body.appendChild(overlay);
    (primaryBtn || footer.lastChild).focus();
  });
}

export function alertDialog({ title, message, okLabel, kind = "info" }) {
  return showDialog({ title, message, kind, buttons: [{ label: okLabel, value: true, kind: "primary" }], cancelValue: true });
}

export function confirmDialog({ title, message, okLabel, cancelLabel, danger = false }) {
  return showDialog({
    title,
    message,
    buttons: [
      { label: cancelLabel, value: false, kind: "secondary" },
      { label: okLabel, value: true, kind: danger ? "danger" : "primary" }
    ],
    cancelValue: false
  });
}
