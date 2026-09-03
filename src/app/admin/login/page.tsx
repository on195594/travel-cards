import { login } from "./actions";
import Link from "next/link";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const failed = Boolean((await searchParams).error);
  return (
    <main className="login-shell">
      <form action={login} className="panel login-form">
        <Link className="back-link" href="/">← 返回公开页面</Link><p className="eyebrow">旅行卡片 · 内容工作台</p><h1>管理员登录</h1><p>使用环境变量中配置的单一管理员账号。</p>
        {failed && <p className="error" role="alert">邮箱或密码不正确。</p>}
        <label>邮箱<input name="email" type="email" autoComplete="username" required autoFocus /></label>
        <label>密码<input name="password" type="password" autoComplete="current-password" required /></label>
        <button type="submit">登录</button>
      </form>
    </main>
  );
}
