"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { generateRoomCode } from "@/lib/constants";

export default function QuestionsLanding() {
  const router = useRouter();
  const [bankName, setBankName] = useState("");
  const [loadCode, setLoadCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  async function createBank() {
    if (!bankName.trim()) { setError("Give your question bank a name."); return; }
    setLoading(true);
    setError("");

    const claimId = localStorage.getItem("hot_ones_claim_id") || crypto.randomUUID();
    localStorage.setItem("hot_ones_claim_id", claimId);

    let code = generateRoomCode();
    for (let attempt = 0; attempt < 5; attempt++) {
      const { error: insertError } = await supabase.from("question_banks").insert({
        code, name: bankName.trim(), creator_claim_id: claimId,
      });
      if (!insertError) {
        router.push(`/questions/${code}`);
        return;
      }
      if (insertError.code === "23505") { code = generateRoomCode(); continue; }
      setError("Failed to create. Try again.");
      setLoading(false);
      return;
    }
    setError("Failed to generate code. Try again.");
    setLoading(false);
  }

  async function loadBank() {
    const trimmed = loadCode.trim().toUpperCase();
    if (trimmed.length !== 4) { setError("Enter a 4-character code."); return; }
    setLoading(true);
    setError("");

    const { data, error: fetchError } = await supabase
      .from("question_banks").select("code").eq("code", trimmed).maybeSingle();

    if (fetchError || !data) {
      setError("Question bank not found.");
      setLoading(false);
      return;
    }
    router.push(`/questions/${data.code}`);
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 relative">
      <div className="ember-field" />

      <div className="text-center mb-10 animate-fade-in relative z-10">
        <button onClick={() => router.push("/")} className="text-zinc-600 hover:text-white text-[11px] uppercase tracking-[0.2em] font-bold mb-6 block cursor-pointer transition-colors">
          &larr; Back
        </button>
        <h1 className="title-fire text-4xl md:text-6xl font-[family-name:var(--font-archivo)] uppercase italic leading-none tracking-tight">
          Question Banks
        </h1>
        <p className="text-zinc-500 mt-4 text-sm max-w-md mx-auto leading-relaxed font-medium">
          Create a custom set of questions. Reuse them across games with a short code.
        </p>
      </div>

      <div className="w-full max-w-sm space-y-4 relative z-10">
        <div className="animate-slide-up" style={{ animationDelay: '100ms' }}>
          {!showCreate ? (
            <button onClick={() => setShowCreate(true)}
              className="btn-fire w-full text-lg py-4 rounded-xl cursor-pointer tracking-wide">
              Create New Bank
            </button>
          ) : (
            <div className="flex gap-2 animate-fade-in">
              <input type="text" value={bankName} onChange={(e) => setBankName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createBank()} placeholder="Bank name..." autoFocus
                className="input-dark flex-grow p-4 rounded-xl font-semibold" />
              <button onClick={createBank} disabled={loading || !bankName.trim()}
                className="btn-fire px-7 rounded-xl cursor-pointer text-sm">
                {loading ? "..." : "Go"}
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-4 py-1 animate-slide-up" style={{ animationDelay: '200ms' }}>
          <div className="heat-divider flex-grow" />
          <span className="text-zinc-600 text-[10px] uppercase tracking-[0.3em] font-bold">or load existing</span>
          <div className="heat-divider flex-grow" />
        </div>

        <div className="flex gap-2 animate-slide-up" style={{ animationDelay: '300ms' }}>
          <input type="text" value={loadCode} onChange={(e) => setLoadCode(e.target.value.toUpperCase().slice(0, 4))}
            onKeyDown={(e) => e.key === "Enter" && loadBank()} placeholder="ABCD" maxLength={4}
            className="input-dark flex-grow p-4 rounded-xl text-center text-2xl font-black uppercase tracking-[0.3em]" />
          <button onClick={loadBank} disabled={loading || loadCode.length !== 4}
            className="btn-ghost px-7 rounded-xl cursor-pointer text-sm disabled:opacity-20">
            Load
          </button>
        </div>

        {error && <p className="text-red-500 text-sm text-center font-semibold animate-fade-in">{error}</p>}
      </div>
    </div>
  );
}
