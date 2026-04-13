import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { clearOfferMfaChallenge, getOfferMfaChallenge, offerVerifyMfa } from "@/lib/api";

const formatOfferDiagnostics = (response: Record<string, unknown>) => {
  const keys = [
    "auth_path",
    "validated",
    "final_url",
    "usercards_status",
    "usercards_url",
    "stats_contains_admin_markers",
    "params_loaded",
    "cookie_length",
    "cookie_names",
  ];
  const diagnostics = Object.fromEntries(
    keys
      .filter((key) => response[key] !== undefined)
      .map((key) => [key, response[key]]),
  );
  return Object.keys(diagnostics).length > 0 ? JSON.stringify(diagnostics, null, 2) : "";
};

const OfferMfa = () => {
  const navigate = useNavigate();
  const challenge = useMemo(() => getOfferMfaChallenge(), []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [diagnostics, setDiagnostics] = useState("");
  const [status, setStatus] = useState("Waiting for approval...");

  const selectedFactor =
    challenge?.factors?.find((factor) => factor.id === challenge.preferred_factor_id) ??
    challenge?.factors?.[0] ??
    null;

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate("/offer-login", { replace: true });
  };

  const runVerification = async () => {
    if (!challenge || !selectedFactor) {
      setError("No MFA challenge is available. Start the Offer Promotion login again.");
      return;
    }

    setError("");
    setDiagnostics("");
    setLoading(true);
    setStatus("Approve the push notification request on your device.");
    try {
      const res = await offerVerifyMfa({
        state_token: challenge.state_token,
        authorize_url: challenge.authorize_url,
        factor_id: selectedFactor.id,
      });
      if (res.ok) {
        navigate("/offer-runner", { replace: true });
      } else {
        setError(res.detail || res.error || "MFA verification failed.");
        setDiagnostics(formatOfferDiagnostics(res as Record<string, unknown>));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!challenge || !selectedFactor) return;
    runVerification();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          <Button type="button" variant="ghost" size="sm" className="rounded-full px-3" onClick={handleBack}>
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back
          </Button>
          <span className="text-sm font-semibold tracking-tight">Promo Buddy</span>
          <span className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Offer promotion
          </span>
        </div>
      </header>

      <main className="section-shell relative flex min-h-[calc(100vh-3.5rem)] items-center py-10 sm:py-16">
        <div className="relative mx-auto w-full max-w-md">
          <Card className="glass rounded-3xl border-white/80">
            <CardHeader className="items-center space-y-2 pb-2 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <ShieldCheck className="h-5 w-5" strokeWidth={1.8} />
              </div>
              <CardTitle className="text-2xl font-semibold tracking-tight">Verify MFA</CardTitle>
              <CardDescription className="text-sm leading-relaxed text-muted-foreground">
                Approve the push notification request on your device.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {!challenge && (
                  <Alert variant="destructive" className="rounded-2xl">
                    <AlertDescription>No MFA challenge found. Start the Offer Promotion login again.</AlertDescription>
                  </Alert>
                )}
                {error && (
                  <Alert variant="destructive" className="rounded-2xl">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                {diagnostics && (
                  <div className="rounded-2xl border border-white/80 bg-white/75 p-4 text-left">
                    <p className="mb-2 text-sm font-medium text-foreground">Debug details</p>
                    <pre className="max-h-52 overflow-auto whitespace-pre-wrap break-words text-xs leading-5 text-muted-foreground">
                      {diagnostics}
                    </pre>
                  </div>
                )}
                <div className="rounded-2xl border border-white/80 bg-white/70 px-4 py-4 text-center text-sm text-muted-foreground">
                  {loading ? status : error ? "Approval did not complete." : "Ready to verify."}
                </div>
                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 flex-1 rounded-xl"
                    onClick={() => {
                      clearOfferMfaChallenge();
                      navigate("/offer-login", { replace: true });
                    }}
                    >
                      Start again
                    </Button>
                  <Button
                    type="button"
                    className="h-11 flex-1 rounded-xl text-sm font-medium"
                    disabled={loading || !challenge || !selectedFactor}
                    onClick={runVerification}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Waiting...
                      </>
                    ) : (
                      "Try approval again"
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default OfferMfa;
