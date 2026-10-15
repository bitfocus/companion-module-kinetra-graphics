# Testing with Kinetra and Companion

The automated tests (`yarn test`) use Kinetra's fixture and a mock server. Before a release, go
through this with a real Kinetra (stable or Canary) and Companion 5.x, ideally with a Stream Deck
as well as the emulator.

## Setup

1. `yarn build`, then in Companion › Settings › Developer, point the developer modules folder at
   the folder that holds this repository and enable it. Companion lists "Kinetra (dev)".
2. In Kinetra: open a project with a few graphics on two screens, a cue or two, a text source, a
   timer (Scoreboard) and a media layer. Preferences › Network & API › Control API: turn it on,
   **Copy token**.
3. In Companion: add the Kinetra connection, paste the token. Status: OK. Kinetra's Preferences
   lists `companion-module-kinetra-graphics/<version>` under Connected.

## Checks

**Connection**

- [ ] Wrong token → "Wrong API token"; the right one → OK.
- [ ] Kinetra › New token… → "The token was changed in Kinetra"; paste the new one → OK.
- [ ] Control API off → "Turn on Control API…"; on again → OK within ~8 s.
- [ ] Disconnect in Kinetra's Preferences → "Disconnected in Kinetra", back after ~30 s.
- [ ] Close the project → "Waiting for Kinetra"; open it → OK. Open another project → OK, and the
      presets show that project's graphics.
- [ ] Quit Kinetra and start it again → back without touching Companion.
- [ ] From another computer (LAN access on, the network address) → OK.

**Presets and tally**

- [ ] Presets › Graphics: one button per graphic, by screen. Drag a few onto a page.
- [ ] Press one: on air in Kinetra, the button turns red; press again: off.
- [ ] Take it from Kinetra (Control, a hotkey, OSC) → the button follows.
- [ ] Studio mode on in Kinetra: the button cues into Preview (green); **Studio take** puts it on
      air (red).
- [ ] Cues: Run cue and GO; the next cue is green, a running one red; GO's text shows the next cue.
- [ ] Sources: Next / Previous step the row; the button shows the current row.
- [ ] Timers: Start / Pause / Reset; the button counts like the graphic on air, second for second.
- [ ] Media: play / pause; time left counts down.
- [ ] Clear all, PANIC, Automation off (amber while off).

**Actions with options**

- [ ] Set text with a Companion variable in the text, Take it too → on air with that text.
- [ ] Set fields (JSON) with two fields → both change; invalid JSON → a warning in the log, nothing
      sent.
- [ ] Opacity / slider at 50 % → Kinetra shows half opacity.
- [ ] Run flow (API call) with a value → the flow runs with it.
- [ ] Rename a graphic in Kinetra → its button keeps working; the dropdowns show the new name.
- [ ] Delete a graphic → its button logs Kinetra's answer and does nothing.

**Idle**

- [ ] Nothing running: Companion's log stays quiet; Kinetra's Preferences still lists the module.
