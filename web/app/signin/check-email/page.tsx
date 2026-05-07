import { Mail } from "lucide-react";

export default function CheckEmailPage() {
  return (
    <div className="container-tight flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center py-16 text-center">
      <Mail className="h-10 w-10 text-claude-coral" />
      <h1 className="mt-4 font-display text-display-md tracking-display text-claude-ink dark:text-white">
        请查收邮箱
      </h1>
      <p className="mt-3 max-w-md text-claude-body dark:text-white/70">
        登录链接已发送，点开它即可完成登录。链接 24 小时内有效。
      </p>
    </div>
  );
}
