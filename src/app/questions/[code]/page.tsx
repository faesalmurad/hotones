"use client";

import { useEffect, useState, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getTypeLabel, getTypeColor, type QuestionType } from "@/lib/questions";

interface QuestionBank {
  id: string;
  code: string;
  name: string;
  creator_claim_id: string;
}

interface CustomQuestion {
  id: string;
  bank_id: string;
  type: QuestionType;
  text: string;
  sort_order: number;
}

const QUESTION_TYPES: { value: QuestionType; label: string }[] = [
  { value: "truth", label: "Truth or Dab" },
  { value: "wouldyourather", label: "Would You Rather" },
  { value: "roast", label: "Roast Round" },
  { value: "challenge", label: "Challenge" },
];

export default function QuestionBankEditor({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const router = useRouter();
  const [bank, setBank] = useState<QuestionBank | null>(null);
  const [questions, setQuestions] = useState<CustomQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [isOwner, setIsOwner] = useState(false);

  const [newType, setNewType] = useState<QuestionType>("truth");
  const [newText, setNewText] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  const fetchQuestions = useCallback(async (bankId: string) => {
    const { data } = await supabase
      .from("custom_questions")
      .select("*")
      .eq("bank_id", bankId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (data) setQuestions(data);
  }, []);

  useEffect(() => {
    async function load() {
      const { data: bankData } = await supabase
        .from("question_banks").select("*").eq("code", code.toUpperCase()).maybeSingle();

      if (!bankData) { setError("Question bank not found."); setLoading(false); return; }

      setBank(bankData);
      const claimId = localStorage.getItem("hot_ones_claim_id");
      setIsOwner(bankData.creator_claim_id === claimId);
      await fetchQuestions(bankData.id);
      setLoading(false);
    }
    load();
  }, [code, fetchQuestions]);

  async function addQuestion() {
    if (!newText.trim() || !bank) return;
    setAdding(true);
    const { error: insertError } = await supabase.from("custom_questions").insert({
      bank_id: bank.id, type: newType, text: newText.trim(), sort_order: questions.length,
    });
    if (!insertError) {
      setNewText("");
      await fetchQuestions(bank.id);
    }
    setAdding(false);
  }

  async function deleteQuestion(id: string) {
    await supabase.from("custom_questions").delete().eq("id", id);
    if (bank) await fetchQuestions(bank.id);
  }

  async function saveEdit(id: string) {
    if (!editText.trim()) return;
    await supabase.from("custom_questions").update({ text: editText.trim() }).eq("id", id);
    setEditingId(null);
    if (bank) await fetchQuestions(bank.id);
  }

  function copyCode() {
    navigator.clipboard.writeText(code.toUpperCase());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-zinc-600 text-[10px] uppercase tracking-[0.4em] font-bold animate-pulse">Loading...</div>
      </div>
    );
  }

  if (error || !bank) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-red-500 font-semibold">{error}</p>
        <button onClick={() => router.push("/questions")} className="text-zinc-500 hover:text-white text-sm cursor-pointer transition-colors">Back</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-8 relative">
      <div className="ember-field" />
      <div className="max-w-2xl mx-auto relative z-10">
        {/* Header */}
        <header className="mb-8">
          <button onClick={() => router.push("/questions")}
            className="text-zinc-600 hover:text-white text-[11px] uppercase tracking-[0.2em] font-bold mb-4 block cursor-pointer transition-colors">
            &larr; Back
          </button>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="title-fire text-3xl md:text-4xl font-[family-name:var(--font-archivo)] uppercase italic leading-none tracking-tight">
                {bank.name}
              </h1>
              <p className="text-zinc-600 text-sm mt-1.5 font-medium">{questions.length} question{questions.length !== 1 ? "s" : ""}</p>
            </div>
            <button onClick={copyCode}
              className="flex items-center gap-2 sauce-card hover:border-orange-600/20 px-4 py-2 rounded-lg cursor-pointer">
              <span className="text-orange-500 font-black text-lg tracking-wider">{code.toUpperCase()}</span>
              <span className="text-zinc-600 text-[10px] uppercase font-bold">{copied ? "Copied!" : "Copy"}</span>
            </button>
          </div>
        </header>

        {/* Add Question Form */}
        {isOwner && (
          <div className="sauce-card-active rounded-xl p-5 mb-6 border-t-2 border-orange-600">
            <div className="flex flex-wrap gap-2 mb-3">
              {QUESTION_TYPES.map((t) => (
                <button key={t.value} onClick={() => setNewType(t.value)}
                  className={`text-[10px] font-bold uppercase px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                    newType === t.value
                      ? "bg-orange-600 text-black shadow-[0_0_15px_rgba(249,115,22,0.3)]"
                      : "bg-white/[0.03] border border-white/[0.06] text-zinc-500 hover:text-white hover:border-white/[0.12]"
                  }`}>
                  {t.label}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input type="text" value={newText} onChange={(e) => setNewText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addQuestion()}
                placeholder={newType === "roast" ? "Use {player} for the spotlighted name..." : "Type your question..."}
                className="input-dark flex-grow p-3 px-4 rounded-lg text-sm font-medium" />
              <button onClick={addQuestion} disabled={adding || !newText.trim()}
                className="btn-fire px-5 py-3 rounded-lg text-sm cursor-pointer">
                Add
              </button>
            </div>
          </div>
        )}

        {/* Question List */}
        <div className="space-y-2">
          {questions.map((q, i) => (
            <div key={q.id} className="sauce-card rounded-lg p-4 flex items-start gap-3 group animate-fade-in"
              style={{ animationDelay: `${i * 30}ms` }}>
              <span className="text-zinc-700 font-black text-sm mt-0.5 w-6 shrink-0 text-center">{i + 1}</span>
              <div className="flex-grow min-w-0">
                <span className={`text-[9px] font-bold uppercase tracking-[0.2em] ${getTypeColor(q.type)}`}>
                  {getTypeLabel(q.type)}
                </span>
                {editingId === q.id ? (
                  <div className="flex gap-2 mt-1">
                    <input type="text" value={editText} onChange={(e) => setEditText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") saveEdit(q.id); if (e.key === "Escape") setEditingId(null); }}
                      autoFocus
                      className="input-dark flex-grow p-2 rounded text-sm" />
                    <button onClick={() => saveEdit(q.id)}
                      className="text-green-400 text-xs font-bold uppercase cursor-pointer hover:text-green-300 transition-colors">Save</button>
                    <button onClick={() => setEditingId(null)}
                      className="text-zinc-500 text-xs font-bold uppercase cursor-pointer hover:text-zinc-300 transition-colors">Cancel</button>
                  </div>
                ) : (
                  <p className="text-white text-sm mt-0.5 leading-relaxed">{q.text}</p>
                )}
              </div>
              {isOwner && editingId !== q.id && (
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button onClick={() => { setEditingId(q.id); setEditText(q.text); }}
                    className="text-zinc-600 hover:text-white text-xs cursor-pointer p-1 font-bold transition-colors">Edit</button>
                  <button onClick={() => deleteQuestion(q.id)}
                    className="text-zinc-600 hover:text-red-400 text-xs cursor-pointer p-1 font-bold transition-colors">Delete</button>
                </div>
              )}
            </div>
          ))}
          {questions.length === 0 && (
            <div className="text-center py-16">
              <p className="text-zinc-700 text-sm font-medium">No questions yet. Add some above!</p>
            </div>
          )}
        </div>

        {/* Usage hint */}
        {questions.length > 0 && (
          <div className="mt-8 text-center">
            <p className="text-zinc-600 text-xs font-medium">
              Use code <span className="text-orange-500 font-bold">{code.toUpperCase()}</span> when creating a room to use these questions
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
