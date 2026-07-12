import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;
const BASE = 'https://www.yotsuyaotsuka.com/juken/data';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Step1: 学校リストから「コード: 学校名」テキストを生成
async function fetchSchoolListText(): Promise<string> {
  const res = await fetch(`${BASE}/`);
  if (!res.ok) throw new Error(`school list fetch: ${res.status}`);
  const html = await res.text();
  const lines: string[] = [];
  for (const m of html.matchAll(/[?&]code=(\d+)[^"']*['"][^>]*>([^<]{2,30})</g)) {
    lines.push(`${m[1]}: ${m[2].trim()}`);
  }
  return lines.join('\n');
}

// Step2: Claude で学校名を曖昧マッチングしてコードを返す
async function findCodeByClaude(schoolName: string, schoolList: string): Promise<number | null> {
  const res = await claudeCall(
    `以下の中学校リスト（形式: コード番号: 学校名）から「${schoolName}」に最も近い学校のコード番号のみを返してください。数字だけ返してください。見つからない場合は 0 を返してください。\n\n${schoolList}`,
    16
  );
  const num = parseInt(res.trim());
  return isNaN(num) || num === 0 ? null : num;
}

// Step3: 学校詳細ページをテキスト化して Claude で偏差値を抽出
async function fetchDeviation(code: number): Promise<{ round: string; a80: number; c50: number }[]> {
  const res = await fetch(`${BASE}/index.php?code=${code}`);
  if (!res.ok) throw new Error(`detail fetch: ${res.status}`);
  const html = await res.text();

  // HTMLタグを除去してプレーンテキスト化
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .substring(0, 4000);

  const json = await claudeCall(
    `以下は四谷大塚の中学校詳細ページのテキストです。
「Aライン80偏差値」（合格率80%）と「Cライン50偏差値」（合格率50%）を入試回ごとに抽出してください。

出力形式（JSONのみ、他の説明不要）：
[{"round":"第1回（2/1）","a80":66,"c50":62}]

テキスト:
${text}`,
    512
  );

  const match = json.match(/\[[\s\S]*?\]/);
  if (!match) throw new Error('deviation JSON not found');
  return JSON.parse(match[0]);
}

// Anthropic API 共通呼び出し
async function claudeCall(prompt: string, maxTokens: number): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Claude API: ${res.status}`);
  const data = await res.json();
  return data.content[0].text;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const { schoolName } = await req.json();

    const schoolList = await fetchSchoolListText();
    const code = await findCodeByClaude(schoolName, schoolList);
    if (!code) {
      return new Response(
        JSON.stringify({ error: `「${schoolName}」に近い学校が見つかりませんでした` }),
        { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }

    const entries = await fetchDeviation(code);
    if (!entries.length) {
      return new Response(
        JSON.stringify({ error: '偏差値データを取得できませんでした' }),
        { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ code, entries }),
      { headers: { ...cors, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }
    );
  }
});
