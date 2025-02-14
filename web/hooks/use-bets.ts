import { useEffect, useState } from 'react'
import {
  Bet,
  getBetsQuery,
  listenForBets,
  listenForUnfilledBets,
} from 'web/lib/firebase/bets'
import { BetFilter, LimitBet } from 'common/bet'
import { useEffectCheckEquality } from 'web/hooks/use-effect-check-equality'
import { useUsersById } from './use-user'
import { uniq } from 'lodash'
import { filterDefined } from 'common/util/array'
import { db } from 'web/lib/supabase/db'
import { getBets } from 'common/supabase/bets'
import { getValues } from 'web/lib/firebase/utils'
import { getUnfilledLimitOrders } from 'web/lib/supabase/bets'
import { usePersistentInMemoryState } from './use-persistent-in-memory-state'

export const useListenBets = (options?: BetFilter) => {
  const [bets, setBets] = useState<Bet[] | undefined>()
  useEffectCheckEquality(() => {
    return listenForBets(setBets, options)
  }, [options])

  return bets
}

export const useBets = (options?: BetFilter) => {
  const [bets, setBets] = useState<Bet[] | undefined>()
  useEffect(() => {
    getValues<Bet>(getBetsQuery(options)).then(setBets)
  }, [])

  return bets
}

export const useUnfilledBets = (contractId: string) => {
  const [unfilledBets, setUnfilledBets] = useState<LimitBet[] | undefined>()
  useEffect(() => {
    // Load first with supabase b/c it's faster.
    getUnfilledLimitOrders(contractId).then(setUnfilledBets)
    // Then listen for updates w/ firebase.
    return listenForUnfilledBets(contractId, setUnfilledBets)
  }, [contractId])
  return unfilledBets
}

export const useUnfilledBetsAndBalanceByUserId = (contractId: string) => {
  const unfilledBets = useUnfilledBets(contractId) ?? []
  const userIds = uniq(unfilledBets.map((b) => b.userId))
  const users = filterDefined(useUsersById(userIds))

  const balanceByUserId = Object.fromEntries(
    users.map((user) => [user.id, user.balance])
  )
  return { unfilledBets, balanceByUserId }
}

export const useRecentBets = (contractId: string, limit: number) => {
  const [bets, setBets] = usePersistentInMemoryState<Bet[] | undefined>(
    undefined,
    `recent-bets-${contractId}-${limit}`
  )

  useEffect(() => {
    getBets(db, {
      contractId,
      limit,
      order: 'desc',
    }).then((bets) => setBets(bets.reverse()))
  }, [contractId, limit, setBets])

  return bets
}
