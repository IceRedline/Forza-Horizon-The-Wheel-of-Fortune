import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, Script } from 'node:vm';
import test from 'node:test';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const paths = {
  homeHtml: join(root, 'index.html'),
  mainHtml: join(root, 'forza-wheel.html'),
  homeJs: join(root, 'assets', 'js', 'home.js'),
  spinStatsJs: join(root, 'assets', 'js', 'spin-stats.js'),
  appCss: join(root, 'assets', 'css', 'forza-wheel.css'),
  appJs: join(root, 'assets', 'js', 'forza-wheel.js'),
  fh4CarsJson: join(root, 'data', 'fh4-cars.json'),
  fh4CarsJs: join(root, 'data', 'fh4-cars.js'),
  fh5CarsJson: join(root, 'data', 'fh5-cars.json'),
  fh5CarsJs: join(root, 'data', 'fh5-cars.js'),
  fh6CarsJson: join(root, 'data', 'fh6-cars.json'),
  fh6CarsJs: join(root, 'data', 'fh6-cars.js'),
  carsDir: join(root, 'assets', 'cars'),
  spinSound: join(root, 'assets', 'sounds', 'wheel-spin-custom.wav'),
  stopSound: join(root, 'assets', 'sounds', 'wheel_stop.mp3'),
};

async function readText(path) {
  return readFile(path, 'utf8');
}

async function loadSpinStatsApi() {
  const source = await readText(paths.spinStatsJs);
  const storage = new Map();
  const localStorage = {
    getItem: (key) => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => storage.set(key, String(value)),
  };
  const sandbox = { window: { localStorage } };
  new Script(source).runInContext(createContext(sandbox));
  return { api: sandbox.window.ForzaSpinStats, storage };
}

function plainObject(value) {
  return JSON.parse(JSON.stringify(value));
}

async function readCarsJson() {
  return JSON.parse(await readText(paths.fh4CarsJson));
}

async function readBrowserCarsJs(path, globalName) {
  const source = (await readText(path)).trim();
  const prefix = `window.${globalName} = `;
  assert.ok(source.startsWith(prefix), `${path} should expose window.${globalName}`);
  assert.ok(source.endsWith(';'), `${path} should end with a semicolon`);
  return JSON.parse(source.slice(prefix.length, -1));
}

async function readCarsJs() {
  return readBrowserCarsJs(paths.fh4CarsJs, 'FH4_CARS');
}

function assertContains(source, needle, label) {
  assert.ok(source.includes(needle), `${label} should contain ${needle}`);
}

function extractCssBlock(source, marker) {
  const markerIndex = source.indexOf(marker);
  assert.notEqual(markerIndex, -1, `CSS should contain ${marker}`);
  const openIndex = source.indexOf('{', markerIndex);
  assert.notEqual(openIndex, -1, `${marker} should open a CSS block`);

  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(openIndex + 1, index);
    }
  }

  assert.fail(`${marker} should close a CSS block`);
}

test('car database has expected size, specials, and browser mirror', async () => {
  const carsJson = await readCarsJson();
  const carsJs = await readCarsJs();
  assert.deepEqual(carsJs, carsJson, 'fh4-cars.js should match fh4-cars.json exactly');

  const specials = carsJson.filter((car) => car.kind);
  const regularCars = carsJson.filter((car) => !car.kind);
  assert.equal(regularCars.length, 753, 'regular car count should stay stable');
  assert.equal(specials.length, 2, 'special outcome count should stay stable');
  assert.ok(carsJson.every((car) => car.game === 'fh4'), 'current car database should be marked as FH4');

  assert.deepEqual(
    specials.map((car) => car.name),
    ['Absolute Ultimate Chance', "Rival's choice"],
  );

  const absolute = specials.find((car) => car.kind === 'ultimate-chance');
  assert.equal(absolute.value, '∞ CR');
  assert.equal(absolute.source, 'Any car you want');
});

test('future game car databases are parsed and mirrored', async () => {
  const cases = [
    {
      jsonPath: paths.fh5CarsJson,
      jsPath: paths.fh5CarsJs,
      globalName: 'FH5_CARS',
      game: 'fh5',
      regularCount: 902,
      sample: 'Abarth 124 Spider 2017',
    },
    {
      jsonPath: paths.fh6CarsJson,
      jsPath: paths.fh6CarsJs,
      globalName: 'FH6_CARS',
      game: 'fh6',
      regularCount: 618,
      sample: 'Abarth 695 Biposto 2016',
    },
  ];

  for (const entry of cases) {
    const carsJson = JSON.parse(await readText(entry.jsonPath));
    const carsJs = await readBrowserCarsJs(entry.jsPath, entry.globalName);
    const specials = carsJson.filter((car) => car.kind);
    const regularCars = carsJson.filter((car) => !car.kind);
    assert.deepEqual(carsJs, carsJson, `${entry.game} browser mirror should match JSON exactly`);
    assert.equal(regularCars.length, entry.regularCount, `${entry.game} parsed regular car count should stay stable`);
    assert.equal(specials.length, 2, `${entry.game} should include special outcomes`);
    assert.ok(carsJson.every((car) => car.game === entry.game), `${entry.game} cars should be game-marked`);
    assert.ok(carsJson.some((car) => car.name === entry.sample), `${entry.game} should include ${entry.sample}`);
    assert.ok(regularCars.every((car) => car.name && car.year && car.value && car.piClass && car.pi), `${entry.game} cars should have usable wheel fields`);
    assert.deepEqual(
      specials.map((car) => car.name),
      ['Absolute Ultimate Chance', "Rival's choice"],
    );
    assert.equal(new Set(regularCars.map((car) => `${car.name}:${car.year}`)).size, regularCars.length, `${entry.game} cars should be unique`);
  }
});

test('regular cars point at local image files in game-specific folders', async () => {
  const cases = [
    { game: 'fh4', jsonPath: paths.fh4CarsJson, expectedCount: 753 },
    { game: 'fh5', jsonPath: paths.fh5CarsJson, expectedCount: 902 },
    { game: 'fh6', jsonPath: paths.fh6CarsJson, expectedCount: 618 },
  ];

  for (const entry of cases) {
    const regularCars = JSON.parse(await readText(entry.jsonPath)).filter((car) => !car.kind);
    assert.equal(regularCars.length, entry.expectedCount, `${entry.game} regular car count should stay stable`);
    for (const car of regularCars) {
      assert.ok(car.image.startsWith(`assets/cars/${entry.game}/`), `${car.name} should use a local ${entry.game} car image`);
      assert.ok(car.imageFile.startsWith(`${entry.game}/`), `${car.name} should have a ${entry.game} imageFile`);
      assert.ok(
        existsSync(join(paths.carsDir, car.imageFile)),
        `${car.name} image is missing: ${car.imageFile}`,
      );
    }
  }
});

test('spin sound is a local playable wav file', async () => {
  const sound = await readFile(paths.spinSound);
  assert.equal(sound.subarray(0, 4).toString('ascii'), 'RIFF');
  assert.equal(sound.subarray(8, 12).toString('ascii'), 'WAVE');

  const channels = sound.readUInt16LE(22);
  const sampleRate = sound.readUInt32LE(24);
  const bitsPerSample = sound.readUInt16LE(34);
  const dataOffset = sound.indexOf(Buffer.from('data'));
  assert.ok(dataOffset > 0, 'wav file should contain a data chunk');
  const dataSize = sound.readUInt32LE(dataOffset + 4);
  const duration = dataSize / (channels * (bitsPerSample / 8)) / sampleRate;
  assert.ok(duration > 10 && duration < 11, `spin sound duration should be about 11 seconds, got ${duration}`);
});

test('stop sound is a local playable mp3 file', async () => {
  const sound = await readFile(paths.stopSound);
  const header = sound.subarray(0, 3).toString('ascii');
  assert.ok(header === 'ID3' || sound[0] === 0xff, 'stop sound should be an mp3 file');
});

test('main page exposes required DOM hooks', async () => {
  const html = await readText(paths.mainHtml);
  for (const id of [
    'themeToggle',
    'totalCars',
    'gamePicker',
    'gamePickerToggle',
    'gamePickerMenu',
    'stage',
    'caseWindow',
    'caseTrack',
    'spinButton',
    'history',
    'statPi',
    'statRarity',
    'statValue',
    'statSource',
  ]) {
    assertContains(html, `id="${id}"`, paths.mainHtml);
  }
  assertContains(html, 'data/fh4-cars.js', paths.mainHtml);
  assertContains(html, 'data/fh5-cars.js', paths.mainHtml);
  assertContains(html, 'data/fh6-cars.js', paths.mainHtml);
  assertContains(html, 'assets/js/spin-stats.js', paths.mainHtml);
  assertContains(html, 'assets/css/forza-wheel.css', paths.mainHtml);
  assertContains(html, 'assets/js/forza-wheel.js', paths.mainHtml);
  assertContains(html, 'Forza Horizon 5', paths.mainHtml);
  assertContains(html, 'Forza Horizon 6', paths.mainHtml);
  assertContains(html, 'data-game="fh5"', paths.mainHtml);
  assertContains(html, 'data-game="fh6"', paths.mainHtml);
});

test('wheel page UI is English-only', async () => {
  const html = await readText(paths.mainHtml);
  const js = await readText(paths.appJs);
  assert.ok(!/[А-Яа-яЁё]/.test(html), 'main wheel HTML should not contain Cyrillic UI text');
  assert.ok(!/[А-Яа-яЁё]/.test(js), 'wheel controller should not contain Cyrillic UI text');
});

test('home page exposes dynamic local stats hooks', async () => {
  const html = await readText(paths.homeHtml);
  assertContains(html, 'id="homeTotalSpins"', 'home page');
  assertContains(html, 'id="homeCollectionProgress"', 'home page');
  assertContains(html, 'id="homeCreditsWon"', 'home page');
  assertContains(html, 'id="homeUniquePrizes"', 'home page');
  assertContains(html, 'data/fh4-cars.js', 'home page');
  assertContains(html, 'data/fh5-cars.js', 'home page');
  assertContains(html, 'data/fh6-cars.js', 'home page');
  assertContains(html, 'assets/js/spin-stats.js', 'home page');
  assertContains(html, 'assets/js/home.js', 'home page');

  const homeJs = await readText(paths.homeJs);
  assertContains(homeJs, 'ForzaSpinStats', 'home stats controller');
  assertContains(homeJs, 'FH4_CARS', 'home stats controller');
  assertContains(homeJs, 'FH5_CARS', 'home stats controller');
  assertContains(homeJs, 'FH6_CARS', 'home stats controller');
  assertContains(homeJs, 'getWonPrizeCount', 'home stats controller');
  assertContains(homeJs, 'homeTotalSpins', 'home stats controller');
  assertContains(homeJs, 'homeCollectionProgress', 'home stats controller');
  assertContains(homeJs, 'homeCreditsWon', 'home stats controller');
  assertContains(homeJs, 'homeUniquePrizes', 'home stats controller');
});

test('spin stats persist local spin count and parsed car values', async () => {
  const { api } = await loadSpinStatsApi();
  assert.equal(api.parseCreditValue('43,500 CR'), 43500);
  assert.equal(api.parseCreditValue('1,200,000 CR'), 1200000);
  assert.equal(api.parseCreditValue('∞ CR'), 0);
  assert.equal(api.parseCreditValue("Rival's choice"), 0);

  assert.deepEqual(plainObject(api.read()), { totalSpins: 0, creditsWon: 0, wonPrizeKeys: [] });
  assert.deepEqual(
    plainObject(api.recordSpin({ name: 'Abarth 124 Spider 2017', year: '2017', game: 'fh5', value: '43,500 CR' })),
    { totalSpins: 1, creditsWon: 43500, wonPrizeKeys: ['car:fh5:Abarth 124 Spider 2017:2017'] },
  );
  assert.deepEqual(
    plainObject(api.recordSpin({ name: 'Abarth 124 Spider 2017', year: '2017', game: 'fh5', value: '43,500 CR' })),
    { totalSpins: 2, creditsWon: 87000, wonPrizeKeys: ['car:fh5:Abarth 124 Spider 2017:2017'] },
  );
  assert.deepEqual(
    plainObject(api.recordSpin({ name: 'Zenvo TSR-S 2019', year: '2019', game: 'fh4', value: '1,200,000 CR' })),
    {
      totalSpins: 3,
      creditsWon: 1287000,
      wonPrizeKeys: ['car:fh5:Abarth 124 Spider 2017:2017', 'car:fh4:Zenvo TSR-S 2019:2019'],
    },
  );
  assert.deepEqual(
    plainObject(api.recordSpin({ name: 'Absolute Ultimate Chance', kind: 'ultimate-chance', game: 'fh4', value: '∞ CR' })),
    {
      totalSpins: 4,
      creditsWon: 1287000,
      wonPrizeKeys: [
        'car:fh5:Abarth 124 Spider 2017:2017',
        'car:fh4:Zenvo TSR-S 2019:2019',
      ],
    },
  );
  assert.equal(api.formatNumber(1243500), '1,243,500');
  assert.equal(api.formatCredits(1243500), '1.2M');
  assert.equal(api.formatCollectionProgress(1, 2273), '<0.1%');
  assert.equal(api.formatCollectionProgress(2273, 2273), '100%');
});

test('home unique prizes count comes from all regular browser data sets', async () => {
  const { api } = await loadSpinStatsApi();
  const allCars = [
    ...(await readCarsJson()),
    ...JSON.parse(await readText(paths.fh5CarsJson)),
    ...JSON.parse(await readText(paths.fh6CarsJson)),
  ];
  assert.equal(api.getPrizeCount(await readCarsJson()), 753);
  assert.equal(api.getPrizeCount(allCars), 2273);
  assert.equal(
    api.getWonPrizeCount(['car:fh4:0753-zenvo-tsr-s-2019.png', 'car:0752-zenvo-st1-2016.png', 'ultimate-chance:Absolute Ultimate Chance'], allCars),
    2,
  );
});

test('theme toggle keeps dark as default and supports saved light theme', async () => {
  const css = await readText(paths.appCss);
  const js = await readText(paths.appJs);
  assertContains(css, 'body.theme-light', 'app CSS');
  assertContains(js, 'forzaWheelTheme', 'theme persistence key');
  assertContains(js, "setTheme('dark')", 'dark fallback');
  assertContains(js, "themeToggle.checked ? 'light' : 'dark'", 'theme toggle handler');
});

test('mobile wheel layout keeps reel cells tall and readable', async () => {
  const css = await readText(paths.appCss);
  const mobile = extractCssBlock(css, '@media (max-width: 880px)');
  const phone = extractCssBlock(css, '@media (max-width: 520px)');

  const mobileStage = extractCssBlock(mobile, '.stage');
  assertContains(mobileStage, 'min-height: 820px;', 'mobile stage');

  const mobileCard = extractCssBlock(mobile, '.car-card');
  assertContains(mobileCard, 'min-height: 640px;', 'mobile card');
  assertContains(mobileCard, 'grid-template-rows: 640px;', 'mobile card');

  const mobileWindow = extractCssBlock(mobile, '.case-window');
  assertContains(mobileWindow, 'height: 640px;', 'mobile reel window');

  const mobileSelector = extractCssBlock(mobile, '.case-selector');
  assertContains(mobileSelector, 'height: 148px;', 'mobile selector frame');

  const mobileItem = extractCssBlock(mobile, '.case-item');
  assertContains(mobileItem, 'flex-basis: 132px;', 'mobile reel item');
  assertContains(mobileItem, 'min-height: 132px;', 'mobile reel item');
  assertContains(mobileItem, 'grid-template-columns: minmax(86px, 32%) minmax(0, 1fr);', 'mobile reel item');
  assertContains(mobileItem, 'grid-template-rows: auto auto;', 'mobile reel item');

  const mobileImage = extractCssBlock(mobile, '.case-item img,\n  .case-item-placeholder');
  assertContains(mobileImage, 'grid-row: 1 / 3;', 'mobile reel image');
  assertContains(mobileImage, 'max-width: 112px;', 'mobile reel image');
  assertContains(mobileImage, 'height: 76px;', 'mobile reel image');

  const mobileName = extractCssBlock(mobile, '.case-item-name');
  assertContains(mobileName, '-webkit-line-clamp: 3;', 'mobile car name');
  assertContains(mobileName, 'line-height: 1.12;', 'mobile car name');

  const mobilePi = extractCssBlock(mobile, '.case-item-pi');
  assertContains(mobilePi, 'max-width: 100%;', 'mobile PI badge');
  assertContains(mobilePi, 'overflow: hidden;', 'mobile PI badge');
  assertContains(mobilePi, 'text-overflow: ellipsis;', 'mobile PI badge');

  const phoneStage = extractCssBlock(phone, '.stage');
  assertContains(phoneStage, 'min-height: 880px;', 'phone stage');

  const phoneCard = extractCssBlock(phone, '.car-card');
  assertContains(phoneCard, 'min-height: 700px;', 'phone card');
  assertContains(phoneCard, 'grid-template-rows: 700px;', 'phone card');

  const phoneWindow = extractCssBlock(phone, '.case-window');
  assertContains(phoneWindow, 'height: 700px;', 'phone reel window');

  const phoneSelector = extractCssBlock(phone, '.case-selector');
  assertContains(phoneSelector, 'height: 172px;', 'phone selector frame');

  const phoneItem = extractCssBlock(phone, '.case-item');
  assertContains(phoneItem, 'flex-basis: 156px;', 'phone reel item');
  assertContains(phoneItem, 'min-height: 156px;', 'phone reel item');

  const phoneName = extractCssBlock(phone, '.case-item-name');
  assertContains(phoneName, 'overflow-wrap: anywhere;', 'phone car name');
  assertContains(phoneName, '-webkit-line-clamp: 4;', 'phone car name');
});

test('wheel startup behavior is protected', async () => {
  const js = await readText(paths.appJs);
  assertContains(js, 'const spinLength = 96;', 'spin length');
  assertContains(js, 'const gameDatasets = {', 'game datasets');
  assertContains(js, 'function setGame(gameId)', 'game switcher');
  assertContains(js, 'function resetWheelForCurrentGame()', 'game switch wheel reset');
  assertContains(js, 'const spinIntroCurveMs = 420;', 'spin intro curve');
  assertContains(js, 'const spinSettleCurveMs = 460;', 'spin settle curve');
  assertContains(js, 'const spinOvershootItems = 0.24;', 'spin overshoot distance');
  assertContains(js, 'const resultFlashLeadMs = 300;', 'result flash timing');
  assertContains(js, 'const spinStartDelayMs = 800;', 'stable visual spin delay');
  assertContains(js, 'const spinSoundLeadMs = 380;', 'sound lead before visual spin');
  assertContains(js, 'const stopSoundOffsetMs = -800;', 'stop sound offset control');
  assertContains(js, 'const initialIndex = Math.max(0, initialSequence.length - 1 - startOffsetFromEnd);', 'initial offset');
  assertContains(js, 'const winnerOffsetFromStart = 7;', 'reversed spin target offset');
  assertContains(js, 'const startTranslate = currentStartTranslate;', 'repeat spin start alignment');
  assertContains(js, 'const introTranslate = startTranslate - (direction * itemStep * spinIntroCurveItems);', 'intro counter-move');
  assertContains(js, 'const overshootTranslate = targetTranslate + (direction * itemStep * spinOvershootItems);', 'winner overshoot');
  assertContains(js, 'const soundDelayMs = Math.max(0, spinStartDelayMs - spinSoundLeadMs);', 'sound timing independent from visual delay');
  assertContains(js, 'await wait(spinStartDelayMs);', 'visual spin delay is stable');
  assertContains(js, 'scheduleStopSound(Math.max(0, spinDurationMs + stopSoundOffsetMs));', 'stop sound is scheduled around final stop');
  assertContains(js, "await animateTrackTo(overshootTranslate, mainSpinDurationMs, 'cubic-bezier(.08, .78, .08, 1)');", 'fast main spin easing');
  assertContains(js, 'await animateTrackTo(targetTranslate, spinSettleCurveMs', 'settle back to winner');
  assertContains(js, "showCar(winner, 'result', false);", 'result render preserves active flash');
  assertContains(js, 'if (!isFirstSpin) {', 'first spin skips reload block');
  assertContains(js, 'clearCurrentResult(false);', 'initial result panel clear');
});

test('wheel records completed spins in local home stats', async () => {
  const js = await readText(paths.appJs);
  assertContains(js, 'function recordSpinStats(car)', 'spin stats recorder');
  assertContains(js, 'ForzaSpinStats?.recordSpin(car)', 'spin stats recorder');
  assertContains(js, 'recordSpinStats(winner);', 'spin completion flow');
});

test('main page does not force Rival choice', async () => {
  const main = await readText(paths.mainHtml);
  const js = await readText(paths.appJs);

  assert.ok(!main.includes('data-force-rivals-choice="true"'), 'main page should not force Rival choice');
  assertContains(js, 'const forceRivalsChoice = document.body.dataset.forceRivalsChoice', 'shared rival flag');
  assertContains(js, 'function placeRivalsChoice(sequence, targetIndex)', 'rivals placement helper');
  assertContains(js, 'placeRivalsChoice(currentSequence, currentWinnerIndex);', 'initial rival placement');
});

test('split assets contain the wheel styling and controller', async () => {
  const css = await readText(paths.appCss);
  const js = await readText(paths.appJs);
  assertContains(css, 'Main wheel surface', 'CSS section comments');
  assertContains(css, '.case-selector', 'selector frame styles');
  assertContains(css, 'body.theme-light .case-selector', 'light selector inversion');
  assertContains(js, 'Main spin flow', 'JS section comments');
  assertContains(js, 'assets/sounds/wheel-spin-custom.wav', 'spin sound path');
  assertContains(js, 'assets/sounds/wheel_stop.mp3', 'stop sound path');
});
