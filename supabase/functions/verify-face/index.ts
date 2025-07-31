import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Simplified face verification (in production, use a proper face recognition service)
const verifyFace = (enrolledTemplate: string, currentImage: string): boolean => {
  // This is a placeholder implementation
  // In a real application, you would use a face recognition service like:
  // - AWS Rekognition
  // - Azure Face API
  // - Google Cloud Vision
  // - Or a specialized face recognition library
  
  // For demo purposes, we'll do a simple comparison
  // In reality, this would involve complex facial feature extraction and comparison
  return Math.random() > 0.2; // 80% success rate for demo
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageDataUrl, verificationToken } = await req.json();

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get pending verification
    const { data: pendingVerification, error: verificationError } = await supabase
      .from('pending_verifications')
      .select('*')
      .eq('verification_token', verificationToken)
      .eq('current_step', 'face')
      .maybeSingle();

    if (verificationError || !pendingVerification) {
      return new Response(
        JSON.stringify({ error: 'Invalid verification token' }),
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

    let faceVerificationSuccess = false;

    if (!user.enrolled_face_template) {
      // This is face enrollment (signup flow)
      const { error: enrollError } = await supabase
        .from('users')
        .update({ enrolled_face_template: imageDataUrl })
        .eq('id', user.id);

      if (enrollError) {
        console.error('Error enrolling face:', enrollError);
        return new Response(
          JSON.stringify({ error: 'Failed to enroll face' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      faceVerificationSuccess = true;
    } else {
      // This is face verification (login flow)
      faceVerificationSuccess = verifyFace(user.enrolled_face_template, imageDataUrl);

      if (!faceVerificationSuccess) {
        return new Response(
          JSON.stringify({ error: 'Face verification failed' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    if (faceVerificationSuccess) {
      // Proceed to token issuance
      // Revoke all existing sessions for this user
      await supabase
        .from('active_sessions')
        .update({ status: 'revoked' })
        .eq('user_id', user.id)
        .eq('status', 'active');

      // Create new session
      const sessionId = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      const fingerprintData = pendingVerification.fingerprint_data_at_otp_request;
      const clientIP = pendingVerification.ip_address_at_otp_request;

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

      // Generate JWT token
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
    }

  } catch (error) {
    console.error('Error in verify-face:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});