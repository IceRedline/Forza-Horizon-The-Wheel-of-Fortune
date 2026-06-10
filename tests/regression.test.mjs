import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const paths = {
  mainHtml: join(root, 'forza-wheel.html'),
  rivalsTestHtml: join(root, 'forza-wheel-ultimate-test.html'),
  appCss: join(root, 'assets', 'css', 'forza-wheel.css'),
  appJs: join(root, 'assets', 'js', 'forza-wheel.js'),
  carsJson: join(root, 'data', 'cars.json'),
  carsJs: join(root, 'data', 'cars.js'),
  carsDir: join(root, 'assets', 'cars'),
  spinSound: join(root, 'assets', 'sounds', 'wheel-spin.wav'),
};

async function readText(path) {
  return readFile(path, 'utf8');
}

async function readCarsJson() {
  return JSON.parse(await readText(paths.carsJson));
}

async function readCarsJs() {
  const source = (await readText(paths.carsJs)).trim();
  const prefix = 'window.FH4_CARS = ';
  assert.ok(source.startsWith(prefix), 'cars.js should expose window.FH4_CARS');
  assert.ok(source.endsWith(';'), 'cars.js should end with a semicolon');
  return JSON.parse(source.slice(prefix.length, -1));
}

function assertContains(source, needle, label) {
  assert.ok(source.includes(needle), `${label} should contain ${needle}`);
}

test('car database has expected size, specials, and browser mirror', async () => {
  const carsJson = await readCarsJson();
  const carsJs = await readCarsJs();
  assert.deepEqual(carsJs, carsJson, 'cars.js should match cars.json exactly');

  const specials = carsJson.filter((car) => car.kind);
  const regularCars = carsJson.filter((car) => !car.kind);
  assert.equal(regularCars.length, 753, 'regular car count should stay stable');
  assert.equal(specials.length, 2, 'special outcome count should stay stable');

  assert.deepEqual(
    specials.map((car) => car.name),
    ['Absolute Ultimate Chance', "Rival's choice"],
  );

  const absolute = specials.find((car) => car.kind === 'ultimate-chance');
  assert.equal(absolute.value, '∞ CR');
  assert.equal(absolute.source, 'Any car you want');
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

test('main and rivals pages expose required DOM hooks', async () => {
  for (const htmlPath of [paths.mainHtml, paths.rivalsTestHtml]) {
    const html = await readText(htmlPath);
    for (const id of [
      'themeToggle',
      'totalCars',
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
      assertContains(html, `id="${id}"`, htmlPath);
    }
    assertContains(html, 'data/cars.js', htmlPath);
    assertContains(html, 'assets/css/forza-wheel.css', htmlPath);
    assertContains(html, 'assets/js/forza-wheel.js', htmlPath);
  }
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
  assertContains(js, 'const initialIndex = Math.min(3, initialSequence.length - 1);', 'initial offset');
  assertContains(js, 'const startTranslate = currentStartTranslate;', 'repeat spin start alignment');
  assertContains(js, 'if (!isFirstSpin) {', 'first spin skips reload block');
  assertContains(js, 'clearCurrentResult(false);', 'initial result panel clear');
});

test('rivals test page forces Rival choice without changing the main page', async () => {
  const main = await readText(paths.mainHtml);
  const rivals = await readText(paths.rivalsTestHtml);
  const js = await readText(paths.appJs);

  assert.ok(!main.includes('data-force-rivals-choice="true"'), 'main page should not force Rival choice');
  assertContains(rivals, 'data-force-rivals-choice="true"', 'rivals test page');
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
