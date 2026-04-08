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
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <div className="text-center mb-10 animate-fade-in">
        <button onClick={() => router.push("/")} className="text-zinc-600 hover:text-white text-xs uppercase tracking-widest mb-6 block cursor-pointer">
          &larr; Back
        </button>
        <h1 className="text-4xl md:text-6xl font-[family-name:var(--font-archivo)] uppercase text-orange-600 italic leading-none tracking-tight"
          style={{ textShadow: "0 0 30px rgba(255, 68, 0, 0.4)" }}>
          Question Banks
        </h1>
        <p className="text-zinc-400 mt-3 text-sm max-w-md mx-auto">
          Create a custom set of questions. Reuse them across games with a short code.
        </p>
      </div>

      <div className="w-full max-w-sm space-y-4 animate-slide-up">
        {!showCreate ? (
          <button onClick={() => setShowCreate(true)}
            className="w-full bg-orange-600 hover:bg-orange-500 text-black font-black uppercase text-lg py-4 rounded-xl transition-colors cursor-pointer">
            Create New Bank
          </button>
        ) : (
          <div className="flex gap-2">
            <input type="text" value={bankName} onChange={(e) => setBankName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createBank()} placeholder="Bank name..." autoFocus
              className="flex-grow bg-zinc-900 border border-zinc-800 p-4 rounded-xl text-white placeholder:text-zinc-600 focus:outline-none focus:border-orange-600 transition-colors" />
            <button onClick={createBank} disabled={loading || !bankName.trim()}
              className="bg-orange-600 hover:bg-orange-500 disabled:opacity-30 text-black font-black uppercase px-6 rounded-xl transition-colors cursor-pointer">
              {loading ? "..." : "Go"}
            </button>
          </div>
        )}

        <div className="flex items-center gap-3 text-zinc-600 text-xs uppercase tracking-widest">
          <div className="flex-grow h-px bg-zinc-800" /><span>or load existing</span><div className="flex-grow h-px bg-zinc-800" />
        </div>

        <div className="flex gap-2">
          <input type="text" value={loadCode} onChange={(e) => setLoadCode(e.target.value.toUpperCase().slice(0, 4))}
            onKeyDown={(e) => e.key === "Enter" && loadBank()} placeholder="ABCD" maxLength={4}
            className="flex-grow bg-zinc-900 border border-zinc-800 p-4 rounded-xl text-center text-2xl font-black uppercase tracking-[0.3em] text-white placeholder:text-zinc-700 focus:outline-none focus:border-orange-600 transition-colors" />
          <button onClick={loadBank} disabled={loading || loadCode.length !== 4}
            className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 text-white font-black uppercase px-6 rounded-xl transition-colors cursor-pointer">
            Load
          </button>
        </div>

        {error && <p className="text-red-500 text-sm text-center">{error}</p>}
      </div>
    </div>
  );
}
