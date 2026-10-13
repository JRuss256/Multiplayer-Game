# Playtest THE NIGHT SHIFT

## Start a local copy

1. Install Node.js if it is not already installed.
2. Open a terminal in this folder and run `node serve.mjs`.
3. Open `http://localhost:4173` in your browser.
4. Leave the terminal running until the game ends.

For a two-device session, connect both devices to the same Wi-Fi and open the host computer's local network address on the second device, using port `4173`. The host computer may ask whether to allow the local server through its firewall.

## Try the whole flow

- Open a room on one device; check in a player name.
- Join with the five-character code from a second device.
- Start with two or more players. A room supports six.
- Read the shared tutorial, then use **Begin the First Question**. Try **Copy Invite** from the host lobby.
- Turn the optional generated ambience and sound cues on and off from the top bar.
- Try one correct and one incorrect answer.
- Answer early and confirm the 18-second question countdown still reaches zero before the result appears.
- In the Mirror Test, watch the three marks, then repeat them using the four large buttons.
- Continue through five questions and the exit run.
- Refresh one guest during a round and confirm the player returns to the room.
- Try a made-up room code to see the recovery message.

Every device needs an internet connection for Supabase Realtime and the question-source links. The room host's browser should remain open while the game is in progress.
