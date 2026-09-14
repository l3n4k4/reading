# One page per reading test

Date: 2026-09-14

## Problem

`index.html` and `questions.html` each hard-code 43 `<script>` tags, one per
file in `tests/`. Every visit downloads 4.3 MB of test data to read a single
test. A `<select>` swaps tests in place, so the URL never says which test is
open: nothing can be linked, bookmarked, or reached with the back button.
Adding a test means editing both HTML files by hand, and the hand-maintained
order sorts `academic-10` before `academic-2`.

## Shape

A build step generates a static page per test. The repo root stops being a
servable site; `dist/` is the site.

```
dist/index.html                          listing, grouped Academic / General / Other
dist/<id>/index.html                     study page
dist/<id>/questions/index.html           questions page
dist/tests/<id>.js                       one file per test, each loaded by its own pages only
dist/css/style.css  dist/js/*.js
dist/404.html                            real 404 instead of index.html at HTTP 200
dist/_redirects                          /questions -> / for old bookmarks
```

Assets are referenced root-absolute (`/css/style.css`), so templates do not
care how deep the page sits.

## Components

**`tools/build.js`** — reads every `tests/*.js` except `_template.js`, extracts
`{id, title, subtitle}` by running the file's pushed object through
`vm.runInNewContext` against a stub `window`, the technique
`tools/merge-vocab.js` already uses. Emits the tree above. Sorts ids
naturally, so `academic-2` precedes `academic-10`. Groups by the segment
before the first `-`; ids with no recognised prefix fall into "Other".

**`tools/templates/`** — `study.html` and `questions.html` are the current root
HTML files with the 43 script tags replaced by `{{TEST_SCRIPT}}`, the
`.test-selector` block removed, and a back link plus Study/Questions tabs
added. `list.html` and `404.html` are new.

**`tools/verify-build.js`** — asserts the build is correct rather than
plausible: every test has both pages, every page embeds exactly one
`tests/*.js` and it is that page's own test, the listing links every id, and
no page references a test file that was not emitted.

**JS changes** — the pages carry `window.TEST_ID`, injected by the build, so
each entry point loads one known test instead of reading a `<select>`:

| File | Change |
| --- | --- |
| `js/common.js` | Drop `populateTestSelector` — no selector exists any more. |
| `js/app.js` | Drop `testSelect`, its `change` listener, and the `currentTest` write. `init()` calls `loadTest(window.TEST_ID)`. |
| `js/questions.js` | Same three changes. |

**`server.js`** — serves `dist/` and resolves `/<id>` and `/<id>/` to that
directory's `index.html`, matching how Cloudflare Pages serves the same tree.

**CI** — the workflow's "Stage site files" step becomes `node tools/build.js`
followed by `node tools/verify-build.js`, so a broken build fails the deploy
rather than shipping.

## State

Per-test progress stays under `localStorage['readingState.<id>']`, untouched,
so existing progress survives. `localStorage['currentTest']` becomes dead —
nothing reads or writes it once the selector is gone.

## Pre-existing bugs this surfaced

Two bugs that the old all-tests-on-one-page structure hid, both fixed here:

`tests/academic-8-1.js` was the only test file missing
`window.readingTests = window.readingTests || []`. It worked only because 42
other files ran first and created the array. Loaded alone, as a per-test page
must, it throws.

`js/app.js` never called `new ReadingApp()`. Commit `9bfffc2` ("Revert to
GitHub Pages") swallowed the last three lines and moved the class's closing
brace, so the study page had been rendering an empty shell on `main` ever
since — silently, because a class that is never instantiated raises nothing.
`tools/verify-build.js` now asserts both entry points construct themselves.

## Deliberately not included

Progress indicators on the listing page. The data is in `localStorage` and the
listing could read it, but nothing asked for it and it is easy to add later.

## Risks

The old `/questions` URL disappears; `_redirects` sends it to the listing.
Anyone deep-linking `/index.html` still lands on the listing, which is now a
different page than before — acceptable, since the study view moved to a
per-test URL by design.
