# Verification — October 11, 2026

## Sources inspected

- [Lumiverse](https://github.com/prolix-oc/Lumiverse/tree/b1a68d9e32e2a2480a0d5ae71422566845f2657b), version 1.2.5, commit `b1a68d9e32e2a2480a0d5ae71422566845f2657b`.
- [Lumi Studio](https://github.com/fidgetycarrot/lumidraw-studio/tree/1a74a99d356f49d9992cd24bb3ff3389709cc45a), version 1.8.1, commit `1a74a99d356f49d9992cd24bb3ff3389709cc45a`: manifest and frontend/backend conventions only.
- Accessible local Set Points 0.1.11 source: user/session-scoped messaging, saved connections and drawer conventions only.
- SDK `lumiverse-spindle-types` 0.6.40, matching Lumiverse's pinned dependency.
- [Official Anima model guidance](https://huggingface.co/circlestone-labs/Anima/blob/main/README.md), [Danbooru API](https://danbooru.donmai.us/wiki_pages/help:api), [Gelbooru API](https://gelbooru.com/index.php?page=wiki&s=view&id=18780).

Verified real calls: `ui.registerDrawerTab`, `dom.addStyle`, `sendToBackend`, `onBackendMessage`, `onFrontendMessage`, `sendToFrontend` with `frontendSessionId`, `connections.list/get(userId)`, `generate.raw({type:'raw',connection_id,provider,model,userId,messages,parameters,signal})`, `cors(url,init)`, `permissions.has`, `userStorage.getJson/setJson` with authenticated user scope.

The host implementation confirms generation requires explicit `userId` for operator-scoped installs. The local installer reads `<DATA_DIR>/extensions/<identifier>/spindle.json` or its nested `repo` layout and registers it through Import Local.

## Completed checks

- TypeScript strict typecheck against the pinned SDK: passed.
- 46 automated tests, 283 assertions: passed. Nine challenging description fixtures plus malformed JSON, fabricated evidence, unsupported model names, nonexistent/deprecated tags, alias/cache behavior, Gelbooru failure, edited tags, RPC expiry, cancellation, per-user secret isolation and failure preservation.
- Production frontend/backend bundle build: passed.
- Current Lumiverse `detectDangerousBackendCapabilities` scanner, extracted unchanged from the pinned source: backend accepted with zero declared capabilities.
- Manifest entry existence and package structure checks: passed.
- Real public Danbooru requests rerun for v0.1.2: exact `blue_eyes`, wiki definition, active `gray_hair → grey_hair` alias, `heterochromia` prefix search and nonexistent-tag rejection passed. Additional exact metadata checks verified `hoodie`, `leggings`, `black_hair` and `bored`.
- Bun's default HTTP client was challenged by Danbooru; an honest `LumiCast/0.1.2 (tag metadata client)` header succeeded and is used in production CORS requests.
- Real Gelbooru request without credentials: HTTP 401. The extension's authenticated response parsing and fallback path were tested with controlled fixtures.
- Browser-rendered standalone frontend preview: paste → Translate → editable tag, source wording and prompt fields visibly populated. This used a clearly labeled fixture response, not a live provider. Preview screenshot supplied separately.

## Not completed

- Installation and generation inside an authenticated live Lumiverse session. The local server responded with authentication required; no existing extension installation was changed.
- Real paid provider generation: no provider key/authorized authenticated connection was supplied to this development run. Automated engine/UI tests use controlled model responses, so they validate handling rather than a model's linguistic accuracy.
- Authenticated Gelbooru access with a real account key.
- Actual Anima image rendering, fidelity benchmarking or model-specific tag performance. Dictionary count/existence does not establish image quality.
- Older Lumiverse versions. The minimum is conservatively set to the inspected current version.

The package is ready to install locally and includes live provider smoke instructions for these remaining checks. The initial local package was prepared before GitHub publication. Publication adds a new standalone repository; existing repositories/extensions were not modified. No PR is needed for an initial standalone repository.

## v0.1.1 correction

v0.1.0 omitted `provider` and `model` from raw-generation input. Although `connection_id` resolves the connection credentials, the inspected host `prepareRawCall` uses `input.model` for the provider request instead of inheriting `connection.model`. This left the model name blank. SDK 0.6.40 also omits these runtime fields from its request interface, despite showing them in its raw-generation examples.

v0.1.1 explicitly passes the saved provider and model on both calls. A direct DeepSeek regression requires `deepseek` / `deepseek-v4-pro`, the connection ID and authenticated user ID for extraction and review; the test would reject the old request. Errors now expose a fixed category and validated HTTP status with the generation step, while suppressing upstream text. A real paid DeepSeek request remains untested by this development run.

## v0.1.2 correction

The v0.1.1 engine assembled every extracted quote into the prompt, even when tags already covered it. This preserved grounding but also repeated attributes and narrator personality. v0.1.2 adds proposed compact visual clauses to extraction and independently reviews them in the existing second generation call. Reviewed coverage can suppress prose only for facts assigned to a retained tag. Every literal quote remains in a separate evidence DTO and the expandable source panel. Unapproved paraphrases use literal source wording with a notice; no extra paid call or retry is added.

New controlled regressions cover chatty narration with repeated frame descriptors, cup measurement, approximate hair length, clip/loose strands, soft adult facial features, oversized sleeves and visibly wet clothing without inferred causes; unapproved/invented paraphrases; invalid coverage IDs; restoring prose after conflict removal; bare cup measurements incorrectly proposed as visual size tags; and UI source-quote retention outside the assembled prompt. These validate the engine's handling of supplied model responses. They do not demonstrate a live model's accuracy on the user's original description.

Typecheck, all 37 tests (213 assertions), production build, current host backend scanner and package layout checks passed. Real paid generation with the revised prompts remains untested by this development run. The user's original character name and explicit story excerpt are not included in the public fixtures; the new fixture is synthetic.

## v0.1.3 correction

The v0.1.2 parser threw `Invalid uncertainty evidence.` for any note with a category other than the two literal allowed values, a non-array quote, or an evidence array outside a one-to-four length. The user's reported message establishes a failure in that guard; the original provider response was not available, so its exact offending field is not known. Controlled reproductions cover each shape rather than assuming one cause.

v0.1.3 requests existing trait IDs for genuine issues and uses an empty issues list in the schema example, avoiding the previous placeholder value `ambiguity or contradiction`. It normalizes single quotes/issue objects and kind casing while still grounding evidence. Malformed notes withhold affected tag and compact-detail approvals; unlocatable failures withhold all review approvals and retain exact extracted details. Missing-attribute annotations are ignored. No paid retry, extra generation call, or unsafe acceptance of unverified tags was added.

Strict typecheck, 46 tests (283 assertions), production build, host backend scanner and package layout checks passed. Regression coverage includes direct DeepSeek adapter/UI handling of a quote returned as a string, trait-ID references, all previous fatal uncertainty shapes, fabricated anchors, missing-attribute filtering, real contradictions involving visible absence, localized/global fallback, and preserving source details when approvals are withheld. These use controlled responses and do not establish the revised prompts' live DeepSeek accuracy.

Public tag verification was not repeated for v0.1.3; the dictionary logic is unchanged from the preceding release and its controlled tests pass. The live metadata checks listed above refer to the v0.1.2 run.

## v0.2.0 redesign

The first live runs on a narrator-voiced, mid-scene description produced one tag per fact at most, a "caption" made of disconnected source fragments, a cup letter that Anima cannot use, and scene details (pose, wet clothing) mixed into what was meant to be a reusable character prompt. An earlier run returned only literal source quotes and no tags; the response was not captured, but that output matches the old path where an untraceable uncertainty note withheld every approval.

v0.2.0 changes the contract rather than patching it: traits carry a group and up to four candidate tags; the default scope keeps subject, body, hair and face only; the review call may remove verified tags but not add them, and writes the caption; a single stated cup size maps to one tag through `CUP_TAGS`; ungrounded traits, malformed tags and unusable review output degrade with a notice instead of voiding the run. The dictionary now looks up the tag before the alias table, so a live tag costs two requests instead of three. The v0.1.x guarantees that every source quote reached the prompt, and that prose was either reviewer-approved or literal, no longer hold; the README section "What verification means" states what remains.

Strict typecheck, 53 tests (345 assertions) and the production build passed. Coverage added: the three scopes on one narrated scene, out-of-scope traits never reaching the review call, tag ordering, quote/dash drift, per-trait skipping, drop-only review, unusable review output, caption number guard, cup parsing (including "a cup of coffee" and "I cup her face") and conversion, tag cap and wiki trimming, localized uncertainty, and the tag-first lookup.

Not done in this development run: no generation call was made with the new prompts on any provider, and Danbooru was not reachable from the build environment, so neither the prompts' behaviour on DeepSeek nor the example tags named in the extraction prompt were checked live. Tags the model proposes are verified at run time by the extension itself. The host backend scanner was not re-run. Treat the first translations in Lumiverse as the real test.

## v0.2.1: one run, every scope

In v0.2.0 the scope was applied before review, so each **Include** choice needed its own two generation calls, and three runs on the same description returned different tag sets (a build tag present in one view and absent in the next). v0.2.1 extracts, verifies and reviews everything once and returns a view per scope; the panel switches between them locally. The review call writes the caption in three pieces (character, outfit, scene) that the views join. Because the reviewer now sees outfit and scene traits, keeping them out of the character piece rests on its instructions rather than on filtered input.

Strict typecheck, 54 tests (359 assertions) and the production build passed, including: all three views from two calls, identical shared tags across views, per-piece caption fallback, an empty view instead of a failed run, and switching in the panel after an edit without a further generation call. As before, no live provider or Danbooru call was made from the build environment.

## v0.2.2: type tags

A live run on a male android described with a deliberately feminine figure returned `1boy` and `android` with accurate body tags, but not `otoko_no_ko`, because no single passage says it and extraction was told to tag only what the text says outright. It also tagged underwear the text said had been ripped away, and `barefoot` beside `thighhighs`. v0.2.2 asks extraction for a type tag when the text states its component facts, tells it to give removed clothing no trait and to use `no_shoes` for stockings without shoes, and tells review to keep type tags on that basis and drop tags for clothing no longer worn.

These are prompt changes; the engine is unchanged. Typecheck, 55 tests and the build passed, but those use controlled responses and cannot show that a live model now finds the tag. A synthetic fixture with `required` tags was added so `scripts/provider-smoke.ts` fails if a live model misses `android` or `otoko_no_ko`. That script was not run here.

## v0.2.3: Character type

Some facts that decide how a character should look are never written in a description (the android run's source text does not contain a word for the character's presentation). v0.2.3 adds an optional Character type field, at most 300 characters, sent to extraction as `stated` and grounded together with the description so the model can quote it as evidence. It is not sent to the review call and is not persisted.

Typecheck, 56 tests and the build passed with controlled responses. How a live model maps a stated type to tags, and which of those tags exist on Danbooru, was not tested here.

## v0.2.4: canonical spelling for the feminine-male type tag

A live run in Lumiverse showed the tag source line `trap · Danbooru · alias: otoko_no_ko`: the model proposed `otoko_no_ko`, and Danbooru's alias table resolved it to `trap`. Danbooru's live tag is therefore `trap`, the reverse of what the v0.2.2 notes and prompts assumed. The alias handling produced the right tag regardless. v0.2.4 names `trap` in the prompts, the README and the fixtures, and the provider smoke fixture now requires `trap`, which a live lookup can return, where it previously required a name that only ever appears as an alias. Typecheck, 56 tests and the build passed.

## v0.3.0: refinement, notes, weights, copy buttons

Adds `Translator.refine` (one generation call; removals and weights limited to current tags; additions verified against the dictionary; nothing applied without the user's selection), a `notes` setting sent to extraction and refinement and grounded as quotable evidence, weighted tags `(tag:1.4)` through parsing, verification and assembly, and copy buttons for the tags and the detail. During translation a model-supplied weight is kept only when that number appears in the user's notes.

The Anima guidance in the refinement prompt paraphrases the model card read on October 11, 2026 (training on tags and captions, Gelbooru preference, tag dropout, weights needing higher values than SDXL). The repair heuristics in that prompt (look for a competing tag, then weight, then restate in the caption) are the author's reasoning and have not been measured against Anima output.

Strict typecheck, 61 tests (422 assertions) and the production build passed, including a panel test from translation through suggestion, selection and rebuild. All use controlled responses: no refinement was run against a live provider, and no image was generated.

## v0.4.0: Lumi Studio character sheet

Lumi Studio 1.8.1 (`fidgetycarrot/lumidraw-studio`, commit `1a74a99`) was read to see what a saved character must look like. Its character editor has separate Count tag, Stable subject phrase, Always include, Permanent appearance tags and Default outfit tags fields; `coreTags` splits those values on commas, semicolons and newlines but not on full stops; and `coreIdentityFor` builds each character's introduction from the prompt name, the subject phrase and scene position, and refuses to generate when a saved identity collides with banned tags. LumiCast's sentence captions would therefore be cut at their commas into fragments spanning sentence boundaries. Only that identity path was traced in the compiled bundle; how every fragment is rendered in the final prompt was not.

v0.4.0 adds a `sheet` to each translation with those five fields, built from the verified tags by group plus short phrases the review call writes for what no tag covers. Typecheck, 63 tests (433 assertions) and the build passed. Nothing was pasted into or generated through Lumi Studio in this run, and Lumi Studio itself was not modified.

## v0.4.1: gaps

A sheet for one character carried a lip phrase with no colours, because the source said only "gradient lips"; an earlier character had no eye colour at all. Both leave the image model to guess, which defeats a saved identity. v0.4.1 adds an advisory `gaps` list: four fixed anchors checked in code (count, hair colour, hair length, eye colour) and up to four vague traits named by the review call. Gaps never alter tags, captions or the sheet; a test asserts the output is identical with and without them. The roadmap's rule that missing information is not uncertainty still holds for `issues`.

The colour and length word lists are finite, so an unusual colour word stated only in prose could be reported as not stated. Typecheck, 64 tests (442 assertions) and the build passed, with controlled responses only.

## v0.4.2: count tag for humanoids

A live run tagged a male android `1other`, and the user reports that Anima draws humanoids less reliably with that tag. The extraction prompt now ties the count tag to stated gender and pronouns and reserves `1other` for characters with neither, or for non-humanoid creatures. The tag is not overridden in code, since pronouns in a description can belong to someone else; a remaining `1other` is listed under "Worth pinning down". Typecheck, 65 tests and the build passed with controlled responses.

## v0.4.3: Gelbooru status, duplicate notice, tighter sheet

A live run with saved Gelbooru credentials showed "Gelbooru lookup failed" twice. The duplicate was a bug: the selected view's notice array is shared with the top-level result, so service notices were appended to it twice. The failure itself is the first real evidence about authenticated Gelbooru access, which earlier notes list as never exercised; its cause is unknown because the notice discarded the HTTP status. v0.4.3 reports the status and what it usually means. No Gelbooru request was made from the build environment, so the cause is still undiagnosed.

The same run produced nineteen appearance entries, several restating a tag. Sheet phrases are now dropped when they are a kept tag plus at most one extra word, the cap is six, and the prompts name that pattern. Extraction is also told that flushing, blushing and anything dried on the skin belong to the scene, and review that a tag must match in meaning and not only in wording. Typecheck, 65 tests and the build passed with controlled responses.

## v0.4.4: Gelbooru connection test

Adds `testGelbooru` and a settings button for it, because the cause of the user's failing Gelbooru lookups could not be told from a notice. It distinguishes rejected credentials (401), a refusal before authentication (403), rate limiting, other statuses, an empty or non-JSON 200, a JSON reply without the requested tag, a timeout, and a request that never left the Lumiverse server. Saving and testing now accept Gelbooru's combined `&api_key=…&user_id=…` line in either box, a likely cause of a rejected key.

Typecheck, 68 tests (509 assertions) and the build passed. The tests assert that no message contains the key, the user ID or the reply body. Gelbooru's live reply to an authenticated request has still not been seen from the build environment, so the 200-with-JSON branch follows its documented shape, not an observed one.

## v0.5.0: panel reorganised

The panel had grown one feature at a time. It is now three numbered steps (Describe, Lumi Studio character sheet, Refine) with the standalone prompt, its Include menu, and the tag lookup collapsed below. Gaps carry an inline box that mirrors Known facts and a Translate again button. Notes moved into Refine and save through a notes-only action that leaves the connection and Gelbooru settings untouched. Refine now sends the sheet entries (free phrases that are not tag-shaped are left out of the request) and routes count-tag changes to the Count tag field.

Typecheck, 69 tests (522 assertions) and the build passed. The built panel was also rendered in headless Chromium at 520 px wide with a fixture translation and a fixture refinement, with no page errors; the sticky status line was checked there. That preview used canned backend replies, not Lumiverse.

## v0.5.1: unverified guesses become words

A live run reported `silver_hair` and `violet_eyes` as not live and dropped them, losing the hair and eye colour from the sheet unless the reviewer happened to write a phrase. The user noted that Anima reads plain words. Unverified proposals for subject, body, hair, face and outfit traits now enter the matching sheet field as plain words, ahead of the reviewer's phrases, skipped when a kept tag or longer phrase in that field already contains all their words, with at most eight extras per field. Scene-only guesses are still left out. The standalone tag list is unchanged: it still holds only verified tags. Notices say which way each guess went, and say "booru" since a guess is checked against Gelbooru too when it is configured. Typecheck, 70 tests and the build passed with controlled responses.

## v0.5.2: refine and the standalone prompt

The user saw no change in the standalone prompt after applying refinements. A panel test reproduced one cause: a count-tag change (`1girl` to `1boy`) was routed to the sheet's Count tag field and skipped for the standalone tag list. Changes to sheet-only phrases, which the standalone list never contains, also left it untouched without saying so. Count changes now apply to both, and the status line says whether anything reached the standalone prompt. The live run's exact suggestions were not seen, so which cause applied there is not known. Typecheck, 70 tests and the build passed.

## v0.5.3: refine keeps the character

A live refinement for "android features are weak" proposed removing `trap`, the character's defining type tag, and a replacement caption that brought in scene details (flushing, residue, missing underwear) the character-only caption had left out. Its other proposals (weight `android`, add `robot_joints` and `mechanical_parts`, weight the eye phrase) were reasonable. The sheet's Always include entries are now sent as `locked`; a removal of a locked tag is dropped in code unless the feedback contains the tag's words. The prompt also tells the model to strengthen the weak trait instead of removing the strong one, and to keep the caption's scope; the caption rule is an instruction only. Typecheck, 71 tests and the build passed with controlled responses.

## v0.5.4: answering a gap

The user typed a hair and eye colour into the gap box, chose Translate again, and saw nothing change. The run's output was not available. Two plausible causes were addressed: the anchor checks read only hair and face traits, so a stated fact the model filed under another group left the same gaps standing; and a re-run gave no sign of what it settled. The checks now also read Known facts directly, and the status line reports which gaps closed and which remain. If the button itself did not fire, this release would not fix that; the status line now makes the difference visible. Typecheck, 72 tests and the build passed.

## v0.5.5: height, anatomy, figurative "giant"

Reading a persona description before its run showed three predictable failures: the character's defining size was given only as `6'8" (203 cm)`, which the number rule discards; the text calls him "the giant" figuratively; and explicit anatomy would have been filed under body, putting it in Lumi Studio's permanent appearance tags and so in every image. Lumi Studio 1.8.1 has a separate "Conditional visible anatomy" field for this. v0.5.5 adds `heightCm` and a fixed tall conversion, an `anatomy` group that belongs to the scene scope and fills a new sheet field, and a prompt example for the figurative "giant". Typecheck, 74 tests and the build passed with controlled responses. The tag names `tall_male` and `tall_female` are checked live at run time; if one does not exist, it reaches the sheet as plain words.

## v0.6.0: built around the actual workflow

The user described their routine: translate, glance over the result, copy the standalone Anima prompt with their own quality tags into SwarmUI, generate, and refine when needed. The standalone prompt was a collapsed section at the bottom. v0.6.0 makes it step 02 with the finished prompt first, adds a saved `quality` setting prefixed by `withQuality` (unverified, as typed), moves gaps to their own card, has Refine read the prompt's tags alongside the sheet, collapses the sheet to step 04, and remembers which sections are open in browser storage (wrapped so the panel works without it). Typecheck, 76 tests (565 assertions) and the build passed; the panel was re-rendered in headless Chromium with no page errors.

## v0.7.0: handoff to Lumi Studio

The user found copying six fields between two extensions, one panel at a time, tedious. Lumiverse 1.2.5 provides `spindle.rpcPool` for cross-extension state. LumiCast now publishes `SharedSheet` (sheet fields, a name from `nameFrom`, the description's first line, a timestamp and the user ID) at `lumicast.sheet.latest` with an open read policy, after each translation, refinement and sheet edit. Lumi Studio 1.8.2 (`fidgetycarrot/lumidraw-studio`, commit `126d175`) adds Fill from LumiCast; see its release note. Lumi Studio's `frontend.js` and `backend.js` are its source (loaded directly, no build step), so the change was made there.

LumiCast: typecheck, 78 tests (576 assertions) and the build passed, including a panel test of publishing, re-publishing after edits, and the failure message. Lumi Studio: both files pass `node --check`; its backend request was exercised against a stubbed Lumiverse, and its panel in headless Chromium with a stub host. The two have not yet been run together in a live Lumiverse, which is the remaining check: that the host passes the same user ID to both extensions and that a fresh `rpcPool` read returns the published value.

## v0.7.1

After Apply selected, the status line claimed the Anima prompt was updated even when it had not been rebuilt (the tags box held unverified hand edits). It now says so and points to Verify edited tags and Rebuild. Typecheck, 79 tests and the build passed.

## v0.8.0: Refine memory, and the lock that was never sent

Each refinement used to be independent, so a long back-and-forth on a hard character could repeat declined suggestions or retry a weight the user had already found too weak. The panel now records each round (feedback, suggestions applied, suggestions left unapplied when the next round starts) and sends up to eight; the engine keeps the last six after cleaning, and the prompt says to avoid declined changes and to escalate or change approach when a problem returns. The memory lives in the open tab, resets on a new description or Start over, and is not saved.

While adding this, the backend was found not to pass `locked` to `Translator.refine`: the 0.5.3 protection for Always include tags was implemented and tested in the engine but never reached it from the panel. The integration test for 0.5.3 only checked an empty lock, so it did not catch this. The backend now passes `locked` and `history`, and a new panel-to-engine test asserts both arrive. Typecheck, 81 tests (594 assertions) and the build passed.

## v0.8.1: captions that fight the tags

A live prompt for a full-figured character paired `abs, toned` with a caption saying "a soft belly over real strength", and the caption carried undrawable impressions ("fertility goddess", "weight and presence", "a knowing curve to her mouth") and a "faint living-green undertone" likely to be drawn as green skin. The review prompt now limits captions to drawable words, forbids repeating or contradicting kept tags, and warns about tints; extraction and review both treat muscle-definition tags against a stated soft belly as a contradiction. These are prompt changes, untested against a live model. A Caption menu (tags and a short caption, or tags only) is applied in one place for display, rebuild, refinement and quality-tag changes, and is remembered in browser storage. Typecheck, 82 tests and the build passed.

## v0.8.2: replies cut off or empty

After a Lumiverse staging update, every connection the user tried (two OpenRouter, one direct DeepSeek) failed with "The model returned empty or truncated text" after a long wait, while chat and the Gelbooru test worked. The single message could not say which call failed or why. The reading of Lumiverse's staging diff found no change to raw generation that would explain it, so the cause is not established. v0.8.2 raises the per-call output limit from 6,000 to 16,000 tokens (reasoning tokens count against it), returns a reply left in the reasoning field when content is empty, reads JSON wrapped in prose, and reports the stage and the kind of failure. Typecheck, tests and the build passed; a panel-to-backend test covers each reply shape.

## v0.14.0: characters from Paige

Paige 0.1.0 publishes `{version:1, sessionId, userId, card, characters:[{name, aliases, kind, description}]}` at `paige.cast` with `rpcPool.sync`, then reads `lumicast.paige.start`. LumiCast registers that endpoint with `rpcPool.handle`: it refuses any requester but `paige`, reads `paige.cast`, loads that user's settings, answers at once, and translates each look in the background with its own 240-second limit, so one slow look doesn't stop the rest. Each sheet is published at `paige.sheet` and Lumi Studio's `lumidraw_studio.lumicast.add` is read to save it; progress is published at `paige.status` for Paige to show. The translator helpers (settings loading, dictionary, model caller, connection check) moved out of the panel's message handler so this job can use them; the panel's behaviour is unchanged. Tests run the job against a fake host: two looks into Lumi Studio with the user's connection, the requester check, no shared looks, no connection, and Lumi Studio missing. Not verified live. Typecheck, 106 tests and the build passed.

## v0.13.0: notes as rules, cropped pictures, outfit by default

Live reports: a note asking for both `trap` and `otoko no ko` produced only `(trap:1.4)` in translations, while Refine offered otoko no ko at once; and a character-only prompt for a bottom-heavy figure came out as a face and a butt, which `full body:1.3` from Refine did not fix. A hand-written prompt that added the outfit, footwear, `standing`, `flat chest`, `solo` and `(huge ass:0.7)` worked. Translation lost the note tag either to alias merging (otoko_no_ko is a Danbooru alias of trap) or to the review step's near-duplicate trimming; which one was not established. Now a trait whose evidence is quoted from the notes and not from the description or known facts marks its tags as the user's: kept in the requested spelling, never merged, exempt from review drops, uncertainty, conflict removal and tidy, source "Notes". Refine sets aside removal of a tag the notes name (word-bounded, underscores or spaces) unless the feedback names it, and offers a note-named addition as written. The Refine prompt now says what to do for cropped or partial pictures. The standalone prompt defaults to Character and outfit and adds `standing` outside the Everything scope when no pose tag is present; the sheet never gets it. Whether the model reliably gives a note its own trait is not verified live. Typecheck, 103 tests and the build passed.

## v0.12.0: Update in Lumi Studio

LumiCast's `toStudio` publishes `{version:1, id, kind, sentAt, userId, sheet}` at `lumicast.tweak.result` and then reads Lumi Studio's on-demand endpoint `lumidraw_studio.lumicast.apply` (Lumi Studio 1.8.7). Per Lumiverse's shared RPC pool docs, reading a `handle()` endpoint runs the owner's handler and passes the requester's extension id; Lumi Studio accepts only `lumicast`, only for its own latest send (same id, kind and send time), only for the same user, runs its usual profile checks, saves the six fields and tells its panel. Lumi Studio's side was run against a fake host (refusals and a matching save). LumiCast tests: no id (never saved) refused with a plain message, the exact payload and policy, Lumi Studio's answer and refusal shown, an older Lumi Studio named, and the button removed when a translation no longer names the character. Not verified live. Typecheck, 101 tests and the build passed.

## v0.11.2: fewer near-duplicates, no layout tags

Prompted by a live Lumi Studio sheet for "Riley" with three eyewear tags, two piercing entries and two hair-tip entries, and a picture with Riley twice side by side. The sheet itself was not available here, so the rules are general: `tidy()` drops layout and multi-character tags (a fixed list of Danbooru general tags) and a plain tag implied by a more specific kept tag (glasses/eyewear by `*_eyewear`, piercing, earrings, tattoo, horns by their `*_` forms); sheet fields allow two entries per item (eyewear, piercing, tips, earrings, tattoo, scar, freckles, horns), tags first; the review prompt asks for the one or two most telling tags per item; Refine skips layout tags with a notice. Whether long tag lists by themselves push Anima toward a sheet layout is not established; the layout tags are a known cause. Tests cover a Riley-like sheet and Refine. Typecheck, 100 tests and the build passed.

## v0.11.1: a character sent from Lumi Studio loads on its own

In live use the Get from Lumi Studio button under Describe went unnoticed: it looked like a step of LumiCast's own process, so a sent character seemed never to arrive. Lumi Studio's own log showed the hand-off working (`lumicast_send published lumidraw_studio.lumicast.tweak; read-back ok`, Lumi Studio 1.10.6). The button is gone. While the LumiCast panel is on screen it asks the backend every 3 seconds (`studioWaiting`, an in-memory pool read with no lorebook lookup), and also when the window regains focus or becomes visible. A send it hasn't handled yet loads by itself when nothing would be lost; otherwise a note at the top asks first with Load it / Not now. Work counted as "would be lost": a Refine answer not applied, typed Refine feedback, a description not yet translated, or a translation made in LumiCast. Each send is handled once, remembered in browser storage. Another user's send is never offered. The handoff itself was also run through Lumiverse's own shared RPC pool code (`src/spindle/shared-rpc-pool.service.ts`, prolix-oc/Lumiverse 3ca135a): Lumi Studio's sync and LumiCast's read meet at the same endpoint. Tests: the panel test now covers auto-loading into an empty panel, not reloading the same send, asking while a Refine answer waits, Not now, Load it, and another user's send. Checked in headless Chromium at desktop and phone width. Typecheck, 98 tests and the build passed. Not yet verified live.

## v0.11.0: characters back from Lumi Studio

Lumi Studio 1.8.5 (`lumicast_send`) publishes `{version:1, sheet, name, anchor, userId, sentAt}` at `lumidraw_studio.lumicast.tweak` with `rpcPool.sync`; that case was run against a fake host. LumiCast's `fromStudio` reads it with `rpcPool.read`, refuses another user's character and unknown formats, and looks the name up in the active chat's Cast lorebook (by entry comment, then by key) for the description, dropping the "[Name's appearance]" heading. Tests run the panel end to end: nothing sent yet, a character loaded with its lorebook description, Refine sending the sheet tags and description, Apply changing the sheet only and sharing it for Fill from LumiCast, and another user's character refused. Not verified live. Typecheck, 98 tests and the build passed.

## v0.10.1: Cast lorebook per chat

Checked in the Lumiverse source (1.2.5 main and current staging): a chat's lorebooks are `chat.metadata.chat_world_book_ids`, read by prompt assembly; the Spindle `chats.update` handler replaces metadata whole and prunes world-info state when that list changes; and `collectWorldInfoSources` skips a book id it has already added, so a book attached to both the card and the chat is used once. LumiCast now reads the chat fresh, appends its book id to `chat_world_book_ids` and keeps every other metadata key. A Cast book on the card is detached from the card and attached to the chat only when it is the one this chat uses or the chat has none; another chat's Cast book on the card is left alone. Tests cover a new chat book, other metadata kept, a second save updating in place, the move from the card with its entries, and a book attached both ways. Not verified live. Typecheck, 97 tests and the build passed.

## v0.10.0: [ooc] replies to a Cast lorebook

Built against the Spindle SDK 0.6.40 types: `chats.getActive`, `chat.getMessages` (chat_mutation), `characters.get/update` with `world_book_ids`, `world_books.get/create` and `world_books.entries.list/create/update`, and the `GENERATION_ENDED` event. Tests run the panel and backend against a fake host: an [ooc] reply announced by the event (no model call until asked), cleanup with the question and answer passed as data, names and other names that do not appear in the reply dropped, a new "Cast · <card>" book created once and attached to the active chat's card, the entry keyed by name and other names and found again by its comment so a second save updates it, the description sent into a translation, and plain errors for no open chat, no [ooc] message, an unanswered one and missing permissions. Not verified on a live Lumiverse: whether `getActive` and the event behave as typed on the user's staging build, how group chats (no single card) behave beyond the error message, and how a live model handles narrator chatter. Typecheck, 96 tests and the build passed.

## v0.9.0: thinking level, batched lookups, live progress

The user reported about five minutes per translation. Two causes were found in the code. (1) Every model call inherited the connection's or user's reasoning settings, which for a roleplay setup can mean long thinking on each of the two calls; the Spindle SDK's per-request `reasoning` override is now sent: `{source:'custom', apiReasoning:true, effort:'low'}` by default, `{source:'off'}` for Off, nothing for "Same as this connection". (2) Each candidate tag cost two to four Danbooru requests at 450 ms spacing, plus Gelbooru, so 40 candidates could take a minute or more. `resolveMany` now uses Danbooru's `search[name_comma]`, `search[antecedent_name_comma]` and `search[title_comma]` list filters and Gelbooru's `names` list. `search[title_comma]` on wiki_pages was confirmed live against Danbooru (it returned exactly the three titles asked for); the tags and alias list filters could not be fetched from this environment (robots or proxy refusals) and are assumed to follow the same Danbooru search convention. A reply containing rows that were not asked for is treated as "list filter ignored", and LumiCast then looks every name up on its own as before, so a wrong assumption costs speed, not correctness. Tests check that batched answers equal one-by-one answers with and without Gelbooru (aliases, deprecated and character tags, cup sizes, Gelbooru-only tags, invalid names), that the fallback works when list filters are ignored, and that a Danbooru outage fails names the same way. Whether Lumiverse staging honours the reasoning override for this provider is not verified here; the timing line will show the effect. Typecheck, 91 tests and the build passed.

## v0.8.3: lookup speed and timing

Translations became slow once Gelbooru credentials started working: every tag also queried Gelbooru, and all requests for both sites waited in one serialized queue, one tag at a time. Now each site has its own queue and pause, candidates are resolved concurrently and used in prompt order, and Gelbooru is consulted only when Danbooru has no live tag of that name or resolves it through an alias (the cases where the spellings can differ). Each translation reports its model time, lookup time and total. Whether the model or the lookups dominated the user's slow run is not known; the new timing line will show it. Typecheck, tests and the build passed.

