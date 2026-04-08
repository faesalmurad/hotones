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

  // Heat intensity helper — returns CSS for escalating intensity
  function getHeatIntensity(round: number) {
    if (round <= 3) return { glow: 'rgba(251, 191, 36, 0.3)', color: '#fbbf24' };
    if (round <= 6) return { glow: 'rgba(249, 115, 22, 0.4)', color: '#f97316' };
    if (round <= 9) return { glow: 'rgba(239, 68, 68, 0.4)', color: '#ef4444' };
    return { glow: 'rgba(168, 85, 247, 0.5)', color: '#a855f7' };
  }

  // ─── LOADING ───
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="ember-field" />
        <div className="relative z-10 text-center">
          <div className="text-zinc-600 text-[10px] uppercase tracking-[0.4em] font-bold animate-pulse">Loading room...</div>
        </div>
      </div>
    );
  }

  // ─── ERROR ───
  if (error && !room) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-red-500 font-semibold">{error}</p>
        <button onClick={() => router.push("/")} className="text-zinc-500 hover:text-white text-sm transition-colors cursor-pointer">Back to Home</button>
      </div>
    );
  }

  // ─── LOBBY ───
  if (room?.status === "lobby") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 relative">
        <div className="ember-field" />

        <div className="text-center mb-8 animate-fade-in relative z-10">
          <h1 className="title-fire text-5xl md:text-7xl font-[family-name:var(--font-archivo)] uppercase italic leading-none tracking-tight">
            Hot Ones
          </h1>
          <div className="flex justify-center mt-3">
            <div className="live-badge" style={{ background: 'rgba(249, 115, 22, 0.06)', borderColor: 'rgba(249, 115, 22, 0.12)' }}>
              <span className="text-[10px] text-orange-500/70 tracking-[0.3em] uppercase font-bold">Waiting Room</span>
            </div>
          </div>
        </div>

        <div className="mb-8 text-center animate-slide-up relative z-10">
          <p className="text-zinc-600 text-[9px] uppercase tracking-[0.4em] mb-3 font-bold">Room Code</p>
          <button onClick={copyCode} className="flex gap-2 mx-auto cursor-pointer group">
            {code.toUpperCase().split("").map((char, i) => (
              <div key={i} className="room-code-char group-hover:border-orange-600/40 transition-all duration-300" style={{ animationDelay: `${i * 80}ms` }}>{char}</div>
            ))}
          </button>
          <p className="text-zinc-700 text-xs mt-3 font-medium transition-colors">{copied ? <span className="text-orange-500">Copied!</span> : "Tap to copy"}</p>
        </div>

        {!hasJoined && (
          <div className="w-full max-w-sm mb-8 animate-slide-up relative z-10" style={{ animationDelay: '150ms' }}>
            <div className="flex gap-2">
              <input type="text" value={playerName} onChange={(e) => setPlayerName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && joinGame()} placeholder="Your name..."
                className="input-dark flex-grow p-3 px-5 rounded-lg font-semibold" />
              <button onClick={joinGame} disabled={!playerName.trim()}
                className="btn-fire px-6 py-3 rounded-lg cursor-pointer text-sm">Join</button>
            </div>
            {error && <p className="text-red-500 text-sm mt-2 text-center font-semibold">{error}</p>}
          </div>
        )}

        <div className="w-full max-w-sm relative z-10">
          <p className="text-zinc-600 text-[9px] uppercase tracking-[0.4em] mb-3 font-bold text-center">
            Players ({challengers.length})
          </p>
          <div className="space-y-2">
            {challengers.map((c, i) => (
              <div key={c.id}
                className="sauce-card flex items-center gap-3 rounded-xl px-4 py-3 animate-fade-in"
                style={{ animationDelay: `${i * 80}ms` }}>
                <span className="text-orange-600/60 font-black text-sm w-6 text-center">{i + 1}</span>
                <span className="font-bold text-white">{c.name}</span>
                <div className="ml-auto flex gap-1.5">
                  {c.claim_id === myClaimId && (
                    <span className="text-[8px] bg-blue-500/15 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full font-bold uppercase">You</span>
                  )}
                  {c.claim_id === room!.host_claim_id && (
                    <span className="text-[8px] bg-orange-500/15 text-orange-400 border border-orange-500/20 px-2 py-0.5 rounded-full font-bold uppercase">Host</span>
                  )}
                </div>
              </div>
            ))}
            {challengers.length === 0 && (
              <p className="text-zinc-700 text-sm text-center py-6 font-medium">No players yet...</p>
            )}
          </div>
        </div>

        {customQuestions.length > 0 && (
          <p className="mt-4 text-zinc-600 text-[10px] uppercase tracking-[0.3em] text-center relative z-10 font-semibold">
            Custom questions loaded ({customQuestions.length})
          </p>
        )}

        {isHost && (
          <button onClick={startGame} disabled={challengers.length < 2}
            className="btn-fire mt-8 text-lg px-14 py-4 rounded-xl cursor-pointer relative z-10 tracking-wide">
            {challengers.length < 2 ? "Waiting for players..." : "Start Game"}
          </button>
        )}
        {!isHost && hasJoined && (
          <p className="mt-8 text-zinc-600 text-[10px] uppercase tracking-[0.3em] animate-pulse relative z-10 font-bold">
            Waiting for host to start...
          </p>
        )}
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
    const conqueredLastDab = winner && !winner.dnf && winner.level >= 10;

    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 relative">
        <div className="ember-field" />

        <div className="text-center mb-10 animate-fade-in relative z-10">
          <p className="text-zinc-600 text-[9px] uppercase tracking-[0.5em] mb-3 font-bold">Game Over</p>
          <h1 className="title-fire text-5xl md:text-7xl font-[family-name:var(--font-archivo)] uppercase italic leading-none tracking-tight">
            Results
          </h1>
        </div>

        {conqueredLastDab && (
          <div className="mb-10 text-center animate-slide-up relative z-10">
            <div className="text-5xl mb-3" style={{ filter: 'drop-shadow(0 0 20px rgba(249, 115, 22, 0.5))' }}>&#x1F525;</div>
            <p className="text-3xl font-black uppercase italic text-white tracking-tight">{winner.name}</p>
            <p className="text-purple-400 text-xs font-bold uppercase tracking-[0.3em] mt-1">Conquered The Last Dab</p>
          </div>
        )}

        <div className="w-full max-w-md space-y-3 relative z-10">
          {sorted.map((c, i) => {
            const sauce = getCurrentSauce(c.level);
            const isWinner = i === 0 && !c.dnf;
            return (
              <div key={c.id}
                className={`flex items-center gap-4 p-4 rounded-xl animate-slide-up ${
                  isWinner ? "leaderboard-winner" : c.dnf ? "leaderboard-card opacity-40" : "leaderboard-card"
                }`}
                style={{ animationDelay: `${i * 120}ms` }}>
                <span className={`text-2xl font-black w-8 text-center ${isWinner ? "text-orange-500" : "text-zinc-700"}`}>{i + 1}</span>
                <div className="flex-grow min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-black text-lg uppercase italic tracking-tight">{c.name}</span>
                    {c.claim_id === myClaimId && (
                      <span className="text-[8px] bg-blue-500/15 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full font-bold uppercase">You</span>
                    )}
                  </div>
                  <span className="text-zinc-600 text-xs font-medium">{c.dnf ? "Tapped out" : sauce.name}</span>
                </div>
                <div className="text-right">
                  <div className={`text-2xl font-black ${c.dnf ? "text-red-500/70" : isWinner ? "text-orange-500" : "text-zinc-400"}`}>
                    {c.dnf ? "DNF" : c.level}
                  </div>
                  {!c.dnf && <div className="text-zinc-700 text-[10px] font-bold">/10</div>}
                </div>
              </div>
            );
          })}
        </div>

        <button onClick={() => router.push("/")}
          className="btn-ghost mt-10 px-10 py-3 rounded-xl cursor-pointer text-sm relative z-10">
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
  const heat = getHeatIntensity(round);
  const isLastDab = round === 10;

  const playerStrip = (
    <div className="flex flex-wrap justify-center gap-2 mt-5">
      {challengers.map((c) => (
        <div key={c.id} className={`player-chip relative ${
          c.dnf ? "player-chip-dnf" : c.level >= round ? "player-chip-done" : "player-chip-active"
        }`}>
          {recentlyLeveled[c.id] && <div className="fire-burst rounded-full" />}
          <span className="font-semibold">{c.name}</span>
          {c.dnf ? <span className="text-[10px]">&#x1F480;</span> : c.level >= round ? <span className="text-[10px]">&#x2713;</span> : <span className="text-[10px]">&#x1F525;</span>}
        </div>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col relative">
      {/* Round transition overlay */}
      {roundTransition && (
        <div className="fixed inset-0 z-50 round-transition-overlay flex flex-col items-center justify-center animate-fade-in">
          <div className="animate-screen-shake">
            <p className="text-zinc-500 text-[9px] uppercase tracking-[0.5em] mb-4 font-bold text-center">
              Round {round} of 10
            </p>
            <h2 className="text-5xl md:text-7xl font-[family-name:var(--font-archivo)] uppercase italic text-center leading-tight px-4"
              style={{ color: heat.color, textShadow: `0 0 40px ${heat.glow}`, filter: `drop-shadow(0 0 20px ${heat.glow})` }}>
              {sauce.name}
            </h2>
            <p className="text-zinc-500 mt-3 text-lg text-center font-medium">{sauce.shu.toLocaleString()} SHU</p>
            <div className="mt-8 flex gap-1.5 justify-center">
              {Array.from({ length: 10 }, (_, i) => (
                <div key={i} className={`w-7 h-2 rounded-full transition-all duration-500 ${
                  i < round ? getHeatColor(i + 1) : "bg-zinc-800/50"
                }`} style={i < round ? { boxShadow: `0 0 8px ${getHeatIntensity(i + 1).glow}` } : {}} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Top bar */}
      <header className="flex items-center justify-between p-4 md:px-8 relative z-10">
        <div className="flex items-center gap-3">
          <h1 className="title-fire text-xl font-[family-name:var(--font-archivo)] uppercase italic">
            Hot Ones
          </h1>
          <span className="text-[9px] bg-white/[0.03] border border-white/[0.06] text-zinc-500 px-2.5 py-1 rounded-md font-bold uppercase tracking-wider">{code.toUpperCase()}</span>
        </div>
        <div className="flex items-center gap-3">
          {isHost && (
            <button onClick={endGame} className="text-[10px] bg-white/[0.03] border border-white/[0.06] hover:bg-red-900/20 hover:border-red-900/30 text-zinc-500 hover:text-red-400 px-3 py-1.5 rounded-md font-bold uppercase transition-all cursor-pointer">
              End
            </button>
          )}
        </div>
      </header>

      {/* Main game area */}
      <main className="flex-grow flex flex-col items-center justify-center p-4 md:p-8 max-w-2xl mx-auto w-full relative z-10">
        {/* Round + Sauce header */}
        <div className="text-center mb-6">
          <p className="text-zinc-600 text-[9px] uppercase tracking-[0.5em] font-bold">Round {round} of 10</p>
          <h2 className="text-3xl md:text-5xl font-[family-name:var(--font-archivo)] uppercase italic mt-1 tracking-tight"
            style={{ color: heat.color, textShadow: `0 0 30px ${heat.glow}` }}>
            {sauce.name}
          </h2>
          <p className="text-zinc-600 text-sm mt-1 font-medium">{sauce.shu.toLocaleString()} SHU</p>
        </div>

        {/* Heat progress bar */}
        <div className="flex gap-1.5 mb-8 w-full max-w-xs">
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i}
              className={`flex-grow heat-segment ${i < round ? `heat-segment-active ${getHeatColor(i + 1)}` : "heat-segment-inactive"}`}
              style={i < round ? { '--segment-glow': getHeatIntensity(i + 1).glow } as React.CSSProperties : {}} />
          ))}
        </div>

        {/* Phase 1: Eat Your Wing */}
        {!questionRevealed ? (
          <div className="w-full">
            <div className={`sauce-card-active rounded-2xl p-6 md:p-8 text-center border-t-2 ${isLastDab ? 'last-dab' : ''}`}
              style={{ borderTopColor: isLastDab ? '#a855f7' : heat.color }}>
              <div className="text-4xl mb-3" style={{ filter: `drop-shadow(0 0 15px ${heat.glow})` }}>&#x1F357;</div>
              <p className="text-xl font-black uppercase italic text-white tracking-tight">Eat Your Wing!</p>
              <p className="text-zinc-500 text-sm mt-2 font-medium">
                Apply <span style={{ color: heat.color }}>{sauce.name}</span> and eat together
              </p>

              {me && !me.dnf && (
                <div className="mt-6 flex flex-col items-center gap-3">
                  {!iCompletedRound ? (
                    <button onClick={() => markComplete(me.id, me.claim_id)}
                      className="btn-fire px-10 py-3 rounded-xl cursor-pointer text-sm tracking-wide"
                      style={isLastDab ? { background: 'linear-gradient(135deg, #7c3aed, #a855f7)', boxShadow: '0 0 30px rgba(168, 85, 247, 0.3)' } : {}}>
                      I Ate It &#x1F525;
                    </button>
                  ) : (
                    <span className="text-green-400 font-bold text-sm uppercase tracking-wider">&#x2713; Done</span>
                  )}
                  <button onClick={() => toggleDNF(me.id, me.dnf, me.claim_id)}
                    className="text-zinc-600 hover:text-red-400 text-xs font-bold uppercase transition-colors cursor-pointer py-1 px-3">
                    I Tap Out
                  </button>
                </div>
              )}
              {me?.dnf && (
                <div className="mt-6 flex flex-col items-center gap-2">
                  <span className="text-red-400 font-bold text-sm uppercase">You tapped out</span>
                  <button onClick={() => toggleDNF(me.id, me.dnf, me.claim_id)}
                    className="text-zinc-600 hover:text-green-400 text-xs font-bold uppercase transition-colors cursor-pointer py-1 px-3">
                    Get Back In?
                  </button>
                </div>
              )}

              {isHost && (
                <button onClick={revealQuestion}
                  className="btn-ghost mt-6 px-8 py-2.5 rounded-lg cursor-pointer text-xs">
                  Reveal Question
                </button>
              )}
              {!isHost && (
                <p className="mt-6 text-zinc-700 text-[10px] uppercase tracking-[0.3em] animate-pulse font-bold">
                  Host will reveal the question...
                </p>
              )}
            </div>
            {playerStrip}
          </div>
        ) : (
          /* Phase 2: Question Revealed */
          <div className="w-full animate-slide-up">
            <div className={`sauce-card-active rounded-2xl p-6 md:p-8 text-center border-t-2 ${isLastDab ? 'last-dab' : ''}`} style={{
              borderTopColor: question.type === "roast" ? "#ef4444" : question.type === "wouldyourather" ? "#a855f7" : question.type === "challenge" ? "#eab308" : "#3b82f6"
            }}>
              <p className={`text-[9px] uppercase tracking-[0.3em] font-black mb-5 ${getTypeColor(question.type)}`}>
                {getTypeLabel(question.type)}
              </p>
              <p className="text-xl md:text-2xl font-bold text-white leading-relaxed">
                {questionText}
              </p>
              {question.type === "truth" && (
                <p className="text-zinc-600 text-xs mt-4 italic font-medium">
                  Answer honestly... or take a dab of <span style={{ color: heat.color }}>{sauce.name}</span>
                </p>
              )}

              {me && !me.dnf && !iCompletedRound && (
                <div className="mt-6 flex flex-col items-center gap-2">
                  <button onClick={() => markComplete(me.id, me.claim_id)}
                    className="text-orange-500 hover:text-orange-400 font-bold uppercase px-6 py-2 rounded-lg transition-colors cursor-pointer text-xs border border-orange-500/15 hover:border-orange-500/30 bg-orange-500/5 hover:bg-orange-500/10">
                    I Ate It &#x1F525;
                  </button>
                </div>
              )}
            </div>

            {playerStrip}

            {isHost && (
              <div className="flex justify-center mt-8">
                <button onClick={nextRound}
                  className="btn-fire px-12 py-3 rounded-xl cursor-pointer tracking-wide">
                  {round >= 10 ? "Finish Game" : "Next Round"}
                </button>
              </div>
            )}
            {!isHost && (
              <p className="text-center mt-8 text-zinc-700 text-[10px] uppercase tracking-[0.3em] animate-pulse font-bold">
                Host will advance to the next round...
              </p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
