import { run, selectFrom, selectJson } from 'common/supabase/utils'
import { filterDefined } from 'common/util/array'
import { db } from './db'
import { PrivateUser } from 'common/user'
import { isContractBlocked } from 'web/lib/firebase/users'
import { Contract } from 'common/contract'
import { INTEREST_DISTANCE_THRESHOLDS } from 'common/feed'

export async function getAllAds() {
  const query = selectJson(db, 'posts')
    .eq('data->>type', 'ad')
    .gt('data->>funds', 0)
    .order('data->>createTime', { ascending: false } as any)

  const { data } = await run(query)
  return data.map((r) => r.data)
}

export async function getWatchedAdIds(userId: string) {
  const query = selectFrom(db, 'txns', 'fromId').contains('data', {
    category: 'AD_REDEEM',
    toId: userId,
  })
  const { data } = await run(query)
  return data.map(({ fromId }) => fromId)
}

export async function getSkippedAdIds(userId: string) {
  const query = db
    .from('user_events')
    .select('ad_id')
    .eq('user_id', userId)
    .eq('name', 'Skip ad')

  const { data } = await run(query)
  return data.map((r) => (r as any).adId)
}

export async function getUsersWhoWatched(adId: string) {
  const query = selectFrom(db, 'txns', 'toId').contains('data', {
    category: 'AD_REDEEM',
    fromId: adId,
  })
  const { data } = await run(query)
  return data.map(({ toId }) => toId) ?? []
}

export async function getUsersWhoSkipped(adId: string) {
  const query = db
    .from('user_events')
    .select('user_id')
    .eq('name', 'Skip ad')
    .eq('ad_id', adId)

  const { data } = await run(query)
  return filterDefined(data.map((r) => r['user_id']))
}

// supabase type generator adds an extra array in the return type of getBoosts, so we define our own type instead
export type BoostsType =
  | {
      ad_id: string
      market_id: string
      ad_funds: number
      ad_cost_per_view: number
      market_data: Contract
    }[]
  | null
export const getBoosts = async (privateUser: PrivateUser, limit: number) => {
  const { data } = await db.rpc('get_top_market_ads', {
    uid: privateUser.id,
    distance_threshold: INTEREST_DISTANCE_THRESHOLDS.ad,
  })
  return (
    (data
      ?.flat()
      .filter(
        (d) => !isContractBlocked(privateUser, d.market_data as Contract)
      ) as BoostsType) ?? []
  ).slice(0, limit)
}

export async function getAdCanPayFunds(adId: string) {
  const query = db
    .from('market_ads')
    .select('funds,cost_per_view')
    .eq('id', adId)
    .limit(1)

  const { data } = await run(query)
  if (data && data.length > 0) {
    const canPay = data[0].funds >= data[0].cost_per_view
    return canPay
  } else {
    return false
  }
}
