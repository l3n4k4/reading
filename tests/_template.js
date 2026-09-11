/*
 * TEMPLATE for a new reading test.
 *
 * HOW TO ADD A TEST:
 *   1. Copy this file to  tests/<your-test-id>.js
 *   2. Fill in id, title, sentences and questions below.
 *   3. Add ONE script tag in BOTH pages:  tests/<your-test-id>.js
 *      (in index.html and questions.html, right after the other test files)
 *   4. Reload the page and pick the new test from the dropdown.
 *   Nothing else needs to change — the test is picked up automatically.
 *
 * Sentence ids are "s1", "s2", ... per test (start from 1).
 * Question ids are "q14", "q15", ... — use the REAL IELTS question numbers.
 */

window.readingTests = window.readingTests || [];

window.readingTests.push({
    // unique id used on the test selector and in localStorage progress
    id: 'my-reading-test',

    // text shown in the dropdown / page title
    title: 'My Reading Test',

    // small italic line under the title
    subtitle: 'IELTS Academic 1 — Passage 3',

    // OPTIONAL: paragraphs grouped by heading (for Matching Headings questions).
    // Each section's "sentences" array MUST match the ids in `sentences` below (s1, s2, ...).
    sections: [
        // { heading: 'A', sentences: ['<s1 text>', '<s2 text>', ...] },
        // { heading: 'B', sentences: ['<s3 text>', ...] }
    ],

    // sentence id -> details shown in the Analysis panel
    sentences: {
        's1': {
            'text': 'The full original sentence goes here.',
            'vocabulary': [
                {
                    'word': 'example',
                    'phonetic': '/ɪɡˈzɑːmpəl/',
                    'pos': 'noun',
                    'definition': 'something used to show what another thing is like',
                    'example': 'This is an example sentence.',
                    'paraphrase': {
                        'en': 'a sample; a typical case of something',
                        'vi': 'ví dụ, thí dụ'
                    },
                    'collocations': [
                        'a good example of ...',
                        'for example',
                        'set an example'
                    ]
                }
            ],
            'grammar': [
                {
                    'pattern': 'Subject + Verb + Object',
                    'explanation': 'Short explanation of the pattern used here.'
                }
            ],
            'structure': {
                'type': 'Simple sentence',
                'explanation': 'Why this structure is useful / what to notice.'
            },
            'notes': 'Any study tip, collocation or idiom worth remembering.'
        }
        // 's2': { ... }
    },

    // OPTIONAL: quiz questions. Types:
    //   'tfng'   — True / False / Not Given            (answers: TRUE / FALSE / NOT GIVEN)
    //   'ynng'   — Yes / No / Not Given                (answers: YES / NO / NOT GIVEN)
    //   'heading'— match a heading to a paragraph      (answers: A, B, C, ...)
    //   'mcq'    — multiple choice A/B/C/D             (answers: 'A', 'B', ...)
    //   'gap'    — type a word(s)                      (answers: ['word1', 'word with spaces'])
    //              Two-blank questions use 'blanks': [['word1'], ['word2']]
    questions: [
        // {
        //     'type': 'tfng',
        //     'number': 1,
        //     'id': 'q1',
        //     'text': 'The statement to judge.',
        //     'answer': 'TRUE',
        //     'explanation': 'Why the answer is TRUE.'
        // },
        // {
        //     'type': 'heading',
        //     'number': 14,
        //     'id': 'q14',
        //     'text': 'A heading title to match with a paragraph',
        //     'answer': 'C',
        //     'explanation': 'Paragraph C ...'
        // },
        // {
        //     'type': 'mcq',
        //     'number': 26,
        //     'id': 'q26',
        //     'text': 'Choose the correct letter, A, B, C or D.',
        //     'options': [
        //         { 'label': 'A', 'text': 'Option A text' },
        //         { 'label': 'B', 'text': 'Option B text' },
        //         { 'label': 'C', 'text': 'Option C text' },
        //         { 'label': 'D', 'text': 'Option D text' }
        //     ],
        //     'answer': 'C',
        //     'explanation': 'Why C is correct.'
        // },
        // {
        //     'type': 'gap',
        //     'number': 22,
        //     'id': 'q22',
        //     'textBefore': 'Write NO MORE THAN ONE WORD: the answer is',
        //     'textAfter': '.',
        //     'answers': ['keyword'],
        //     'explanation': 'Paragraph X contains the word.'
        // }
    ]
});