# Forza Horizon The Wheel of Fortune

Interactive Forza Horizon 4 wheel of fortune with local car data and local car images.

<img width="3290" height="1966" alt="Снимок экрана — 2026-06-10 в 14 09 31" src="https://github.com/user-attachments/assets/99cd19a8-b34f-494a-8f2a-3ef2588140cc" />

## Files

- `forza-wheel.html` - main vertical wheel.
- `forza-wheel-ultimate-test.html` - test version where `Rival's choice` always lands in the selector.
- `Forza Wheel Old.html` - previous horizontal version.
- `data/cars.json` - readable car database.
- `data/cars.js` - browser-ready database used by the HTML pages.
- `assets/cars/` - local car images.
- `assets/sounds/wheel-spin.wav` - prebuilt wheel spin sound.

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

## Special outcomes

The wheel includes 753 cars plus 2 special outcomes:

- `Absolute Ultimate Chance`
- `Rival's choice`
