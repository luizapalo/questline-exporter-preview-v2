/**
 * Collectables Preview v2
 *
 * Renders a ZIP exported by the Collectables plugin (v2 format).
 * Supports: background, header, rewards, quest card, collectables,
 *           button-primary/claim/close, quest title/description,
 *           progress bar bg/fill/text, timer.
 */

'use strict';

// ── State ────────────────────────────────────────────────────────────────────

const previewState = {
  questState: 'active',
  headerState: 'active',
  rewardsState: 'active',
  questCardState: 'quest',
  buttonState: 'default',
  progress: 60,
};

let json = null;       // parsed positions.json
let imgUrls = {};      // filename → object URL

// ── DOM refs ─────────────────────────────────────────────────────────────────

const zipInput   = document.getElementById('zipInput');
const zipInput2  = document.getElementById('zipInput2');
const controls   = document.getElementById('controls');
const frame      = document.getElementById('frame');
const frameScaler  = document.getElementById('frameScaler');
const frameWrapper = document.getElementById('frameWrapper');
const emptyState   = document.getElementById('emptyState');
const metaDisplay  = document.getElementById('metaDisplay');
const progressSlider = document.getElementById('progressSlider');
const progressVal    = document.getElementById('progressVal');

// ── ZIP loading ───────────────────────────────────────────────────────────────

async function loadZip(file) {
  if (!file) return;
  // Revoke previous object URLs
  Object.values(imgUrls).forEach(URL.revokeObjectURL);
  imgUrls = {};

  let zip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    alert('Could not read ZIP file. Make sure it was exported by the Collectables plugin.');
    return;
  }

  // Find positions.json (may be at root or inside a folder)
  let jsonFile = zip.file('positions.json');
  if (!jsonFile) {
    const matches = zip.file(/positions\.json$/);
    jsonFile = matches[0] ?? null;
  }
  if (!jsonFile) {
    alert('positions.json not found in ZIP.');
    return;
  }

  json = JSON.parse(await jsonFile.async('text'));

  // Extract all images
  const imgFiles = zip.file(/\.(png|webp)$/i);
  await Promise.all(imgFiles.map(async (f) => {
    const bytes = await f.async('uint8array');
    const ext   = f.name.split('.').pop().toLowerCase();
    const mime  = ext === 'webp' ? 'image/webp' : 'image/png';
    const blob  = new Blob([bytes], { type: mime });
    // Store under both full path and basename for flexible lookup
    const basename = f.name.split('/').pop();
    imgUrls[f.name]  = URL.createObjectURL(blob);
    imgUrls[basename] = imgUrls[f.name];
  }));

  showControls();
  render();
  showMeta();
}

function resolveImg(name) {
  if (!name) return null;
  return imgUrls[name] ?? imgUrls[name.split('/').pop()] ?? null;
}

// ── Controls visibility ───────────────────────────────────────────────────────

function showControls() {
  controls.hidden = false;
  emptyState.hidden = true;
  frameWrapper.hidden = false;

  document.getElementById('grpHeader').hidden    = !json.header;
  document.getElementById('grpRewards').hidden   = !json.rewards;
  document.getElementById('grpQuestCard').hidden = !json.questCard;
  document.getElementById('grpButton').hidden    = !(json.buttonPrimary || json.buttonClaim || json.buttonClose);
  document.getElementById('grpProgress').hidden  = !(json.progressBg || json.progressFill || json.progressText);
}

function showMeta() {
  const id  = json.collectablesId ?? json.questlineId ?? '—';
  const fmt = json.metadata?.exportFormat ?? '?';
  const ver = json.metadata?.version ?? '?';
  const n   = json.metadata?.totalCollectables ?? json.collectables?.length ?? 0;
  metaDisplay.textContent = `${id} · ${n} collectables · ${fmt.toUpperCase()} · v${ver}`;
}

// ── Rendering ─────────────────────────────────────────────────────────────────

function render() {
  if (!json) return;

  const fw = json.frameSize?.width  ?? 366;
  const fh = json.frameSize?.height ?? 661;

  // Scale to fit the preview area (leave some padding)
  const area   = document.querySelector('.preview-area');
  const maxW   = area.clientWidth  - 48;
  const maxH   = area.clientHeight - 48;
  const scale  = Math.min(maxW / fw, maxH / fh, 1);

  frame.style.width  = `${fw}px`;
  frame.style.height = `${fh}px`;
  frameScaler.style.width  = `${fw * scale}px`;
  frameScaler.style.height = `${fh * scale}px`;
  frameScaler.style.transform = `scale(${scale})`;
  frameScaler.style.transformOrigin = 'top left';

  frame.innerHTML = '';

  renderBackground();
  renderRewards();
  renderQuestCard();
  renderCollectables();
  renderHeader();
  renderProgressBg();
  renderProgressFill();
  renderProgressText();
  renderQuestTitle();
  renderQuestDescription();
  renderTimer();
  renderButton(json.buttonClose,   'button-close',   1053);
  renderButton(json.buttonClaim,   'button-claim',   1054);
  renderButton(json.buttonPrimary, 'button-primary', 1055);
}

// ── Element helpers ───────────────────────────────────────────────────────────

/**
 * Place an element using center-based bounds (x,y = center of element).
 */
function placeCenter(el, bounds, zIndex) {
  el.style.position = 'absolute';
  el.style.left   = `${bounds.x - bounds.width / 2}px`;
  el.style.top    = `${bounds.y - bounds.height / 2}px`;
  el.style.width  = `${bounds.width}px`;
  el.style.height = `${bounds.height}px`;
  if (bounds.rotation) el.style.transform = `rotate(${bounds.rotation}deg)`;
  if (zIndex != null)  el.style.zIndex = zIndex;
}

function imgEl(src, bounds, zIndex, extraClass) {
  if (!src) return null;
  const el = document.createElement('div');
  el.className = 'el' + (extraClass ? ' ' + extraClass : '');
  placeCenter(el, bounds, zIndex);
  const img = document.createElement('img');
  img.src = src;
  img.alt = '';
  el.appendChild(img);
  return el;
}

function append(el) {
  if (el) frame.appendChild(el);
}

// Pick the correct stateful image URL from a button/rewards/questCard export block.
function pickStateImg(block, stateKey) {
  if (!block) return null;
  const map = {
    // button keys
    defaultImg:  'default',  disabledImg: 'disabled',
    hoverImg:    'hover',    activeImg:   'active',
    // rewards
    claimedImg:  'claimed',
    // questCard
    questImg:    'quest', claimImg: 'claim', claimedImg2: 'claimed', timesupImg: 'timesup',
  };
  // Find a key where the state value matches stateKey
  for (const [prop, val] of Object.entries(map)) {
    if (val === stateKey && block[prop]) return resolveImg(block[prop]);
  }
  return null;
}

// ── Individual element renderers ──────────────────────────────────────────────

function renderBackground() {
  if (!json.background?.exportUrl) return;
  const src = resolveImg(json.background.exportUrl);
  if (!src) return;
  const fw = json.frameSize?.width  ?? 366;
  const fh = json.frameSize?.height ?? 661;
  const el = document.createElement('div');
  el.className = 'el';
  el.style.cssText = `position:absolute;left:0;top:0;width:${fw}px;height:${fh}px;z-index:0;`;
  const img = document.createElement('img');
  img.src = src; img.alt = '';
  el.appendChild(img);
  frame.appendChild(el);
}

function renderHeader() {
  if (!json.header) return;
  // v2 header: single static image with bounds
  const src = resolveImg(json.header.imgUrl);
  if (!src) return;
  append(imgEl(src, json.header.bounds, 1100));
}

function renderRewards() {
  if (!json.rewards) return;
  const s   = previewState.rewardsState;         // 'active' | 'claimed'
  const src = resolveImg(s === 'claimed' ? json.rewards.claimedImg : json.rewards.activeImg)
           ?? resolveImg(json.rewards.activeImg);
  const bounds = json.rewards.stateBounds?.[s] ?? json.rewards.stateBounds?.active;
  if (src && bounds) append(imgEl(src, bounds, 1050));
}

function renderQuestCard() {
  if (!json.questCard) return;
  const s      = previewState.questCardState;     // 'quest' | 'claim' | 'claimed' | 'timesup'
  const srcMap = {
    quest: json.questCard.questImg,
    claim: json.questCard.claimImg,
    claimed: json.questCard.claimedImg,
    timesup: json.questCard.timesupImg,
  };
  const src    = resolveImg(srcMap[s]) ?? resolveImg(json.questCard.questImg);
  const bounds = json.questCard.stateBounds?.[s] ?? json.questCard.stateBounds?.quest;
  if (src && bounds) append(imgEl(src, bounds, 1020));
}

function renderCollectables() {
  const list = json.collectables ?? json.quests ?? [];
  const s    = previewState.questState;           // 'locked'|'active'|'unclaimed'|'completed'
  list.forEach((q, i) => {
    const srcMap = {
      locked:    q.lockedImg,
      active:    q.activeImg,
      unclaimed: q.unclaimedImg,
      completed: q.completedImg,
    };
    const src    = resolveImg(srcMap[s]) ?? resolveImg(q.activeImg);
    const bounds = q.stateBounds?.[s] ?? q.stateBounds?.active;
    if (src && bounds) append(imgEl(src, bounds, 1000 + i));
  });
}

function renderButton(block, label, zIndex) {
  if (!block) return;
  const s    = previewState.buttonState;          // 'default'|'disabled'|'hover'|'active'
  const imgKey = { default: 'defaultImg', disabled: 'disabledImg', hover: 'hoverImg', active: 'activeImg' }[s];
  const src    = resolveImg(block[imgKey]) ?? resolveImg(block.defaultImg);
  const bounds = block.stateBounds?.[s] ?? block.stateBounds?.default;
  if (src && bounds) append(imgEl(src, bounds, zIndex, `btn-${label}`));
}

function renderProgressBg() {
  const bg = json.progressBg;
  if (!bg) return;
  const bounds = extractBounds(bg);
  if (!bounds) return;
  const el = document.createElement('div');
  el.className = 'el progress-bg-el';
  placeCenter(el, bounds, 1065);
  applyRectStyle(el, bg);
  frame.appendChild(el);
}

function renderProgressFill() {
  const fill = json.progressFill;
  if (!fill) return;
  const bounds = extractBounds(fill);
  if (!bounds) return;
  const el = document.createElement('div');
  el.className = 'el progress-fill-el';
  // Position at left edge of bg, width = progress%
  const pct = previewState.progress / 100;
  placeCenter(el, { ...bounds, width: bounds.width * pct }, 1066);
  el.style.left = `${bounds.x - bounds.width / 2}px`;  // pin to left edge
  applyRectStyle(el, fill);
  frame.appendChild(el);
}

function renderProgressText() {
  const t = json.progressText;
  if (!t) return;
  const bounds = extractBounds(t);
  if (!bounds) return;
  const el = document.createElement('div');
  el.className = 'el text-el';
  placeCenter(el, bounds, 1067);
  applyTextStyle(el, t);
  el.textContent = `${previewState.progress}%`;
  frame.appendChild(el);
}

function renderQuestTitle() {
  const t = json.questTitle;
  if (!t) return;
  const bounds = extractBounds(t);
  if (!bounds) return;
  const el = document.createElement('div');
  el.className = 'el text-el';
  placeCenter(el, bounds, 1070);
  applyTextStyle(el, t);
  el.textContent = 'Quest Title';
  frame.appendChild(el);
}

function renderQuestDescription() {
  const t = json.questDescription;
  if (!t) return;
  const bounds = extractBounds(t);
  if (!bounds) return;
  const el = document.createElement('div');
  el.className = 'el text-el';
  placeCenter(el, bounds, 1071);
  applyTextStyle(el, t);
  el.textContent = 'Quest description goes here.';
  frame.appendChild(el);
}

function renderTimer() {
  const timer = json.timer;
  if (!timer) return;
  const pos  = timer.position ?? {};
  const dims = timer.dimensions ?? {};
  if (!pos.x || !dims.width) return;
  const bounds = { x: pos.x, y: pos.y, width: dims.width, height: dims.height };
  const el = document.createElement('div');
  el.className = 'el';
  placeCenter(el, bounds, 1090);
  if (dims.width) el.style.width  = `${dims.width}px`;
  if (dims.height) el.style.height = `${dims.height}px`;
  if (timer.borderRadius) el.style.borderRadius = `${timer.borderRadius}px`;
  applyFill(el, timer.backgroundFill);
  if (timer.textStyle) applyTextStyle(el, { textStyle: timer.textStyle });
  el.textContent = '00:00';
  el.style.display = 'flex';
  el.style.alignItems = 'center';
  el.style.justifyContent = 'center';
  frame.appendChild(el);
}

// ── Style utilities ───────────────────────────────────────────────────────────

function extractBounds(el) {
  if (!el) return null;
  // TEXT elements: { position: {x,y}, dimensions: {width,height} }
  if (el.position && el.dimensions) {
    return { x: el.position.x, y: el.position.y, width: el.dimensions.width, height: el.dimensions.height };
  }
  // Fallback if bounds are flat
  if (el.x != null && el.width != null) return el;
  return null;
}

function applyFill(el, fill) {
  if (!fill) return;
  if (fill.type === 'solid') {
    el.style.background = fill.color;
  } else if (fill.type === 'gradient' && fill.gradient?.stops?.length) {
    const stops = fill.gradient.stops.map(s => `${s.color} ${(s.position * 100).toFixed(1)}%`).join(', ');
    const rot   = fill.gradient.rotation ?? 90;
    el.style.background = `linear-gradient(${rot}deg, ${stops})`;
  }
}

function applyRectStyle(el, rect) {
  applyFill(el, rect.backgroundFill ?? rect.fill);
  if (rect.borderRadius != null) el.style.borderRadius = `${rect.borderRadius}px`;
  if (rect.stroke?.color) {
    el.style.outline = `${rect.stroke.width ?? 1}px solid ${rect.stroke.color}`;
  }
}

function applyTextStyle(el, data) {
  const ts = data.textStyle ?? data;
  if (!ts) return;
  if (ts.fontSize)   el.style.fontSize   = `${ts.fontSize}px`;
  if (ts.color)      el.style.color      = ts.color;
  if (ts.fontWeight) el.style.fontWeight = ts.fontWeight;
  if (ts.textAlignHorizontal) el.style.textAlign = ts.textAlignHorizontal.toLowerCase();
  el.style.lineHeight = '1.2';
  el.style.overflow = 'hidden';
}

// ── Event wiring ──────────────────────────────────────────────────────────────

[zipInput, zipInput2].forEach(inp => {
  inp.addEventListener('change', e => {
    const file = e.target.files?.[0];
    if (file) loadZip(file);
    e.target.value = '';
  });
});

// Chip state selectors
document.querySelectorAll('.chips').forEach(group => {
  group.addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    const key = group.dataset.group;
    if (!key) return;
    group.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    previewState[key] = chip.dataset.value;
    render();
  });
});

// Progress slider
progressSlider.addEventListener('input', () => {
  previewState.progress = Number(progressSlider.value);
  progressVal.textContent = `${previewState.progress}%`;
  render();
});

// Re-render on resize
window.addEventListener('resize', () => { if (json) render(); });
