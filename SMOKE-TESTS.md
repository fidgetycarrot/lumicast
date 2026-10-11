# Smoke tests

## In Lumiverse after installation

Select a saved generative text connection and try the eight descriptions in `tests/fixtures.ts`:

| Description | Required behavior |
|---|---|
| Broad ribcage, softly defined waist, barely upturned nose, blue eyes | Keep subtle qualifiers in prose; do not replace them with exaggerated body tags. |
| Left amber eye, right blue eye, black hair with thin white temple streak | Preserve side assignment and narrow streak. Avoid global competing eye/hair colors. |
| Humanoid with translucent ear fins, faint silver speckles beneath olive skin | Keep unusual anatomy and texture; do not invent species, gender, outfit or pose. |
| Wolfish grin, not wolf ears; shoulder-length hair | Do not emit wolf ears or extreme hair lengths. |
| Short red hair | Do not request age, gender, eye color or missing attributes. |
| Entirely black hair and entirely white hair | Report the actual contradiction with quotes, preserve wording, and do not choose a winner. |
| Mara with blue eyes/green coat; Sol with brown eyes/red scarf | Preserve subject ownership; no invented composition or globally mixed attributes. |
| Eyes blue or grey; narrator cannot tell | Report only the real color ambiguity. |

Also check: change tags → rebuild disabled until verified; nonexistent tag → clear failure; clear tags → prose-only rebuild; edit final prompt → copy exact text; stop provider access → previous edits preserved; Cancel → no replacement output; close/reopen tab → no duplicate tab/listeners; reload → settings retained, draft cleared.

If a model misses a quote/detail, invents a trait, or raises missing-attribute uncertainty, try a stronger generative connection. Two calls by the same model reduce errors but do not establish a guarantee.

## Optional live provider smoke

This was **not run during development**: no provider credentials were supplied. It uses the production engine and dictionary directly, not an authenticated Lumiverse session. It makes up to **16 paid calls** over eight synthetic inputs, without automatic retries. It does not generate images.

Supply environment variables using your normal secret-handling method, without putting real keys in committed files:

- `LUMICAST_SMOKE_API_KEY`: your provider key.
- `LUMICAST_SMOKE_MODEL`: an actual supported generative text model ID.
- `LUMICAST_SMOKE_URL`: optional OpenAI-compatible chat-completions URL; default `https://openrouter.ai/api/v1/chat/completions`. HTTPS is required except for localhost.

Then run:

```sh
bun run scripts/provider-smoke.ts
```

The script checks that fixture details survive, sparse input does not become uncertainty, and a wolfish grin does not become wolf ears. It reports case names and counts without printing credentials or provider response bodies. Review actual output in the extension afterward. Passing this test is not a visual Anima benchmark.
