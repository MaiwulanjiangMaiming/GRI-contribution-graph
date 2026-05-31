/**
 * GitHub Contribution Graph API
 * Fetches real contribution data from GitHub GraphQL API
 * Based on snk's github-user-contribution package
 */

async function getGithubContributions(username, token) {
  const query = `
    query ($login: String!) {
      user(login: $login) {
        contributionsCollection {
          contributionCalendar {
            weeks {
              contributionDays {
                contributionCount
                contributionLevel
                weekday
                date
              }
            }
          }
        }
      }
    }
  `;

  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'github-resonance-imaging',
    },
    body: JSON.stringify({ query, variables: { login: username } }),
  });

  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
  }

  const { data, errors } = await res.json();
  if (errors?.[0]) throw new Error(errors[0].message);
  if (!data?.user) throw new Error(`User "${username}" not found`);

  const weeks = data.user.contributionsCollection.contributionCalendar.weeks;

  // Convert to grid format: 52 weeks x 7 days
  // contributionLevel: NONE=0, FIRST_QUARTILE=1, SECOND_QUARTILE=2, THIRD_QUARTILE=3, FOURTH_QUARTILE=4
  const grid = [];
  const kmag = [];

  for (let w = 0; w < weeks.length; w++) {
    grid[w] = [];
    kmag[w] = [];
    const days = weeks[w].contributionDays;

    for (let d = 0; d < 7; d++) {
      const day = days.find((dd) => dd.weekday === d);
      if (day) {
        const levelMap = {
          NONE: 0,
          FIRST_QUARTILE: 1,
          SECOND_QUARTILE: 2,
          THIRD_QUARTILE: 3,
          FOURTH_QUARTILE: 4,
        };
        grid[w][d] = levelMap[day.contributionLevel] ?? 0;

        // k-space magnitude based on contribution count
        const maxCount = Math.max(...days.map((dd) => dd.contributionCount), 1);
        kmag[w][d] = day.contributionCount / maxCount;
      } else {
        grid[w][d] = 0;
        kmag[w][d] = 0;
      }
    }
  }

  // Pad to 52 weeks if needed
  while (grid.length < 52) {
    const emptyWeek = new Array(7).fill(0);
    grid.push([...emptyWeek]);
    kmag.push([...emptyWeek]);
  }

  return { grid, kmag, weeks: weeks.length };
}

// For demo/fallback: generate deterministic fake data
function generateFakeData(seed = 20260531) {
  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const rnd = mulberry32(seed);
  const grid = [];
  const kmag = [];

  for (let w = 0; w < 52; w++) {
    grid[w] = [];
    kmag[w] = [];
    for (let d = 0; d < 7; d++) {
      const r = rnd();
      const lv = r > 0.82 ? 2 : r > 0.55 ? 1 : 0;
      grid[w][d] = lv;

      const sw = 6.0;
      const sd = 2.0;
      kmag[w][d] =
        Math.exp(-Math.pow(w - 25.5, 2) / (2 * sw * sw)) *
        Math.exp(-Math.pow(d - 3, 2) / (2 * sd * sd)) *
        (0.85 + 0.3 * rnd());
    }
  }

  // Embed "GRI" letters
  const GLYPHS = {
    G: ['01110', '10001', '10000', '10011', '10001', '10001', '01110'],
    R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
    I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  };
  const letters = ['G', 'R', 'I'];
  let sx = 17;
  for (let li = 0; li < 3; li++) {
    const g = GLYPHS[letters[li]];
    for (let cy = 0; cy < 7; cy++) {
      const row = g[cy];
      for (let cx = 0; cx < 5; cx++) {
        if (row[cx] === '1') {
          const ww = sx + cx;
          if (ww < 52) grid[ww][cy] = rnd() > 0.35 ? 4 : 3;
        }
      }
    }
    sx += 6;
  }

  return { grid, kmag, weeks: 52 };
}

// Browser-compatible export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getGithubContributions, generateFakeData };
}
