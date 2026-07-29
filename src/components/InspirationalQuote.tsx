import { useMemo, useState } from "react";
import { getStoredAuthEmail } from "@/lib/api";

const CUSTOM_STORAGE_KEY = "promo-buddy-seen-custom-quotes";
const FLIRTY_ALLOWED_EMAILS = new Set(["rita.galvao@olx.com", "nelson.rebelo@olx.com"]);

const FLIRTY_QUOTES = [
  "Tenho imenso orgulho em ti.",
  "Usaste a contenção esta noite?",
  "Bebé água!",
  "Pogo Fosto, pois claro!",
  "Bora fumar uma carteira?",
  "Hoje apetece-me algo com Leite descompensado.",
  "La cabra relajante está aquí hoy para curar tu ansiedad. Bahaaaha.",
  "Você não é Ave Maria, mas está cheia de graça.",
  "És muito mais forte hoje, do que ontem. Que orgulho.",
  "Tenho muita sorte em ter-te na minha vida.",
  "Vai ficar tudo bem, aos poucos.",
  "Obrigado por nunca deixares de ser tu própria.",
  "Tenho orgulho em tudo o que tens superado.",
  "Tu mereces descansar.",
  "A tua força inspira-me.",
  "Obrigado pela tua paciência e pelo teu coração.",
  "Esta fase vai passar.",
  "Tenho orgulho na tua coragem.",
  "Obrigado por tudo o que fazes, mesmo quando ninguém vê.",
  "És incrível, mesmo quando duvidas disso.",
  "Obrigado por estares aqui.",
  "Tenho orgulho na forma como continuas.",
  "Tu mereces paz.",
  "TELEPATIAAAAA. Silêncio calma. FEITIÇARIIIIAAAA.",
  "Agora além de evangélicas, somos ambas misteriosas!",
  "These VAS will be NOT BE FREE to the seller. TO BE OR NOT TO BE, THAT IS THE QUESTION.",
  "Queres frases novas? Hmmm não sei..",
  "Era para seguir o instinto, mas segui o extintor.",
  "Fui ler as instruções e acabei a montar uma cadeira em espanhol.",
  "O plano era ser discreto. Li “descrito” e comecei a explicar tudo.",
  "Era para tomar decisões. Li “doces” e fui à pastelaria.",
  "Queria escrever “bom dia”, mas saiu “dom bia”. Parece nome de padre.",
  "Fui procurar paz interior, mas li “pás interior” e acabei no Leroy Merlin.",
  "O chef disse “sal a gosto”. Li “sol a gosto” e levei o prato à janela.",
  "Era para “pensar positivo”. Li “pastel positivo” e agora acredito em sobremesas.",
  "Li “reunião às três” como “refeição às três”. Estive mais motivado.",
  "Nunca tive tanto medo de beber vinho..",
  "Sabias que os pinguins fazem pedidos de namoro com pedras?",
  "Sabias que os cavalos-marinhos machos é que engravidam?",
  "Sabias que os flamingos só são cor-de-rosa porque comem camarões?",
  "Sabias que a Torre Eiffel cresce no verão?",
  "Sabias que as borboletas provam comida com os pés?",
  "Sabias que os caracóis podem fazer preliminares durante horas?",
  "Imagine us sneaking off somewhere… what would happen next?",
  "I can’t stop thinking about feeling your hands on me",
  "If you were here, I wouldn’t be able to keep my hands off you",
  "I was thinking about our last night together… I have a surprise planned for next time 😘",
  "Guess what I’m *not* wearing right now?",
  "I wish you could see me right now – let me describe it to you",
  "I want you to do *that* to me again tonight",
  "Tell me what you’d like to do if we were alone…",
  "What was your favourite part of last night?",
  "I’ve just got out of the shower… wish you were here 😏",
  "I hope you know I’m thinking about you right now",
  "No one makes me feel as good as you do",
  "I can still taste you",
  "Guess what I’m imagining right now…",
  "My days are more fun when you’re in them",
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
  if (typeof window === "undefined") return null;

  try {
    const email = getStoredAuthEmail()?.trim().toLowerCase();
    const canShowFlirty = Boolean(email && FLIRTY_ALLOWED_EMAILS.has(email));
    if (canShowFlirty) {
      return { text: pickNonRepeatingQuote(FLIRTY_QUOTES, CUSTOM_STORAGE_KEY), isFlirty: false };
    }
    return null;
  } catch {
    return null;
  }
}

export function InspirationalQuote() {
  const quote = useMemo(() => getQuote(), []);
  const [isVisible, setIsVisible] = useState(true);

  if (!isVisible || !quote?.text) return null;

  return (
    <aside
      className={`fixed bottom-4 right-4 z-40 hidden max-w-[260px] rounded-2xl border border-white/70 bg-white/55 px-4 py-3 pr-8 text-right text-xs leading-5 shadow-sm backdrop-blur-xl md:block ${
        quote.isFlirty ? "text-slate-500/70" : "text-slate-500"
      }`}
    >
      <button
        type="button"
        aria-label="Close quote"
        onClick={() => setIsVisible(false)}
        className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full text-slate-400/80 transition hover:bg-white/70 hover:text-slate-600"
      >
        ×
      </button>
      {quote.text}
    </aside>
  );
}
