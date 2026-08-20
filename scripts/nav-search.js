// nav-search.js
// Handles submit from `#nav-search-form` and dispatches a `nav-search` CustomEvent with {query}.

(function () {
  function install() {
    const form = document.getElementById('nav-search-form');
    if (!form) return;

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const formData = new FormData(form);
      const q = (formData.get('q') || '').trim();
      const ev = new CustomEvent('nav-search', { detail: { query: q } });
      document.dispatchEvent(ev);
      // For now, just log — consumers can listen for `nav-search`.
      console.info('nav-search submitted:', q);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install);
  } else install();
})();
