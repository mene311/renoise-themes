// Direct Worker serving coming soon site from renoisethemes.com
// This worker bypasses Pages subdomain completely

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // Serve the coming soon HTML directly
    if (url.pathname === '/') {
      return new Response(comingSoonHTML, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'public, max-age=3600'
        }
      });
    }
    
    // Serve CSS files
    if (url.pathname.endsWith('.css')) {
      const cssResponse = await fetch(`https://05be937e.renoisethemes.pages.dev${url.pathname}`);
      return new Response(cssResponse.body, {
        headers: {
          'Content-Type': 'text/css',
          'Cache-Control': 'public, max-age=86400'
        }
      });
    }
    
    // Serve JS files
    if (url.pathname.endsWith('.js')) {
      const jsResponse = await fetch(`https://05be937e.renoisethemes.pages.dev${url.pathname}`);
      return new Response(jsResponse.body, {
        headers: {
          'Content-Type': 'application/javascript',
          'Cache-Control': 'public, max-age=86400'
        }
      });
    }
    
    // Default: redirect to main page
    return Response.redirect('https://renoisethemes.com/', 302);
  }
};

const comingSoonHTML = `<!DOCTYPE html>
<!-- Your coming soon HTML content here -->
<!-- This would be the full HTML from your coming soon site -->`;