import { ArrowRight, BarChart3, ShieldCheck, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const highlights = [
  {
    icon: ShieldCheck,
    title: "Reliable by Design",
    description: "Execute large promotion batches confidently with clear success and error visibility.",
  },
  {
    icon: Sparkles,
    title: "Quietly Powerful",
    description: "Focused workflows and measured feedback keep teams in flow during time-sensitive updates.",
  },
  {
    icon: BarChart3,
    title: "Actionable Insights",
    description: "Review performance and issues quickly, then iterate without switching tools.",
  },
];

const Index = () => {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-50 border-b border-white/70 bg-white/72 backdrop-blur-xl">
        <div className="section-shell flex h-14 items-center justify-between">
          <div className="text-sm font-semibold tracking-tight">Promo Buddy</div>
          <nav aria-label="Primary" className="flex items-center gap-2">
            <Button asChild variant="ghost" className="rounded-full px-4 text-xs sm:text-sm">
              <Link to="/login">Sign in</Link>
            </Button>
            <Button asChild className="rounded-full px-4 text-xs shadow-sm sm:text-sm">
              <Link to="/runner">Open Dashboard</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main>
        <section className="section-shell hero-glow pb-16 pt-20 sm:pb-24 sm:pt-24">
          <div className="mx-auto max-w-3xl text-center fade-up">
            <span className="inline-flex items-center rounded-full border border-white/80 bg-white/70 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur-sm">
              Promotion Operations, Refined
            </span>
            <h1 className="mt-6 text-4xl font-semibold leading-tight text-foreground sm:text-5xl lg:text-6xl">
              Launch campaigns with calm precision.
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              A minimalist workspace for uploading, running, and monitoring VAS promotion batches at scale,
              designed for clarity under pressure.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button asChild size="lg" className="group h-11 rounded-full px-6 text-sm font-medium shadow-sm transition-all duration-300 hover:shadow-md">
                <Link to="/login">
                  Get Started
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-11 rounded-full border-white/80 bg-white/60 px-6 text-sm backdrop-blur-sm hover:bg-white/90">
                <Link to="/runner">View Dashboard</Link>
              </Button>
            </div>
          </div>
        </section>

        <section className="section-shell pb-20 sm:pb-28">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {highlights.map(({ icon: Icon, title, description }, idx) => (
              <Card
                key={title}
                className="glass lift-hover rounded-3xl border-white/80"
                style={{ animationDelay: `${idx * 90}ms` }}
              >
                <CardContent className="fade-up space-y-4 p-6 sm:p-7">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" strokeWidth={1.7} />
                  </div>
                  <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
                  <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
};

export default Index;
