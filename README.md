# LumiCast 0.1.1

**v0.1.1 fixes the initial provider-request failure:** raw generation now passes the saved provider and model explicitly. Update LumiCast in Extensions, reload if needed, and retry your saved connection.

A new standalone Lumiverse Spindle extension. Paste a character appearance, translate it, review verified booru tags and exact source wording, edit the assembled Anima prompt, and copy it.

This release contains only the manual translator. It has no NPC detection, character storage, watchlists, invented appearances, attribute checklist, or connections to Set Points or Lumi Studio. Those projects were inspected as references and left unchanged.

## Install from GitHub

Requires **Lumiverse 1.2.5 or later**.

1. Open **Extensions** in Lumiverse and choose **Install from URL** in the add menu.
2. Enter `https://github.com/fidgetycarrot/lumicast`.
3. Grant `generation` and `cors_proxy`, then enable LumiCast.
4. Open **LumiCast** in the sidebar or command palette. Choose a saved generative connection under **Connection & tag services**, save, paste an appearance, and select **Translate**.

Prebuilt `dist/` files are committed for Lumiverse installation. If the tab does not appear after installation, reload Lumiverse or toggle the extension once.

## Alternative: install the local package

Requires **Lumiverse 1.2.5 or later**. Compatibility was checked against the current 1.2.5 source and SDK 0.6.40; older versions have not been verified.

1. Unzip `lumicast-0.1.1-install.zip`. It contains a folder named `lumicast` with `spindle.json` and `dist/` immediately inside it.
2. On the machine running your Lumiverse **server**, copy that folder into `<DATA_DIR>/extensions/`. The server's default DATA_DIR is `./data`, relative to where Lumiverse runs. For Docker, copy into the volume mounted as the server's data directory. Do not copy it into another extension's folder.
3. As the Lumiverse owner/admin, open **Extensions**, open its add menu, and choose **Import Local**. Enable LumiCast and grant `generation` and `cors_proxy`. If the tab does not appear, reload Lumiverse.
4. Open **LumiCast** in the sidebar drawer or find it in the command palette. Expand **Connection & tag services**, choose a saved generative connection, and save.
5. Paste an appearance and select **Translate**. Review the tags and source wording. Edit them as needed, rebuild, and copy the prompt.

The install ZIP contains prebuilt self-contained bundles and no package manager dependencies. Installation does not need a build step. Lumiverse supports the local layout above and normalizes it into its managed `lumicast/repo` directory. Keep the separate `lumicast/storage` directory intact when updating.

The repository and manifest use `https://github.com/fidgetycarrot/lumicast`. If forking, update `github` and `homepage` and keep the rebuilt `dist/` files committed.

## Connections and models

LumiCast uses Lumiverse's `connections.list/get` and `generate.raw`. It does not read, copy, or store your provider API key. Only the selected connection's configured model is used. Your chat connection and preset are not changed, and no chat history, character cards, persona data, or story files are read.

Create a dedicated translator connection in Lumiverse using OpenRouter, an OpenAI-compatible endpoint, or any supported generative text provider. Choose a fast text model that reliably follows JSON instructions; run the examples in `SMOKE-TESTS.md` before trusting a cheaper model. Switch to a stronger generative model if grounding or JSON validation fails. The selector shows actual saved provider/model IDs, rather than a stale hardcoded catalog or prices. Refresh it after changing Connections.

Jev, Decisions, embedding, reranking and moderation models are blocked by recognizable model names. This is a practical guard, not exhaustive capability discovery; a custom-named classifier will still fail the required text/JSON checks. No speculative Luna or Jev endpoint is used. Reasoning settings inherit your saved connection/host settings. Each translation normally makes **two generation calls**, with a 6,000 output-token limit per call. There are no automatic paid retries.

## Tag verification and Anima formatting

1. The generative model extracts visible traits with literal, continuous source quotes and at most 24 candidate tags. Unmentioned attributes are not requested or filled in.
2. The dictionary resolves active Danbooru aliases, checks exact live tags, rejects deprecated/nonexistent/artist/copyright/character entries, and fetches wiki definitions where available. Search lists real general/meta tags by prefix, without fetching images or posts.
3. A second generative review checks meaning against the quote and available definition. Popularity or existence is not treated as proof of Anima suitability. Ambiguous, exaggerated, metaphorical and contradictory tags should be dropped. A deterministic guard also removes incompatible global hair, eye and subject tags together.
4. Every extracted source quote remains in prose, including subtle proportions, asymmetry, texture, negation and character ownership. A lookup failure preserves prose and adds a notice. An invalid AI response leaves previous edits intact.
5. Canonical names use underscores in the editor. The assembled prompt uses lowercase tags with spaces, preserving `score_*` spelling if manually supplied. Tags and prose are separated by a blank line. No positive quality, safety, artist, lighting, pose, outfit or scene defaults are added.

This follows the [official Anima model guidance](https://huggingface.co/circlestone-labs/Anima/blob/main/README.md), which supports tags, natural language and combinations, and prefers Gelbooru spellings where they differ. Appropriate image quality or safety prefixes can be added intentionally in the editable final prompt for the Anima variant you use.

**Verification means dictionary existence plus an AI meaning review, not measured Anima image fidelity.** AI can still miss a trait or misinterpret a quote. Compare the output with your pasted description. Grounding checks reject fabricated source quotes and new unverified audit tags, but cannot prove semantic entailment or exhaustive extraction. Genuine uncertainty remains visible with source evidence; absent attributes are not an attribute-completion task.

## Gelbooru

Danbooru needs no credentials for these metadata calls. Gelbooru's live API returned HTTP 401 without credentials during development. Optionally enter your Gelbooru numeric user ID and API key, obtained from your own Gelbooru account API access settings.

The key is saved in **per-user extension storage on your Lumiverse server**, not browser storage. It is not encrypted by LumiCast; protect the server data directory and its backups. It is never returned in snapshots or diagnostics. Requests send it only to Gelbooru's fixed HTTPS endpoint. Gelbooru's API requires query-string credentials, so any server/proxy access logs should redact them. Leave the key field blank to retain the saved key, or check the clear option to remove it.

When both services verify an equivalent spelling (including an active Danbooru alias), LumiCast prefers the verified Gelbooru spelling. It does not guess cross-site synonyms. Danbooru remains the alias authority; Gelbooru is checked for exact existence and ambiguity flags. Failed Gelbooru access falls back to verified Danbooru tags with a notice. Authenticated Gelbooru access has not been exercised with a real user key.

## Editing and privacy

- Changing tags marks them unverified. **Verify edited tags** resolves aliases, removes duplicates and incompatible global tags. It checks existence only: manually added tags have not received AI meaning review. Review them against your description yourself.
- Keep nuance and multi-character ownership in prose. Generic global tags can apply to the wrong character, so conflicting colors are conservatively removed together.
- **Rebuild** explicitly replaces the final prompt with the edited tags and detail. **Copy** copies exactly the final field, including manual edits. If clipboard access is unavailable, the field is selected for your usual Copy shortcut.
- Drafts stay in the open tab and are lost on reload. Pasted descriptions, AI outputs and prompts are not persisted by LumiCast. Provider-side handling follows your chosen provider's policy. Settings and optional Gelbooru credentials are persisted per user.
- Public metadata caches are memory-only, bounded at 512 responses: positive entries expire after seven days; empty responses after one hour. Failures are not cached as missing tags; HTTP failures briefly pause requests to that host. Requests are serialized with 450 ms spacing.
- A translation has a four-minute limit and supports cancellation. Provider generation is aborted through Spindle. The CORS API has no cancellation signal; a tag lookup wait is capped at 12 seconds and the host applies its own network limits. Cancelling does not retroactively undo provider billing.
- Frontend replies are scoped to the authenticated user and originating frontend session. Operator installations pass authenticated `userId` to connection and generation calls. Concurrent operations are limited to one per user.

## Build and test the source package

Requires Bun 1.4.2 or newer. Inside the extracted source folder:

```sh
bun install --ignore-scripts
bun run typecheck
bun test
bun run build
bun run smoke:live
```

`build.ts` produces `dist/backend.js` and `dist/frontend.js`. All runtime imports are bundled. Development dependencies are pinned and `bun.lock` is included. The source ZIP excludes `node_modules` and contains no credentials.

`bun run smoke:live` makes real public Danbooru metadata calls. It does not call a paid provider. The optional `scripts/provider-smoke.ts` runs eight synthetic descriptions against an OpenRouter-compatible provider you explicitly configure; see `SMOKE-TESTS.md` for usage and cost scope.

## Architecture and verification

- `contracts.ts`: provider-neutral inputs, output DTOs, dictionary interface and Anima assembly.
- `engine.ts`: source grounding, modular generative extraction/review and conflict guards.
- `dictionary.ts`: allowlisted booru metadata transport, alias resolution, caching and credential isolation.
- `backend.ts`: Spindle adapter, user/session routing, settings, permission checks and cancellation.
- `frontend.ts`: drawer UI, bounded RPC, editable fields and clipboard handling.

Future input/output bridges can wrap `Translator` and its DTOs without changing the UI or booru transport. A future optional classifier can review structured candidates behind another adapter; it must not be used as a text generator. No future bridge or NPC feature is implemented in v1.

See `VERIFICATION.md` for tested source revisions, actual check results and remaining live-test limits. Reference repositories were cloned into a separate research directory and were not edited.
