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
  const digits = count.toString().padStart(PLACES, '0').slice(-PLACES).split('');
  const parts = digits.map((digit, index) => `        <rect fill="#000000" x="${index * 32}" y="0.5" width="29" height="29" rx="3"></rect>
        <text font-family="Courier, monospace" font-size="24" font-weight="bold" fill="#00FF13">
            <tspan x="${index * 32 + 7}" y="22">${digit}</tspan>
        </text>`).join('\n');

  return `<svg width="${PLACES * 32}px" height="30px" version="1.1" xmlns="http://www.w3.org/2000/svg">
    <title>Visitor Count</title>
    <g id="Page-1" stroke="none" stroke-width="1" fill="none" fill-rule="evenodd">
${parts}
    </g>
</svg>
`;
}

async function run() {
  let storedData = { total: 17, last_updated: new Date().toISOString() };
  if (fs.existsSync(DATA_FILE)) {
    try {
      storedData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (e) {
      console.warn('Failed to parse views.json, using default');
    }
  }

  let liveCount = 0;

  // 1. Fetch from live profile counter
  try {
    const komarevRes = await fetchUrl('https://komarev.com/ghpvc/?username=ilhamwahyuj');
    if (komarevRes.status === 200) {
      const match = komarevRes.data.match(/<text[^>]*>(\d+)<\/text>/g);
      if (match && match.length > 0) {
        const last = match[match.length - 1];
        const val = parseInt(last.replace(/<[^>]+>/g, ''), 10);
        if (!isNaN(val)) {
          liveCount = Math.max(liveCount, val);
          console.log(`Live count from profile views service: ${val}`);
        }
      }
    }
  } catch (err) {
    console.warn(`Error fetching live counter: ${err.message}`);
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
