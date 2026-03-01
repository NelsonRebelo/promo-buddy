import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, Loader2, LockKeyhole } from "lucide-react";
import { login, getStatus } from "@/lib/api";

const Login = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    getStatus()
      .then((s) => {
        if (s.loggedIn) navigate("/runner", { replace: true });
      })
      .catch(() => {})
      .finally(() => setChecking(false));
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await login(form);
      if (res.ok) {
        navigate("/runner", { replace: true });
      } else {
        setError(res.error || "Login failed");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-white/60 bg-white/65 backdrop-blur-xl">
        <div className="section-shell flex h-14 items-center justify-between">
          <Button asChild variant="ghost" className="rounded-full px-3 text-xs sm:text-sm">
            <Link to="/">
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Back
            </Link>
          </Button>
          <span className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Secure Access</span>
        </div>
      </header>

      <main className="section-shell flex min-h-[calc(100vh-3.5rem)] items-center py-10 sm:py-16">
        <div className="mx-auto grid w-full max-w-5xl gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:gap-12">
          <section className="hero-glow fade-up space-y-6 self-center">
            <p className="inline-flex items-center rounded-full border border-white/70 bg-white/70 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur-sm">
              VAS Promotion Console
            </p>
            <h1 className="text-4xl font-semibold leading-tight sm:text-5xl">
              Sign in to continue your campaign workflow.
            </h1>
            <p className="max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              Designed for operational focus, with clear progress visibility and fast execution across bulk promotion requests.
            </p>
          </section>

          <Card className="glass fade-up rounded-3xl border-white/80">
            <CardHeader className="space-y-2 pb-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <LockKeyhole className="h-5 w-5" strokeWidth={1.8} />
              </div>
              <CardTitle className="text-2xl font-semibold tracking-tight">Welcome back</CardTitle>
              <CardDescription className="text-sm leading-relaxed text-muted-foreground">
                Authenticate with your upstream API credentials.
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
                  <Label htmlFor="username" className="text-sm font-medium">
                    Username
                  </Label>
                  <Input
                    id="username"
                    value={form.username}
                    onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                    className="h-11 rounded-xl bg-white/70 transition-shadow duration-300 focus-visible:ring-2"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-sm font-medium">
                    Password
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                    className="h-11 rounded-xl bg-white/70 transition-shadow duration-300 focus-visible:ring-2"
                    required
                  />
                </div>
                <Button
                  type="submit"
                  className="h-11 w-full rounded-xl text-sm font-medium shadow-sm transition-all duration-300 hover:shadow-md"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Logging in...
                    </>
                  ) : (
                    "Login"
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

export default Login;
