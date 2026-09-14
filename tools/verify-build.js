/*
 * Assert that dist/ is a correct build, not merely a build that ran.
 *
 *   node tools/verify-build.js [outDir]     (default: dist)
 *
 * Two properties matter:
 *  - each page loads exactly one test data file, and it is that page's own
 *    test — the point of the per-test pages, and the thing a careless
 *    template edit would silently undo;
 *  - every asset a page references is content-hashed and present on disk, so
 *    a browser cannot pair fresh HTML with a stale cached script.
 *
 * Hashes are recomputed from the sources here rather than taken from the
 * build, so a build that hashes wrongly fails instead of agreeing with itself.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { collectTests, hashedName, ASSET_DIRS } = require('./build.js');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(ROOT, process.argv[2] || 'dist');

const failures = [];
function check(condition, message) {
    if (!condition) failures.push(message);
}

function read(relPath) {
    const full = path.join(OUT, relPath);
    return fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : null;
}

/* Every <script src="/tests/..."> on a page. */
function testScripts(html) {
    return [...html.matchAll(/<script src="(\/tests\/[^"]+)"><\/script>/g)].map(m => m[1]);
}

/* Every root-absolute asset a page pulls in. */
function assetRefs(html) {
    return [
        ...[...html.matchAll(/<script src="(\/[^"]+)"/g)].map(m => m[1]),
        ...[...html.matchAll(/<link[^>]+href="(\/[^"]+)"/g)].map(m => m[1])
    ];
}

/* A hashed name looks like base.1a2b3c4d.ext */
function looksHashed(urlPath) {
    return /\.[0-9a-f]{8}\.(js|css)$/.test(urlPath);
}

function verify() {
    const tests = collectTests();

    // What the hashed asset URLs should be, computed from source.
    const expectedAsset = {};
    ASSET_DIRS.forEach(dir => {
        fs.readdirSync(path.join(ROOT, dir)).forEach(file => {
            const buf = fs.readFileSync(path.join(ROOT, dir, file));
            expectedAsset['/' + dir + '/' + file] = '/' + dir + '/' + hashedName(file, buf);
        });
    });
    const expectedScript = {};
    tests.forEach(test => {
        const buf = fs.readFileSync(path.join(ROOT, 'tests', test.sourceFile));
        expectedScript[test.id] = '/tests/' + hashedName(test.sourceFile, buf);
    });

    const listing = read('index.html');
    check(listing !== null, 'index.html is missing');
    check(read('404.html') !== null, '404.html is missing');
    check(read('_redirects') !== null, '_redirects is missing');
    check(read('_headers') !== null, '_headers is missing');

    // Every hashed asset the build claims must exist on disk.
    Object.values(expectedAsset).forEach(url => {
        check(read(url.replace(/^\//, '')) !== null, 'asset ' + url + ' was not emitted');
    });

    // The listing must not pull in any test data — that is what made the old
    // index.html cost 4.3 MB.
    if (listing) {
        check(testScripts(listing).length === 0,
            'index.html loads test data; the listing must only link to tests');
    }

    // Each entry point must start itself. A bad revert once deleted
    // `new ReadingApp()` from app.js and the study page silently rendered
    // nothing, because a class that is never instantiated throws no error.
    [
        { source: '/js/app.js', ctor: 'new ReadingApp()' },
        { source: '/js/questions.js', ctor: 'new QuestionsPage()' }
    ].forEach(({ source, ctor }) => {
        const url = expectedAsset[source];
        const src = url && read(url.replace(/^\//, ''));
        if (!src) {
            failures.push(source + ' was not emitted');
            return;
        }
        check(src.includes(ctor), source + ' never calls ' + ctor + '; the page would render nothing');
        check(/DOMContentLoaded/.test(src), source + ' does not wait for DOMContentLoaded');
    });

    const pages = [{ rel: 'index.html', label: 'index.html' }, { rel: '404.html', label: '404.html' }];
    tests.forEach(test => {
        pages.push({ rel: path.join(test.id, 'index.html'), label: test.id + ' (study)', test, script: '/js/app.js' });
        pages.push({ rel: path.join(test.id, 'questions', 'index.html'), label: test.id + ' (questions)', test, script: '/js/questions.js' });
    });

    pages.forEach(page => {
        const html = read(page.rel);
        if (html === null) {
            failures.push(page.label + ': page missing at ' + page.rel);
            return;
        }

        // No page may reference an unhashed asset, and everything it
        // references must exist.
        assetRefs(html).forEach(ref => {
            check(looksHashed(ref), page.label + ': references unhashed asset ' + ref);
            check(read(ref.replace(/^\//, '')) !== null,
                page.label + ': references ' + ref + ', which was not emitted');
        });

        if (!page.test) return;

        const scripts = testScripts(html);
        check(scripts.length === 1,
            page.label + ': embeds ' + scripts.length + ' test files, expected exactly 1');
        check(scripts[0] === expectedScript[page.test.id],
            page.label + ': embeds ' + scripts[0] + ', expected ' + expectedScript[page.test.id]);
        check(html.includes('window.TEST_ID = ' + JSON.stringify(page.test.id) + ';'),
            page.label + ': window.TEST_ID is not set to ' + page.test.id);
        check(html.includes('"' + expectedAsset[page.script] + '"'),
            page.label + ': does not load ' + page.script);
        check(!html.includes('{{'),
            page.label + ': still contains an unreplaced {{token}}');

        if (listing) {
            check(listing.includes('href="/' + page.test.id + '/"'),
                'index.html does not link to ' + page.test.id);
        }
    });

    // Nothing emitted that no page uses.
    const used = new Set(Object.values(expectedScript));
    const emitted = fs.existsSync(path.join(OUT, 'tests'))
        ? fs.readdirSync(path.join(OUT, 'tests'))
        : [];
    emitted.forEach(file => {
        check(used.has('/tests/' + file), 'tests/' + file + ' was emitted but no page loads it');
    });

    if (failures.length > 0) {
        console.error('Build verification FAILED (' + failures.length + ' problem' +
            (failures.length === 1 ? '' : 's') + '):');
        failures.slice(0, 20).forEach(f => console.error('  - ' + f));
        if (failures.length > 20) console.error('  ... and ' + (failures.length - 20) + ' more');
        process.exit(1);
    }

    console.log('Build verified: ' + tests.length + ' tests, ' + (tests.length * 2) +
        ' test pages, each loading exactly its own data file.');
    console.log('All assets content-hashed and present.');
}

try {
    verify();
} catch (err) {
    console.error('Verification error: ' + err.message);
    process.exit(1);
}
