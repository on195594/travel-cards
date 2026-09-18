import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main-content" className="container" tabIndex={-1}>
      <div className="empty">
        <p className="eyebrow">404</p>
        <h1>页面不存在</h1>
        <p>链接可能有误，或攻略尚未发布。返回首页看看其他旅行攻略。</p>
        <Link className="button" href="/">返回旅行卡片</Link>
      </div>
    </main>
  );
}
