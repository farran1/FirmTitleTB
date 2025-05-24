
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Calculator } from "lucide-react";

const Calculators = () => {
  const [loanAmount, setLoanAmount] = useState("");
  const [interestRate, setInterestRate] = useState("");
  const [loanTerm, setLoanTerm] = useState("");
  const [monthlyPayment, setMonthlyPayment] = useState<number | null>(null);
  
  const calculateMortgage = () => {
    const principal = parseFloat(loanAmount);
    const monthlyRate = parseFloat(interestRate) / 100 / 12;
    const numberOfPayments = parseFloat(loanTerm) * 12;
    
    if (principal > 0 && monthlyRate > 0 && numberOfPayments > 0) {
      const x = Math.pow(1 + monthlyRate, numberOfPayments);
      const monthly = (principal * x * monthlyRate) / (x - 1);
      setMonthlyPayment(monthly);
    } else {
      setMonthlyPayment(null);
    }
  };
  
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <div className="flex-grow pt-20">
        <div className="container mx-auto px-4 py-8">
          <h1 className="text-3xl md:text-4xl font-bold mb-6 text-slate-700">Calculators</h1>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-white/80 rounded-lg shadow-md p-6">
              <div className="flex items-center mb-4 gap-2">
                <Calculator className="h-6 w-6 text-slate-600/70" />
                <h2 className="text-2xl font-semibold text-slate-700">Mortgage Calculator</h2>
              </div>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="loanAmount">Loan Amount ($)</Label>
                  <Input 
                    id="loanAmount" 
                    type="number" 
                    placeholder="e.g., 250000" 
                    value={loanAmount}
                    onChange={(e) => setLoanAmount(e.target.value)}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="interestRate">Interest Rate (%)</Label>
                  <Input 
                    id="interestRate" 
                    type="number" 
                    step="0.01" 
                    placeholder="e.g., 4.5" 
                    value={interestRate}
                    onChange={(e) => setInterestRate(e.target.value)}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="loanTerm">Loan Term (years)</Label>
                  <Input 
                    id="loanTerm" 
                    type="number" 
                    placeholder="e.g., 30" 
                    value={loanTerm}
                    onChange={(e) => setLoanTerm(e.target.value)}
                  />
                </div>
                
                <Button onClick={calculateMortgage} className="w-full bg-slate-600/70 hover:bg-slate-700/70">
                  Calculate
                </Button>
                
                {monthlyPayment !== null && (
                  <div className="mt-4 p-4 bg-slate-100 rounded-md">
                    <p className="text-lg font-semibold text-slate-700">
                      Monthly Payment: ${monthlyPayment.toFixed(2)}
                    </p>
                  </div>
                )}
              </div>
            </div>
            
            <div className="bg-white/80 rounded-lg shadow-md p-6">
              <div className="flex items-center mb-4 gap-2">
                <Calculator className="h-6 w-6 text-slate-600/70" />
                <h2 className="text-2xl font-semibold text-slate-700">Closing Cost Estimator</h2>
              </div>
              
              <div className="p-4 text-center bg-slate-100 rounded-md">
                <p className="text-slate-600 mb-4">
                  Our closing cost estimator is currently being developed.
                </p>
                <p className="text-slate-600">
                  Please check back soon or contact us for a personalized closing cost estimate.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default Calculators;
