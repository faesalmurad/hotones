"use client";

import { useEffect, useState, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { SAUCES, getCurrentSauce, getHeatColor } from "@/lib/constants";
import { getQuestionForRound, getHotSeatIndex, getTypeLabel, getTypeColor, type Question } from "@/lib/questions";

interface Room {
  id: string;
  code: string;
  host_claim_id: string;
  status: "lobby" | "playing" | "finished";
  current_round: number;
  question_bank_id: string | null;
  question_revealed: boolean;
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
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [roundTransition, setRoundTransition] = useState(false);
  const [recentlyLeveled, setRecentlyLeveled] = useState<Record<string, boolean>>({});
  const [customQuestions, setCustomQuestions] = useState<Question[]>([]);

  const fetchChallengers = useCallback(async (roomId: string) => {
    const { data } = await supabase
      .from("challengers")
      .select("*")
      .eq("room_id", roomId)
      .order("level", { ascending: false });
    if (data) setChallengers(data);
  }, []);

  useEffect(() => {
    const claimId = localStorage.getItem("hot_ones_claim_id");
    setMyClaimId(claimId);

    async function loadRoom() {
      const { data: roomData, error: roomError } = await supabase
        .from("rooms").select("*").eq("code", code.toUpperCase()).maybeSingle();

      if (roomError || !roomData) { setError("Room not found."); setLoading(false); return; }

      setRoom(roomData);
      setIsHost(roomData.host_claim_id === claimId);
      await fetchChallengers(roomData.id);

      if (roomData.question_bank_id) {
        const { data: cqs } = await supabase
          .from("custom_questions").select("type, text")
          .eq("bank_id", roomData.question_bank_id)
          .order("sort_order", { ascending: true });
        if (cqs && cqs.length > 0) {
          setCustomQuestions(cqs.map((q) => ({ type: q.type, text: q.text })) as Question[]);
        }
      }

      if (claimId) {
        const { data: existing } = await supabase
          .from("challengers").select("id").eq("room_id", roomData.id).eq("claim_id", claimId).maybeSingle();
        if (existing) setHasJoined(true);
      }

      setLoading(false);

      const channel = supabase.channel(`room-${roomData.id}`);
      channel
        .on("postgres_changes", { event: "*", schema: "public", table: "challengers", filter: `room_id=eq.${roomData.id}` }, (payload) => {
          if (payload.eventType === "UPDATE" && payload.new && payload.old) {
            if ((payload.new as Challenger).level > (payload.old as Challenger).level) {
              triggerFire((payload.new as Challenger).id);
            }
          }
          fetchChallengers(roomData.id);
        })
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "rooms", filter: `id=eq.${roomData.id}` }, (payload) => {
          const newRoom = payload.new as Room;
          setRoom((prev) => {
            if (prev && newRoom.current_round > prev.current_round) {
              setRoundTransition(true);
              setTimeout(() => setRoundTransition(false), 2500);
            }
            return newRoom;
          });
        })
        .subscribe();

      return () => { supabase.removeChannel(channel); };
    }

    loadRoom();
  }, [code, fetchChallengers]);

  function triggerFire(id: string) {
    setRecentlyLeveled((prev) => ({ ...prev, [id]: true }));
    setTimeout(() => { setRecentlyLeveled((prev) => { const next = { ...prev }; delete next[id]; return next; }); }, 800);
  }

  async function joinGame() {
    if (!playerName.trim() || !room) return;
    setError("");
    const claimId = myClaimId || crypto.randomUUID();
    if (!myClaimId) { localStorage.setItem("hot_ones_claim_id", claimId); setMyClaimId(claimId); }
    const { error: insertError } = await supabase.from("challengers").insert({
      name: playerName.trim(), level: 0, dnf: false, claim_id: claimId, room_id: room.id,
    });
    if (insertError) { setError("Failed to join."); return; }
    setHasJoined(true);
    await fetchChallengers(room.id);
  }

  async function startGame() {
    if (!room || !isHost) return;
    await supabase.from("rooms").update({ status: "playing", current_round: 1, question_revealed: false }).eq("id", room.id);
  }

  async function revealQuestion() {
    if (!room || !isHost) return;
    await supabase.from("rooms").update({ question_revealed: true }).eq("id", room.id);
  }

  async function nextRound() {
    if (!room || !isHost) return;
    if (room.current_round >= 10) {
      await supabase.from("rooms").update({ status: "finished" }).eq("id", room.id);
    } else {
      await supabase.from("rooms").update({ current_round: room.current_round + 1, question_revealed: false }).eq("id", room.id);
    }
  }

  async function endGame() {
    if (!room || !isHost) return;
    await supabase.from("rooms").update({ status: "finished" }).eq("id", room.id);
  }

  async function markComplete(challengerId: string, claimId: string) {
    if (claimId !== myClaimId || !room) return;
    await supabase.from("challengers").update({ level: room.current_round }).eq("id", challengerId);
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

  // ─── LOADING ───
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-zinc-500 text-sm uppercase tracking-widest animate-pulse">Loading room...</div>
      </div>
    );
  }

  // ─── ERROR ───
  if (error && !room) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-red-500">{error}</p>
        <button onClick={() => router.push("/")} className="text-zinc-400 underline text-sm cursor-pointer">Back to Home</button>
      </div>
    );
  }

  // ─── LOBBY ───
  if (room?.status === "lobby") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6">
        <div className="text-center mb-8 animate-fade-in">
          <h1 className="text-5xl md:text-7xl font-[family-name:var(--font-archivo)] uppercase text-orange-600 italic leading-none tracking-tight" style={{ textShadow: "0 0 30px rgba(255, 68, 0, 0.4)" }}>
            Hot Ones
          </h1>
          <p className="text-xs text-zinc-500 tracking-[0.4em] uppercase mt-2 font-bold">Waiting Room</p>
        </div>

        <div className="mb-8 text-center animate-slide-up">
          <p className="text-zinc-500 text-[10px] uppercase tracking-widest mb-3 font-bold">Room Code</p>
          <button onClick={copyCode} className="flex gap-2 mx-auto cursor-pointer group">
            {code.toUpperCase().split("").map((char, i) => (
              <div key={i} className="room-code-char group-hover:border-orange-600/50 transition-colors">{char}</div>
            ))}
          </button>
          <p className="text-zinc-600 text-xs mt-2">{copied ? "Copied!" : "Tap to copy"}</p>
        </div>

        {!hasJoined && (
          <div className="w-full max-w-sm mb-8 animate-slide-up">
            <div className="flex gap-2">
              <input type="text" value={playerName} onChange={(e) => setPlayerName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && joinGame()} placeholder="Your name..."
                className="flex-grow bg-zinc-900 border border-zinc-800 p-3 px-5 rounded-lg text-white placeholder:text-zinc-600 focus:outline-none focus:border-orange-600 transition-colors" />
              <button onClick={joinGame} disabled={!playerName.trim()}
                className="bg-orange-600 hover:bg-orange-500 disabled:opacity-30 px-6 py-3 rounded-lg font-black uppercase text-black transition-colors cursor-pointer">Join</button>
            </div>
            {error && <p className="text-red-500 text-sm mt-2 text-center">{error}</p>}
          </div>
        )}

        <div className="w-full max-w-sm">
          <p className="text-zinc-500 text-[10px] uppercase tracking-widest mb-3 font-bold text-center">Players ({challengers.length})</p>
          <div className="space-y-2">
            {challengers.map((c, i) => (
              <div key={c.id} className="flex items-center gap-3 bg-zinc-900/80 border border-zinc-800 rounded-lg px-4 py-3 animate-fade-in" style={{ animationDelay: `${i * 100}ms` }}>
                <span className="text-orange-600 font-black text-sm w-6">{i + 1}</span>
                <span className="font-bold text-white">{c.name}</span>
                <div className="ml-auto flex gap-1">
                  {c.claim_id === myClaimId && <span className="text-[9px] bg-blue-600 text-white px-1.5 py-0.5 rounded-full font-bold uppercase">You</span>}
                  {c.claim_id === room!.host_claim_id && <span className="text-[9px] bg-orange-600 text-black px-1.5 py-0.5 rounded-full font-bold uppercase">Host</span>}
                </div>
              </div>
            ))}
            {challengers.length === 0 && <p className="text-zinc-700 text-sm text-center py-4">No players yet...</p>}
          </div>
        </div>

        {customQuestions.length > 0 && (
          <p className="mt-4 text-zinc-600 text-[10px] uppercase tracking-widest text-center">
            Custom questions loaded ({customQuestions.length})
          </p>
        )}

        {isHost && (
          <button onClick={startGame} disabled={challengers.length < 2}
            className="mt-6 bg-orange-600 hover:bg-orange-500 disabled:opacity-30 text-black font-black uppercase text-lg px-12 py-4 rounded-xl transition-colors cursor-pointer">
            {challengers.length < 2 ? "Waiting for players..." : "Start Game"}
          </button>
        )}
        {!isHost && hasJoined && <p className="mt-8 text-zinc-500 text-sm animate-pulse">Waiting for host to start...</p>}
      </div>
    );
  }

  // ─── FINISHED ───
  if (room?.status === "finished") {
    const sorted = [...challengers].sort((a, b) => {
      if (a.dnf && !b.dnf) return 1;
      if (!a.dnf && b.dnf) return -1;
      return b.level - a.level;
    });
    const winner = sorted[0];

    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6">
        <div className="text-center mb-10 animate-fade-in">
          <p className="text-zinc-500 text-[10px] uppercase tracking-widest mb-2 font-bold">Game Over</p>
          <h1 className="text-5xl md:text-7xl font-[family-name:var(--font-archivo)] uppercase text-orange-600 italic leading-none tracking-tight" style={{ textShadow: "0 0 30px rgba(255, 68, 0, 0.4)" }}>
            Results
          </h1>
        </div>

        {winner && !winner.dnf && winner.level >= 10 && (
          <div className="mb-8 text-center animate-slide-up">
            <p className="text-4xl mb-2">&#x1F525;</p>
            <p className="text-2xl font-black uppercase italic text-white">{winner.name}</p>
            <p className="text-purple-400 text-sm font-bold uppercase tracking-widest">Conquered The Last Dab</p>
          </div>
        )}

        <div className="w-full max-w-md space-y-3">
          {sorted.map((c, i) => {
            const sauce = getCurrentSauce(c.level);
            const isWinner = i === 0 && !c.dnf;
            return (
              <div key={c.id}
                className={`flex items-center gap-4 p-4 rounded-xl border animate-slide-up ${
                  isWinner ? "bg-orange-600/10 border-orange-600/30" : c.dnf ? "bg-zinc-900/50 border-zinc-800 opacity-50" : "bg-zinc-900/80 border-zinc-800"
                }`}
                style={{ animationDelay: `${i * 150}ms` }}>
                <span className={`text-2xl font-black w-8 ${isWinner ? "text-orange-600" : "text-zinc-600"}`}>{i + 1}</span>
                <div className="flex-grow">
                  <div className="flex items-center gap-2">
                    <span className="font-black text-lg uppercase italic">{c.name}</span>
                    {c.claim_id === myClaimId && <span className="text-[9px] bg-blue-600 text-white px-1.5 py-0.5 rounded-full font-bold uppercase">You</span>}
                  </div>
                  <span className="text-zinc-500 text-xs">{c.dnf ? "Tapped out" : sauce.name}</span>
                </div>
                <div className="text-right">
                  <div className={`text-2xl font-black ${c.dnf ? "text-red-500" : "text-orange-600"}`}>
                    {c.dnf ? "DNF" : c.level}
                  </div>
                  {!c.dnf && <div className="text-zinc-600 text-[10px]">/10</div>}
                </div>
              </div>
            );
          })}
        </div>

        <button onClick={() => router.push("/")}
          className="mt-10 bg-zinc-800 hover:bg-zinc-700 text-white font-black uppercase px-8 py-3 rounded-xl transition-colors cursor-pointer">
          Play Again
        </button>
      </div>
    );
  }

  // ─── PLAYING ───
  const round = room!.current_round;
  const sauce = SAUCES[round - 1];
  const question = getQuestionForRound(round, code, customQuestions.length > 0 ? customQuestions : undefined);
  const activePlayers = challengers.filter((c) => !c.dnf);
  const hotSeatIdx = getHotSeatIndex(round, code, activePlayers.length);
  const hotSeatPlayer = activePlayers[hotSeatIdx];
  const questionText = question.type === "roast" && hotSeatPlayer
    ? question.text.replace("{player}", hotSeatPlayer.name)
    : question.text;
  const me = challengers.find((c) => c.claim_id === myClaimId);
  const iCompletedRound = me ? me.level >= round : false;
  const questionRevealed = room!.question_revealed;

  // Player status strip (reused)
  const playerStrip = (
    <div className="flex flex-wrap justify-center gap-2 mt-4">
      {challengers.map((c) => (
        <div key={c.id} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${
          c.dnf ? "bg-red-900/30 text-red-400" : c.level >= round ? "bg-green-900/30 text-green-400" : "bg-zinc-800 text-zinc-500"
        }`}>
          <span>{c.name}</span>
          {c.dnf ? <span>&#x1F480;</span> : c.level >= round ? <span>&#x2713;</span> : <span>&#x1F525;</span>}
        </div>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col">
      {/* Round transition overlay */}
      {roundTransition && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center animate-fade-in">
          <p className="text-zinc-500 text-[10px] uppercase tracking-widest mb-4 font-bold">Round {round} of 10</p>
          <h2 className="text-4xl md:text-6xl font-[family-name:var(--font-archivo)] uppercase text-orange-600 italic text-center leading-tight px-4"
            style={{ textShadow: "0 0 30px rgba(255, 68, 0, 0.5)" }}>
            {sauce.name}
          </h2>
          <p className="text-zinc-400 mt-3 text-lg">{sauce.shu} SHU</p>
          <div className="mt-8 flex gap-1">
            {Array.from({ length: 10 }, (_, i) => (
              <div key={i} className={`w-6 h-2 rounded-full transition-all duration-500 ${i < round ? getHeatColor(i + 1) : "bg-zinc-800"}`} />
            ))}
          </div>
        </div>
      )}

      {/* Top bar */}
      <header className="flex items-center justify-between p-4 md:px-8">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-[family-name:var(--font-archivo)] uppercase text-orange-600 italic" style={{ textShadow: "0 0 10px rgba(255, 68, 0, 0.3)" }}>
            Hot Ones
          </h1>
          <span className="text-[9px] bg-zinc-800 text-zinc-500 px-2 py-0.5 rounded font-bold uppercase">{code.toUpperCase()}</span>
        </div>
        <div className="flex items-center gap-3">
          {isHost && (
            <button onClick={endGame} className="text-[10px] bg-zinc-800 hover:bg-red-900 text-zinc-500 hover:text-white px-3 py-1.5 rounded font-bold uppercase transition-colors cursor-pointer">
              End
            </button>
          )}
        </div>
      </header>

      {/* Main game area */}
      <main className="flex-grow flex flex-col items-center justify-center p-4 md:p-8 max-w-2xl mx-auto w-full">
        {/* Round + Sauce */}
        <div className="text-center mb-6">
          <p className="text-zinc-500 text-[10px] uppercase tracking-widest font-bold">Round {round} of 10</p>
          <h2 className="text-3xl md:text-5xl font-[family-name:var(--font-archivo)] uppercase text-orange-600 italic mt-1"
            style={{ textShadow: "0 0 20px rgba(255, 68, 0, 0.4)" }}>
            {sauce.name}
          </h2>
          <p className="text-zinc-500 text-sm mt-1">{sauce.shu} SHU</p>
        </div>

        {/* Heat progress */}
        <div className="flex gap-1.5 mb-8 w-full max-w-xs">
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} className={`flex-grow h-2 rounded-full transition-all duration-700 ${i < round ? getHeatColor(i + 1) : "bg-zinc-800/50"}`} />
          ))}
        </div>

        {/* Phase 1: Eat Your Wing */}
        {!questionRevealed ? (
          <div className="w-full">
            <div className="sauce-card rounded-2xl p-6 md:p-8 text-center border-t-4 border-orange-600">
              <p className="text-3xl mb-3">&#x1F357;</p>
              <p className="text-xl font-black uppercase italic text-white">Eat Your Wing!</p>
              <p className="text-zinc-500 text-sm mt-2">Apply {sauce.name} and eat together</p>

              {me && !me.dnf && (
                <div className="mt-6 flex flex-col items-center gap-3">
                  {!iCompletedRound ? (
                    <button onClick={() => markComplete(me.id, me.claim_id)}
                      className="bg-orange-600 hover:bg-orange-500 text-black font-black uppercase px-8 py-3 rounded-xl transition-colors cursor-pointer text-sm">
                      I Ate It &#x1F525;
                    </button>
                  ) : (
                    <span className="text-green-500 font-bold text-sm uppercase">&#x2713; Done</span>
                  )}
                  <button onClick={() => toggleDNF(me.id, me.dnf, me.claim_id)}
                    className="text-zinc-600 hover:text-red-500 text-xs font-bold uppercase transition-colors cursor-pointer py-1 px-3">
                    I Tap Out
                  </button>
                </div>
              )}
              {me?.dnf && (
                <div className="mt-6 flex flex-col items-center gap-2">
                  <span className="text-red-500 font-bold text-sm uppercase">You tapped out</span>
                  <button onClick={() => toggleDNF(me.id, me.dnf, me.claim_id)}
                    className="text-zinc-600 hover:text-green-500 text-xs font-bold uppercase transition-colors cursor-pointer py-1 px-3">
                    Get Back In?
                  </button>
                </div>
              )}

              {isHost && (
                <button onClick={revealQuestion}
                  className="mt-6 bg-zinc-800 hover:bg-zinc-700 text-white font-bold uppercase px-6 py-2.5 rounded-lg transition-colors cursor-pointer text-xs">
                  Reveal Question
                </button>
              )}
              {!isHost && (
                <p className="mt-6 text-zinc-600 text-[10px] uppercase tracking-widest animate-pulse">
                  Host will reveal the question...
                </p>
              )}
            </div>
            {playerStrip}
          </div>
        ) : (
          /* Phase 2: Question Revealed */
          <div className="w-full animate-slide-up">
            <div className="sauce-card rounded-2xl p-6 md:p-8 text-center border-t-4" style={{
              borderTopColor: question.type === "roast" ? "#ef4444" : question.type === "wouldyourather" ? "#a855f7" : question.type === "challenge" ? "#eab308" : "#3b82f6"
            }}>
              <p className={`text-[10px] uppercase tracking-widest font-black mb-4 ${getTypeColor(question.type)}`}>
                {getTypeLabel(question.type)}
              </p>
              <p className="text-xl md:text-2xl font-bold text-white leading-relaxed">
                {questionText}
              </p>
              {question.type === "truth" && (
                <p className="text-zinc-500 text-xs mt-4 italic">Answer honestly... or take a dab of {sauce.name}</p>
              )}

              {/* DNF option still available during question */}
              {me && !me.dnf && !iCompletedRound && (
                <div className="mt-5 flex flex-col items-center gap-2">
                  <button onClick={() => markComplete(me.id, me.claim_id)}
                    className="bg-orange-600/20 hover:bg-orange-600/30 text-orange-500 font-bold uppercase px-6 py-2 rounded-lg transition-colors cursor-pointer text-xs border border-orange-600/20">
                    I Ate It &#x1F525;
                  </button>
                </div>
              )}
            </div>

            {playerStrip}

            {/* Host: next round */}
            {isHost && (
              <div className="flex justify-center mt-6">
                <button onClick={nextRound}
                  className="bg-orange-600 hover:bg-orange-500 text-black font-black uppercase px-10 py-3 rounded-xl transition-colors cursor-pointer">
                  {round >= 10 ? "Finish Game" : "Next Round"}
                </button>
              </div>
            )}
            {!isHost && (
              <p className="text-center mt-6 text-zinc-600 text-[10px] uppercase tracking-widest animate-pulse">
                Host will advance to the next round...
              </p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
