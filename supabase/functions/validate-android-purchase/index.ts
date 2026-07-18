import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Google Play Developer API — subscriptions.get
const GOOGLE_API_BASE = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications'

serve(async (req) => {
  try {
    const { purchaseToken, productId } = await req.json()

    if (!purchaseToken || !productId) {
      return new Response(JSON.stringify({ error: 'purchaseToken and productId required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', ''),
    )
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Get Google access token using service account credentials
    const googleAccessToken = await getGoogleAccessToken()
    const packageName = Deno.env.get('ANDROID_PACKAGE_NAME')!

    const googleUrl = `${GOOGLE_API_BASE}/${packageName}/purchases/subscriptionsv2/tokens/${purchaseToken}`
    const googleResp = await fetch(googleUrl, {
      headers: { Authorization: `Bearer ${googleAccessToken}` },
    })

    if (!googleResp.ok) {
      const body = await googleResp.text()
      return new Response(JSON.stringify({ error: 'Google validation failed', detail: body }), {
        status: 422,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const googleData = await googleResp.json()

    // subscriptionState: ACTIVE, CANCELED, IN_GRACE_PERIOD, ON_HOLD, PAUSED, EXPIRED
    const subscriptionState: string = googleData.subscriptionState ?? ''
    const isActive = subscriptionState === 'SUBSCRIPTION_STATE_ACTIVE' ||
                     subscriptionState === 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD'

    const lineItem = googleData.lineItems?.[0]
    const expiresAt = lineItem?.expiryTime ?? null
    const startedAt = googleData.startTime ?? new Date().toISOString()

    const now = new Date()

    await supabase.from('subscriptions').upsert({
      user_id: user.id,
      platform: 'android',
      product_id: productId,
      status: isActive ? 'active' : 'expired',
      started_at: startedAt,
      expires_at: expiresAt,
      updated_at: now.toISOString(),
    }, { onConflict: 'user_id,platform,product_id' })

    await supabase.from('purchase_events').insert({
      user_id: user.id,
      platform: 'android',
      transaction_id: purchaseToken,
      product_id: productId,
      event_type: 'validate',
      raw_payload: googleData,
    })

    return new Response(JSON.stringify({ ok: true, isActive, expiresAt }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})

async function getGoogleAccessToken(): Promise<string> {
  const serviceAccountJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')!
  const serviceAccount = JSON.parse(serviceAccountJson)

  const now = Math.floor(Date.now() / 1000)
  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claim = btoa(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  }))

  const signingInput = `${header}.${claim}`
  const privateKey = await importPrivateKey(serviceAccount.private_key)
  const signature = await signRS256(signingInput, privateKey)
  const jwt = `${signingInput}.${signature}`

  const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })

  const tokenData = await tokenResp.json()
  return tokenData.access_token
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const pemContents = pem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '')
  const binaryDer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0))
  return crypto.subtle.importKey(
    'pkcs8',
    binaryDer.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )
}

async function signRS256(input: string, key: CryptoKey): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(input)
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, data)
  return btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}
