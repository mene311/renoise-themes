// functions/_redirects.js
// Cloudflare Pages Functions for routing
export async function onRequest(context) {
  const url = new URL(context.request.url);
  
  // Serve static files directly
  if (url.pathname.includes('.')) {
    return context.next();
  }
  
  // Redirect all other requests to index.html for SPA routing
  return Response.redirect(new URL('/index.html', context.request.url), 302);
}