import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

// 立命館大学のオンラインシラバスをスクレイピングするAPI
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const keyword = searchParams.get('q');

  if (!keyword) {
    return NextResponse.json({ error: 'Keyword is required' }, { status: 400 });
  }

  try {
    // 実際の実装ではここで立命館大学のシラバス公開ページにリクエストを送り解析します。
    // Ritsumeikan Syllabus Example (Placeholder logic)
    // const res = await fetch(`https://example-ritsumei.ac.jp/syllabus?search=${keyword}`);
    // const html = await res.text();
    // const $ = cheerio.load(html);
    
    // 解析結果のダミーデータ
    const results = [
      { id: '1', title: `${keyword}入門`, professor: '立命 太郎', room: '衣笠 存心館' },
      { id: '2', title: `応用${keyword}`, professor: '理工 花子', room: 'BKC コアステーション' },
    ];

    return NextResponse.json({ data: results });
  } catch (error) {
    console.error('Scraping error:', error);
    return NextResponse.json({ error: 'Failed to fetch syllabus data' }, { status: 500 });
  }
}
