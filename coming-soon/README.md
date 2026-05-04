# Cloudflare Pages Coming Soon Website

This is a modern, responsive coming soon website ready for deployment to Cloudflare Pages.

## Features

- 🎨 Modern design with audio/tech vibes
- ⚡ Fast loading with Cloudflare CDN
- 📱 Fully responsive design
- ⏰ Countdown timer to launch date
- ✉️ Email subscription form (placeholder)
- 🌊 Animated wave background
- 🔔 Social links integration

## Deployment to Cloudflare Pages

### Option 1: Direct Upload (Easiest)

1. Go to [Cloudflare Pages](https://pages.cloudflare.com/)
2. Select your account and click "Create a project"
3. Choose "Direct Upload"
4. Drag and drop the entire `coming-soon` folder
5. Click "Deploy site"

### Option 2: Connect Git Repository (Recommended)

1. Push this coming-soon directory to a Git repository
2. In Cloudflare Pages, connect to your Git provider
3. Select the repository and branch
4. Set build settings:
   - **Build command**: (leave empty - static site)
   - **Build output directory**: `/coming-soon`
   - **Root directory**: `/` (if in separate repo)

### Option 3: Wrangler CLI (Advanced)

```bash
# Install Wrangler
npm install -g wrangler

# Login to Cloudflare
wrangler login

# Deploy to Cloudflare Pages
wrangler pages publish coming-soon --project-name=your-project-name
```

## Customization

### Update Launch Date
Edit `js/script.js`, line 4:
```javascript
this.launchDate = new Date('2026-06-01T00:00:00').getTime();
```

### Update Brand Colors
Edit `css/style.css` and change these CSS variables:
```css
/* Change these throughout the file */
color: #8a2be2; /* Primary purple */
background: linear-gradient(45deg, #8a2be2, #9370db);
```

### Add Real Email Service
Replace the placeholder in `js/script.js` (handleSubscription method) with your email service API.

### Update Social Links
Edit `index.html` and update the social media URLs:
```html
<a href="https://github.com/yourusername" class="social-link">GitHub</a>
<a href="https://twitter.com/yourusername" class="social-link">Twitter</a>
<a href="https://discord.gg/yourinvite" class="social-link">Discord</a>
```

## Cloudflare DNS Setup

After deployment:

1. Go to your domain in Cloudflare DNS
2. Add a CNAME record:
   - **Type**: CNAME
   - **Name**: @ (or subdomain like "www")
   - **Target**: your-pages-project.pages.dev
   - **Proxy status**: Proxied (orange cloud)

3. In Cloudflare Pages settings, go to "Custom domains"
4. Add your custom domain
5. Follow the verification steps

## Performance Features

Cloudflare provides:
- Global CDN distribution
- Automatic HTTPS/SSL
- DDoS protection
- Browser caching optimization
- Image optimization
- Zero-config deployment

## Monitoring

Check your Cloudflare Pages dashboard for:
- Build status and history
- Visitor analytics
- Error logs
- Performance metrics

## Next Steps

1. ✅ Customize the design and content
2. ✅ Set your actual launch date
3. ✅ Connect real social media links
4. ⬜ Integrate with email service (Mailchimp, ConvertKit, etc.)
5. ⬜ Add Google Analytics if needed
6. ⬜ Set up proper DNS records
7. ⬜ Test on different devices

## File Structure

```
coming-soon/
├── index.html          # Main HTML file
├── css/
│   └── style.css       # All styles and animations
├── js/
│   └── script.js       # Countdown and functionality
├── images/             # (Optional) Add logo and images
└── README.md           # This file
```
 
 
