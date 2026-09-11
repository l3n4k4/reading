/* Shared helpers for both pages.
 * Reads window.readingTests, which is populated by the files in tests/.
 */
'use strict';

function getReadingTests() {
    return window.readingTests || [];
}

function getReadingTest(id) {
    return getReadingTests().find(function (t) { return t.id === id; }) || null;
}

/* Fill a <select> with all tests. Returns the saved (or first) test id. */
function populateTestSelector(selectEl, key) {
    var tests = getReadingTests();
    var saved = localStorage.getItem(key);
    var chosen = saved && tests.some(function (t) { return t.id === saved; }) ? saved : tests[0].id;

    tests.forEach(function (test) {
        var option = document.createElement('option');
        option.value = test.id;
        option.textContent = test.title;
        selectEl.appendChild(option);
    });
    selectEl.value = chosen;
    return chosen;
}

/* Theme: dark is the default. Calls back when the toggle is clicked. */
function initTheme(toggleEl) {
    var dark = localStorage.getItem('theme') !== 'light';
    setTheme(dark);
    toggleEl.addEventListener('click', function () {
        setTheme(!document.body.classList.contains('dark-theme'));
    });
}

function setTheme(dark) {
    document.body.classList.toggle('dark-theme', dark);
    localStorage.setItem('theme', dark ? 'dark' : 'light');
    updateThemeIcon(dark);
}

function updateThemeIcon(dark) {
    var btn = document.getElementById('themeToggle');
    if (btn) btn.textContent = dark ? '☀️' : '🌙';
}

function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}