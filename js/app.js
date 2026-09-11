/**
 * Study page (index.html) — reading passage + sentence analysis.
 * Quiz logic lives in questions.html / js/questions.js.
 */
'use strict';

class ReadingApp {
    constructor() {
        this.currentTest = null;
        this.currentSentence = null;
        this.viewedSentences = new Set();
        this.bookmarkedSentences = new Set();
        this.sentenceElements = [];

        this.init();
    }

    init() {
        // DOM Elements
        this.testSelect = document.getElementById('testSelect');
        this.readingTitle = document.getElementById('readingTitle');
        this.readingSubtitle = document.getElementById('readingSubtitle');
        this.readingContent = document.getElementById('readingContent');
        this.analysisContent = document.getElementById('analysisContent');
        this.analysisPanel = document.querySelector('.analysis-panel');
        this.panelPlaceholder = document.getElementById('panelPlaceholder');
        this.originalSentence = document.getElementById('originalSentence');
        this.vocabList = document.getElementById('vocabList');
        this.grammarList = document.getElementById('grammarList');
        this.structureList = document.getElementById('structureList');
        this.noteList = document.getElementById('noteList');
        this.closeBtn = document.getElementById('closePanel');
        this.bookmarkBtn = document.getElementById('bookmarkBtn');
        this.progressFill = document.getElementById('progressFill');

        // Mobile elements
        this.mobileBackdrop = document.getElementById('mobileBackdrop');
        this.mobileCloseBtn = document.getElementById('mobileCloseBtn');
        this.mobileBookmarkBtn = document.getElementById('mobileBookmarkBtn');
        this.panelResizeHandle = document.getElementById('panelResizeHandle');
        this.mobileResizeHandle = document.getElementById('mobileResizeHandle');

        // Stats elements
        this.totalSentencesEl = document.getElementById('totalSentences');
        this.viewedSentencesEl = document.getElementById('viewedSentences');
        this.bookmarkedSentencesEl = document.getElementById('bookmarkedSentences');

        // Bind events
        this.testSelect.addEventListener('change', () => this.loadTest(this.testSelect.value));
        this.closeBtn.addEventListener('click', () => this.closePanel());
        this.bookmarkBtn.addEventListener('click', () => this.toggleBookmark());
        this.mobileCloseBtn?.addEventListener('click', () => this.closeMobileSheet());
        this.mobileBackdrop?.addEventListener('click', () => this.closeMobileSheet());
        this.mobileBookmarkBtn?.addEventListener('click', () => this.toggleBookmark());

        // Resize handles
        this.mainLayout = document.querySelector('.main-layout');
        this.panelResizeHandle?.addEventListener('mousedown', (e) => this.startResizePanel(e));
        this.mobileResizeHandle?.addEventListener('mousedown', (e) => this.startResizeMobileSheet(e));

        // Keyboard navigation
        document.addEventListener('keydown', (e) => this.handleKeyboard(e));

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

        this.loadState();
        this.renderReading();
        this.updateStats();
        this.closePanel();
    }

    renderReading() {
        this.readingContent.innerHTML = '';
        this.sentenceElements = [];
        let sentenceIndex = 0;

        this.currentTest.sections.forEach(section => {
            // Add section heading (A, B, C...) if present
            if (section.heading) {
                const heading = document.createElement('h3');
                heading.className = 'section-heading';
                heading.textContent = section.heading;
                this.readingContent.appendChild(heading);
            }

            // Create paragraph container
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

                sentenceEl.addEventListener('click', () => this.selectSentence(sentenceId, sentenceEl));

                paragraph.appendChild(sentenceEl);
                this.sentenceElements.push({ id: sentenceId, element: sentenceEl });
            });

            this.readingContent.appendChild(paragraph);
        });
    }

    selectSentence(sentenceId, element) {
        // Remove active class from all sentences
        this.sentenceElements.forEach(s => s.element.classList.remove('active'));

        // Add active class to selected
        element.classList.add('active');
        this.currentSentence = sentenceId;

        // Scroll selected sentence into view if needed
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Track viewed sentences
        this.viewedSentences.add(sentenceId);
        this.updateStats();
        this.saveState();

        // Get sentence data
        const sentenceData = this.currentTest.sentences[sentenceId];
        if (!sentenceData) return;

        // Show analysis panel
        this.panelPlaceholder.style.display = 'none';
        this.analysisContent.classList.add('active');

        // Populate original sentence
        this.originalSentence.textContent = sentenceData.text;

        // Populate vocabulary
        this.renderVocabulary(sentenceData.vocabulary || []);

        // Populate grammar
        this.renderGrammar(sentenceData.grammar || []);

        // Populate structure
        this.renderStructure(sentenceData.structure);

        // Populate notes
        this.renderNotes(sentenceData.notes);

        // Update bookmark button
        this.updateBookmarkButton();

        // Auto-scroll analysis panel to top so the user sees the full analysis
        if (this.analysisPanel) {
            this.analysisPanel.scrollTo({ top: 0, behavior: 'smooth' });
        }

        // On mobile, show bottom sheet instead of side panel
        if (this.isMobile()) {
            this.renderMobileSheet(sentenceData);
            this.openMobileSheet();
        }
    }

    handleKeyboard(e) {
        // Don't navigate when typing in inputs/selects
        const tag = e.target.tagName;
        if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        e.preventDefault();

        // If no sentence selected, start from first sentence
        if (!this.currentSentence) {
            if (this.sentenceElements.length > 0) {
                this.selectSentenceByIndex(0);
            }
            return;
        }

        this.navigateToSentence(e.key === 'ArrowRight' ? 1 : -1);
    }

    navigateToSentence(direction) {
        const currentIndex = this.sentenceElements.findIndex(s => s.id === this.currentSentence);
        if (currentIndex === -1) return;

        const newIndex = currentIndex + direction;
        if (newIndex < 0 || newIndex >= this.sentenceElements.length) return;

        const target = this.sentenceElements[newIndex];
        this.selectSentence(target.id, target.element);
    }

    selectSentenceByIndex(index) {
        if (index < 0 || index >= this.sentenceElements.length) return;
        const target = this.sentenceElements[index];
        this.selectSentence(target.id, target.element);
    }

    renderVocabulary(vocab) {
        if (vocab.length === 0) {
            document.getElementById('vocabSection').style.display = 'none';
            return;
        }

        document.getElementById('vocabSection').style.display = 'block';
        this.vocabList.innerHTML = '';

        vocab.forEach(item => {
            const vocabEl = document.createElement('div');
            vocabEl.className = 'vocab-item';
            const paraphrase = item.paraphrase
                ? `<span class="vocab-paraphrase"><b>≈</b> ${item.paraphrase.en || ''}${item.paraphrase.vi ? ` <em>(${item.paraphrase.vi})</em>` : ''}</span>`
                : '';
            const collocations = Array.isArray(item.collocations) && item.collocations.length
                ? `<span class="vocab-collocations">Collocations: ${item.collocations.join(' · ')}</span>`
                : '';
            vocabEl.innerHTML = `
                <span class="vocab-word">${item.word}</span>
                <span class="vocab-phonetic">${item.phonetic}</span>
                <span class="vocab-pos">${item.pos}</span>
                <span class="vocab-definition">${item.definition}</span>
                ${paraphrase}
                ${collocations}
                ${item.example ? `<span class="vocab-example">Example: "${item.example}"</span>` : ''}
            `;
            this.vocabList.appendChild(vocabEl);
        });
    }

    renderGrammar(grammar) {
        if (grammar.length === 0) {
            document.getElementById('grammarSection').style.display = 'none';
            return;
        }

        document.getElementById('grammarSection').style.display = 'block';
        this.grammarList.innerHTML = '';

        grammar.forEach(item => {
            const grammarEl = document.createElement('div');
            grammarEl.className = 'grammar-item';
            grammarEl.innerHTML = `
                <div class="grammar-pattern">${item.pattern}</div>
                <div class="grammar-explanation">${item.explanation}</div>
            `;
            this.grammarList.appendChild(grammarEl);
        });
    }

    renderStructure(structure) {
        if (!structure) {
            document.getElementById('structureSection').style.display = 'none';
            return;
        }

        document.getElementById('structureSection').style.display = 'block';
        this.structureList.innerHTML = `
            <div class="structure-item">
                <div class="structure-type">${structure.type}</div>
                <div class="structure-explanation">${structure.explanation}</div>
            </div>
        `;
    }

    renderNotes(notes) {
        const section = document.getElementById('noteSection');
        if (!notes) {
            section.style.display = 'none';
            return;
        }

        section.style.display = 'block';
        this.noteList.innerHTML = '';

        const items = Array.isArray(notes) ? notes : [{ text: notes }];
        items.forEach(note => {
            const div = document.createElement('div');
            div.className = 'note-item';
            div.textContent = note.text || note;
            this.noteList.appendChild(div);
        });
    }

    closePanel() {
        this.panelPlaceholder.style.display = 'block';
        this.analysisContent.classList.remove('active');
        this.sentenceElements.forEach(s => s.element.classList.remove('active'));
        this.currentSentence = null;
        
        // Close mobile sheet if open
        if (this.isMobile() && this.mobileSheet) {
            this.closeMobileSheet();
        }
    }

    toggleBookmark() {
        if (!this.currentSentence) return;

        if (this.bookmarkedSentences.has(this.currentSentence)) {
            this.bookmarkedSentences.delete(this.currentSentence);
        } else {
            this.bookmarkedSentences.add(this.currentSentence);
        }

        this.updateBookmarkButton();
        this.updateStats();
        this.saveState();
    }

    updateBookmarkButton() {
        const isBookmarked = this.currentSentence && this.bookmarkedSentences.has(this.currentSentence);
        const icon = document.getElementById('bookmarkIcon');
        const text = document.getElementById('bookmarkText');

        if (isBookmarked) {
            this.bookmarkBtn.classList.add('bookmarked');
            icon.textContent = '★';
            text.textContent = 'Bookmarked';
        } else {
            this.bookmarkBtn.classList.remove('bookmarked');
            icon.textContent = '☆';
            text.textContent = 'Bookmark this sentence';
        }
    }

    updateStats() {
        const total = this.sentenceElements.length;
        this.totalSentencesEl.textContent = total;
        this.viewedSentencesEl.textContent = this.viewedSentences.size;
        this.bookmarkedSentencesEl.textContent = this.bookmarkedSentences.size;

        // Update progress
        const progress = total > 0 ? (this.viewedSentences.size / total) * 100 : 0;
        this.progressFill.style.width = `${progress}%`;
    }

    startResizePanel(event) {
        event.preventDefault();
        const panel = this.analysisPanel;
        const handle = this.panelResizeHandle;
        if (!panel || !handle || !this.mainLayout) return;

        const startX = event.clientX;
        const panelRect = panel.getBoundingClientRect();
        const startPanelWidth = panelRect.width;
        const layoutRect = this.mainLayout.getBoundingClientRect();
        const startLayoutWidth = layoutRect.width;
        const gap = parseFloat(getComputedStyle(this.mainLayout).columnGap) || 32; // 2rem = 32px
        const availableWidth = startLayoutWidth - gap;

        // Calculate initial panel percentage
        const startPanelPct = (startPanelWidth / availableWidth) * 100;
        const minPanelPct = 15; // Minimum ~15% to ensure usability
        const maxPanelPct = 70; // Maximum ~70% to ensure reading section remains usable

        // Add visual feedback
        panel.classList.add('resizing');
        document.body.style.cursor = 'col-resize';
        this.isResizing = true;

        const handleResize = (moveEvent) => {
            // Prevent text selection during resize
            moveEvent.preventDefault();
            
            const deltaX = moveEvent.clientX - startX;
            const currentPanelWidth = startPanelWidth + deltaX;
            
            // Clamp to available space with min/max reading section widths
            const minReadingWidth = 240;
            const maxReadingWidth = availableWidth - minReadingWidth;
            let newPanelWidth = Math.min(maxReadingWidth, Math.max(minReadingWidth, currentPanelWidth));
            
            // Convert to percentage
            const newPanelPct = (newPanelWidth / availableWidth) * 100;
            const newReadingPct = 100 - newPanelPct;
            
            // Apply percentage-based grid template columns
            this.mainLayout.style.gridTemplateColumns = `${newReadingPct}% ${newPanelPct}%`;
            
            // Position the handle at the boundary between the two tabs
            handle.style.left = `calc(${newPanelPct}% - 4px)`;
        };

        const stopResize = () => {
            panel.classList.remove('resizing');
            document.body.style.cursor = '';
            this.isResizing = false;
            window.removeEventListener('mousemove', handleResize);
            window.removeEventListener('mouseup', stopResize);
        };

        window.addEventListener('mousemove', handleResize);
        window.addEventListener('mouseup', stopResize);
    }

    startResizeMobileSheet(event) {
        event.preventDefault();
        const sheet = document.getElementById('mobileBottomSheet');
        if (!sheet) return;

        const startY = event.clientY;
        const startHeight = sheet.getBoundingClientRect().height;
        const minHeight = 180;
        const maxHeight = window.innerHeight * 0.7; // 70% of viewport height

        sheet.classList.add('resizing');
        document.body.style.cursor = 'row-resize';

        const handleResize = (moveEvent) => {
            const deltaY = moveEvent.clientY - startY;
            const newHeight = Math.min(maxHeight, Math.max(minHeight, startHeight + deltaY));
            sheet.style.maxHeight = `${newHeight}px`;
        };

        const stopResize = () => {
            sheet.classList.remove('resizing');
            document.body.style.cursor = '';
            window.removeEventListener('mousemove', handleResize);
            window.removeEventListener('mouseup', stopResize);
        };

        window.addEventListener('mousemove', handleResize);
        window.addEventListener('mouseup', stopResize);
    }

    isMobile() {
        return window.innerWidth <= 768;
    }

    renderMobileSheet(sentenceData) {
        // Set original sentence text
        const mobileOriginal = document.getElementById('mobileOriginalSentence');
        mobileOriginal.textContent = sentenceData.text;

        // Render vocabulary
        this.renderMobileVocabulary(sentenceData.vocabulary || []);

        // Render grammar
        this.renderMobileGrammar(sentenceData.grammar || []);

        // Render structure
        this.renderMobileStructure(sentenceData.structure);

        // Render notes
        this.renderMobileNotes(sentenceData.notes);
    }

    renderMobileVocabulary(vocab) {
        const mobileVocabList = document.getElementById('mobileVocabList');
        mobileVocabList.innerHTML = '';

        if (vocab.length === 0) {
            mobileVocabList.innerHTML = '<div class="vocab-item"><span>No vocabulary entries</span></div>';
            return;
        }

        vocab.forEach(item => {
            const vocabEl = document.createElement('div');
            vocabEl.className = 'vocab-item mobile-vocab-item';
            const paraphrase = item.paraphrase
                ? `<span class="vocab-paraphrase"><b>≈</b> ${item.paraphrase.en || ''}${item.paraphrase.vi ? ` <em>(${item.paraphrase.vi})</em>` : ''}</span>`
                : '';
            const collocations = item.collocations && item.collocations.length
                ? `<span class="vocab-collocations">Collocations: ${item.collocations.join(' · ')}</span>`
                : '';

            vocabEl.innerHTML = `
                <span class="vocab-word">${item.word}</span>
                <span class="vocab-phonetic">${item.phonetic}</span>
                <span class="vocab-pos">${item.pos}</span>
                <span class="vocab-definition">${item.definition}</span>
                ${paraphrase}
                ${collocations}
                ${item.example ? `<span class="vocab-example">Example: "${item.example}"</span>` : ''}
            `;
            mobileVocabList.appendChild(vocabEl);
        });
    }

    renderMobileGrammar(grammar) {
        const mobileGrammarList = document.getElementById('mobileGrammarList');
        mobileGrammarList.innerHTML = '';

        if (grammar.length === 0) {
            mobileGrammarList.innerHTML = '<div class="grammar-item">No grammar patterns</span></div>';
            return;
        }

        grammar.forEach(item => {
            const grammarEl = document.createElement('div');
            grammarEl.className = 'grammar-item mobile-grammar-item';
            grammarEl.innerHTML = `
                <div class="grammar-pattern">${item.pattern}</div>
                <div class="grammar-explanation">${item.explanation}</div>
            `;
            mobileGrammarList.appendChild(grammarEl);
        });
    }

    renderMobileStructure(structure) {
        const mobileStructureList = document.getElementById('mobileStructureList');
        mobileStructureList.innerHTML = '';

        if (!structure) {
            mobileStructureList.innerHTML = '<div class="structure-item">No structure data</div>';
            return;
        }

        const div = document.createElement('div');
        div.className = 'structure-item';
        div.innerHTML = `
            <div class="structure-type">${structure.type}</div>
            <div class="structure-explanation">${structure.explanation}</div>
        `;
        mobileStructureList.appendChild(div);
    }

    renderMobileNotes(notes) {
        const mobileNoteList = document.getElementById('mobileNoteList');
        mobileNoteList.innerHTML = '';

        if (!notes) {
            mobileNoteList.innerHTML = '<div class="note-item">No notes</div>';
            return;
        }

        const items = Array.isArray(notes) ? notes : [{ text: notes }];
        items.forEach(note => {
            const div = document.createElement('div');
            div.className = 'note-item mobile-note-item';
            div.textContent = note.text || note;
            mobileNoteList.appendChild(div);
        });
    }

    openMobileSheet() {
        const mobileSheet = document.getElementById('mobileBottomSheet');
        const mobileBackdrop = document.getElementById('mobileBackdrop');
        
        if (mobileSheet && mobileBackdrop) {
            mobileSheet.classList.add('active');
            mobileBackdrop.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
    }

    closeMobileSheet() {
        const mobileSheet = document.getElementById('mobileBottomSheet');
        const mobileBackdrop = document.getElementById('mobileBackdrop');
        
        if (mobileSheet && mobileBackdrop) {
            mobileSheet.classList.remove('active');
            mobileBackdrop.classList.remove('active');
            document.body.style.overflow = '';
        }
    }

    // State is stored per test so identical sentence ids ("s1", "s2"...) don't collide across tests.
    stateKey() {
        return 'readingState.' + (this.currentTest ? this.currentTest.id : 'none');
    }

    saveState() {
        const state = {
            viewedSentences: Array.from(this.viewedSentences),
            bookmarkedSentences: Array.from(this.bookmarkedSentences)
        };
        localStorage.setItem(this.stateKey(), JSON.stringify(state));
    }

    loadState() {
        if (!this.currentTest) return;
        try {
            const savedState = localStorage.getItem(this.stateKey());
            const state = savedState ? JSON.parse(savedState) : {};
            this.viewedSentences = new Set(state.viewedSentences || []);
            this.bookmarkedSentences = new Set(state.bookmarkedSentences || []);
        } catch (e) {
            console.error('Error loading state:', e);
            this.viewedSentences = new Set();
            this.bookmarkedSentences = new Set();
        }
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.readingApp = new ReadingApp();
});