# IELTS Reading Practice Tool

A web-based tool for practicing IELTS reading skills with sentence-by-sentence analysis
and interactive quiz questions.

## Features

- **Two pages**: [Study] analyze every sentence · [Practice] answer the questions
- **Click-to-Analyze**: Click any sentence to see vocabulary, grammar, and structure analysis
- **Vocabulary**: Word definitions, phonetics, and example sentences
- **Grammar**: Grammar patterns used in each sentence
- **Sentence Structure**: How sentences are built
- **Study Notes**: Additional insights and tips
- **Interactive quiz** per test: TRUE/FALSE/NOT GIVEN, Matching Headings, Multiple Choice, gap-fill
- **Bookmarking**: Save important sentences for review
- **Progress Tracking**: Track which sentences you've viewed (per test)
- **Dark Mode**: Default theme, easy on the eyes

## How to Use

1. **Study** (`index.html`): select a test, click a sentence to read its analysis on the right.
   Use `←` / `→` arrow keys to move between sentences. Bookmark sentences you want to review.
2. **Practice** (`questions.html`): same passage on the left, all questions on the right.
   Click an answer (or type + Check for gap-fill). Your score shows at the bottom; use
   ↺ Reset to try again.
3. A nav bar at the top switches between the two pages. The selected test is shared.

## File Structure

```
reading/
├── index.html          # Study page — reading + sentence analysis
├── questions.html      # Practice page — reading + questions quiz
├── css/
│   └── style.css       # Shared styles for both pages
├── js/
│   ├── common.js       # Shared helpers (theme, test selector)
│   ├── app.js          # Study page logic
│   └── questions.js    # Practice page logic (quiz)
├── tests/
│   ├── aphantasia.js                  # Test 1 — Aphantasia (IELTS 1.1)
│   ├── villains-crooks-gangsters.js   # Test 2 — Life lessons (IELTS 1.2)
│   └── _template.js                   # Copy this to add a new test
└── README.md
```

## Adding a New Reading Test

Each test is one self-contained file in `tests/`. No other file has to change.

1. Copy `tests/_template.js` to `tests/your-test-id.js`
2. Fill in `id`, `title`, `subtitle`, then the passage + analyses + questions
3. Add ONE script tag in **both** `index.html` and `questions.html`, right after the
   existing test files:

```html
<!-- Reading test data: add a new test here -->
<script src="tests/aphantasia.js"></script>
<script src="tests/villains-crooks-gangsters.js"></script>
<script src="tests/your-test-id.js"></script>   <!-- new -->
```

4. Reload the page — the new test appears in the dropdown automatically.

### Data format

```javascript
window.readingTests = window.readingTests || [];

window.readingTests.push({
    id: 'your-test-id',
    title: 'Your Reading Title',
    subtitle: 'Source or description',
    sections: [                       // paragraphs; heading = letter for Matching Headings
        {
            heading: 'A',             // optional
            sentences: [
                'First sentence of paragraph.',
                'Second sentence of paragraph.',
            ]
        },
    ],
    sentences: {
        's1': {
            text: 'First sentence of paragraph.',
            vocabulary: [
                {
                    word: 'word',
                    phonetic: '/fəˈnetɪk/',
                    pos: 'noun/verb/adj',
                    definition: 'meaning',
                    example: 'Example sentence.'
                }
            ],
            grammar: [
                {
                    pattern: 'Grammar pattern name',
                    explanation: 'Explanation of the pattern'
                }
            ],
            structure: {
                type: 'Sentence type',
                explanation: 'Explanation of structure'
            },
            notes: 'Additional study notes'   // string, or [{ text: '...' }]
        },
    },
    questions: [                    // optional — practice questions (quiz)
        {
            type: 'tfng',           // TRUE / FALSE / NOT GIVEN
            number: 1,
            id: 'q1',
            text: 'Statement to judge.',
            answer: 'TRUE',          // TRUE / FALSE / NOT GIVEN
            explanation: 'Why this answer is correct'
        },
        {
            type: 'heading',        // Matching headings (paragraphs A-H)
            number: 14,
            id: 'q14',
            text: 'Heading to match to a paragraph.',
            answer: 'C',            // letter A-H
            explanation: 'Which paragraph and why'
        },
        {
            type: 'mcq',            // Multiple choice
            number: 26,
            id: 'q26',
            text: 'The main goal of this article is to:',
            options: [
                { label: 'A', text: 'Option text' },
                { label: 'B', text: 'Option text' },
                { label: 'C', text: 'Option text' },
                { label: 'D', text: 'Option text' }
            ],
            answer: 'C',
            explanation: 'Why C is correct'
        },
        {
            type: 'gap',            // Fill in the blank
            number: 9,
            id: 'q9',
            textBefore: 'Part of sentence before the blank',
            textAfter: 'part after the blank.',
            answers: ['answer', 'answer variant'],
            explanation: 'Which line in the passage gives the answer'
        }
    ]
});
```

**Question types supported:**
- `tfng` — TRUE/FALSE/NOT GIVEN (click buttons)
- `heading` — Matching headings, letters A-H (click letters)
- `mcq` — Multiple choice A/B/C/D (click options)
- `gap` — Fill in the blank (type answer + Check)

### Numbering rules

- Sentence ids are `s1, s2, s3...` numbered sequentially across all sections.
- Question ids are `q<number>` using the real IELTS question numbers (e.g. q14).
- The passage text in `sections[...].sentences` must exactly match the value of
  `text` in each `sentences['sX']` entry.

## Tips for Creating Good Analyses

1. **Vocabulary**: Focus on academic words, collocations, and idioms
2. **Grammar**: Identify tenses, clause types, and special structures
3. **Structure**: Explain sentence types (simple, compound, complex)
4. **Notes**: Add cultural context, IELTS tips, or usage notes

## Browser Support

Works in all modern browsers (Chrome, Firefox, Safari, Edge). No build step — just
open `index.html` / `questions.html` in a browser.

## License

Free to use for educational purposes.