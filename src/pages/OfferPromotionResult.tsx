import { useEffect, useState } from "react";

type OfferTokenInfo = {
  formToken: string | null;
  cookie: string | null;
};

const STORAGE_KEY = "offer_token_info";

const OfferPromotionResult = () => {
  const [data, setData] = useState<OfferTokenInfo | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      setData(JSON.parse(raw) as OfferTokenInfo);
    } catch {
      setData(null);
    }
  }, []);

  return (
    <div className="min-h-screen">
      <header className="border-b border-white/60 bg-white/65 backdrop-blur-xl">
        <div className="section-shell flex h-14 items-center">
          <span className="text-sm font-semibold tracking-tight">Promo Buddy</span>
        </div>
      </header>

      <main className="section-shell flex min-h-[calc(100vh-3.5rem)] items-center justify-center py-10 sm:py-16">
        <div className="glass w-full max-w-3xl rounded-3xl border-white/80 p-6 sm:p-8">
          <h1 className="text-2xl font-semibold tracking-tight">Offer Promotion Token Info</h1>
          <p className="mt-2 text-sm text-muted-foreground">Debug values retrieved from backend flow.</p>

          <div className="mt-6 space-y-4">
            <div className="rounded-2xl border border-white/80 bg-white/75 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">formToken</p>
              <pre className="mt-2 whitespace-pre-wrap break-all text-sm text-foreground">
                {data?.formToken || "(not available)"}
              </pre>
            </div>

            <div className="rounded-2xl border border-white/80 bg-white/75 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">cookie</p>
              <pre className="mt-2 whitespace-pre-wrap break-all text-sm text-foreground">
                {data?.cookie || "(not available)"}
              </pre>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default OfferPromotionResult;
