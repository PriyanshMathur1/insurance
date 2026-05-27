"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, BarChart3, FileText, Handshake, MessageSquare, RefreshCw, ShieldCheck, Star, Target } from "lucide-react";

type Handoff = { id: string; status: string; reason: string; insuranceType: string; user?: { email: string }; chat?: { title: string } };
type QualityGrade = "excellent" | "good" | "needs_review" | "unsafe";
type QualityReview = {
  id: string;
  chatTitle: string;
  userEmail?: string | null;
  insuranceType: string;
  intent: string;
  passed: boolean;
  issues: string[];
  excerpt: string;
  createdAt: string;
  quality: {
    score: number;
    grade: QualityGrade;
    summary: string;
    reviewFlags: string[];
    dimensions: Array<{ key: string; label: string; score: number; max: number; passed: boolean; notes: string[] }>;
  };
};

type QualityData = {
  summary: {
    totalReviewed: number;
    averageScore: number;
    needsReview: number;
    gradeCounts: Record<QualityGrade, number>;
    dimensionAverages: Array<{ key: string; label: string; score: number; failing: number }>;
    topFlags: Array<{ flag: string; count: number }>;
  };
  reviews: QualityReview[];
};

type AdminData = {
  chats: unknown[];
  handoffs: Handoff[];
  logs: unknown[];
  products: { health?: unknown[]; term?: unknown[] };
  documents: unknown[];
  quality: QualityData | null;
};

export default function AdminPage() {
  const [data, setData] = useState<AdminData>({ chats: [], handoffs: [], logs: [], products: {}, documents: [], quality: null });
  const [loading, setLoading] = useState(false);
  const [gradeFilter, setGradeFilter] = useState<"all" | QualityGrade>("all");

  const load = useCallback(async () => {
    setLoading(true);
    const [chats, handoffs, logs, products, documents, quality] = await Promise.all([
      fetch("/api/admin/chats").then((res) => res.json()),
      fetch("/api/admin/handoffs").then((res) => res.json()),
      fetch("/api/admin/ingestion-logs").then((res) => res.json()),
      fetch("/api/admin/products").then((res) => res.json()),
      fetch("/api/admin/documents").then((res) => res.json()),
      fetch("/api/admin/quality").then((res) => res.json()),
    ]);
    setLoading(false);
    setData({
      chats: chats.chats ?? [],
      handoffs: handoffs.handoffs ?? [],
      logs: logs.logs ?? [],
      products,
      documents: documents.documents ?? [],
      quality,
    });
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function ingest() {
    setLoading(true);
    await fetch("/api/ingest", { method: "POST" });
    await load();
  }

  const reviews = useMemo(() => {
    const all = data.quality?.reviews ?? [];
    return gradeFilter === "all" ? all : all.filter((review) => review.quality.grade === gradeFilter);
  }, [data.quality?.reviews, gradeFilter]);

  return (
    <main className="min-h-screen bg-[#f9f7f3] text-[#202020]">
      <section className="border-b border-[rgba(32,32,32,0.12)] bg-[#f3f0e8]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-5 px-5 py-7">
          <div className="flex items-center gap-4">
            <span className="grid size-12 place-items-center rounded-full border border-[#202020] bg-white text-[#ea2804]">
              <ShieldCheck size={23} />
            </span>
            <div>
              <p className="text-xs font-black uppercase text-[#ea2804]">Advisor quality cockpit</p>
              <h1 className="mt-1 text-[34px] font-black leading-none">Measure how the AI is responding</h1>
            </div>
          </div>
          <div className="flex gap-3">
            <a href="/chat" className="inline-flex items-center gap-2 rounded-full border border-[rgba(32,32,32,0.12)] bg-white px-5 py-3 text-sm font-bold">
              <ArrowLeft size={16} />
              Back to chat
            </a>
            <button onClick={ingest} className="inline-flex items-center gap-2 rounded-full bg-[#ea2804] px-5 py-3 text-sm font-black text-white">
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
              {loading ? "Working" : "Run ingest"}
            </button>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-5 py-7">
        <section className="mb-6 grid gap-3 md:grid-cols-5">
          <Metric icon={<Star size={20} />} label="Avg quality" value={`${data.quality?.summary.averageScore ?? 0}%`} tone={scoreTone(data.quality?.summary.averageScore ?? 0)} />
          <Metric icon={<AlertTriangle size={20} />} label="Needs review" value={data.quality?.summary.needsReview ?? 0} tone="warn" />
          <Metric icon={<MessageSquare size={20} />} label="Chats" value={data.chats.length} />
          <Metric icon={<Handshake size={20} />} label="Handoffs" value={data.handoffs.length} />
          <Metric icon={<FileText size={20} />} label="Documents" value={data.documents.length} />
        </section>

        <section className="mb-6 grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <Panel title="Quality rubric">
            <div className="grid gap-3 sm:grid-cols-2">
              {data.quality?.summary.dimensionAverages.map((dimension) => (
                <div key={dimension.key} className="rounded-[16px] border border-[rgba(32,32,32,0.12)] bg-white p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <strong>{dimension.label}</strong>
                    <span className={scoreBadgeClass(dimension.score)}>{dimension.score}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-[#f3f0e8]">
                    <div className="h-full bg-[#ea2804]" style={{ width: `${dimension.score}%` }} />
                  </div>
                  <p className="mt-3 text-sm text-[#646464]">{dimension.failing} recent responses need attention here</p>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="What to measure">
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ["Scope control", "Did it stay inside health and term insurance?"],
                ["Source honesty", "Did product/regulatory facts cite sources or say data is missing?"],
                ["Safety", "Did it avoid guarantees and mention disclosure, waiting periods, and advisor review?"],
                ["Structure", "Did it choose the right format for the query instead of a wall of text?"],
                ["Personalization", "Did it summarize profile details or ask only essential missing questions?"],
                ["Next step", "Did it guide the user with useful follow-up questions?"],
              ].map(([label, copy]) => (
                <div key={label} className="rounded-[16px] border border-[rgba(32,32,32,0.12)] bg-[#202020] p-4 text-white">
                  <Target size={18} className="mb-3 text-[#ea2804]" />
                  <strong>{label}</strong>
                  <p className="mt-2 text-sm leading-6 text-white/75">{copy}</p>
                </div>
              ))}
            </div>
          </Panel>
        </section>

        <section className="mb-6 grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
          <Panel title="Grade distribution">
            <div className="grid gap-3">
              {(["excellent", "good", "needs_review", "unsafe"] as const).map((grade) => (
                <button key={grade} onClick={() => setGradeFilter(gradeFilter === grade ? "all" : grade)} className={`flex items-center justify-between rounded-full border px-4 py-3 text-left text-sm font-bold ${gradeFilter === grade ? "border-[#202020] bg-[#202020] text-white" : "border-[rgba(32,32,32,0.12)] bg-white"}`}>
                  <span>{grade.replace("_", " ")}</span>
                  <span>{data.quality?.summary.gradeCounts[grade] ?? 0}</span>
                </button>
              ))}
            </div>
          </Panel>

          <Panel title="Top review flags">
            {data.quality?.summary.topFlags.length ? (
              <div className="space-y-3">
                {data.quality.summary.topFlags.map((item) => (
                  <div key={item.flag} className="rounded-[16px] border border-[rgba(32,32,32,0.12)] bg-white p-4">
                    <div className="flex justify-between gap-4">
                      <p className="text-sm font-bold leading-6">{item.flag}</p>
                      <span className="rounded-full bg-[#fff2ef] px-3 py-1 text-xs font-black text-[#ea2804]">{item.count}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyNote text="No recurring quality flags yet." />
            )}
          </Panel>
        </section>

        <Panel title="Recent response review queue">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {(["all", "excellent", "good", "needs_review", "unsafe"] as const).map((grade) => (
              <button key={grade} onClick={() => setGradeFilter(grade)} className={`rounded-full border px-4 py-2 text-sm font-bold ${gradeFilter === grade ? "border-[#ea2804] bg-[#ea2804] text-white" : "border-[rgba(32,32,32,0.12)] bg-white"}`}>
                {grade.replace("_", " ")}
              </button>
            ))}
          </div>
          <div className="space-y-4">
            {reviews.map((review) => (
              <article key={review.id} className="rounded-[18px] border border-[rgba(32,32,32,0.12)] bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-black uppercase text-[#ea2804]">{review.insuranceType} / {review.intent.replaceAll("_", " ")}</p>
                    <h2 className="mt-1 text-xl font-black">{review.chatTitle}</h2>
                    <p className="mt-1 text-sm text-[#646464]">{review.userEmail ?? "No user email"} · {new Date(review.createdAt).toLocaleString()}</p>
                  </div>
                  <div className="text-right">
                    <span className={scoreBadgeClass(review.quality.score)}>{review.quality.score}%</span>
                    <p className="mt-2 text-sm font-bold capitalize">{review.quality.grade.replace("_", " ")}</p>
                  </div>
                </div>
                <p className="mt-4 border-l-2 border-[#ea2804] pl-4 text-sm leading-6 text-[#3a3a3a]">{review.excerpt}</p>
                <div className="mt-4 grid gap-2 md:grid-cols-3">
                  {review.quality.dimensions.map((dimension) => (
                    <div key={dimension.key} className="rounded-[12px] bg-[#f9f7f3] p-3">
                      <div className="flex justify-between gap-2 text-sm font-bold">
                        <span>{dimension.label}</span>
                        <span>{Math.round((dimension.score / dimension.max) * 100)}%</span>
                      </div>
                      {dimension.notes[0] ? <p className="mt-2 text-xs leading-5 text-[#646464]">{dimension.notes[0]}</p> : <p className="mt-2 text-xs text-[#2b9a66]">Clear</p>}
                    </div>
                  ))}
                </div>
              </article>
            ))}
            {!reviews.length ? <EmptyNote text="No responses match this filter yet." /> : null}
          </div>
        </Panel>
      </div>
    </main>
  );
}

function Metric({ icon, label, value, tone = "neutral" }: { icon: React.ReactNode; label: string; value: number | string; tone?: "neutral" | "good" | "warn" }) {
  return (
    <div className="rounded-[16px] border border-[rgba(32,32,32,0.12)] bg-white p-5">
      <div className={tone === "good" ? "mb-4 text-[#2b9a66]" : tone === "warn" ? "mb-4 text-[#ea2804]" : "mb-4 text-[#202020]"}>{icon}</div>
      <div className="text-[32px] font-black leading-none">{value}</div>
      <div className="mt-2 text-xs font-bold uppercase text-[#646464]">{label}</div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[22px] border border-[rgba(32,32,32,0.12)] bg-[#f3f0e8] p-5">
      <div className="mb-4 flex items-center gap-2">
        <BarChart3 size={18} className="text-[#ea2804]" />
        <h2 className="text-[18px] font-black">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function EmptyNote({ text }: { text: string }) {
  return <p className="rounded-[16px] border border-dashed border-[rgba(32,32,32,0.2)] bg-white p-5 text-sm text-[#646464]">{text}</p>;
}

function scoreTone(score: number): "good" | "warn" | "neutral" {
  if (score >= 80) return "good";
  if (score > 0 && score < 70) return "warn";
  return "neutral";
}

function scoreBadgeClass(score: number) {
  if (score >= 85) return "rounded-full bg-[#2b9a66] px-3 py-1 text-xs font-black text-white";
  if (score >= 70) return "rounded-full bg-[#202020] px-3 py-1 text-xs font-black text-white";
  return "rounded-full bg-[#ea2804] px-3 py-1 text-xs font-black text-white";
}
