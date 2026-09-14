/**
 * Study page (/<test-id>/) — reading passage + sentence analysis.
 * Quiz logic lives in /<test-id>/questions/ and js/questions.js.
 * The page loads one test file and sets window.TEST_ID; see tools/build.js.
 */
'use strict';

/* Desktop splitter: percentage of the layout given to the reading pane. */
const SPLIT_MIN = 25;
const SPLIT_MAX = 75;
const SPLIT_DEFAULT = 50;
const SPLIT_KEY = 'readingSplit';

/* Mobile sheet heights, as fractions of the viewport. Released below
 * SHEET_DISMISS (or on a downward flick) the sheet closes instead of snapping. */
const SHEET_SNAPS = [0.55, 0.92];
const SHEET_DISMISS = 0.3;
const SHEET_FLICK = 0.7; // px/ms
const SHEET_KEY = 'readingSheetSnap';

/* Swiping the open sheet sideways steps through sentences. */
const SWIPE_SLOP = 8;      // travel before the gesture commits to an axis
const SWIPE_COMMIT = 64;   // travel that counts as "next sentence"
const SWIPE_FLICK = 0.45;  // px/ms
const SWIPE_RESIST = 3;    // drag is divided by this past the first/last sentence
const SWIPE_SETTLE = 160;  // ms, must match .swipe-settling in style.css

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
        this.mobileSheet = document.getElementById('mobileBottomSheet');
        this.mobileSheetContent = document.getElementById('mobileSheetContent');
        this.mobileSheetTitle = document.getElementById('mobileSheetTitle');
        this.mobileDragZone = document.getElementById('mobileSheetDragZone');
        this.panelResizeHandle = document.getElementById('panelResizeHandle');
        this.mobileResizeHandle = document.getElementById('mobileResizeHandle');

        // Stats elements
        this.totalSentencesEl = document.getElementById('totalSentences');
        this.viewedSentencesEl = document.getElementById('viewedSentences');
        this.bookmarkedSentencesEl = document.getElementById('bookmarkedSentences');

        // Bind events
        this.closeBtn.addEventListener('click', () => this.closePanel());
        this.bookmarkBtn.addEventListener('click', () => this.toggleBookmark());
        this.mobileCloseBtn?.addEventListener('click', () => this.closeMobileSheet());
        this.mobileBackdrop?.addEventListener('click', () => this.closeMobileSheet());
        this.mobileBookmarkBtn?.addEventListener('click', () => this.toggleBookmark());

        // Resize handles
        this.mainLayout = document.querySelector('.main-layout');
        this.setupPanelResize();
        this.setupMobileSheet();

        // Keyboard navigation
        document.addEventListener('keydown', (e) => this.handleKeyboard(e));

        // A sheet left open across the mobile breakpoint has no business being
        // there — the desktop panel takes over.
        this.wasMobile = this.isMobile();
        window.addEventListener('resize', () => this.handleViewportChange());

        this.loadTest(window.TEST_ID);

        initTheme(document.getElementById('themeToggle'));
    }

    loadTest(testId) {
        this.currentTest = getReadingTest(testId);
        if (!this.currentTest) return;

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
                // -1, not 0: focusable when the sheet hands focus back, but not
                // 39 extra stops in the tab order.
                sentenceEl.tabIndex = -1;
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
        this.revealSentence(element);

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

        if (e.key === 'Escape') {
            if (this.mobileSheet?.classList.contains('active')) this.closeMobileSheet();
            else this.closePanel();
            return;
        }

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

    /* ------------------------------------------------------------------
     * Desktop splitter
     *
     * The handle is the middle column of the grid, so there is no position to
     * keep in sync — writing the two track sizes moves it. Sizes are `fr`
     * units, which are distributed after the gutter is taken out, so the
     * columns can never overflow the layout.
     * ---------------------------------------------------------------- */

    setupPanelResize() {
        const handle = this.panelResizeHandle;
        const layout = this.mainLayout;
        if (!handle || !layout) return;

        layout.classList.add('is-split');

        handle.setAttribute('role', 'separator');
        handle.setAttribute('aria-orientation', 'vertical');
        handle.setAttribute('aria-label', 'Resize reading and analysis panes');
        handle.setAttribute('aria-valuemin', String(SPLIT_MIN));
        handle.setAttribute('aria-valuemax', String(SPLIT_MAX));
        handle.tabIndex = 0;

        this.applySplit(this.readSplit(), false);

        handle.addEventListener('pointerdown', (e) => this.startResizePanel(e));
        handle.addEventListener('dblclick', () => this.applySplit(SPLIT_DEFAULT));
        handle.addEventListener('keydown', (e) => this.handleSplitKey(e));
    }

    applySplit(pct, persist = true) {
        if (!this.mainLayout || !this.panelResizeHandle) return;

        const clamped = Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, pct));
        this.splitPct = clamped;
        this.mainLayout.style.setProperty('--split-reading', `${clamped.toFixed(3)}fr`);
        this.mainLayout.style.setProperty('--split-panel', `${(100 - clamped).toFixed(3)}fr`);
        this.panelResizeHandle.setAttribute('aria-valuenow', String(Math.round(clamped)));

        if (persist) {
            try {
                localStorage.setItem(SPLIT_KEY, String(Math.round(clamped * 100) / 100));
            } catch (e) { /* private browsing — the split just won't stick */ }
        }
    }

    readSplit() {
        try {
            const saved = parseFloat(localStorage.getItem(SPLIT_KEY));
            if (Number.isFinite(saved)) return saved;
        } catch (e) { /* ignore */ }
        return SPLIT_DEFAULT;
    }

    startResizePanel(event) {
        if (this.isMobile()) return;
        if (event.button !== undefined && event.button !== 0) return;

        const handle = this.panelResizeHandle;
        const layout = this.mainLayout;
        const rect = layout.getBoundingClientRect();
        const gutter = handle.getBoundingClientRect().width;
        const track = rect.width - gutter; // width the two panes actually share
        if (track <= 0) return;

        event.preventDefault();
        try { handle.setPointerCapture(event.pointerId); } catch (e) { /* ignore */ }
        handle.classList.add('dragging');
        document.body.classList.add('is-resizing');

        let pending = this.splitPct;
        let frame = 0;

        const onMove = (moveEvent) => {
            // The pointer grabs the middle of the gutter, so the reading pane
            // ends half a gutter to its left.
            const x = moveEvent.clientX - rect.left - gutter / 2;
            pending = (x / track) * 100;

            // One write per frame: a raw pointermove stream relayouts both
            // panes far more often than the screen can show it.
            if (frame) return;
            frame = requestAnimationFrame(() => {
                frame = 0;
                this.applySplit(pending, false);
            });
        };

        const onUp = () => {
            if (frame) cancelAnimationFrame(frame);
            frame = 0;
            this.applySplit(pending);
            handle.classList.remove('dragging');
            document.body.classList.remove('is-resizing');
            try { handle.releasePointerCapture(event.pointerId); } catch (e) { /* ignore */ }
            handle.removeEventListener('pointermove', onMove);
            handle.removeEventListener('pointerup', onUp);
            handle.removeEventListener('pointercancel', onUp);
        };

        handle.addEventListener('pointermove', onMove);
        handle.addEventListener('pointerup', onUp);
        handle.addEventListener('pointercancel', onUp);
    }

    handleSplitKey(e) {
        const step = e.shiftKey ? 10 : 2;
        let next = this.splitPct;

        if (e.key === 'ArrowLeft') next -= step;
        else if (e.key === 'ArrowRight') next += step;
        else if (e.key === 'Home') next = SPLIT_MIN;
        else if (e.key === 'End') next = SPLIT_MAX;
        else if (e.key === 'Enter' || e.key === ' ') next = SPLIT_DEFAULT;
        else return;

        e.preventDefault();
        // Arrow keys also step through sentences; while the handle has focus
        // they belong to the handle.
        e.stopPropagation();
        this.applySplit(next);
    }

    /* ------------------------------------------------------------------
     * Mobile bottom sheet
     * ---------------------------------------------------------------- */

    setupMobileSheet() {
        const zone = this.mobileDragZone;
        const grip = this.mobileResizeHandle;
        if (!this.mobileSheet || !zone) return;

        this.sheetSnap = this.readSheetSnap();

        zone.addEventListener('pointerdown', (e) => this.startSheetDrag(e, false));
        // Pulling down from the top of the content is the other way people
        // expect to dismiss a sheet.
        this.mobileSheetContent?.addEventListener('pointerdown', (e) => this.startSheetDrag(e, true));
        grip?.addEventListener('dblclick', () => this.setSheetSnap(this.sheetSnap === 0 ? 1 : 0));
        grip?.addEventListener('keydown', (e) => this.handleSheetKey(e));
    }

    viewportHeight() {
        return (window.visualViewport && window.visualViewport.height) || window.innerHeight;
    }

    readSheetSnap() {
        try {
            const saved = parseInt(localStorage.getItem(SHEET_KEY), 10);
            if (saved === 0 || saved === 1) return saved;
        } catch (e) { /* ignore */ }
        return 0;
    }

    setSheetSnap(index, animate = true) {
        const sheet = this.mobileSheet;
        if (!sheet) return;

        this.sheetSnap = index;
        if (!animate) sheet.classList.add('resizing');
        sheet.style.height = `${SHEET_SNAPS[index] * this.viewportHeight()}px`;
        if (!animate) {
            // Force the height to land before transitions come back on.
            void sheet.offsetHeight;
            sheet.classList.remove('resizing');
        }

        try {
            localStorage.setItem(SHEET_KEY, String(index));
        } catch (e) { /* ignore */ }
    }

    nearestSnap(fraction) {
        let best = 0;
        for (let i = 1; i < SHEET_SNAPS.length; i++) {
            if (Math.abs(SHEET_SNAPS[i] - fraction) < Math.abs(SHEET_SNAPS[best] - fraction)) best = i;
        }
        return best;
    }

    /* One gesture, two meanings: sideways steps through sentences, up and down
     * resizes or dismisses the sheet. The first few pixels of travel decide
     * which, and the other axis is ignored for the rest of the drag — a swipe
     * that is 70px across and 12px down must not also nudge the height. */
    startSheetDrag(event, fromContent) {
        const sheet = this.mobileSheet;
        if (!sheet || !sheet.classList.contains('active')) return;
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        // Buttons and links keep their taps.
        if (event.target.closest('button, a') && event.target !== this.mobileResizeHandle) return;
        // A swipe already mid-flight owns the content's transform.
        if (this.swipeBusy) return;

        const content = this.mobileSheetContent;
        const source = fromContent ? content : this.mobileDragZone;
        const startX = event.clientX;
        const startY = event.clientY;
        const startHeight = sheet.getBoundingClientRect().height;
        const vh = this.viewportHeight();
        const maxHeight = vh * SHEET_SNAPS[SHEET_SNAPS.length - 1];
        const startedAtTop = !content || content.scrollTop <= 0;

        let axis = null; // null until the gesture declares itself, then 'x' | 'y' | 'none'
        let height = startHeight;
        let offset = 0;
        let lastX = startX;
        let lastY = startY;
        let lastT = event.timeStamp;
        let vx = 0;
        let vy = 0;
        let frame = 0;

        // Capture up front, not once the axis is known: the pointer leaves this
        // element within the first few pixels of a drag, and without capture the
        // moves would be delivered to whatever is underneath instead. Capture
        // does not suppress native scrolling — touch-action does — so a genuine
        // scroll of the analysis still happens and arrives here as pointercancel.
        try { source.setPointerCapture(event.pointerId); } catch (e) { /* ignore */ }

        const onMove = (moveEvent) => {
            const dx = moveEvent.clientX - startX;
            const dy = moveEvent.clientY - startY;

            const dt = moveEvent.timeStamp - lastT;
            if (dt > 0) {
                vx = (moveEvent.clientX - lastX) / dt;
                vy = (moveEvent.clientY - lastY) / dt; // +ve = downward
            }
            lastX = moveEvent.clientX;
            lastY = moveEvent.clientY;
            lastT = moveEvent.timeStamp;

            if (axis === null) {
                if (Math.abs(dx) < SWIPE_SLOP && Math.abs(dy) < SWIPE_SLOP) return;
                if (Math.abs(dx) > Math.abs(dy)) {
                    axis = 'x';
                    content?.classList.add('swiping');
                } else if (fromContent && (!startedAtTop || dy < 0)) {
                    // Reading down the analysis — leave the scroll alone.
                    axis = 'none';
                    return;
                } else {
                    axis = 'y';
                    sheet.classList.add('resizing');
                }
            }
            if (axis === 'none') return;

            // Once the browser has committed to a scroll the move is no longer
            // cancelable; calling preventDefault then only logs a warning.
            if (moveEvent.cancelable) moveEvent.preventDefault();

            if (axis === 'x') {
                // Nothing to page to at the ends, so the sheet pulls back.
                offset = this.neighbourSentence(dx < 0 ? 1 : -1) ? dx : dx / SWIPE_RESIST;
            } else {
                height = Math.min(maxHeight, Math.max(60, startHeight - dy));
            }

            if (frame) return;
            frame = requestAnimationFrame(() => {
                frame = 0;
                if (axis === 'x') content.style.transform = `translateX(${offset}px)`;
                else sheet.style.height = `${height}px`;
            });
        };

        const onUp = () => {
            if (frame) cancelAnimationFrame(frame);
            frame = 0;
            source.removeEventListener('pointermove', onMove);
            source.removeEventListener('pointerup', onUp);
            source.removeEventListener('pointercancel', onUp);
            try { source.releasePointerCapture(event.pointerId); } catch (e) { /* ignore */ }

            if (axis === 'x') {
                const direction = offset < 0 ? 1 : -1;
                const committed = Math.abs(offset) > SWIPE_COMMIT ||
                    (Math.abs(vx) > SWIPE_FLICK && Math.sign(vx) === -direction);
                this.finishSwipe(committed && this.neighbourSentence(direction) ? direction : 0);
                return;
            }
            if (axis !== 'y') return;

            sheet.classList.remove('resizing');
            if (vy > SHEET_FLICK || height < vh * SHEET_DISMISS) {
                this.closeMobileSheet();
                return;
            }
            this.setSheetSnap(this.nearestSnap(height / vh));
        };

        source.addEventListener('pointermove', onMove);
        source.addEventListener('pointerup', onUp);
        source.addEventListener('pointercancel', onUp);
    }

    /* The sentence `direction` steps away, or null at either end. */
    neighbourSentence(direction) {
        const index = this.sentenceElements.findIndex(s => s.id === this.currentSentence);
        if (index === -1) return null;
        return this.sentenceElements[index + direction] || null;
    }

    /* direction: 1 next, -1 previous, 0 snap back. The old analysis slides out
     * the way the thumb went and the new one comes in from the far side. */
    finishSwipe(direction) {
        const content = this.mobileSheetContent;
        if (!content) return;

        content.classList.remove('swiping');
        content.classList.add('swipe-settling');

        if (!direction) {
            content.style.transform = '';
            this.afterSwipeSettle(content);
            return;
        }

        const width = content.getBoundingClientRect().width || 320;
        this.swipeBusy = true;
        content.style.transform = `translateX(${-direction * width * 0.35}px)`;
        content.style.opacity = '0';

        window.setTimeout(() => {
            this.navigateToSentence(direction);
            // Land on the far side without animating, then run back to rest.
            content.classList.remove('swipe-settling');
            content.style.transform = `translateX(${direction * width * 0.35}px)`;
            void content.offsetWidth;
            content.classList.add('swipe-settling');
            content.style.transform = '';
            content.style.opacity = '';
            this.afterSwipeSettle(content);
        }, SWIPE_SETTLE);
    }

    afterSwipeSettle(content) {
        window.clearTimeout(this.swipeSettleTimer);
        this.swipeSettleTimer = window.setTimeout(() => {
            content.classList.remove('swipe-settling');
            content.style.transform = '';
            content.style.opacity = '';
            this.swipeBusy = false;
        }, SWIPE_SETTLE);
    }

    handleSheetKey(e) {
        if (e.key === 'ArrowUp') this.setSheetSnap(1);
        else if (e.key === 'ArrowDown') this.setSheetSnap(0);
        else return;
        e.preventDefault();
        e.stopPropagation();
    }

    /* iOS ignores overflow:hidden on <body>. Pinning the body and restoring the
     * scroll position afterwards is the version that actually holds. */
    lockBodyScroll() {
        if (this.scrollLockY != null) return;
        this.scrollLockY = window.scrollY;
        // Once the body is out of flow the document stops being scrollable, so
        // the range has to be measured before pinning it.
        this.scrollLockMax = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
        document.body.style.position = 'fixed';
        document.body.style.top = `-${this.scrollLockY}px`;
        document.body.style.left = '0';
        document.body.style.right = '0';
        document.body.style.overflow = 'hidden';
    }

    /* Put a sentence where the reader can see it, whether or not the page is
     * currently pinned behind the sheet. Pinned, the body is offset by
     * -scrollLockY, so moving the passage means moving that offset. */
    revealSentence(element) {
        if (!element) return;

        if (this.scrollLockY == null) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
        }

        const margin = 72; // clear of the sticky nothing at the top, and of the sheet
        const documentY = element.getBoundingClientRect().top + this.scrollLockY;
        const target = Math.min(this.scrollLockMax, Math.max(0, documentY - margin));
        this.scrollLockY = target;
        document.body.style.top = `-${target}px`;
    }

    unlockBodyScroll() {
        if (this.scrollLockY == null) return;
        const y = this.scrollLockY;
        this.scrollLockY = null;
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.left = '';
        document.body.style.right = '';
        document.body.style.overflow = '';
        window.scrollTo(0, y);
    }

    handleViewportChange() {
        const mobile = this.isMobile();
        if (mobile !== this.wasMobile) {
            this.wasMobile = mobile;
            if (!mobile) this.closeMobileSheet();
        } else if (mobile && this.mobileSheet?.classList.contains('active')) {
            // Rotation changes what a snap fraction is worth.
            this.setSheetSnap(this.sheetSnap, false);
        }
    }

    isMobile() {
        return window.innerWidth <= 768;
    }

    renderMobileSheet(sentenceData) {
        // Set original sentence text
        const mobileOriginal = document.getElementById('mobileOriginalSentence');
        mobileOriginal.textContent = sentenceData.text;

        // Which sentence this is, so the sheet is not just "Sentence Analysis"
        // over and over.
        if (this.mobileSheetTitle) {
            const index = this.sentenceElements.findIndex(s => s.id === this.currentSentence);
            this.mobileSheetTitle.textContent = index >= 0
                ? `Sentence ${index + 1} of ${this.sentenceElements.length}`
                : 'Sentence Analysis';
        }

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
        const sheet = this.mobileSheet;
        const backdrop = this.mobileBackdrop;
        if (!sheet || !backdrop) return;

        // Swiping to the next sentence re-enters here with the sheet already
        // up. Only the content is new; re-running the open choreography would
        // re-snap the height and yank focus back to the close button.
        if (sheet.classList.contains('active')) {
            if (this.mobileSheetContent) this.mobileSheetContent.scrollTop = 0;
            return;
        }

        // Bring the sentence out from behind the sheet before the page is
        // pinned — once it is locked the reader cannot scroll to it. Instant,
        // not smooth: a smooth scroll would still be in flight at lock time.
        const active = this.sentenceElements.find(s => s.id === this.currentSentence);
        if (active) active.element.scrollIntoView({ block: 'start', behavior: 'auto' });

        this.lockBodyScroll();
        this.setSheetSnap(this.sheetSnap, false);
        sheet.classList.add('active');
        backdrop.classList.add('active');
        if (this.mobileSheetContent) this.mobileSheetContent.scrollTop = 0;
        this.mobileCloseBtn?.focus({ preventScroll: true });
    }

    closeMobileSheet() {
        const sheet = this.mobileSheet;
        const backdrop = this.mobileBackdrop;
        if (!sheet || !backdrop) return;

        sheet.classList.remove('active', 'resizing');
        backdrop.classList.remove('active');
        this.unlockBodyScroll();

        // Put focus back where the reader was, not on a hidden dialog.
        const active = this.sentenceElements.find(s => s.id === this.currentSentence);
        active?.element.focus?.({ preventScroll: true });
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