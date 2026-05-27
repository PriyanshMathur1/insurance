"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  ArrowUp,
  BookOpenCheck,
  ClipboardCheck,
  FileText,
  GitCompare,
  HelpCircle,
  LifeBuoy,
  LogOut,
  Menu,
  MessageCircle,
  PanelLeftClose,
  Plus,
  Search,
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
  { label: "Compare plans", prompt: "Compare health insurance plans from uploaded sources", icon: GitCompare },
  { label: "Calculate cover", prompt: "I need health insurance for my family in Mumbai", icon: ClipboardCheck },
  { label: "Claim help", prompt: "My health insurance claim was rejected", icon: LifeBuoy },
];

const formatStyles: Record<string, { label: string; tone: string; icon: typeof BookOpenCheck }> = {
  concept_explanation: { label: "Concept explainer", tone: "Plain-language answer", icon: BookOpenCheck },
  health_advice: { label: "Health recommendation", tone: "Profile-led guidance", icon: ShieldCheck },
  term_advice: { label: "Term recommendation", tone: "Cover calculation", icon: ClipboardCheck },
  product_comparison: { label: "Source comparison", tone: "Verified table", icon: GitCompare },
  claims: { label: "Claim triage", tone: "Risk and documents", icon: LifeBuoy },
  profile_recommendation: { label: "Recommendation", tone: "Needs more context", icon: HelpCircle },
  general_education: { label: "Scope check", tone: "Health and term only", icon: HelpCircle },
};

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
    if ((activeChat?.messages.length ?? 0) > 0 || loading) {
      endRef.current?.scrollIntoView({ behavior: "smooth" });
    }
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
  const chatTitle = activeChat?.title === "New insurance chat" || !activeChat?.title ? "New advisory thread" : activeChat.title;
  const format = formatMeta(activeChat?.detectedIntent);

  return (
    <main className="advisor-shell">
      <aside className={`advisor-sidebar ${sidebarOpen ? "advisor-sidebar-open" : ""}`}>
        <div className="sidebar-head">
          <BrandMark />
          <button onClick={() => setSidebarOpen(false)} className="icon-button hide-mobile" title="Collapse sidebar">
            <PanelLeftClose size={18} />
          </button>
        </div>

        <button onClick={newChat} className="new-thread-button">
          <Plus size={18} />
          New advisory thread
        </button>

        <label className="search-box">
          <Search size={15} />
          <input value={query} onChange={(event) => { setQuery(event.target.value); loadChats(event.target.value); }} placeholder="Search chats" />
        </label>

        <div className="thread-list">
          <p className="rail-label">Saved chats</p>
          {chats.map((chat) => (
            <button key={chat.id} onClick={() => loadChat(chat.id)} className={`thread-row ${activeChat?.id === chat.id ? "thread-row-active" : ""}`}>
              <MessageCircle size={17} />
              <span>{chat.title}</span>
              <small>{chat.insuranceCategory}</small>
              <Trash2 onClick={(event) => { event.stopPropagation(); deleteChat(chat.id); }} size={14} className="delete-thread" />
            </button>
          ))}
        </div>

        <div className="sidebar-foot">
          <a href="/admin">Advisor admin</a>
          <button onClick={logout} className="icon-button" title="Logout">
            <LogOut size={17} />
          </button>
        </div>
      </aside>

      <section className="advisor-main">
        <header className="workspace-header">
          <button onClick={() => setSidebarOpen(true)} className="icon-button show-mobile" title="Open sidebar">
            <Menu size={18} />
          </button>
          <div>
            <p className="eyebrow">Priyansh Insurance</p>
            <h1>{chatTitle}</h1>
          </div>
          <div className="format-pill">
            <format.icon size={18} />
            <span>{format.label}</span>
            <small>{format.tone}</small>
          </div>
        </header>

        <div className="workspace-grid">
          <section className="conversation-panel">
            {(activeChat?.messages ?? []).length === 0 ? <EmptyState /> : null}

            <div className="message-stack">
              {activeChat?.messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
              {loading ? <LoadingAnswer /> : null}
              <div ref={endRef} />
            </div>
          </section>

          <aside className="context-panel">
            <ContextPanel activeChat={activeChat} profileEntries={profileEntries} />
          </aside>
        </div>

        <footer className="composer-zone">
          <form onSubmit={(event) => sendMessage(event)} className="composer">
            <Sparkles size={18} />
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask about health insurance, term insurance, or claims..."
              rows={1}
            />
            <button disabled={loading} title="Send">
              <ArrowUp size={20} />
            </button>
          </form>
          <div className="prompt-row">
            {samplePrompts.map((prompt) => (
              <button key={prompt.label} onClick={() => sendMessage(undefined, prompt.prompt)}>
                <prompt.icon size={16} />
                {prompt.label}
              </button>
            ))}
          </div>
        </footer>
      </section>
    </main>
  );
}

function BrandMark() {
  return (
    <div className="brand-mark">
      <div className="brand-icon"><ShieldCheck size={22} /></div>
      <div>
        <strong>Insurance Advisor</strong>
        <span>Health and term only</span>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "USER";
  return (
    <article className={`message ${isUser ? "message-user" : "message-assistant"}`}>
      {!isUser ? <div className="assistant-dot">PI</div> : null}
      <div className="message-body">
        {isUser ? (
          <div className="user-bubble">
            <p>{message.content}</p>
            <MessageTime message={message} />
          </div>
        ) : (
          <StructuredAnswer message={message} />
        )}
      </div>
    </article>
  );
}

function StructuredAnswer({ message }: { message: Message }) {
  const sections = parseSections(message.content);
  const lead = sections[0];
  const rest = sections.slice(1);
  return (
    <div className="answer-card">
      <div className="answer-head">
        <FileText size={18} />
        <span>Advisor response</span>
        <MessageTime message={message} />
      </div>
      {lead ? (
        <section className="answer-lead">
          <p>{lead.title}</p>
          <MarkdownBlock content={lead.body} />
        </section>
      ) : (
        <MarkdownBlock content={message.content} />
      )}
      {rest.length ? (
        <div className="answer-section-grid">
          {rest.map((section) => (
            <section key={section.title} className={sectionClass(section.title)}>
              <h3>{section.title}</h3>
              <MarkdownBlock content={section.body} />
            </section>
          ))}
        </div>
      ) : null}
      {message.citations?.length ? <CitationStrip citations={message.citations} /> : null}
    </div>
  );
}

function MarkdownBlock({ content }: { content: string }) {
  return (
    <div className="prose-chat">
      <ReactMarkdown>{content.trim()}</ReactMarkdown>
    </div>
  );
}

function CitationStrip({ citations }: { citations: Citation[] }) {
  return (
    <div className="citation-strip">
      {citations.map((citation, index) => (
        <span key={`${citation.filename}-${index}`} title={citation.snippet}>
          {citation.documentType || citation.title}
        </span>
      ))}
    </div>
  );
}

function LoadingAnswer() {
  return (
    <article className="message message-assistant">
      <div className="assistant-dot">PI</div>
      <div className="answer-card answer-loading">
        <div className="loading-bars">
          <span />
          <span />
          <span />
        </div>
        <p>Checking sources, calculator logic, response format, and compliance...</p>
      </div>
    </article>
  );
}

function EmptyState() {
  return (
    <div className="empty-state">
      <p className="eyebrow">Structured insurance advisor</p>
      <h2>Ask once. Get the format that fits the question.</h2>
      <p>Concepts become explainers, comparisons become source tables, claim questions become triage, and personal advice starts with only the questions that matter.</p>
    </div>
  );
}

function ContextPanel({ profileEntries, activeChat }: { profileEntries: Array<[string, unknown]>; activeChat: ChatDetail | null }) {
  return (
    <div className="context-card">
      <p className="rail-label">Context</p>
      <dl>
        <div>
          <dt>Need</dt>
          <dd>{activeChat?.insuranceCategory?.toLowerCase() ?? "not detected"}</dd>
        </div>
        <div>
          <dt>Intent</dt>
          <dd>{activeChat?.detectedIntent?.toLowerCase().replaceAll("_", " ") ?? "not detected"}</dd>
        </div>
        <div>
          <dt>Handoff</dt>
          <dd>{activeChat?.humanHandoffs?.[0] ? "open" : "not needed yet"}</dd>
        </div>
      </dl>
      <div className="profile-chips">
        {profileEntries.slice(0, 8).map(([key, value]) => (
          <span key={key}>{key}: {Array.isArray(value) ? value.join(", ") : String(value)}</span>
        ))}
        {!profileEntries.length ? <span>No profile details captured yet</span> : null}
      </div>
    </div>
  );
}

function MessageTime({ message }: { message: Message }) {
  return (
    <time>{new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
  );
}

function formatMeta(intent?: string) {
  return formatStyles[(intent ?? "general_education").toLowerCase()] ?? formatStyles.general_education;
}

function parseSections(content: string) {
  const lines = content.split("\n");
  const sections: Array<{ title: string; body: string }> = [];
  let current: { title: string; body: string[] } | null = null;

  for (const line of lines) {
    const match = line.match(/^([A-Z][A-Za-z /&-]{2,40}):\s*$/);
    if (match) {
      if (current) sections.push({ title: current.title, body: current.body.join("\n") });
      current = { title: match[1], body: [] };
    } else if (current) {
      current.body.push(line);
    } else if (line.trim()) {
      current = { title: "Simple answer", body: [line] };
    }
  }
  if (current) sections.push({ title: current.title, body: current.body.join("\n") });
  return sections;
}

function sectionClass(title: string) {
  const lowered = title.toLowerCase();
  if (lowered.includes("question")) return "answer-section answer-section-accent";
  if (lowered.includes("red flag")) return "answer-section answer-section-warn";
  if (lowered.includes("recommended") || lowered.includes("comparison")) return "answer-section answer-section-dark";
  return "answer-section";
}
