import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const counties = [
  { name: "Hillsborough County", url: "https://www.hcpafl.org/E-Filing/Homestead-E-file" },
  { name: "Pinellas County", url: "https://www.pcpao.gov/E-File-Homestead-Exemption/Welcome" },
  { name: "Pasco County", url: "https://pascopa.com/exemptions/exemptions/homestead/" },
  { name: "Polk County", url: "https://exemptions.polkflpa.gov/Account/LogOn?ReturnUrl=%2f&cookie_test=true" },
  { name: "Manatee County", url: "https://ofa.manateepao.gov/ApplyOnline/WebForm1.aspx" },
  { name: "Hernando County", url: "https://pahxapp.hernandopa-fl.us/" },
  { name: "Citrus County", url: "https://www.citruspa.org/_dnn/Exemptions/Homestead-E-File/Efile1" },
];

const Homestead = () => {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-grow pt-20">
        <div className="max-w-3xl mx-auto px-6 py-12">
          <h1 className="text-3xl font-bold text-slate-800 mb-2">Why Homestead Your Property</h1>
          <p className="text-slate-500 mb-10">Firm Title TB</p>

          <h2 className="text-2xl font-bold text-slate-800 mb-6">Florida Homestead Law: What You Need to Know</h2>
          <p className="text-slate-700 leading-relaxed mb-8">Florida homestead law covers three distinct areas.</p>

          {/* Tax Savings */}
          <div className="bg-white rounded-lg shadow-sm p-7 mb-6 border-l-4 border-blue-600">
            <h3 className="text-lg font-bold text-slate-800 mb-3">1. Tax Savings</h3>
            <p className="text-slate-700 leading-relaxed">
              The "Save Our Homes" rule caps how much your home's taxable value can go up each year — no more than 3% or the rate of inflation, whichever is less. You can apply for this online on your county property appraiser's office website. If you sell and buy a new home, you can transfer up to $500,000 of that tax savings to your new Florida property.
            </p>
          </div>

          {/* Creditor Protection */}
          <div className="bg-white rounded-lg shadow-sm p-7 mb-6 border-l-4 border-blue-600">
            <h3 className="text-lg font-bold text-slate-800 mb-3">2. Creditor Protection</h3>
            <p className="text-slate-700 leading-relaxed">
              Florida's Homestead law protects your homestead from creditors — meaning they generally can't take your home to pay a debt. This protection is automatic. There's no cap on home value, but there is a size limit: half an acre inside city limits, or 160 acres outside city limits.
            </p>
          </div>

          {/* Inheritance */}
          <div className="bg-white rounded-lg shadow-sm p-7 mb-6 border-l-4 border-blue-600">
            <h3 className="text-lg font-bold text-slate-800 mb-3">3. Inheritance Rules</h3>
            <p className="text-slate-700 leading-relaxed mb-4">
              This is where people get tripped up — Florida law controls who gets your home when you die, and it can override your will. If you have a surviving spouse and descendants, your spouse gets a life estate (the right to live there) and your descendants get the remainder. The spouse can't sell without the descendants agreeing, which gets messy fast, especially with blended families.
            </p>
            <p className="text-slate-700 leading-relaxed">
              If there are no minor children, your spouse can waive these rights, or you can title the home jointly as tenants by the entirety, so it passes directly to your surviving spouse.
            </p>
          </div>

          {/* Tip */}
          <div className="bg-amber-50 rounded-lg p-6 mb-10 border-l-4 border-amber-500">
            <p className="text-amber-900 font-bold mb-2">TIP</p>
            <p className="text-amber-900 leading-relaxed">
              If you purchased your home, filed and received a Florida Homestead designation prior to getting married and then marry while owning the home, your spouse will be required to sign the deed when you sell the homesteaded property.
            </p>
          </div>

          {/* County Links */}
          <h2 className="text-2xl font-bold text-slate-800 mb-6">File Online for Homestead in These Counties</h2>
          <div className="flex flex-col gap-3 mb-12">
            {counties.map((county) => (
              <a
                key={county.name}
                href={county.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between bg-white rounded-lg shadow-sm px-6 py-4 hover:shadow-md transition-shadow no-underline"
              >
                <span className="font-bold text-slate-800">{county.name}</span>
                <span className="text-blue-600 text-sm font-semibold">File Now &rarr;</span>
              </a>
            ))}
          </div>

          <div className="text-center pt-8 border-t border-slate-200">
            <p className="text-slate-500 mb-3">Have questions about homestead or your closing? We're here to help.</p>
            <a
              href="/contact"
              className="inline-block bg-blue-600 text-white px-8 py-3 rounded-full font-semibold hover:bg-blue-700 transition-colors no-underline"
            >
              Contact Firm Title TB
            </a>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Homestead;
