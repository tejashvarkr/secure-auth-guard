-- Create custom types
CREATE TYPE auth_flow_type AS ENUM ('login', 'signup');
CREATE TYPE verification_step AS ENUM ('credentials', 'signupDetails', 'otp', 'face');
CREATE TYPE session_status AS ENUM ('active', 'revoked');

-- Users table (extending auth capabilities)
CREATE TABLE public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  phone_number TEXT UNIQUE NOT NULL,
  enrolled_face_template TEXT,
  trusted_visitor_ids TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Active sessions table
CREATE TABLE public.active_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID UNIQUE DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  token TEXT,
  issued_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  last_accessed TIMESTAMP WITH TIME ZONE DEFAULT now(),
  fingerprint_visitor_id TEXT,
  ip_address INET,
  ip_location JSONB,
  precise_location JSONB,
  status session_status DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Pending verifications table
CREATE TABLE public.pending_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  verification_token UUID UNIQUE DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  username TEXT,
  expected_otp TEXT,
  current_step verification_step NOT NULL,
  auth_flow_type auth_flow_type NOT NULL,
  fingerprint_data_at_credentials JSONB,
  ip_address_at_credentials INET,
  precise_location_at_credentials JSONB,
  fingerprint_data_at_otp_request JSONB,
  ip_address_at_otp_request INET,
  precise_location_at_otp_request JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (now() + INTERVAL '5 minutes')
);

-- Enable RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.active_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pending_verifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies for users
CREATE POLICY "Users can view their own profile" ON public.users
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile" ON public.users
  FOR UPDATE USING (auth.uid() = user_id);

-- RLS Policies for active_sessions
CREATE POLICY "Users can view their own sessions" ON public.active_sessions
  FOR SELECT USING (user_id IN (SELECT id FROM public.users WHERE user_id = auth.uid()));

CREATE POLICY "Users can update their own sessions" ON public.active_sessions
  FOR UPDATE USING (user_id IN (SELECT id FROM public.users WHERE user_id = auth.uid()));

-- RLS Policies for pending_verifications (more permissive for auth flow)
CREATE POLICY "Anyone can create pending verifications" ON public.pending_verifications
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can view pending verifications" ON public.pending_verifications
  FOR SELECT USING (true);

CREATE POLICY "Anyone can update pending verifications" ON public.pending_verifications
  FOR UPDATE USING (true);

-- Function to clean up expired verifications
CREATE OR REPLACE FUNCTION clean_expired_verifications()
RETURNS void AS $$
BEGIN
  DELETE FROM public.pending_verifications 
  WHERE expires_at < now();
END;
$$ LANGUAGE plpgsql;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Indexes for performance
CREATE INDEX idx_users_user_id ON public.users(user_id);
CREATE INDEX idx_users_phone_number ON public.users(phone_number);
CREATE INDEX idx_users_username ON public.users(username);
CREATE INDEX idx_active_sessions_user_id ON public.active_sessions(user_id);
CREATE INDEX idx_active_sessions_session_id ON public.active_sessions(session_id);
CREATE INDEX idx_pending_verifications_token ON public.pending_verifications(verification_token);
CREATE INDEX idx_pending_verifications_phone ON public.pending_verifications(phone_number);