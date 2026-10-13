const fs = require('fs');
const https = require('https');
const path = require('path');

const PLACES = 7;
const DATA_FILE = path.join(__dirname, '..', 'data', 'views.json');
const SVG_FILE = path.join(__dirname, '..', 'assets', 'visitor-count.svg');

function fetchUrl(url, headers = {}) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'GitHub-Action-Visitor-Counter', ...headers } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    }).on('error', reject);
  });
}

function generateSvg(count) {
  const countStr = count.toString();
  const countWidth = Math.max(25, countStr.length * 8 + 9);
  const labelWidth = 79.2;
  const totalWidth = labelWidth + countWidth;
  const labelTextX = labelWidth / 2;
  const countTextX = labelWidth + countWidth / 2;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth.toFixed(1)}" height="20">
    <linearGradient id="b" x2="0" y2="100%">
        <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
        <stop offset="1" stop-opacity=".1"/>
    </linearGradient>
    <mask id="a">
        <rect width="${totalWidth.toFixed(1)}" height="20" rx="0" fill="#fff"/>
    </mask>
    <g mask="url(#a)">
        <rect width="${labelWidth}" height="20" fill="#555"/>
        <rect x="${labelWidth}" width="${countWidth}" height="20" fill="#6366f1"/>
        <rect width="${totalWidth.toFixed(1)}" height="20" fill="url(#b)"/>
    </g>
    <g fill="#fff" text-anchor="middle" font-family="DejaVu Sans,Verdana,Geneva,sans-serif" font-size="11">
        <text x="${labelTextX.toFixed(1)}" y="15" fill="#010101" fill-opacity=".3">Visitor Count</text>
        <text x="${labelTextX.toFixed(1)}" y="14">Visitor Count</text>
        <text x="${countTextX.toFixed(1)}" y="15" fill="#010101" fill-opacity=".3">${countStr}</text>
        <text x="${countTextX.toFixed(1)}" y="14">${countStr}</text>
    </g>
</svg>
`;
}

async function run() {
  let storedData = { total: 41, last_updated: new Date().toISOString() };
  if (fs.existsSync(DATA_FILE)) {
    try {
      storedData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (e) {
      console.warn('Failed to parse views.json, using default');
    }
  }

  let liveCount = storedData.total || 41;

  // 1. Fetch from live profile counter (Cloudflare Worker & Komarev)
  const counterEndpoints = [
    'https://profileviews.blueorbitdevs.workers.dev/?username=ilhamwahyuj',
    'https://komarev.com/ghpvc/?username=ilhamwahyuj&base=41'
  ];

  for (const endpoint of counterEndpoints) {
    try {
      const res = await fetchUrl(endpoint);
      if (res.status === 200) {
        const match = res.data.match(/<text[^>]*>(\d+)<\/text>/g);
        if (match && match.length > 0) {
          const last = match[match.length - 1];
          const val = parseInt(last.replace(/<[^>]+>/g, ''), 10);
          if (!isNaN(val)) {
            liveCount = Math.max(liveCount, val);
            console.log(`Live count from ${endpoint}: ${val}`);
          }
        }
      }
    } catch (err) {
      console.warn(`Error fetching ${endpoint}: ${err.message}`);
    }
  }

  // 2. Fetch from GitHub Traffic API if GITHUB_TOKEN is available
  const token = process.env.GITHUB_TOKEN;
  if (token) {
    try {
      const trafficRes = await fetchUrl(
        'https://api.github.com/repos/ilhamwahyuj/ilhamwahyuj/traffic/views',
        {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      );
      if (trafficRes.status === 200) {
        const trafficData = JSON.parse(trafficRes.data);
        console.log(`GitHub traffic views (14 days): ${trafficData.count}, uniques: ${trafficData.uniques}`);
        if (typeof trafficData.count === 'number') {
          liveCount = Math.max(liveCount, trafficData.count);
        }
      } else {
        console.warn(`GitHub Traffic API returned status ${trafficRes.status}`);
      }
    } catch (err) {
      console.warn(`Error fetching GitHub traffic API: ${err.message}`);
    }
  }

  // Ensure count only increases and never decreases
  const newTotal = Math.max(storedData.total || 0, liveCount);
  console.log(`Current stored total: ${storedData.total}, New computed total: ${newTotal}`);

  storedData.total = newTotal;
  storedData.last_updated = new Date().toISOString();

  // Ensure directories exist
  const dataDir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  const assetsDir = path.dirname(SVG_FILE);
  if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir, { recursive: true });
  }

  fs.writeFileSync(DATA_FILE, JSON.stringify(storedData, null, 2), 'utf8');

  const svgContent = generateSvg(newTotal);
  fs.writeFileSync(SVG_FILE, svgContent, 'utf8');
  console.log(`Updated ${SVG_FILE} successfully with total: ${newTotal}`);
}

run().catch(err => {
  console.error('Fatal error running update-counter:', err);
  process.exit(1);
});
