const fs = require("fs");

const USERNAME = "DevRootDuck";
const TOKEN = process.env.GITHUB_TOKEN;
const API = "https://api.github.com";

if (!TOKEN) throw new Error("GITHUB_TOKEN não encontrado");

async function github(path, options = {}) {
  const response = await fetch(API + path, {
    ...options,
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": `Bearer ${TOKEN}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    throw new Error(`GitHub API ${response.status}: ${await response.text()}`);
  }

  return response.json();
}

async function graphql(query) {
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": `Bearer ${TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ query })
  });

  const data = await response.json();
  if (!response.ok || data.errors) {
    throw new Error(JSON.stringify(data.errors || data));
  }
  return data.data;
}

function esc(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function pct(value, total) {
  return total ? (value / total) * 100 : 0;
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

const profile = await github(`/users/${USERNAME}`);

const gql = await graphql(`
{
  user(login: "${USERNAME}") {
    contributionsCollection {
      totalCommitContributions
      totalIssueContributions
      totalPullRequestContributions
      totalRepositoryContributions
      totalRepositoriesWithContributedCommits
      contributionCalendar {
        totalContributions
        weeks {
          contributionDays {
            date
            contributionCount
          }
        }
      }
    }
    repositories(
      first: 100
      ownerAffiliations: OWNER
      privacy: PUBLIC
      orderBy: {field: UPDATED_AT, direction: DESC}
    ) {
      nodes {
        name
        languages(first: 10, orderBy: {field: SIZE, direction: DESC}) {
          edges {
            size
            node { name }
          }
        }
      }
    }
  }
}
`);

const calendar = gql.user.contributionsCollection.contributionCalendar;
const days = calendar.weeks.flatMap(w => w.contributionDays);

let currentStreak = 0;
for (let i = days.length - 1; i >= 0; i--) {
  if (days[i].contributionCount > 0) currentStreak++;
  else if (i !== days.length - 1) break;
}

let longestStreak = 0;
let run = 0;
for (const day of days) {
  if (day.contributionCount > 0) {
    run++;
    longestStreak = Math.max(longestStreak, run);
  } else {
    run = 0;
  }
}

// Soma o tamanho de cada linguagem entre os repositórios públicos do usuário
const languageTotals = {};
for (const repo of gql.user.repositories.nodes) {
  for (const edge of repo.languages.edges) {
    languageTotals[edge.node.name] =
      (languageTotals[edge.node.name] || 0) + edge.size;
  }
}

const languages = Object.entries(languageTotals)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 6);

const languageTotal = languages.reduce((sum, [, size]) => sum + size, 0);

const languageColors = {
  JavaScript: "#f1e05a",
  TypeScript: "#3178c6",
  Python: "#3572A5",
  Java: "#b07219",
  C: "#555555",
  "C++": "#f34b7d",
  "C#": "#178600",
  Go: "#00ADD8",
  HTML: "#e34c26",
  CSS: "#563d7c",
  Rust: "#dea584",
  PHP: "#4F5D95",
  Kotlin: "#A97BFF",
  Shell: "#89e051",
  Dart: "#00B4AB",
  Ruby: "#701516"
};

const topLanguages = languages.map(([name, size]) => ({
  name,
  percentage: round1(pct(size, languageTotal)),
  color: languageColors[name] || "#8b949e"
}));

const contributionDays = days.slice(-30);
const maxContribution = Math.max(...contributionDays.map(d => d.contributionCount), 1);

function lineChart() {
  const x0 = 42, y0 = 382, width = 490, height = 70;
  const points = contributionDays.map((d, i) => {
    const x = x0 + (i * width) / Math.max(contributionDays.length - 1, 1);
    const y = y0 - (d.contributionCount / maxContribution) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");

  return `
    <polyline points="${points}" fill="none" stroke="#2f81f7" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    ${contributionDays.map((d, i) => {
      const x = x0 + (i * width) / Math.max(contributionDays.length - 1, 1);
      const y = y0 - (d.contributionCount / maxContribution) * height;
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" fill="#2f81f7"/>`;
    }).join("")}
  `;
}

function donut() {
  const cx = 785, cy = 280, r = 86;
  let angle = -90;
  let paths = "";

  for (const lang of topLanguages) {
    const start = angle;
    const sweep = (lang.percentage / 100) * 360;
    angle += sweep;
    const end = angle;

    const largeArc = sweep > 180 ? 1 : 0;
    const startRad = start * Math.PI / 180;
    const endRad = end * Math.PI / 180;

    const x1 = cx + r * Math.cos(startRad);
    const y1 = cy + r * Math.sin(startRad);
    const x2 = cx + r * Math.cos(endRad);
    const y2 = cy + r * Math.sin(endRad);

    paths += `<path d="M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z" fill="${lang.color}"/>`;
  }

  return paths;
}

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1100" height="760" viewBox="0 0 1100 760" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#05080d"/>
      <stop offset="100%" stop-color="#0b111a"/>
    </linearGradient>
    <filter id="glow">
      <feGaussianBlur stdDeviation="7" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <rect width="1100" height="760" rx="24" fill="url(#bg)"/>

  <text x="55" y="68" fill="#f0f6fc" font-size="30" font-weight="700" font-family="Arial, sans-serif">Estatísticas</text>
  <line x1="250" y1="58" x2="1045" y2="58" stroke="#30363d"/>

  <rect x="45" y="100" width="505" height="300" rx="18" fill="#070b11" stroke="#2f81f7"/>
  <text x="75" y="145" fill="#2f81f7" font-size="23" font-weight="700" font-family="Arial, sans-serif">Resumo do GitHub</text>

  <text x="78" y="205" fill="#f0f6fc" font-size="34" font-weight="700" font-family="Arial, sans-serif">${calendar.totalContributions}</text>
  <text x="78" y="230" fill="#8b949e" font-size="15" font-family="Arial, sans-serif">Contribuições</text>

  <text x="250" y="205" fill="#f0f6fc" font-size="34" font-weight="700" font-family="Arial, sans-serif">${profile.public_repos}</text>
  <text x="250" y="230" fill="#8b949e" font-size="15" font-family="Arial, sans-serif">Repositórios</text>

  <text x="405" y="205" fill="#f0f6fc" font-size="34" font-weight="700" font-family="Arial, sans-serif">${profile.followers}</text>
  <text x="405" y="230" fill="#8b949e" font-size="15" font-family="Arial, sans-serif">Seguidores</text>

  <line x1="75" y1="260" x2="520" y2="260" stroke="#21262d"/>
  <text x="75" y="292" fill="#c9d1d9" font-size="16" font-family="Arial, sans-serif">Contribuições nos últimos 30 dias</text>
  ${lineChart()}

  <rect x="575" y="100" width="480" height="300" rx="18" fill="#070b11" stroke="#a371f7"/>
  <text x="605" y="145" fill="#a371f7" font-size="23" font-weight="700" font-family="Arial, sans-serif">Linguagens mais usadas</text>

  <circle cx="785" cy="280" r="92" fill="#0b111a"/>
  ${donut()}
  <circle cx="785" cy="280" r="52" fill="#070b11"/>
  <text x="785" y="288" text-anchor="middle" fill="#a371f7" font-size="24" font-weight="700" font-family="Arial, sans-serif">&lt;/&gt;</text>

  ${topLanguages.map((lang, i) => `
    <circle cx="910" cy="${195 + i * 34}" r="7" fill="${lang.color}"/>
    <text x="928" y="${201 + i * 34}" fill="#f0f6fc" font-size="14" font-family="Arial, sans-serif">${esc(lang.name)}</text>
    <text x="1020" y="${201 + i * 34}" text-anchor="end" fill="#8b949e" font-size="14" font-family="Arial, sans-serif">${lang.percentage}%</text>
  `).join("")}

  <text x="55" y="465" fill="#f0f6fc" font-size="30" font-weight="700" font-family="Arial, sans-serif">GitHub Streak</text>
  <line x1="250" y1="455" x2="1045" y2="455" stroke="#30363d"/>

  <rect x="45" y="495" width="1010" height="210" rx="18" fill="#070b11" stroke="#238636"/>

  <text x="95" y="575" fill="#3fb950" font-size="48" font-weight="700" font-family="Arial, sans-serif">${currentStreak}</text>
  <text x="95" y="602" fill="#8b949e" font-size="15" font-family="Arial, sans-serif">dias atuais</text>
  <text x="95" y="650" fill="#c9d1d9" font-size="14" font-family="Arial, sans-serif">Maior sequência: ${longestStreak} dias</text>

  ${contributionDays.map((d, i) => {
    const x = 300 + (i % 15) * 43;
    const y = 545 + Math.floor(i / 15) * 43;
    const intensity = d.contributionCount === 0 ? "#161b22" :
      d.contributionCount / maxContribution > .75 ? "#39d353" :
      d.contributionCount / maxContribution > .5 ? "#26a641" :
      d.contributionCount / maxContribution > .25 ? "#006d32" : "#0e4429";
    return `<rect x="${x}" y="${y}" width="30" height="30" rx="5" fill="${intensity}"><title>${d.date}: ${d.contributionCount} contribuições</title></rect>`;
  }).join("")}

  <text x="55" y="742" fill="#6e7681" font-size="12" font-family="Arial, sans-serif">Atualizado automaticamente pelo GitHub Actions</text>
</svg>`;

fs.writeFileSync("assets/github-stats.svg", svg);
console.log("Estatísticas atualizadas");
