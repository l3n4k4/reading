/*
 * Assert that dist/ is a correct build, not merely a build that ran.
 *
 *   node tools/verify-build.js [outDir]     (default: dist)
 *
 * The property that matters: each page loads exactly one test data file, and
 * it is that page's own test. That is the whole point of the per-test pages,
 * and it is the thing a careless template edit would silently undo.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { collectTests } = require('./build.js');

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
    return [...html.matchAll(/<script src="\/tests\/([^"]+)"><\/script>/g)].map(m => m[1]);
}

function verify() {
    const tests = collectTests();

    const listing = read('index.html');
    check(listing !== null, 'index.html is missing');
    check(read('404.html') !== null, '404.html is missing');
    check(read('_redirects') !== null, '_redirects is missing');
    check(read('css/style.css') !== null, 'css/style.css was not copied');
    check(read('js/common.js') !== null, 'js/common.js was not copied');
    check(read('js/app.js') !== null, 'js/app.js was not copied');
    check(read('js/questions.js') !== null, 'js/questions.js was not copied');

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
        { file: 'js/app.js', ctor: 'new ReadingApp()' },
        { file: 'js/questions.js', ctor: 'new QuestionsPage()' }
    ].forEach(({ file, ctor }) => {
        const src = read(file);
        if (src === null) return; // already reported missing above
        check(src.includes(ctor), file + ' never calls ' + ctor + '; the page would render nothing');
        check(/DOMContentLoaded/.test(src), file + ' does not wait for DOMContentLoaded');
    });

    tests.forEach(test => {
        const pages = [
            { rel: path.join(test.id, 'index.html'), label: test.id + ' (study)', script: '/js/app.js' },
            { rel: path.join(test.id, 'questions', 'index.html'), label: test.id + ' (questions)', script: '/js/questions.js' }
        ];

        pages.forEach(page => {
            const html = read(page.rel);
            if (html === null) {
                failures.push(page.label + ': page missing at ' + page.rel);
                return;
            }

            const scripts = testScripts(html);
            check(scripts.length === 1,
                page.label + ': embeds ' + scripts.length + ' test files, expected exactly 1');
            check(scripts[0] === test.sourceFile,
                page.label + ': embeds ' + scripts[0] + ', expected ' + test.sourceFile);
            check(read(path.join('tests', test.sourceFile)) !== null,
                page.label + ': references tests/' + test.sourceFile + ', which was not emitted');
            check(html.includes('window.TEST_ID = ' + JSON.stringify(test.id) + ';'),
                page.label + ': window.TEST_ID is not set to ' + test.id);
            check(html.includes(page.script),
                page.label + ': does not load ' + page.script);
            check(!html.includes('{{'),
                page.label + ': still contains an unreplaced {{token}}');
        });

        if (listing) {
            check(listing.includes('href="/' + test.id + '/"'),
                'index.html does not link to ' + test.id);
        }
    });

    // Nothing in dist/tests/ that no page uses.
    const emitted = fs.existsSync(path.join(OUT, 'tests'))
        ? fs.readdirSync(path.join(OUT, 'tests'))
        : [];
    const used = new Set(tests.map(t => t.sourceFile));
    emitted.forEach(file => {
        check(used.has(file), 'tests/' + file + ' was emitted but no page loads it');
    });

    if (failures.length > 0) {
        console.error('Build verification FAILED (' + failures.length + ' problem' +
            (failures.length === 1 ? '' : 's') + '):');
        failures.forEach(f => console.error('  - ' + f));
        process.exit(1);
    }

    console.log('Build verified: ' + tests.length + ' tests, ' + (tests.length * 2) +
        ' test pages, each loading exactly its own data file.');
}

try {
    verify();
} catch (err) {
    console.error('Verification error: ' + err.message);
    process.exit(1);
}
