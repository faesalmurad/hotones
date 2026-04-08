"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { generateRoomCode } from "@/lib/constants";

export default function Home() {
  const router = useRouter();
  const [joinCode, setJoinCode] = useState("");
  const [hostName, setHostName] = useState("");
  const [bankCode, setBankCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  async function createRoom() {
    if (!hostName.trim()) { setError("Enter your name first."); return; }
    setLoading(true);
    setError("");

    let questionBankId: string | null = null;
    if (bankCode.trim().length === 4) {
      const { data: bankData } = await supabase
        .from("question_banks").select("id").eq("code", bankCode.trim().toUpperCase()).maybeSingle();
      if (!bankData) {
        setError("Question bank not found. Check the code or leave it blank.");
        setLoading(false);
        return;
      }
      questionBankId = bankData.id;
    }

    const hostClaimId = crypto.randomUUID();
    let code = generateRoomCode();

    for (let attempt = 0; attempt < 5; attempt++) {
      const { data: roomData, error: insertError } = await supabase
        .from("rooms")
        .insert({ code, host_claim_id: hostClaimId, status: "lobby", question_bank_id: questionBankId })
        .select("id")
        .single();

      if (!insertError && roomData) {
        await supabase.from("challengers").insert({
          name: hostName.trim(), level: 0, dnf: false, claim_id: hostClaimId, room_id: roomData.id,
        });
        localStorage.setItem("hot_ones_claim_id", hostClaimId);
        router.push(`/room/${code}`);
        return;
      }

      if (insertError?.code === "23505") { code = generateRoomCode(); continue; }
      setError("Failed to create room. Try again.");
      setLoading(false);
      return;
    }

    setError("Failed to generate unique code. Try again.");
    setLoading(false);
  }

  async function joinRoom() {
    const trimmed = joinCode.trim().toUpperCase();
    if (trimmed.length !== 4) { setError("Enter a 4-character room code."); return; }
    setLoading(true);
    setError("");

    const { data, error: fetchError } = await supabase
      .from("rooms").select("id, code, status").eq("code", trimmed).maybeSingle();

    if (fetchError) { setError(`Connection error: ${fetchError.message}`); setLoading(false); return; }
    if (!data) { setError("Room not found. Check your code."); setLoading(false); return; }
    if (data.status === "finished") { setError("That game has already ended."); setLoading(false); return; }

    router.push(`/room/${data.code}`);
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 relative">
      {/* Floating embers */}
      <div className="ember-field" />

      {/* Hero */}
      <div className="text-center mb-14 animate-fade-in relative z-10">
        <h1 className="title-fire text-7xl md:text-9xl font-[family-name:var(--font-archivo)] uppercase italic leading-none tracking-tight">
          Hot Ones
        </h1>
        <div className="flex justify-center mt-4">
          <div className="live-badge">
            <span className="live-dot" />
            <span className="text-[10px] text-red-400/80 tracking-[0.4em] uppercase font-bold">Live</span>
          </div>
        </div>
        <p className="text-zinc-500 mt-5 text-sm max-w-sm mx-auto leading-relaxed font-medium">
          Create a room, share the code with friends, and see who can handle the heat.
        </p>
      </div>

      {/* Action area */}
      <div className="w-full max-w-sm space-y-4 relative z-10" style={{ animationDelay: '150ms' }}>
        <div className="animate-slide-up" style={{ animationDelay: '100ms' }}>
          {!showCreate ? (
            <button onClick={() => setShowCreate(true)}
              className="btn-fire w-full text-lg py-4 rounded-xl cursor-pointer tracking-wide">
              Create Room
            </button>
          ) : (
            <div className="space-y-3 animate-fade-in">
              <div className="flex gap-2">
                <input type="text" value={hostName} onChange={(e) => setHostName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && createRoom()} placeholder="Your name..." autoFocus
                  className="input-dark flex-grow p-4 rounded-xl font-semibold" />
                <button onClick={createRoom} disabled={loading || !hostName.trim()}
                  className="btn-fire px-7 rounded-xl cursor-pointer text-sm">
                  {loading ? "..." : "Go"}
                </button>
              </div>
              <input type="text" value={bankCode} onChange={(e) => setBankCode(e.target.value.toUpperCase().slice(0, 4))}
                placeholder="Question bank code (optional)" maxLength={4}
                className="input-dark w-full p-3 rounded-lg text-center text-sm tracking-wider uppercase font-medium" />
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="flex items-center gap-4 py-1 animate-slide-up" style={{ animationDelay: '200ms' }}>
          <div className="heat-divider flex-grow" />
          <span className="text-zinc-600 text-[10px] uppercase tracking-[0.3em] font-bold">or join</span>
          <div className="heat-divider flex-grow" />
        </div>

        {/* Join */}
        <div className="flex gap-2 animate-slide-up" style={{ animationDelay: '300ms' }}>
          <input type="text" value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 4))}
            onKeyDown={(e) => e.key === "Enter" && joinRoom()} placeholder="ABCD" maxLength={4}
            className="input-dark flex-grow p-4 rounded-xl text-center text-2xl font-black uppercase tracking-[0.3em]" />
          <button onClick={joinRoom} disabled={loading || joinCode.length !== 4}
            className="btn-ghost px-7 rounded-xl cursor-pointer text-sm disabled:opacity-20">
            Join
          </button>
        </div>

        {error && <p className="text-red-500 text-sm text-center font-semibold animate-fade-in">{error}</p>}

        <div className="pt-6 text-center animate-slide-up" style={{ animationDelay: '400ms' }}>
          <button onClick={() => router.push("/questions")}
            className="text-zinc-600 hover:text-orange-500 text-[11px] uppercase tracking-[0.2em] font-bold transition-colors cursor-pointer">
            Create Custom Questions
          </button>
        </div>
      </div>
    </div>
  );
}
