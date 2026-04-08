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

  // New question form
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
        <div className="text-zinc-500 text-sm uppercase tracking-widest animate-pulse">Loading...</div>
      </div>
    );
  }

  if (error || !bank) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-red-500">{error}</p>
        <button onClick={() => router.push("/questions")} className="text-zinc-400 underline text-sm cursor-pointer">Back</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <header className="mb-8">
          <button onClick={() => router.push("/questions")}
            className="text-zinc-600 hover:text-white text-xs uppercase tracking-widest mb-4 block cursor-pointer">
            &larr; Back
          </button>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-[family-name:var(--font-archivo)] uppercase text-orange-600 italic leading-none tracking-tight"
                style={{ textShadow: "0 0 20px rgba(255, 68, 0, 0.3)" }}>
                {bank.name}
              </h1>
              <p className="text-zinc-500 text-sm mt-1">{questions.length} question{questions.length !== 1 ? "s" : ""}</p>
            </div>
            <button onClick={copyCode}
              className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 hover:border-orange-600/50 px-4 py-2 rounded-lg transition-colors cursor-pointer">
              <span className="text-orange-600 font-black text-lg tracking-wider">{code.toUpperCase()}</span>
              <span className="text-zinc-500 text-[10px] uppercase">{copied ? "Copied!" : "Copy"}</span>
            </button>
          </div>
        </header>

        {/* Add Question Form */}
        {isOwner && (
          <div className="sauce-card rounded-xl p-5 mb-6 border-t-2 border-orange-600">
            <div className="flex gap-2 mb-3">
              {QUESTION_TYPES.map((t) => (
                <button key={t.value} onClick={() => setNewType(t.value)}
                  className={`text-[10px] font-bold uppercase px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                    newType === t.value ? "bg-orange-600 text-black" : "bg-zinc-800 text-zinc-500 hover:text-white"
                  }`}>
                  {t.label}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input type="text" value={newText} onChange={(e) => setNewText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addQuestion()}
                placeholder={newType === "roast" ? "Use {player} for the spotlighted name..." : "Type your question..."}
                className="flex-grow bg-zinc-900 border border-zinc-800 p-3 px-4 rounded-lg text-white placeholder:text-zinc-600 focus:outline-none focus:border-orange-600 transition-colors text-sm" />
              <button onClick={addQuestion} disabled={adding || !newText.trim()}
                className="bg-orange-600 hover:bg-orange-500 disabled:opacity-30 px-5 py-3 rounded-lg font-black uppercase text-black text-sm transition-colors cursor-pointer">
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
              <span className="text-zinc-600 font-black text-sm mt-0.5 w-6 shrink-0">{i + 1}</span>
              <div className="flex-grow min-w-0">
                <span className={`text-[9px] font-bold uppercase tracking-wider ${getTypeColor(q.type)}`}>
                  {getTypeLabel(q.type)}
                </span>
                {editingId === q.id ? (
                  <div className="flex gap-2 mt-1">
                    <input type="text" value={editText} onChange={(e) => setEditText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") saveEdit(q.id); if (e.key === "Escape") setEditingId(null); }}
                      autoFocus
                      className="flex-grow bg-zinc-900 border border-zinc-700 p-2 rounded text-white text-sm focus:outline-none focus:border-orange-600" />
                    <button onClick={() => saveEdit(q.id)}
                      className="text-green-500 text-xs font-bold uppercase cursor-pointer">Save</button>
                    <button onClick={() => setEditingId(null)}
                      className="text-zinc-500 text-xs font-bold uppercase cursor-pointer">Cancel</button>
                  </div>
                ) : (
                  <p className="text-white text-sm mt-0.5 leading-relaxed">{q.text}</p>
                )}
              </div>
              {isOwner && editingId !== q.id && (
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button onClick={() => { setEditingId(q.id); setEditText(q.text); }}
                    className="text-zinc-600 hover:text-white text-xs cursor-pointer p-1">Edit</button>
                  <button onClick={() => deleteQuestion(q.id)}
                    className="text-zinc-600 hover:text-red-500 text-xs cursor-pointer p-1">Delete</button>
                </div>
              )}
            </div>
          ))}
          {questions.length === 0 && (
            <div className="text-center py-12">
              <p className="text-zinc-600 text-sm">No questions yet. Add some above!</p>
            </div>
          )}
        </div>

        {/* Usage hint */}
        {questions.length > 0 && (
          <div className="mt-8 text-center">
            <p className="text-zinc-600 text-xs">
              Use code <span className="text-orange-600 font-bold">{code.toUpperCase()}</span> when creating a room to use these questions
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
