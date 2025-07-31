import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper function to calculate distance between two coordinates
const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371; // Radius of the Earth in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

const assessRisk = async (supabase: any, user: any, fingerprintData: any, preciseLocation: any) => {
  let riskScore = 0;

  // Check if device is trusted
  const visitorId = fingerprintData?.visitorId;
  if (visitorId && !user.trusted_visitor_ids.includes(visitorId)) {
    riskScore += 40; // New device
  }

  // Check confidence score
  if (fingerprintData?.confidence && fingerprintData.confidence < 70) {
    riskScore += 30; // Low confidence
  }

  // Check for impossible travel
  if (preciseLocation?.latitude && preciseLocation?.longitude) {
    const { data: recentSessions } = await supabase
      .from('active_sessions')
      .select('precise_location, last_accessed')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('last_accessed', { ascending: false })
      .limit(1);

    if (recentSessions && recentSessions.length > 0) {
      const lastSession = recentSessions[0];
      if (lastSession.precise_location?.latitude && lastSession.precise_location?.longitude) {
        const distance = calculateDistance(
          preciseLocation.latitude,
          preciseLocation.longitude,
          lastSession.precise_location.latitude,
          lastSession.precise_location.longitude
        );
        
        const timeDiff = (new Date().getTime() - new Date(lastSession.last_accessed).getTime()) / (1000 * 60 * 60); // hours
        const maxSpeed = 1000; // km/h (generous limit for air travel)
        
        if (distance > maxSpeed * timeDiff) {
          riskScore += 50; // Impossible travel
        }
      }
    }
  }

  return Math.min(riskScore, 100);
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { phoneNumber, username, otp, verificationToken, authFlowType, fingerprintData } = await req.json();
    const clientIP = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get and verify pending verification
    const { data: pendingVerification, error: verificationError } = await supabase
      .from('pending_verifications')
      .select('*')
      .eq('verification_token', verificationToken)
      .eq('current_step', 'otp')
      .eq('expected_otp', otp)
      .eq('phone_number', phoneNumber)
      .maybeSingle();

    if (verificationError || !pendingVerification) {
      return new Response(
        JSON.stringify({ error: 'Invalid OTP or verification token' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get user data
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', pendingVerification.user_id)
      .single();

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'User not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update verification with latest fingerprint data
    await supabase
      .from('pending_verifications')
      .update({
        fingerprint_data_at_otp_request: fingerprintData,
        ip_address_at_otp_request: clientIP,
        precise_location_at_otp_request: fingerprintData?.geolocation || null
      })
      .eq('verification_token', verificationToken);

    // Risk assessment for login flow
    if (authFlowType === 'login') {
      const riskScore = await assessRisk(supabase, user, fingerprintData, fingerprintData?.geolocation);

      if (riskScore >= 80) {
        // Very high risk - deny access
        await supabase
          .from('pending_verifications')
          .delete()
          .eq('verification_token', verificationToken);

        return new Response(
          JSON.stringify({ error: 'Access denied. Please contact support.' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (riskScore >= 30 && user.enrolled_face_template) {
        // Medium-high risk with enrolled face - require face verification
        await supabase
          .from('pending_verifications')
          .update({ current_step: 'face' })
          .eq('verification_token', verificationToken);

        return new Response(
          JSON.stringify({
            challengeType: 'face',
            facePrompt: 'Please align your face with the camera for verification.'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // For signup flow, check if face enrollment is needed
    if (authFlowType === 'signup' && !user.enrolled_face_template) {
      await supabase
        .from('pending_verifications')
        .update({ current_step: 'face' })
        .eq('verification_token', verificationToken);

      return new Response(
        JSON.stringify({
          challengeType: 'face',
          facePrompt: 'Please enroll your face for additional security.'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Proceed to token issuance (low risk or no face enrollment needed)
    // Revoke all existing sessions for this user
    await supabase
      .from('active_sessions')
      .update({ status: 'revoked' })
      .eq('user_id', user.id)
      .eq('status', 'active');

    // Create new session
    const sessionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    const { error: sessionError } = await supabase
      .from('active_sessions')
      .insert({
        session_id: sessionId,
        user_id: user.id,
        expires_at: expiresAt.toISOString(),
        fingerprint_visitor_id: fingerprintData?.visitorId || null,
        ip_address: clientIP,
        ip_location: fingerprintData?.ipLocation || null,
        precise_location: fingerprintData?.geolocation || null,
        status: 'active'
      });

    if (sessionError) {
      console.error('Error creating session:', sessionError);
      return new Response(
        JSON.stringify({ error: 'Failed to create session' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Add visitor ID to trusted devices if not already there
    if (fingerprintData?.visitorId && !user.trusted_visitor_ids.includes(fingerprintData.visitorId)) {
      await supabase
        .from('users')
        .update({
          trusted_visitor_ids: [...user.trusted_visitor_ids, fingerprintData.visitorId]
        })
        .eq('id', user.id);
    }

    // Clean up pending verification
    await supabase
      .from('pending_verifications')
      .delete()
      .eq('verification_token', verificationToken);

    // Generate JWT token (simplified - in production use proper JWT library)
    const token = btoa(JSON.stringify({
      userId: user.user_id,
      sessionId: sessionId,
      exp: Math.floor(expiresAt.getTime() / 1000)
    }));

    return new Response(
      JSON.stringify({
        success: true,
        token: token,
        user: {
          id: user.user_id,
          username: user.username,
          phoneNumber: user.phone_number
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in verify-otp:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});