# PageGroove

PageGroove is a Chrome extension that turns the structure of the current web page into a deterministic synth loop. The same page will always map to the same groove, key, tempo, and density profile.

## V1 scope

- Deterministic mapping from page structure to music
- Local-only playback using the Web Audio API
- Current active tab drives the soundtrack
- Popup control to start or stop playback
- Lightweight track summary in the popup

## How it works

1. `content.js` reads page metrics such as heading count, link count, image count, DOM depth, node count, and a stable hash of the page source.
2. `music-map.js` converts those metrics into a reproducible track profile and note pattern.
3. `offscreen.js` runs an offscreen audio engine and plays the generated loop so playback can continue while you browse.
4. `background.js` keeps the active tab and playback state in sync.

## Load it in Chrome

1. Open `chrome://extensions`
2. Turn on Developer mode
3. Click Load unpacked
4. Select this folder

## Notes

- This version only supports regular `http` and `https` pages.
- Some sites with very dynamic DOMs may cause the groove to refresh as the page changes.
- Everything stays on-device. No page content is sent anywhere.
