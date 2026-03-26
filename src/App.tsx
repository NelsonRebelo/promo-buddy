import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Login from "./pages/Login";
import Runner from "./pages/Runner";
import OfferLogin from "./pages/OfferLogin";
import OfferMfa from "./pages/OfferMfa";
import OfferRunner from "./pages/OfferRunner";
import OfferPromotionResult from "./pages/OfferPromotionResult";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/login" element={<Login />} />
          <Route path="/runner" element={<Runner />} />
          <Route path="/offer-login" element={<OfferLogin />} />
          <Route path="/offer-mfa" element={<OfferMfa />} />
          <Route path="/offer-runner" element={<OfferRunner />} />
          <Route path="/offer-promotion-debug" element={<OfferPromotionResult />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
