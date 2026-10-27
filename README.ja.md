<div align="center">

<img src="docs/assets/readme-cover.svg" alt="Couple Diary：桜、花火、紅葉、雪の夜。ふたりの日常を残す場所" width="880">

# ふたりの恋愛日記

**何気ない毎日も、次に会う約束も。ふたりだけの小さな居場所。**

[简体中文](README.md) · [English](README.en.md) · **日本語**

[はじめる](#はじめる) · [できること](#できること) · [WeChatミニプログラム](#wechatミニプログラム) · [メール通知](#メール通知) · [MITライセンス](LICENSE)

</div>

---

自分たちで設置して使う、ふたり専用の日記です。想いを伝えたり、思い出を残したり、次に会う日を計画したり。背景には日本の四季をイメージした風景が広がります。

**コードは公開。日記はふたりのもの。** カップルごとに専用のバックエンドと2つのアカウントを作成します。共通の運営サーバーや利用アカウントを提供するサービスではありません。READMEは中国語・英語・日本語に対応していますが、アプリと設定ウィザードの画面は現在、中国語が中心です。

## できること

| 機能 | ふたりでできること |
| :--- | :--- |
| 💌 想いを届けるお店 | 「会いたい」「一緒に過ごしたい」を0円の注文で伝える。返信・発送済みの記録、商品の追加・編集・削除、任意の金額や購入リンクに対応。 |
| 📷 思い出アルバム | タイトル・場所・出来事・気持ち・写真を保存。詳細の展開、編集、写真の拡大表示。 |
| 🗓️ 会う日の計画 | 開始日・終了日、場所、旅程を設定。カウントダウン、初日のお祝い、一緒にいる状態、終了後の案内。非公開のWord / PDF資料も共有。 |
| ✨ ウィッシュリスト | カテゴリを自由に追加。願いを会う日の計画に組み込み、実現したら思い出へ。 |
| ☁️ 気持ちの部屋 | 今の気持ちや写真を24時間表示。過去の記録は月ごとの気分カレンダーに保存。 |
| 📨 ホームのメッセージ | 相手の更新、リアクション、既読の履歴を確認。 |
| 🌸 四季の風景 | 桜、花火、紅葉、雪の夜。起動時はランダムに、滞在中は2分ごとにゆっくり切り替え。 |
| 🔔 任意のメール通知 | 新規注文、初回発送、気持ち、思い出、願い、計画の更新をお知らせ。 |

> 0円の注文は気持ちを伝えるための機能です。実際の決済は行いません。金額と外部リンクは任意の参考情報です。

## はじめる

**おすすめ：GitHub → Supabase → Cloudflare Pages。** Web版の基本機能に、メール設定やWeChatの開発者アカウントは必要ありません。

### 1 · 自分たちのリポジトリを作る

**Use this template → Create a new repository**を選びます。公開・非公開のどちらでも構いません。テンプレートボタンがない場合は、Forkするか、ダウンロードしたソースを新しいリポジトリにアップロードしてください。

### 2 · バックエンドと2人のユーザーを作る

[Supabase](https://supabase.com/dashboard)で専用のプロジェクトを作成します。**Authentication → Users → Add user → Create new user**から、異なるメールアドレスで2人のユーザーを作成し、**Auto Confirm User**にチェックを入れます。パスワードは各自で保管し、2人のUUIDをコピーします。

一般ユーザーの新規登録と匿名ログインは無効にし、**Emailログインは有効のまま**にします。Project URLはプロジェクト概要 / Connect、Publishable keyはAPI Keysで確認できます。

### 3 · ローカルのウィザードで設定を作る

自分のリポジトリで**Code → Download ZIP**を選び、展開します。ルートの`setup.html`をパソコンのブラウザで開き、2人の呼び名、記念日、Project URL、Publishable key、2人のUUIDを入力します。生成された**`setup-private.sql`**と**`config.js`**をダウンロードします。

入力内容はブラウザ内で処理されます。ユーザーのパスワード、データベースのパスワード、メールの認証情報は入力しません。

### 4 · データベースとWeb接続を設定する

生成した`setup-private.sql`をすべてコピーして、**Supabase → SQL Editor → 新しいクエリ → Run**で実行します。成功すると、a・bの2行が表示されます。自分のリポジトリの**`site/config.js`**を、生成したファイルで置き換えてコミットします。

### 5 · Cloudflare Pagesにデプロイする

[Cloudflare](https://dash.cloudflare.com/)で**Workers & Pages → Create application → Pages / Continue to Pages → Connect to Git / Import Git repository**と進み、自分のGitHubリポジトリを接続します。

| 設定 | 値 |
| :--- | :--- |
| Production branch | `main`、または実際のデフォルトブランチ |
| Framework preset | `None` |
| Build command | `python3 tools/build.py` |
| Build output directory | `dist` |
| Root directory | リポジトリのルートのまま |

保存してデプロイします。発行された本番用HTTPSアドレスを2人のスマートフォンで開き、それぞれログインします。注文・気持ち・写真を1つずつ追加し、相手側にも同期されることを確認してください。

接続した自分のリポジトリへのコミットで再ビルドされます。元のテンプレートの更新は、自分のコピーには自動で取り込まれません。

📖 [詳しいデプロイ手順とFAQ・中国語](docs/DEPLOY.md) · [セキュリティ](SECURITY.md)

## WeChatミニプログラム

| 方法 | 現在の対応状況 |
| :--- | :--- |
| スマートフォンのブラウザでWeb版を使う | このリポジトリで提供しているデプロイ方法。メールログインとSupabaseを使用。 |
| ネイティブのWeChatミニプログラム | WeChatのユーザー識別とCloudBaseを使う、別の初期コード。**本リポジトリには含まれず、現在のWeb版と同じ機能ではありません。** |

このリポジトリのHTML・CSS・Supabaseスクリプトを、そのままネイティブのミニプログラムとしてアップロードすることはできません。初期のネイティブソース一式をお持ちの場合は、[WeChatデプロイガイド・中国語](docs/WECHAT.md)を参照してください。必要なソース構成、AppID、CloudBaseのコレクション、権限設定、2人の許可リスト、体験版の確認を説明しています。

このガイドはWeb版を自動変換する機能ではありません。WeChat内でWebサイトを開くことも、ミニプログラムの導入とは異なります。普段使う回線とブラウザで、2人ともアクセスできるか確認してください。

## メール通知

メールは任意の機能です。標準のGmail設定では、**メンバーBのログイン用Gmailアドレス**を、本人の同意のもと送信元に使います。送信先は登録された2人に限定されます。

<details>
<summary>Gmail通知を設定する</summary>

1. そのGoogleアカウントで2段階認証を有効にし、[アプリパスワード](https://myaccount.google.com/apppasswords)を発行します。通常のログインパスワードではなく、16文字のアプリパスワードを使用します。
2. **Supabase → Edge Functions → Secrets**に以下を保存します。

   | Name | Value |
   | :--- | :--- |
   | `MAIL_PROVIDER` | `gmail` |
   | `GMAIL_APP_PASSWORD` | そのアカウントのアプリパスワード |
   | `DIARY_SITE_URL` | 自分たちの本番用HTTPSホームページ |
   | `DIARY_MAIL_WORKER_SECRET` | 32文字以上のランダムな秘密値 |

3. **`diary_mail`**というEdge Functionを作成し、`index.ts`全体を`supabase/functions/diary-mail/index.ts`の内容で置き換えてデプロイします。**Verify JWT with legacy secret**はオフにします。この関数は専用のタスク用秘密値を検証します。
4. `database/mail-schedule.example.sql`の`YOUR_PROJECT_REF`をSupabase URL内のプロジェクト識別子に、秘密値のプレースホルダーを同じタスク用秘密値に置き換えます。自分のSQL Editorで実行し、設定済みSQLはコミットしないでください。
5. 新しい注文を作成し、定期実行後に受信トレイと迷惑メールを確認します。送信キューの確認用SQLは[メールガイド・中国語](docs/MAIL.md)にあります。

新規注文、初回発送、新しい気持ち・思い出・願い、計画の新規作成 / 編集が通知対象です。返信、閲覧、商品情報の管理では送信しません。設定前の出来事はさかのぼって送信しません。

デプロイ名はアンダースコアの**`diary_mail`**、ソースのディレクトリ名はハイフンの`diary-mail`です。

</details>

## データとプライバシー

カップルごとに独立したSupabaseプロジェクトを使います。ログイン、2人のメンバーリスト、RLSでアクセスを保護します。写真と添付資料のバケットは**Private**のままにしてください。複数のカップルで1つのバックエンドを共有する設計ではありません。

`site/config.js`のProject URLとPublishable keyは公開可能なクライアント設定です。**データベースのパスワード、SMTP / Gmailのアプリパスワード、タスク用秘密値、Secret key、service_role keyはフロントエンドやリポジトリに置かないでください。**

ログイン画面には呼び名が表示されることがあります。公開したくない連絡先を呼び名に使用しないでください。無料枠、稼働条件、料金は各サービスの最新の案内によります。ソースコード自体は無料です。

## 開発とビルド

主ブランチへのコミットとPRでテストと静的ビルドを実行します。[CIガイド・中国語](docs/CI.md)を参照し、初回アップロード後は[Actions](https://github.com/zongemory-spec/couple_diary/actions/workflows/checks.yml)で実際の結果を確認してください。

Node.js 24+とPython 3を使用します。ビルドはPythonの標準ライブラリのみを使い、テストの依存関係はnpmでインストールします。

```sh
npm ci --ignore-scripts
npm test
python3 tools/build.py
```

`dist/index.html`と`dist/_headers`が生成され、スクリプト・フォント・風景素材が埋め込まれます。Pagesへの直接アップロードでは、余分な親フォルダを作らず、この2ファイルがZIPの直下にある状態にしてください。

<details>
<summary>ファイル構成と環境変数</summary>

```text
site/                 Webアプリ、アニメーション、四季の素材
setup.html            ローカル設定ウィザード
tools/                設定生成・ビルドツール
database/             DBインストーラー・メール定期実行の例
supabase/functions/   任意のメール送信関数
tests/                架空データを使ったテスト
docs/                 デプロイ・参考資料・WeChatガイド
```

`site/config.js`に接続値を記入する代わりに、Cloudflareで`SUPABASE_URL`と`SUPABASE_PUBLISHABLE_KEY`の両方を設定することもできます。Publishable keyのみを使用します。この方法ではログイン前は共通の呼び名、ログイン後はデータベースの呼び名が表示されます。

</details>

## ライセンスと貢献

コードは[MIT](LICENSE)です。ライセンスと著作権表示を保持すれば、無料での利用・改変・商用利用が可能です。フォントは別途[SIL OFL 1.1](FONT-LICENSE.txt)に従います。素材や依存関係は[第三者に関する表示](THIRD_PARTY_NOTICES.md)を参照してください。

IssueやPull Requestを歓迎します。投稿する前に、実際の日記、メールアドレス、認証情報、プライベートな写真を取り除いてください。

<div align="center">

**何気ない一日も、ふたりの物語に。**

[简体中文](README.md) · [English](README.en.md) · [日本語](README.ja.md)

</div>
