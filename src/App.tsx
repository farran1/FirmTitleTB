// src/App.tsx
import React from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Videos from "./pages/Videos";
import Contact from "./pages/Contact";
import Calculators from "./pages/Calculators";
import BuyerClosingCost from "./pages/BuyerClosingCost";
import ClosingCostEstimatorPage from "./pages/ClosingCostEstimator";
import NotFound from "./pages/NotFound";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";

const queryClient = new QueryClient();

const App: React.FC = () => (
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        {/* your existing Toasters */}
        <Toaster />
        <Sonner />

        {/* ← no BrowserRouter here! */}
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/videos" element={<Videos />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/calculators" element={<Calculators />} />
          <Route path="/calculators/buyer" element={<BuyerClosingCost />} />
          <Route path="/calculators/closing" element={<ClosingCostEstimatorPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </TooltipProvider>
    </QueryClientProvider>
  </React.StrictMode>
);

export default App;
