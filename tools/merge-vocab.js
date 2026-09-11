#!/usr/bin/env node
/**
 * Merge vocabulary enrichment (paraphrase + collocations) into a test file.
 *
 * Usage: node tools/merge-vocab.js <wordmap.json> <test-file.js>
 *
 * wordmap.json shape:
 *   {
 *     "gazing": {
 *       "en": "looking steadily at something",
 *       "vi": "nhìn chăm chú",
 *       "collocations": ["gaze at", "gaze into"]
 *     },
 *     ...
 *   }
 * Keys are lowercased words. Every vocabulary entry whose word matches a key
 * gets { "paraphrase": { en, vi }, "collocations": [...] } added (existing
 * values are left untouched, so re-running is safe).
 *
 * The rest of the test file (header comments, structure) is preserved.
 */
'use strict';

const fs = require('fs');
const vm = require('vm');

function main() {
    const [mapFile, testFile] = process.argv.slice(2);
    if (!mapFile || !testFile) {
        console.error('usage: node tools/merge-vocab.js <wordmap.json> <test-file.js>');
        process.exit(1);
    }

    const map = JSON.parse(fs.readFileSync(mapFile, 'utf8'));
    const src = fs.readFileSync(testFile, 'utf8');

    const marker = 'window.readingTests.push(';
    const i0 = src.indexOf(marker);
    if (i0 === -1) {
        console.error('marker not found: ' + marker);
        process.exit(1);
    }

    // Find the matching close of the object literal (brace-aware, string-safe).
    let jStart, jEnd, brace = 0, inStr = false, esc = false;
    for (let i = src.indexOf('{', i0); i < src.length; i++) {
        const c = src[i];
        if (inStr) {
            if (esc) esc = false;
            else if (c === '\\') esc = true;
            else if (c === '"') inStr = false;
            continue;
        }
        if (c === '"') inStr = true;
        else if (c === '{') { brace++; if (brace === 1) jStart = i; }
        else if (c === '}') { brace--; if (brace === 0) { jEnd = i + 1; break; } }
    }
    if (!jStart) {
        console.error('could not locate object body');
        process.exit(1);
    }

    const body = src.slice(jStart, jEnd);
    let data;
    try {
        data = vm.runInNewContext('(' + body + ')');
    } catch (err) {
        console.error('parse failed: ' + err.message);
        process.exit(1);
    }

    let matched = 0;
    let missing = [];
    for (const sid of Object.keys(data.sentences || {})) {
        const vocab = data.sentences[sid].vocabulary || [];
        for (const entry of vocab) {
            const key = String(entry.word || '').trim().toLowerCase();
            if (!key) continue;
            if (!(key in map)) { missing.push(key); continue; }
            const m = map[key];
            if (!entry.paraphrase) {
                entry.paraphrase = { en: m.en, vi: m.vi };
                matched++;
            }
            if (!entry.collocations) {
                entry.collocations = Array.isArray(m.collocations) ? m.collocations : [];
            }
        }
    }

    const header = src.slice(0, i0);
    const tail = src.slice(jEnd);
    const out = header + marker + JSON.stringify(data, null, 2) + tail;
    fs.writeFileSync(testFile, out);

    console.log(JSON.stringify({ matched, uniqueWords: matched, missingFromMap: [...new Set(missing)] }));
}

main();