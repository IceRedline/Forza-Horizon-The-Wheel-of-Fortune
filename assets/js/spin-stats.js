(function exposeSpinStats(global) {
  const storageKey = 'forzaWheelLocalStats';
  const emptyStats = { totalSpins: 0, creditsWon: 0, wonPrizeKeys: [] };

  function toSafeInteger(value) {
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) return 0;
    return Math.floor(number);
  }

  function normalizeStats(value) {
    const wonPrizeKeys = Array.isArray(value?.wonPrizeKeys)
      ? [...new Set(value.wonPrizeKeys.map((key) => String(key)).filter(Boolean))]
      : [];

    return {
      totalSpins: toSafeInteger(value?.totalSpins),
      creditsWon: toSafeInteger(value?.creditsWon),
      wonPrizeKeys,
    };
  }

  function readStats() {
    try {
      const rawStats = global.localStorage?.getItem(storageKey);
      if (!rawStats) return { ...emptyStats };
      return normalizeStats(JSON.parse(rawStats));
    } catch (error) {
      return { ...emptyStats };
    }
  }

  function writeStats(stats) {
    const normalizedStats = normalizeStats(stats);
    try {
      global.localStorage?.setItem(storageKey, JSON.stringify(normalizedStats));
    } catch (error) {
      // Browsers can disable storage for local files or private contexts.
    }
    return normalizedStats;
  }

  function parseCreditValue(value) {
    const match = String(value || '').match(/[\d,.]+/);
    if (!match) return 0;
    return toSafeInteger(match[0].replace(/[^\d]/g, ''));
  }

  function recordSpin(outcome) {
    const stats = readStats();
    const prizeKey = getPrizeKey(outcome);
    const wonPrizeKeys = prizeKey
      ? [...new Set([...stats.wonPrizeKeys, prizeKey])]
      : stats.wonPrizeKeys;

    return writeStats({
      totalSpins: stats.totalSpins + 1,
      creditsWon: stats.creditsWon + parseCreditValue(outcome?.value),
      wonPrizeKeys,
    });
  }

  function getPrizeKey(outcome) {
    const kind = String(outcome?.kind || 'car').trim();
    const imageFile = String(outcome?.imageFile || '').trim();
    if (imageFile) return `${kind}:${imageFile}`;
    const name = String(outcome?.name || '').trim();
    if (!name) return '';
    return [
      kind,
      name,
      String(outcome?.year || '').trim(),
    ].filter(Boolean).join(':');
  }

  function getPrizeCount(prizes) {
    if (!Array.isArray(prizes)) return 0;
    return new Set(prizes.map(getPrizeKey).filter(Boolean)).size;
  }

  function formatNumber(value) {
    return toSafeInteger(value).toLocaleString('en-US');
  }

  function formatCredits(value) {
    const credits = toSafeInteger(value);
    if (credits >= 1_000_000_000) return `${formatCompact(credits, 1_000_000_000)}B`;
    if (credits >= 1_000_000) return `${formatCompact(credits, 1_000_000)}M`;
    return formatNumber(credits);
  }

  function formatCollectionProgress(wonCount, totalCount) {
    const total = toSafeInteger(totalCount);
    if (!total) return '0%';
    const progress = Math.min(100, (toSafeInteger(wonCount) / total) * 100);
    if (!progress || Number.isInteger(progress)) return `${progress}%`;
    return `${progress.toFixed(1)}%`;
  }

  function formatCompact(value, divider) {
    const compact = value / divider;
    const rounded = Math.round(compact * 10) / 10;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  }

  global.ForzaSpinStats = {
    storageKey,
    read: readStats,
    write: writeStats,
    recordSpin,
    parseCreditValue,
    getPrizeKey,
    getPrizeCount,
    formatNumber,
    formatCredits,
    formatCollectionProgress,
  };
})(window);
