import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Apple App Store Server Notifications v2 (JWS-signed payload)
// Ref: https://developer.apple.com/documentation/appstoreservernotifications

type NotificationType =
  | 'SUBSCRIBED'
  | 'DID_RENEW'
  | 'DID_FAIL_TO_RENEW'
  | 'EXPIRED'
  | 'GRACE_PERIOD_EXPIRED'
  | 'REFUND'
  | 'REVOKE'
  | 'CONSUMPTION_REQUEST'
  | 'PRICE_INCREASE'
  | 'TEST'

serve(async (req) => {
  try {
    const body = await req.json()
    const signedPayload: string = body.signedPayload

    if (!signedPayload) {
      return new Response(JSON.stringify({ error: 'signedPayload required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Decode JWS payload (without full signature verification for now — verify in production
    // by checking against Apple's root CA certificates)
    const parts = signedPayload.split('.')
    if (parts.length !== 3) {
      return new Response(JSON.stringify({ error: 'Invalid JWS' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const payloadJson = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
    const notificationType: NotificationType = payloadJson.notificationType
    const subtype: string = payloadJson.subtype ?? ''

    // Decode the nested signedTransactionInfo
    const transactionParts = payloadJson.data?.signedTransactionInfo?.split('.')
    if (!transactionParts || transactionParts.length !== 3) {
      return new Response(JSON.stringify({ error: 'Missing signedTransactionInfo' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const txInfo = JSON.parse(atob(transactionParts[1].replace(/-/g, '+').replace(/_/g, '/')))
    const productId: string = txInfo.productId
    const transactionId: string = txInfo.transactionId
    const expiresDateMs: number = txInfo.expiresDate ?? 0
    const purchaseDateMs: number = txInfo.purchaseDate ?? 0
    const appAccountToken: string = txInfo.appAccountToken ?? ''  // maps to user_id if set

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Resolve user_id from appAccountToken (UUID we set at purchase time) or skip
    // For now, look up by matching the most recent purchase event with this transaction_id
    let userId: string | null = null

    if (appAccountToken && isUUID(appAccountToken)) {
      userId = appAccountToken
    } else {
      const { data } = await supabase
        .from('purchase_events')
        .select('user_id')
        .eq('transaction_id', transactionId)
        .limit(1)
        .maybeSingle()
      userId = data?.user_id ?? null
    }

    const isActive = ['SUBSCRIBED', 'DID_RENEW'].includes(notificationType)
    const isExpired = ['EXPIRED', 'GRACE_PERIOD_EXPIRED', 'REFUND', 'REVOKE'].includes(notificationType)
    const now = new Date().toISOString()

    if (userId) {
      let status: 'active' | 'expired' | 'cancelled' = 'active'
      if (isExpired) status = 'expired'
      if (notificationType === 'REFUND' || subtype === 'VOLUNTARY') status = 'cancelled'

      await supabase.from('subscriptions').upsert({
        user_id: userId,
        platform: 'ios',
        product_id: productId,
        status,
        started_at: purchaseDateMs ? new Date(purchaseDateMs).toISOString() : now,
        expires_at: expiresDateMs ? new Date(expiresDateMs).toISOString() : null,
        updated_at: now,
      }, { onConflict: 'user_id,platform,product_id' })
    }

    await supabase.from('purchase_events').insert({
      user_id: userId,
      platform: 'ios',
      transaction_id: transactionId,
      product_id: productId,
      event_type: notificationType.toLowerCase(),
      raw_payload: txInfo,
    })

    return new Response(JSON.stringify({ ok: true }), {
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

function isUUID(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
}
