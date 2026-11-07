export type BetMode = 'one_v_one' | 'pool' | 'odds' | 'multi'
export type BetStatus = 'open' | 'closed' | 'resolved' | 'void' | 'cancelled'
export type VoidReason = 'sem_adversarios' | 'empate' | 'ninguem_acertou'

export interface Profile {
  id: string
  email: string
  display_name: string
  avatar_url: string | null
}

export type NotifyKey = 'notify_new_bet' | 'notify_joined' | 'notify_closing' | 'notify_result'

export interface NotificationPrefs extends Record<NotifyKey, boolean> {
  notifications_prompted_at: string | null
}

export interface BetOption {
  id: string
  bet_id: string
  label: string
  position: number
}

export interface BetEntry {
  id: string
  bet_id: string
  user_id: string
  option_id: string
  amount_cents: number
  created_at: string
}

export interface Bet {
  id: string
  creator_id: string
  title: string
  description: string
  mode: BetMode
  status: BetStatus
  closes_at: string
  resolve_by: string
  odds_creator: number | null
  odds_taker: number | null
  winning_option_id: string | null
  void_reason: VoidReason | null
  closed_at: string | null
  resolved_at: string | null
  cancelled_at: string | null
  created_at: string
  is_secret: boolean
  bet_options: BetOption[]
  bet_entries: BetEntry[]
  /** Só preenchido para o criador (RLS). */
  bet_excluded?: { email: string }[]
}

export interface Payment {
  id: string
  from_user: string
  to_user: string
  amount_cents: number
  note: string
  created_by: string
  created_at: string
  bet_id: string | null
}

export interface Member {
  email: string
  display_name: string | null
  user_id: string | null
}

export interface AllowedEmail {
  email: string
  is_admin: boolean
  added_at: string
}
