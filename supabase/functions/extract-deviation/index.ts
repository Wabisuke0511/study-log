import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { imageBase64, mediaType } = await req.json();
    if (!imageBase64) throw new Error('imageBase64 is required');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4096,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: imageBase64 },
            },
            {
              type: 'text',
              text: `この画像は中学受験の偏差値換算表（評価表）です。
表から以下の形式のJSONのみを出力してください（説明文・コードブロック不要）：
{
  "averages": { "sansu": 99, "kokugo": 82, "rika": 68, "shakai": 66, "total2": 181, "total3": 249, "total4": 315 },
  "rows": [
    { "dev": 75, "sansu": [196,199], "kokugo": [143,144], "rika": null, "shakai": null, "total2": null, "total3": null, "total4": null },
    { "dev": 50, "sansu": [97,100], "kokugo": [81,83], "rika": [67,68], "shakai": [65,66], "total2": [179,183], "total3": [246,252], "total4": [311,319] }
  ]
}
ルール：
- rowsは偏差値の高い順（降順）で全行を含める
- スコア範囲は[最小,最大]の配列。単一値（例：「94」）は[94,94]、空欄・「－」はnull
- averagesは表最下部の「平均」行から取得。存在しない列はnull
- 列が存在しない場合（例：理科・社会がない）はnull固定
- 表に「3教科計」列がなければtotal3はnull固定`,
            },
          ],
        }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Claude API error: ${response.status} ${errText}`);
    }

    const data = await response.json();
    const text = (data.content?.[0]?.text || '').trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('JSONが抽出できませんでした: ' + text.slice(0, 200));
    const result = JSON.parse(jsonMatch[0]);

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
