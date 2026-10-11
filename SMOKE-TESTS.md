# Smoke tests

## In Lumiverse after installation

Select a saved generative text connection and try the synthetic descriptions in `tests/fixtures.ts`, plus your usual OOC-generated descriptions from different presets:

| Description | Required behavior |
|---|---|
| Broad ribcage, softly defined waist, barely upturned nose, blue eyes | `blue_eyes` as a tag; the subtle proportions in the caption, not as exaggerated body tags. |
| Left amber eye, right blue eye, black hair with thin white temple streak | Side assignment and the narrow streak survive in the caption; no competing global eye colours. |
| Humanoid with translucent ear fins, faint silver speckles beneath olive skin | Unusual anatomy and texture kept; no invented species, gender, outfit or pose. |
| Wolfish grin, not wolf ears; shoulder-length hair | No `wolf_ears`; `medium_hair`. |
| Short red hair | `red_hair`, `short_hair`; no request for age, gender or eye colour. |
| Entirely black hair and entirely white hair | The contradiction is reported; neither colour is tagged. |
| Mara with blue eyes/green coat; Sol with brown eyes/red scarf | Ownership stays in the caption; no globally mixed colour tags. |
| Eyes blue or grey; narrator cannot tell | Only the real colour ambiguity is reported. |
| Chatty narrator mid-scene: petite frame, B cup, near-black shoulder-length hair in a claw clip, grey eyes, bored, oversized hoodie, wet leggings | Translate once, then switch **Include** without translating again. **Character only:** `1girl`, build, `small_breasts`, hair colour and length, eye colour; a caption with no narrator voice, cup letter, clothing, clip, pose or wetness. **Character and outfit:** adds the hoodie and leggings tags. **Everything:** adds `solo`, hair-up, expression, pose and wet clothing. |

Also check: a nonexistent tag is named in a notice instead of failing the run; change tags → rebuild disabled until verified; clear tags → caption-only rebuild; edit final prompt → copy exact text; stop provider access → previous edits preserved; Cancel → no replacement output; close/reopen tab → no duplicate tab/listeners; switch Include after editing a field → fields reset with a notice, no new generation call; reload → settings retained, draft and Include choice reset.

If a model files a lasting trait under the scene (or the reverse), misses a detail, or invents one, try a stronger generative connection. Two calls by the same model reduce errors but do not establish a guarantee.

## Optional live provider smoke

This was **not run during development**: no provider credentials were supplied. It uses the production engine and dictionary directly, not an authenticated Lumiverse session. It makes up to **22 paid calls** over eleven synthetic inputs, without automatic retries. It does not generate images.

Supply environment variables using your normal secret-handling method, without putting real keys in committed files:

- `LUMICAST_SMOKE_API_KEY`: your provider key.
- `LUMICAST_SMOKE_MODEL`: an actual supported generative text model ID.
- `LUMICAST_SMOKE_URL`: optional OpenAI-compatible chat-completions URL; default `https://openrouter.ai/api/v1/chat/completions`. HTTPS is required except for localhost.

Then run:

```sh
bun run scripts/provider-smoke.ts
```

The script fails a case only on hard errors: an empty prompt, narrator filler, a cup letter or out-of-scope detail in the prompt, uncertainty on sparse input, a wolfish grin becoming wolf ears, or a contradiction resolved by guessing. It prints each case's tags and caption so you can judge the rest by eye, since a live model may reasonably choose different tags from the fixtures. It never prints credentials or raw provider responses. Passing this test is not a visual Anima benchmark.
