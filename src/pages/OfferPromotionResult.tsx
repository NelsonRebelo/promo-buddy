import { useNavigate } from "react-router-dom";
import { ArrowLeft, Construction } from "lucide-react";
import { Button } from "@/components/ui/button";

const OfferPromotionResult = () => {
  const navigate = useNavigate();

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate("/", { replace: true });
  };

  return (
    <div className="min-h-screen">
      <header className="border-b border-white/60 bg-white/65 backdrop-blur-xl">
        <div className="section-shell flex h-14 items-center justify-between">
          <Button type="button" variant="ghost" size="sm" onClick={handleBack} className="rounded-full px-3">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back
          </Button>
          <span className="text-sm font-semibold tracking-tight">Promo Buddy</span>
          <span className="w-[76px]" />
        </div>
      </header>

      <main className="section-shell flex min-h-[calc(100vh-3.5rem)] items-center justify-center py-10 sm:py-16">
        <div className="glass w-full max-w-2xl rounded-3xl border-white/80 p-8 text-center sm:p-10">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Construction className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Offer Promotion Under Construction</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            We are finalizing a secure flow to retrieve required data from external login. This section will be available soon.
          </p>
        </div>
      </main>
    </div>
  );
};

export default OfferPromotionResult;
