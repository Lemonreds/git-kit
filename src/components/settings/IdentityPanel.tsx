import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, Loader2, UserRound } from "lucide-react";

import type { ConfigSource } from "../../lib/types";
import { useAppStore } from "../../store/appStore";
import HelpTip from "../common/HelpTip";
import { tip } from "../common/Tooltip";

const SOURCE_META: Record<ConfigSource, { label: string; className: string; hint: string }> = {
  local: {
    label: "本地",
    className: "border-accent/40 bg-accent-soft text-accent",
    hint: "来自当前仓库的 .git/config",
  },
  global: {
    label: "全局",
    className: "border-line bg-canvas text-ink-faint",
    hint: "本地未设置，当前生效值来自全局配置；保存后会写入本仓库 .git/config",
  },
  none: {
    label: "未设置",
    className: "border-warning/40 bg-warning/8 text-warning",
    hint: "本地与全局都没有配置，提交会被 git 拒绝",
  },
};

const inputClass =
  "w-full rounded-lg border border-line bg-panel px-2.5 py-1.5 text-[12px] text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-accent/60";

export default function IdentityPanel() {
  const identity = useAppStore((state) => state.identity);
  const loading = useAppStore((state) => state.identityLoading);
  const loadIdentity = useAppStore((state) => state.loadIdentity);
  const saveIdentity = useAppStore((state) => state.saveIdentity);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seeded = useRef(false);

  useEffect(() => {
    if (!identity) void loadIdentity();
  }, [identity, loadIdentity]);

  // Seed the form once; later identity refreshes must not overwrite typing.
  useEffect(() => {
    if (!identity || seeded.current) return;
    seeded.current = true;
    setName(identity.name ?? "");
    setEmail(identity.email ?? "");
  }, [identity]);

  const changed = name.trim() !== (identity?.name ?? "") || email.trim() !== (identity?.email ?? "");
  const filled = name.trim().length > 0 && email.trim().length > 0;

  const submit = async () => {
    if (busy || !changed || !filled) return;
    setBusy(true);
    setError(null);
    const message = await saveIdentity(name, email);
    setBusy(false);
    if (message) setError(message);
  };

  const nameSource = SOURCE_META[identity?.nameSource ?? "none"];
  const emailSource = SOURCE_META[identity?.emailSource ?? "none"];

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center gap-1 text-[11.5px] font-medium text-ink-soft">
        <UserRound size={12} className="text-ink-faint" />
        当前仓库的提交身份
        <HelpTip label="只写入当前仓库的 .git/config（git config --local），不会修改全局配置，也不影响其它仓库；保存后本仓库新的提交会用这个身份。" />
      </div>

      {loading && !identity ? (
        <p className="flex items-center gap-2 py-3 text-[11.5px] text-ink-faint">
          <Loader2 size={12} className="animate-spin" />
          正在读取提交身份…
        </p>
      ) : (
        <div className="space-y-2.5">
          <label className="block">
            <span className="mb-1 flex items-center justify-between text-[11.5px] font-medium text-ink-soft">
              提交用户名
              <span
                {...tip(nameSource.hint)}
                className={`rounded border px-1 py-px text-[9px] font-medium ${nameSource.className}`}
              >
                {nameSource.label}
              </span>
            </span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="例如：Zhang San"
              spellCheck={false}
              className={inputClass}
            />
          </label>

          <label className="block">
            <span className="mb-1 flex items-center justify-between text-[11.5px] font-medium text-ink-soft">
              提交邮箱
              <span
                {...tip(emailSource.hint)}
                className={`rounded border px-1 py-px text-[9px] font-medium ${emailSource.className}`}
              >
                {emailSource.label}
              </span>
            </span>
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              spellCheck={false}
              className={`${inputClass} font-mono`}
            />
          </label>
        </div>
      )}

      {error ? (
        <p className="flex items-start gap-1 whitespace-pre-line rounded-md border border-negative/30 bg-negative/8 px-2 py-1.5 font-mono text-[10px] leading-relaxed text-negative">
          <AlertTriangle size={10.5} className="mt-0.5 shrink-0" />
          <span className="min-w-0 break-words">{error}</span>
        </p>
      ) : null}

      {(identity?.nameSource === "none" || identity?.emailSource === "none") && !error ? (
        <p className="rounded-md border border-warning/30 bg-warning/8 px-2 py-1.5 text-[10px] text-ink-soft">
          提交身份未配置完整，git 会拒绝提交。
        </p>
      ) : null}

      <div className="mt-auto flex items-center justify-end border-t border-line pt-2.5">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy || !changed || !filled}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[12px] font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-45"
        >
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
          保存
        </button>
      </div>
    </div>
  );
}