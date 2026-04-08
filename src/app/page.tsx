"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { generateRoomCode } from "@/lib/constants";

export default function Home() {
  const router = useRouter();
  const [joinCode, setJoinCode] = useState("");
  const [hostName, setHostName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  async function createRoom() {
    if (!hostName.trim()) {
      setError("Enter your name first.");
      return;
    }

    setLoading(true);
    setError("");

    const hostClaimId = crypto.randomUUID();
    let code = generateRoomCode();

    for (let attempt = 0; attempt < 5; attempt++) {
      const { data: roomData, error: insertError } = await supabase
        .from("rooms")
        .insert({ code, host_claim_id: hostClaimId, status: "lobby" })
        .select("id")
        .single();

      if (!insertError && roomData) {
        // Auto-join the host as a player
        await supabase.from("challengers").insert({
          name: hostName.trim(),
          level: 0,
          dnf: false,
          claim_id: hostClaimId,
          room_id: roomData.id,
        });

        localStorage.setItem("hot_ones_claim_id", hostClaimId);
        router.push(`/room/${code}`);
        return;
      }

      if (insertError?.code === "23505") {
        code = generateRoomCode();
        continue;
      }

      setError("Failed to create room. Try again.");
      setLoading(false);
      return;
    }

    setError("Failed to generate unique code. Try again.");
    setLoading(false);
  }

  async function joinRoom() {
    const trimmed = joinCode.trim().toUpperCase();
    if (trimmed.length !== 4) {
      setError("Enter a 4-character room code.");
      return;
    }

    setLoading(true);
    setError("");

    const { data, error: fetchError } = await supabase
      .from("rooms")
      .select("id, code, status")
      .eq("code", trimmed)
      .maybeSingle();

    if (fetchError) {
      setError(`Connection error: ${fetchError.message}`);
      setLoading(false);
      return;
    }

    if (!data) {
      setError("Room not found. Check your code.");
      setLoading(false);
      return;
    }

    if (data.status === "finished") {
      setError("That game has already ended.");
      setLoading(false);
      return;
    }

    router.push(`/room/${data.code}`);
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <div className="text-center mb-12 animate-fade-in">
        <h1
          className="text-6xl md:text-8xl font-[family-name:var(--font-archivo)] uppercase text-orange-600 italic leading-none tracking-tight"
          style={{ textShadow: "0 0 30px rgba(255, 68, 0, 0.4)" }}
        >
          Hot Ones
        </h1>
        <p className="text-xs text-zinc-500 tracking-[0.5em] uppercase mt-3 font-bold">
          Season 28 Live
        </p>
        <p className="text-zinc-400 mt-4 text-sm max-w-md mx-auto">
          Create a room, share the code with friends, and see who can handle the heat.
        </p>
      </div>

      <div className="w-full max-w-sm space-y-4 animate-slide-up">
        {!showCreate ? (
          <button
            onClick={() => setShowCreate(true)}
            className="w-full bg-orange-600 hover:bg-orange-500 text-black font-black uppercase text-lg py-4 rounded-xl transition-colors cursor-pointer"
          >
            Create Room
          </button>
        ) : (
          <div className="flex gap-2">
            <input
              type="text"
              value={hostName}
              onChange={(e) => setHostName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createRoom()}
              placeholder="Your name..."
              autoFocus
              className="flex-grow bg-zinc-900 border border-zinc-800 p-4 rounded-xl text-white placeholder:text-zinc-600 focus:outline-none focus:border-orange-600 transition-colors"
            />
            <button
              onClick={createRoom}
              disabled={loading || !hostName.trim()}
              className="bg-orange-600 hover:bg-orange-500 disabled:opacity-30 text-black font-black uppercase px-6 rounded-xl transition-colors cursor-pointer"
            >
              {loading ? "..." : "Go"}
            </button>
          </div>
        )}

        <div className="flex items-center gap-3 text-zinc-600 text-xs uppercase tracking-widest">
          <div className="flex-grow h-px bg-zinc-800" />
          <span>or join</span>
          <div className="flex-grow h-px bg-zinc-800" />
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 4))}
            onKeyDown={(e) => e.key === "Enter" && joinRoom()}
            placeholder="ABCD"
            maxLength={4}
            className="flex-grow bg-zinc-900 border border-zinc-800 p-4 rounded-xl text-center text-2xl font-black uppercase tracking-[0.3em] text-white placeholder:text-zinc-700 focus:outline-none focus:border-orange-600 transition-colors"
          />
          <button
            onClick={joinRoom}
            disabled={loading || joinCode.length !== 4}
            className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 text-white font-black uppercase px-6 rounded-xl transition-colors cursor-pointer"
          >
            Join
          </button>
        </div>

        {error && (
          <p className="text-red-500 text-sm text-center">{error}</p>
        )}
      </div>
    </div>
  );
}
