// "QR code & poster" dialog on the admin page: preview of a printable poster (title, optional
// description, QR code, optional link and closing date), print it, copy only the QR code or
// download the whole poster as PNG. Uses the vendored qrcode-generator (window.qrcode).
import { h, store, toast, icon, download, slug } from "./util.js";
import { t, fmtDate } from "./i18n.js";

const OPTS_KEY = "eventi:qr";

function makeQr(url) {
  const qr = window.qrcode(0, "M");
  qr.addData(url);
  qr.make();
  return qr;
}

// QR modules drawn onto a canvas (crisp, any size); returns the size used
function drawQr(ctx, qr, x, y, size) {
  const n = qr.getModuleCount();
  const cell = size / n;
  ctx.fillStyle = "#fff";
  ctx.fillRect(x, y, size, size);
  ctx.fillStyle = "#111";
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) ctx.fillRect(Math.floor(x + c * cell), Math.floor(y + r * cell), Math.ceil(cell), Math.ceil(cell));
    }
  }
}

const canvasBlob = (canvas) => new Promise((resolve) => canvas.toBlob(resolve, "image/png"));

// Only the QR code (with a white margin)
function qrCanvas(qr, size = 640) {
  const margin = Math.round(size * 0.06);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size + 2 * margin;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawQr(ctx, qr, margin, margin, size);
  return canvas;
}

// Wraps text to lines that fit maxWidth (max. maxLines, last line with "…")
function wrap(ctx, text, maxWidth, maxLines) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width <= maxWidth || !line) line = test;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = `${lines[maxLines - 1].replace(/\s*\S*$/, "")} …`;
  }
  return lines;
}

// The whole poster as PNG (same content as the preview)
function posterCanvas(p) {
  const W = 1000, pad = 80;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const font = (weight, size) => `${weight} ${size}px system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif`;
  // measure first (height depends on wrapped text)
  ctx.font = font(800, 72);
  const titleLines = wrap(ctx, p.title, W - 2 * pad, 3);
  ctx.font = font(400, 34);
  const descLines = p.desc ? wrap(ctx, p.desc, W - 2 * pad, 3) : [];
  const qrSize = 560;
  let H = pad + 40 + 30 + titleLines.length * 84 + (descLines.length ? 20 + descLines.length * 44 : 0) + 50 + qrSize + 50 + 50;
  if (p.link) H += 46;
  if (p.until) H += 70;
  H += pad;
  canvas.width = W;
  canvas.height = H;

  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  let y = pad + 40;
  ctx.fillStyle = "#6d4ae0";
  ctx.font = font(700, 30);
  ctx.fillText(p.eyebrow.toUpperCase().split("").join(String.fromCharCode(8202)), W / 2, y);
  y += 30;
  ctx.fillStyle = "#15151b";
  ctx.font = font(800, 72);
  for (const l of titleLines) { y += 84; ctx.fillText(l, W / 2, y - 12); }
  if (descLines.length) {
    y += 20;
    ctx.fillStyle = "#6b6b78";
    ctx.font = font(400, 34);
    for (const l of descLines) { y += 44; ctx.fillText(l, W / 2, y - 8); }
  }
  y += 50;
  drawQr(ctx, p.qr, (W - qrSize) / 2, y, qrSize);
  y += qrSize + 50;
  ctx.fillStyle = "#15151b";
  ctx.font = font(700, 38);
  ctx.fillText(p.scan, W / 2, y);
  if (p.link) {
    y += 46;
    ctx.fillStyle = "#6b6b78";
    ctx.font = font(400, 26);
    ctx.fillText(p.link, W / 2, y);
  }
  if (p.until) {
    y += 30;
    ctx.strokeStyle = "#e3e3ea";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pad + 60, y);
    ctx.lineTo(W - pad - 60, y);
    ctx.stroke();
    y += 40;
    ctx.fillStyle = "#3a3a45";
    ctx.font = font(500, 28);
    ctx.fillText(p.until, W / 2, y);
  }
  return canvas;
}

export function openQrModal(survey, url) {
  const qr = makeQr(url);
  const opts = { desc: true, link: true, until: true, ...(store.get(OPTS_KEY) || {}) };
  const hasDesc = !!survey.description;
  const untilText = survey.closes_at && !survey.is_closed
    ? t("qr.until", { date: fmtDate(new Date(survey.closes_at), { dateStyle: "medium" }) }) : "";
  const shortUrl = url.replace(/^https?:\/\//, "");
  const poster = () => ({
    eyebrow: t("qr.eyebrow"), title: survey.title, desc: opts.desc && hasDesc ? survey.description : "",
    qr, scan: t("qr.scan"), link: opts.link ? shortUrl : "", until: opts.until ? untilText : "",
  });

  const preview = h("div", { class: "qr-poster" });
  const paintPreview = () => {
    const p = poster();
    const svg = h("div", { class: "qr-poster-code" });
    svg.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true, alt: t("admin.qr") });
    preview.replaceChildren(...[
      h("p", { class: "qr-poster-eyebrow" }, p.eyebrow),
      h("h3", { class: "qr-poster-title" }, p.title),
      p.desc && h("p", { class: "qr-poster-desc" }, p.desc),
      svg,
      h("p", { class: "qr-poster-scan" }, p.scan),
      p.link && h("p", { class: "qr-poster-link" }, p.link),
      p.until && h("p", { class: "qr-poster-until" }, p.until),
    ].filter(Boolean));
  };

  const toggle = (key, label, enabled) => h("label", { class: `set-row plain qr-toggle${enabled ? "" : " disabled"}` },
    h("span", {}, label),
    h("input", {
      type: "checkbox", role: "switch", class: "switch", checked: opts[key] && enabled, disabled: !enabled,
      onchange: (e) => {
        opts[key] = e.target.checked;
        store.set(OPTS_KEY, opts);
        paintPreview();
      },
    }));

  const close = () => {
    overlay.remove();
    document.removeEventListener("keydown", onKey);
    document.body.classList.remove("modal-open");
  };
  const onKey = (e) => { if (e.key === "Escape") close(); };

  const print = () => {
    // Print only the poster: a print-only copy of the preview, everything else hidden via @media print
    const area = h("div", { id: "print-area" }, preview.cloneNode(true));
    document.body.append(area);
    document.body.classList.add("printing");
    const done = () => {
      document.body.classList.remove("printing");
      area.remove();
      window.removeEventListener("afterprint", done);
    };
    window.addEventListener("afterprint", done);
    window.print();
    setTimeout(done, 1000);
  };

  const copyQr = async () => {
    const blob = await canvasBlob(qrCanvas(qr));
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      toast(t("qr.copied"));
    } catch {
      download(`${slug(survey.title)}-qr.png`, blob, "image/png");
      toast(t("qr.copy_failed"));
    }
  };

  const downloadPng = async () => {
    const blob = await canvasBlob(posterCanvas(poster()));
    download(`${slug(survey.title)}-poster.png`, blob, "image/png");
  };

  const dialog = h("div", { class: "modal qr-modal", role: "dialog", "aria-modal": "true", "aria-labelledby": "qr-modal-title" },
    h("div", { class: "modal-head" },
      h("h2", { id: "qr-modal-title" }, t("qr.title")),
      h("button", { type: "button", class: "icon-btn", "aria-label": t("action.close"), title: t("action.close"), onclick: close }, icon("x"))),
    h("div", { class: "qr-modal-body" },
      h("div", { class: "qr-preview-wrap" }, preview),
      h("div", { class: "qr-side" },
        h("p", { class: "eyebrow" }, t("qr.show")),
        toggle("desc", t("qr.desc"), hasDesc),
        toggle("link", t("qr.link"), true),
        toggle("until", t("qr.deadline"), !!untilText),
        h("div", { class: "qr-actions" },
          h("button", { type: "button", class: "btn btn-primary", onclick: print }, icon("print"), t("qr.print")),
          h("div", { class: "qr-actions-row" },
            h("button", { type: "button", class: "btn", onclick: copyQr }, icon("copy"), t("qr.copy")),
            h("button", { type: "button", class: "btn", onclick: downloadPng }, icon("download"), "PNG"))))));

  const overlay = h("div", { class: "modal-overlay", onclick: (e) => { if (e.target === overlay) close(); } }, dialog);
  paintPreview();
  document.body.append(overlay);
  document.body.classList.add("modal-open");
  document.addEventListener("keydown", onKey);
  dialog.querySelector(".modal-head .icon-btn").focus();
}
