# companion-module-kinetra-graphics

[Bitfocus Companion](https://bitfocus.io/companion) module for [Kinetra](https://kinetra.live), the
desktop app for live broadcast graphics. It talks to Kinetra's local Control API over one
WebSocket: take and clear graphics, change their text, run cues, step sources, take Studio
Preview, with Program and Preview tally as feedbacks and live values as variables.

Users: see [companion/HELP.md](./companion/HELP.md). License: [MIT](./LICENSE).

## The protocol

Kinetra documents the Control API in its repository (`docs/CONTROL_API.md`) and generates
`docs/control-api.fixture.json` from its code: the protocol's constants and a real example of
every message and command. `test/fixture/control-api.fixture.json` is a copy of it at a recorded
commit (`test/fixture/source.json`); the tests check the module against it, and CI checks the copy
against Kinetra's with `node scripts/sync-fixture.mjs --check`. Update it with
`node scripts/sync-fixture.mjs <commit>` (or `--from <a Kinetra checkout>`).

## Developing

Needs Node 26 (Node 24 works for development) and yarn 4 (`corepack enable` provides it).

```sh
yarn            # install
yarn build      # compile to dist/ (enough for Companion to load the module)
yarn dev        # compile on change
yarn test       # unit and protocol tests (vitest), against the fixture and a mock Kinetra
yarn lint
yarn package    # the .tgz Companion installs
KINETRA_TOKEN=kt_… yarn live-check   # after yarn build: connect to a running Kinetra (changes nothing)
```

Load it in Companion from a developer modules folder (Companion › Settings › Developer).

## Layout

- `src/main.ts`: the Companion instance. Keeps Companion in step with Kinetra:
  - definitions are rebuilt only when Kinetra's structure changes (names, order, field keys), and
    kept while Kinetra is away
  - only changed variable values are sent
  - only the feedbacks of the touched parts are re-checked
  - one 1 s tick runs only while a timer runs or media plays
- `src/kinetra/`: the protocol, free of Companion types:
  - `client.ts`: the connection, its retry rules and commands
  - `state.ts`: the snapshot and diffs
  - `model.ts`: choices, the structure key, variable ids
  - `display.ts`: timers and media as Kinetra shows them
- `src/actions.ts`, `feedbacks.ts`, `variables.ts`, `presets.ts`: definitions built from Kinetra's
  state, through the small `Host` interface (`src/host.ts`), so tests can drive them.
- `src/status.ts`: the connection's status in Companion's words.
- `test/`: tests, the fixture, a mock Kinetra server (`mock-kinetra.ts`) and a fake host.

## Testing

`yarn test` covers:

- the protocol against Kinetra's fixture: every command example is sent exactly by a module action
- the client against the mock Kinetra: every status and retry rule
- the definitions
- the instance with Companion stubbed

Before a release, also go through [TESTING.md](./TESTING.md) with Kinetra and Companion.
