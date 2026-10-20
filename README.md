# LumiCast 0.11.0

**v0.11.1 lets you fix a character after the fact.** If a character doesn't look quite right after a few pictures, open it in Lumi Studio 1.8.5 or newer and choose **Tweak in LumiCast**. Then open LumiCast: the character loads by itself, with a note at the top, and its written description loads too when this chat's Cast lorebook has that character. If LumiCast is holding work that loading would replace, it asks first (**Load it** / **Not now**). Use **03 / Refine** as usual; changes go into the character sheet. Then, back on the same character in Lumi Studio, choose **Fill from LumiCast** and save. Lumi Studio stays the one place each character is kept. If Refine empties a field completely, clear it by hand in Lumi Studio, since Fill never wipes a field.

**v0.10.1 keeps each story's cast with its chat.** The Cast lorebook is now attached to the chat, not the character card, so a character met in one story never turns up when you replay the same card. A new chat starts with an empty cast. A Cast lorebook that 0.10.0 attached to a card moves onto the chat you save from, with its entries, the next time you save. Group chats work too.

**v0.10.0 turns [ooc] answers into lorebook entries.** Ask your story model about someone with a message that starts with `[ooc]` (or `(ooc)`, `OOC:` and similar), for example `[ooc] describe Maren and Tobin`. When the answer arrives, the new **From your story** card says so. Choose **Use the last [ooc] reply**: a model cleans the answer into one plain description per character, dropping the narrator's remarks and voice, and keeping only facts the answer states. Edit each one, then **Save to Cast lorebook** puts it in a lorebook named "Cast · <chat name>", attached to that chat (since 0.10.1), triggered by the character's name and other names. Saving again updates the same entry. **Make the Anima prompt** sends the description straight into a translation. Once saved, you can delete the [ooc] exchange from your chat. Works with any preset. **Model for [ooc] replies** under Connection & tag services lets you use a stronger model for this step. This version needs four more permissions: `chats`, `chat_mutation` (to read the chat), `characters` and `world_books`.

**v0.9.0 is much faster.** Two things made a translation take minutes. First, the model was thinking for as long as your chat settings allow; LumiCast now asks for a short think by default. **Model thinking** under Connection & tag services sets it: **Light** (the default), **Off** (fastest, if your model allows it), or **Same as this connection in Lumiverse**. Second, tags were checked a few at a time; now all of them are checked in about half a dozen requests. While a translation runs, the status line shows which of the three steps it is on and a running clock.

**v0.8.3 is faster at tag lookups and says where the time goes.** Tags are looked up all at once, Danbooru and Gelbooru are asked side by side (each still at its polite pace), and Gelbooru is asked only when Danbooru lacks a tag or knows it by another name. After each translation the status line says how long the model and the tag lookups took.

**v0.8.2 copes with reasoning models.** The reply limit per call is now 16,000 tokens instead of 6,000, an answer a model leaves in its reasoning text or wraps in a sentence is still read, and a failed reply now says which step failed and whether the model ran out of room or sent nothing.

**v0.8.1 plainer captions, and a way to turn them off.** The caption writer now uses only words an image model can draw (colours, shapes, lengths, placement), leaves out roles, moods and impressions such as "goddess" or "presence", never contradicts a kept tag, and skips what a tag already says. Tags such as `abs` are no longer proposed against a stated soft belly. A **Caption** menu in the Anima prompt can drop the caption entirely; the choice is remembered in this browser.

**v0.8.0 gives Refine a memory.** While you work on one character, Refine keeps the last eight rounds: what you said, the suggestions you used and the ones you skipped. The model is told not to offer a skipped change again, and to go further or try something different when a problem comes back. **Earlier rounds** in the Refine card lists them; **Start over** clears them, and a new description starts fresh. This release also fixes the lock on Always include tags, which the 0.5.3 code checked but never actually received.

**v0.7.0 hands characters to Lumi Studio.** LumiCast now shares its latest character sheet with Lumi Studio 1.8.2 or newer. In Lumi Studio, open a new reusable character or persona and choose **Fill from LumiCast**: the sheet fields, and a name guessed from the description's first line, are filled in one step for you to check and save. Edits you make to the sheet in LumiCast are shared too.

**v0.6.0 follows how LumiCast is used.** The Anima prompt is now step 02, open, with the finished prompt and **Copy prompt** at the top and the tag and caption editors folded beneath. A saved **Your quality tags** field goes in front of every prompt exactly as typed. Worth pinning down has its own card under Describe. Refine reads the Anima prompt as well as the sheet. The Lumi Studio character sheet is step 04 and collapses; sections stay open or closed as you left them.

**v0.5.5 keeps a character's height and keeps explicit anatomy separate.** A stated height (`6'8"`, `203 cm`) that is unusually tall becomes `tall_male`, `tall_female` or `tall`, plus "very tall" in the sheet for the very tallest, since a picture shows tall and not a number. Explicitly described genitals and similar anatomy go to a new **Conditional visible anatomy** field, matching Lumi Studio's own, instead of the permanent appearance tags, so they only appear in images that show them. Calling a big man "the giant" no longer suggests the `giant` tag.

**v0.5.1 keeps unverified guesses as words.** A tag the model proposed that neither booru has (`silver_hair`, `violet_eyes`) no longer disappears: the character sheet keeps it as plain words, which Anima can read, unless a tag or a longer phrase already says it. Tags themselves are still only ever verified ones.

**v0.5.0 reorganises the panel around Lumi Studio.** Three numbered steps: **01 Describe**, **02 Lumi Studio character sheet** and **03 Refine**. Gaps are answered inside the sheet card with a **Translate again** button. Your Anima notes moved from the connection settings into Refine. The tag-and-caption prompt, with its **Include** menu, is now the collapsed **Standalone Anima prompt** section, since Lumi Studio does not use it. Refine now reads and edits the sheet, and a count-tag change goes to the Count tag box. Each sheet field has its copy button on its label line, and status messages stay in view while you scroll.

**v0.4.4 adds Test Gelbooru.** A button under the Gelbooru fields makes one lookup and says what happened: accepted, rejected, refused before the key was checked, or never reached. It tests what is typed in the boxes, so you can try credentials before saving them. Gelbooru's combined `&api_key=…&user_id=…` line can now be pasted whole into the key box.

**v0.4.3 tightens the sheet and reports why Gelbooru failed.** Phrases that only restate a tag are dropped and the cap is six per field. A failed Gelbooru lookup now shows its HTTP status, once.

**v0.4.2 keeps `1other` for characters with no stated gender.** The count tag now follows gender, not species: a male android is `1boy`. If `1other` still comes out, "Worth pinning down" says so.

**v0.4.1 lists what is still open.** Above the sheet, "Worth pinning down" names anything that would make the image model guess: a count, hair colour, hair length or eye colour the description never states, and traits it states too vaguely to draw. It is advice only. The Character type field is now **Known facts** and takes any fact you want to add, such as an eye colour.

**v0.4.0 outputs Lumi Studio's character sheet.** Every translation now fills five fields named and formatted the way Lumi Studio's character editor takes them (Count tag, Stable subject phrase, Always include, Permanent appearance tags, Default outfit tags), each with its own copy button. They are comma-separated lists with no sentences, because Lumi Studio splits those fields on commas and writes its own sentence for each character. The sentence-style prompt remains, as the standalone prompt for use without Lumi Studio.

**v0.3.0 adds a feedback loop.** Generate an image, tell LumiCast in words what came out wrong, and it proposes changes you can accept one by one. It also adds saved notes for what you have learned works, emphasis weights in the tags box, and copy buttons for the tags and the detail.

**v0.2.3 adds Character type (now Known facts).** An optional field for what the character is, in your own words (`femboy`, `android`, `werewolf`, `trans woman`). It is treated as true even when the description never says it, takes precedence where the two disagree, and is translated into the matching tag where Danbooru has one and into the caption either way. It is not saved between sessions.

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
4. Open **LumiCast** in the sidebar or command palette. Choose a saved generative connection under **Connection & tag services**, save, paste an appearance, optionally fill in **Known facts**, and select **Translate**.

Prebuilt `dist/` files are committed for Lumiverse installation. If the tab does not appear after installation, reload Lumiverse or toggle the extension once.

## Alternative: install the local package

Requires **Lumiverse 1.2.5 or later**. Compatibility was checked against the current 1.2.5 source and SDK 0.6.40; older versions have not been verified.

1. Unzip `lumicast-0.11.0-install.zip`. It contains a folder named `lumicast` with `spindle.json` and `dist/` immediately inside it.
2. On the machine running your Lumiverse **server**, copy that folder into `<DATA_DIR>/extensions/`. The server's default DATA_DIR is `./data`, relative to where Lumiverse runs. For Docker, copy into the volume mounted as the server's data directory. Do not copy it into another extension's folder.
3. As the Lumiverse owner/admin, open **Extensions**, open its add menu, and choose **Import Local**. Enable LumiCast and grant `generation` and `cors_proxy`, plus `chats`, `chat_mutation`, `characters` and `world_books` for [ooc] replies and the Cast lorebook. If the tab does not appear, reload Lumiverse.
4. Open **LumiCast** in the sidebar drawer or find it in the command palette. Expand **Connection & tag services**, choose a saved generative connection, and save.
5. Paste an appearance and select **Translate**. Copy the character sheet fields into Lumi Studio. Source passages appear under **Where each tag came from**. Edit as needed, rebuild, and copy the prompt.

The install ZIP contains prebuilt self-contained bundles and no package manager dependencies. Installation does not need a build step. Lumiverse supports the local layout above and normalizes it into its managed `lumicast/repo` directory. Keep the separate `lumicast/storage` directory intact when updating.

The repository and manifest use `https://github.com/fidgetycarrot/lumicast`. If forking, update `github` and `homepage` and keep the rebuilt `dist/` files committed.

## Connections and models

LumiCast uses Lumiverse's `connections.list/get` and `generate.raw`. It does not read, copy, or store your provider API key. Only the selected connection's configured model is used. Your chat connection and preset are not changed, and no chat history, character cards, persona data, or story files are read.

Create a dedicated translator connection in Lumiverse using OpenRouter, an OpenAI-compatible endpoint, or any supported generative text provider. Choose a fast text model that reliably follows JSON instructions; run the examples in `SMOKE-TESTS.md` before trusting a cheaper model. Switch to a stronger generative model if the result is thin or JSON validation fails. The selector shows actual saved provider/model IDs, rather than a stale hardcoded catalog or prices. Refresh it after changing Connections.

Jev, Decisions, embedding, reranking and moderation models are blocked by recognizable model names. This is a practical guard, not exhaustive capability discovery; a custom-named classifier will still fail the required text/JSON checks. No speculative Luna or Jev endpoint is used. Reasoning settings inherit your saved connection/host settings. Each translation makes **two generation calls** and each refinement makes **one**, with a 16,000 output-token limit per call, since reasoning models spend part of it thinking. There are no automatic paid retries.

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
6. **Assembly.** Tags are ordered subject, body, hair, face, outfit, moment. Canonical names use underscores in the editor; the assembled prompt uses lowercase tags with spaces, preserving `score_*` spelling if manually supplied. Tags and caption are separated by a blank line. LumiCast adds no quality, safety, artist or lighting tags of its own. Your saved **quality tags** (in 02 / Anima prompt) go first, exactly as typed and unverified, joined to the tag line, or on their own line when there are no tags.

### Lumi Studio character sheet

Card **02** lays the result out for Lumi Studio 1.8.1's character editor. **Include** only affects the standalone prompt.

| Field | Filled with |
|---|---|
| Count tag | `1girl`, `1boy` or `1other`. |
| Stable subject phrase | Two to five words for who this is, such as `adult male android`. |
| Always include | The type tags, such as `android, trap`. |
| Permanent appearance tags | Verified body, hair and face tags, then plain words for any guess that is not a booru tag, then short phrases for what no tag says (`choppy silver-white hair`), at most eight extras. |
| Default outfit tags | Verified clothing tags, then short clothing phrases. Skip it for a character whose clothes follow the story. |
| Conditional visible anatomy | Explicitly described anatomy that clothing normally covers. Lumi Studio adds it only under the rule you choose there. |

Tags are written with spaces and keep any weight. Phrases come from the review call, which is told to skip anything a kept tag already covers; they are lower-cased, split at any comma, stripped of a leading pronoun, and dropped if they repeat a tag, restate one with a single extra word (`pale porcelain skin` beside `pale skin`), or cite a number the description never gave. Pose, expression, setting and `solo` never appear here. Refine applies its tag changes to these fields as well; a newly added tag lands in Permanent appearance tags.

LumiCast never writes to Lumi Studio. It publishes the sheet, with a name guessed from the description's first line, on Lumiverse's shared RPC pool at `lumicast.sheet.latest` (in memory, readable by other extensions, replaced on every change, gone when Lumiverse restarts). Lumi Studio 1.8.2's **Fill from LumiCast** reads it and fills only the fields LumiCast has values for; nothing is saved until you save there. Each field also has its own copy button.

### Worth pinning down

A reproducible character needs its anchors fixed, and a faithful translator will not fix them for you. After each translation LumiCast lists:

- **Not stated:** man, woman or other; hair colour; hair length; eye colour. These four are checked by plain code against the verified tags and the extracted wording, with no model involved, so the list cannot grow into a general "uncertain" bucket. A colour or length given only in words counts as stated. A bald character is not asked about hair.
- **Vague:** up to four traits the review call judges an artist could not draw without guessing, such as a gradient with no colours named.

Nothing on this list changes the tags, the captions or the sheet, and nothing is filled in. To close a gap, type the fact into the box under the list (it is the same as **Known facts**) and choose **Translate again**, or edit the sheet field yourself. A colour or length you type there counts as stated even if the model files it oddly, and the status line says which gaps closed and which are still open. This is separate from **issues**, which still report only contradictions and either/or statements in the text.

### Refining from a generated image

LumiCast never sees an image. Under **03 / Refine**, say what the image got wrong ("reads too masculine", "eyes came out blue", "no visible seams") and choose **Suggest changes**. One generation call returns a short explanation and a list of proposals: tags to remove, tags to weight, tags to add, and a reworded detail. Tags to remove or weight must already be in your tags box. Tags to add are looked up on Danbooru first; ones that do not exist are dropped and named in a notice, and each survivor is shown with the start of its wiki definition. Refine reads the character sheet and remembers the earlier rounds for the current character. Tags in **Always include** are locked: a suggestion to remove one is set aside with a notice unless your feedback names it, and the model is told to strengthen a weak trait instead of removing a strong one. A reworded caption must keep the current caption's scope. Nothing changes until you tick what you want and choose **Apply selected**, which edits the sheet fields (a count-tag change goes to Count tag, a new tag to Permanent appearance tags) and applies the same tag changes to the standalone prompt, including a count-tag change. A change to a phrase that exists only in the sheet has nothing to change there, and the status line says when no change reached the standalone prompt.

The model is given Anima's published prompting guidance, the current tags and detail, your feedback, the description and Character type from the panel, and your notes. Its suggestions are reasoning from your words, not from the picture, so judge them against what you saw.

### Notes

**Your Anima notes**, a collapsed section inside **03 / Refine**, holds up to 2,000 characters of your own findings: which tags to prefer or add for a kind of character, or a weight that works. Notes are saved with your settings and read on every translation and refinement. A note can cause a tag to be added that the description does not mention; that tag cites the note as its source.

### Weights

Write emphasis in the tags box as `(tag:1.4)`, from 0.1 to 3. **Verify edited tags** checks the bare tag and keeps the weight, and the assembled prompt writes it as `(tag name:1.4)`. During translation a weight is applied only when your notes give that number; LumiCast does not choose weights there. During refinement it may propose one for a trait you said the image ignored, for you to accept or decline. The model card notes that Anima needs higher weights than SDXL.

### Height

A single stated height is converted the way a cup size is. Men from 188 cm (6'2") get `tall_male`, women from 178 cm (5'10") get `tall_female`, and anyone else from 188 cm gets `tall`; from 198 cm (men) or 188 cm (women) the sheet also gets the words "very tall". Shorter heights add nothing, because no tag means "short" without also meaning young or small-built. The same height written twice (`6'8" (203 cm)`) counts once; different heights add nothing. The thresholds are in `src/engine.ts`.

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

**Test Gelbooru** makes a single `blue_eyes` tag lookup with the credentials in the boxes (or the saved key if the key box is empty) and reports the HTTP status and what it usually means. It shows a returned page's title when there is one, with your key and ID blanked, and never the reply body. Nothing is saved or cached by the test.

Danbooru needs no credentials for these metadata calls. Gelbooru's live API returned HTTP 401 without credentials during development. Optionally enter your Gelbooru numeric user ID and API key, obtained from your own Gelbooru account API access settings.

The key is saved in **per-user extension storage on your Lumiverse server**, not browser storage. It is not encrypted by LumiCast; protect the server data directory and its backups. It is never returned in snapshots or diagnostics. Requests send it only to Gelbooru's fixed HTTPS endpoint. Gelbooru's API requires query-string credentials, so any server/proxy access logs should redact them. Leave the key field blank to retain the saved key, or check the clear option to remove it.

When both services verify an equivalent spelling (including an active Danbooru alias), LumiCast prefers the verified Gelbooru spelling. It does not guess cross-site synonyms. Danbooru remains the alias authority; Gelbooru is checked for exact existence and ambiguity flags. Failed Gelbooru access falls back to verified Danbooru tags with a notice. Authenticated Gelbooru access has not been exercised with a real user key.

## Editing and privacy

- Changing tags marks them unverified. **Verify edited tags** resolves aliases, removes duplicates and incompatible global tags. It checks existence only: manually added tags have not received AI meaning review. Review them against your description yourself.
- Keep nuance and multi-character ownership in the caption. Generic global tags can apply to the wrong character, so conflicting colors are removed together.
- **Rebuild** explicitly replaces the final prompt with the edited tags and detail. **Copy** copies exactly the final field, including manual edits. If clipboard access is unavailable, the field is selected for your usual Copy shortcut.
- Drafts stay in the open tab and are lost on reload. Pasted descriptions, feedback, AI outputs and prompts are not persisted by LumiCast. Your notes are persisted with your settings in per-user extension storage, unencrypted, and are sent to your selected provider with each translation and refinement. Provider-side handling follows your chosen provider's policy. Settings and optional Gelbooru credentials are persisted per user.
- Public metadata caches are memory-only, bounded at 512 responses: positive entries expire after seven days; empty responses after one hour. Failures are not cached as missing tags; HTTP failures briefly pause requests to that host. Requests to each site are serialized with 450 ms spacing (the two sites run side by side), two per live tag on Danbooru, with Gelbooru asked only for tags Danbooru lacks or aliases, so a first translation with many new tags can spend most of a minute on lookups; repeated tags come from the cache.
- A translation has a four-minute limit and supports cancellation. Provider generation is aborted through Spindle. The CORS API has no cancellation signal; a tag lookup wait is capped at 12 seconds and the host applies its own network limits. Cancelling does not retroactively undo provider billing.
- The latest character sheet and the first line of its description are shared with other extensions through Lumiverse's shared RPC pool so Lumi Studio can read them. They stay in memory on the Lumiverse server and are not persisted.
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
- `engine.ts`: the translation and refinement prompts, source grounding, scope filtering, cup conversion, review handling and conflict guards.
- `uncertainty.ts`: bounded annotation normalization, evidence validation and conservative recovery.
- `dictionary.ts`: allowlisted booru metadata transport, alias resolution, caching and credential isolation.
- `backend.ts`: Spindle adapter, user/session routing, settings, permission checks and cancellation.
- `frontend.ts`: drawer UI, bounded RPC, editable fields and clipboard handling.

Future input/output bridges can wrap `Translator` and its DTOs without changing the UI or booru transport. A future optional classifier can review structured candidates behind another adapter; it must not be used as a text generator. No future bridge or NPC feature is implemented in v1.

See `VERIFICATION.md` for tested source revisions, actual check results and remaining live-test limits. Reference repositories were cloned into a separate research directory and were not edited.
