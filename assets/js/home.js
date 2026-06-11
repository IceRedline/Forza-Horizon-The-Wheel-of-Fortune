(function initHomeStats() {
  const statsApi = window.ForzaSpinStats;
  const prizeCount = statsApi?.getPrizeCount(window.FH4_CARS);
  const totalSpins = document.getElementById('homeTotalSpins');
  const collectionProgress = document.getElementById('homeCollectionProgress');
  const creditsWon = document.getElementById('homeCreditsWon');
  const uniquePrizes = document.getElementById('homeUniquePrizes');

  if (!statsApi || !totalSpins || !collectionProgress || !creditsWon || !uniquePrizes) return;

  function renderStats() {
    const stats = statsApi.read();
    totalSpins.textContent = statsApi.formatNumber(stats.totalSpins);
    collectionProgress.textContent = statsApi.formatCollectionProgress(stats.wonPrizeKeys.length, prizeCount);
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
