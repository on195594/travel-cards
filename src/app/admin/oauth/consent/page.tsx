import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { assertAdminOrToken } from "@/lib/admin";
import { HttpError } from "@/lib/http";
import { getConsentIntent } from "@/lib/mcp/oauth-authorizations";
import { OAUTH_SCOPE_LABELS } from "@/lib/oauth-scopes";

export const dynamic = "force-dynamic";
// Native form POSTs need a non-null Origin; outbound callback responses remain no-referrer.
export const metadata: Metadata = { title: "授权外部应用", robots: { index: false, follow: false }, referrer: "same-origin" };
export default async function ConsentPage({ searchParams }: { searchParams: Promise<{ intent?: string }> }) {
  if (process.env.MCP_OAUTH_ENABLED !== "true") notFound();
  const { intent = "" } = await searchParams;
  const session = await auth();
  if (!session) redirect("/admin/login?" + new URLSearchParams({ returnTo: "/admin/oauth/consent?" + new URLSearchParams({ intent }) }));
  const actor = assertAdminOrToken(session, null);
  let data;
  try {
    data = await getConsentIntent(actor, intent);
  } catch (error) {
    if (!(error instanceof HttpError) || error.status !== 400) throw error;
    return <main id="main-content" className="login-shell"><section className="panel login-form"><h1>授权请求已失效</h1><p role="alert">请求已过期、已处理或客户端已撤销。请返回外部应用重新发起连接。</p><Link className="button secondary" href="/admin/oauth">查看外部应用授权</Link></section></main>;
  }
  return <main id="main-content" className="login-shell"><section className="panel login-form">
    <h1>授权外部应用</h1>
    <p>应用名称：<strong>{data.client.clientName || "未命名应用"}</strong></p>
    <p className="hint">名称由客户端自报，身份未经本站验证。请核对回调地址，确认是你刚发起的连接。</p>
    <h2>回调地址</h2><p className="preline">{data.intent.redirectUri}</p>
    <h2>允许此应用</h2><ul>{data.intent.scopes.map((scope) => <li key={scope}>{OAUTH_SCOPE_LABELS[scope]}</li>)}</ul>
    <p className="hint">不能删除、撤回攻略或修改配置。写操作仍需遵守客户端自身的确认规则。</p>
    <p className="hint">确认请求 5 分钟内有效；授权后访问令牌默认有效期为 100 年（按每年 365 天计算）。你可在<Link href="/admin/oauth">外部应用授权</Link>中随时撤销访问。</p>
    <form method="post" action="/api/oauth/consent" className="actions">
      <input type="hidden" name="intent" value={intent} />
      <button type="submit" name="decision" value="deny" className="secondary">拒绝连接</button>
      <button type="submit" name="decision" value="approve">同意并连接</button>
    </form>
  </section></main>;
}
