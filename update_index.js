const fs = require('fs');

let html = fs.readFileSync('index.html', 'utf8');

// 1. Add preconnects and update CSS version in head
const headTarget = '<link rel="stylesheet" href="style.css?v=20261013_v4">';
const preconnectsAndCss = `    <link rel="preconnect" href="https://esm.sh" crossorigin>
    <link rel="preconnect" href="https://flagcdn.com" crossorigin>
    <link rel="preconnect" href="https://firestore.googleapis.com" crossorigin>
    <link rel="stylesheet" href="style.css?v=20261013_v5">`;

if (html.includes(headTarget)) {
  html = html.replace(headTarget, preconnectsAndCss);
}

// 2. Update lucide script
html = html.replace(
  '<script src="https://unpkg.com/lucide@latest"></script>',
  '<script src="https://unpkg.com/lucide@0.447.0/dist/umd/lucide.min.js" defer></script>'
);

// 3. Update GridFinder logos (change w=3840 to w=256) and add fetchpriority="high" to brand-logo
html = html.replace(
  /class="brand-logo"\s+src="([^"]+)"/g,
  'class="brand-logo" fetchpriority="high" src="$1"'
);
html = html.replace(/w=3840/g, 'w=256');

// 4. Add loading="lazy" decoding="async" to flagcdn images if missing
html = html.replace(
  /<img\s+src="https:\/\/flagcdn\.com\/([^"]+)"/g,
  '<img loading="lazy" decoding="async" src="https://flagcdn.com/$1"'
);

// 5. Update script.js version for cache busting
html = html.replace('script.js?v=20261013_v4', 'script.js?v=20261013_v5');

fs.writeFileSync('index.html', html, 'utf8');
console.log('Successfully updated index.html');
