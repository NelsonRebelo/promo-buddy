import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "offer_token_info";

const Index = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== "offer-token-info") return;

      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(event.data.payload));
      navigate("/offer-promotion-debug");
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [navigate]);

  const openOfferLoginPopup = () => {
    window.open(
      "/offer-promotion-popup",
      "offer-promotion-login",
      "popup=yes,width=560,height=760,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes",
    );
  };

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <img
          src="https://media.licdn.com/dms/image/v2/C4D1BAQH4PUv6QKg_Ag/company-background_10000/company-background_10000/0/1591019721058/standvirtual_cover?e=1772942400&v=beta&t=Pb1KZ6O_5v6YZDtU4JFVwJ99EWiYEkzDRkaHG6aj8vo"
          alt=""
          className="h-full w-full scale-105 object-cover blur-sm"
        />
        <div className="absolute inset-0 bg-white/62" />
      </div>

      <header className="border-b border-white/60 bg-white/65 backdrop-blur-xl">
        <div className="section-shell flex h-14 items-center">
          <span className="text-sm font-semibold tracking-tight">Promo Buddy</span>
        </div>
      </header>

      <main className="section-shell relative flex min-h-[calc(100vh-3.5rem)] items-center justify-center py-10 sm:py-16">
        <Card className="glass w-full max-w-2xl rounded-3xl border-white/80">
          <CardHeader className="space-y-2 pb-4 text-center">
            <CardTitle className="text-3xl font-semibold tracking-tight">Choose Promotion Type</CardTitle>
            <CardDescription>Select how you want to proceed.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Button asChild className="h-12 rounded-xl text-sm font-medium shadow-sm">
              <Link to="/login">Investment promotion</Link>
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-12 rounded-xl border-white/80 bg-white/70 text-sm"
              onClick={openOfferLoginPopup}
            >
              Offer Promotion
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default Index;
