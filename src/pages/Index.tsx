import MultiLayerAuth from '@/components/MultiLayerAuth';

const Index = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      <div className="w-full max-w-2xl space-y-8">
        <div className="text-center space-y-4 mb-8">
          <h1 className="text-4xl font-bold text-white">
            Multi-Layer Authentication System
          </h1>
          <p className="text-slate-300">
            Advanced security with phone verification, OTP, device fingerprinting, and facial recognition
          </p>
        </div>
        <MultiLayerAuth />
      </div>
    </div>
  );
};

export default Index;
