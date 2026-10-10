import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/auth";
import { assertAdminOrToken } from "@/lib/admin";
import { listMcpClientAuthorizations } from "@/lib/mcp/oauth-clients";
import { OAUTH_SCOPE_LABELS } from "@/lib/oauth-scopes";

export const dynamic = "force-dynamic";
// Native form POSTs need a non-null Origin; outbound callback responses remain no-referrer.
export const metadata: Metadata = { title: "外部应用授权", robots: { index: false, follow: false }, referrer: "same-origin" };
export default async function OAuthClientsPage({ searchParams }: { searchParams: Promise<{ revoked?: string }> }) {
  if (process.env.MCP_OAUTH_ENABLED !== "true") notFound();
  const actor = assertAdminOrToken(await requireAdminPage(), null);
  const clients = await listMcpClientAuthorizations(actor);
  const revoked = (await searchParams).revoked === "1";
  return <main id="main-content" className="container admin">
    <header className="admin-header"><div><Link className="back-link" href="/admin/guides">返回攻略管理</Link><h1>外部应用授权</h1><p className="hint">撤销后，应用的令牌、授权码和未确认请求立即失效；已开始的操作不会被取消。重新连接必须重新注册并获得同意。</p></div></header>
    {revoked && <p className="success" role="status">客户端授权已撤销。</p>}
    {clients.length ? <div className="admin-list">{clients.map((client) => <article key={client.clientId}>
      <div><span className="status">{client.revokedAt ? "已撤销" : "已授权"}</span><h2>{client.clientName || "未命名应用"}</h2>
        <p>自报名称，身份未验证 · {client.clientId}</p>
        <p>{client.authorizedScopes?.map((scope) => OAUTH_SCOPE_LABELS[scope]).join("；")}</p>
        <p>注册到期：<time dateTime={client.expiresAt.toISOString()}>{client.expiresAt.toISOString().slice(0, 10)}（UTC）</time></p>
      </div>
      {!client.revokedAt && <form method="post" action="/api/oauth/revoke-client"><input type="hidden" name="client_id" value={client.clientId} /><button className="secondary" type="submit" aria-label={`撤销 ${client.clientName || "未命名应用"} 的访问`}>撤销访问</button></form>}
    </article>)}</div> : <p className="empty">还没有已授权的外部应用。注册本身不会授予访问权限。</p>}
  </main>;
}
