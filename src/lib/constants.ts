export const SAUCES = [
  { name: "The Classic (Garlic Chili)", shu: "1,700" },
  { name: "Mojo Berry", shu: "5,000" },
  { name: "Poblano & Jalapeño", shu: "10,500" },
  { name: "Matagi Shoyu", shu: "35,000" },
  { name: "The Spicy Shark", shu: "58,000" },
  { name: "Lao Gan Ma Style", shu: "71,000" },
  { name: "The Last Dab: Apollo", shu: "100,000+" },
  { name: "Da' Bomb Beyond Insanity", shu: "135,600" },
  { name: "Monolith", shu: "650,000" },
  { name: "The Last Dab: Xperience", shu: "2,693,000+" },
] as const;

export function getCurrentSauce(level: number) {
  if (level === 0) return { name: "Ready for Wings", shu: "0" };
  return SAUCES[level - 1];
}

export function getHeatColor(n: number) {
  if (n <= 3) return "bg-green-500";
  if (n <= 6) return "bg-orange-500";
  if (n <= 9) return "bg-red-600";
  return "bg-purple-600 animate-pulse";
}

export function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars (0/O, 1/I)
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}
