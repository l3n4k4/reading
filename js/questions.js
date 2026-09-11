/**
 * Practice page (questions.html) — reading passage + interactive questions.
 */
'use strict';

class QuestionsPage {
    constructor() {
        this.currentTest = null;
        this.currentSentence = null;
        this.sentenceElements = [];
        this.answeredQuestions = new Set();
        this.quizAnswers = new Map(); // qid -> { answer, correct }

        this.init();
    }

    init() {
        // DOM Elements
        this.testSelect = document.getElementById('testSelect');
        this.readingTitle = document.getElementById('readingTitle');
        this.readingSubtitle = document.getElementById('readingSubtitle');
        this.readingContent = document.getElementById('readingContent');
        this.questionsPanel = document.getElementById('questionsView');

        // Bind events
        this.testSelect.addEventListener('change', () => this.loadTest(this.testSelect.value));

        // Populate test selector (preserves saved test)
        const savedTest = populateTestSelector(this.testSelect, 'currentTest');
        this.loadTest(savedTest);

        initTheme(document.getElementById('themeToggle'));
    }

    loadTest(testId) {
        this.currentTest = getReadingTest(testId);
        if (!this.currentTest) return;

        localStorage.setItem('currentTest', testId);

        this.readingTitle.textContent = this.currentTest.title;
        this.readingSubtitle.textContent = this.currentTest.subtitle;

        this.renderReading();
        this.renderQuestions();
    }

    renderReading() {
        this.readingContent.innerHTML = '';
        this.sentenceElements = [];
        let sentenceIndex = 0;

        this.currentTest.sections.forEach(section => {
            if (section.heading) {
                const heading = document.createElement('h3');
                heading.className = 'section-heading';
                heading.textContent = section.heading;
                this.readingContent.appendChild(heading);
            }

            const paragraph = document.createElement('p');

            section.sentences.forEach(sentenceText => {
                sentenceIndex++;
                const sentenceId = `s${sentenceIndex}`;

                const sentenceEl = document.createElement('span');
                sentenceEl.className = 'sentence';
                sentenceEl.dataset.id = sentenceId;
                sentenceEl.innerHTML = `
                    <span class="sentence-number">${sentenceIndex}</span>
                    ${sentenceText}
                `;

                sentenceEl.addEventListener('click', () => this.toggleSentence(sentenceEl));

                paragraph.appendChild(sentenceEl);
                this.sentenceElements.push({ id: sentenceId, element: sentenceEl });
            });

            this.readingContent.appendChild(paragraph);
        });
    }

    // Clicking a sentence on the questions page just highlights it so you can
    // keep your place while answering. No analysis panel here — that's the
    // study page (index.html).
    toggleSentence(element) {
        this.sentenceElements.forEach(s => s.element.classList.remove('active'));
        element.classList.add('active');
        this.currentSentence = element.dataset.id;
    }

    renderQuestions() {
        const questions = this.currentTest.questions;
        this.questionsPanel.innerHTML = '';
        this.answeredQuestions = new Set();
        this.quizAnswers = new Map();

        if (!questions || questions.length === 0) {
            this.questionsPanel.innerHTML = `
                <div class="questions-instructions">No practice questions available for this test yet.</div>
            `;
            return;
        }

        const tfngQuestions = questions.filter(q => q.type === 'tfng');
        const ynngQuestions = questions.filter(q => q.type === 'ynng');
        const headingQuestions = questions.filter(q => q.type === 'heading');
        const mcqQuestions = questions.filter(q => q.type === 'mcq');
        const gapQuestions = questions.filter(q => q.type === 'gap');

        let html = '';

        html += `<div class="questions-instructions">
            You should spend about 20 minutes on the questions, which are based on the Reading Passage.
            Write your answers, then click to check.
        </div>`;

        if (tfngQuestions.length > 0) {
            html += `<div class="question-group-title">Questions ${tfngQuestions[0].number}-${tfngQuestions[tfngQuestions.length - 1].number} — TRUE / FALSE / NOT GIVEN</div>`;
            html += `<div class="questions-instructions">
                Do the following statements agree with the information in the reading text?
                <br><b>TRUE</b> if the statement agrees with the information
                <br><b>FALSE</b> if the statement contradicts the information
                <br><b>NOT GIVEN</b> if there is no information on this
            </div>`;

            tfngQuestions.forEach(q => {
                html += this.renderOptionQuestion(q, ['TRUE', 'FALSE', 'NOT GIVEN']);
            });
        }

        if (ynngQuestions.length > 0) {
            html += `<div class="question-group-title">Questions ${ynngQuestions[0].number}-${ynngQuestions[ynngQuestions.length - 1].number} — YES / NO / NOT GIVEN</div>`;
            html += `<div class="questions-instructions">
                Do the following statements agree with the <b>views of the writer</b>?
                <br><b>YES</b> if the statement agrees with the views of the writer
                <br><b>NO</b> if the statement contradicts the views of the writer
                <br><b>NOT GIVEN</b> if it is impossible to say what the writer thinks about this
            </div>`;

            ynngQuestions.forEach(q => {
                html += this.renderOptionQuestion(q, ['YES', 'NO', 'NOT GIVEN']);
            });
        }

        if (headingQuestions.length > 0) {
            const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
            html += `<div class="question-group-title">Questions ${headingQuestions[0].number}-${headingQuestions[headingQuestions.length - 1].number} — Matching Headings</div>`;
            html += `<div class="questions-instructions">
                The passage has paragraphs marked <b>A-H</b>. Match the headings below with the correct paragraph.
                Write the correct letter, <b>A-H</b>, in the boxes.
            </div>`;

            headingQuestions.forEach(q => {
                html += this.renderOptionQuestion(q, letters);
            });
        }

        if (mcqQuestions.length > 0) {
            html += `<div class="question-group-title">Questions ${mcqQuestions[0].number} — Multiple Choice</div>`;
            html += `<div class="questions-instructions">
                Choose the correct letter, <b>A</b>, <b>B</b>, <b>C</b> or <b>D</b>.
            </div>`;

            mcqQuestions.forEach(q => {
                html += `
                    <div class="question-item" data-qid="${q.id}">
                        <div class="question-text"><span class="question-number">${q.number}</span>${q.text}</div>
                        <div class="answer-options">
                        ${q.options.map(opt => `<button class="opt-btn" data-answer="${opt.label}">${opt.label}. ${opt.text}</button>`).join('')}
                        </div>
                        <div class="feedback"></div>
                        <div class="explanation">${q.explanation}</div>
                    </div>
                `;
            });
        }

        if (gapQuestions.length > 0) {
            html += `<div class="question-group-title">Questions ${gapQuestions[0].number}-${gapQuestions[gapQuestions.length - 1].number} — Complete the sentences</div>`;
            html += `<div class="questions-instructions">
                Complete the sentences below. Write your answer (ONE WORD or a short phrase) from the passage for each answer.
            </div>`;

            gapQuestions.forEach(q => {
                const blankCount = q.blanks ? q.blanks.length : 1;
                const inputsHtml = Array.from({ length: blankCount }, (_, i) =>
                    `<input type="text" placeholder="Answer ${i + 1}..." autocomplete="off">`
                ).join('');
                html += `
                    <div class="question-item" data-qid="${q.id}" data-type="gap">
                        <div class="question-text"><span class="question-number">${q.number}</span>
                            ${q.textBefore} <span class="blank">____</span> ${q.textAfter}
                        </div>
                        <div class="gap-inputs">
                            ${inputsHtml}
                            <button class="check-btn">Check</button>
                        </div>
                        <div class="feedback"></div>
                        <div class="explanation">${q.explanation}</div>
                    </div>
                `;
            });
        }

        html += `
            <div class="quiz-controls">
                <button class="reset-btn" id="resetQuiz">↺ Reset All Answers</button>
                <span class="score-display" id="quizScore">Score: 0/${questions.length}</span>
            </div>
        `;

        this.questionsPanel.innerHTML = html;

        // Bind events
        this.questionsPanel.querySelectorAll('.opt-btn').forEach(btn => {
            btn.addEventListener('click', () => this.handleOptionAnswer(btn));
        });

        this.questionsPanel.querySelectorAll('.check-btn').forEach(btn => {
            btn.addEventListener('click', () => this.handleGapAnswer(btn));
        });

        this.questionsPanel.querySelectorAll('.gap-inputs input').forEach(input => {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const checkBtn = input.closest('.question-item').querySelector('.check-btn');
                    if (checkBtn) checkBtn.click();
                }
            });
        });

        const resetBtn = document.getElementById('resetQuiz');
        if (resetBtn) resetBtn.addEventListener('click', () => this.resetQuiz());
    }

    renderOptionQuestion(q, options) {
        return `
            <div class="question-item" data-qid="${q.id}">
                <div class="question-text"><span class="question-number">${q.number}</span>${q.text}</div>
                <div class="answer-options">
                    ${options.map(opt => `<button class="opt-btn" data-answer="${opt}">${opt}</button>`).join('')}
                </div>
                <div class="feedback"></div>
                <div class="explanation">${q.explanation}</div>
            </div>
        `;
    }

    handleOptionAnswer(btn) {
        const questionItem = btn.closest('.question-item');
        const qid = questionItem.dataset.qid;
        const question = this.currentTest.questions.find(q => q.id === qid);
        if (!question) return;

        // Ignore if already answered
        if (this.answeredQuestions.has(qid)) return;

        const selected = btn.dataset.answer;
        const buttons = questionItem.querySelectorAll('.opt-btn');
        const feedback = questionItem.querySelector('.feedback');
        const explanation = questionItem.querySelector('.explanation');
        const isCorrect = selected === question.answer;

        // Record answer
        this.answeredQuestions.add(qid);
        this.quizAnswers.set(qid, { answer: selected, correct: isCorrect });
        this.updateScore();

        // Update UI: mark selected button, highlight correct, disable all
        buttons.forEach(b => {
            b.disabled = true;
            if (b === btn) {
                b.classList.add(isCorrect ? 'correct' : 'wrong');
            }
            if (b.dataset.answer === question.answer) {
                b.classList.add('revealed-correct');
            }
        });

        // Reveal feedback and explanation
        feedback.style.display = 'block';
        feedback.textContent = isCorrect ? '✓ Correct!' : '✗ Incorrect. Correct answer: ' + question.answer;
        feedback.className = 'feedback ' + (isCorrect ? 'correct-fb' : 'wrong-fb');
        explanation.style.display = 'block';
    }

    handleGapAnswer(btn) {
        const questionItem = btn.closest('.question-item');
        const qid = questionItem.dataset.qid;
        const question = this.currentTest.questions.find(q => q.id === qid);
        if (!question) return;

        const inputs = questionItem.querySelectorAll('.gap-inputs input');
        const feedback = questionItem.querySelector('.feedback');
        const explanation = questionItem.querySelector('.explanation');
        const values = Array.from(inputs).map(i => i.value.trim().toLowerCase());

        if (values.some(v => !v)) {
            feedback.style.display = 'block';
            feedback.textContent = 'Please type an answer first.';
            feedback.className = 'feedback wrong-fb';
            return;
        }

        if (this.answeredQuestions.has(qid)) {
            return;
        }

        const blankSets = question.blanks ? question.blanks : [question.answers];
        const isCorrect = blankSets.every((accepted, i) => {
            const norm = accepted.map(a => a.toLowerCase());
            return norm.includes(values[i]);
        });

        // Record answer
        this.answeredQuestions.add(qid);
        this.quizAnswers.set(qid, { answer: values.join(' '), correct: isCorrect });
        this.updateScore();

        // Update UI
        inputs.forEach(i => { i.disabled = true; });
        btn.disabled = true;
        feedback.style.display = 'block';
        feedback.textContent = isCorrect ? '✓ Correct!' : '✗ Incorrect. Correct answer: "' + blankSets.map(a => a[0]).join(' | ') + '"';
        feedback.className = 'feedback ' + (isCorrect ? 'correct-fb' : 'wrong-fb');
        explanation.style.display = 'block';
    }

    updateScore() {
        const total = this.currentTest.questions.length;
        let correct = 0;
        this.quizAnswers.forEach(val => {
            if (val.correct) correct++;
        });

        const scoreEl = document.getElementById('quizScore');
        if (scoreEl) {
            scoreEl.textContent = `Score: ${correct}/${total}`;
        }
    }

    resetQuiz() {
        this.questionsPanel.querySelectorAll('.opt-btn').forEach(btn => {
            btn.disabled = false;
            btn.classList.remove('correct', 'wrong', 'revealed-correct');
        });

        this.questionsPanel.querySelectorAll('.gap-inputs input').forEach(input => {
            input.disabled = false;
            input.value = '';
        });

        this.questionsPanel.querySelectorAll('.check-btn').forEach(btn => {
            btn.disabled = false;
        });

        this.questionsPanel.querySelectorAll('.feedback').forEach(fb => {
            fb.style.display = 'none';
            fb.textContent = '';
            fb.className = 'feedback';
        });

        this.questionsPanel.querySelectorAll('.explanation').forEach(ex => {
            ex.style.display = 'none';
        });

        this.answeredQuestions = new Set();
        this.quizAnswers = new Map();
        this.updateScore();
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.questionsPage = new QuestionsPage();
});