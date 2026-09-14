/*
 * Build the static site into dist/.
 *
 *   node tools/build.js [outDir]     (default: dist)
 *
 * Emits one page per test so a visitor downloads only the test they opened,
 * instead of all 43 test files. Reads each tests/*.js the same way
 * tools/merge-vocab.js does: run it against a stub window and read back what
 * it pushed.
 *
 * Every CSS/JS asset is emitted under a content-hashed name. Changing a file
 * changes its URL, so a browser can never serve a stale copy alongside fresh
 * HTML — which is exactly how a fixed app.js once went unseen for four hours
 * behind max-age=14400.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const TESTS_DIR = path.join(ROOT, 'tests');
const TEMPLATES = path.join(__dirname, 'templates');
const OUT = path.resolve(ROOT, process.argv[2] || 'dist');

/* Directories whose files are copied under content-hashed names. */
const ASSET_DIRS = ['css', 'js'];

/* Groups, in the order they appear on the listing page. Any id whose prefix
 * is not listed here lands in "Other". */
const GROUPS = [
    { prefix: 'academic', label: 'Academic' },
    { prefix: 'general', label: 'General Training' }
];
const OTHER_LABEL = 'Other';

function escapeHtml(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/* Short content hash. Long enough that a collision is not a practical
 * concern for a few dozen files. */
function hashOf(buf) {
    return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 8);
}

/* "app.js" + contents -> "app.1a2b3c4d.js" */
function hashedName(fileName, buf) {
    const ext = path.extname(fileName);
    return fileName.slice(0, fileName.length - ext.length) + '.' + hashOf(buf) + ext;
}

/* Sort so academic-2 comes before academic-10, which a plain string sort
 * gets backwards. */
function naturalCompare(a, b) {
    const split = s => s.match(/\d+|\D+/g) || [];
    const pa = split(a);
    const pb = split(b);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const x = pa[i];
        const y = pb[i];
        if (x === undefined) return -1;
        if (y === undefined) return 1;
        const nx = /^\d/.test(x);
        const ny = /^\d/.test(y);
        if (nx && ny) {
            const d = parseInt(x, 10) - parseInt(y, 10);
            if (d !== 0) return d;
        } else if (x !== y) {
            return x < y ? -1 : 1;
        }
    }
    return 0;
}

/* Run a test file against a stub window and return whatever it pushed. */
function readTestFile(file) {
    const src = fs.readFileSync(file, 'utf8');
    const sandbox = { window: {} };
    vm.createContext(sandbox);
    try {
        vm.runInContext(src, sandbox, { filename: file, timeout: 5000 });
    } catch (err) {
        throw new Error('could not evaluate ' + path.basename(file) + ': ' + err.message);
    }
    const pushed = sandbox.window.readingTests;
    if (!Array.isArray(pushed) || pushed.length === 0) {
        throw new Error(path.basename(file) + ' pushed no tests onto window.readingTests');
    }
    return pushed;
}

function collectTests() {
    const files = fs.readdirSync(TESTS_DIR)
        .filter(f => f.endsWith('.js') && f !== '_template.js');

    const tests = [];
    const seen = new Map();

    files.forEach(file => {
        const full = path.join(TESTS_DIR, file);
        readTestFile(full).forEach(test => {
            if (!test.id) throw new Error(file + ' contains a test with no id');
            if (!test.title) throw new Error(file + ' (' + test.id + ') has no title');
            if (seen.has(test.id)) {
                throw new Error('duplicate test id "' + test.id + '" in ' + file +
                    ' and ' + seen.get(test.id));
            }
            seen.set(test.id, file);
            tests.push({
                id: test.id,
                title: test.title,
                subtitle: test.subtitle || '',
                sourceFile: file
            });
        });
    });

    if (tests.length === 0) throw new Error('no tests found in ' + TESTS_DIR);
    tests.sort((a, b) => naturalCompare(a.id, b.id));
    return tests;
}

function groupTests(tests) {
    const buckets = new Map();
    GROUPS.forEach(g => buckets.set(g.label, []));
    buckets.set(OTHER_LABEL, []);

    tests.forEach(test => {
        const prefix = test.id.split('-')[0];
        const group = GROUPS.find(g => g.prefix === prefix);
        buckets.get(group ? group.label : OTHER_LABEL).push(test);
    });

    return [...buckets].filter(([, items]) => items.length > 0);
}

function readTemplate(name) {
    return fs.readFileSync(path.join(TEMPLATES, name), 'utf8');
}

function write(relPath, contents) {
    const full = path.join(OUT, relPath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, contents);
}

/* Copy every css/ and js/ file under a hashed name.
 * Returns { "/js/app.js": "/js/app.1a2b3c4d.js", ... } */
function emitAssets() {
    const map = {};
    ASSET_DIRS.forEach(dir => {
        fs.readdirSync(path.join(ROOT, dir)).forEach(file => {
            const buf = fs.readFileSync(path.join(ROOT, dir, file));
            const out = hashedName(file, buf);
            write(path.join(dir, out), buf);
            map['/' + dir + '/' + file] = '/' + dir + '/' + out;
        });
    });
    return map;
}

/* Point every asset reference in a page at its hashed URL. */
function rewriteAssets(html, assetMap) {
    return Object.entries(assetMap).reduce(
        (out, [from, to]) => out.split('"' + from + '"').join('"' + to + '"'),
        html
    );
}

function renderListing(tests) {
    const groups = groupTests(tests).map(([label, items]) => {
        const rows = items.map(test =>
            '                <li class="test-item">\n' +
            '                    <a class="test-item-main" href="/' + test.id + '/">\n' +
            '                        <span class="test-item-title">' + escapeHtml(test.title) + '</span>\n' +
            (test.subtitle
                ? '                        <span class="test-item-subtitle">' + escapeHtml(test.subtitle) + '</span>\n'
                : '') +
            '                    </a>\n' +
            '                    <a class="test-item-quiz" href="/' + test.id + '/questions/" title="Practice questions">✍️</a>\n' +
            '                </li>'
        ).join('\n');

        return '        <section class="test-group">\n' +
            '            <h2 class="test-group-title">' + escapeHtml(label) +
            ' <span class="test-group-count">' + items.length + '</span></h2>\n' +
            '            <ul class="test-list">\n' + rows + '\n' +
            '            </ul>\n' +
            '        </section>';
    }).join('\n\n');

    return readTemplate('list.html')
        .replace('{{COUNT}}', String(tests.length))
        .replace('{{GROUPS}}', groups);
}

function renderTestPage(template, test) {
    const scriptTag = '<script src="' + test.scriptPath + '"></script>';
    return template
        .split('{{TITLE}}').join(escapeHtml(test.title))
        .split('{{ID_JSON}}').join(JSON.stringify(test.id))
        .split('{{ID}}').join(test.id)
        .split('{{TEST_SCRIPT}}').join(scriptTag);
}

/* Hashed assets never change content, so they can be cached forever.
 * HTML keeps Pages' default (max-age=0, must-revalidate) so a deploy is
 * visible immediately. */
const HEADERS = [
    '/css/*',
    '  Cache-Control: public, max-age=31536000, immutable',
    '/js/*',
    '  Cache-Control: public, max-age=31536000, immutable',
    '/tests/*',
    '  Cache-Control: public, max-age=31536000, immutable',
    ''
].join('\n');

function build() {
    const tests = collectTests();

    fs.rmSync(OUT, { recursive: true, force: true });
    fs.mkdirSync(OUT, { recursive: true });

    const assetMap = emitAssets();

    // Only the test files that back a page, each under a hashed name.
    const emittedFor = new Map();
    tests.forEach(test => {
        if (!emittedFor.has(test.sourceFile)) {
            const buf = fs.readFileSync(path.join(TESTS_DIR, test.sourceFile));
            const out = hashedName(test.sourceFile, buf);
            write(path.join('tests', out), buf);
            emittedFor.set(test.sourceFile, '/tests/' + out);
        }
        test.scriptPath = emittedFor.get(test.sourceFile);
    });

    write('index.html', rewriteAssets(renderListing(tests), assetMap));
    write('404.html', rewriteAssets(readTemplate('404.html'), assetMap));
    write('_redirects', '/questions /  302\n/questions.html /  302\n/index.html /  302\n');
    write('_headers', HEADERS);

    const studyTpl = readTemplate('study.html');
    const questionsTpl = readTemplate('questions.html');
    tests.forEach(test => {
        write(path.join(test.id, 'index.html'),
            rewriteAssets(renderTestPage(studyTpl, test), assetMap));
        write(path.join(test.id, 'questions', 'index.html'),
            rewriteAssets(renderTestPage(questionsTpl, test), assetMap));
    });

    console.log('Built ' + tests.length + ' tests (' + emittedFor.size + ' data files) into ' +
        path.relative(ROOT, OUT) + '/');
    console.log('  ' + (tests.length * 2 + 2) + ' HTML pages, ' +
        Object.keys(assetMap).length + ' hashed assets');
}

module.exports = { collectTests, naturalCompare, hashOf, hashedName, ASSET_DIRS, OUT, TESTS_DIR };

if (require.main === module) {
    try {
        build();
    } catch (err) {
        console.error('Build failed: ' + err.message);
        process.exit(1);
    }
}
