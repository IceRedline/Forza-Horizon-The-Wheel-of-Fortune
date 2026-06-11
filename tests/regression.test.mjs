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
  spinSound: join(root, 'assets', 'sounds', 'wheel-spin.wav'),
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
      count: 902,
      sample: 'Abarth 124 Spider 2017',
    },
    {
      jsonPath: paths.fh6CarsJson,
      jsPath: paths.fh6CarsJs,
      globalName: 'FH6_CARS',
      game: 'fh6',
      count: 618,
      sample: 'Abarth 695 Biposto 2016',
    },
  ];

  for (const entry of cases) {
    const carsJson = JSON.parse(await readText(entry.jsonPath));
    const carsJs = await readBrowserCarsJs(entry.jsPath, entry.globalName);
    assert.deepEqual(carsJs, carsJson, `${entry.game} browser mirror should match JSON exactly`);
    assert.equal(carsJson.length, entry.count, `${entry.game} parsed car count should stay stable`);
    assert.ok(carsJson.every((car) => car.game === entry.game), `${entry.game} cars should be game-marked`);
    assert.ok(carsJson.some((car) => car.name === entry.sample), `${entry.game} should include ${entry.sample}`);
    assert.ok(carsJson.every((car) => car.name && car.year && car.value && car.piClass && car.pi), `${entry.game} cars should have usable wheel fields`);
    assert.equal(new Set(carsJson.map((car) => `${car.name}:${car.year}`)).size, carsJson.length, `${entry.game} cars should be unique`);
  }
});

test('regular cars point at local image files', async () => {
  const regularCars = (await readCarsJson()).filter((car) => !car.kind);
  for (const car of regularCars) {
    assert.ok(car.image.startsWith('assets/cars/'), `${car.name} should use a local car image`);
    assert.ok(car.imageFile, `${car.name} should have imageFile`);
    assert.ok(
      existsSync(join(paths.carsDir, car.imageFile)),
      `${car.name} image is missing: ${car.imageFile}`,
    );
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
  assert.ok(duration > 15 && duration < 16, `spin sound duration should be about 15 seconds, got ${duration}`);
});

test('main page exposes required DOM hooks', async () => {
  const html = await readText(paths.mainHtml);
  for (const id of [
    'themeToggle',
    'totalCars',
    'gamePicker',
    'gamePickerToggle',
    'gamePickerMenu',
    'gamePickerTooltip',
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
  assertContains(html, 'assets/js/spin-stats.js', paths.mainHtml);
  assertContains(html, 'assets/css/forza-wheel.css', paths.mainHtml);
  assertContains(html, 'assets/js/forza-wheel.js', paths.mainHtml);
  assertContains(html, 'Forza Horizon 5', paths.mainHtml);
  assertContains(html, 'Forza Horizon 6', paths.mainHtml);
  assertContains(html, 'Coming soon', paths.mainHtml);
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
  assertContains(html, 'assets/js/spin-stats.js', 'home page');
  assertContains(html, 'assets/js/home.js', 'home page');

  const homeJs = await readText(paths.homeJs);
  assertContains(homeJs, 'ForzaSpinStats', 'home stats controller');
  assertContains(homeJs, 'FH4_CARS', 'home stats controller');
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
    plainObject(api.recordSpin({ name: 'Abarth 124 Spider 2017', year: '2017', value: '43,500 CR' })),
    { totalSpins: 1, creditsWon: 43500, wonPrizeKeys: ['car:Abarth 124 Spider 2017:2017'] },
  );
  assert.deepEqual(
    plainObject(api.recordSpin({ name: 'Abarth 124 Spider 2017', year: '2017', value: '43,500 CR' })),
    { totalSpins: 2, creditsWon: 87000, wonPrizeKeys: ['car:Abarth 124 Spider 2017:2017'] },
  );
  assert.deepEqual(
    plainObject(api.recordSpin({ name: 'Zenvo TSR-S 2019', year: '2019', value: '1,200,000 CR' })),
    {
      totalSpins: 3,
      creditsWon: 1287000,
      wonPrizeKeys: ['car:Abarth 124 Spider 2017:2017', 'car:Zenvo TSR-S 2019:2019'],
    },
  );
  assert.deepEqual(
    plainObject(api.recordSpin({ name: 'Absolute Ultimate Chance', kind: 'ultimate-chance', value: '∞ CR' })),
    {
      totalSpins: 4,
      creditsWon: 1287000,
      wonPrizeKeys: [
        'car:Abarth 124 Spider 2017:2017',
        'car:Zenvo TSR-S 2019:2019',
        'ultimate-chance:Absolute Ultimate Chance',
      ],
    },
  );
  assert.equal(api.formatNumber(1243500), '1,243,500');
  assert.equal(api.formatCredits(1243500), '1.2M');
  assert.equal(api.formatCollectionProgress(1, 755), '0.1%');
  assert.equal(api.formatCollectionProgress(755, 755), '100%');
});

test('home unique prizes count comes from the browser data set', async () => {
  const { api } = await loadSpinStatsApi();
  const cars = await readCarsJson();
  assert.equal(api.getPrizeCount(cars), 755);
});

test('theme toggle keeps dark as default and supports saved light theme', async () => {
  const css = await readText(paths.appCss);
  const js = await readText(paths.appJs);
  assertContains(css, 'body.theme-light', 'app CSS');
  assertContains(js, 'forzaWheelTheme', 'theme persistence key');
  assertContains(js, "setTheme('dark')", 'dark fallback');
  assertContains(js, "themeToggle.checked ? 'light' : 'dark'", 'theme toggle handler');
});

test('wheel startup behavior is protected', async () => {
  const js = await readText(paths.appJs);
  assertContains(js, 'const spinLength = 96;', 'spin length');
  assertContains(js, 'const spinIntroCurveMs = 420;', 'spin intro curve');
  assertContains(js, 'const spinSettleCurveMs = 460;', 'spin settle curve');
  assertContains(js, 'const spinOvershootItems = 0.24;', 'spin overshoot distance');
  assertContains(js, 'const initialIndex = Math.max(0, initialSequence.length - 1 - startOffsetFromEnd);', 'initial offset');
  assertContains(js, 'const winnerOffsetFromStart = 7;', 'reversed spin target offset');
  assertContains(js, 'const startTranslate = currentStartTranslate;', 'repeat spin start alignment');
  assertContains(js, 'const introTranslate = startTranslate - (direction * itemStep * spinIntroCurveItems);', 'intro counter-move');
  assertContains(js, 'const overshootTranslate = targetTranslate + (direction * itemStep * spinOvershootItems);', 'winner overshoot');
  assertContains(js, 'const soundStart = wait(spinIntroCurveMs).then(playSpinSound);', 'sound delayed by intro curve');
  assertContains(js, "await animateTrackTo(overshootTranslate, mainSpinDurationMs, 'cubic-bezier(.08, .78, .08, 1)');", 'fast main spin easing');
  assertContains(js, 'await animateTrackTo(targetTranslate, spinSettleCurveMs', 'settle back to winner');
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
  assertContains(js, 'assets/sounds/wheel-spin.wav', 'spin sound path');
});
