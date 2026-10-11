# LumiCast 0.2.4

**v0.2.3 adds Character type.** An optional field for what the character is, in your own words (`femboy`, `android`, `werewolf`, `trans woman`). It is treated as true even when the description never says it, takes precedence where the two disagree, and is translated into the matching tag where Danbooru has one and into the caption either way. It is not saved between sessions.

**v0.2.2 looks for type tags.** Danbooru tags that name a kind of character (`android`, `elf`, `trap`, `androgynous`, `tomboy`) steer an image more than any single body tag, and are often stated only as a combination of facts. Extraction now proposes them when the text states those facts, and no longer tags clothing the text says was removed.

**v0.2.1 translates once and lets you switch what is shown.** One run now produces the character-only, character-and-outfit and everything views together, so changing **Include** is instant, costs nothing, and the three views can no longer disagree with each other.

**v0.2.0 is built for reusable character prompts.** Paste a description of a character, including one written mid-scene by a narrator with a personality, and LumiCast returns the character alone: build, hair and face as real booru tags, followed by a short plain caption. Clothing, pose, expression and setting are left out by default so the result can be dropped into any scene; the **Include** menu adds the outfit, or everything. Each trait can now carry several tags, a stated cup size is converted through a fixed table, and one malformed line from a small model no longer discards the whole result. Update LumiCast in Extensions and reload if needed.

A standalone Lumiverse Spindle extension. Paste a character appearance, translate it, review the verified tags and caption, edit the assembled Anima prompt, and copy it. The passages the result was built from stay available for comparison.

This release contains only the manual translator. It has no NPC detection, character storage, watchlists, invented appearances, attribute checklist, or connections to Set Points or Lumi Studio.

## Install from GitHub

Requires **Lumiverse 1.2.5 or later**.

1. Open **Extensions** in Lumiverse and choose **Install from URL** in the add menu.
2. Enter `https://github.com/fidgetycarrot/lumicast`.
3. Grant `generation` and `cors_proxy`, then enable LumiCast.
4. Open **LumiCast** in the sidebar or command palette. Choose a saved generative connection under **Connection & tag services**, save, paste an appearance, optionally fill in **Character type**, choose what to **Include**, and select **Translate**.

Prebuilt `dist/` files are committed for Lumiverse installation. If the tab does not appear after installation, reload Lumiverse or toggle the extension once.

## Alternative: install the local package

Requires **Lumiverse 1.2.5 or later**. Compatibility was checked against the current 1.2.5 source and SDK 0.6.40; older versions have not been verified.

1. Unzip `lumicast-0.2.4-install.zip`. It contains a folder named `lumicast` with `spindle.json` and `dist/` immediately inside it.
2. On the machine running your Lumiverse **server**, copy that folder into `<DATA_DIR>/extensions/`. The server's default DATA_DIR is `./data`, relative to where Lumiverse runs. For Docker, copy into the volume mounted as the server's data directory. Do not copy it into another extension's folder.
3. As the Lumiverse owner/admin, open **Extensions**, open its add menu, and choose **Import Local**. Enable LumiCast and grant `generation` and `cors_proxy`. If the tab does not appear, reload Lumiverse.
4. Open **LumiCast** in the sidebar drawer or find it in the command palette. Expand **Connection & tag services**, choose a saved generative connection, and save.
5. Paste an appearance and select **Translate**. Review the tags and caption. Source passages appear under **Tag sources & uncertainty**. Edit as needed, rebuild, and copy the prompt.

The install ZIP contains prebuilt self-contained bundles and no package manager dependencies. Installation does not need a build step. Lumiverse supports the local layout above and normalizes it into its managed `lumicast/repo` directory. Keep the separate `lumicast/storage` directory intact when updating.

The repository and manifest use `https://github.com/fidgetycarrot/lumicast`. If forking, update `github` and `homepage` and keep the rebuilt `dist/` files committed.

## Connections and models

LumiCast uses Lumiverse's `connections.list/get` and `generate.raw`. It does not read, copy, or store your provider API key. Only the selected connection's configured model is used. Your chat connection and preset are not changed, and no chat history, character cards, persona data, or story files are read.

Create a dedicated translator connection in Lumiverse using OpenRouter, an OpenAI-compatible endpoint, or any supported generative text provider. Choose a fast text model that reliably follows JSON instructions; run the examples in `SMOKE-TESTS.md` before trusting a cheaper model. Switch to a stronger generative model if the result is thin or JSON validation fails. The selector shows actual saved provider/model IDs, rather than a stale hardcoded catalog or prices. Refresh it after changing Connections.

Jev, Decisions, embedding, reranking and moderation models are blocked by recognizable model names. This is a practical guard, not exhaustive capability discovery; a custom-named classifier will still fail the required text/JSON checks. No speculative Luna or Jev endpoint is used. Reasoning settings inherit your saved connection/host settings. Each translation makes **two generation calls**, with a 6,000 output-token limit per call. There are no automatic paid retries.

## How a translation works

Each translation makes **two generation calls** and a series of tag lookups, and covers every **Include** choice at once.

1. **Extraction.** The model lists each visual fact once, with the passage it came from, a group, up to four candidate booru tags and one plain clause. It is told to tag generously with real Danbooru vocabulary (colour, length and style for hair; build, chest, waist and hips for the body; and so on), because every candidate is checked afterwards. It is asked for a type tag (`android`, `trap`, `tomboy` and the like) only when the text states the facts that make one up. It is told not to fill in anything the text leaves out, not to tag clothing described as removed, and not to tag metaphors, negations, either/or statements or traits in a multi-character description.
2. **Scope.** Groups are `subject`, `body`, `hair`, `face`, `outfit` and `moment`. `moment` covers pose, expression, setting, what a garment is doing right now, and hair that is only arranged that way in the scene. **Include** decides what is shown, and can be changed after translating without another run:

   | Include | Keeps |
   |---|---|
   | Character only (default) | subject, body, hair, face |
   | Character and outfit | the above plus outfit |
   | Everything | all groups, plus `solo` |

   A notice says how many details are hidden. Switching replaces the tag, caption and prompt fields, including manual edits to them. The split is the model's judgement; check it when a description blurs habit and moment.
3. **Dictionary.** Each candidate is looked up on Danbooru. Live general tags pass; nonexistent, deprecated, artist, copyright and character tags are dropped and named in a notice; active aliases resolve to the canonical tag. At most 40 tags are looked up, identity tags first. A lookup failure leaves that tag out and adds a notice.
4. **Review and caption.** The second call sees the traits and the verified tags with the start of each wiki definition. It can remove tags (wrong meaning, exaggeration, metaphor) but cannot add any, and it writes the caption in three pieces: the character, the outfit, and the scene. The panel joins the pieces the chosen **Include** calls for. The character piece is instructed to mention no clothing, pose or setting; that is an instruction to the model, not a guarantee, so read it. If the answer is unusable, the verified tags are kept unreviewed and the caption is assembled from the first-pass clauses, with a notice. A piece that is missing, or cites a number the description never gave, is replaced the same way on its own.
5. **Guards.** Two hair colours, hair lengths, eye colours, subject counts or breast sizes are removed together. A trait named in a genuine contradiction or ambiguity loses its tags and stays in the caption. A malformed uncertainty note is ignored, withholding tags only for a trait it can be traced to; a note about a missing attribute is discarded.
6. **Assembly.** Tags are ordered subject, body, hair, face, outfit, moment. Canonical names use underscores in the editor; the assembled prompt uses lowercase tags with spaces, preserving `score_*` spelling if manually supplied. Tags and caption are separated by a blank line. No quality, safety, artist or lighting tags are added; add the prefix your Anima variant wants in the editable final prompt.

### Cup sizes

Anima knows visual size tags, not cup letters. When the description states one cup size (`B cup`, `d-cup`, `32C`), LumiCast adds one tag from this fixed table, replacing any size the model proposed, and keeps cup letters and numeric measurements out of the caption:

| Stated | Tag |
|---|---|
| AA | `flat_chest` |
| A, B | `small_breasts` |
| C | `medium_breasts` |
| D, DD, DDD, E | `large_breasts` |
| F and up | `huge_breasts` |

The table is `CUP_TAGS` in `src/contracts.ts`; edit it and rebuild if your model reads sizes differently. Several different cup sizes in one description add no tag. Without a cup label, a size the text describes in words goes through review like any other tag.

### What verification means

**A verified tag exists on Danbooru and passed one model's meaning check. That is not measured Anima image fidelity.** The model can still miss a trait, misfile a scene detail as permanent, or pick a tag whose real usage differs from its name. Extracted passages must match your text (allowing for retyped quotes and dashes); a trait that does not is skipped and counted in a notice. Compare the output with your description before relying on it.

This follows the [official Anima model guidance](https://huggingface.co/circlestone-labs/Anima/blob/main/README.md), which supports tags, natural language and combinations, and prefers Gelbooru spellings where they differ.

## Gelbooru

Danbooru needs no credentials for these metadata calls. Gelbooru's live API returned HTTP 401 without credentials during development. Optionally enter your Gelbooru numeric user ID and API key, obtained from your own Gelbooru account API access settings.

The key is saved in **per-user extension storage on your Lumiverse server**, not browser storage. It is not encrypted by LumiCast; protect the server data directory and its backups. It is never returned in snapshots or diagnostics. Requests send it only to Gelbooru's fixed HTTPS endpoint. Gelbooru's API requires query-string credentials, so any server/proxy access logs should redact them. Leave the key field blank to retain the saved key, or check the clear option to remove it.

When both services verify an equivalent spelling (including an active Danbooru alias), LumiCast prefers the verified Gelbooru spelling. It does not guess cross-site synonyms. Danbooru remains the alias authority; Gelbooru is checked for exact existence and ambiguity flags. Failed Gelbooru access falls back to verified Danbooru tags with a notice. Authenticated Gelbooru access has not been exercised with a real user key.

## Editing and privacy

- Changing tags marks them unverified. **Verify edited tags** resolves aliases, removes duplicates and incompatible global tags. It checks existence only: manually added tags have not received AI meaning review. Review them against your description yourself.
- Keep nuance and multi-character ownership in the caption. Generic global tags can apply to the wrong character, so conflicting colors are removed together.
- **Rebuild** explicitly replaces the final prompt with the edited tags and detail. **Copy** copies exactly the final field, including manual edits. If clipboard access is unavailable, the field is selected for your usual Copy shortcut.
- Drafts stay in the open tab and are lost on reload. Pasted descriptions, AI outputs and prompts are not persisted by LumiCast. Provider-side handling follows your chosen provider's policy. Settings and optional Gelbooru credentials are persisted per user.
- Public metadata caches are memory-only, bounded at 512 responses: positive entries expire after seven days; empty responses after one hour. Failures are not cached as missing tags; HTTP failures briefly pause requests to that host. Requests are serialized with 450 ms spacing, two per live tag, so a first translation with many new tags can spend most of a minute on lookups; repeated tags come from the cache.
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

`bun run smoke:live` makes real public Danbooru metadata calls. It does not call a paid provider. The optional `scripts/provider-smoke.ts` runs the synthetic descriptions in `tests/fixtures.ts` against an OpenRouter-compatible provider you explicitly configure; see `SMOKE-TESTS.md` for usage and cost scope.

## Architecture and verification

- `contracts.ts`: provider-neutral inputs, output DTOs, trait groups and scope, the cup-size table, dictionary interface and Anima assembly.
- `engine.ts`: the two prompts, source grounding, scope filtering, cup conversion, review handling and conflict guards.
- `uncertainty.ts`: bounded annotation normalization, evidence validation and conservative recovery.
- `dictionary.ts`: allowlisted booru metadata transport, alias resolution, caching and credential isolation.
- `backend.ts`: Spindle adapter, user/session routing, settings, permission checks and cancellation.
- `frontend.ts`: drawer UI, bounded RPC, editable fields and clipboard handling.

Future input/output bridges can wrap `Translator` and its DTOs without changing the UI or booru transport. A future optional classifier can review structured candidates behind another adapter; it must not be used as a text generator. No future bridge or NPC feature is implemented in v1.

See `VERIFICATION.md` for tested source revisions, actual check results and remaining live-test limits. Reference repositories were cloned into a separate research directory and were not edited.
