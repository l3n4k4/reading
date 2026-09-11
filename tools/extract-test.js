#!/usr/bin/env node
/**
 * Extract a reading test from a downloaded ielts-up.com sample HTML file.
 *
 * Usage: node tools/extract-test.js <file.html>
 * Prints one JSON object:
 *   {
 *     url, title, subtitle,
 *     paragraphs: [{ heading: 'A'|null, text: '...' }],
 *     blocks: [                     // flat text blocks in the question area
 *       { number, text, widgets: [{kind:'select'|'ex-input', id, options:[{text,correct}]}] }
 *     ],
 *     answersDiv: 'raw text from <div id="answers">' | null,
 *     checkJsAnswers: { exN: 'answer', ... }            // from inline check() JS
 *   }
 *
 * Correctness of answers comes from three sources (most→least reliable):
 *   1) <select> options with value="1"  → the correct option
 *   2) the inline check() JS: `var ex=[...]` arrays and `exN!="answer"` strings
 *   3) the <div id="answers"> text block (cross-check)
 */
'use strict';

const fs = require('fs');
const pathMod = require('path');

function decodeEntities(s) {
    const map = {
        '&rsquo;': "'", '&lsquo;': "'", '&ldquo;': '"', '&rdquo;': '"',
        '&quot;': '"', '&amp;': '&', '&lt;': '<', '&gt;': '>',
        '&ndash;': '–', '&mdash;': '—', '&emsp;': ' ', '&nbsp;': ' ',
        '&hellip;': '…', '&#39;': "'", '&pound;': '£', '&euro;': '€'
    };
    return s.replace(/&[a-zA-Z#0-9]+;/g, (m) => map[m.toLowerCase()] || m);
}

function stripTags(s) {
    return decodeEntities(s.replace(/<[^>]+>/g, ' ')).replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, ' ').trim();
}

function innerHtml(html, openTag, closeTag) {
    const i = html.indexOf(openTag);
    if (i === -1) return '';
    const j = html.indexOf(closeTag, i + openTag.length);
    if (j === -1) return '';
    return html.slice(i + openTag.length, j);
}

function parseCheckJs(html) {
    const map = {};
    const scriptRe = /<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g;
    let m;
    while ((m = scriptRe.exec(html)) !== null) {
        const block = m[1];

        // var ex = ["d","a",...] — sequential answers for ex-inputs
        const arrM = block.match(/var\s+ex\s*=\s*\[([^\]]*)\]/);
        if (arrM) {
            const items = arrM[1].match(/"([^"]*)"/g) || [];
            items.map(x => x.slice(1, -1)).forEach((v, idx) => {
                map['ex' + (idx + 1)] = v.trim().toLowerCase();
            });
        }

        // inline: if (ex1.trim().toLowerCase()!="h") { ... }
        const cmpRe = /ex(\d+)\s*\.\s*trim\(\)\s*\.\s*toLowerCase\(\)\s*!=\s*(?:"|&quot;)(.*?)(?:"|&quot;)/g;
        let cm;
        while ((cm = cmpRe.exec(block)) !== null) {
            if (cm[2].trim()) map['ex' + cm[1]] = cm[2].trim().toLowerCase();
        }
        // inline: getElementById("exN").value ... != "answer"  (same statement or next)
        const idvRe = /getElementById\(\s*"(ex\d+)"\s*\)\s*\.\s*value\s*!=\s*(?:"|&quot;)(.*?)(?:"|&quot;)/g;
        while ((cm = idvRe.exec(block)) !== null) {
            if (cm[2].trim()) map[cm[1]] = cm[2].trim().toLowerCase();
        }
        // 0-based "ex"+i loops reading array index — handled by var ex above
    }
    return map;
}

// Split question-area HTML into flat blocks. Each block is a <p>, <li> or a
// bare widget that sits outside both. Returns [{html, isLi}].
function splitBlocks(area) {
    const blocks = [];
    let rest = area;
    const tokenRe = /(<p[^>]*>[\s\S]*?<\/p>|<li>[\s\S]*?<\/li>)/g;
    let cursor = 0;
    let m;
    const guard = [];
    while ((m = tokenRe.exec(area)) !== null) {
        if (m.index > cursor) {
            guard.push(area.slice(cursor, m.index));
        }
        blocks.push({ html: m[0], isLi: m[0].startsWith('<li') });
        cursor = tokenRe.lastIndex;
        if (guard.length > 200) break;
    }
    if (cursor < area.length) guard.push(area.slice(cursor));
    return { blocks, guard };
}

function trimGuards(guardText) {
    // bare widgets sitting between <p>/<li> blocks (rare) become their own block
    const items = [];
    const widgetRe = /<select[^>]*>[\s\S]*?<\/select>|<input[^>]*class=["']ex-input["'][^>]*>/g;
    let m;
    while ((m = widgetRe.exec(guardText)) !== null) items.push(m[0]);
    return items;
}

function parseWidgets(html) {
    const widgets = [];
    // inline ex-input
    for (const m of html.matchAll(/<input[^>]*class=["'][^"']*ex-input[^"']*["'][^>]*id=["'](ex\d+)["'][^>]*>/g)) {
        widgets.push({ kind: 'ex-input', id: m[1], options: [] });
    }
    for (const m of html.matchAll(/<select[^>]*id=["'](select\d+)["'][^>]*>([\s\S]*?)<\/select>/g)) {
        const opts = [];
        for (const om of m[2].matchAll(/<option([^>]*)>([\s\S]*?)<\/option>/g)) {
            const correct = /\bvalue="1"/.test(om[1]);
            opts.push({ text: stripTags(om[2]), correct });
        }
        widgets.push({ kind: 'select', id: m[1], options: opts });
    }
    return widgets;
}

function extractFromBlock(html) {
    const widgets = parseWidgets(html);
    let text = stripTags(html);
    for (const w of widgets) {
        text = stripTags(html).replace(new RegExp(escapeRegExp(w.id === 'ex' ? '' : ''), 'g'), '');
    }
    // drop widget markup from the text
    text = stripTags(html.replace(/<select[\s\S]*?<\/select>/g, ' [_] ').replace(/<input[^>]*>/g, ' [_] '));
    text = text.replace(/\s*\[\s*_\]\s*/g, ' [_] ');
    // leading number prefix "<strong>1. </strong>"
    let number = null;
    const nm = text.match(/^(\d{1,2})\.\s+/);
    if (nm) {
        number = parseInt(nm[1], 10);
        text = text.slice(nm[0].length);
    }
    // collapse underscores added by consecutive widgets
    text = text.replace(/(\[\s*_\s*\])+/g, ' [_] ');
    return { number, text, widgets };
}

function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parsePassage(html) {
    let body = innerHtml(html, '<div class="exam-text">', '</div>');
    body = body.replace(/<\/?noindex>/g, '');
    body = body.replace(/<p[^>]*>/g, '\u0000')
               .replace(/<\/p>/g, '\u0000')
               .replace(/<br\s*\/?>/g, '\u0000')
               .replace(/<div[^>]*>/g, '\u0000')
               .replace(/<\/div>/g, '\u0000');

    const paragraphs = [];
    for (const chunk of body.split('\u0000')) {
        let text = decodeEntities(chunk).replace(/<[^>]+>/g, ' ').replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, ' ').trim();
        if (!text) continue;

        let heading = null;
        const hm = text.match(/^\(([A-H])\)\s+(.+)$/);
        if (hm) {
            heading = hm[1];
            text = hm[2];
        } else {
            const bm = text.match(/^([A-H])\.?\s+(.+)$/);
            if (bm && /^[A-H]$/.test(bm[1])) {
                heading = bm[1];
                text = bm[2];
            }
        }
        paragraphs.push({ heading, text });
    }
    return paragraphs;
}

function main() {
    const file = process.argv[2];
    if (!file) {
        console.error('usage: node tools/extract-test.js <file.html>');
        process.exit(1);
    }
    const html = fs.readFileSync(pathMod.resolve(file), 'utf8');

    const titleM = html.match(/<h1>\s*([^<]+?)<\/h1>/);
    const answersM = html.match(/<div id="answers"[^>]*>([\s\S]*?)<\/div>/);
    const url = 'https://ielts-up.com/reading/' + pathMod.basename(file);

    // Question area: from the first group header AFTER the passage to the answers div
    const examStart = html.indexOf('<div class="exam-text">');
    const examEnd = examStart !== -1 ? html.indexOf('</div>', examStart) : -1;
    const qStart = (examEnd !== -1 ? html.indexOf('<strong>Questions ', examEnd) : -1) === -1
        ? html.indexOf('<strong>Questions ')
        : html.indexOf('<strong>Questions ', examEnd);
    const qEnd = html.indexOf('<div id="answers"');
    const qAreaEnd = qEnd !== -1 ? qEnd : html.length;
    const qArea = qStart !== -1 ? html.slice(qStart, qAreaEnd) : '';

    const { blocks, guard } = splitBlocks(qArea);
    const parsed = [];
    for (const b of blocks) {
        const o = extractFromBlock(b.html);
        if (o.text.trim() !== '' || o.widgets.length > 0) parsed.push(o);
    }
    // bare widgets floating between blocks
    const guardWidgets = trimGuards(guard.join('\n'));

    // Number implicit questions (li-based) with a running counter
    let implicit = 0;
    for (const o of parsed) {
        if (o.number !== null) {
            implicit = o.number;
        } else if (o.widgets.length > 0) {
            o.number = ++implicit;
        }
    }

    const checkJsAnswers = parseCheckJs(html);

    const out = {
        url,
        title: titleM ? stripTags(titleM[1]) : '',
        paragraphs: parsePassage(html),
        blocks: parsed,
        guardWidgets,
        answersDiv: answersM ? stripTags(answersM[1]) : null,
        checkJsAnswers
    };
    console.log(JSON.stringify(out, null, 2));
}

main();