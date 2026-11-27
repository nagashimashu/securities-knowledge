// Issue が登録されたときの自動対応（GitHub Actions の actions/github-script から呼ばれる）
//
// - 種類（誤り報告 / 追加リクエスト / その他）に応じてラベルを付ける（ラベルがなければ作る）
// - 誤り報告なら、報告されたページがサイト内に実在するかと、根拠URLが開けるかを確認する
// - 受付コメントを1回だけ投稿する
//
// 注意：Issue の本文は誰でも書ける「外部からの入力」。シェルに渡したり、
// 内容を指示として解釈したりせず、文字列データとしてだけ扱う。

const fs = require('fs');
const path = require('path');

const MARKER = '<!-- issue-triage -->';
const MAX_URLS = 5;
const FETCH_TIMEOUT_MS = 10000;

const LABELS = {
  error: { name: '誤り報告', color: 'd73a4a', description: '記事の誤り・古い情報の報告' },
  request: { name: '追加リクエスト', color: '0e8a16', description: '記事・用語の追加の提案' },
  todo: { name: '未対応', color: 'fbca04', description: '運営者がまだ確認していない' },
  pageUnknown: { name: 'ページ要確認', color: 'e99695', description: '報告されたページをサイト内で特定できなかった' },
};

// Issue フォームの本文（### 見出し + 内容）を { 見出し: 内容 } に分解する
function parseSections(body) {
  const sections = {};
  const parts = (body || '').split(/^###\s+/m).slice(1);
  for (const part of parts) {
    const nl = part.indexOf('\n');
    const heading = (nl === -1 ? part : part.slice(0, nl)).trim();
    const content = (nl === -1 ? '' : part.slice(nl + 1)).trim();
    sections[heading] = content === '_No response_' ? '' : content;
  }
  return sections;
}

function findSection(sections, keyword) {
  const key = Object.keys(sections).find((k) => k.includes(keyword));
  return key ? sections[key] : '';
}

function extractUrls(text) {
  const found = (text || '').match(/https?:\/\/[^\s<>()"'`\]]+/g) || [];
  const cleaned = found.map((u) => u.replace(/[.,、。)）]+$/, ''));
  return [...new Set(cleaned)];
}

function issueType(issue) {
  const labels = (issue.labels || []).map((l) => (typeof l === 'string' ? l : l.name));
  const title = issue.title || '';
  if (labels.includes(LABELS.error.name) || title.startsWith('[誤り報告]')) return 'error';
  if (labels.includes(LABELS.request.name) || title.startsWith('[追加リクエスト]')) return 'request';
  return 'other';
}

function readSiteUrl(workspace) {
  try {
    const yml = fs.readFileSync(path.join(workspace, 'mkdocs.yml'), 'utf8');
    const m = yml.match(/^site_url:\s*(\S+)/m);
    return m ? new URL(m[1]) : null;
  } catch {
    return null;
  }
}

// サイトのURLを docs/ 配下のファイルに対応させる
function resolvePage(urlString, siteUrl, workspace) {
  let url;
  try {
    url = new URL(urlString);
  } catch {
    return null;
  }
  if (!siteUrl || url.host !== siteUrl.host || !url.pathname.startsWith(siteUrl.pathname)) return null;
  let rel = decodeURIComponent(url.pathname.slice(siteUrl.pathname.length));
  rel = rel.replace(/index\.html$/, '').replace(/\.html$/, '').replace(/^\/+|\/+$/g, '');
  if (rel.includes('..')) return null;
  const candidates = rel === '' ? ['docs/index.md'] : [`docs/${rel}.md`, `docs/${rel}/index.md`];
  for (const file of candidates) {
    const full = path.join(workspace, file);
    if (fs.existsSync(full)) {
      const text = fs.readFileSync(full, 'utf8');
      const title = (text.match(/^title:\s*(.+)$/m) || [])[1] || rel;
      const reviewed = (text.match(/^last_reviewed:\s*(\S+)/m) || [])[1] || '未記載';
      return { file, title: title.trim(), reviewed, url: url.origin + url.pathname };
    }
  }
  return null;
}

async function checkUrl(url, fetchImpl) {
  try {
    const res = await fetchImpl(url, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (res.status < 400) return { url, mark: '✅', note: '開けました' };
    if (res.status === 403 || res.status === 429) {
      return { url, mark: '⚠️', note: `自動では確認できませんでした（サイト側が自動アクセスを制限 / HTTP ${res.status}）` };
    }
    return { url, mark: '❌', note: `開けませんでした（HTTP ${res.status}）` };
  } catch (e) {
    return { url, mark: '❌', note: '開けませんでした（接続できない、または時間切れ）' };
  }
}

const code = (s) => '`' + String(s).replace(/`/g, '') + '`';

async function ensureLabel(github, owner, repo, label) {
  try {
    await github.rest.issues.getLabel({ owner, repo, name: label.name });
  } catch (e) {
    if (e.status !== 404) throw e;
    await github.rest.issues.createLabel({ owner, repo, ...label });
  }
}

module.exports = async ({ github, context, core, fetchImpl = fetch, workspace = process.env.GITHUB_WORKSPACE || process.cwd() }) => {
  const issue = context.payload.issue;
  const { owner, repo } = context.repo;
  const number = issue.number;

  // すでに対応コメントがあれば何もしない（再実行時の二重投稿防止）
  const comments = await github.rest.issues.listComments({ owner, repo, issue_number: number, per_page: 100 });
  if (comments.data.some((c) => (c.body || '').includes(MARKER))) {
    core.info('already triaged');
    return;
  }

  const type = issueType(issue);
  const labels = [LABELS.todo];
  if (type === 'error') labels.push(LABELS.error);
  if (type === 'request') labels.push(LABELS.request);

  const lines = [MARKER];
  const sections = parseSections(issue.body);

  if (type === 'error') {
    lines.push(
      'ご報告ありがとうございます。いただいた内容は、一次情報と照合したうえで対応します（確認にお時間をいただく場合があります）。',
      '',
      '### 自動チェックの結果',
    );
    const siteUrl = readSiteUrl(workspace);
    const pageUrl = extractUrls(findSection(sections, '該当ページ'))[0];
    const page = pageUrl ? resolvePage(pageUrl, siteUrl, workspace) : null;
    if (page) {
      lines.push(`- 該当ページ：✅ ${page.title}（ソース：${code(page.file)}、最終確認日：${page.reviewed}）`);
    } else {
      labels.push(LABELS.pageUnknown);
      lines.push('- 該当ページ：⚠️ サイト内のページを特定できませんでした。運営者が確認します。');
    }

    const evidence = extractUrls(findSection(sections, '根拠')).slice(0, MAX_URLS);
    if (evidence.length === 0) {
      lines.push('- 根拠のURL：記載がありませんでした。一次情報（法令・金融庁・日本証券業協会・取引所など）のURLを追記いただけると、確認が早くなります。');
    } else {
      lines.push('- 根拠のURL：');
      const results = await Promise.all(evidence.map((u) => checkUrl(u, fetchImpl)));
      for (const r of results) lines.push(`  - ${r.mark} ${code(r.url)}：${r.note}`);
    }
    lines.push('', 'この結果は機械的なチェックで、報告内容の正しさを判断したものではありません。');
  } else if (type === 'request') {
    lines.push(
      'ご提案ありがとうございます。今後の記事・用語集の充実の参考にさせていただきます。',
      '対応の可否や時期は、内容を確認のうえこのIssueでお知らせします。',
    );
  } else {
    lines.push('ご連絡ありがとうございます。運営者が内容を確認します。');
  }

  lines.push('', '---', '※ 本サイトでは、個別の投資・税務のご相談にはお答えできません。  ', '※ このコメントは自動で投稿しています。');

  for (const label of labels) await ensureLabel(github, owner, repo, label);
  await github.rest.issues.addLabels({ owner, repo, issue_number: number, labels: labels.map((l) => l.name) });
  await github.rest.issues.createComment({ owner, repo, issue_number: number, body: lines.join('\n') });
  core.info(`triaged #${number} as ${type}`);
};

module.exports._internal = { parseSections, extractUrls, issueType, resolvePage, readSiteUrl };
