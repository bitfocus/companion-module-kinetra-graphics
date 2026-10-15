## Kinetra

Control [Kinetra](https://kinetra.live) graphics from Companion: take and clear graphics, change
their text, run cues and step sources, with red (on air) and green (Preview) tally on your buttons.

### Setup

1. In Kinetra, open **Preferences › Network & API › Control API**, turn it on and click
   **Copy token**. A project must be open: Kinetra's server runs only then.
2. In Companion, add a **Kinetra** connection and paste the token.
3. Host and port: `127.0.0.1` and `7770` when Companion runs on the same computer (Kinetra
   Canary: `7771`). From another computer, turn on "Allow access from other devices on the
   network" in Kinetra and use the address Kinetra shows under Control API.
