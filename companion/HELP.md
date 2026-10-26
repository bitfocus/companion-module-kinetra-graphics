## Kinetra

Control [Kinetra](https://kinetra.live) graphics from Companion: take and clear graphics, change
their text, run cues, step through sources and take Studio Preview, with red (on air) and green
(Preview) tally on your buttons.

### Kinetra version

The module needs Kinetra's Control API, which is in **Kinetra Canary 0.1.0-canary.20261016.17 or
later** (download it at [kinetra.live](https://kinetra.live), under Canary builds). It isn't in a
stable Kinetra release yet; once it is, any stable version from then on works too.

### Setup

1. In Kinetra, open **Preferences › Network & API › Control API**, turn it on and click
   **Copy token**. A project must be open: Kinetra's server runs only then.
2. In Companion, add a **Kinetra** connection and paste the token.
3. **Host** and **Port**: `127.0.0.1` and `7770` when Companion runs on the same computer
   (Kinetra Canary uses `7771`). From another computer: in Kinetra, turn on "Allow access from
   other devices on the network" (Preferences › Network & API › Server) and use the address shown
   under Control API, like `192.168.1.20:7770`.

When it's connected, the **Presets** tab has buttons for every graphic, cue and source in your
project.

### If it doesn't connect

| Companion says                                      | What to do                                                             |
| --------------------------------------------------- | ---------------------------------------------------------------------- |
| Waiting for Kinetra (is a project open?)            | Start Kinetra and open a project. Check the host and port.             |
| Wrong API token                                     | Copy the token again in Kinetra and paste it here.                     |
| The token was changed in Kinetra: paste the new one | Someone clicked New token… in Kinetra. Copy the new one.               |
| Turn on Control API in Kinetra…                     | Turn on the switch in Kinetra › Preferences › Network & API.           |
| Too many controllers are connected to Kinetra       | Kinetra takes 8 at once. Disconnect one in Kinetra's Preferences.      |
| Too many wrong tokens: wait a minute                | Paste the right token; it tries again after a minute.                  |
| Disconnected in Kinetra                             | Someone clicked Disconnect in Kinetra; it reconnects after 30 seconds. |
| Update the Kinetra module                           | Kinetra is newer than this module. Update the module in Companion.     |

### Actions

- **Take**, **Clear**, **Take / clear**: a graphic on or off air. In Studio mode they cue into
  Kinetra's Preview instead, like Kinetra's own buttons; **Studio take** puts Preview on air.
- **Update (apply staged changes)**: with "On take" live editing, applies the changes waiting for
  the next take.
- **Set text**: one text field of a graphic (the text may use Companion variables), and
  optionally takes it. **Set fields (JSON)** sets several at once:
  `{"name": "Ingrid Vale", "title": "Host"}`.
- **Run cue**, **GO (next cue)**: Kinetra's cues; GO runs the one after the last cue run.
- **Clear screen**, **Clear all**, **PANIC** (everything off at once, no animation).
- **Source: next / previous row**.
- **Media**: play, pause, stop, restart or go to a time.
- **Opacity / slider**: opacity, or one of the graphic's sliders, from 0 to 100 %.
- **Timer**: start, pause or reset a graphic's timer.
- **Automation off**: while it's off, nothing goes on air by itself.
- **Run flow (API call)**: runs a Kinetra flow whose trigger is API call, with an optional value.

Buttons remember Kinetra's items by their ids, so renaming a graphic or cue in Kinetra doesn't
break them. If something was deleted, the button logs Kinetra's answer and does nothing.

### Feedbacks

Graphic on air (red), in Preview (green), has changes for the next take, not loaded on every
output; cue running (red), cue is next (green); media playing; Studio mode on; Automation off;
connected to Kinetra (invert it to dim buttons while Kinetra is away).

### Variables

With the connection named `kinetra` (use your connection's name):

- `$(kinetra:cue_next)`, `$(kinetra:cue_current)`: cue names
- `$(kinetra:project)`, `$(kinetra:connected)`, `$(kinetra:studio_mode)`, `$(kinetra:automation_off)`
- per graphic: `layer_<screen>_<graphic>_name` and `_onair`, and each text field as
  `field_<screen>_<graphic>_<field>`
- timers as Kinetra shows them, `timer_<screen>_<graphic>_<field>` (counting live), and media
  time left, `media_<screen>_<graphic>_remaining`
- per source: `source_<id>_label` (the current row), `source_<id>_index`, `source_<id>_count`

The ids come from Kinetra, so they don't change when you rename things. Companion's Variables
list shows each one with a readable name.
