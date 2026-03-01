import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const Index = () => {
  const openOfferLoginPopup = () => {
    window.open(
      "https://www.standvirtual.com/adminpanel/login/",
      "offer-promotion-login",
      "popup=yes,width=560,height=760,menubar=no,toolbar=no,location=yes,status=no,resizable=yes,scrollbars=yes",
    );
  };

  return (
    <div className="min-h-screen">
      <header className="border-b border-white/60 bg-white/65 backdrop-blur-xl">
        <div className="section-shell flex h-14 items-center">
          <span className="text-sm font-semibold tracking-tight">Promo Buddy</span>
        </div>
      </header>

      <main className="section-shell flex min-h-[calc(100vh-3.5rem)] items-center justify-center py-10 sm:py-16">
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
