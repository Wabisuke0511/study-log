import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const { schoolName, course } = await req.json();

    const prompt = `あなたは中学受験の偏差値情報に詳しいアシスタントです。
四谷大塚の偏差値表をもとに、以下の中学校の偏差値範囲を教えてください。

学校名: ${schoolName}
コース/入試区分: ${course || '（指定なし・一般）'}

ルール:
- 四谷大塚の合格率50%偏差値（4科目総合）を基準とする
- fromは「合格率50%偏差値 - 3」、toは「合格率50%偏差値 + 2」程度の範囲にする
- 偏差値は整数または小数第1位（例: 55.0）
- 不明な学校は類似校・難易度帯から推定してよい
- 必ずJSONのみ返す（前後の説明・コードブロック不要）

{"from": 数値, "to": 数値, "note": "根拠メモ（例: 四谷大塚2024年4科50%偏差値58）"}`;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 256,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) throw new Error(`Anthropic API: ${res.status}`);

    const data = await res.json();
    const text = data.content[0].text.trim();
    const match = text.match(/\{[\s\S]*?\}/);
    if (!match) throw new Error('JSON not found');
    const result = JSON.parse(match[0]);

    return new Response(JSON.stringify(result), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
