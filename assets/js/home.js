(function initHomeStats() {
  const statsApi = window.ForzaSpinStats;
  const allPrizes = [
    ...(window.FH4_CARS || []),
    ...(window.FH5_CARS || []),
    ...(window.FH6_CARS || []),
  ];
  const prizeCount = statsApi?.getPrizeCount(allPrizes);
  const totalSpins = document.getElementById('homeTotalSpins');
  const collectionProgress = document.getElementById('homeCollectionProgress');
  const creditsWon = document.getElementById('homeCreditsWon');
  const uniquePrizes = document.getElementById('homeUniquePrizes');

  if (!statsApi || !totalSpins || !collectionProgress || !creditsWon || !uniquePrizes) return;

  function renderStats() {
    const stats = statsApi.read();
    const wonPrizeCount = statsApi.getWonPrizeCount(stats.wonPrizeKeys, allPrizes);
    totalSpins.textContent = statsApi.formatNumber(stats.totalSpins);
    collectionProgress.textContent = statsApi.formatCollectionProgress(wonPrizeCount, prizeCount);
    creditsWon.textContent = statsApi.formatCredits(stats.creditsWon);
    uniquePrizes.textContent = statsApi.formatNumber(prizeCount);
  }

  renderStats();

  window.addEventListener('storage', (event) => {
    if (event.key === statsApi.storageKey) renderStats();
  });
  window.addEventListener('pageshow', renderStats);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) renderStats();
  });
})();

(function initHomeMiniWheel() {
  const viewport = document.getElementById('homeMiniWheelWindow');
  const track = document.getElementById('homeMiniWheelTrack');
  if (!viewport || !track) return;

  const baseCards = [...track.querySelectorAll('.mini-wheel-card')];
  if (!baseCards.length) return;

  const transitionMs = 820;
  const intervalMs = 2600;
  let activeIndex = baseCards.length;
  let resetTimer = 0;
  let spinTimer = 0;

  const prependFragment = document.createDocumentFragment();
  baseCards.forEach((card, index) => {
    card.dataset.wheelIndex = String(index);
    const prependClone = card.cloneNode(true);
    prependClone.classList.remove('is-active');
    prependClone.classList.add('is-clone');
    prependClone.setAttribute('aria-hidden', 'true');
    prependClone.dataset.wheelIndex = String(index);
    prependFragment.appendChild(prependClone);

    const clone = card.cloneNode(true);
    clone.classList.remove('is-active');
    clone.classList.add('is-clone');
    clone.setAttribute('aria-hidden', 'true');
    clone.dataset.wheelIndex = String(index);
    track.appendChild(clone);
  });
  track.insertBefore(prependFragment, baseCards[0]);

  function setActiveCard(index, animate = true) {
    window.clearTimeout(resetTimer);
    activeIndex = index;
    const cards = [...track.querySelectorAll('.mini-wheel-card')];
    const activeCard = cards[activeIndex];
    if (!activeCard) return;

    track.classList.toggle('no-transition', !animate);
    const offset = (viewport.clientWidth / 2) - (activeCard.offsetLeft + (activeCard.offsetWidth / 2));
    track.style.transform = `translate3d(${offset}px, 0, 0)`;

    cards.forEach((card, cardIndex) => {
      card.classList.toggle('is-active', cardIndex === activeIndex);
    });
    if (!animate) {
      window.requestAnimationFrame(() => track.classList.remove('no-transition'));
    }
  }

  function queueNextSpin() {
    spinTimer = window.setTimeout(() => {
      setActiveCard(activeIndex + 1);
      if (activeIndex >= baseCards.length * 2) {
        resetTimer = window.setTimeout(() => {
          setActiveCard(baseCards.length + (activeIndex % baseCards.length), false);
        }, transitionMs + 40);
      }
      queueNextSpin();
    }, intervalMs);
  }

  setActiveCard(activeIndex, false);
  queueNextSpin();

  window.addEventListener('resize', () => setActiveCard(baseCards.length + (activeIndex % baseCards.length), false));
  document.addEventListener('visibilitychange', () => {
    window.clearTimeout(spinTimer);
    if (!document.hidden) {
      setActiveCard(baseCards.length + (activeIndex % baseCards.length), false);
      queueNextSpin();
    }
  });
})();
