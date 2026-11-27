# 証券業務ナレッジ入門

新人・他部署の方向けに、証券業務の仕組みを公開情報にもとづいて解説する静的Webサイトです。
すべて無料のソフトウェア（MkDocs Material / GitHub Pages / GitHub Actions）で構成しています。

## ローカルで表示する

```bash
python -m venv .venv
.venv\Scripts\activate        # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
mkdocs serve                  # http://127.0.0.1:8000 で確認
```

## フォルダ構成

```
mkdocs.yml                 サイト設定・ナビゲーション
docs/                      記事（Markdown）
  basics/ flow/ products/ rules/ tax/ market/   カテゴリ別の記事
  glossary.md              用語集
  about/                   免責事項・出典ポリシー・執筆ガイド
includes/abbreviations.md  略語のツールチップ定義（全ページに自動適用）
templates/article-template.md  記事テンプレート
scripts/check_articles.py  メタ情報チェック・鮮度チェック
.github/workflows/         自動デプロイ・月次の鮮度チェック
```

## 公開前チェックリスト

- [ ] 全記事の `status: review` を、業務経験者のレビュー後に `published` へ変更した
- [ ] 投資勧誘・投資助言と受け取られる表現がない
- [ ] 協会規則・取引所資料・書籍の文章を転載していない
- [ ] 社内固有の情報を含んでいない
- [ ] 勤務先の就業規則・対外発信（SNS・ブログ等）に関する社内ルールを確認した（金融機関では個人の情報発信に届出・承認が必要な場合があります）
- [ ] [免責事項](docs/about/disclaimer.md) の内容を確認した

## GitHub Pages で公開する

### 1. リポジトリを作る（ブラウザ）

1. GitHub にログインし、右上の「+」→「New repository」を開きます。
2. Repository name に `securities-knowledge` を入力し、**Public** を選びます。
3. 「Add a README」などのチェックは**すべて外したまま**「Create repository」を押します。

### 2. 設定ファイルを書き換える

`mkdocs.yml` の冒頭3行（`site_url` / `repo_url` / `edit_uri`）の `<ユーザー名>` を自分のGitHubユーザー名に書き換え、行頭の `# ` を外します。

### 3. push する（このフォルダで実行）

```bash
git config --global user.name "GitHubのユーザー名"
git config --global user.email "GitHubに登録したメールアドレス"
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/<ユーザー名>/securities-knowledge.git
git push -u origin main
```

※ メールアドレスを公開したくない場合は、GitHub の Settings → Emails で「Keep my email addresses private」を有効にし、表示される `...@users.noreply.github.com` のアドレスを使います。

### 4. GitHub Pages を有効にする（ブラウザ）

1. リポジトリの **Settings → Pages** を開きます。
2. **Build and deployment → Source** を **GitHub Actions** にします。
3. **Actions** タブで「Deploy site」が成功すると、`https://<ユーザー名>.github.io/securities-knowledge/` で公開されます（初回は数分かかります）。

### 5. 月次の鮮度チェック用ラベル（任意）

Issues → Labels で `stale` ラベルを作っておくと、鮮度チェックで作られる Issue に自動でラベルが付きます（なくても動作します）。

## Issue の受付と通知

### 自動対応（`.github/workflows/issue-triage.yml`）

Issue が登録されると、GitHub Actions が次の処理を自動で行います（無料・AIは使いません）。

| Issueの種類 | 自動で行うこと |
|---|---|
| 誤り報告 | ラベル `誤り報告`・`未対応` を付ける／報告されたページがサイト内に実在するかを確認し、ソースファイルと最終確認日を示す（特定できなければ `ページ要確認` を付ける）／根拠として書かれたURL（最大5件）が開けるかを確認する／受付コメントを投稿する |
| 追加リクエスト | ラベル `追加リクエスト`・`未対応` を付け、受付コメントを投稿する |
| その他 | ラベル `未対応` を付け、受付コメントを投稿する |

- ラベルがリポジトリになければ、初回に自動で作られます。
- 内容の正誤は判断しません。対応が済んだら `未対応` ラベルを外し、Issue を閉じてください。
- 処理の本体は [.github/scripts/issue-triage.js](.github/scripts/issue-triage.js) です。Issue の本文は外部からの入力として扱い、シェルには渡していません。

### 通知の設定（ブラウザ）

1. リポジトリ右上の **Watch** →「**Custom**」を選び、「**Issues**」にチェックを入れて「Apply」を押します（「All Activity」でも可）。
2. 通知の受け取り方は、右上のアイコン → **Settings → Notifications** で選べます（メール、GitHub Mobile アプリなど）。

## 記事を書く

[執筆ガイド](docs/about/contributing.md) と [記事テンプレート](templates/article-template.md) を参照してください。プルリクエストには公開前チェックリストが自動で表示されます。

## ライセンス

- 記事（`docs/` 配下）：[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.ja)
- 設定・スクリプト・テンプレート：MIT License

詳しくは [LICENSE](LICENSE) を参照してください。
