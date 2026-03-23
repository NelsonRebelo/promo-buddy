import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const Index = () => {
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
        <div className="section-shell flex h-14 items-center justify-center">
          <span className="text-sm font-medium text-muted-foreground">Promo Buddy</span>
        </div>
      </header>

      <main className="section-shell relative flex min-h-[calc(100vh-3.5rem)] items-center justify-center py-10 sm:py-16">
        <div className="w-full max-w-4xl">
          <img
            src="/promobuddy-home-logo.png"
            alt="Promo Buddy"
            className="mx-auto mb-6 h-28 w-auto object-contain"
          />
          <Card className="glass w-full rounded-3xl border-white/80">
            <CardContent className="flex flex-col items-center justify-center gap-3 pt-8 sm:flex-row sm:gap-4 sm:pt-10">
              <Button asChild className="h-12 w-full max-w-sm rounded-xl text-sm font-medium shadow-sm">
                <Link to="/login">Investment promotion</Link>
              </Button>
              <Button
                asChild
                variant="outline"
                className="h-12 w-full max-w-sm rounded-xl border-white/80 bg-white/70 text-sm"
              >
                <Link to="/offer-login">Offer promotion</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default Index;
