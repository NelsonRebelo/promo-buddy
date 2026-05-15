import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Loader2, RefreshCcw, ShieldCheck, Unplug } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  closeOfferBrowserSession,
  getOfferBrowserSessionStatus,
  getOfferHelperHealth,
  importOfferSession,
  startOfferBrowserSession,
  type OfferHelperSessionStatus,
} from "@/lib/api";

type HelperHealthState = "checking" | "online" | "offline";
type ConnectStage = "idle" | "starting" | "waiting" | "importing" | "done" | "failed";

const HELPER_URL = "http://127.0.0.1:43125/connect";

const OfferLogin = () => {
  const navigate = useNavigate();
  const [helperHealth, setHelperHealth] = useState<HelperHealthState>("checking");
  const [stage, setStage] = useState<ConnectStage>("idle");
  const [error, setError] = useState("");
  const [detail, setDetail] = useState("");
  const [helperSessionId, setHelperSessionId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("Checking the local helper...");
  const [validatedUrl, setValidatedUrl] = useState<string | null>(null);
  const pollHandle = useRef<number | null>(null);

  const canStart = helperHealth === "online" && (stage === "idle" || stage === "failed");

  const helperHint = useMemo(() => {
    if (helperHealth === "checking") return "Checking the helper on this machine.";
    if (helperHealth === "online") return "Local helper detected. We can open a real browser window for Standvirtual login.";
    return "Local helper not detected. Start it locally, then try again.";
  }, [helperHealth]);

  const clearPolling = () => {
    if (pollHandle.current !== null) {
      window.clearTimeout(pollHandle.current);
      pollHandle.current = null;
    }
  };

  const handleBack = () => {
    clearPolling();
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate("/", { replace: true });
  };

  const checkHelper = async () => {
    setHelperHealth("checking");
    setError("");
    try {
      const res = await getOfferHelperHealth();
      setHelperHealth(res?.ok ? "online" : "offline");
    } catch {
      setHelperHealth("offline");
    }
  };

  useEffect(() => {
    checkHelper();
    return () => {
      clearPolling();
    };
  }, []);

  const finishImport = async (cookieHeader: string, helperValidatedUrl?: string | null) => {
    setStage("importing");
    setStatusMessage("Importing the authenticated browser session into Promo Buddy...");
    setValidatedUrl(helperValidatedUrl ?? null);
    const result = await importOfferSession({
      cookie_header: cookieHeader,
      validated_url: helperValidatedUrl ?? null,
    });

    if (!result.ok) {
      setStage("failed");
      setError(result.detail || result.error || "Failed to import the authenticated Offer session.");
      return;
    }

    if (helperSessionId) {
      try {
        await closeOfferBrowserSession(helperSessionId);
      } catch {
        // Best-effort cleanup only.
      }
    }

    setStage("done");
    setStatusMessage("Standvirtual is connected. Opening the Offer runner...");
    setTimeout(() => {
      navigate("/offer-runner", { replace: true });
    }, 450);
  };

  const pollStatus = async (sessionId: string) => {
    try {
      const res = await getOfferBrowserSessionStatus(sessionId);
      const status = res as OfferHelperSessionStatus;

      if (!status.ok) {
        setStage("failed");
        setError(status.error || "The local helper session failed.");
        if (status.detail) setDetail(status.detail);
        return;
      }

      if (status.status === "authenticated") {
        await finishImport(status.cookie_header, status.validated_url);
        return;
      }

      if (status.status === "waiting_for_login") {
        setStage("waiting");
        setStatusMessage(status.message || "The browser is open. Finish the normal Standvirtual login flow there.");
      }

      if (status.status === "starting") {
        setStage("starting");
        setStatusMessage(status.message || "Opening the browser window...");
      }

      pollHandle.current = window.setTimeout(() => {
        void pollStatus(sessionId);
      }, 1800);
    } catch (err) {
      setStage("failed");
      setError(err instanceof Error ? err.message : "Failed to poll the local helper status.");
    }
  };

  const handleConnect = async () => {
    setError("");
    setDetail("");
    setValidatedUrl(null);
    setStage("starting");
    setStatusMessage("Opening the local browser helper...");

    try {
      const res = await startOfferBrowserSession();
      if (!res?.ok || !res?.session_id) {
        setStage("failed");
        setError(res?.error || "Failed to start the local browser helper.");
        return;
      }

      setHelperSessionId(res.session_id);
      setStatusMessage("Browser window opened. Continue the login flow there.");
      await pollStatus(res.session_id);
    } catch (err) {
      setStage("failed");
      setError(err instanceof Error ? err.message : "Failed to start the local browser helper.");
    }
  };

  const handleCancelSession = async () => {
    clearPolling();
    if (helperSessionId) {
      try {
        await closeOfferBrowserSession(helperSessionId);
      } catch {
        // Best-effort cleanup only.
      }
    }
    setHelperSessionId(null);
    setStage("idle");
    setStatusMessage(helperHealth === "online"
      ? "Local helper detected. We can open a real browser window for Standvirtual login."
      : "Checking the local helper...");
    setError("");
    setDetail("");
    setValidatedUrl(null);
  };

  const isBusy = stage === "starting" || stage === "waiting" || stage === "importing";

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
        <div className="relative mx-auto w-full max-w-2xl">
            <Card className="glass rounded-3xl border-white/80">
            <CardHeader className="items-center space-y-4 pb-4 text-center">
              <img src="/olx-group-logo.png" alt="OLX Group" className="h-12 w-auto object-contain" />
              <CardTitle className="text-3xl font-semibold tracking-tight">Connect Standvirtual</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <Alert className="rounded-2xl border-white/80 bg-white/70">
                <ShieldCheck className="h-4 w-4" />
                <AlertTitle>Helper status</AlertTitle>
                <AlertDescription className="flex flex-col gap-2 text-sm leading-relaxed">
                  <span>{helperHint}</span>
                  <span className="font-medium text-foreground">{statusMessage}</span>
                  {validatedUrl && <span className="text-xs text-muted-foreground">Validated on: {validatedUrl}</span>}
                </AlertDescription>
              </Alert>

              {error && (
                <Alert variant="destructive" className="rounded-2xl">
                  <AlertTitle>Could not connect</AlertTitle>
                  <AlertDescription className="space-y-2">
                    <p>{error}</p>
                    {detail && <p className="text-xs opacity-90">{detail}</p>}
                  </AlertDescription>
                </Alert>
              )}

              {helperHealth === "offline" && (
                <Alert className="rounded-2xl border-amber-200 bg-amber-50/90 text-amber-950">
                  <Unplug className="h-4 w-4" />
                  <AlertTitle>Helper not running</AlertTitle>
                  <AlertDescription className="space-y-2 text-sm">
                    <p>Start the local browser helper on this machine, then come back and retry the check.</p>
                    <Button type="button" variant="outline" className="h-10 rounded-xl" onClick={checkHelper}>
                      <RefreshCcw className="mr-2 h-4 w-4" />
                      Check again
                    </Button>
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex flex-col items-center gap-3 rounded-3xl border border-white/75 bg-white/70 p-5">
                <div className="flex w-full max-w-sm flex-col gap-2">
                  <Button
                    type="button"
                    className="h-11 rounded-xl"
                    disabled={!canStart || isBusy}
                    onClick={handleConnect}
                  >
                    {isBusy ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {stage === "importing" ? "Importing session..." : "Waiting for browser login..."}
                      </>
                    ) : stage === "done" ? (
                      <>
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        Connected
                      </>
                    ) : (
                      "Connect Standvirtual"
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 rounded-xl"
                    onClick={() => window.open(HELPER_URL, "_blank", "noopener,noreferrer")}
                  >
                    Open helper page
                  </Button>
                  {isBusy && (
                    <Button type="button" variant="ghost" className="h-10 rounded-xl" onClick={handleCancelSession}>
                      Cancel current attempt
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default OfferLogin;
