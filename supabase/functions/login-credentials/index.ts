import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const sendOTP = async (phoneNumber: string, otp: string) => {
  const twilioSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');
  const twilioPhoneNumber = Deno.env.get('TWILIO_PHONE_NUMBER');

  if (!twilioSid || !twilioAuthToken || !twilioPhoneNumber) {
    throw new Error('Twilio credentials not configured');
  }

  const authHeader = btoa(`${twilioSid}:${twilioAuthToken}`);
  
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${authHeader}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      From: twilioPhoneNumber,
      To: phoneNumber,
      Body: `Your verification code is: ${otp}`,
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to send SMS');
  }

  return response.json();
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { phoneNumber, username, password, verificationToken, fingerprintData } = await req.json();
    const clientIP = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get pending verification
    const { data: pendingVerification, error: verificationError } = await supabase
      .from('pending_verifications')
      .select('*')
      .eq('verification_token', verificationToken)
      .eq('current_step', 'credentials')
      .eq('auth_flow_type', 'login')
      .maybeSingle();

    if (verificationError || !pendingVerification) {
      return new Response(
        JSON.stringify({ error: 'Invalid verification token' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify user credentials
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('phone_number', phoneNumber)
      .eq('username', username)
      .maybeSingle();

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid credentials' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate and send OTP
    const otp = generateOTP();
    
    try {
      await sendOTP(phoneNumber, otp);
    } catch (error) {
      console.error('Error sending OTP:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to send OTP' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update pending verification with fingerprint data and OTP
    const { error: updateError } = await supabase
      .from('pending_verifications')
      .update({
        expected_otp: otp,
        current_step: 'otp',
        fingerprint_data_at_credentials: fingerprintData,
        ip_address_at_credentials: clientIP,
        precise_location_at_credentials: fingerprintData?.geolocation || null,
        user_id: user.id
      })
      .eq('verification_token', verificationToken);

    if (updateError) {
      console.error('Error updating verification:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to update verification' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ challengeType: 'otp' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in login-credentials:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});