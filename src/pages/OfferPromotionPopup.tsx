import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import { getOfferTokenInfo } from "@/lib/api";
import { Button } from "@/components/ui/button";

type OfferTokenInfo = {
  ok: boolean;
  formToken?: string | null;
  error?: string;
  detail?: string;
};

const OfferPromotionPopup = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState("Retrieving token information...");
  const [error, setError] = useState("");

  const handleBack = () => {
    if (window.opener && !window.opener.closed) {
      window.close();
      return;
    }
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate("/", { replace: true });
  };

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        const data = (await getOfferTokenInfo()) as OfferTokenInfo;
        if (cancelled) return;

        if (!data.ok) {
          setError(data.error || "Failed to retrieve token information.");
          return;
        }

        setStatus("Token information retrieved. Closing popup...");
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage(
            {
              type: "offer-token-info",
              payload: {
                formToken: data.formToken ?? null,
              },
            },
            window.location.origin,
          );
        }

        setTimeout(() => window.close(), 300);
      } catch (err: unknown) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Unexpected error";
        setError(message);
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen p-6">
      <div className="mx-auto mb-4 flex w-full max-w-md">
        <Button type="button" variant="ghost" size="sm" onClick={handleBack} className="rounded-full px-3">
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Back
        </Button>
      </div>
      <div className="flex items-center justify-center">
        <div className="glass w-full max-w-md rounded-3xl border-white/80 p-6 text-center">
          <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Offer Promotion</h1>
          <p className="mt-2 text-sm text-muted-foreground">{error || status}</p>
          {error && (
            <button
              type="button"
              className="mt-4 rounded-lg border border-white/80 bg-white/75 px-4 py-2 text-sm"
              onClick={() => window.close()}
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default OfferPromotionPopup;
