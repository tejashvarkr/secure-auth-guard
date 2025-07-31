import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import FingerprintJS from '@fingerprintjs/fingerprintjs';

interface FingerprintData {
  visitorId: string;
  confidence: number;
  geolocation?: {
    latitude: number;
    longitude: number;
  };
  ipLocation?: any;
}

interface AuthState {
  currentStep: 'phone-captcha' | 'credentials' | 'signup-details' | 'otp' | 'face';
  authFlowType: 'login' | 'signup';
  verificationToken?: string;
  phoneNumber: string;
  username: string;
  isAuthenticated: boolean;
  user?: any;
}

export default function MultiLayerAuth() {
  const { toast } = useToast();
  const [authState, setAuthState] = useState<AuthState>({
    currentStep: 'phone-captcha',
    authFlowType: 'login',
    phoneNumber: '',
    username: '',
    isAuthenticated: false
  });

  const [formData, setFormData] = useState({
    phoneNumber: '',
    username: '',
    password: '',
    confirmPassword: '',
    otp: ''
  });

  const [fingerprintData, setFingerprintData] = useState<FingerprintData | null>(null);
  const [loading, setLoading] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Initialize FingerprintJS and get geolocation
  useEffect(() => {
    const initFingerprint = async () => {
      try {
        const fp = await FingerprintJS.load();
        const result = await fp.get();

        // Get geolocation
        const getGeolocation = (): Promise<GeolocationPosition> => {
          return new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 10000
            });
          });
        };

        let geolocation;
        try {
          const position = await getGeolocation();
          geolocation = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          };
        } catch (error) {
          console.warn('Geolocation not available:', error);
        }

        setFingerprintData({
          visitorId: result.visitorId,
          confidence: result.confidence.score,
          geolocation
        });
      } catch (error) {
        console.error('Fingerprint initialization failed:', error);
      }
    };

    initFingerprint();
  }, []);

  const handlePhoneCaptchaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // In a real implementation, you would handle reCAPTCHA here
      const recaptchaToken = 'dummy-token'; // Replace with actual reCAPTCHA token

      const response = await supabase.functions.invoke('verify-phone-captcha', {
        body: {
          phoneNumber: formData.phoneNumber,
          recaptchaToken
        }
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      const data = response.data;
      setAuthState(prev => ({
        ...prev,
        currentStep: data.currentStep,
        authFlowType: data.status === 'proceedToLogin' ? 'login' : 'signup',
        verificationToken: data.verificationToken,
        phoneNumber: formData.phoneNumber
      }));

      toast({
        title: "Phone verified",
        description: `Proceeding to ${data.status === 'proceedToLogin' ? 'login' : 'signup'}`
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const endpoint = authState.authFlowType === 'login' ? 'login-credentials' : 'signup';
      const response = await supabase.functions.invoke(endpoint, {
        body: {
          phoneNumber: authState.phoneNumber,
          username: formData.username,
          password: formData.password,
          verificationToken: authState.verificationToken,
          authFlowType: authState.authFlowType,
          fingerprintData
        }
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      setAuthState(prev => ({
        ...prev,
        currentStep: 'otp',
        username: formData.username
      }));

      toast({
        title: "OTP Sent",
        description: "Check your phone for the verification code"
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await supabase.functions.invoke('verify-otp', {
        body: {
          phoneNumber: authState.phoneNumber,
          username: authState.username,
          otp: formData.otp,
          verificationToken: authState.verificationToken,
          authFlowType: authState.authFlowType,
          fingerprintData
        }
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      const data = response.data;

      if (data.challengeType === 'face') {
        setAuthState(prev => ({ ...prev, currentStep: 'face' }));
        toast({
          title: "Face verification required",
          description: data.facePrompt
        });
      } else if (data.success) {
        localStorage.setItem('authToken', data.token);
        setAuthState(prev => ({
          ...prev,
          isAuthenticated: true,
          user: data.user
        }));
        toast({
          title: "Authentication successful",
          description: "Welcome back!"
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const initCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (error) {
      toast({
        title: "Camera Error",
        description: "Unable to access camera",
        variant: "destructive"
      });
    }
  };

  const captureImage = () => {
    if (videoRef.current && canvasRef.current) {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      const context = canvas.getContext('2d');
      
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      if (context) {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/jpeg');
      }
    }
    return null;
  };

  const handleFaceSubmit = async () => {
    setLoading(true);

    try {
      const imageDataUrl = captureImage();
      if (!imageDataUrl) {
        throw new Error('Failed to capture image');
      }

      const response = await supabase.functions.invoke('verify-face', {
        body: {
          imageDataUrl,
          verificationToken: authState.verificationToken
        }
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      const data = response.data;
      if (data.success) {
        localStorage.setItem('authToken', data.token);
        setAuthState(prev => ({
          ...prev,
          isAuthenticated: true,
          user: data.user
        }));
        
        // Stop camera
        if (videoRef.current?.srcObject) {
          const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
          tracks.forEach(track => track.stop());
        }

        toast({
          title: "Authentication successful",
          description: "Face verification completed!"
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    const token = localStorage.getItem('authToken');
    if (token) {
      try {
        await supabase.functions.invoke('logout', {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
      } catch (error) {
        console.error('Logout error:', error);
      }
    }

    localStorage.removeItem('authToken');
    setAuthState({
      currentStep: 'phone-captcha',
      authFlowType: 'login',
      phoneNumber: '',
      username: '',
      isAuthenticated: false
    });
    setFormData({
      phoneNumber: '',
      username: '',
      password: '',
      confirmPassword: '',
      otp: ''
    });

    toast({
      title: "Logged out",
      description: "You have been successfully logged out"
    });
  };

  useEffect(() => {
    if (authState.currentStep === 'face') {
      initCamera();
    }
  }, [authState.currentStep]);

  if (authState.isAuthenticated) {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardHeader>
          <CardTitle>Welcome, {authState.user?.username}!</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p>You are successfully authenticated with our multi-layer security system.</p>
          <Button onClick={handleLogout} className="w-full">
            Logout
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle>
          {authState.currentStep === 'phone-captcha' && 'Phone Verification'}
          {authState.currentStep === 'credentials' && 'Login'}
          {authState.currentStep === 'signup-details' && 'Create Account'}
          {authState.currentStep === 'otp' && 'OTP Verification'}
          {authState.currentStep === 'face' && 'Face Verification'}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {authState.currentStep === 'phone-captcha' && (
          <form onSubmit={handlePhoneCaptchaSubmit} className="space-y-4">
            <div>
              <Label htmlFor="phoneNumber">Phone Number</Label>
              <Input
                id="phoneNumber"
                type="tel"
                value={formData.phoneNumber}
                onChange={(e) => setFormData(prev => ({ ...prev, phoneNumber: e.target.value }))}
                placeholder="+1234567890"
                required
              />
            </div>
            <div className="p-4 border border-gray-300 rounded">
              {/* reCAPTCHA would go here in a real implementation */}
              <p className="text-sm text-gray-600">reCAPTCHA verification (simulated)</p>
            </div>
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? 'Verifying...' : 'Verify Phone'}
            </Button>
          </form>
        )}

        {(authState.currentStep === 'credentials' || authState.currentStep === 'signup-details') && (
          <form onSubmit={handleCredentialsSubmit} className="space-y-4">
            <div>
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={formData.username}
                onChange={(e) => setFormData(prev => ({ ...prev, username: e.target.value }))}
                required
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={formData.password}
                onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                required
              />
            </div>
            {authState.currentStep === 'signup-details' && (
              <div>
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                  required
                />
              </div>
            )}
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? 'Processing...' : (authState.currentStep === 'credentials' ? 'Login' : 'Create Account')}
            </Button>
          </form>
        )}

        {authState.currentStep === 'otp' && (
          <form onSubmit={handleOtpSubmit} className="space-y-4">
            <div>
              <Label htmlFor="otp">Verification Code</Label>
              <Input
                id="otp"
                value={formData.otp}
                onChange={(e) => setFormData(prev => ({ ...prev, otp: e.target.value }))}
                placeholder="123456"
                maxLength={6}
                required
              />
              <p className="text-sm text-gray-600 mt-1">
                Enter the 6-digit code sent to {authState.phoneNumber}
              </p>
            </div>
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? 'Verifying...' : 'Verify OTP'}
            </Button>
          </form>
        )}

        {authState.currentStep === 'face' && (
          <div className="space-y-4">
            <div className="text-center">
              <p className="text-sm text-gray-600 mb-4">
                Position your face in the camera frame and click capture
              </p>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                className="w-full max-w-sm mx-auto rounded-lg border"
              />
              <canvas ref={canvasRef} className="hidden" />
            </div>
            <Button onClick={handleFaceSubmit} disabled={loading} className="w-full">
              {loading ? 'Processing...' : 'Capture & Verify'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}