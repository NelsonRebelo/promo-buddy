import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, LockKeyhole } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { getOrderStatus } from "@/lib/api";

type OrderAuthLoginProps = {
  eyebrow: string;
  title: string;
  description: string;
  redirectTo: string;
  footer?: ReactNode;
  hideBack?: boolean;
  showLogo?: boolean;
};

const OrderAuthLogin = ({
  eyebrow,
  title,
  description,
  redirectTo,
  footer,
  hideBack = false,
  showLogo = false,
}: OrderAuthLoginProps) => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate("/", { replace: true });
  };

  useEffect(() => {
    getOrderStatus()
      .then((status) => {
        if (status.loggedIn && status.allowed) navigate(redirectTo, { replace: true });
      })
      .catch(() => {})
      .finally(() => setChecking(false));
  }, [navigate, redirectTo]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setMessage("");

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setError("Enter your email.");
      return;
    }

    setLoading(true);
    if (!codeSent) {
      const { error: signInError } = await supabase.auth.signInWithOtp({
        email: normalizedEmail,
      });
      setLoading(false);

      if (signInError) {
        setError(signInError.message);
        return;
      }

      setCodeSent(true);
      setMessage("Check your email and enter the login code to continue.");
      return;
    }

    const normalizedCode = code.replace(/\s/g, "");
    if (!normalizedCode) {
      setLoading(false);
      setError("Enter the code from your email.");
      return;
    }

    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: normalizedEmail,
      token: normalizedCode,
      type: "email",
    });

    if (verifyError) {
      setLoading(false);
      setError(verifyError.message);
      return;
    }

    const status = await getOrderStatus().catch(() => null);
    setLoading(false);

    if (!status?.loggedIn) {
      setError("Login succeeded, but the session could not be confirmed. Please try again.");
      return;
    }
    if (!status.allowed) {
      await supabase.auth.signOut();
      setError("This email is not allowed to use Order Management.");
      return;
    }

    navigate(redirectTo, { replace: true });
  };

  const handleUseDifferentEmail = async () => {
    await supabase.auth.signOut();
    setCode("");
    setCodeSent(false);
    setMessage("");
    setError("");
  };

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

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
          {hideBack ? (
            <span className="w-[76px]" />
          ) : (
            <Button type="button" variant="ghost" size="sm" className="rounded-full px-3" onClick={handleBack}>
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Back
            </Button>
          )}
          <span className="text-sm font-semibold tracking-tight">Promo Buddy</span>
          <span className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">{eyebrow}</span>
        </div>
      </header>

      <main className="section-shell relative flex min-h-[calc(100vh-3.5rem)] items-center py-10 sm:py-16">
        <div className="relative mx-auto w-full max-w-md">
          {showLogo && (
            <img
              src="/promobuddy-home-logo.png"
              alt="Promo Buddy"
              className="mx-auto mb-6 h-28 w-auto object-contain"
            />
          )}
          <Card className="glass fade-up rounded-3xl border-white/80">
            <CardHeader className="items-center space-y-2 pb-2 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <LockKeyhole className="h-5 w-5" strokeWidth={1.8} />
              </div>
              <CardTitle className="text-2xl font-semibold tracking-tight">{title}</CardTitle>
              <CardDescription className="text-sm leading-relaxed text-muted-foreground">
                {description}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <Alert variant="destructive" className="rounded-2xl">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                {message && (
                  <Alert className="rounded-2xl border-emerald-200 bg-emerald-50/80 text-emerald-700">
                    <AlertDescription>{message}</AlertDescription>
                  </Alert>
                )}
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm font-medium">
                    Email
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="h-11 rounded-xl bg-white/70 transition-shadow duration-300 focus-visible:ring-2"
                    placeholder="name@olx.com"
                    disabled={codeSent || loading}
                    required
                  />
                </div>
                {codeSent && (
                  <div className="space-y-2">
                    <Label htmlFor="code" className="text-sm font-medium">
                      Login code
                    </Label>
                    <Input
                      id="code"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      value={code}
                      onChange={(event) => setCode(event.target.value)}
                      className="h-11 rounded-xl bg-white/70 text-center text-lg tracking-[0.35em] transition-shadow duration-300 focus-visible:ring-2"
                      placeholder="000000"
                      required
                    />
                  </div>
                )}
                <Button
                  type="submit"
                  className="h-11 w-full rounded-xl text-sm font-medium shadow-sm transition-all duration-300 hover:shadow-md"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {codeSent ? "Checking code..." : "Sending code..."}
                    </>
                  ) : codeSent ? (
                    "Verify code"
                  ) : (
                    "Send login code"
                  )}
                </Button>
                {codeSent && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-9 w-full rounded-xl text-xs font-medium text-muted-foreground"
                    onClick={handleUseDifferentEmail}
                    disabled={loading}
                  >
                    Use a different email
                  </Button>
                )}
              </form>
            </CardContent>
          </Card>
          {footer}
        </div>
      </main>
    </div>
  );
};

export default OrderAuthLogin;
