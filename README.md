# THE NIGHT SHIFT

An original, browser-based haunted trivia party game for 2–6 players. Everyone joins from a phone or laptop with a five-character room code. No accounts or downloads.

Live game: [Play THE NIGHT SHIFT](https://jruss256.github.io/Multiplayer-Game/).

## Play

1. Open the deployed link on a laptop or phone.
2. One person selects **Open the Hotel** and checks in with a name.
3. Share the room code with 1–5 other people.
4. Each guest enters the code, adds a name, and selects **Check In**.
5. The host starts the night when at least two guests are in the lobby, reviews the short shared tutorial, then starts the first question.

There are five trivia rounds. Each question stays open for the full 18-second countdown, even after everyone has answered. A wrong answer sends that player to the Mirror Test, a 15-second, three-mark memory challenge. Watch the marks, then tap the labeled symbols in the same order; your third tap submits. Players start with three hearts; fail a test and lose one. Guests who survive the five rounds enter an eight-question exit run. In this run, players can change their selection until they press **Lock In Answer**. The question resolves as soon as every living guest locks in, or when the 18-second timer ends. The first guest to answer three correctly escapes; if nobody reaches three, the top score wins after question eight.

Sound is off until a player turns it on.

## Hosting

This is a static site. It uses Supabase Realtime broadcast channels for live room state. The client connects to the configured Supabase project in `app.js` with its public publishable key. No database tables, sign-in, or service-role key are used. Deploy the project root to a static web host. Realtime must be enabled for the Supabase project. Keep this repo's `index.html`, `app.js`, `styles.css`, `cover.svg`, and `SOURCES.md` together.

Room codes identify public Realtime topics. Anyone who knows a code can connect, watch, or interfere with that room; a code is an invite, not authentication. This is for casual play, not private or competitive games. Don't reuse codes or enter sensitive information. The project has no service-role key or other server secret in its public files. The browser publishable key is public by design.

## Files

- `index.html` — entry screen and app shell
- `app.js` — rooms, synchronized game state, and the verified trivia bank
- `styles.css` — responsive visuals and controls
- `cover.svg` — original cover art for a submission card
- `SOURCES.md` — answer checks and design references

