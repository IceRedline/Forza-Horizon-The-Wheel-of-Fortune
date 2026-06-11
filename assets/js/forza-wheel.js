// Runtime data and timing constants. The HTML files only provide the page shell.
const cars = window.FH4_CARS || [];
const forceRivalsChoice = document.body.dataset.forceRivalsChoice === 'true';
const spinLength = 96;
const winnerOffsetFromStart = 7;
const startOffsetFromEnd = 3;
const spinDurationMs = 14400;
const spinIntroCurveMs = 420;
const spinSettleCurveMs = 460;
const spinIntroCurveItems = 0.26;
const spinOvershootItems = 0.24;
const resultFlashLeadMs = 1000;
const loadFlashLeadMs = 175;
const spinSoundSrc = 'assets/sounds/wheel-spin.wav';
const spinSoundVolume = 0.62;
const spinSoundWarmupMs = 1200;
const spinSoundLeadMs = 800;
const totalCars = document.getElementById('totalCars');
const stage = document.getElementById('stage');
const carCard = document.getElementById('carCard');
const caseWindow = document.getElementById('caseWindow');
const caseTrack = document.getElementById('caseTrack');
const carName = document.getElementById('carName');
const status = document.getElementById('status');
const metaRow = document.getElementById('metaRow');
const spinButton = document.getElementById('spinButton');
const history = document.getElementById('history');
const statPi = document.getElementById('statPi');
const statRarity = document.getElementById('statRarity');
const statValue = document.getElementById('statValue');
const statSource = document.getElementById('statSource');
const statsPanel = document.querySelector('.stats');
const themeToggle = document.getElementById('themeToggle');
const gamePicker = document.getElementById('gamePicker');
const gamePickerToggle = document.getElementById('gamePickerToggle');
const gamePickerMenu = document.getElementById('gamePickerMenu');
const gamePickerTooltip = document.getElementById('gamePickerTooltip');
const spinSound = new Audio(spinSoundSrc);
spinSound.preload = 'none';
spinSound.volume = spinSoundVolume;
let currentSequence = [];
let currentWinnerIndex = 0;
let currentStartTranslate = 0;
let hasSpun = false;
let currentResultAnimation = 0;
const specialChanceCount = cars.filter(isSpecialChance).length;
const carCount = cars.length - specialChanceCount;
totalCars.textContent = specialChanceCount
  ? `${carCount.toLocaleString('en-US')} + ${specialChanceCount.toLocaleString('en-US')}`
  : cars.length.toLocaleString('en-US');

// Theme is intentionally page-local: default dark, optional light, persisted per browser.
function setTheme(theme) {
  const isLight = theme === 'light';
  document.body.classList.toggle('theme-light', isLight);
  themeToggle.checked = isLight;
  try {
    localStorage.setItem('forzaWheelTheme', isLight ? 'light' : 'dark');
  } catch (error) {
    // Local files can run in browsers with storage disabled.
  }
}

try {
  setTheme(localStorage.getItem('forzaWheelTheme') === 'light' ? 'light' : 'dark');
} catch (error) {
  setTheme('dark');
}

themeToggle.addEventListener('change', () => {
  setTheme(themeToggle.checked ? 'light' : 'dark');
});

function closeGamePicker() {
  if (!gamePicker || !gamePickerToggle) return;
  gamePicker.classList.remove('is-open');
  gamePickerToggle.setAttribute('aria-expanded', 'false');
}

function showComingSoonTooltip() {
  if (!gamePickerTooltip) return;
  gamePickerTooltip.classList.remove('is-visible');
  void gamePickerTooltip.offsetWidth;
  gamePickerTooltip.classList.add('is-visible');
  setTimeout(() => {
    gamePickerTooltip.classList.remove('is-visible');
  }, 1800);
}

if (gamePickerToggle && gamePicker) {
  gamePickerToggle.addEventListener('click', () => {
    const isOpen = gamePicker.classList.toggle('is-open');
    gamePickerToggle.setAttribute('aria-expanded', String(isOpen));
  });
}

if (gamePickerMenu) {
  gamePickerMenu.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.comingSoon !== undefined) showComingSoonTooltip();
    closeGamePicker();
  });
}

document.addEventListener('click', (event) => {
  if (!gamePicker || gamePicker.contains(event.target)) return;
  closeGamePicker();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeGamePicker();
});

// Build a no-repeat spin pool. Specials are part of the same data source as cars.
function sampleCars(count) {
  const pool = [...cars];
  const limit = Math.min(count, pool.length);
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const randomIndex = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[randomIndex]] = [pool[randomIndex], pool[i]];
  }
  return pool.slice(0, limit);
}

function placeRivalsChoice(sequence, targetIndex) {
  if (!forceRivalsChoice) return;
  const rivalsChoice = cars.find(isRivalsChoice);
  if (!rivalsChoice || !sequence[targetIndex]) return;
  const existingIndex = sequence.findIndex(isRivalsChoice);
  if (existingIndex >= 0) {
    [sequence[existingIndex], sequence[targetIndex]] = [sequence[targetIndex], sequence[existingIndex]];
    return;
  }
  sequence[targetIndex] = rivalsChoice;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadImage(src) {
  return new Promise((resolve) => {
    if (!src) {
      resolve(false);
      return;
    }
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = src;
  });
}

async function preload(sequence) {
  const uniqueImages = [...new Set(sequence.map((car) => car.image).filter(Boolean))];
  const loading = Promise.allSettled(uniqueImages.map(loadImage));
  await Promise.race([
    Promise.all([loading, wait(350)]),
    wait(1500),
  ]);
}

// Special outcomes render as full-cell cards instead of normal car cards.
function metaPill(label, value, extraClass = '') {
  if (!value) return '';
  return `<span class="pill ${extraClass}"><span>${label}</span><strong>${value}</strong></span>`;
}

function isUltimateChance(car) {
  return car?.kind === 'ultimate-chance';
}

function isRivalsChoice(car) {
  return car?.kind === 'rivals-choice';
}

function isSpecialChance(car) {
  return isUltimateChance(car) || isRivalsChoice(car);
}

function getResultRgb(car) {
  if (isUltimateChance(car)) return '255, 255, 255';
  if (isRivalsChoice(car)) return '210, 24, 24';
  const classColors = {
    x: '98, 200, 69',
    s2: '65, 90, 244',
    s1: '141, 53, 255',
    a: '204, 53, 31',
    b: '236, 99, 37',
    c: '240, 218, 36',
    d: '83, 190, 231',
  };
  const normalized = String(car.piClass || '').toLowerCase();
  return classColors[normalized] || classColors.d;
}

// Flash effects are class-driven so CSS can control shape and timing.
function updateResultGlow(car, shouldFlash = false) {
  stage.style.setProperty('--result-rgb', getResultRgb(car));
  stage.classList.remove('load-flash');
  stage.classList.remove('load-flash-fade');
  stage.classList.remove('result-flash');
  if (shouldFlash) {
    void stage.offsetWidth;
    stage.classList.add('result-flash');
  }
}

function startLoadFlash() {
  stage.classList.remove('result-flash');
  stage.classList.remove('load-flash');
  stage.classList.remove('load-flash-fade');
  void stage.offsetWidth;
  stage.classList.add('load-flash');
}

function fadeLoadFlash() {
  stage.classList.remove('load-flash');
  stage.classList.remove('load-flash-fade');
  void stage.offsetWidth;
  stage.classList.add('load-flash-fade');
  setTimeout(() => {
    stage.classList.remove('load-flash-fade');
  }, 520);
}

// Case-track rendering is kept string-based because the cells are small and regenerated per spin.
function getClassColorClass(car) {
  if (isRivalsChoice(car)) return 'case-item-special case-item-rival';
  if (isUltimateChance(car)) return 'case-item-special';
  const normalized = String(car.piClass || '').toLowerCase();
  return `case-class-${normalized || 'd'}`;
}

function renderCaseItem(car) {
  if (isSpecialChance(car)) {
    return `
      <div class="case-item ${getClassColorClass(car)}">
        <div class="case-item-name">${escapeHtml(car.name)}</div>
        <div class="case-item-pi" aria-hidden="true"></div>
      </div>
    `;
  }
  return `
    <div class="case-item ${getClassColorClass(car)}">
      <img src="${car.image}" alt="">
      <div class="case-item-name">${escapeHtml(car.name)}</div>
      <div class="case-item-pi">${escapeHtml(`${car.piClass} ${car.pi}`.trim() || 'PI -')}</div>
    </div>
  `;
}

function renderCaseTrack(sequence) {
  caseTrack.innerHTML = sequence.map(renderCaseItem).join('');
  caseTrack.style.transition = 'none';
  caseTrack.style.transform = 'translate3d(0, 0, 0)';
}

function getWinnerTranslate(winnerIndex) {
  const winnerItem = caseTrack.children[winnerIndex];
  if (!winnerItem) return 0;
  const windowRect = caseWindow.getBoundingClientRect();
  const itemCenter = winnerItem.offsetTop + (winnerItem.offsetHeight / 2);
  return (windowRect.height / 2) - itemCenter;
}

function getCaseItemStep(index) {
  const currentTranslate = getWinnerTranslate(index);
  const previousIndex = Math.max(0, index - 1);
  if (previousIndex !== index) return Math.abs(getWinnerTranslate(previousIndex) - currentTranslate);
  const nextIndex = Math.min(caseTrack.children.length - 1, index + 1);
  if (nextIndex !== index) return Math.abs(getWinnerTranslate(nextIndex) - currentTranslate);
  return 0;
}

// Safari and local-file playback are sensitive to late audio startup, so the sound is warmed up.
function playSpinSound() {
  try {
    spinSound.currentTime = 0;
  } catch (error) {
    // The browser may reject seeking before metadata is ready.
  }
  spinSound.muted = false;
  spinSound.volume = spinSoundVolume;
  if (spinSound.paused) {
    const playAttempt = spinSound.play();
    if (playAttempt && typeof playAttempt.catch === 'function') {
      playAttempt.catch(() => {});
    }
  }
}

function armSpinSound() {
  const soundReady = new Promise((resolve) => {
    if (spinSound.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
      resolve();
      return;
    }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      spinSound.removeEventListener('canplay', finish);
      spinSound.removeEventListener('canplaythrough', finish);
      resolve();
    };
    spinSound.addEventListener('canplay', finish, { once: true });
    spinSound.addEventListener('canplaythrough', finish, { once: true });
    setTimeout(finish, spinSoundWarmupMs);
  });
  spinSound.pause();
  try {
    spinSound.currentTime = 0;
  } catch (error) {
    // The browser may reject seeking before metadata is ready.
  }
  spinSound.preload = 'auto';
  spinSound.load();
  spinSound.muted = true;
  const playAttempt = spinSound.play();
  if (playAttempt && typeof playAttempt.catch === 'function') {
    playAttempt.catch(() => {});
  }
  return soundReady;
}

function stopSpinSound() {
  spinSound.pause();
  spinSound.muted = false;
  try {
    spinSound.currentTime = 0;
  } catch (error) {
    // Ignore browsers that cannot seek a just-stopped local file.
  }
}

function waitForTrackTransition(timeoutMs) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      caseTrack.removeEventListener('transitionend', finish);
      resolve();
    };
    caseTrack.addEventListener('transitionend', finish, { once: true });
    setTimeout(finish, timeoutMs + 400);
  });
}

async function animateTrackTo(translate, durationMs, easing) {
  caseTrack.style.transition = `transform ${durationMs / 1000}s ${easing}`;
  caseTrack.style.transform = `translate3d(0, ${translate}px, 0)`;
  await waitForTrackTransition(durationMs);
}

// The result panel is animated by swapping text while the values are faded/blurred out.
function showCar(car, mode = 'result') {
  updateResultGlow(car, mode === 'win');
  carName.textContent = car.name;
  metaRow.innerHTML = [
    metaPill('PI', `${car.piClass} ${car.pi}`.trim(), 'pi-badge'),
    metaPill('Speed', car.speed),
    metaPill('Handling', car.handling),
    metaPill('Accel.', car.acceleration),
    metaPill('Braking', car.braking),
  ].join('');
  setCurrentResult({
    pi: `${car.piClass} ${car.pi}`.trim() || '-',
    rarity: car.rarity || '-',
    value: car.value || '-',
    source: car.source || '-',
  });
}

function setCurrentResult(values, shouldAnimate = true) {
  const apply = () => {
    statPi.textContent = values.pi;
    statRarity.textContent = values.rarity;
    statValue.textContent = values.value;
    statSource.textContent = values.source;
  };
  if (!shouldAnimate) {
    statsPanel.classList.remove('is-changing');
    apply();
    return;
  }
  const token = ++currentResultAnimation;
  statsPanel.classList.add('is-changing');
  setTimeout(() => {
    if (token !== currentResultAnimation) return;
    apply();
    void statsPanel.offsetWidth;
    statsPanel.classList.remove('is-changing');
  }, 170);
}

function clearCurrentResult(shouldAnimate = true) {
  setCurrentResult({
    pi: '-',
    rarity: '-',
    value: '-',
    source: '-',
  }, shouldAnimate);
}

function addHistory(car) {
  const item = document.createElement('div');
  item.className = `history-item history-enter${isUltimateChance(car) ? ' history-special' : ''}${isRivalsChoice(car) ? ' history-rival' : ''}`;
  const imageHtml = isSpecialChance(car)
    ? '<div class="history-special-mark">?</div>'
    : `<img src="${car.image}" alt="">`;
  item.innerHTML = `
    ${imageHtml}
    <div>
      <div class="history-name">${escapeHtml(car.name)}</div>
      <div class="history-meta">${escapeHtml(isSpecialChance(car) ? car.rarity : `${car.piClass} ${car.pi}`.trim() || 'PI -')}</div>
    </div>`;
  history.prepend(item);
  void item.offsetWidth;
  item.classList.remove('history-enter');
  while (history.children.length > 12) history.lastElementChild.remove();
}

function recordSpinStats(car) {
  try {
    window.ForzaSpinStats?.recordSpin(car);
  } catch (error) {
    // Stats are non-critical UI state; storage may be unavailable.
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
  }[char]));
}

// Main spin flow: prepare assets, optionally swap the reel under a white flash, then animate.
async function spin() {
  if (spinButton.disabled) return;
  const isFirstSpin = !hasSpun;
  const sequence = isFirstSpin ? currentSequence : sampleCars(spinLength);
  const winnerIndex = isFirstSpin ? currentWinnerIndex : Math.min(winnerOffsetFromStart, sequence.length - 1);
  placeRivalsChoice(sequence, winnerIndex);
  const winner = sequence[winnerIndex];
  spinButton.disabled = true;
  const soundReady = armSpinSound();
  status.textContent = 'Loading';
  if (!isFirstSpin) clearCurrentResult();
  await Promise.all([preload(sequence), soundReady]);
  if (!isFirstSpin) {
    startLoadFlash();
    await wait(loadFlashLeadMs);
    renderCaseTrack(sequence);
    currentSequence = sequence;
    currentWinnerIndex = winnerIndex;
    currentStartTranslate = getWinnerTranslate(Math.max(0, sequence.length - 1 - startOffsetFromEnd));
    caseTrack.style.transform = `translate3d(0, ${currentStartTranslate}px, 0)`;
    fadeLoadFlash();
    await wait(80);
  }

  const targetTranslate = getWinnerTranslate(winnerIndex);
  const startTranslate = currentStartTranslate;
  const itemStep = getCaseItemStep(winnerIndex);
  const direction = Math.sign(targetTranslate - startTranslate) || 1;
  const introTranslate = startTranslate - (direction * itemStep * spinIntroCurveItems);
  const overshootTranslate = targetTranslate + (direction * itemStep * spinOvershootItems);
  const mainSpinDurationMs = spinDurationMs - spinIntroCurveMs - spinSettleCurveMs;
  caseTrack.style.transition = 'none';
  caseTrack.style.transform = `translate3d(0, ${startTranslate}px, 0)`;
  void caseTrack.offsetHeight;
  const soundStart = wait(spinIntroCurveMs).then(playSpinSound);
  await wait(spinSoundLeadMs);
  await soundStart;
  stage.classList.add('spinning');
  status.textContent = 'Spinning';
  const flashTimer = setTimeout(() => {
    updateResultGlow(winner, true);
  }, Math.max(0, spinDurationMs - resultFlashLeadMs));
  await animateTrackTo(introTranslate, spinIntroCurveMs, 'cubic-bezier(.34, 0, .22, 1)');
  await animateTrackTo(overshootTranslate, mainSpinDurationMs, 'cubic-bezier(.08, .78, .08, 1)');
  await animateTrackTo(targetTranslate, spinSettleCurveMs, 'cubic-bezier(.18, .84, .24, 1)');
  stopSpinSound();
  clearTimeout(flashTimer);
  caseTrack.style.transition = 'none';
  caseTrack.style.transform = `translate3d(0, ${targetTranslate}px, 0)`;

  showCar(winner);
  addHistory(winner);
  recordSpinStats(winner);
  status.textContent = 'Result';
  stage.classList.remove('spinning');
  spinButton.disabled = false;
  hasSpun = true;
  spinButton.focus();
}

spinButton.addEventListener('click', spin);

// Initial reel is already full-length so the first click can spin immediately without a reload flash.
const initialSequence = sampleCars(spinLength);
const initialIndex = Math.max(0, initialSequence.length - 1 - startOffsetFromEnd);
currentSequence = initialSequence;
currentWinnerIndex = Math.min(winnerOffsetFromStart, initialSequence.length - 1);
placeRivalsChoice(currentSequence, currentWinnerIndex);
renderCaseTrack(currentSequence);
currentStartTranslate = getWinnerTranslate(initialIndex);
caseTrack.style.transform = `translate3d(0, ${currentStartTranslate}px, 0)`;
clearCurrentResult(false);
status.textContent = 'Ready to spin';
