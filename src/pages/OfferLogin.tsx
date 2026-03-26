import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, ShieldEllipsis } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { offerLogin } from "@/lib/api";

const OfferLogin = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate("/", { replace: true });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await offerLogin(form);
      if (res.ok) {
        if (res.requires_mfa) {
          navigate("/offer-mfa", { replace: true });
          return;
        }
        navigate("/offer-runner", { replace: true });
      } else {
        setError(res.detail || res.error || "Offer promotion login failed.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
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
            <CardHeader className="space-y-2 pb-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <ShieldEllipsis className="h-5 w-5" strokeWidth={1.8} />
              </div>
              <CardTitle className="text-2xl font-semibold tracking-tight">Offer promotion login</CardTitle>
              <CardDescription className="text-sm leading-relaxed text-muted-foreground">
                Enter your Standvirtual credentials so Promo Buddy can attempt the Offer Promotion
                login flow server-side.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <Alert variant="destructive" className="rounded-2xl">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                <div className="space-y-2">
                  <Label htmlFor="offer-username" className="text-sm font-medium">
                    Username
                  </Label>
                  <Input
                    id="offer-username"
                    value={form.username}
                    onChange={(e) => setForm((current) => ({ ...current, username: e.target.value }))}
                    className="h-11 rounded-xl bg-white/70"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="offer-password" className="text-sm font-medium">
                    Password
                  </Label>
                  <Input
                    id="offer-password"
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm((current) => ({ ...current, password: e.target.value }))}
                    className="h-11 rounded-xl bg-white/70"
                    required
                  />
                </div>
                <Button type="submit" className="h-11 w-full rounded-xl text-sm font-medium" disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Testing login...
                    </>
                  ) : (
                    "Continue"
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default OfferLogin;
