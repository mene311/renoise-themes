// Direct Worker for renoisethemes.com - serves coming soon site directly
// This completely bypasses Pages subdomain routing

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // Serve main HTML
    if (url.pathname === '/' || url.pathname === '/index.html') {
      return new Response(HTML_CONTENT, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'public, max-age=3600'
        }
      });
    }
    
    // Serve CSS
    if (url.pathname.endsWith('.css')) {
      const cssName = url.pathname.split('/').pop();
      const cssContent = CSS_FILES[cssName] || '';
      return new Response(cssContent, {
        headers: {
          'Content-Type': 'text/css',
          'Cache-Control': 'public, max-age=86400'
        }
      });
    }
    
    // Serve JS
    if (url.pathname.endsWith('.js')) {
      const jsName = url.pathname.split('/').pop();
      const jsContent = JS_FILES[jsName] || '';
      return new Response(jsContent, {
        headers: {
          'Content-Type': 'application/javascript',
          'Cache-Control': 'public, max-age=86400'
        }
      });
    }
    
    // Default: serve main page
    return Response.redirect('https://renoisethemes.com/', 302);
  }
};

// HTML content - your complete coming soon page
const HTML_CONTENT = `<!DOCTYPE html>
<!-- Your complete coming soon HTML here -->
`;

// CSS files
const CSS_FILES = {
  'style.css': `/* Your CSS content */`,
  'main-site-style.css': `/* Main site CSS */`
};

// JS files  
const JS_FILES = {
  'script.js': `/* Your JavaScript */`
};