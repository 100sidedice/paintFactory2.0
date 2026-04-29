const debugEl = document.querySelector('#debug');


const logToDebug = (title, message, path, line = 'N/A') => {
  if (!debugEl) return;
  
  const entry = [
    `${title}`,
    `Message: ${message}, Path: ${path}, Line: ${line}`,
    `--------------------------`
  ].join('\n');

  debugEl.innerText += entry + '\n';
};

// Extract the most relevant file:line:col from a stack trace string
const extractLocationFromStack = (stack) => {
  if (!stack) return { path: 'Unknown Path', line: 'N/A' };

  // Match patterns like: at func (http://.../file.js:10:20)
  // or: at /abs/path/file.js:10:20
  const regex = /at\s+(?:.*?\s+\()?(.+?):(\d+):(\d+)\)?/g;
  let match;
  let lastMatch = null;
  while ((match = regex.exec(stack)) !== null) {
    lastMatch = match;
  }

  if (lastMatch) {
    return { path: lastMatch[1], line: `${lastMatch[2]}:${lastMatch[3]}` };
  }

  // Try a fallback for single-line stacks or messages
  const simple = stack.match(/(https?:\/\/[^\s:]+|\/[^\s:]+):(\d+):(\d+)/);
  if (simple) return { path: simple[1], line: `${simple[2]}:${simple[3]}` };

  return { path: 'Unknown Path', line: 'N/A' };
};

// Capture console output and mirror to debug overlay
(() => {
  const methods = ['log', 'warn', 'error', 'info', 'debug'];
  methods.forEach((m) => {
    const orig = console[m];
    if (!orig) return;
    console[m] = function (...args) {
      try {
        const message = args.map(a => {
          try {
            return typeof a === 'string' ? a : JSON.stringify(a);
          } catch (e) {
            return String(a);
          }
        }).join(' ');

        const stack = (new Error()).stack || '';
        const loc = extractLocationFromStack(stack);

        logToDebug('CONSOLE ' + m.toUpperCase(), message, loc.path, loc.line);
      } catch (e) {
        // swallow
      }
      return orig.apply(console, args);
    };
  });
})();

// 1. Capture Standard Errors
window.addEventListener('error', (event) => {
  // Prefer stack information when available for more accurate path/line
  const stack = event.error?.stack || event.message || '';
  const loc = extractLocationFromStack(stack);
  const path = event.filename || loc.path || 'Unknown Path';
  const line = (event.lineno && event.colno) ? `${event.lineno}:${event.colno}` : loc.line || 'N/A';

  logToDebug('RUNTIME ERROR', event.message, path, line);
});

// 2. Capture Async/Promise Rejections
window.addEventListener('unhandledrejection', (event) => {
  // event.reason usually contains the Error object or a string
  const reason = event.reason;
  const msg = reason?.message || (typeof reason === 'string' ? reason : String(reason)) || 'Unknown Promise Rejection';
  const stack = reason?.stack || (typeof reason === 'string' ? reason : '');
  const loc = extractLocationFromStack(stack);

  logToDebug('ASYNC ERROR', msg, loc.path, loc.line);
});
document.addEventListener('keydown', function(event) {
    if (event.key === 'F9') {
        // Prevent the browser's default F9 behavior if necessary
        event.preventDefault(); 
        //toggle debug overlay
        if (debugEl) {
            if (debugEl.style.display === 'none') {
                debugEl.style.display = 'block';
            } else {
                debugEl.style.display = 'none';
            }
        }
    }
});
debugEl.style.display = 'none'; // start hidden