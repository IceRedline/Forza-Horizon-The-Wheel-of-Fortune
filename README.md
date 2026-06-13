# Forza Horizon The Wheel of Fortune

Interactive Forza Horizon 4 wheel of fortune with local car data and local car images.

<img width="3456" height="1986" alt="Снимок экрана — 2026-06-11 в 16 51 04" src="https://github.com/user-attachments/assets/e64872e2-f85d-42fa-8b33-2b12b6470633" />
<img width="3456" height="1984" alt="Снимок экрана — 2026-06-11 в 16 51 27" src="https://github.com/user-attachments/assets/8fb8afa8-c8bf-4776-a1cf-7852c6464a4b" />


## Files

- `forza-wheel.html` - main vertical wheel.
- `Forza Wheel Old.html` - previous horizontal version.
- `assets/css/forza-wheel.css` - shared layout, theme, and animation styles.
- `assets/js/forza-wheel.js` - shared wheel controller and UI behavior.
- `data/fh4-cars.json` - readable Forza Horizon 4 car database.
- `data/fh4-cars.js` - browser-ready Forza Horizon 4 database used by the HTML pages.
- `assets/cars/fh4/`, `assets/cars/fh5/`, `assets/cars/fh6/` - local car images by game.
- `assets/sounds/wheel-spin.wav` - prebuilt wheel spin sound.
- `tests/regression.test.mjs` - Node.js regression checks for the page contracts.

## Run

Open `forza-wheel.html` in a browser.

If the browser blocks local assets, run a local server from this folder:

```bash
python3 -m http.server 8766 --bind 127.0.0.1
```

Then open:

```text
http://127.0.0.1:8766/forza-wheel.html
```

## Tests

The tests use Node.js built-in test runner and do not require npm packages:

```bash
npm test
```

## Special outcomes

The wheel includes 753 cars plus 2 special outcomes:

- `Absolute Ultimate Chance`
- `Rival's choice`
