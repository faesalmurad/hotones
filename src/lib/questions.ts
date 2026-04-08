export type QuestionType = "truth" | "wouldyourather" | "roast" | "trivia" | "challenge";

export interface Question {
  type: QuestionType;
  text: string;
  /** For trivia: the answer */
  answer?: string;
}

const TRUTH_QUESTIONS: Question[] = [
  { type: "truth", text: "What's the most embarrassing thing someone has caught you doing?" },
  { type: "truth", text: "What's a secret you've never told anyone at this table?" },
  { type: "truth", text: "What's the worst lie you've ever told?" },
  { type: "truth", text: "What's the pettiest reason you've stopped talking to someone?" },
  { type: "truth", text: "What's the most unhinged thing you've done after midnight?" },
  { type: "truth", text: "If your search history was made public, what would be the hardest to explain?" },
  { type: "truth", text: "What's the worst date you've ever been on?" },
  { type: "truth", text: "What's the biggest red flag you've ignored in a relationship?" },
  { type: "truth", text: "What's a hill you will absolutely die on?" },
  { type: "truth", text: "What's the most trouble you've ever gotten into?" },
  { type: "truth", text: "What's something you pretend to like but actually hate?" },
  { type: "truth", text: "What's the worst advice you've ever given someone?" },
  { type: "truth", text: "If you could send one anonymous text to anyone, who and what?" },
  { type: "truth", text: "What's the longest you've gone without showering and why?" },
  { type: "truth", text: "What's a rumor about you that's actually true?" },
  { type: "truth", text: "What's the most money you've wasted on something stupid?" },
  { type: "truth", text: "Who in this room would survive the longest in a zombie apocalypse? Who'd go first?" },
  { type: "truth", text: "What's the most childish thing you still do?" },
  { type: "truth", text: "What's a compliment you got that you still think about?" },
  { type: "truth", text: "What's a deal-breaker for you that most people would think is ridiculous?" },
];

const WOULD_YOU_RATHER: Question[] = [
  { type: "wouldyourather", text: "Would you rather have everyone hear your thoughts OR have everything you do livestreamed?" },
  { type: "wouldyourather", text: "Would you rather give up your phone for a year OR give up your bed?" },
  { type: "wouldyourather", text: "Would you rather always have to say what's on your mind OR never speak again?" },
  { type: "wouldyourather", text: "Would you rather have unlimited money but no friends OR be broke with amazing friends?" },
  { type: "wouldyourather", text: "Would you rather fight 100 duck-sized horses OR 1 horse-sized duck?" },
  { type: "wouldyourather", text: "Would you rather relive the same day forever OR jump forward 10 years?" },
  { type: "wouldyourather", text: "Would you rather eat only one food for the rest of your life OR never eat your favorite food again?" },
  { type: "wouldyourather", text: "Would you rather know how you die OR when you die?" },
  { type: "wouldyourather", text: "Would you rather be famous for something embarrassing OR unknown for something amazing?" },
  { type: "wouldyourather", text: "Would you rather have permanent clown makeup OR a permanent clown wig?" },
];

const ROAST_QUESTIONS: Question[] = [
  { type: "roast", text: "Everyone: roast {player}'s fashion sense. Worst roast takes a dab." },
  { type: "roast", text: "What's {player}'s most annoying habit? Everyone shares. {player} picks the truest one." },
  { type: "roast", text: "If {player} was a brand, what would their tagline be?" },
  { type: "roast", text: "Describe {player}'s dating life using only a movie title." },
  { type: "roast", text: "What would {player}'s autobiography be called?" },
  { type: "roast", text: "Everyone: what's {player}'s signature move at a party?" },
  { type: "roast", text: "If {player} had a catchphrase, what would it be?" },
  { type: "roast", text: "Everyone rate {player}'s dance moves 1-10. Lowest rater explains." },
  { type: "roast", text: "What's {player} most likely to be arrested for?" },
  { type: "roast", text: "What reality show would {player} be cast on and why?" },
];

const CHALLENGES: Question[] = [
  { type: "challenge", text: "Speed round: go around the table — name a hot sauce brand. First person to repeat or hesitate takes a dab." },
  { type: "challenge", text: "Everyone has 10 seconds to do their best impression of someone at the table. Group votes on the best." },
  { type: "challenge", text: "Staring contest! Last two people standing. Loser takes a dab." },
  { type: "challenge", text: "Everyone: describe your current pain level using only sound effects. Group votes on the most dramatic." },
  { type: "challenge", text: "Hot take round! Say your most controversial opinion. Group votes on the hottest take." },
  { type: "challenge", text: "Poker face challenge: everyone takes a bite and tries not to react. First to break takes another dab." },
  { type: "challenge", text: "One-up challenge: what's the hottest food you've ever eaten? Go around. Group votes on who wins." },
  { type: "challenge", text: "Speed round: name things that are hot. First person to hesitate or repeat takes a dab." },
  { type: "challenge", text: "Phone roulette: everyone unlocks their phone. Person to your left gets to open one app. They pick which." },
  { type: "challenge", text: "Everyone pitch a new hot sauce name. Group votes on the best one." },
];

const ALL_QUESTIONS = [...TRUTH_QUESTIONS, ...WOULD_YOU_RATHER, ...ROAST_QUESTIONS, ...CHALLENGES];

/**
 * Get a deterministic but shuffled question for a given round and room code.
 * This ensures all players see the same question without needing DB storage.
 * If customQuestions are provided, those are used instead.
 */
export function getQuestionForRound(round: number, roomCode: string, customQuestions?: Question[]): Question {
  const pool = customQuestions && customQuestions.length > 0 ? customQuestions : ALL_QUESTIONS;
  // Simple hash from room code + round to get consistent index
  let hash = 0;
  const seed = `${roomCode}-${round}`;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % pool.length;
  return pool[index];
}

/**
 * Pick a random player to be "in the hot seat" for roast questions.
 * Deterministic based on room code + round.
 */
export function getHotSeatIndex(round: number, roomCode: string, playerCount: number): number {
  let hash = 0;
  const seed = `seat-${roomCode}-${round}`;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % playerCount;
}

export function getTypeLabel(type: QuestionType): string {
  switch (type) {
    case "truth": return "Truth or Dab";
    case "wouldyourather": return "Would You Rather";
    case "roast": return "Roast Round";
    case "trivia": return "Pop Quiz";
    case "challenge": return "Challenge";
  }
}

export function getTypeColor(type: QuestionType): string {
  switch (type) {
    case "truth": return "text-blue-400";
    case "wouldyourather": return "text-purple-400";
    case "roast": return "text-red-400";
    case "trivia": return "text-green-400";
    case "challenge": return "text-yellow-400";
  }
}
