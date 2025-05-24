
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const About = () => {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <div className="flex-grow pt-20">
        <div className="container mx-auto px-4 py-8">
          <h1 className="text-3xl md:text-4xl font-bold mb-6 text-slate-700">About Us</h1>
          <div className="bg-white/80 rounded-lg shadow-md p-6 mb-8">
            <p className="mb-4 text-slate-700">
              Welcome to our title firm, where we provide exceptional title services with a commitment to excellence and integrity.
            </p>
            <p className="mb-4 text-slate-700">
              With years of industry experience, our team of professionals is dedicated to ensuring smooth and secure property transactions for all our clients.
            </p>
            <p className="mb-4 text-slate-700">
              We understand the importance of reliable title services in real estate transactions, and we strive to deliver accurate, timely, and comprehensive solutions tailored to your specific needs.
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-white/80 rounded-lg shadow-md p-6">
              <h2 className="text-2xl font-semibold mb-4 text-slate-700">Our Mission</h2>
              <p className="text-slate-600">
                To provide exceptional title services with unmatched accuracy and efficiency, ensuring peace of mind for all parties involved in property transactions.
              </p>
            </div>
            
            <div className="bg-white/80 rounded-lg shadow-md p-6">
              <h2 className="text-2xl font-semibold mb-4 text-slate-700">Our Vision</h2>
              <p className="text-slate-600">
                To be the most trusted name in title services, known for our dedication to excellence, integrity, and client satisfaction.
              </p>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default About;
