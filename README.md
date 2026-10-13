# THE NIGHT SHIFT

An original, browser-based haunted trivia party game for 2–6 players. Everyone joins from a phone or laptop with a five-character room code. No accounts or downloads.

## Play

1. Open the deployed link on a laptop or phone.
2. One person selects **Open the Hotel** and checks in with a name.
3. Share the room code with 1–5 other people.
4. Each guest enters the code, adds a name, and selects **Check In**.
5. The host starts the night when at least two guests are in the lobby.

There are five trivia rounds. A wrong answer sends that player to the Mirror Test, a timed three-mark memory challenge. Players start with three hearts; fail a test and lose one. Guests who survive the five rounds enter an eight-question exit run. The first guest to answer three correctly escapes.

## Hosting

This is a static site. It uses Supabase Realtime broadcast channels for live room state. The client connects to the configured Supabase project in `app.js` with its public publishable key. No database tables, sign-in, or service-role key are used. Deploy the project root to a static web host. Realtime must be enabled for the Supabase project. Keep this repo's `index.html`, `app.js`, `styles.css`, `cover.svg`, and `SOURCES.md` together.

Room codes identify public Realtime topics. Anyone who knows a room code can connect to it; use the room for a private group, and don't reuse codes or enter sensitive information.

## Files

- `index.html` — entry screen and app shell
- `app.js` — rooms, synchronized game state, and the verified trivia bank
- `styles.css` — responsive visuals and controls
- `cover.svg` — original cover art for a submission card
- `SOURCES.md` — answer checks and design references

