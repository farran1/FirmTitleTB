// src/pages/Calculators.tsx
import React from "react";
import { Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import FirmCalculator from '../components/FirmCalculator';

const Calculators: React.FC = () => (
  <div className="min-h-screen flex flex-col relative">
    <Navbar />
    <main className="flex-grow pt-24">

      <FirmCalculator />
      <div className="flex flex-col md:flex-row justify-center gap-6 mt-8 mb-12">
        <Link to="/calculators/buyer">
          <Button className="px-8 py-4">Buyer’s Closing Cost</Button>
        </Link>
        <Link to="/calculators/closing">
          <Button className="px-8 py-4">Closing Cost Estimator</Button>
        </Link>
      </div>
    </main>
    <Footer />
  </div>
);

export default Calculators;
