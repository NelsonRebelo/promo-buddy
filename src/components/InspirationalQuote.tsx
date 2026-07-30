import { useMemo, useState } from "react";
import { getStoredAuthEmail } from "@/lib/api";

const CUSTOM_STORAGE_KEY = "promo-buddy-seen-custom-quotes";
const FLIRTY_ALLOWED_EMAILS = new Set(["rita.galvao@olx.com", "nelson.rebelo@olx.com"]);

const FLIRTY_QUOTES = [
  'What if we gave it a try? What was the first thing you would do?',
  'My Tonge doesn’t work alone, my hand has to help as well.',
  'How long do you think you would last before you started screaming my name?',
  'My Tonge wants to play, but also go inside, ever had someone do that?',
  'I may no be big, but I try - very hard -',
  'Me on top, or from the back?',
  'What would you do if I stopped teasing and actually gave you what you wanted?',
  'Be honest, how many times have you imagined me taking control?',
  'I have a few ideas for keeping your mouth busy.',
  'Would you rather I went slowly, or made you beg me to slow down?',
  'Tell me where you want my hands first.',
  'I wonder how long you could stay quiet with me in the room.',
  'You look like someone who enjoys being told exactly what to do.',
  'I could behave, but you would probably find that disappointing.',
  'What is the one thing you would be too shy to ask me for?',
  'I want to find out which sounds you make when you lose control.',
  'Would you let me choose the position?',
  'I am trying to have an innocent conversation, but your body keeps distracting me.',
  'You should not look at me like that unless you are ready for the consequences.',
  'I have two hands and plenty of imagination.',
  'Tell me to stop teasing you. I want to hear how unconvincing you sound.',
  'I wonder whether you taste as good as you look.',
  'Would you prefer to be in control, or pretend you are?',
  'I am patient, but I also enjoy making people impatient.',
  'What would happen if I whispered exactly what I wanted to do to you?',
  'I want to know how sensitive you really are.',
  'Do you like being watched while you lose control?',
  'I could make you forget what you were trying to say.',
  'You seem confident. I would enjoy testing that.',
  'Would you rather feel my breath on your neck or my hands around your waist?',
  'I have been thinking about you in ways that are definitely not appropriate for daylight.',
  'You can choose where we start, but I decide when we finish.',
  'I want to hear you ask nicely.',
  'How much teasing can you handle before you take matters into your own hands?',
  'I would take my time with you, just to see how desperate you become.',
  'I am curious whether you are louder when you are surprised.',
  'Would you let me blindfold you and make you guess what comes next?',
  'I want your full attention, preferably with very few clothes involved.',
  'You make self-control feel unnecessarily difficult.',
  'I could tell you what I am imagining, but showing you would be more effective.',
  'What is your favourite way to be pinned down?',
  'I want to find the exact spot that makes you forget my name, then make you remember it.',
  'Do you prefer gentle persuasion or firm instructions?',
  'I like eye contact, especially when someone is struggling to stay composed.',
  'I would start slowly, then stop just when you wanted more.',
  'Something tells me you would look good underneath me.',
  'I want to know how many times I could make you change your mind about stopping.',
  'Would you behave if I told you to, or would I need to make you?',
  'I have a talent for turning innocent plans into very bad decisions.',
  'Tell me your limits, then tell me what you secretly hope I do within them.',
  'I want to leave you wondering why we did not try this sooner.',
  'How long would it take before you started pulling me closer?',
  'I could keep my hands to myself, but neither of us wants that.',
  'I want to hear your confident voice disappear one breath at a time.',
  'Would you rather spend the night being teased or completely overwhelmed?',
  'The first time, I would be gentle. After that, you would know exactly what you were asking for.',
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
