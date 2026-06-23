# KIJ App

KIJ管理ツール本体。Next.js App Router + TypeScript + Supabase + Vercel。

## ドキュメント入口

作業前に `../docs/summary.md` を読む。

- 作業開始・優先度: `../state/NEXT_TASKS.md`
- アーキテクチャ・ページ設計: `../docs/architecture/overview.md`
- DB設計: `../docs/architecture/database.md`
- 外部連携: `../docs/architecture/external-integrations.md`
- インフラ・デプロイ: `../docs/infra.md`
- チャットボット: `../docs/chatbot.md`
- 週次Web解析: `../docs/analytics.md`

内容が食い違う場合は `../docs/` と `../state/` を優先する。

## ローカル開発

```bash
npm run dev
```

http://localhost:3000 を開く。

## デプロイ

```bash
git push origin main
```

GitHub連携でVercelが自動デプロイする。

`npx vercel --prod` は使わない。二重ビルドになりHobbyプランのリソースを消耗する。

## 秘密情報

`.env.local` の実値はMarkdownへ書かない。必要な場合も変数名だけ記録する。
