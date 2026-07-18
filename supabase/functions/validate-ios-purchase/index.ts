import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const APPLE_VERIFY_URL_PROD    = 'https://buy.itunes.apple.com/verifyReceipt'
const APPLE_VERIFY_URL_SANDBOX = 'https://sandbox.itunes.apple.com/verifyReceipt'

serve(async (req) => {
  try {
    const { receipt, productId } = await req.json()

    if (!receipt || !productId) {
      return new Response(JSON.stringify({ error: 'receipt and productId required' }), {
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

    const sharedSecret = Deno.env.get('APPLE_SHARED_SECRET')!
    const applePayload = { 'receipt-data': receipt, password: sharedSecret, 'exclude-old-transactions': true }

    // Try production first; fall back to sandbox for 21007
    let appleResp = await fetch(APPLE_VERIFY_URL_PROD, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(applePayload),
    })
    let appleData = await appleResp.json()

    if (appleData.status === 21007) {
      appleResp = await fetch(APPLE_VERIFY_URL_SANDBOX, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(applePayload),
      })
      appleData = await appleResp.json()
    }

    if (appleData.status !== 0) {
      return new Response(JSON.stringify({ error: 'Apple receipt invalid', status: appleData.status }), {
        status: 422,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Find the latest transaction for this product
    const latestReceipts: any[] = appleData.latest_receipt_info ?? []
    const matching = latestReceipts
      .filter((r: any) => r.product_id === productId)
      .sort((a: any, b: any) => Number(b.expires_date_ms) - Number(a.expires_date_ms))
    const latest = matching[0]

    if (!latest) {
      return new Response(JSON.stringify({ error: 'No matching receipt found' }), {
        status: 422,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const expiresAt = new Date(Number(latest.expires_date_ms)).toISOString()
    const now = new Date()
    const isActive = new Date(expiresAt) > now

    await supabase.from('subscriptions').upsert({
      user_id: user.id,
      platform: 'ios',
      product_id: productId,
      status: isActive ? 'active' : 'expired',
      started_at: new Date(Number(latest.purchase_date_ms)).toISOString(),
      expires_at: expiresAt,
      updated_at: now.toISOString(),
    }, { onConflict: 'user_id,platform,product_id' })

    await supabase.from('purchase_events').insert({
      user_id: user.id,
      platform: 'ios',
      transaction_id: latest.transaction_id,
      product_id: productId,
      event_type: 'validate',
      raw_payload: latest,
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
