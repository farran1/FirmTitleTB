// src/pages/Calculators.tsx
import React from "react";
import { Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";

const Calculators: React.FC = () => (
  <div className="min-h-screen flex flex-col">
    <Navbar />

    <main className="flex-grow pt-20">
      <div className="container mx-auto px-4 py-12 text-center">
        <h1 className="text-4xl font-bold mb-8">Calculators</h1>
        <div className="flex flex-col md:flex-row justify-center gap-6">
          <Link to="/calculators/buyer">
            <Button className="px-8 py-4">Buyer’s Closing Cost</Button>
          </Link>
          <Link to="/calculators/closing">
            <Button className="px-8 py-4">Closing Cost Estimator</Button>
          </Link>
        </div>
      </div>
    </main>

    <Footer />
  </div>
);

export default Calculators;
