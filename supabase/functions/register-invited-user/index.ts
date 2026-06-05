import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type RegisterInvitePayload = {
  token: string
  code: string
  display_name: string
  phone?: string
  password: string
  username: string
  language?: string
}

type UserPlan = 'free' | 'plus'

type InviteLocale = 'en' | 'sv' | 'no' | 'fr' | 'fi' | 'da' | 'es' | 'it' | 'de' | 'ja' | 'ko' | 'zh-Hant' | 'zh-Hans'

function normalizeLocale(input?: string | null): InviteLocale {
  const value = input?.trim()
  if (!value) return 'en'

  const lowered = value.toLowerCase()

  if (lowered === 'zh-hant' || lowered.startsWith('zh-tw') || lowered.startsWith('zh-hk')) return 'zh-Hant'
  if (lowered === 'zh-hans' || lowered.startsWith('zh-cn') || lowered.startsWith('zh-sg')) return 'zh-Hans'
  if (lowered.startsWith('sv')) return 'sv'
  if (lowered.startsWith('no') || lowered.startsWith('nb') || lowered.startsWith('nn')) return 'no'
  if (lowered.startsWith('fr')) return 'fr'
  if (lowered.startsWith('fi')) return 'fi'
  if (lowered.startsWith('da')) return 'da'
  if (lowered.startsWith('es')) return 'es'
  if (lowered.startsWith('it')) return 'it'
  if (lowered.startsWith('de')) return 'de'
  if (lowered.startsWith('ja')) return 'ja'
  if (lowered.startsWith('ko')) return 'ko'

  return 'en'
}

function getRequestLocale(req: Request, payloadLanguage?: string | null): InviteLocale {
  if (payloadLanguage) {
    return normalizeLocale(payloadLanguage)
  }

  const acceptLanguage = req.headers.get('accept-language')
  if (acceptLanguage) {
    const primary = acceptLanguage.split(',')[0]
    return normalizeLocale(primary)
  }

  return 'en'
}

function localizeInviteMessage(locale: InviteLocale, key: string): string {
  const messages: Record<string, Partial<Record<InviteLocale, string>>> = {
    missing_fields: {
      en: 'Missing or invalid registration fields.',
      sv: 'Registreringsuppgifterna saknas eller är ogiltiga.',
      no: 'Registreringsfeltene mangler eller er ugyldige.',
      fr: "Champs d'inscription manquants ou invalides.",
      fi: 'Rekisteröintitiedot puuttuvat tai ovat virheellisiä.',
      da: 'Registreringsfelter mangler eller er ugyldige.',
      es: 'Faltan campos de registro o no son válidos.',
      it: 'Campi di registrazione mancanti o non validi.',
      de: 'Registrierungsfelder fehlen oder sind ungültig.',
      ja: '登録項目が不足しているか無効です。',
      ko: '등록 항목이 없거나 올바르지 않습니다.',
      'zh-Hant': '註冊資料缺漏或格式不正確。',
      'zh-Hans': '注册资料缺漏或格式不正确。',
    },
    invalid_phone: {
      en: 'Invalid phone number.',
      sv: 'Ogiltigt telefonnummer.',
      no: 'Ugyldig telefonnummer.',
      fr: 'Numéro de téléphone invalide.',
      fi: 'Virheellinen puhelinnumero.',
      da: 'Ugyldigt telefonnummer.',
      es: 'Número de teléfono no válido.',
      it: 'Numero di telefono non valido.',
      de: 'Ungültige Telefonnummer.',
      ja: '電話番号が無効です。',
      ko: '전화번호가 올바르지 않습니다.',
      'zh-Hant': '電話號碼格式不正確。',
      'zh-Hans': '电话号码格式不正确。',
    },
    invite_not_found: {
      en: 'Invite not found.',
      sv: 'Inbjudan hittades inte.',
      no: 'Invitasjonen ble ikke funnet.',
      fr: "Invitation introuvable.",
      fi: 'Kutsua ei löytynyt.',
      da: 'Invitationen blev ikke fundet.',
      es: 'No se encontró la invitación.',
      it: "Invito non trovato.",
      de: 'Einladung nicht gefunden.',
      ja: '招待が見つかりません。',
      ko: '초대를 찾을 수 없습니다.',
      'zh-Hant': '找不到邀請。',
      'zh-Hans': '找不到邀请。',
    },
    invite_used: {
      en: 'This invite has already been used.',
      sv: 'Den här inbjudan har redan använts.',
      no: 'Denne invitasjonen er allerede brukt.',
      fr: 'Cette invitation a déjà été utilisée.',
      fi: 'Tämä kutsu on jo käytetty.',
      da: 'Denne invitation er allerede brugt.',
      es: 'Esta invitación ya se ha utilizado.',
      it: 'Questo invito è già stato usato.',
      de: 'Diese Einladung wurde bereits verwendet.',
      ja: 'この招待はすでに使用されています。',
      ko: '이 초대는 이미 사용되었습니다.',
      'zh-Hant': '這個邀請已被使用。',
      'zh-Hans': '这个邀请已被使用。',
    },
    invite_invalid: {
      en: 'This invite is no longer valid.',
      sv: 'Den här inbjudan är inte längre giltig.',
      no: 'Denne invitasjonen er ikke lenger gyldig.',
      fr: "Cette invitation n'est plus valide.",
      fi: 'Tämä kutsu ei ole enää voimassa.',
      da: 'Denne invitation er ikke længere gyldig.',
      es: 'Esta invitación ya no es válida.',
      it: 'Questo invito non è più valido.',
      de: 'Diese Einladung ist nicht mehr gültig.',
      ja: 'この招待は無効になっています。',
      ko: '이 초대는 더 이상 유효하지 않습니다.',
      'zh-Hant': '這個邀請已無效。',
      'zh-Hans': '这个邀请已无效。',
    },
    invite_expired: {
      en: 'This invite has expired.',
      sv: 'Den här inbjudan har gått ut.',
      no: 'Denne invitasjonen har utløpt.',
      fr: 'Cette invitation a expiré.',
      fi: 'Tämä kutsu on vanhentunut.',
      da: 'Denne invitation er udløbet.',
      es: 'Esta invitación ha caducado.',
      it: 'Questo invito è scaduto.',
      de: 'Diese Einladung ist abgelaufen.',
      ja: 'この招待の有効期限が切れています。',
      ko: '이 초대는 만료되었습니다.',
      'zh-Hant': '這個邀請已過期。',
      'zh-Hans': '这个邀请已过期。',
    },
    too_many_attempts: {
      en: 'Too many incorrect attempts. Ask for a new invite.',
      sv: 'För många felaktiga försök. Be om en ny inbjudan.',
      no: 'For mange feilaktige forsøk. Be om en ny invitasjon.',
      fr: 'Trop de tentatives incorrectes. Demandez une nouvelle invitation.',
      fi: 'Liian monta virheellistä yritystä. Pyydä uusi kutsu.',
      da: 'For mange forkerte forsøg. Bed om en ny invitation.',
      es: 'Demasiados intentos incorrectos. Pide una nueva invitación.',
      it: 'Troppi tentativi errati. Richiedi un nuovo invito.',
      de: 'Zu viele falsche Versuche. Bitte fordere eine neue Einladung an.',
      ja: '間違った入力が多すぎます。新しい招待を依頼してください。',
      ko: '잘못된 시도가 너무 많습니다. 새 초대를 요청하세요.',
      'zh-Hant': '錯誤嘗試次數過多，請重新索取邀請。',
      'zh-Hans': '错误尝试次数过多，请重新索取邀请。',
    },
    incorrect_code: {
      en: 'The code is incorrect.',
      sv: 'Koden är fel.',
      no: 'Koden er feil.',
      fr: 'Le code est incorrect.',
      fi: 'Koodi on virheellinen.',
      da: 'Koden er forkert.',
      es: 'El código es incorrecto.',
      it: 'Il codice non è corretto.',
      de: 'Der Code ist falsch.',
      ja: 'コードが正しくありません。',
      ko: '코드가 올바르지 않습니다.',
      'zh-Hant': '代碼不正確。',
      'zh-Hans': '代码不正确。',
    },
    phone_in_use: {
      en: 'This phone number is already in use.',
      sv: 'Det här telefonnumret används redan.',
      no: 'Dette telefonnummeret er allerede i bruk.',
      fr: 'Ce numéro de téléphone est déjà utilisé.',
      fi: 'Tämä puhelinnumero on jo käytössä.',
      da: 'Dette telefonnummer er allerede i brug.',
      es: 'Este número de teléfono ya está en uso.',
      it: 'Questo numero di telefono è già in uso.',
      de: 'Diese Telefonnummer wird bereits verwendet.',
      ja: 'この電話番号はすでに使用されています。',
      ko: '이 전화번호는 이미 사용 중입니다.',
      'zh-Hant': '這個電話號碼已被使用。',
      'zh-Hans': '这个电话号码已被使用。',
    },
    username_taken: {
      en: 'That Tryggd ID is already taken.',
      sv: 'Det Tryggd ID:t används redan.',
      no: 'Denne Tryggd ID-en er allerede tatt.',
      fr: 'Ce Tryggd ID est déjà pris.',
      fi: 'Tämä Tryggd ID on jo varattu.',
      da: 'Det Tryggd ID er allerede optaget.',
      es: 'Ese Tryggd ID ya está en uso.',
      it: 'Questo Tryggd ID è già in uso.',
      de: 'Diese Tryggd ID ist bereits vergeben.',
      ja: 'その Tryggd ID はすでに使われています。',
      ko: '이미 사용 중인 Tryggd ID입니다.',
      'zh-Hant': '這個 Tryggd ID 已被使用。',
      'zh-Hans': '这个 Tryggd ID 已被使用。',
    },
    inviter_limit: {
      en: 'This invite can no longer be claimed because the inviter has reached the free contact limit.',
      sv: 'Den här inbjudan kan inte längre användas eftersom inbjudaren har nått gränsen för fria kontakter.',
      no: 'Denne invitasjonen kan ikke lenger brukes fordi avsenderen har nådd grensen for gratis kontakter.',
      fr: "Cette invitation ne peut plus être utilisée car l'invitant a atteint la limite gratuite de contacts.",
      fi: 'Tätä kutsua ei voi enää käyttää, koska kutsujan ilmaiskontaktien raja on täynnä.',
      da: 'Denne invitation kan ikke længere bruges, fordi inviteren har nået grænsen for gratis kontakter.',
      es: 'Esta invitación ya no puede usarse porque quien invita alcanzó el límite gratuito de contactos.',
      it: "Questo invito non può più essere utilizzato perché l'invitante ha raggiunto il limite gratuito dei contatti.",
      de: 'Diese Einladung kann nicht mehr eingelöst werden, weil der Einladende das kostenlose Kontaktlimit erreicht hat.',
      ja: '招待した人が無料連絡先の上限に達したため、この招待はもう利用できません。',
      ko: '초대한 사람이 무료 연락처 한도에 도달해 이 초대를 더 이상 사용할 수 없습니다.',
      'zh-Hant': '邀請者已達免費聯絡人上限，因此這個邀請無法再被使用。',
      'zh-Hans': '邀请者已达免费联系人上限，因此这个邀请无法再被使用。',
    },
    create_invited_account_failed: {
      en: 'Failed to create the invited account.',
      sv: 'Det gick inte att skapa det inbjudna kontot.',
      no: 'Kunne ikke opprette den inviterte kontoen.',
      fr: "Impossible de créer le compte invité.",
      fi: 'Kutsutun tilin luominen epäonnistui.',
      da: 'Det lykkedes ikke at oprette den inviterede konto.',
      es: 'No se pudo crear la cuenta invitada.',
      it: "Impossibile creare l'account invitato.",
      de: 'Das eingeladene Konto konnte nicht erstellt werden.',
      ja: '招待されたアカウントを作成できませんでした。',
      ko: '초대된 계정을 만들지 못했습니다.',
      'zh-Hant': '無法建立受邀帳號。',
      'zh-Hans': '无法建立受邀账号。',
    },
  }

  return messages[key]?.[locale] ?? messages[key]?.en ?? key
}

function normalizePhoneNumber(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  const collapsed = trimmed.replace(/[\s\-().]/g, '')
  const normalized =
    collapsed.startsWith('00') ? `+${collapsed.slice(2)}` :
    collapsed.startsWith('+') ? collapsed :
    `+${collapsed}`

  const digitsOnly = normalized.replace(/[^\d]/g, '')
  if (digitsOnly.length < 8 || digitsOnly.length > 15) {
    return null
  }

  return `+${digitsOnly}`
}

function normalizeUsername(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, '')
}

function isValidUsername(input: string): boolean {
  return /^[a-z0-9._]{3,24}$/.test(normalizeUsername(input))
}

function buildSyntheticEmailFromUsername(username: string): string {
  return `tryggdid-${normalizeUsername(username)}@login.tryggd.local`
}

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

async function getUserPlan(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<UserPlan> {
  const { data, error } = await supabase
    .from('user_entitlements')
    .select('plan')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    console.error('Failed to load inviter plan, defaulting to free:', error.message)
    return 'free'
  }

  return data?.plan === 'plus' ? 'plus' : 'free'
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const payload = await req.json() as RegisterInvitePayload
    const locale = getRequestLocale(req, payload.language)
    const token = payload.token?.trim()
    const code = payload.code?.trim()
    const displayName = payload.display_name?.trim()
    const username = normalizeUsername(payload.username || '')
    const password = payload.password || ''
    const normalizedPhone = payload.phone?.trim() ? normalizePhoneNumber(payload.phone) : null

    if (!token || !code || !displayName || !isValidUsername(username) || password.length < 8) {
      return new Response(JSON.stringify({ error: localizeInviteMessage(locale, 'missing_fields') }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (payload.phone?.trim() && !normalizedPhone) {
      return new Response(JSON.stringify({ error: localizeInviteMessage(locale, 'invalid_phone') }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    )

    const { data: invite, error: inviteError } = await supabase
      .from('contact_invites')
      .select('id, inviter_user_id, invite_code_hash, invitee_name, status, failed_attempts, expires_at, claimed_by_user_id')
      .eq('invite_token', token)
      .maybeSingle()

    if (inviteError) throw inviteError
    if (!invite) {
      return new Response(JSON.stringify({ error: localizeInviteMessage(locale, 'invite_not_found') }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (invite.status === 'claimed') {
      return new Response(JSON.stringify({ error: localizeInviteMessage(locale, 'invite_used') }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (invite.status === 'revoked' || invite.failed_attempts >= 5) {
      return new Response(JSON.stringify({ error: localizeInviteMessage(locale, 'invite_invalid') }), {
        status: 410,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const expiresAt = new Date(invite.expires_at)
    if (expiresAt.getTime() <= Date.now()) {
      await supabase
        .from('contact_invites')
        .update({ status: 'expired', updated_at: new Date().toISOString() })
        .eq('id', invite.id)

      return new Response(JSON.stringify({ error: localizeInviteMessage(locale, 'invite_expired') }), {
        status: 410,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const submittedCodeHash = await sha256Hex(code)
    if (submittedCodeHash !== invite.invite_code_hash) {
      const nextAttempts = invite.failed_attempts + 1
      await supabase
        .from('contact_invites')
        .update({
          failed_attempts: nextAttempts,
          status: nextAttempts >= 5 ? 'revoked' : invite.status,
          updated_at: new Date().toISOString(),
        })
        .eq('id', invite.id)

      return new Response(JSON.stringify({
        error: nextAttempts >= 5
          ? localizeInviteMessage(locale, 'too_many_attempts')
          : localizeInviteMessage(locale, 'incorrect_code'),
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const authEmail = buildSyntheticEmailFromUsername(username)

    if (normalizedPhone) {
      const { data: existingPhoneProfile, error: phoneLookupError } = await supabase
        .from('profiles')
        .select('id')
        .eq('phone', normalizedPhone)
        .maybeSingle()

      if (phoneLookupError) throw phoneLookupError
      if (existingPhoneProfile) {
        return new Response(JSON.stringify({ error: localizeInviteMessage(locale, 'phone_in_use') }), {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        })
      }
    }

    const { data: existingUsername, error: usernameLookupError } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', username)
      .maybeSingle()

    if (usernameLookupError) throw usernameLookupError
    if (existingUsername) {
      return new Response(JSON.stringify({ error: localizeInviteMessage(locale, 'username_taken') }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const { data: inviterProfile, error: inviterProfileError } = await supabase
      .from('profiles')
      .select('display_name, username, phone')
      .eq('id', invite.inviter_user_id)
      .maybeSingle()

    if (inviterProfileError) throw inviterProfileError

    const inviterPlan = await getUserPlan(supabase, invite.inviter_user_id)
    if (inviterPlan !== 'plus') {
      const { count: inviterContactCount, error: inviterContactCountError } = await supabase
        .from('contacts')
        .select('*', { count: 'exact', head: true })
        .eq('owner_user_id', invite.inviter_user_id)

      if (inviterContactCountError) throw inviterContactCountError
      if ((inviterContactCount || 0) >= 3) {
        return new Response(JSON.stringify({
          error: localizeInviteMessage(locale, 'inviter_limit'),
        }), {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        })
      }
    }

    const { data: createdUserData, error: createUserError } = await supabase.auth.admin.createUser({
      email: authEmail,
      password,
      email_confirm: true,
      user_metadata: {
        display_name: displayName,
      },
    })

    if (createUserError || !createdUserData.user) {
      return new Response(JSON.stringify({
        error: createUserError?.message || localizeInviteMessage(locale, 'create_invited_account_failed'),
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const createdUser = createdUserData.user

    try {
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert({
          id: createdUser.id,
          display_name: displayName,
          username,
          phone: normalizedPhone,
          avatar_url: '',
        })

      if (profileError) throw profileError

      const inviterDisplayName =
        inviterProfile?.display_name ||
        inviterProfile?.username ||
        'Tryggd contact'

      const inviteeIdentifier = username
      const inviterIdentifier = inviterProfile?.username || inviterProfile?.phone || ''

      const { error: contactsError } = await supabase
        .from('contacts')
        .upsert([
          {
            owner_user_id: invite.inviter_user_id,
            contact_user_id: createdUser.id,
            contact_email: inviteeIdentifier,
            contact_display_name: displayName,
          },
          {
            owner_user_id: createdUser.id,
            contact_user_id: invite.inviter_user_id,
            contact_email: inviterIdentifier,
            contact_display_name: inviterDisplayName,
          },
        ])

      if (contactsError) throw contactsError

      const { error: claimError } = await supabase
        .from('contact_invites')
        .update({
          status: 'claimed',
          claimed_by_user_id: createdUser.id,
          claimed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', invite.id)
        .eq('status', 'pending')

      if (claimError) throw claimError

      return new Response(JSON.stringify({
        success: true,
        phone: normalizedPhone,
        auth_email: authEmail,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    } catch (error) {
      await supabase.auth.admin.deleteUser(createdUser.id)
      throw error
    }
  } catch (error) {
    console.error('register-invited-user fatal error:', error)
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
