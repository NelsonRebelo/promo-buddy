import { useMemo } from "react";
import { getStoredAuthEmail } from "@/lib/api";

const QUOTES = [
  "You are enough exactly as you are. Did you smile today?",
  "Confidence looks lovely on you. Hope your smile is shining.",
  "You deserve your own love too. Keep that lovely smile close.",
  "You are allowed to choose yourself. Let your smile join you.",
  "Loving yourself is a power move. Smile a little for yourself today.",
  "You are stronger than you think. Have you worn your smile yet?",
  "Your softness is not weakness. Keep smiling, softly and proudly.",
  "You are becoming your safe place. Save room for a smile today.",
  "You are worthy without proving anything. Let that smile find you.",
  "Confidence suits you so well. A smile would suit this moment.",
  "You are still magic on hard days. Smile, even just a little.",
  "Your peace matters deeply. May your smile glow today.",
  "You are allowed to begin again. Keep your smile within reach.",
  "You are learning to trust yourself. Hope today brings you a smile.",
  "Your glow starts within. Let your smile breathe today.",
  "Self love looks radiant on you. A fresh start loves a smile.",
  "Your voice deserves to be heard. Smile at how far you have come.",
  "You do not need to shrink. Let your smile show some of it.",
  "You are worthy of gentle days. Keep that smile gently lit.",
  "Your confidence can be quiet and strong. Hope your smile feels easy today.",
  "You are your own kind of beautiful. Smile kindly at yourself today.",
  "You deserve kindness from yourself. Let your smile speak too.",
  "You are rising with grace. Wear your smile with confidence.",
  "You are allowed to rest without guilt. May your smile feel light today.",
  "Confidence begins with one brave thought. A calm smile is enough.",
  "You are blooming back to yourself. Let your smile match that.",
  "Your soul deserves tenderness. Smile for every step forward.",
  "You are powerful in your own way. Give yourself a smiling moment.",
  "You can love yourself out loud. Hope your smile rises too.",
  "You deserve peace, not pressure. Trust yourself, and smile when you can.",
  "You are enough on your quiet days too. Rest well, smile softly.",
  "Confidence grows when you honour yourself. Let a smile be the next step.",
  "Loving yourself changes everything. Smile at your becoming.",
  "You are allowed to protect your peace. Hold onto your smile today.",
  "Your softness holds great strength. Smile like you know it.",
  "You are worthy of the love you give. Let your smile say it too.",
  "You are learning to shine again. Smile for the pace that is yours.",
  "Your confidence does not need permission. Hope your smile feels lighter too.",
  "You deserve to feel safe in yourself. Smile gently through the day.",
  "Your heart is still full of light. Let your smile reflect some.",
  "You are enough on the messy days too. A small smile still counts.",
  "Confidence grows when you choose yourself. Smile in your own honour.",
  "You are not too much. Keep a little smile with you.",
  "Loving yourself changes the way you glow. Hope your smile knows that.",
  "You are allowed to protect your energy. Smile and keep it close.",
  "Your softness holds great power. Smile with that soft strength.",
  "You are worthy of the love you give away. May your smile remind you.",
  "You are learning to shine in your own way. Smile at the way you bloom.",
  "You are learning to shine again. Let your smile join the light.",
  "Your confidence does not ask for permission. Smile like you mean it.",
  "You deserve to feel safe in your own skin. Hope your smile feels safe too.",
  "You are becoming more you each day. Smile for the person emerging.",
  "Your heart is brave and beautiful. Let it borrow a smile today.",
  "You can be proud of your progress. Smile for what you have overcome.",
  "You are worthy of your own patience. Keep a patient smile today.",
  "Confidence is already within you. Let your smile meet it.",
  "You are allowed to love your reflection. Smile when you catch it.",
  "Your peace is a priority. May your smile feel peaceful too.",
  "You are choosing yourself with every step. Smile for each one.",
  "You are stronger than your doubts. Let your smile prove it.",
  "Your self love is sacred. Hold it with a bright smile.",
  "You deserve to take up space. Wear your smile fully.",
  "You are stronger than the voice of doubt. Smile with quiet courage.",
  "You are beautiful in your becoming. Hope your smile blooms too.",
  "Your confidence is your own glow. Let your smile carry some of it.",
  "You are worthy of soft mornings. Start one with a smile.",
  "Your heart can hold both strength and softness. Let your smile hold both too.",
  "You are not too much, you are just right. Smile without shrinking.",
  "Self trust looks lovely on you. Pair it with a smile.",
  "You deserve to feel proud of yourself. Smile at your own strength.",
  "You are becoming everything you need. Keep your smile nearby.",
  "You are learning to hold yourself kindly. Smile with that same kindness.",
  "Your confidence can start small. So can your smile.",
  "You are worth showing up for. Show up with a smile.",
  "Your love for yourself matters. Let your smile agree.",
  "You are becoming stronger and softer. Smile in both truths.",
  "You are allowed to grow at your own pace. Smile at your own rhythm.",
  "You deserve your own compassion. Give yourself a smiling glance.",
  "You are glowing from the inside out. Hope your smile gives it away.",
  "Confidence looks natural on you. So does a smile.",
  "You are allowed to feel beautiful. Smile like you believe it.",
  "Your journey deserves honour. Mark it with a smile.",
  "You are your own gentle strength. Let your smile be gentle too.",
  "Loving yourself is brave. Smile for that bravery.",
  "You deserve peace in your heart. May your smile rest there.",
  "Your confidence is unfolding beautifully. Smile through the unfolding.",
  "You are still worthy on untidy days. A soft smile still counts.",
  "Self kindness changes everything. Start with a smile for yourself.",
  "You are allowed to be proud of yourself. Smile like you know why.",
  "Your heart remembers its light. Let your smile follow.",
  "You are enough without changing everything. Smile as you are.",
  "Self love is your quiet power. Let your smile whisper it.",
  "You deserve to speak kindly to yourself. Say it with a smile too.",
  "Your self worth is not up for debate. Carry that with a soft smile.",
  "You are becoming your own light. Hope your smile shines with it.",
  "Confidence grows where self love lives. Let your smile live there too.",
  "You are worthy of every fresh start. Begin this one with a smile.",
  "Your heart deserves gentleness. Give it a gentle smile.",
  "You are stepping into your strength. Smile at what is returning.",
  "You are easy to love, especially by you. Hope your smile knows it.",
];

const STORAGE_KEY = "promo-buddy-seen-quotes";
const FLIRTY_STORAGE_KEY = "promo-buddy-seen-flirty-quotes";
const FLIRTY_QUOTE_CHANCE = 0.3;
const FLIRTY_ALLOWED_EMAILS = new Set(["rita.galvao@olx.com", "nelson.rebelo@olx.com"]);

const FLIRTY_QUOTES = [
  "You look like a bad decision in perfect packaging. 😏🌶️",
  "You are the reason self-control starts shaking. 🥵👀",
  "You have that energy that turns heads and ruins focus. 😳🌶️",
  "You are soft-looking and absolutely not safe. 😏🫦",
  "You walk in and suddenly the room forgets how to behave. 👀🥵",
  "You are the type people stare at, then regret staring at. 😳😏",
  "You have danger written all over you, just beautifully. 🌶️👀",
  "You are giving temptation with no warning label. 🫦🥵",
  "You look sweet, but that is clearly not the full story. 😏😳",
  "You are the kind of trouble people would choose twice. 🌶️🍑",
  "I swear to you I won't stop until your legs are shaking and the neighbors know my name. 🫦",
];

function pickNonRepeatingQuote(quotes: string[], storageKey: string) {
  const stored = window.localStorage.getItem(storageKey);
  const seen = stored ? (JSON.parse(stored) as number[]) : [];
  const validSeen = seen.filter((index) => Number.isInteger(index) && index >= 0 && index < quotes.length);
  const remaining = quotes.map((_, index) => index).filter((index) => !validSeen.includes(index));
  const pool = remaining.length > 0 ? remaining : quotes.map((_, index) => index);
  const nextIndex = pool[Math.floor(Math.random() * pool.length)];
  const nextSeen = remaining.length > 0 ? [...validSeen, nextIndex] : [nextIndex];
  window.localStorage.setItem(storageKey, JSON.stringify(nextSeen));
  return quotes[nextIndex];
}

function getQuote() {
  if (typeof window === "undefined") return QUOTES[0];

  try {
    const email = getStoredAuthEmail()?.trim().toLowerCase();
    const canShowFlirty = Boolean(email && FLIRTY_ALLOWED_EMAILS.has(email));
    if (canShowFlirty && Math.random() < FLIRTY_QUOTE_CHANCE) {
      return pickNonRepeatingQuote(FLIRTY_QUOTES, FLIRTY_STORAGE_KEY);
    }
    return pickNonRepeatingQuote(QUOTES, STORAGE_KEY);
  } catch {
    return QUOTES[Math.floor(Math.random() * QUOTES.length)];
  }
}

export function InspirationalQuote() {
  const quote = useMemo(() => getQuote(), []);

  return (
    <aside className="pointer-events-none fixed bottom-4 right-4 z-40 hidden max-w-[260px] rounded-2xl border border-white/70 bg-white/55 px-4 py-3 text-right text-xs leading-5 text-slate-500 shadow-sm backdrop-blur-xl md:block">
      {quote}
    </aside>
  );
}
