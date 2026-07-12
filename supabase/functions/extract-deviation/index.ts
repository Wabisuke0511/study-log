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
        max_tokens: 8192,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: imageBase64 },
            },
            {
              type: 'text',
              text: `中学受験の偏差値換算表です。JSONのみ出力（説明・コードブロック不要）。

形式：
{"grade":"小4","round":"第4回","year":"2025","averages":{"sansu":99,"kokugo":82,"rika":68,"shakai":66,"total2":181,"total3":249,"total4":315},"rows":[{"dev":75,"sansu":[196,199],"kokugo":[143,144],"rika":null,"shakai":null,"total2":null,"total3":null,"total4":null}]}

ルール：
- grade: 画像中の「4年」「5年」「6年」などを探す→「小4」「小5」「小6」に変換。タイトル・右上・左上・ヘッダーなど全体を確認。不明な場合はnull
- round: 「第1回」「第2回」…「第8回」などを探す。タイトルや欄外も確認。不明な場合はnull
- year: 西暦4桁を探す（「2024年度」「2025」など）。和暦なら西暦に変換。不明な場合はnull
- rowsは偏差値降順で全行
- 範囲は[最小,最大]、単一値は[n,n]、空欄はnull
- averagesは「平均」行から取得
- 存在しない列はnull固定
- スペース・改行を最小限にしてコンパクトに出力`,
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

    // JSON部分を抽出
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('JSONが抽出できませんでした: ' + text.slice(0, 200));

    let jsonStr = jsonMatch[0];

    // 末尾が切れている場合の補完
    const openBrackets = (jsonStr.match(/\[/g) || []).length;
    const closeBrackets = (jsonStr.match(/\]/g) || []).length;
    const openBraces = (jsonStr.match(/\{/g) || []).length;
    const closeBraces = (jsonStr.match(/\}/g) || []).length;
    // 不完全な末尾行を除去してから閉じる
    jsonStr = jsonStr.replace(/,\s*\{[^}]*$/, '');
    for (let i = 0; i < openBrackets - closeBrackets; i++) jsonStr += ']';
    for (let i = 0; i < openBraces - closeBraces; i++) jsonStr += '}';

    const result = JSON.parse(jsonStr);

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
