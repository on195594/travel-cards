import { login } from "./actions";
import Link from "next/link";
import { getLoginReturnTo } from "@/lib/login-return";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; returnTo?: string }> }) {
  const params = await searchParams;
  const failed = Boolean(params.error);
  const returnTo = getLoginReturnTo(params.returnTo);
  return (
    <main id="main-content" className="login-shell">
      <form action={login} className="panel login-form">
        <input type="hidden" name="returnTo" value={returnTo} />
        <Link className="back-link" href="/">← 返回旅行卡片</Link><p className="eyebrow">内容工作台</p><h1>欢迎回来</h1><p className="hint">登录管理员账号，继续整理你的旅行攻略。</p>
        {failed && <p className="error" role="alert">邮箱或密码不正确。</p>}
        <label>邮箱<input name="email" type="email" autoComplete="username" required autoFocus /></label>
        <label>密码<input name="password" type="password" autoComplete="current-password" required /></label>
        <button type="submit">登录</button>
      </form>
    </main>
  );
}
