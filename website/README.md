# Apps Script Repository Website

A modern, interactive website showcasing Google Apps Scripts for Google Workspace administration.

## 🌐 Live Site

**Domain:** [http://praveenmannem.xyz/](http://praveenmannem.xyz/)

## 📜 Available Scripts

### Inactive Users Audit Scripts
1. **180 Days - Auto Run** - Automated monthly audit with Reports API
2. **180 Days - Manual** - On-demand audit for testing and ad-hoc reporting
3. **365 Days** - Annual audit for license reclamation and compliance

### Groups Audit Script
4. **Batch Processing** - Enterprise-scale group ownership audit for 5,000+ groups

## 🚀 Deployment Guide

### Option 1: Deploy to Netlify (Recommended - Free)

1. **Create Netlify Account**
   - Go to [netlify.com](https://www.netlify.com/)
   - Sign up for free account

2. **Deploy via Drag & Drop**
   - Log into Netlify
   - Drag the entire `website` folder onto the Netlify dashboard
   - Wait for deployment (takes ~30 seconds)
   - You'll get a temporary URL like `random-name.netlify.app`

3. **Connect Your Domain**
   - In Netlify, go to Site Settings → Domain Management
   - Click "Add custom domain"
   - Enter `praveenmannem.xyz`
   - Netlify will provide DNS records

4. **Configure GoDaddy DNS**
   - Log into GoDaddy
   - Go to My Products → Domains → praveenmannem.xyz → DNS
   - Add these records (Netlify will show you the exact values):
     ```
     Type: A
     Name: @
     Value: 75.2.60.5 (Netlify's IP)
     
     Type: CNAME
     Name: www
     Value: your-site.netlify.app
     ```
   - Save changes

5. **Wait for DNS Propagation**
   - Takes 5-30 minutes
   - Check status at [whatsmydns.net](https://www.whatsmydns.net/)

6. **Enable HTTPS**
   - Netlify automatically provisions SSL certificate
   - Your site will be live at `https://praveenmannem.xyz`

### Option 2: Deploy to Vercel (Alternative - Free)

1. Go to [vercel.com](https://vercel.com/)
2. Sign up for free
3. Click "Add New" → "Project"
4. Import the `website` folder
5. Deploy
6. Follow similar domain connection steps as Netlify

### Option 3: GitHub Pages (Free)

1. Create a GitHub repository
2. Upload the `website` folder contents
3. Enable GitHub Pages in repository settings
4. Connect custom domain in settings

## 📁 Website Structure

```
website/
├── index.html          # Main HTML file
├── styles.css          # Complete CSS with dark mode
├── script.js           # Interactive JavaScript
├── scripts/            # Downloadable Apps Scripts
│   ├── inactive-180-auto.js
│   ├── inactive-180-manual.js
│   ├── inactive-365.js
│   └── groups-batch.js
└── README.md           # This file
```

## ✨ Features

- 🎨 Modern, responsive design
- 🌙 Dark mode toggle
- 📱 Mobile-friendly
- ⚡ Smooth animations
- 📋 Copy-to-clipboard functionality
- 📥 Downloadable scripts
- 📖 Comprehensive documentation
- 🔍 SEO optimized

## 🛠️ Local Testing

To test the website locally:

### Using Python (Recommended)
```bash
cd "C:\Users\Praveen Chowdari M\Desktop\AppScript\website"
python -m http.server 8000
```
Then open `http://localhost:8000` in your browser

### Using Node.js
```bash
npx -y http-server
```

### Using VS Code
Install "Live Server" extension and click "Go Live"

## 🔄 Updating Scripts

To update scripts on the live website:

1. Edit the script files in the `scripts/` folder
2. Re-deploy to your hosting provider:
   - **Netlify**: Drag & drop the updated folder
   - **Vercel**: Push to GitHub (if connected)
   - **GitHub Pages**: Commit and push changes

## 🎨 Customization

### Change Colors
Edit `styles.css` and modify the CSS variables in `:root`:
```css
:root {
    --primary: #4285f4;
    --secondary: #34a853;
    /* ... more colors */
}
```

### Add More Scripts
1. Add your script file to `scripts/` folder
2. Edit `index.html` to add a new script block
3. Follow the existing pattern for consistency

### Modify Content
- Edit `index.html` for content changes
- All text is in plain HTML, easy to modify
- No build process required

## 📊 Analytics (Optional)

To add Google Analytics:

1. Get your GA4 tracking ID
2. Add this before `</head>` in `index.html`:
```html
<!-- Google Analytics -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-XXXXXXXXXX');
</script>
```

## 🐛 Troubleshooting

### Site not loading after DNS change
- Wait 30 minutes for DNS propagation
- Clear browser cache (Ctrl+Shift+Delete)
- Try incognito mode
- Check DNS at whatsmydns.net

### Dark mode not working
- Clear browser cache
- Check browser console for JavaScript errors

### Scripts not downloading
- Ensure `scripts/` folder is uploaded
- Check file paths in `index.html`

## 📝 License

These scripts are provided as-is for educational and administrative purposes.

## 🤝 Support

For issues with:
- **The website**: Check this README
- **The scripts**: Refer to script documentation in the website
- **Domain/DNS**: Contact GoDaddy support
- **Hosting**: Contact Netlify/Vercel support

---

**Built with ❤️ for Google Workspace Admins**
