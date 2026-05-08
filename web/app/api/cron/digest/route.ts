import { NextResponse } from "next/server";
import { Resend } from "resend";
import { db } from "@/lib/db/client";
import { userProfiles, users } from "@/lib/db/schema";
import { eq, isNotNull } from "drizzle-orm";
import { getLatestIssueDate } from "@/lib/db/queries";
import { getPersonalizedFeed } from "@/lib/personalization/rerank";

export const maxDuration = 300;

/**
 * Vercel-cron-friendly endpoint: POST hits this once a week (e.g. Monday 8am
 * local), iterates every onboarded user, runs their personalized feed, and
 * sends an email digest of the top 5 items.
 *
 * Authorization: caller must include the secret in `Authorization: Bearer <CRON_SECRET>`.
 * Set `CRON_SECRET` in env. Vercel Cron will inject this automatically when
 * the route is registered in `vercel.json`.
 */
export async function POST(req: Request) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const issueDate = await getLatestIssueDate();
  if (!issueDate) {
    return NextResponse.json({ ok: true, sent: 0, reason: "no issue" });
  }

  const onboarded = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      displayName: users.displayName,
    })
    .from(users)
    .innerJoin(userProfiles, eq(userProfiles.userId, users.id))
    .where(isNotNull(userProfiles.onboardedAt));

  const resendKey = process.env.AUTH_RESEND_KEY ?? process.env.RESEND_API_KEY;
  const from = process.env.AUTH_EMAIL_FROM ?? "noreply@example.com";
  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  if (!resendKey) {
    return NextResponse.json({
      ok: false,
      error:
        "Resend key not configured — set AUTH_RESEND_KEY or RESEND_API_KEY.",
    });
  }
  const resend = new Resend(resendKey);

  let sent = 0;
  const errors: Array<{ userId: string; error: string }> = [];

  for (const u of onboarded) {
    if (!u.email) continue;
    try {
      const feed = await getPersonalizedFeed(u.id, issueDate);
      const top = feed.slice(0, 5);
      if (top.length === 0) continue;
      const html = renderDigestHtml({
        baseUrl,
        recipient: u.displayName ?? u.name ?? u.email.split("@")[0],
        items: top,
      });
      await resend.emails.send({
        from,
        to: u.email,
        subject: `ZenoNews — 本周你的 Top 5`,
        html,
      });
      sent++;
    } catch (e: any) {
      errors.push({ userId: u.id, error: String(e?.message ?? e) });
    }
  }

  return NextResponse.json({ ok: true, sent, errors });
}

function renderDigestHtml({
  baseUrl,
  recipient,
  items,
}: {
  baseUrl: string;
  recipient: string;
  items: Awaited<ReturnType<typeof getPersonalizedFeed>>;
}) {
  const moduleLabel = (m: string) =>
    m === "model" ? "模型" : m === "product" ? "产品" : "运营";
  const cards = items
    .map((item, i) => {
      const url = `${baseUrl}/items/${item.slug}`;
      return `
        <tr>
          <td style="padding:18px 0;border-bottom:1px solid #eee;">
            <div style="font-size:11px;letter-spacing:1.2px;text-transform:uppercase;color:#0066cc;font-weight:600;">
              #${i + 1} · ${moduleLabel(item.module)} · ${item.company}
            </div>
            <a href="${url}" style="display:block;margin-top:6px;font-family:'SF Pro Display',-apple-system,'PingFang SC',sans-serif;font-size:22px;font-weight:600;color:#1d1d1f;text-decoration:none;line-height:1.25;letter-spacing:-0.374px;">
              ${escapeHtml(item.personalizedBlurb)}
            </a>
            <p style="margin:8px 0 0;color:#333;font-size:14px;line-height:1.55;">
              ${escapeHtml(item.personalizedReason)}
            </p>
            <a href="${url}" style="display:inline-block;margin-top:12px;font-size:13px;color:#0066cc;text-decoration:none;">查看完整内容 →</a>
          </td>
        </tr>
      `;
    })
    .join("");

  return `<!doctype html>
<html><body style="margin:0;background:#f5f5f7;font-family:-apple-system,'SF Pro Text','PingFang SC',Segoe UI,sans-serif;color:#1d1d1f;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;padding:32px 24px;background:#ffffff;">
        <tr><td>
          <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#0066cc;font-weight:600;">
            ✦ ZenoNews
          </div>
          <h1 style="margin:8px 0 4px;font-family:'SF Pro Display',-apple-system,'PingFang SC',sans-serif;font-size:32px;line-height:1.1;font-weight:600;letter-spacing:-0.374px;">
            ${escapeHtml(recipient)}，你的本周 Top 5
          </h1>
          <p style="margin:0 0 8px;color:#333;font-size:14px;">
            从本期里挑出，按你告诉我们的偏好重排。
          </p>
        </td></tr>
        ${cards}
        <tr><td style="padding-top:24px;font-size:12px;color:#7a7a7a;">
          你订阅了个性化简报所以收到这封邮件。
          <a href="${baseUrl}/profile" style="color:#0066cc;">管理偏好 →</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
