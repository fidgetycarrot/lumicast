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
