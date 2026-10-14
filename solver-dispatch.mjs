/* Universal solver loader.
   Paste this single line into the console of any official exam page:

     import('https://tds-solver-backend.onrender.com/solver.js')

   It detects which quiz is open and loads the matching solver. Nothing is
   submitted until every real question check passes on the page itself.
*/
(() => {
  const BASE = 'https://tds-solver-backend.onrender.com';
  const path = location.pathname;

  const QUIZZES = [
    { id: 'sutd', match: /sutd/i, script: '/solver/sutd.js' },
    { id: 'ga2', match: /-ga2\b/i, script: '/solver/ga2.js' },
    { id: 'ga1', match: /-ga1\b/i, script: '/solver/ga1.js' },
  ];

  if (location.origin !== 'https://exam.sanand.workers.dev') {
    throw new Error('Open the official exam page first: https://exam.sanand.workers.dev/' + path);
  }

  const hit = QUIZZES.find((q) => q.match.test(path));
  if (!hit) {
    throw new Error('No supported quiz in this URL (' + path + '). Open a GA1 or GA2 attempt page, then paste.');
  }

  // Re-entrancy guard: pasting twice must not run the solver twice.
  if (window.__SOLVER_LOAD && window.__SOLVER_LOAD.quiz === hit.id) {
    console.log('[solver] already loaded for ' + hit.id + ' — look above for its progress.');
    return window.__SOLVER_LOAD.ready;
  }

  const src = BASE + hit.script;
  const ready = new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.async = false;
    el.onload = () => {
      console.log('[solver] ' + hit.id + ' loaded from ' + src);
      resolve(hit.id);
    };
    el.onerror = () => {
      const err = new Error('[solver] failed to load ' + src + ' — is the Render service up? GET /health');
      console.error(err.message);
      reject(err);
    };
    (document.head || document.documentElement).appendChild(el);
  });

  window.__SOLVER_LOAD = { quiz: hit.id, src, ready };
  console.log('[solver] detected ' + hit.id + ', fetching ' + src + ' …');
  return ready;
})()
