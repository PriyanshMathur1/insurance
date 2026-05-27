"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Database, FileText, Handshake, MessageSquare, RefreshCw, ShieldCheck } from "lucide-react";

type AdminData = {
  chats: unknown[];
  handoffs: Array<{ id: string; status: string; reason: string; insuranceType: string; user?: { email: string }; chat?: { title: string } }>;
  logs: unknown[];
  products: { health?: unknown[]; term?: unknown[] };
  documents: unknown[];
};

export default function AdminPage() {
  const [data, setData] = useState<AdminData>({ chats: [], handoffs: [], logs: [], products: {}, documents: [] });
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [chats, handoffs, logs, products, documents] = await Promise.all([
      fetch("/api/admin/chats").then((res) => res.json()),
      fetch("/api/admin/handoffs").then((res) => res.json()),
      fetch("/api/admin/ingestion-logs").then((res) => res.json()),
      fetch("/api/admin/products").then((res) => res.json()),
      fetch("/api/admin/documents").then((res) => res.json()),
    ]);
    setLoading(false);
    setData({ chats: chats.chats ?? [], handoffs: handoffs.handoffs ?? [], logs: logs.logs ?? [], products, documents: documents.documents ?? [] });
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

  return (
    <main className="min-h-screen bg-[#fffdf9] text-[#17171c]">
      <section className="border-b border-[#eadfd4] bg-[#f8f4ef]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-5 px-5 py-7">
          <div className="flex items-center gap-4">
            <span className="relative grid size-13 place-items-center">
              <ShieldCheck size={50} className="absolute text-[#12245a]" strokeWidth={1.7} />
              <span className="mt-1 rounded-[4px] bg-[#f1a32b] px-1.5 py-0.5 text-[9px] font-bold text-white">PI</span>
            </span>
            <div>
              <p className="text-sm uppercase tracking-[0.18em] text-[#93939f]">Advisor console</p>
              <h1 className="mt-1 text-[34px] font-medium">Operations dashboard</h1>
            </div>
          </div>
          <div className="flex gap-3">
            <a href="/chat" className="inline-flex items-center gap-2 rounded-full border border-[#eadfd4] bg-white px-5 py-3 text-sm font-medium">
              <ArrowLeft size={16} />
              Back to chat
            </a>
            <button onClick={ingest} className="inline-flex items-center gap-2 rounded-full bg-[#17171c] px-5 py-3 text-sm font-semibold text-white">
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
              {loading ? "Working" : "Run ingest"}
            </button>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-5 py-7">
        <section className="mb-6 grid gap-3 md:grid-cols-5">
          <Metric icon={<MessageSquare size={20} />} label="Chats" value={data.chats.length} />
          <Metric icon={<Handshake size={20} />} label="Handoffs" value={data.handoffs.length} />
          <Metric icon={<Database size={20} />} label="Health products" value={data.products.health?.length ?? 0} />
          <Metric icon={<Database size={20} />} label="Term products" value={data.products.term?.length ?? 0} />
          <Metric icon={<FileText size={20} />} label="Documents" value={data.documents.length} />
        </section>

        <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
          <Panel title="Human handoffs">
            <div className="space-y-3">
              {data.handoffs.map((handoff) => (
                <div key={handoff.id} className="rounded-[16px] border border-[#eadfd4] bg-white p-4 text-sm shadow-[0_14px_40px_rgba(28,23,18,0.035)]">
                  <div className="flex justify-between gap-2">
                    <strong className="text-[16px]">{handoff.chat?.title ?? handoff.insuranceType}</strong>
                    <span className="rounded-full bg-[#fff2e0] px-3 py-1 text-xs text-[#9b610a]">{handoff.status.toLowerCase()}</span>
                  </div>
                  <p className="mt-1 text-[#657080]">{handoff.user?.email}</p>
                  <p className="mt-3 leading-6 text-[#303946]">{handoff.reason}</p>
                </div>
              ))}
            </div>
          </Panel>
          <Panel title="Ingestion logs">
            <pre className="max-h-[440px] overflow-auto rounded-[14px] bg-[#17171c] p-4 text-xs leading-5 text-[#edfce9]">{JSON.stringify(data.logs, null, 2)}</pre>
          </Panel>
          <Panel title="Recent chats">
            <pre className="max-h-[440px] overflow-auto rounded-[14px] border border-[#eadfd4] bg-white p-4 text-xs leading-5">{JSON.stringify(data.chats, null, 2)}</pre>
          </Panel>
          <Panel title="Products and documents">
            <pre className="max-h-[440px] overflow-auto rounded-[14px] border border-[#eadfd4] bg-white p-4 text-xs leading-5">{JSON.stringify({ products: data.products, documents: data.documents }, null, 2)}</pre>
          </Panel>
        </div>
      </div>
    </main>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-[16px] border border-[#eadfd4] bg-white p-5 shadow-[0_14px_40px_rgba(28,23,18,0.035)]">
      <div className="mb-4 text-[#e99a1f]">{icon}</div>
      <div className="text-[32px] font-medium leading-none">{value}</div>
      <div className="mt-2 text-xs uppercase tracking-[0.12em] text-[#75758a]">{label}</div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[22px] border border-[#eadfd4] bg-[#f8f4ef] p-5">
      <h2 className="mb-4 text-[18px] font-medium">{title}</h2>
      {children}
    </section>
  );
}
