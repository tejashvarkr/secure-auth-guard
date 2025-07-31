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

const assessContinuousRisk = (session: any, currentFingerprintData: any): number => {
  let riskScore = 0;

  // Check visitor ID mismatch
  if (session.fingerprint_visitor_id && 
      currentFingerprintData?.visitorId !== session.fingerprint_visitor_id) {
    riskScore += 60; // High risk for visitor ID mismatch
  }

  // Check for impossible travel
  if (session.precise_location?.latitude && session.precise_location?.longitude &&
      currentFingerprintData?.geolocation?.latitude && currentFingerprintData?.geolocation?.longitude) {
    
    const distance = calculateDistance(
      session.precise_location.latitude,
      session.precise_location.longitude,
      currentFingerprintData.geolocation.latitude,
      currentFingerprintData.geolocation.longitude
    );
    
    const timeDiff = (new Date().getTime() - new Date(session.last_accessed).getTime()) / (1000 * 60 * 60); // hours
    const maxSpeed = 1000; // km/h
    
    if (distance > maxSpeed * timeDiff) {
      riskScore += 40; // Impossible travel
    }
  }

  return Math.min(riskScore, 100);
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.substring(7);
    const { fingerprintData } = await req.json();

    // Decode JWT token (simplified - in production use proper JWT library)
    let decodedToken;
    try {
      decodedToken = JSON.parse(atob(token));
    } catch (error) {
      return new Response(
        JSON.stringify({ error: 'Invalid token format' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check token expiration
    if (decodedToken.exp < Math.floor(Date.now() / 1000)) {
      return new Response(
        JSON.stringify({ error: 'Token expired' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get active session
    const { data: session, error: sessionError } = await supabase
      .from('active_sessions')
      .select('*')
      .eq('session_id', decodedToken.sessionId)
      .eq('status', 'active')
      .maybeSingle();

    if (sessionError || !session) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired session' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check session timeout (30 minutes inactivity)
    const lastAccessed = new Date(session.last_accessed);
    const now = new Date();
    const inactivityMinutes = (now.getTime() - lastAccessed.getTime()) / (1000 * 60);

    if (inactivityMinutes > 30) {
      // Revoke session due to inactivity
      await supabase
        .from('active_sessions')
        .update({ status: 'revoked' })
        .eq('session_id', decodedToken.sessionId);

      return new Response(
        JSON.stringify({ error: 'Session expired due to inactivity' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Continuous fraud monitoring
    const riskScore = assessContinuousRisk(session, fingerprintData);

    if (riskScore >= 70) {
      // High risk detected - revoke session
      await supabase
        .from('active_sessions')
        .update({ status: 'revoked' })
        .eq('session_id', decodedToken.sessionId);

      // Log suspicious activity
      console.log(`Suspicious activity detected for session ${decodedToken.sessionId}. Risk score: ${riskScore}`);

      return new Response(
        JSON.stringify({ error: 'Session revoked due to suspicious activity' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update last accessed timestamp
    await supabase
      .from('active_sessions')
      .update({ last_accessed: now.toISOString() })
      .eq('session_id', decodedToken.sessionId);

    // Get user information
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('user_id, username, phone_number')
      .eq('user_id', decodedToken.userId)
      .single();

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'User not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        user: user,
        sessionInfo: {
          sessionId: session.session_id,
          lastAccessed: session.last_accessed,
          riskScore: riskScore
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in protected-resource:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});