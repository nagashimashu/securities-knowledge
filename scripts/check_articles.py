"""記事メタ情報のチェックと、鮮度切れ記事の一覧作成。

使い方:
  python scripts/check_articles.py --strict-meta          # 公開記事に必須項目があるか検査（CI用）
  python scripts/check_articles.py --stale-days 180       # 最終確認日から180日超の記事を表示
  python scripts/check_articles.py --stale-days 180 --report stale.md
"""
import argparse
import datetime as dt
import sys
from pathlib import Path

import yaml

DOCS = Path(__file__).resolve().parent.parent / "docs"
REQUIRED = ["title", "category", "level", "sources", "last_reviewed"]
SKIP_DIRS = {"about", "guide"}


def front_matter(path: Path) -> dict:
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---"):
        return {}
    try:
        _, fm, _ = text.split("---", 2)
        return yaml.safe_load(fm) or {}
    except ValueError:
        return {}


def articles():
    for p in sorted(DOCS.rglob("*.md")):
        rel = p.relative_to(DOCS)
        if p.name == "index.md" or rel.parts[0] in SKIP_DIRS or rel.parts[0] == "glossary.md":
            continue
        yield rel, front_matter(p)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--strict-meta", action="store_true")
    ap.add_argument("--stale-days", type=int)
    ap.add_argument("--report")
    args = ap.parse_args()

    errors, stale = [], []
    today = dt.date.today()
    for rel, fm in articles():
        if fm.get("status") == "planned":
            continue
        missing = [k for k in REQUIRED if not fm.get(k)]
        if missing:
            errors.append(f"{rel}: 必須項目がありません -> {', '.join(missing)}")
        reviewed = fm.get("last_reviewed")
        if args.stale_days and isinstance(reviewed, dt.date):
            age = (today - reviewed).days
            if age > args.stale_days:
                stale.append((rel, reviewed, age))

    if args.strict_meta:
        for e in errors:
            print(f"ERROR {e}")
        if errors:
            return 1
        print("メタ情報チェック: OK")

    if args.stale_days is not None:
        lines = [f"- [ ] `docs/{r.as_posix()}` 最終確認日 {d}（{a}日経過）" for r, d, a in stale]
        if lines:
            body = "最終確認日から一定期間が過ぎた記事です。一次情報と照合し、`last_reviewed` を更新してください。\n\n" + "\n".join(lines) + "\n"
            print(body)
            if args.report:
                Path(args.report).write_text(body, encoding="utf-8")
        else:
            print("鮮度チェック: 要再確認の記事はありません")
    return 0


if __name__ == "__main__":
    sys.exit(main())
