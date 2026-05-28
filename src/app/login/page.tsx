"use client";

import { useState } from "react";
import { ArrowRight, Database, LockKeyhole, ShieldCheck, Sparkles } from "lucide-react";

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const response = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name }),
    });
    setLoading(false);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Unable to continue");
      return;
    }
    window.location.href = "/chat";
  }

  return (
    <main className="min-h-screen bg-[#fffdf9] text-[#17171c]">
      <div className="grid min-h-screen lg:grid-cols-[1.1fr_0.9fr]">
        <section className="flex flex-col justify-between border-r border-[#eadfd4] bg-[#f8f4ef] p-8 md:p-12">
          <div className="flex items-center gap-4">
            <span className="relative grid size-14 place-items-center">
              <ShieldCheck size={54} className="absolute text-[#12245a]" strokeWidth={1.7} />
              <span className="mt-1 rounded-[4px] bg-[#f1a32b] px-1.5 py-0.5 text-[10px] font-bold text-white">PI</span>
            </span>
            <div>
              <h1 className="text-[22px] font-semibold text-[#12245a]">Priyansh Insurance</h1>
              <p className="text-sm text-[#677080]">Health &amp; Term Advisor Workspace</p>
            </div>
          </div>

          <div className="my-16 max-w-3xl">
            <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#eadfd4] bg-white px-4 py-2 text-sm text-[#657080]">
              <Sparkles size={16} className="text-[#e99a1f]" />
              RAG-backed insurance advisor
            </p>
            <h2 className="max-w-2xl text-[52px] font-medium leading-[1.02] text-[#17171c] md:text-[72px]">
              Structured advice, saved chats, human handoff.
            </h2>
            <p className="mt-7 max-w-xl text-[18px] leading-8 text-[#5f6673]">
              A private operating console for Indian health and term insurance queries, grounded in your scraped policy and regulator data.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <StatusPill icon={<Database size={18} />} label="19,594 chunks" />
            <StatusPill icon={<ShieldCheck size={18} />} label="Compliance checks" />
            <StatusPill icon={<LockKeyhole size={18} />} label="Advisor handoff" />
          </div>
        </section>

        <section className="grid place-items-center px-5 py-10">
          <form onSubmit={submit} className="w-full max-w-[430px] rounded-[22px] border border-[#eadfd4] bg-white p-7 shadow-[0_24px_80px_rgba(28,23,18,0.07)]">
            <div className="mb-7">
              <p className="text-sm uppercase tracking-[0.18em] text-[#93939f]">Secure access</p>
              <h2 className="mt-3 text-[32px] font-medium text-[#17171c]">{mode === "login" ? "Login" : "Create account"}</h2>
            </div>

            <div className="mb-6 grid grid-cols-2 rounded-[14px] bg-[#f8f4ef] p-1 text-sm">
              <button type="button" onClick={() => setMode("login")} className={`rounded-[11px] px-3 py-3 ${mode === "login" ? "bg-white shadow-sm" : "text-[#657080]"}`}>Login</button>
              <button type="button" onClick={() => setMode("signup")} className={`rounded-[11px] px-3 py-3 ${mode === "signup" ? "bg-white shadow-sm" : "text-[#657080]"}`}>Signup</button>
            </div>

            {mode === "signup" ? (
              <Field label="Name" value={name} onChange={setName} />
            ) : null}
            <Field label="Email" type="email" value={email} onChange={setEmail} />
            <Field label="Password" type="password" value={password} onChange={setPassword} />

            {error ? <p className="mb-5 rounded-[12px] bg-[#fff2ed] px-4 py-3 text-sm text-[#b30000]">{error}</p> : null}
            <button disabled={loading} className="flex w-full items-center justify-center gap-3 rounded-full bg-[#17171c] px-5 py-3.5 text-sm font-semibold text-white disabled:opacity-60">
              {loading ? "Working..." : mode === "login" ? "Enter workspace" : "Create workspace"}
              <ArrowRight size={17} />
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return (
    <label className="mb-5 block text-sm font-medium text-[#303946]">
      {label}
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-[12px] border border-[#eadfd4] bg-[#fffdf9] px-4 py-3 text-[#17171c] outline-none transition focus:border-[#9b60aa]" required />
    </label>
  );
}

function StatusPill({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-[14px] border border-[#eadfd4] bg-white px-4 py-3 text-sm text-[#303946]">
      <span className="text-[#e99a1f]">{icon}</span>
      {label}
    </div>
  );
}
