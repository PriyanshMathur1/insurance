"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  Calculator,
  ChevronDown,
  ChevronsLeft,
  CircleCheck,
  Clock3,
  Compass,
  ExternalLink,
  FileText,
  LogOut,
  MessageCircle,
  PlusCircle,
  Scale,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";

type ChatSummary = {
  id: string;
  title: string;
  insuranceCategory: string;
  detectedIntent: string;
  handoffStatus?: string | null;
  updatedAt: string;
};

type Message = {
  id: string;
  role: "USER" | "ASSISTANT" | "SYSTEM" | "TOOL";
  content: string;
  citations?: Citation[];
  createdAt: string;
};

type Citation = {
  title: string;
  filename: string;
  documentType: string;
  snippet: string;
};

type ChatDetail = ChatSummary & {
  extractedProfile?: Record<string, unknown>;
  messages: Message[];
  recommendations?: Array<{ recommendedCover?: string; riskFlags: string[] }>;
  humanHandoffs?: Array<{ status: string; reason: string }>;
};

const samplePrompts = [
  "Compare plans",
  "Calculate cover",
  "Waiting period",
];

export default function ChatPage() {
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [activeChat, setActiveChat] = useState<ChatDetail | null>(null);
  const [query, setQuery] = useState("");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const endRef = useRef<HTMLDivElement>(null);
  const activeChatRef = useRef<ChatDetail | null>(null);

  const loadChat = useCallback(async (id: string) => {
    const response = await fetch(`/api/chat/${id}`);
    const body = await response.json();
    setActiveChat(body.chat);
  }, []);

  const loadChats = useCallback(async (search = "") => {
    const response = await fetch(`/api/chat${search ? `?q=${encodeURIComponent(search)}` : ""}`);
    if (response.status === 401) {
      window.location.href = "/login";
      return;
    }
    const body = await response.json();
    setChats(body.chats ?? []);
    if (!activeChatRef.current && body.chats?.[0]) loadChat(body.chats[0].id);
  }, [loadChat]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadChats();
  }, [loadChats]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeChat?.messages.length, loading]);

  useEffect(() => {
    activeChatRef.current = activeChat;
  }, [activeChat]);

  async function newChat() {
    const response = await fetch("/api/chat/new", { method: "POST" });
    const body = await response.json();
    await loadChats();
    await loadChat(body.chat.id);
  }

  async function deleteChat(id: string) {
    await fetch(`/api/chat/${id}`, { method: "DELETE" });
    setActiveChat((current) => current?.id === id ? null : current);
    await loadChats();
  }

  async function sendMessage(event?: React.FormEvent, override?: string) {
    event?.preventDefault();
    const text = (override ?? input).trim();
    if (!text) return;
    let chat = activeChat;
    if (!chat) {
      const response = await fetch("/api/chat/new", { method: "POST" });
      const body = await response.json();
      chat = { ...body.chat, messages: [] };
      setActiveChat(chat);
    }
    if (!chat) return;
    setInput("");
    setLoading(true);
    setActiveChat((current) => current ? {
      ...current,
      messages: [...current.messages, { id: `tmp-${Date.now()}`, role: "USER", content: text, createdAt: new Date().toISOString() }],
    } : current);
    const response = await fetch(`/api/chat/${chat.id}/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text }),
    });
    setLoading(false);
    if (response.ok) {
      await loadChat(chat.id);
      await loadChats(query);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  const profileEntries = useMemo(() => Object.entries(activeChat?.extractedProfile ?? {}).filter(([, value]) => Boolean(value)), [activeChat]);
  const title = activeChat?.title === "New insurance chat" || !activeChat?.title ? "family health insurance" : activeChat.title;

  return (
    <main className="flex h-screen overflow-hidden bg-[#fffdf9] text-[#17171c]">
      <aside className={`${sidebarOpen ? "flex" : "hidden"} w-[356px] shrink-0 flex-col border-r border-[#eee7df] bg-[#f8f4ef] md:flex`}>
        <div className="px-8 pb-7 pt-8">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <BrandShield />
              <div>
                <h1 className="text-[20px] font-semibold leading-tight text-[#12245a]">Insurance Advisor</h1>
                <p className="mt-1 text-[13px] text-[#626b7a]">Health &amp; Term Insurance</p>
              </div>
            </div>
            <button onClick={() => setSidebarOpen(false)} className="grid size-8 place-items-center rounded-lg border border-[#e2d7cc] bg-[#fffaf5] text-[#a0795c] shadow-sm" title="Collapse sidebar">
              <ChevronsLeft size={18} />
            </button>
          </div>
        </div>

        <nav className="px-4">
          <button className="mb-4 flex w-full items-center gap-5 rounded-[8px] px-5 py-4 text-[17px] text-[#29313d] hover:bg-white">
            <Compass size={25} strokeWidth={1.4} />
            Discover
          </button>
          <button onClick={newChat} className="flex w-full items-center gap-5 rounded-[8px] bg-white px-5 py-4 text-[17px] text-[#17171c] shadow-[0_14px_44px_rgba(40,28,18,0.08)]">
            <PlusCircle size={25} className="text-[#f0a020]" strokeWidth={1.8} />
            New Chat
          </button>
        </nav>

        <div className="mt-9 px-8">
          <label className="mb-7 flex items-center gap-2 rounded-[8px] border border-[#eadfd4] bg-[#fffaf5] px-3 py-2 text-sm text-[#6d7480]">
            <Search size={15} />
            <input value={query} onChange={(event) => { setQuery(event.target.value); loadChats(event.target.value); }} placeholder="Search chats" className="w-full bg-transparent outline-none" />
          </label>

          <p className="mb-5 text-[14px] text-[#707988]">Saved chats</p>
          <div className="space-y-1">
            {chats.map((chat) => (
              <button key={chat.id} onClick={() => loadChat(chat.id)} className={`group flex w-full items-center gap-4 border-b border-[#eadfd4] px-1 py-4 text-left text-[15px] transition hover:text-[#12245a] ${activeChat?.id === chat.id ? "text-[#12245a]" : "text-[#303946]"}`}>
                <MessageCircle size={18} strokeWidth={1.5} className="shrink-0" />
                <span className="line-clamp-1 flex-1">{chat.title}</span>
                <span className="rounded-full bg-[#fff8ef] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[#d58b1b]">{chat.insuranceCategory}</span>
                <span onClick={(event) => { event.stopPropagation(); deleteChat(chat.id); }} className="rounded p-1 text-[#9b4b38] opacity-0 hover:bg-[#fff2ed] group-hover:opacity-100">
                  <Trash2 size={14} />
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-auto px-8 py-8">
          <a href="/admin" className="mb-5 flex items-center justify-between rounded-[8px] border border-[#eadfd4] bg-[#fffaf5] px-4 py-3 text-sm font-medium text-[#12245a]">
            Advisor admin
            <ExternalLink size={15} />
          </a>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="grid size-12 place-items-center rounded-full bg-[#efe5da] text-sm font-semibold text-[#12245a]">P</div>
              <span className="text-[17px] font-medium">Priyansh</span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={logout} className="grid size-8 place-items-center rounded-lg text-[#5d6572] hover:bg-white" title="Logout">
                <LogOut size={17} />
              </button>
              <ChevronDown size={18} />
            </div>
          </div>
        </div>
      </aside>

      <section className="relative flex min-w-0 flex-1 flex-col">
        {!sidebarOpen ? (
          <button onClick={() => setSidebarOpen(true)} className="absolute left-5 top-5 z-10 grid size-10 place-items-center rounded-xl border border-[#eadfd4] bg-white text-[#12245a] shadow-sm md:hidden" title="Open sidebar">
            <Compass size={18} />
          </button>
        ) : null}

        <div className="mx-auto flex min-h-0 w-full max-w-[1180px] flex-1 flex-col px-5 pb-6 pt-10 lg:px-10">
          <div className="mx-auto mb-7 inline-flex max-w-full items-center gap-6 rounded-[20px] border border-[#eadfd4] bg-white px-8 py-4 text-[17px] shadow-[0_12px_36px_rgba(37,24,10,0.04)]">
            <FileText size={22} className="shrink-0 text-[#e99a1f]" strokeWidth={1.7} />
            <span className="truncate font-medium">{title.toLowerCase()}</span>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-1">
            <div className="mx-auto flex max-w-[1000px] flex-col gap-8">
              {(activeChat?.messages ?? []).length === 0 ? <EmptyState onPick={(prompt) => sendMessage(undefined, prompt)} /> : null}

              {activeChat?.messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}

              {loading ? (
                <article className="flex items-start gap-5">
                  <BrandShield />
                  <div className="max-w-[820px] rounded-[16px] border border-[#e2e5e9] bg-white px-8 py-6 text-[16px] text-[#707988] shadow-[0_18px_50px_rgba(28,23,18,0.035)]">
                    <div className="mb-4 flex gap-2">
                      <span className="size-2 animate-pulse rounded-full bg-[#e99a1f]" />
                      <span className="size-2 animate-pulse rounded-full bg-[#e99a1f] [animation-delay:120ms]" />
                      <span className="size-2 animate-pulse rounded-full bg-[#e99a1f] [animation-delay:240ms]" />
                    </div>
                    Advisor is checking sources, calculators, compliance, and handoff rules...
                  </div>
                </article>
              ) : null}
              <div ref={endRef} />
            </div>
          </div>

          <div className="mx-auto mt-7 w-full max-w-[1100px]">
            <form onSubmit={(event) => sendMessage(event)} className="flex items-center gap-4 rounded-[14px] border border-[#eadfd4] bg-white px-5 py-3 shadow-[0_12px_36px_rgba(37,24,10,0.04)]">
              <Sparkles size={25} className="shrink-0 text-[#e99a1f]" />
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Ask me anything about health or term insurance..."
                rows={1}
                className="max-h-28 min-h-11 flex-1 resize-none bg-transparent py-2 text-[18px] text-[#17171c] outline-none placeholder:text-[#747b89]"
              />
              <button disabled={loading} className="grid size-13 shrink-0 place-items-center rounded-[10px] bg-[#16265d] text-white shadow-[0_10px_24px_rgba(18,36,90,0.18)] disabled:opacity-50" title="Send">
                <Send size={22} />
              </button>
            </form>
            <div className="mx-auto mt-4 grid max-w-[860px] gap-4 md:grid-cols-3">
              {samplePrompts.map((prompt) => (
                <button key={prompt} onClick={() => sendMessage(undefined, prompt)} className="flex items-center justify-center gap-3 rounded-[12px] border border-[#eadfd4] bg-white px-5 py-3 text-[15px] font-medium shadow-[0_10px_30px_rgba(37,24,10,0.03)]">
                  {prompt === "Compare plans" ? <Scale size={20} className="text-[#e99a1f]" /> : null}
                  {prompt === "Calculate cover" ? <Calculator size={20} className="text-[#1e9b57]" /> : null}
                  {prompt === "Waiting period" ? <Clock3 size={20} className="text-[#e99a1f]" /> : null}
                  {prompt}
                </button>
              ))}
            </div>

            <ContextStrip profileEntries={profileEntries} activeChat={activeChat} />
          </div>
        </div>
      </section>
    </main>
  );
}

function BrandShield() {
  return (
    <div className="relative grid size-13 place-items-center">
      <ShieldCheck size={48} className="absolute text-[#12245a]" strokeWidth={1.7} />
      <span className="mt-1 rounded-[4px] bg-[#f1a32b] px-1.5 py-0.5 text-[9px] font-bold text-white">PI</span>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "USER";
  return (
    <article className={`flex items-start gap-5 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser ? <BrandShield /> : null}
      <div className={isUser ? "max-w-[660px]" : "max-w-[820px]"}>
        <div className={`rounded-[16px] border px-8 py-6 text-[18px] leading-8 shadow-[0_18px_50px_rgba(28,23,18,0.035)] ${isUser ? "border-[#eadfd4] bg-white text-[#17171c]" : "border-[#e2e5e9] bg-white text-[#222a36]"}`}>
          {isUser ? (
            <p>{message.content}</p>
          ) : (
            <div className="prose-chat"><ReactMarkdown>{message.content}</ReactMarkdown></div>
          )}
          {isUser ? (
            <div className="mt-2 flex justify-end gap-3 text-[13px] text-[#737b88]">
              {new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              <CircleCheck size={16} className="text-[#e99a1f]" />
            </div>
          ) : null}
        </div>

        {!isUser ? (
          <>
            <p className="mt-3 text-[13px] text-[#737b88]">{new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
            {message.citations?.length ? (
              <div className="mt-4 flex flex-wrap gap-3">
                {message.citations.map((citation, index) => (
                  <span key={`${citation.filename}-${index}`} title={citation.snippet} className="inline-flex items-center gap-3 rounded-[10px] border border-[#eadfd4] bg-white px-5 py-3 text-[14px] text-[#303946] shadow-[0_10px_24px_rgba(28,23,18,0.035)]">
                    {citation.documentType || citation.title}
                    <ExternalLink size={15} className="text-[#657080]" />
                  </span>
                ))}
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </article>
  );
}

function EmptyState({ onPick }: { onPick: (prompt: string) => void }) {
  return (
    <div className="mx-auto mt-6 max-w-[860px] rounded-[22px] border border-[#eadfd4] bg-white px-8 py-7 shadow-[0_18px_54px_rgba(28,23,18,0.04)]">
      <div className="mb-5 flex items-center gap-4">
        <BrandShield />
        <div>
          <p className="mb-1 text-xs uppercase tracking-[0.18em] text-[#93939f]">Private advisor console</p>
          <h2 className="text-[28px] font-medium text-[#12245a]">Start an insurance chat</h2>
          <p className="mt-1 text-[15px] text-[#6d7480]">Use your ingested health, term, regulator, and claims data as the source of truth.</p>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {["Which health insurance is good for my family?", "How much term insurance should I take?", "Compare HDFC ERGO and Star Health"].map((prompt) => (
          <button key={prompt} onClick={() => onPick(prompt)} className="rounded-[12px] border border-[#eadfd4] bg-[#fffaf5] px-4 py-3 text-left text-[14px] leading-5 text-[#303946] hover:bg-white">
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}

function ContextStrip({ profileEntries, activeChat }: { profileEntries: Array<[string, unknown]>; activeChat: ChatDetail | null }) {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-[12px] text-[#657080]">
      <span className="rounded-full bg-[#f8f4ef] px-3 py-1">Need: {activeChat?.insuranceCategory?.toLowerCase() ?? "not detected"}</span>
      <span className="rounded-full bg-[#f8f4ef] px-3 py-1">Intent: {activeChat?.detectedIntent?.toLowerCase() ?? "not detected"}</span>
      {profileEntries.slice(0, 3).map(([key, value]) => (
        <span key={key} className="rounded-full bg-[#f8f4ef] px-3 py-1">{key}: {Array.isArray(value) ? value.join(", ") : String(value)}</span>
      ))}
      {activeChat?.humanHandoffs?.[0] ? <span className="rounded-full bg-[#fff2e0] px-3 py-1 text-[#9b610a]">Handoff open</span> : null}
    </div>
  );
}
