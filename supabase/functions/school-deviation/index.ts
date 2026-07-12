import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BASE = 'https://www.yotsuyaotsuka.com/juken/data';

async function findSchoolCode(input: string): Promise<{ code: number; name: string } | null> {
  const res = await fetch(`${BASE}/`);
  if (!res.ok) throw new Error(`school list fetch failed: ${res.status}`);
  const html = await res.text();

  // Extract links: href="./index.php?code=123...">学校名</a>
  const re = /href="\.\/index\.php\?code=(\d+)[^"]*"\s*>([^<]+)<\/a>/g;
  const norm = (s: string) => s.replace(/[\s　]/g, '');
  const inp = norm(input);

  const candidates: { code: number; name: string; score: number }[] = [];

  for (const m of html.matchAll(re)) {
    const code = parseInt(m[1]);
    const name = norm(m[2].trim());
    let score = 0;
    if (name === inp) score = 100;
    else if (name.includes(inp)) score = 80;
    else if (inp.includes(name) && name.length >= 3) score = 70;
    else {
      // Try stripped version (remove common suffixes)
      const s = inp.replace(/中学校|中等部|女子学院|高等学校|学院|学園/, '');
      if (s.length >= 2 && name.includes(s)) score = 50;
    }
    if (score > 0) candidates.push({ code, name: m[2].trim(), score });
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0] ?? null;
}

async function fetchDeviation(code: number): Promise<{ round: string; a80: number; c50: number }[]> {
  const res = await fetch(`${BASE}/index.php?code=${code}`);
  if (!res.ok) throw new Error(`detail fetch failed: ${res.status}`);
  const html = await res.text();

  // Extract A-line 80 values (合格率80%) - avoid matching the "80" in "Aライン80"
  const a80s = [...html.matchAll(/Aライン[^<]{1,30}偏差値[^<\d]*?([3-8]\d(?:\.\d)?)/g)]
    .map(m => parseFloat(m[1]));
  // Extract C-line 50 values (合格率50%)
  const c50s = [...html.matchAll(/Cライン[^<]{1,30}偏差値[^<\d]*?([3-8]\d(?:\.\d)?)/g)]
    .map(m => parseFloat(m[1]));

  // Also try to grab date labels for round names
  const dateRe = /(\d{1,2})月(\d{1,2})日/g;
  const dates = [...html.matchAll(dateRe)].map(m => `${m[1]}/${m[2]}`);

  const count = Math.min(a80s.length, c50s.length);
  const results: { round: string; a80: number; c50: number }[] = [];

  for (let i = 0; i < count; i++) {
    results.push({
      round: dates[i] ? `第${i + 1}回（${dates[i]}）` : `第${i + 1}回`,
      a80: a80s[i],
      c50: c50s[i],
    });
  }

  // Deduplicate by (a80, c50) pair
  const seen = new Set<string>();
  return results.filter(r => {
    const key = `${r.a80}-${r.c50}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const { schoolName } = await req.json();

    const school = await findSchoolCode(schoolName);
    if (!school) {
      return new Response(
        JSON.stringify({ error: `「${schoolName}」は四谷大塚のデータベースに見つかりませんでした` }),
        { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }

    const entries = await fetchDeviation(school.code);
    if (entries.length === 0) {
      return new Response(
        JSON.stringify({ error: '偏差値データを取得できませんでした' }),
        { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ schoolName: school.name, code: school.code, entries }),
      { headers: { ...cors, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }
    );
  }
});
