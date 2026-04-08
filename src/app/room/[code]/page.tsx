"use client";

import { useEffect, useState, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getCurrentSauce, getHeatColor } from "@/lib/constants";

interface Room {
  id: string;
  code: string;
  host_claim_id: string;
  status: "lobby" | "playing" | "finished";
}

interface Challenger {
  id: string;
  name: string;
  level: number;
  dnf: boolean;
  claim_id: string;
  room_id: string;
}

export default function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const router = useRouter();
  const [room, setRoom] = useState<Room | null>(null);
  const [challengers, setChallengers] = useState<Challenger[]>([]);
  const [myClaimId, setMyClaimId] = useState<string | null>(null);
  const [playerName, setPlayerName] = useState("");
  const [hasJoined, setHasJoined] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [error, setError] = useState("");
  const [recentlyLeveled, setRecentlyLeveled] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const fetchChallengers = useCallback(async (roomId: string) => {
    const { data } = await supabase
      .from("challengers")
      .select("*")
      .eq("room_id", roomId)
      .order("level", { ascending: false });
    if (data) setChallengers(data);
  }, []);

  // Load room and set up realtime
  useEffect(() => {
    const claimId = localStorage.getItem("hot_ones_claim_id");
    setMyClaimId(claimId);

    async function loadRoom() {
      const { data: roomData, error: roomError } = await supabase
        .from("rooms")
        .select("*")
        .eq("code", code.toUpperCase())
        .single();

      if (roomError || !roomData) {
        setError("Room not found.");
        setLoading(false);
        return;
      }

      setRoom(roomData);
      setIsHost(roomData.host_claim_id === claimId);
      await fetchChallengers(roomData.id);

      // Check if this player already joined
      if (claimId) {
        const { data: existing } = await supabase
          .from("challengers")
          .select("id")
          .eq("room_id", roomData.id)
          .eq("claim_id", claimId)
          .single();
        if (existing) setHasJoined(true);
      }

      setLoading(false);

      // Realtime subscriptions
      const channel = supabase.channel(`room-${roomData.id}`);

      channel
        .on("postgres_changes", {
          event: "*",
          schema: "public",
          table: "challengers",
          filter: `room_id=eq.${roomData.id}`,
        }, (payload) => {
          if (payload.eventType === "UPDATE" && payload.new && payload.old) {
            const newLevel = (payload.new as Challenger).level;
            const oldLevel = (payload.old as Challenger).level;
            if (newLevel > oldLevel) {
              triggerFire((payload.new as Challenger).id);
            }
          }
          fetchChallengers(roomData.id);
        })
        .on("postgres_changes", {
          event: "UPDATE",
          schema: "public",
          table: "rooms",
          filter: `id=eq.${roomData.id}`,
        }, (payload) => {
          setRoom(payload.new as Room);
        })
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }

    loadRoom();
  }, [code, fetchChallengers]);

  function triggerFire(id: string) {
    setRecentlyLeveled((prev) => ({ ...prev, [id]: true }));
    setTimeout(() => {
      setRecentlyLeveled((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }, 800);
  }

  async function joinGame() {
    if (!playerName.trim() || !room) return;
    setError("");

    const claimId = myClaimId || crypto.randomUUID();
    if (!myClaimId) {
      localStorage.setItem("hot_ones_claim_id", claimId);
      setMyClaimId(claimId);
    }

    const { error: insertError } = await supabase.from("challengers").insert({
      name: playerName.trim(),
      level: 0,
      dnf: false,
      claim_id: claimId,
      room_id: room.id,
    });

    if (insertError) {
      setError("Failed to join. Try again.");
      return;
    }

    setHasJoined(true);
    await fetchChallengers(room.id);
  }

  async function startGame() {
    if (!room || !isHost) return;
    await supabase.from("rooms").update({ status: "playing" }).eq("id", room.id);
  }

  async function endGame() {
    if (!room || !isHost) return;
    await supabase.from("rooms").update({ status: "finished" }).eq("id", room.id);
  }

  async function updateLevel(id: string, currentLevel: number, change: number, claimId: string) {
    if (claimId !== myClaimId) return;
    const newLevel = Math.max(0, Math.min(10, currentLevel + change));
    await supabase.from("challengers").update({ level: newLevel }).eq("id", id);
  }

  async function toggleDNF(id: string, currentDnf: boolean, claimId: string) {
    if (claimId !== myClaimId) return;
    await supabase.from("challengers").update({ dnf: !currentDnf }).eq("id", id);
  }

  function copyCode() {
    navigator.clipboard.writeText(code.toUpperCase());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-zinc-500 text-sm uppercase tracking-widest">Loading room...</div>
      </div>
    );
  }

  if (error && !room) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-red-500">{error}</p>
        <button onClick={() => router.push("/")} className="text-zinc-400 underline text-sm">
          Back to Home
        </button>
      </div>
    );
  }

  // ─── LOBBY ───
  if (room?.status === "lobby") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6">
        <div className="text-center mb-8 animate-fade-in">
          <h1
            className="text-5xl md:text-7xl font-[family-name:var(--font-archivo)] uppercase text-orange-600 italic leading-none tracking-tight"
            style={{ textShadow: "0 0 30px rgba(255, 68, 0, 0.4)" }}
          >
            Hot Ones
          </h1>
          <p className="text-xs text-zinc-500 tracking-[0.4em] uppercase mt-2 font-bold">
            Waiting Room
          </p>
        </div>

        {/* Room Code Display */}
        <div className="mb-8 text-center animate-slide-up">
          <p className="text-zinc-500 text-[10px] uppercase tracking-widest mb-3 font-bold">Room Code</p>
          <button onClick={copyCode} className="flex gap-2 mx-auto cursor-pointer group">
            {code.toUpperCase().split("").map((char, i) => (
              <div key={i} className="room-code-char group-hover:border-orange-600/50 transition-colors">
                {char}
              </div>
            ))}
          </button>
          <p className="text-zinc-600 text-xs mt-2">
            {copied ? "Copied!" : "Tap to copy"}
          </p>
        </div>

        {/* Join Form (if not yet joined) */}
        {!hasJoined && (
          <div className="w-full max-w-sm mb-8 animate-slide-up">
            <div className="flex gap-2">
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && joinGame()}
                placeholder="Your name..."
                className="flex-grow bg-zinc-900 border border-zinc-800 p-3 px-5 rounded-lg text-white placeholder:text-zinc-600 focus:outline-none focus:border-orange-600 transition-colors"
              />
              <button
                onClick={joinGame}
                disabled={!playerName.trim()}
                className="bg-orange-600 hover:bg-orange-500 disabled:opacity-30 px-6 py-3 rounded-lg font-black uppercase text-black transition-colors cursor-pointer"
              >
                Join
              </button>
            </div>
            {error && <p className="text-red-500 text-sm mt-2 text-center">{error}</p>}
          </div>
        )}

        {/* Player List */}
        <div className="w-full max-w-sm">
          <p className="text-zinc-500 text-[10px] uppercase tracking-widest mb-3 font-bold text-center">
            Players ({challengers.length})
          </p>
          <div className="space-y-2">
            {challengers.map((c, i) => (
              <div
                key={c.id}
                className="flex items-center gap-3 bg-zinc-900/80 border border-zinc-800 rounded-lg px-4 py-3 animate-fade-in"
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <span className="text-orange-600 font-black text-sm w-6">{i + 1}</span>
                <span className="font-bold text-white">{c.name}</span>
                {c.claim_id === myClaimId && (
                  <span className="text-[9px] bg-blue-600 text-white px-1.5 py-0.5 rounded-full font-bold uppercase ml-auto">
                    You
                  </span>
                )}
                {c.claim_id === room.host_claim_id && (
                  <span className="text-[9px] bg-orange-600 text-black px-1.5 py-0.5 rounded-full font-bold uppercase ml-auto">
                    Host
                  </span>
                )}
              </div>
            ))}
            {challengers.length === 0 && (
              <p className="text-zinc-700 text-sm text-center py-4">No players yet...</p>
            )}
          </div>
        </div>

        {/* Host Controls */}
        {isHost && hasJoined && (
          <button
            onClick={startGame}
            disabled={challengers.length < 1}
            className="mt-8 bg-orange-600 hover:bg-orange-500 disabled:opacity-30 text-black font-black uppercase text-lg px-12 py-4 rounded-xl transition-colors cursor-pointer"
          >
            Start Game
          </button>
        )}

        {!isHost && hasJoined && (
          <p className="mt-8 text-zinc-500 text-sm animate-pulse">
            Waiting for host to start...
          </p>
        )}
      </div>
    );
  }

  // ─── GAME (playing or finished) ───
  return (
    <div className="p-4 md:p-10">
      <header className="max-w-5xl mx-auto mb-10 flex flex-col md:flex-row justify-between items-end gap-6">
        <div>
          <h1
            className="text-5xl md:text-7xl font-[family-name:var(--font-archivo)] uppercase text-orange-600 italic leading-none tracking-tight"
            style={{ textShadow: "0 0 20px rgba(255, 68, 0, 0.4)" }}
          >
            Hot Ones
          </h1>
          <div className="flex items-center gap-3 mt-2">
            <p className="text-xs text-zinc-500 tracking-[0.4em] uppercase font-bold">
              Season 28 Live
            </p>
            <span className="text-[9px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded font-bold uppercase tracking-wider">
              {code.toUpperCase()}
            </span>
            {room?.status === "finished" && (
              <span className="text-[9px] bg-red-600/20 text-red-400 px-2 py-0.5 rounded font-bold uppercase">
                Finished
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {isHost && room?.status === "playing" && (
            <button
              onClick={endGame}
              className="text-[10px] bg-zinc-800 hover:bg-red-900 text-zinc-400 hover:text-white px-3 py-2 rounded-lg font-black uppercase transition-colors cursor-pointer"
            >
              End Game
            </button>
          )}
          <button
            onClick={() => router.push("/")}
            className="text-[10px] text-zinc-600 hover:text-white underline uppercase cursor-pointer"
          >
            Leave
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {challengers.map((friend) => {
            const sauce = getCurrentSauce(friend.level);
            const isMine = myClaimId === friend.claim_id;
            const isFinished = room?.status === "finished";

            return (
              <div
                key={friend.id}
                className={`sauce-card p-6 rounded-2xl relative overflow-hidden border-t-4 border-zinc-800 ${
                  friend.dnf ? "dnf-mode" : ""
                } ${friend.level === 10 ? "last-dab" : ""}`}
                style={friend.level > 0 ? { borderTopColor: "#ea580c" } : undefined}
              >
                {recentlyLeveled[friend.id] && <div className="fire-burst" />}

                {!isMine && (
                  <div className="absolute inset-0 z-10 locked-overlay flex flex-col items-center justify-center opacity-0 hover:opacity-100 transition-opacity duration-300">
                    <span className="text-[9px] font-black bg-black px-2 py-1 rounded border border-zinc-700 uppercase">
                      View Only
                    </span>
                  </div>
                )}

                <div className="flex justify-between items-start mb-6">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-2xl font-black uppercase italic">{friend.name}</h2>
                      {isMine && (
                        <span className="text-[9px] bg-blue-600 text-white px-1.5 py-0.5 rounded-full font-bold uppercase">
                          You
                        </span>
                      )}
                    </div>
                    <div className="flex flex-col mt-1">
                      <span className="text-orange-500 text-[10px] font-black uppercase tracking-widest">
                        {sauce.name}
                      </span>
                      {friend.level > 0 && (
                        <span className="text-zinc-500 text-[10px]">{sauce.shu} SHU</span>
                      )}
                    </div>
                  </div>

                  {isMine && !isFinished && (
                    <button
                      onClick={() => toggleDNF(friend.id, friend.dnf, friend.claim_id)}
                      className={`text-[10px] font-black uppercase px-3 py-1 rounded transition relative z-20 cursor-pointer ${
                        friend.dnf
                          ? "bg-red-600 text-white"
                          : "bg-zinc-800 text-zinc-400 hover:bg-red-900"
                      }`}
                    >
                      {friend.dnf ? "Back in?" : "DNF"}
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-6">
                  <div className="flex-grow flex gap-1 h-5">
                    {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                      <div
                        key={n}
                        className={`flex-grow rounded-sm transition-all duration-700 ${
                          n <= friend.level ? getHeatColor(n) : "bg-zinc-800/50"
                        }`}
                      />
                    ))}
                  </div>

                  {isMine && !isFinished ? (
                    <div className="flex items-center bg-black rounded-xl p-1 border border-zinc-800 relative z-20">
                      <button
                        onClick={() => updateLevel(friend.id, friend.level, -1, friend.claim_id)}
                        className="w-8 h-8 flex items-center justify-center hover:bg-zinc-900 rounded-lg text-xl cursor-pointer"
                      >
                        -
                      </button>
                      <span className="w-8 text-center font-black text-xl text-orange-600">
                        {friend.level}
                      </span>
                      <button
                        onClick={() => updateLevel(friend.id, friend.level, 1, friend.claim_id)}
                        disabled={friend.dnf}
                        className="w-8 h-8 flex items-center justify-center bg-orange-600 hover:bg-orange-500 rounded-lg text-black font-black text-xl disabled:opacity-20 cursor-pointer"
                      >
                        +
                      </button>
                    </div>
                  ) : (
                    <div className="w-8 h-8 flex items-center justify-center font-black text-xl text-zinc-600">
                      {friend.level}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
