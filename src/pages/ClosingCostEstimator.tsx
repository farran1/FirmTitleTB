// src/pages/ClosingCostEstimator.tsx
import React from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const ClosingCostEstimator: React.FC = () => (
  <div className="min-h-screen flex flex-col">
    <Navbar />

    <main className="flex-grow pt-20">
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-semibold mb-6">Closing Cost Estimator</h1>
        <div className="w-full overflow-hidden">
          <iframe
            src="https://thefundrecalc.com/calcs/closing-costs?utm_content=version01&utm_source=TheFund&utm_medium=embed&utm_campaign=calculator&utm_term=closing_costs&embedCompany=FirmTitleTB&embedPhone=(813)%20812-4949&embedCity=Tampa&embedState=Florida&embedZip=33609"
            width="100%"
            height="2950"
            frameBorder={0}
            scrolling="yes"
            title="Closing Cost Estimator"
            className="block border-none"
          />
        </div>
      </div>
    </main>

    <Footer />
  </div>
);

export default ClosingCostEstimator;
