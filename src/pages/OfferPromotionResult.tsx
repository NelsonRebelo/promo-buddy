import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Copy, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { clearOfferSession, getOfferStatus } from "@/lib/api";

const OfferPromotionResult = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [copying, setCopying] = useState(false);
  const [status, setStatus] = useState<{
    loggedIn?: boolean;
    cookie?: string;
    expires_at?: string;
    error?: string;
  }>({});

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate("/", { replace: true });
  };

  useEffect(() => {
    getOfferStatus()
      .then((res) => setStatus(res))
      .catch((err) =>
        setStatus({
          error: err instanceof Error ? err.message : "Failed to load Offer Promotion session status.",
        }),
      )
      .finally(() => setLoading(false));
  }, []);

  const handleCopy = async () => {
    if (!status.cookie) return;
    setCopying(true);
    try {
      await navigator.clipboard.writeText(status.cookie);
    } finally {
      window.setTimeout(() => setCopying(false), 1200);
    }
  };

  const handleReset = () => {
    clearOfferSession();
    navigate("/offer-login", { replace: true });
  };

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div aria-hidden className="brand-blue-stage pointer-events-none absolute inset-0">
        <img
          src="https://media.licdn.com/dms/image/v2/C4D1BAQH4PUv6QKg_Ag/company-background_10000/company-background_10000/0/1591019721058/standvirtual_cover?e=1774620000&v=beta&t=h0xHSH-64Du6zwOfe6CHUOdTQiqF0_xx7Dvb8fEs2ig"
          alt=""
          className="h-full w-full scale-105 object-cover blur-md saturate-[1.05]"
        />
        <div className="brand-blue-overlay" />
      </div>
      <header className="border-b border-white/60 bg-white/65 backdrop-blur-xl">
        <div className="section-shell flex h-14 items-center justify-between">
          <Button type="button" variant="ghost" size="sm" onClick={handleBack} className="rounded-full px-3">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back
          </Button>
          <span className="text-sm font-semibold tracking-tight">Promo Buddy</span>
          <span className="w-[76px]" />
        </div>
      </header>

      <main className="section-shell relative flex min-h-[calc(100vh-3.5rem)] items-center justify-center py-10 sm:py-16">
        <Card className="glass w-full max-w-4xl rounded-3xl border-white/80">
          <CardHeader className="space-y-2">
            <CardTitle className="text-2xl font-semibold tracking-tight">Offer promotion session</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading && (
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading Offer Promotion session...
              </div>
            )}

            {!loading && status.error && (
              <Alert variant="destructive" className="rounded-2xl">
                <AlertDescription>{status.error}</AlertDescription>
              </Alert>
            )}

            {!loading && !status.error && !status.loggedIn && (
              <Alert variant="destructive" className="rounded-2xl">
                <AlertDescription>No Offer Promotion session was created.</AlertDescription>
              </Alert>
            )}

            {!loading && status.loggedIn && (
              <>
                <Alert className="rounded-2xl border-emerald-200 bg-emerald-50/80 text-emerald-700">
                  <AlertDescription>
                    Offer Promotion login attempt completed. The backend stored the captured cookie string.
                  </AlertDescription>
                </Alert>

                {status.expires_at && (
                  <p className="text-sm text-muted-foreground">Session expires at: {status.expires_at}</p>
                )}

                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm font-medium">Captured cookie</p>
                    <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={handleCopy}>
                      <Copy className="mr-2 h-4 w-4" />
                      {copying ? "Copied" : "Copy cookie"}
                    </Button>
                  </div>
                  <Textarea value={status.cookie || ""} readOnly className="min-h-[260px] rounded-2xl bg-white/75 font-mono text-xs" />
                </div>
              </>
            )}

            <div className="flex justify-end">
              <Button type="button" variant="outline" className="rounded-full" onClick={handleReset}>
                Try again
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default OfferPromotionResult;
