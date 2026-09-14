/* Shared helpers for both pages.
 * Reads window.readingTests, which is populated by the files in tests/.
 * Each generated page loads exactly one test file and sets window.TEST_ID
 * to that test's id (see tools/build.js).
 */
'use strict';

function getReadingTests() {
    return window.readingTests || [];
}

function getReadingTest(id) {
    return getReadingTests().find(function (t) { return t.id === id; }) || null;
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